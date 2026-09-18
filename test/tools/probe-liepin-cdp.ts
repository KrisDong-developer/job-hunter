#!/usr/bin/env node
/**
 * 猎聘探针 —— 方向 A：复用日常浏览器会话（connectOverCDP）。
 *
 * 核心区别（对照 src/host/platform/browser.ts 的 launchPersistentContext）：
 *   * 不再由 playwright **拉起**一个带 webdriver=true + CDP 特征的新 Chrome；
 *   * 而是 **连接** 你日常正在用的 Chrome（真实指纹、真实登录态、无 webdriver）。
 *
 * 前置条件：
 *   1. 你的日常 Chrome 已用调试端口启动：
 *      `chrome.exe --remote-debugging-port=9222`
 *      （保留日常 profile，所以登录态都在；不要带 --user-data-dir 指向新目录）
 *   2. 本脚本默认连 `http://localhost:9222`，可用 `CDP_URL` 环境变量覆盖。
 *
 * 流程：
 *   0. 列出当前标签页（找猎聘页 / 看日常环境长什么样）；
 *   1. 检查连接到的浏览器指纹：navigator.webdriver 应为 undefined；
 *   2. 新开标签页探测列表页（zhaopin/?key=Java）：
 *      - 是否被替换成 about:blank（风控）；
 *      - 若存活，抓 DOM 卡片容器 / 条数 / 薪资样本 / 登录态；
 *   3. 登录态下再测详情页链接格式。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-liepin-cdp.ts
 */
import { chromium } from 'playwright-core'
import type { Browser, Page } from 'playwright-core'

const CDP_URL = process.env['CDP_URL'] ?? 'http://localhost:9222'

const PROBE_URLS: string[] = [
  'https://www.liepin.com/zhaopin/?key=Java',
  'https://www.liepin.com/zhaopin/?key=Java&dq=050090',
  'https://www.liepin.com/',
]

function log(message: string): void {
  console.log(`[probe-liepin-cdp] ${new Date().toISOString()} ${message}`)
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
  page.on('requestfailed', (request) => {
    const failure = request.failure()
    const url = request.url()
    if (url.startsWith('chrome-extension://')) return
    log(`  [${label}] requestfailed: ${failure?.errorText ?? '?'} ${url.slice(0, 160)}`)
  })
}

/** 探测一个 URL：是否被风控替换、卡片容器与条数、前几条文本。 */
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
    // 找包含「薪资」字样的链接
    const anchors: string[] = []
    for (const a of Array.from(document.querySelectorAll('a')).slice(0, 2000)) {
      const t = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t.length > 0 && t.length < 120 && /k|万|元|\d-\d|\d-{1,2}\d/.test(t)) {
        anchors.push(`${t} | ${a.getAttribute('href') ?? ''}`)
        if (anchors.length >= 8) break
      }
    }
    return JSON.stringify({
      title,
      bodyLength: text.length,
      bodyHead: text.slice(0, 300),
      cardHits: hits,
      anchorSamples: anchors,
    })
  })
  log(`  ${data}`)
}

async function main(): Promise<void> {
  let browser: Browser
  try {
    browser = await chromium.connectOverCDP(CDP_URL)
  } catch (error) {
    log(
      `连接日常 Chrome 失败（${CDP_URL}）：${
        error instanceof Error ? error.message : String(error)
      }。\n` +
        '请先把日常 Chrome 用调试端口重启：\n' +
        '  1. 关闭所有 Chrome 窗口；\n' +
        '  2. 运行：chrome.exe --remote-debugging-port=9222\n' +
        '     （不要加 --user-data-dir，保留日常 profile 与登录态）\n' +
        '  3. 重新运行本脚本。',
    )
    process.exit(1)
  }

  try {
    // ── 0. 看连接到了什么 ──
    const contexts = browser.contexts()
    log(`已连接日常 Chrome。contexts=${contexts.length}`)
    for (const [index, context] of contexts.entries()) {
      const pages = context.pages()
      log(
        `  context[${index}] pages=${pages.length}: ${pages
          .slice(0, 8)
          .map((p) => p.url().slice(0, 80))
          .join(' | ')}`,
      )
    }

    // ── 1. 验证指纹：真实浏览器里 navigator.webdriver 应为 undefined ──
    const mainContext = contexts[0]
    if (mainContext === undefined) throw new Error('没有可用的 BrowserContext')
    const existing = mainContext.pages().find((p) => !p.url().startsWith('chrome://') && !p.url().startsWith('chrome-extension://'))
    const checker = existing ?? (await mainContext.newPage())
    const fingerprint = await checker.evaluate(() =>
      JSON.stringify({
        webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
        userAgent: navigator.userAgent,
        languages: navigator.languages,
        hasChrome: typeof (window as unknown as { chrome?: unknown }).chrome !== 'undefined',
      }),
    )
    log(`浏览器指纹：${fingerprint}`)

    // ── 2. 新开标签页探测列表页 ──
    const page = await mainContext.newPage()
    attachDiagnostics(page, 'probe')
    for (const url of PROBE_URLS) {
      await probeUrl(page, url)
    }

    log('探测完成。')
  } finally {
    // 只关我们新开的页面，绝不动用户的其它标签页
    // （connectOverCDP 下 browser.close() 会关掉整个浏览器，**不能调**）
  }
  log('done（保留标签页供你查看）')
}

void main()
