#!/usr/bin/env node
/**
 * 猎聘（liepin.com）探针 —— 干净环境实测（v2，带反检测 + 控制台捕获）。
 *
 * 与插件真实运行环境一致（见 src/host/platform/browser.ts）：
 *   * `playwright-core` + 系统 Chrome；
 *   * **独立 profile**（.probe-liepin-profile/），**不加载任何扩展**；
 *   * 有头模式（用户要在窗口里手动登录）；
 *   * `--disable-blink-features=AutomationControlled`。
 *
 * v2 相比 v1 的三处关键改动：
 *   1. **反检测 init script**：playwright 默认把 `navigator.webdriver` 置为
 *      `true`，`--disable-blink-features=AutomationControlled` 并不能清除它。
 *      这里用 `addInitScript` 覆盖掉，并顺手抹平常见指纹（plugins/languages）；
 *   2. **控制台 / 网络日志捕获**：全程记录 console 与失败的网络请求，
 *      用于定位「谁把页面替换成 about:blank」（v1 只有 URL 结果，看不到触发点）；
 *   3. **登录判定改为 DOM 信号**：v1 把「passport → 主站」的跳转当成已登录，
 *      但那个跳转很可能是风控重定向而不是登录成功。现在轮询主站上的
 *      头像 / 用户名元素，出现才算登录完成。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-liepin.ts
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import type { BrowserContext, Page } from 'playwright-core'

const ROOT = process.cwd()
const PROFILE_DIR = join(ROOT, '.probe-liepin-profile')

const LOGIN_URL = 'https://passport.liepin.com/account/login'
const HOME_URL = 'https://www.liepin.com/'
/** 等用户手动登录的最长时间（10 分钟）。 */
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
/** 登录态轮询间隔。 */
const POLL_INTERVAL_MS = 3_000
/** 登录成功后保留浏览器多久（目视确认 + 人工查看）。 */
const KEEP_OPEN_MS = 20_000

/** 登录成功后要探测的 URL 候选。列表页结构未知，先广撒网。 */
const PROBE_URLS: string[] = [
  'https://www.liepin.com/zhaopin/?key=Java',
  'https://www.liepin.com/zhaopin/?key=Java&dq=050090',
  HOME_URL,
]

/** 反检测脚本：在**每个页面**的 document 创建前执行。 */
const STEALTH_SCRIPT = `
  // playwright 默认注入的 webdriver 标志是最大的自动化指纹
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // 抹平一些常见差异
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
  try {
    if (window.chrome) {
      window.chrome.runtime = { id: undefined };
    }
  } catch (e) { /* 忽略 */ }
`

function log(message: string): void {
  console.log(`[probe-liepin] ${new Date().toISOString()} ${message}`)
}

async function cleanStaleLocks(dir: string): Promise<void> {
  const { rmSync } = await import('node:fs')
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
    try {
      rmSync(join(dir, name), { force: true })
    } catch {
      /* 删不掉就交给 Chromium 自己报错 */
    }
  }
}

/** 订阅页面的 console 与网络错误日志（用于定位 about:blank 触发点）。 */
function attachDiagnostics(page: Page, label: string): void {
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      log(`  [${label}] console.${message.type()}: ${message.text().slice(0, 200)}`)
    }
  })
  page.on('pageerror', (error) => {
    log(`  [${label}] pageerror: ${String(error).slice(0, 300)}`)
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      log(`  [${label}] navigated → ${frame.url()}`)
    }
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()
    const url = request.url()
    if (url.startsWith('chrome-extension://')) return // 扩展噪音，忽略
    log(`  [${label}] requestfailed: ${failure?.errorText ?? '?'} ${url.slice(0, 160)}`)
  })
}

/** 已登录信号：任何 liepin 域名上的头像 / 用户名。未登录时那里是「登录」按钮。 */
async function hasLoggedInSignal(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const selectors = [
      '.header-user .user-avatar',
      '.header-user img[class*="avatar"]',
      '.header-account .avatar',
      '.header-user-name',
      '.header__user img',
      '[class*="user-avatar"] img',
      // c.liepin.com（简历中心）的头像 / 用户名
      '.user-center-name',
      '[class*="avatar"] img',
    ]
    for (const selector of selectors) {
      try {
        if (document.querySelector(selector) !== null) return true
      } catch {
        /* 忽略坏选择器 */
      }
    }
    return false
  })
}

/** 登录成功了吗？—— URL 离开登录域（passport / /login / about:blank）就算。 */
function isOnLoggedInLand(page: Page): boolean {
  const url = page.url()
  if (url === 'about:blank' || url.startsWith('about:')) return false
  if (url.startsWith('https://passport.liepin.com/')) return false
  if (url.includes('/login')) return false
  return url.startsWith('https://www.liepin.com/') || url.startsWith('https://c.liepin.com/')
}

/** 等用户登录：轮询 URL 是否离开登录域 + 头像信号。返回时浏览器停在登录后的页面。 */
async function waitForLogin(page: Page): Promise<void> {
  log(`已打开登录页：${LOGIN_URL}`)
  log('请在弹出的浏览器窗口里手动登录猎聘（手机号 + 验证码）。')
  log('登录成功后（进入主站或简历中心），脚本会自动继续探测。')
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  let lastUrl = page.url()
  while (Date.now() < deadline) {
    await page.waitForTimeout(POLL_INTERVAL_MS)
    const url = page.url()
    if (url !== lastUrl) {
      log(`URL 变化：${lastUrl} → ${url}`)
      lastUrl = url
    }
    if (isOnLoggedInLand(page) && (await hasLoggedInSignal(page))) {
      log('检测到已登录（已离开登录域且出现头像信号）。')
      return
    }
  }
  log(`等待登录超时（${LOGIN_TIMEOUT_MS / 1000}s），退出。`)
  process.exit(1)
}

/** 探测一个 URL：抓页面是否被风控替换、卡片容器与条数、前几条文本。 */
async function probeUrl(page: Page, url: string): Promise<void> {
  log(`---- 探测 ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`  goto 失败：${error instanceof Error ? error.message : String(error)}`)
    return
  }
  await page.waitForTimeout(3_000) // 等 JS 渲染 / 风控跳转发生

  const finalUrl = page.url()
  log(`  final URL: ${finalUrl}`)
  if (finalUrl === 'about:blank' || finalUrl.startsWith('about:')) {
    log('  ⚠️ 被风控替换成 about:blank')
    return
  }

  const data = await page.evaluate(() => {
    const title = document.title ?? ''
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    // 猎聘列表页候选卡片容器，广撒网
    const cardSelectors = [
      '.job-card',
      '.job-card-pc-container',
      '.job-detail-card',
      '.position-card',
      '.job-card-wrapper',
      '.job-list-item',
      '.job-card-box',
      '.job-detail-box',
      '.job-card-item',
      '.resume-card',
    ]
    const hits: Record<string, number> = {}
    for (const selector of cardSelectors) {
      let count = 0
      try {
        count = document.querySelectorAll(selector).length
      } catch {
        count = 0
      }
      if (count > 0) hits[selector] = count
    }
    // 找包含「薪资」字样的链接（标题往往是 <a> 里带薪资）
    const anchors: string[] = []
    for (const a of Array.from(document.querySelectorAll('a')).slice(0, 2000)) {
      const t = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t.length > 0 && t.length < 120 && /k|万|元|\d-\d|\d-{1,2}\d/.test(t)) {
        anchors.push(`${t} | ${a.getAttribute('href') ?? ''}`)
        if (anchors.length >= 8) break
      }
    }
    // 登录态信号：右上角用户头像 / 未登录时的「登录」入口
    const loginSignals = {
      avatar: document.querySelector('.header-user .user-avatar, .header-user img[class*="avatar"], .header-account .avatar') !== null,
      hasLoginText: /登录/.test(text.slice(0, 500)),
    }
    return JSON.stringify({
      title,
      bodyLength: text.length,
      bodyHead: text.slice(0, 300),
      cardHits: hits,
      anchorSamples: anchors,
      loginSignals,
    })
  })
  log(`  ${data}`)
}

async function main(): Promise<void> {
  mkdirSync(PROFILE_DIR, { recursive: true })
  await cleanStaleLocks(PROFILE_DIR)

  const executablePath = [
    process.env['ProgramFiles'] ? join(process.env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    process.env['ProgramFiles'] ? join(process.env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
  ].find((path) => path !== '' && existsSync(path)) ?? ''

  const launchOptions = {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
  }

  let context: BrowserContext
  if (executablePath !== '') {
    log(`使用浏览器：${executablePath}`)
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      ...launchOptions,
      executablePath,
    })
  } else {
    context = await chromium.launchPersistentContext(PROFILE_DIR, launchOptions)
  }

  // 反检测脚本要在任何页面创建前装好（launchPersistentContext 已带初始页）
  await context.addInitScript({ content: STEALTH_SCRIPT })

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    attachDiagnostics(page, 'main')

    // 阶段 0：**先测免登录列表页** —— 适配器是否可行，取决于这条（智联就是靠免登录 /sou/ 活下来的）。
    log('==== 阶段 0：免登录探测列表页（不打开登录页） ====')
    for (const url of PROBE_URLS) {
      await probeUrl(page, url)
    }

    // 阶段 1：打开登录页，等用户手动登录。
    log('==== 阶段 1：打开登录页，等你登录 ====')
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForLogin(page)

    // 阶段 2：登录态下重测列表页。
    log('==== 阶段 2：登录态下重测列表页 ====')
    for (const url of PROBE_URLS) {
      await probeUrl(page, url)
    }

    log(`探测完成。浏览器保留 ${KEEP_OPEN_MS / 1000}s 供目视确认……`)
    await page.waitForTimeout(KEEP_OPEN_MS)
  } finally {
    await context.close().catch(() => undefined)
  }
  log('done')
}

void main()
