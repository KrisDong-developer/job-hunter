#!/usr/bin/env node
/**
 * 国聘网「分页契约」探针 —— 一次性定案 `hasNextPage` / `maxPages` / URL page 参数。
 *
 * 背景（`adapters/guopin/index.ts` 文件头记的欠账）：
 *   登录态实测列表页有 `ul.ant-pagination`（共 20 页），但 ant 分页的页码 `<a>` **不带 href**
 *   （纯 JS 点击）⇒ 「URL 能不能直接寻址第 N 页」必须实测，不能从 DOM 推断。
 *
 * 三步实测（全自动，复用 probe:guopin-login 留下的登录态 profile）：
 *   ① 第 1 页基线：标题集合 T1 + URL；
 *   ② 真鼠标点 `.ant-pagination-item-2`：看 URL 变不变、标题集合换不换（T2）；
 *      —— 若 URL 变成 `?page=2` 形态，抄下真实参数名；
 *   ③ URL 直达 `?keyword=Java&page=2`（与 ② 观察到的参数名对齐后再试）：
 *      与 T2 对比 —— 一致 ⇒ URL 翻页有效（crawl 主链的既有翻页回路可用）；
 *      不一致 ⇒ SPA 忽略 URL 参数，只能点击翻页（那就得走页面内交互，另案）。
 *   ④ 顺带试 `channel=social|campus`（列表页导航实测有 `/job?channel=social`）：
 *      看 URL 参数是否切换校招/社招频道（nature 维度的候选入口，只记录证据不动适配器）。
 *
 * 产物：`.probe-guopin-capture/guopin-pagination-report-<日期>.json`
 *
 * 用法：npm run probe:guopin-pagination
 * 环境变量：GUOPIN_KEY / GUOPIN_PROFILE
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { DEFAULT_GUOPIN_CONFIG } from '../../src/host/platform/adapters/guopin/config.js'

const KEYWORD = process.env['GUOPIN_KEY'] ?? 'Java'
const PROFILE = process.env['GUOPIN_PROFILE'] ?? join(process.cwd(), '.probe-guopin-profile')
const CAPTURE_DIR = join(process.cwd(), '.probe-guopin-capture')
const BASE = 'https://www.iguopin.com/job'
const SEARCH_URL = `${BASE}?keyword=${encodeURIComponent(KEYWORD)}`
const CARD_SELECTOR = '.job-card'
const TODAY = new Date().toISOString().slice(0, 10)

function log(message: string): void {
  console.log(`[probe-guopin-pagination] ${new Date().toISOString()} ${message}`)
}

/** 列表快照（自包含）：URL + 标题集合 + 分页 active 页码。 */
async function snapshot(page: Page): Promise<{
  url: string
  titles: string[]
  activePage: string
  totalPageItems: number
}> {
  return await page.evaluate((cardSelector: string) => {
    const titles: string[] = []
    try {
      for (const card of Array.from(document.querySelectorAll(cardSelector))) {
        const name = card.querySelector('.job-name')
        const t = (name?.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t !== '') titles.push(t)
      }
    } catch {
      /* ignore */
    }
    let activePage = ''
    let totalPageItems = 0
    try {
      const active = document.querySelector('.ant-pagination-item-active')
      activePage = (active?.getAttribute('title') ?? active?.textContent ?? '').trim()
      totalPageItems = document.querySelectorAll('.ant-pagination-item').length
    } catch {
      /* ignore */
    }
    return { url: location.href, titles, activePage, totalPageItems }
  }, CARD_SELECTOR)
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · profile：${PROFILE}`)

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath !== undefined) log(`浏览器：${executablePath}`)
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath === undefined ? {} : { executablePath }),
  })
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
  const page: Page = await context.newPage()

  const report: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    keyword: KEYWORD,
    searchUrl: SEARCH_URL,
  }

  // ── ① 第 1 页基线 ──────────────────────────────────────────────────────
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector(CARD_SELECTOR, { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(4_000)
  const p1 = await snapshot(page)
  log(`① 第 1 页：${String(p1.titles.length)} 张卡 · active=${p1.activePage} · URL ${p1.url}`)
  report['page1'] = p1

  // ── ② 真鼠标点第 2 页 ──────────────────────────────────────────────────
  let clicked: typeof p1 | null = null
  try {
    await page.click('.ant-pagination-item-2', { timeout: 10_000 })
    await page.waitForTimeout(4_000)
    clicked = await snapshot(page)
    log(`② 点第 2 页后：active=${clicked.activePage} · URL ${clicked.url}`)
    log(
      `   标题集合：${String(p1.titles.length)} → ${String(clicked.titles.length)} 张 · ` +
        `重叠 ${String(p1.titles.filter((t) => clicked?.titles.includes(t)).length)}`,
    )
  } catch (error) {
    log(`② 点击第 2 页失败：${error instanceof Error ? error.message : String(error)}`)
  }
  report['afterClickPage2'] = clicked

  // 从 ② 的 URL 里抠 page 参数名（若 URL 真的变了）
  const pageParamMatch = clicked === null ? null : /[?&]([a-zA-Z]*)=2(?:&|$)/.exec(clicked.url)
  const pageParamName = pageParamMatch === null ? 'page' : (pageParamMatch[1] ?? 'page')
  report['observedPageParam'] = pageParamName
  log(`③ 观察到的页码参数名：${pageParamName}`)

  // ── ③ URL 直达第 2 页 ──────────────────────────────────────────────────
  await page.goto(`${SEARCH_URL}&${pageParamName}=2`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector(CARD_SELECTOR, { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(4_000)
  const p2url = await snapshot(page)
  const sameAsClicked = clicked !== null && p2url.titles.join('|') === clicked.titles.join('|')
  const changedFromP1 = p2url.titles.join('|') !== p1.titles.join('|')
  log(
    `③ URL 直达 &${pageParamName}=2：active=${p2url.activePage} · 与点击结果一致=${String(sameAsClicked)} · ` +
      `与第 1 页不同=${String(changedFromP1)}`,
  )
  report['urlPage2'] = p2url
  report['urlPaging'] = {
    pageParamName,
    sameAsClickResult: sameAsClicked,
    changedFromPage1: changedFromP1,
    verdict: sameAsClicked && changedFromP1 ? 'URL 翻页有效' : 'URL 参数无效或不确定（SPA 可能忽略）',
  }

  // ── ④ channel 参数（只记录证据）────────────────────────────────────────
  const channelProbe: Record<string, unknown> = {}
  for (const channel of ['campus', 'social']) {
    try {
      await page.goto(`${SEARCH_URL}&channel=${channel}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForSelector(CARD_SELECTOR, { timeout: 20_000 }).catch(() => undefined)
      await page.waitForTimeout(4_000)
      const snap = await snapshot(page)
      channelProbe[channel] = {
        url: snap.url,
        titles: snap.titles.slice(0, 5),
        changedFromDefault: snap.titles.join('|') !== p1.titles.join('|'),
      }
      log(`④ channel=${channel}：与默认结果不同=${String(snap.titles.join('|') !== p1.titles.join('|'))}`)
    } catch (error) {
      channelProbe[channel] = { error: error instanceof Error ? error.message : String(error) }
    }
  }
  report['channelProbe'] = channelProbe

  mkdirSync(CAPTURE_DIR, { recursive: true })
  const reportPath = join(CAPTURE_DIR, `guopin-pagination-report-${TODAY}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  log(`报告已保存：${reportPath}`)

  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
