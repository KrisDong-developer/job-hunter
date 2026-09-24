#!/usr/bin/env node
/**
 * 天眼查免登录通道探针 —— 真实浏览器跑通"落地 → 搜索框 → 结果页 → 详情页"，
 * 把两页原始 HTML 落盘成 fixture（enrichment extractor 的离线测试素材）。
 *
 * 与插件真实运行环境一致（见 src/host/platform/browser.ts 与 probe-liepin）：
 *   * playwright-core + 系统 Chrome；独立 profile（.probe-tyc-profile/）；
 *   * 有头模式；反检测 init script（navigator.webdriver 等）。
 *
 * 为什么要真实浏览器：2026-09-24 实测，裸 HTTP（含首页 Cookie + Referer）访问
 * /search、/company 一律 302 登录页 —— 必须让页面 JS 种下风控指纹后再导航。
 *
 * 用法：node scripts/run-ts.mjs test/tools/probe-tianyancha-enrich.ts [公司名]
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const ROOT = process.cwd()
const PROFILE_DIR = join(ROOT, '.probe-tyc-profile')
const FIXTURES = join(ROOT, 'test', 'fixtures')
const KEYWORD = process.argv[2] ?? '北京雨花石云计算科技'

const CANDIDATES = [
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
  join(process.env['ProgramFiles'] ?? 'C:\\Program Files', '(x86)\\Microsoft\\Edge\\Application\\msedge.exe'),
]
const EXECUTABLE = CANDIDATES.find((path) => existsSync(path))
if (EXECUTABLE === undefined) throw new Error('没找到系统 Chrome/Edge')

const STEALTH = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh'] });
  try { if (window.chrome) window.chrome.runtime = { id: undefined } } catch (e) {}
`

function log(message: string): void {
  console.log(`[probe-tyc] ${message}`)
}

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  executablePath: EXECUTABLE,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
})
try {
  await context.addInitScript({ content: STEALTH })
  const page = await context.newPage()

  // ① 落地首页（种风控 Cookie），找搜索框（页面上有两个同 placeholder 的输入框
  //    ——header 与主搜索区各一，第一个是隐藏的，按可见性过滤）
  log(`goto 首页，搜索「${KEYWORD}」`)
  await page.goto('https://www.tianyancha.com/', { waitUntil: 'domcontentloaded' })
  const input = page.locator('input[placeholder^="请输入公司名称"] >> visible=true').first()
  await input.waitFor({ state: 'visible', timeout: 15_000 })
  // 拟人预热：真人不会 0 秒提交 —— 停留几秒 + 滚一下，让风控脚本看到"浏览行为"
  await page.waitForTimeout(2_500)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(2_000)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(1_500)
  log('搜索框已就绪（已预热）')

  // ② 拟人输入 + 回车（走键盘事件，不用 fill 的直达）
  await input.first().click()
  await page.keyboard.insertText(KEYWORD)
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/search/, { timeout: 15_000 }).catch(() => {})
  log(`搜索页 URL: ${page.url()}`)

  // ③ 等结果链接，落盘搜索页 fixture
  const firstLink = page.locator('a[href^="/company/"]').first()
  const hasResults = await firstLink.waitFor({ state: 'visible', timeout: 12_000 }).then(
    () => true,
    () => false,
  )
  mkdirSync(FIXTURES, { recursive: true })
  writeFileSync(join(FIXTURES, 'tianyancha-search.html'), await page.content())
  log(`搜索页已落盘（有结果=${String(hasResults)}）`)
  if (!hasResults) throw new Error('搜索页没有结果链接（被墙或零结果）—— 看 fixture 里的页面内容')

  // ④ 进第一条详情，等正文，落盘
  const href = (await firstLink.getAttribute('href')) ?? ''
  log(`进详情：${href}`)
  await page.goto(`https://www.tianyancha.com${href}`, { waitUntil: 'domcontentloaded' })
  await page
    .locator('body')
    .filter({ hasText: '法定代表人' })
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {})
  writeFileSync(join(FIXTURES, 'tianyancha-detail.html'), await page.content())
  const next = await page.locator('#__NEXT_DATA__').count()
  log(`详情页已落盘（__NEXT_DATA__ 存在=${String(next > 0)}，url=${page.url()}）`)
} finally {
  await context.close()
}
log('完成')
