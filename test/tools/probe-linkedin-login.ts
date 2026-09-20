#!/usr/bin/env node
/**
 * LinkedIn 登录态探针 —— 打开真浏览器让用户手动登录，然后采集**登录标记两侧对比**与登录态快照。
 *
 * ## 它要补的两个证据缺口（适配器目前都 fail-closed）
 *
 *   1. `auth.isLoggedIn` 的**结构性判据**：适配器刻意不实现登录检测（`auth === undefined`），
 *      因为没有"已登录/未登录两份真实快照"的对比。本探针在**同一页型（搜索页）**上扫
 *      一组候选锚点（global-nav 头像区 vs Sign in 按钮），两侧各扫一遍，落盘对比报告 ——
 *      挑"一侧恒 0、另一侧 ≥1"的判据就是 `isLoggedIn` 的校准依据；
 *   2. **登录态下的采集行为**：登录后搜索页是否还撞 authwall、guest 端点带 cookie 的
 *      行为是否变化、卡片锚点命中率（登录态侧）—— 顺手用**适配器自己的解析函数**
 *      在真页上跑一遍读数（同一条代码，真路径可行性的直接证据）。
 *
 * ## 流程（本仓惯用的登录等待套路 + D-17a 三件套）
 *
 *   1. patchright **启动式** + 系统 Chrome + stealth 注入，先打开**搜索页**扫"当前侧"锚点
 *      （首次运行 = 未登录侧；profile 复用时可能是已登录侧，报告里如实标注）；
 *   2. 导航到 `https://www.linkedin.com/login`（已登录时 LinkedIn 会自己跳回 feed ——
 *      两种状态都安全），提示手动登录（账密 / 邮箱验证码 / 二步验证 / checkpoint 挑战
 *      都在窗口里人工完成），轮询**登录标记**（DOM 头像锚点 ∨ URL 落到 /feed/）；
 *   3. 登录成功 → 回搜索页：扫"已登录侧"锚点 + 保存 HTML 快照 + 适配器解析读数 +
 *      登录态 guest 端点片段；
 *   4. 落盘 `.probe-linkedin-capture/`（已 gitignore）：
 *      - `auth-side-by-side-<日期>.json`  两侧锚点命中对比（校准 isLoggedIn 的正身证据）
 *      - `search-logged-<日期>.html`      登录态搜索页快照
 *      - `guest-logged-<日期>.html`       登录态 guest 端点片段
 *
 * ⚠️ **只读取证**：本探针不发消息、不投递、不点任何岗位动作 —— LinkedIn 封号风险高，
 *    登录态调研的第一步只看不动。未来的 actions 调研必须另开探针并单独评审。
 *
 * ## 用法
 *
 *   npm run probe:linkedin-login
 *   $env:LINKEDIN_KEY='Frontend Engineer'; $env:LINKEDIN_CITY='China'
 *   $env:LINKEDIN_WAIT_MIN='20'         # 登录等待上限（分钟，默认 12）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { DEFAULT_LINKEDIN_CONFIG } from '../../src/host/platform/adapters/linkedin/config.js'
import { buildLinkedInGuestApiUrl, buildLinkedInSearchUrl } from '../../src/host/platform/adapters/linkedin/urls.js'
import { extractJobsInPage } from '../../src/host/platform/adapters/linkedin/page.js'

const KEYWORD = process.env['LINKEDIN_KEY'] ?? 'Software Engineer'
const CITY = process.env['LINKEDIN_CITY'] ?? 'China'
/** 独立 profile：只给本探针与后续登录态调研复用（`probe:linkedin` 不开浏览器，无 profile）。 */
const PROFILE = process.env['LINKEDIN_PROFILE'] ?? join(process.cwd(), '.probe-linkedin-profile')
const CAPTURE_DIR = process.env['LINKEDIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-linkedin-capture')
const TODAY = new Date().toISOString().slice(0, 10)

const CRITERIA = { keyword: KEYWORD, city: CITY, page: 1 }
const SEARCH_URL = buildLinkedInSearchUrl(DEFAULT_LINKEDIN_CONFIG, CRITERIA)
/** 登录页：已登录访问会被 LinkedIn 自己跳回 /feed/ —— 两种状态都安全。 */
const LOGIN_URL = 'https://www.linkedin.com/login'

const WAIT_TIMEOUT_MS = Math.max(1, Number(process.env['LINKEDIN_WAIT_MIN'] ?? '12')) * 60 * 1000
const POLL_MS = 3_000

/**
 * 登录标记的**存在性探针候选**（global-nav 是 LinkedIn 多年稳定的页头结构）。
 *
 * 已登录侧候选：页头「我」区（头像 / me 菜单 / 个人主页链接）。
 * 未登录侧候选：Sign in / Join now 按钮与 authwall 链接。
 * 两组合在一起扫，报告里靠两侧命中数挑判据 —— 单侧扫描挑不出"恒 0"的那条。
 */
const ME_MARKERS = [
  'img.global-nav__me-photo',
  '.global-nav__me',
  '.global-nav__primary-item--me',
  'a.global-nav__primary-link[href*="/in/"]',
  '#global-nav-me',
]
const ANON_MARKERS = [
  'a.nav__button-secondary',
  'a.nav__cta-secondary',
  'a[data-test-id="nav-secondary-login"]',
  'a[href*="/login"]',
]
/** 等待条件只认**已登录侧**候选（没等到就超时，绝不把未登录态当已登录 —— 早期登录探针踩过的坑）。 */
const LOGIN_PRESENCE_PROBE = ME_MARKERS.join(', ')

function log(message: string): void {
  console.log(`[probe-linkedin-login] ${new Date().toISOString()} ${message}`)
}

/** 在页面上下文里扫一组候选锚点（自包含：真路径序列化进浏览器执行）。 */
const scanMarkers = (arg: { candidates: string[] }): {
  url: string
  hits: Array<{ selector: string; count: number; samples: Array<{ tag: string; cls: string }> }>
} => {
  const hits: Array<{ selector: string; count: number; samples: Array<{ tag: string; cls: string }> }> = []
  for (const selector of arg.candidates) {
    let nodes: Element[] = []
    try {
      nodes = Array.from(document.querySelectorAll(selector))
    } catch {
      nodes = []
    }
    if (nodes.length === 0) continue
    hits.push({
      selector,
      count: nodes.length,
      samples: nodes
        .slice(0, 3)
        .map((el) => ({ tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') ?? '' })),
    })
  }
  return { url: location.href, hits }
}

/** 在页面上下文里用**适配器自己的解析函数**读卡片（DOM 通道）。 */
async function readCards(page: Page): Promise<{
  total: number
  withId: number
  withCompany: number
  withCity: number
  withDate: number
  withSalary: number
  sample: { title: string; company: string } | null
}> {
  const jobs = await page.evaluate(extractJobsInPage, {
    selectors: DEFAULT_LINKEDIN_CONFIG.selectors,
    host: DEFAULT_LINKEDIN_CONFIG.host,
    jobUrnPattern: DEFAULT_LINKEDIN_CONFIG.jobUrnPattern,
    jobIdFromUrlPattern: DEFAULT_LINKEDIN_CONFIG.jobIdFromUrlPattern,
    salaryPattern: DEFAULT_LINKEDIN_CONFIG.salaryPattern,
  })
  const n = jobs.length
  return {
    total: n,
    withId: jobs.filter((job) => job.platformJobId !== '').length,
    withCompany: jobs.filter((job) => job.company !== '').length,
    withCity: jobs.filter((job) => job.city !== undefined && job.city !== '').length,
    withDate: jobs.filter((job) => job.publishedAt !== undefined && job.publishedAt !== '').length,
    withSalary: jobs.filter((job) => job.salaryRaw !== '').length,
    sample: n > 0 ? { title: jobs[0]?.title ?? '', company: jobs[0]?.company ?? '' } : null,
  }
}

async function main(): Promise<void> {
  log(`搜索页：${SEARCH_URL}`)
  log(`登录页：${LOGIN_URL} · profile：${PROFILE} · 等待上限 ${String(Math.round(WAIT_TIMEOUT_MS / 60_000))} 分钟`)

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

  // ── 1. 搜索页扫"当前侧"锚点（首次运行 = 未登录侧；两侧必须同一页型才可比） ──
  let before: ReturnType<typeof scanMarkers> | null = null
  let beforeLoggedIn = false
  try {
    log('打开搜索页扫「当前侧」锚点…')
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(8_000)
  } catch (error) {
    log(`搜索页导航失败（authwall/风控也可能是原因）：${error instanceof Error ? error.message : String(error)}`)
  }
  before = await page.evaluate(scanMarkers, { candidates: [...ME_MARKERS, ...ANON_MARKERS] }).catch(() => null)
  beforeLoggedIn =
    (before?.hits.some((hit) => ME_MARKERS.includes(hit.selector) && hit.count > 0) ?? false) ||
    page.url().includes('/feed/')
  log(
    `当前侧（${beforeLoggedIn ? '看起来已登录 —— profile 里已有登录态' : '未登录'}）：` +
      `${(before?.hits ?? []).map((hit) => `${hit.selector}=${String(hit.count)}`).join(' ') || '(一个候选都没命中)'}`,
  )

  // ── 2. 登录等待（手动在窗口里完成；checkpoint 挑战/邮箱验证码都算登录流程的一部分） ──
  if (beforeLoggedIn) {
    log('✔ 已带登录态 —— 跳过登录引导，直接做已登录侧采集')
  } else {
    log(`导航到登录页…（请在窗口里手动登录）`)
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    } catch (error) {
      log(`登录页导航失败：${error instanceof Error ? error.message : String(error)}`)
    }
    await page.waitForTimeout(5_000)
    log(`当前地址：${page.url().slice(0, 140)}`)

    let sawLoginMarker = false
    const deadline = Date.now() + WAIT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const url = page.url()
      const state = await page
        .evaluate(
          (selector: string) => {
            try {
              return { loggedIn: document.querySelector(selector) !== null }
            } catch {
              return { loggedIn: false }
            }
          },
          LOGIN_PRESENCE_PROBE,
        )
        .catch(() => ({ loggedIn: false }))
      // 第二信号：登录成功后 LinkedIn 会跳 /feed/（未登录访问 feed 会被弹回 authwall，不会误判）。
      if (state.loggedIn || url.includes('/feed/')) {
        sawLoginMarker = true
        log(`✔ 看到登录标记${url.includes('/feed/') ? '（已落到 /feed/）' : ''} —— 认为已登录`)
        break
      }
      const remainSec = Math.round((deadline - Date.now()) / 1000)
      const hint = /checkpoint|challenge/i.test(url)
        ? '⛔ 安全验证页 —— 请在窗口里完成验证（LinkedIn 登录常见，不算失败）'
        : /\/login|\/uas\//.test(url)
          ? '⏳ 登录页 —— 请在窗口里登录（账密 / 邮箱验证码 / 二步验证）'
          : url.includes('/authwall')
            ? '⏳ authwall —— 登录完成后会自动跳走'
            : '⏳ 等登录标记出现'
      log(`${hint} · 还剩 ${String(remainSec)}s · ${url.slice(0, 90)}`)
      await page.waitForTimeout(POLL_MS)
    }
    if (!sawLoginMarker) {
      log(`⚠️ 等满 ${String(Math.round(WAIT_TIMEOUT_MS / 60_000))} 分钟仍未登录 ⇒ 不写任何"已登录"产物（宁可缺证据，也不写假证据）`)
      await context.close()
      process.exitCode = 1
      return
    }
  }

  // ── 3. 已登录侧采集：回搜索页 → 锚点 + 快照 + 解析读数 + guest 端点 ──────────
  log(`回搜索页做已登录侧采集…`)
  try {
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForTimeout(8_000)
  } catch (error) {
    log(`搜索页导航失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const after = await page.evaluate(scanMarkers, { candidates: [...ME_MARKERS, ...ANON_MARKERS] }).catch(() => null)
  const searchHtml = await page.content()
  const cardReading: Awaited<ReturnType<typeof readCards>> | { error: string } = await readCards(page).catch(
    (error: unknown): { error: string } => ({ error: error instanceof Error ? error.message : String(error) }),
  )

  // 登录态 guest 端点：带默认 credentials（与适配器的 omit 对照，行为差异记进报告）。
  const guestUrl = buildLinkedInGuestApiUrl(DEFAULT_LINKEDIN_CONFIG, CRITERIA)
  const guestLogged = await page
    .evaluate(
      async (url: string) => {
        try {
          const response = await fetch(url, { headers: { accept: 'text/html' } })
          const html = await response.text()
          return { ok: response.ok, status: response.status, finalUrl: response.url, html }
        } catch (error) {
          return { ok: false, status: 0, finalUrl: '', html: error instanceof Error ? error.message : String(error) }
        }
      },
      guestUrl,
    )
    .catch(() => null)

  // ── 4. 落盘 ────────────────────────────────────────────────────────────
  mkdirSync(CAPTURE_DIR, { recursive: true })
  const searchPath = join(CAPTURE_DIR, `search-logged-${TODAY}.html`)
  writeFileSync(searchPath, searchHtml, 'utf8')
  log(`登录态搜索页快照已保存：${searchPath}（${String(searchHtml.length)} 字符）`)
  if (guestLogged !== null) {
    const guestPath = join(CAPTURE_DIR, `guest-logged-${TODAY}.html`)
    writeFileSync(guestPath, guestLogged.html, 'utf8')
    log(`登录态 guest 片段已保存：${guestPath}（status=${String(guestLogged.status)}）`)
  }

  const report = {
    updatedAt: new Date().toISOString(),
    searchUrl: SEARCH_URL,
    before: { ...before, loggedIn: beforeLoggedIn },
    after,
    candidateGroups: { loggedInSide: ME_MARKERS, anonymousSide: ANON_MARKERS },
    authwallOnLoggedSearch:
      page.url().includes('/authwall') ? true : page.url().includes('/jobs/search') ? false : `落点异常：${page.url()}`,
    cardReading,
    guestLoggedEndpoint: guestLogged === null ? null : { status: guestLogged.status, finalUrl: guestLogged.finalUrl, length: guestLogged.html.length },
    nextStep:
      '从 candidateGroups 里挑「before（未登录）恒 0、after（已登录）≥1」的 me 侧选择器写进适配器的 auth.isLoggedIn；' +
      '两份 HTML 快照可复制为 test/fixtures/ 夹具后把用例换成真实样本。',
  }
  const reportPath = join(CAPTURE_DIR, `auth-side-by-side-${TODAY}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  log(`两侧锚点对比报告已保存：${reportPath}`)
  log(
    `已登录侧锚点：${(after?.hits ?? []).map((hit) => `${hit.selector}=${String(hit.count)}`).join(' ') || '(一个候选都没命中 —— global-nav 结构可能已改版，报告里看 samples 再定新候选)'}`,
  )
  if ('total' in cardReading) {
    log(
      `登录态搜索页解析（适配器 DOM 通道）：${String(cardReading.total)} 条 · id ${String(cardReading.withId)}/${String(cardReading.total)} · ` +
        `公司 ${String(cardReading.withCompany)}/${String(cardReading.total)} · 地点 ${String(cardReading.withCity)}/${String(cardReading.total)} · ` +
        `日期 ${String(cardReading.withDate)}/${String(cardReading.total)} · 薪资 ${String(cardReading.withSalary)}/${String(cardReading.total)}`,
    )
  }

  log('✔ 探针完成（只读取证：未发消息、未投递、未点任何岗位动作）。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
