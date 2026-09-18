#!/usr/bin/env node
/**
 * 对照探针 —— BOSS直聘 vs 猎聘（同环境 CDP 连接）。
 *
 * 目的：验证 BossHunter 能在 BOSS直聘上跑，是因为 **BOSS 风控没到 CDP 检测层**，
 * 而不是它的方案更强。方法：用和猎聘探针**完全相同**的 connectOverCDP + Page.navigate，
 * 访问 BOSS直聘搜索列表页，看是否被 about:blank / 验证码拦截。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-zhipin-cdp.ts
 */
import { chromium } from 'playwright-core'
import type { Browser, BrowserContext, Page } from 'playwright-core'

const CDP_URL = process.env['CDP_URL'] ?? 'http://127.0.0.1:9222'

// BOSS直聘搜索页（未登录也可见列表骨架）
const PROBE_URLS: string[] = [
  'https://www.zhipin.com/web/geek/job?query=Java&city=101280600',
  'https://www.zhipin.com/web/geek/job?query=Java',
]

function log(message: string): void {
  console.log(`[probe-zhipin] ${new Date().toISOString()} ${message}`)
}

async function probeUrl(page: Page, url: string): Promise<void> {
  log(`---- 探测 ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`  goto 失败：${error instanceof Error ? error.message : String(error)}`)
    return
  }
  await page.waitForTimeout(5_000) // 等 JS 渲染 / 风控跳转

  const finalUrl = page.url()
  log(`  final URL: ${finalUrl}`)
  if (finalUrl === 'about:blank' || finalUrl.startsWith('about:')) {
    log('  ⚠️ 被替换成 about:blank（与猎聘同款风控）')
    return
  }

  const data = await page.evaluate(() => {
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    return JSON.stringify({
      title: document.title ?? '',
      bodyLength: text.length,
      bodyHead: text.slice(0, 200),
      // BOSS 列表卡片：.job-card-wrapper / .job-card-box
      jobCards: document.querySelectorAll('.job-card-wrapper, .job-card-box, .job-card').length,
      hasCaptcha: /验证|captcha|安全验证/.test(text.slice(0, 300)),
      hasLoginWall: /登录/.test(text.slice(0, 300)),
    })
  })
  log(`  ${data}`)
}

async function main(): Promise<void> {
  let browser: Browser
  try {
    browser = await chromium.connectOverCDP(CDP_URL)
  } catch (error) {
    log(`连接失败：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  const context: BrowserContext | undefined = browser.contexts()[0]
  if (context === undefined) {
    log('连接成功但没有可用的 BrowserContext')
    process.exit(1)
  }
  try {
    const page = await context.newPage()
    for (const url of PROBE_URLS) {
      await probeUrl(page, url)
    }
  } finally {
    // 不动用户浏览器
  }
  log('done')
}

void main()
