#!/usr/bin/env node
/**
 * 猎聘探针 —— v6：attach 但**不导航**，只读（验证检测粒度）。
 *
 * 前提实验结论（对照）：带调试端口的 Chrome **手动**打开猎聘正常；
 * CDP `Page.navigate` 导航则 about:blank。所以猎聘检测的不是端口，
 * 而是"CDP 控制页面"的痕迹。
 *
 * 本探针验证：如果只 attach 会话 + 只 `Runtime.evaluate` 读取（**绝不调用
 * Page.navigate**），页面会不会被杀？
 *   - 不死 → 自动化只能"读"不能"导"，模式变成：用户手动开列表页 + 自动读取；
 *   - 死   → 任何 CDP 都过不了猎聘，CDP 路线彻底出局。
 *
 * 流程：
 *   1. connectOverCDP 连接日常 Chrome；
 *   2. 新开标签页（Target.createTarget 到 about:blank，不是导航猎聘）；
 *   3. 请用户**手动**在那个新标签页里输入猎聘列表 URL；
 *   4. 我们只 evaluate 读取页面内容，观察是否被 about:blank。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-liepin-readonly.ts
 */
import { chromium } from 'playwright-core'
import type { Browser, BrowserContext, Page } from 'playwright-core'

const CDP_URL = process.env['CDP_URL'] ?? 'http://127.0.0.1:9222'
const PROBE_URL = 'https://www.liepin.com/zhaopin/?key=Java'
const WAIT_TIMEOUT_MS = 8 * 60 * 1000

function log(message: string): void {
  console.log(`[probe-liepin-readonly] ${new Date().toISOString()} ${message}`)
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
    // 新开标签页到空白页（不用 Page.navigate 导航猎聘）
    const page: Page = await context.newPage()
    log(`已新开标签页（about:blank）。`)
    log(`请在【这个新开的 Chrome 标签页】里手动输入地址：${PROBE_URL}`)
    log('打开后脚本会每 3 秒只读一次页面状态，不做任何导航。')

    const deadline = Date.now() + WAIT_TIMEOUT_MS
    // 第一阶段：等用户**手动**把标签页导航到猎聘（我们不做任何导航）
    let onLiepin = false
    while (Date.now() < deadline && !onLiepin) {
      await page.waitForTimeout(2_000)
      const url = await page.evaluate(() => location.href).catch(() => '')
      if (url.includes('liepin.com')) onLiepin = true
    }
    if (!onLiepin) {
      log('等待用户手动打开猎聘超时，退出。')
      process.exit(1)
    }
    log('检测到已打开猎聘页面。开始监控：每 3 秒只读一次，观察是否被替换成 about:blank。')

    // 第二阶段：只读监控 —— 页面在用户手里，我们只 evaluate，绝不导航
    let wasAbout = false
    while (Date.now() < deadline) {
      await page.waitForTimeout(3_000)

      // ⚠️ 只读：evaluate 不触发导航，只取状态
      const state = await page.evaluate(() => {
        const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
        return JSON.stringify({
          url: location.href,
          title: document.title ?? '',
          bodyLength: text.length,
          bodyHead: text.slice(0, 120),
        })
      }).catch(() => '{"url":"?"}')
      log(`  状态：${state.slice(0, 220)}`)

      const parsed = JSON.parse(state) as { url: string; bodyLength: number }
      if (parsed.url === 'about:blank' || parsed.url.startsWith('about:')) {
        log('  ⚠️ 页面被替换成 about:blank（只读也触发风控）')
        wasAbout = true
        break
      }
    }
    if (!wasAbout) log('监控期间页面保持正常 —— 只读不触发风控。')
    log('done')
  } finally {
    // 不动用户的浏览器
  }
}

void main()
