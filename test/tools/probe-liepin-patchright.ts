#!/usr/bin/env node
/**
 * 猎聘探针 —— v7：patchright（反检测 fork）连接日常 Chrome。
 *
 * 前提：BossHunter 与我们的最大技术差异是它用 `patchright`（playwright 的
 * 反检测 fork），能隐藏 CDP 自动化痕迹（navigator.webdriver、Runtime 注入等）。
 * 而原版 playwright-core 连 BOSS直聘都会死。
 *
 * 本探针验证：patchright + connectOverCDP 连接日常 Chrome，访问猎聘列表页，
 * 是否仍被 about:blank 风控。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-liepin-patchright.ts
 */
import { chromium } from 'patchright'
import type { Browser, BrowserContext, Page } from 'patchright'

const CDP_URL = process.env['CDP_URL'] ?? 'http://127.0.0.1:9222'
const PROBE_URLS: string[] = [
  'https://www.liepin.com/zhaopin/?key=Java',
  'https://www.liepin.com/',
]

function log(message: string): void {
  console.log(`[probe-liepin-patchright] ${new Date().toISOString()} ${message}`)
}

async function probeUrl(page: Page, url: string): Promise<void> {
  log(`---- 探测 ${url}`)
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`  goto 失败：${error instanceof Error ? error.message : String(error)}`)
    return
  }
  await page.waitForTimeout(4_000)

  const finalUrl = page.url()
  log(`  final URL: ${finalUrl}`)
  if (finalUrl === 'about:blank' || finalUrl.startsWith('about:')) {
    log('  ⚠️ 仍被风控替换成 about:blank')
    return
  }

  const data = await page.evaluate(() => {
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cardSelectors = [
      '.job-card', '.job-card-pc-container', '.job-detail-card', '.position-card',
      '.job-card-wrapper', '.job-list-item', '.job-card-box', '.job-detail-box', '.job-card-item',
    ]
    const hits: Record<string, number> = {}
    for (const selector of cardSelectors) {
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch { /* ignore */ }
    }
    const anchors: string[] = []
    for (const a of Array.from(document.querySelectorAll('a')).slice(0, 2000)) {
      const t = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t.length > 0 && t.length < 120 && /k|万|元|\d-\d|\d-{1,2}\d/.test(t)) {
        anchors.push(`${t} | ${a.getAttribute('href') ?? ''}`)
        if (anchors.length >= 6) break
      }
    }
    return JSON.stringify({
      title: document.title ?? '',
      bodyLength: text.length,
      bodyHead: text.slice(0, 200),
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
    log(`连接失败：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  const context: BrowserContext | undefined = browser.contexts()[0]
  if (context === undefined) {
    log('连接成功但没有可用的 BrowserContext')
    process.exit(1)
  }
  try {
    log('已用 patchright 连接日常 Chrome。')
    const firstPage = context.pages()[0]
    if (firstPage === undefined) throw new Error('现有标签页里没有可用页面')
    const fingerprint = await firstPage.evaluate(() =>
      JSON.stringify({
        webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
      }),
    )
    log(`webdriver 标志：${fingerprint}`)

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
