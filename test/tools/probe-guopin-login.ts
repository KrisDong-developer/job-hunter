#!/usr/bin/env node
/**
 * 国聘网「登录态」探针 —— 把浏览器窗口开给人登录，登录后顺手采登录态证据。
 *
 * 为什么需要它（`adapters/guopin/index.ts` 文件头记的三个未确证点，登录态下大概率有新线索）：
 *   * 分页参数未确证（`hasNextPage` 恒 false、`maxPages=1`，单页 20 条）；
 *   * 城市码未实测（`cityCodes` 空表，带城市即拒绝）；
 *   * 详情页选择器是**语义锚点**（`h1 / [class*="salary"] / …`，待真实夹具校准 ——
 *     列表卡片没有详情链接，id 只能点进详情页才看得到）。
 *
 * 流程（复用 probe-zhipin-login 的「窗口留给人」等待套路）：
 *   1. patchright 启动式 + 系统 Chrome + stealth 注入，打开国聘首页；
 *   2. **窗口留给人操作**：手动点「登录」完成登录（profile 记住登录态，与 probe:guopin
 *      共用同一份 —— 登录一次，两个探针都受益）；
 *   3. 等到登录信号（token 类 cookie 出现，启发式、会连同 cookie 名单落盘供复核）后，
 *      落盘到 `.probe-guopin-capture/`（`.probe*` 已 gitignore，**不覆写 test/fixtures/**，
 *      那里的首条标题/条数被用例硬编码断言）：
 *      - `guopin-search-logged-in-<日期>.html`  登录态列表页快照
 *      - `guopin-detail-<日期>.html`            点开首卡后的详情页快照（best-effort：
 *        点击可能同页跳转也可能开新标签，两种都接；点不进去就只记日志）
 *      - `guopin-login-report-<日期>.json`      cookie 名单（只记名不记值）+ 页头标记命中
 *        + 分页区探测 —— 将来设计 `auth` 登录锚点与分页契约的第一手证据
 *
 * 用法：npm run probe:guopin-login
 * 环境变量：GUOPIN_KEY（默认 Java）/ GUOPIN_PROFILE / GUOPIN_WAIT_MIN（等待登录的分钟数，默认 10）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { DEFAULT_GUOPIN_CONFIG } from '../../src/host/platform/adapters/guopin/config.js'

const KEYWORD = process.env['GUOPIN_KEY'] ?? 'Java'
/** 与 probe:guopin 共用同一份 profile —— 登录一次，两个探针都受益。 */
const PROFILE = process.env['GUOPIN_PROFILE'] ?? join(process.cwd(), '.probe-guopin-profile')
const CAPTURE_DIR = join(process.cwd(), '.probe-guopin-capture')
const HOME_URL = 'https://www.iguopin.com/'
const SEARCH_URL = `${DEFAULT_GUOPIN_CONFIG.urlParams.base}?${DEFAULT_GUOPIN_CONFIG.urlParams.keywordParam}=${encodeURIComponent(KEYWORD)}`
const CARD_SELECTOR = '.job-card'

const WAIT_TIMEOUT_MS = Math.max(1, Number(process.env['GUOPIN_WAIT_MIN'] ?? '10')) * 60_000
const POLL_MS = 3_000
const TODAY = new Date().toISOString().slice(0, 10)

/** 登录信号：cookie 名里带这些词（启发式 —— 名单会原样落盘，供下次收紧判据）。 */
const AUTH_COOKIE_RE = /(token|session|user|auth|jwt|sso|ssid|login)/i

function log(message: string): void {
  console.log(`[probe-guopin-login] ${new Date().toISOString()} ${message}`)
}

/** 页头标记扫描（自包含，序列化进页面执行）—— 将来设计 auth 锚点的候选证据。 */
async function scanHeader(page: Page): Promise<Record<string, number>> {
  return await page.evaluate(() => {
    const out: Record<string, number> = {}
    for (const selector of [
      '[class*="avatar"]',
      '[class*="user-info"]',
      '[class*="user-name"]',
      '[class*="user-center"]',
      '[class*="login"]',
      '[class*="register"]',
    ]) {
      try {
        const n = document.querySelectorAll(selector).length
        if (n > 0) out[selector] = n
      } catch {
        /* 选择器非法 → 跳过 */
      }
    }
    return out
  })
}

/** 分页区探测（自包含）—— 「分页参数未确证」这条欠账的 DOM 侧证据。 */
async function scanPagination(page: Page): Promise<{
  containers: Array<{ selector: string; count: number; className: string; text: string }>
  nextCandidates: Array<{ text: string; href: string | null; disabled: boolean }>
}> {
  return await page.evaluate(() => {
    const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const containers: Array<{ selector: string; count: number; className: string; text: string }> = []
    for (const selector of [
      '.ant-pagination',
      '[class*="pagination"]',
      '[class*="pager"]',
      '[class*="page-"]',
    ]) {
      try {
        const nodes = Array.from(document.querySelectorAll(selector))
        const first = nodes[0]
        if (first === undefined) continue
        containers.push({
          selector,
          count: nodes.length,
          className: first.getAttribute('class') ?? '',
          text: text(first).slice(0, 100),
        })
      } catch {
        /* ignore */
      }
    }
    const nextCandidates: Array<{ text: string; href: string | null; disabled: boolean }> = []
    for (const el of Array.from(document.querySelectorAll('a, li, button, span'))) {
      const t = text(el)
      if (!['下一页', '下页', '›', '»'].includes(t)) continue
      nextCandidates.push({
        text: t,
        href: el.getAttribute('href'),
        disabled:
          el.getAttribute('disabled') !== null ||
          el.getAttribute('aria-disabled') === 'true' ||
          /disabled/.test(el.getAttribute('class') ?? ''),
      })
    }
    return { containers, nextCandidates }
  })
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · profile：${PROFILE}`)
  log(`首页：${HOME_URL}（请在弹出的窗口里点「登录」完成登录）`)
  log(`等待登录上限：${String(WAIT_TIMEOUT_MS / 60_000)} 分钟（GUOPIN_WAIT_MIN 可调）`)

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath === undefined) log('⚠️ 没找到系统 Chrome/Edge，交给 patchright 自行解析')
  else log(`浏览器：${executablePath}`)

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

  // ── 1. 打开首页，窗口留给人登录 ─────────────────────────────────────────
  try {
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // ── 2. 轮询等登录（token 类 cookie 出现即视为登录，启发式）──────────────
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  let cookieNamesBefore: string[] = []
  let loggedIn = false
  let lastHintAt = 0
  while (Date.now() < deadline) {
    const cookies = await context.cookies().catch(() => [] as Array<{ name: string }>)
    const names = cookies.map((cookie) => cookie.name)
    const authCookies = names.filter((name) => AUTH_COOKIE_RE.test(name))
    if (authCookies.length > 0) {
      loggedIn = true
      log(`✔ 登录信号：出现 token 类 cookie（${authCookies.join(', ')}）—— 启发式判定，名单已入报告`)
      break
    }
    if (Date.now() - lastHintAt > 15_000) {
      lastHintAt = Date.now()
      const markers = await scanHeader(page).catch(() => ({} as Record<string, number>))
      log(
        `⏳ 等待登录中（当前 URL ${page.url().slice(0, 90)} · cookie ${String(names.length)} 个 · ` +
          `页头标记 ${JSON.stringify(markers)}）—— 请在窗口里登录国聘`,
      )
    }
    cookieNamesBefore = names
    await page.waitForTimeout(POLL_MS)
  }

  if (!loggedIn) {
    log('✘ 等待登录超时 —— 未采集。profile 已保留，登录后重跑本探针即可。')
    await context.close()
    process.exitCode = 1
    return
  }
  await page.waitForTimeout(3_000)

  mkdirSync(CAPTURE_DIR, { recursive: true })

  // ── 3. 登录态列表页：导航 + 快照 + 体检 ────────────────────────────────
  const headerMarkers = await scanHeader(page).catch(() => ({} as Record<string, number>))
  log(`登录后首页页头标记：${JSON.stringify(headerMarkers)}`)

  await page
    .goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    .catch((error: unknown) => log(`搜索页 goto 失败：${String(error)}`))
  await page.waitForSelector(CARD_SELECTOR, { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(5_000)

  const listScan = await page
    .evaluate((cardSelector: string) => {
      const cards = document.querySelectorAll(cardSelector).length
      const salary = Array.from(document.querySelectorAll(`${cardSelector} .job-salary`)).filter(
        (el) => (el.textContent ?? '').trim() !== '',
      ).length
      return {
        url: location.href,
        title: document.title,
        cards,
        salaryFilled: salary,
      };
    }, CARD_SELECTOR)
    .catch(() => ({ url: page.url(), title: '', cards: 0, salaryFilled: 0 }))
  log(`登录态列表体检：${JSON.stringify(listScan)}`)

  const listHtml = await page.content()
  const listFixture = join(CAPTURE_DIR, `guopin-search-logged-in-${TODAY}.html`)
  writeFileSync(listFixture, listHtml, 'utf8')
  log(`登录态列表快照已保存：${listFixture}（${String(listHtml.length)} 字符）`)

  const pagination = await scanPagination(page).catch(() => ({
    containers: [],
    nextCandidates: [],
  }))
  log(`分页区探测：${JSON.stringify(pagination)}`)

  // ── 4. 详情页（best-effort）：点开首卡，采真实详情结构 ──────────────────
  //
  // 列表卡片**没有详情链接**（适配器文件头实证），id 只在详情页 URL 里 ——
  // 这里用真鼠标点首卡（DOM el.click() 触发不了 Vue 处理器，zhipin 探针踩过两次），
  // 同页跳转与新标签两种形态都接；点不进去就只记日志，不影响其余产物。
  let detailCaptured: { url: string; fixture: string } | null = null
  try {
    const newPagePromise = context.waitForEvent('page', { timeout: 12_000 }).catch(() => null)
    await page.click(CARD_SELECTOR, { timeout: 10_000 })
    await page.waitForTimeout(4_000)
    let detailPage: Page | null = page.url().includes('/job/detail') ? page : null
    if (detailPage === null) {
      const opened = await newPagePromise
      if (opened !== null) {
        await opened.waitForLoadState('domcontentloaded').catch(() => undefined)
        if (opened.url().includes('/job/detail')) detailPage = opened
      }
    }
    if (detailPage !== null) {
      await detailPage.waitForTimeout(3_000)
      const detailHtml = await detailPage.content()
      const detailFixture = join(CAPTURE_DIR, `guopin-detail-${TODAY}.html`)
      writeFileSync(detailFixture, detailHtml, 'utf8')
      detailCaptured = { url: detailPage.url(), fixture: detailFixture }
      log(`✔ 详情页快照已保存：${detailFixture}（${String(detailHtml.length)} 字符，${detailPage.url().slice(0, 90)}）`)
    } else {
      log(`⚠️ 点了首卡但没落到 /job/detail（当前 ${page.url().slice(0, 90)}）—— 记录在案，下次换点法`)
    }
  } catch (error) {
    log(`详情页采集失败（best-effort，不影响其余产物）：${error instanceof Error ? error.message : String(error)}`)
  }

  // ── 5. 报告落盘（cookie 只记名不记值）──────────────────────────────────
  const cookiesNow = await context.cookies().catch(() => [] as Array<{ name: string }>)
  const report = {
    capturedAt: new Date().toISOString(),
    keyword: KEYWORD,
    searchUrl: SEARCH_URL,
    loginSignal: 'token 类 cookie（启发式：AUTH_COOKIE_RE）',
    cookieNames: cookiesNow.map((cookie) => cookie.name),
    cookieNamesBeforeLogin: cookieNamesBefore,
    headerMarkersOnHome: headerMarkers,
    listScan,
    pagination,
    detailCaptured,
  }
  const reportPath = join(CAPTURE_DIR, `guopin-login-report-${TODAY}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  log(`报告已保存：${reportPath}`)

  log('✔ 采集完成 —— 接下来由助手按这批证据校准适配器（auth 锚点 / 分页契约 / 详情选择器）。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
