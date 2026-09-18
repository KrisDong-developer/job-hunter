#!/usr/bin/env node
/**
 * 猎聘探针 —— v5：CDP 复用日常 Chrome + 端口守卫。
 *
 * 移植 BossHunter 的核心机制：
 *   1. `connectOverCDP` 连接用户日常 Chrome（真实指纹、真实登录态、无 webdriver）；
 *   2. **端口守卫**（src/host/platform/cdp-guard.ts）：用 CDP `Fetch` 域拦截页面
 *      对调试端口（localhost:9222）的探测请求，伪造 ConnectionRefused，
 *      让猎聘风控以为"没有调试端口" —— 这正是前几轮 CDP 直接裸连失败的原因。
 *
 * 前置条件：日常 Chrome 已用 `--remote-debugging-port=9222` 启动。
 *
 * 流程：
 *   1. 列出标签页、确认指纹（webdriver 应为 false）；
 *   2. 新开标签页 + 装端口守卫，打开猎聘**登录页**，等用户手动登录；
 *   3. 登录成功后，带端口守卫探测列表页（验证是否仍被 about:blank）。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-liepin-cdp-guard.ts
 */
import { chromium } from 'playwright-core'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { installPortGuard } from '../../src/host/platform/cdp-guard.js'

const CDP_URL = process.env['CDP_URL'] ?? 'http://127.0.0.1:9222'
const DEBUG_PORT = Number(process.env['CDP_PORT'] ?? '9222')

const LOGIN_URL = 'https://passport.liepin.com/account/login'
const PROBE_URLS: string[] = [
  'https://www.liepin.com/zhaopin/?key=Java',
  'https://www.liepin.com/',
]

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 3_000
const KEEP_OPEN_MS = 20_000

function log(message: string): void {
  console.log(`[probe-liepin-guard] ${new Date().toISOString()} ${message}`)
}

function attachDiagnostics(page: Page, label: string): void {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      log(`  [${label}] console.error: ${message.text().slice(0, 200)}`)
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
}

/** 已登录信号：任何 liepin 域名上的头像 / 用户名。 */
async function hasLoggedInSignal(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const selectors = [
      '.header-user .user-avatar',
      '.header-user img[class*="avatar"]',
      '.header-account .avatar',
      '.header-user-name',
      '.header__user img',
      '[class*="user-avatar"] img',
      '.user-center-name',
      '[class*="avatar"] img',
    ]
    for (const selector of selectors) {
      try {
        if (document.querySelector(selector) !== null) return true
      } catch {
        /* ignore */
      }
    }
    return false
  })
}

/** 登录成功了吗？—— URL 离开登录域。 */
function isOnLoggedInLand(page: Page): boolean {
  const url = page.url()
  if (url === 'about:blank' || url.startsWith('about:')) return false
  if (url.startsWith('https://passport.liepin.com/')) return false
  if (url.includes('/login')) return false
  return url.startsWith('https://www.liepin.com/') || url.startsWith('https://c.liepin.com/')
}

async function waitForLogin(page: Page): Promise<void> {
  log(`已打开登录页：${LOGIN_URL}`)
  log('请在弹出的 Chrome 窗口里手动登录猎聘（手机号 + 验证码）。')
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
      log('检测到已登录。')
      return
    }
  }
  log('等待登录超时，退出。')
  process.exit(1)
}

async function probeUrl(page: Page, url: string): Promise<void> {
  log(`---- 探测 ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`  goto 失败：${error instanceof Error ? error.message : String(error)}`)
    return
  }
  await page.waitForTimeout(4_000) // 等 JS 渲染 / 风控跳转发生

  const finalUrl = page.url()
  log(`  final URL: ${finalUrl}`)
  if (finalUrl === 'about:blank' || finalUrl.startsWith('about:')) {
    log('  ⚠️ 被风控替换成 about:blank')
    return
  }

  const data = await page.evaluate(() => {
    const title = document.title ?? ''
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
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
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch {
        /* ignore */
      }
    }
    const anchors: string[] = []
    for (const a of Array.from(document.querySelectorAll('a')).slice(0, 2000)) {
      const t = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t.length > 0 && t.length < 120 && /k|万|元|\d-\d|\d-{1,2}\d/.test(t)) {
        anchors.push(`${t} | ${a.getAttribute('href') ?? ''}`)
        if (anchors.length >= 8) break
      }
    }
    return JSON.stringify({ title, bodyLength: text.length, bodyHead: text.slice(0, 300), cardHits: hits, anchorSamples: anchors })
  })
  log(`  ${data}`)
}

async function main(): Promise<void> {
  let browser: Browser
  try {
    browser = await chromium.connectOverCDP(CDP_URL)
  } catch (error) {
    log(
      `连接日常 Chrome 失败（${CDP_URL}）：${error instanceof Error ? error.message : String(error)}。\n` +
        '请先确认 Chrome 已用 --remote-debugging-port=9222 启动。',
    )
    process.exit(1)
  }

  const context: BrowserContext | undefined = browser.contexts()[0]
  if (context === undefined) {
    log('连接成功但没有可用的 BrowserContext（Chrome 是否刚启动空白实例？）')
    process.exit(1)
  }
  const guardCleanups: Array<() => void> = []

  try {
    log(`已连接日常 Chrome。contexts=${browser.contexts().length}`)
    log(
      `  现有标签页：${context
        .pages()
        .map((p) => p.url().slice(0, 80))
        .join(' | ')}`,
    )

    // ── 1. 验证指纹 ──
    const checker = context.pages()[0]
    if (checker !== undefined) {
      const fingerprint = await checker.evaluate(() =>
        JSON.stringify({
          webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
          userAgent: navigator.userAgent.slice(0, 80),
        }),
      )
      log(`指纹：${fingerprint}`)
    }

    // ── 2. 新开标签页 + 端口守卫 → 打开猎聘登录页 ──
    const page = await context.newPage()
    attachDiagnostics(page, 'login')
    const cdpSession = await context.newCDPSession(page)
    const cleanup = await installPortGuard(cdpSession, { port: DEBUG_PORT, logger: { info: log, warn: log } })
    guardCleanups.push(cleanup)

    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await waitForLogin(page)

    // ── 3. 登录后：带端口守卫探测列表页 ──
    for (const url of PROBE_URLS) {
      await probeUrl(page, url)
    }

    log(`探测完成。浏览器保留 ${KEEP_OPEN_MS / 1000}s 供目视确认……`)
    await page.waitForTimeout(KEEP_OPEN_MS)
  } finally {
    for (const cleanup of guardCleanups) {
      try {
        cleanup()
      } catch {
        /* ignore */
      }
    }
  }
  log('done')
}

void main()
