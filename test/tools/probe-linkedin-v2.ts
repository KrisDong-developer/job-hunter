#!/usr/bin/env node
/**
 * LinkedIn 深度探针 v2 —— 把适配器当前「已知缺口」逐条变成真机读数。
 *
 * ## 它要回答的问题（对照 zhipin 的调研深度，2026-09-21 立项）
 *
 *   1. **翻页契约**：guest 端点 start=0/10/20 三页的 id 集合是否零重叠、每页是否稳定
 *      10 条 —— `hasNextPage` 满页判据的依据（当前 pageSize=10 来自单页实测，步进未验证）；
 *   2. **筛选参数生效性**：f_TPR（24h 窗）/ f_E（经验）/ f_WT（远程）/ f_AL（Easy Apply）/
 *      sortBy=DD（最新优先）—— 参数被接受（200 + 有卡）为底线，生效性用 id 集合差异 +
 *      datetime 分布如实记录（卡片上没有经验/远程字段，不硬判）；
 *   3. **详情两条路**（用翻页拿到的真实 id）：
 *      a. 详情页 `/jobs/view/{id}`（适配器 `detail.extract` 的导航目标）：落点是否
 *         authwall、JD 候选选择器命中数（`.show-more-less-text` 一族）；
 *      b. guest 详情端点 `/jobs-guest/jobs/api/jobPosting/{id}`：匿名可读性、片段结构、
 *         有无薪资明文（列表卡片 0/10 —— 薪资的唯一希望在这）；
 *   4. **匿名侧**（全新无 cookie context）：guest 列表匿名条数（对照登录态的 10 ——
 *      pageSize 到底跟什么走）、搜索页直接访问的落点（authwall 判据校准）。
 *
 * ## 频率纪律
 *
 *   LinkedIn 风控业内最强一档（999 / authwall / checkpoint）：每次请求间**强制 4s 停顿**，
 *   全程约 15 个请求 —— 一次跑完就停，绝不连打（§P5）。
 *
 * ## 用法
 *
 *   npm run probe:linkedin-v2
 *   $env:LINKEDIN_KEY='Software Engineer'; $env:LINKEDIN_CITY='China'
 *
 * ## 产物（`.probe-linkedin-capture/`，已 gitignore）
 *
 *   v2-report-<日期>.json        全部读数 + PASS/FAIL 汇总（分析的正身）
 *   v2-guest-p0/p1/p2-*.html     登录态 guest 翻页三片段
 *   v2-detail-page-*.html        详情页整页快照
 *   v2-detail-api-*.html         guest 详情端点片段
 *   v2-anon-search-*.html        匿名搜索页落点快照
 *   v2-anon-guest-*.html         匿名 guest 列表片段
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { DEFAULT_LINKEDIN_CONFIG, LINKEDIN_SALARY_PATTERN } from '../../src/host/platform/adapters/linkedin/config.js'

const KEYWORD = process.env['LINKEDIN_KEY'] ?? 'Software Engineer'
const CITY = process.env['LINKEDIN_CITY'] ?? 'China'
/**
 * 独立 profile：v2 探针不依赖登录态（guest 端点本来就是匿名面），用自己的 profile
 * 还能避免与 `probe:linkedin-login` 的窗口抢同一个 user-data-dir
 * （同 profile 二次启动会被「已在现有的浏览器会话中打开」秒退 —— 本探针踩过）。
 */
const PROFILE = process.env['LINKEDIN_PROFILE'] ?? join(process.cwd(), '.probe-linkedin-v2-profile')
const CAPTURE_DIR = process.env['LINKEDIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-linkedin-capture')
const TODAY = new Date().toISOString().slice(0, 10)
/** 请求间停顿：LinkedIn 风控纪律（别调小）。 */
const GAP_MS = 4_000
const HOST = DEFAULT_LINKEDIN_CONFIG.host

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-linkedin-v2] ${new Date().toISOString()} ${message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * ⚠️ 2026-09-20 本探针的两次真机教训（离线 jsdom 测不出 —— 没有 CSP）：
 * LinkedIn 的 CSP 启用 **Trusted Types**，页面上下文里 `el.innerHTML = 字符串` 与
 * `DOMParser.parseFromString` **都会**抛「requires TrustedHTML」。
 * ⇒ 任何「fetch 回 HTML 字符串再解析」的路线在真实页面上是死路；
 * 唯一可行形态是**顶层导航**到 guest 端点（浏览器自己渲染片段成文档，再解析活 DOM）。
 * 适配器已按此结论重构（见 `adapters/linkedin/index.ts` 的 v2 调研记录）。
 */

/** 详情结构候选选择器扫描（自包含）：给 detail.extract 的实现提供真机命中证据。 */
const scanDetailMarkers = (arg: { candidates: string[] }): Array<{ selector: string; count: number; sample: string }> => {
  const out: Array<{ selector: string; count: number; sample: string }> = []
  for (const selector of arg.candidates) {
    let nodes: Element[] = []
    try {
      nodes = Array.from(document.querySelectorAll(selector))
    } catch {
      nodes = []
    }
    if (nodes.length === 0) continue
    const first = (nodes[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()
    out.push({ selector, count: nodes.length, sample: first.slice(0, 60) })
  }
  return out
}

/** 详情页/详情片段的 JD 候选（LinkedIn job view 多年稳定的一族，逐个数命中）。 */
const DETAIL_MARKER_CANDIDATES = [
  '.show-more-less-text',
  '.description__text--rich',
  '.jobs-description__content',
  '.jobs-box__html-content',
  'h2.top-card-layout__title',
  'h1.topcard__title',
  '.topcard__org-url-link',
  '.top-card-layout__second-subline a',
  '.description__job-criteria-list',
  '.job-criteria__list',
  '.posted-signaling-container',
]

/** 在页面上下文里读**当前文档**（导航到 guest 端点后，片段已被浏览器渲染成文档）。 */
const readLiveDocument = (): { cards: number; ids: string[]; datetimes: string[]; salaryHits: number } => {
  const cards = Array.from(document.querySelectorAll('div.base-card'))
  const ids: string[] = []
  const datetimes: string[] = []
  let salaryHits = 0
  for (const card of cards) {
    const urn = card.getAttribute('data-entity-urn') ?? ''
    const m = /urn:li:jobPosting:(\d+)/.exec(urn)
    if (m !== null) ids.push(m[1] ?? '')
    const timeEl = card.querySelector('time[class*="listdate"]')
    const dt = timeEl?.getAttribute('datetime') ?? ''
    if (dt !== '') datetimes.push(dt)
    if (card.querySelector('.job-search-card-salary-info') !== null) salaryHits += 1
  }
  return { cards: cards.length, ids, datetimes, salaryHits }
}

interface GuestReading {
  label: string
  status: number
  cards: number
  ids: string[]
  datetimes: string[]
  salaryHits: number
  finalUrl: string
  html: string
}

/**
 * 采一页 guest 列表：**直接导航到 guest 端点**（不是页面内 fetch + 注入解析）。
 *
 * 为什么导航而不是 fetch：LinkedIn 的 CSP 启用 Trusted Types，真实页面上
 * `innerHTML` 与 `DOMParser.parseFromString` 都会抛「requires TrustedHTML」
 * （本探针前两跑各炸一次，jsdom 离线测试测不出 —— 没有 CSP）。**顶层导航**把片段
 * 交给浏览器自己渲染成文档，再解析活 DOM —— 不经过任何注入 sink。
 * 这也正是适配器 guest 通道该走的形态（v2 调研的结论）。
 */
async function probeGuest(page: Page, label: string, params: string): Promise<GuestReading> {
  const url = `https://${HOST}/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(KEYWORD)}&location=${encodeURIComponent(CITY)}${params}`
  let status = 0
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    status = response?.status() ?? 0
  } catch (error) {
    log(`guest[${label}] 导航失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(1_200)
  const reading = await page.evaluate(readLiveDocument).catch(() => ({ cards: 0, ids: [], datetimes: [], salaryHits: 0 }))
  const html = await page.content()
  const out: GuestReading = {
    label,
    status,
    cards: reading.cards,
    ids: reading.ids,
    datetimes: reading.datetimes,
    salaryHits: reading.salaryHits,
    finalUrl: page.url(),
    html,
  }
  INFO.push(
    `guest[${label}]：status=${String(out.status)} · 条数=${String(out.cards)} · 薪资卡=${String(out.salaryHits)} · ` +
      `datetime 样本=${out.datetimes.slice(0, 3).join(',') || '(无)'}`,
  )
  return out
}

/** 活动浏览器上下文：崩溃路径也要关掉，否则留下孤儿 Chrome 占住 profile（本探针踩过）。 */
let activeContext: BrowserContext | undefined

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 地点：${CITY} · profile：${PROFILE}`)

  const executablePath = discoverExecutable(candidateExecutables())
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath === undefined ? {} : { executablePath }),
  })
  activeContext = context
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
  const page: Page = await context.newPage()

  // 拿同源页面（任何 linkedin.com 页都行；直接开 jobs 首页）
  await page.goto(`https://${HOST}/jobs/`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
  await page.waitForTimeout(6_000)
  const loggedIn = await page
    .evaluate(
      (selector: string) => {
        try {
          return document.querySelector(selector) !== null
        } catch {
          return false
        }
      },
      DEFAULT_LINKEDIN_CONFIG.loggedInSelector,
    )
    .catch(() => false)
  log(`登录态：${loggedIn ? '已登录（复用 profile）' : '⚠️ 未登录 —— 登录侧读数照采，但记为未登录态'}`)

  // ── ① 翻页契约：start=0 / 10 / 20 ─────────────────────────────────────
  log('① 翻页契约（start=0/10/20，每步间隔 4s）…')
  const p0 = await probeGuest(page, 'start=0', '&start=0')
  await sleep(GAP_MS)
  const p1 = await probeGuest(page, 'start=10', '&start=10')
  await sleep(GAP_MS)
  const p2 = await probeGuest(page, 'start=20', '&start=20')
  await sleep(GAP_MS)

  mkdirSync(CAPTURE_DIR, { recursive: true })
  // 翻页片段落盘（三页各自的原始证据）
  const fragmentNames: Array<[string, GuestReading]> = [
    ['v2-guest-p0', p0],
    ['v2-guest-p1', p1],
    ['v2-guest-p2', p2],
  ]
  for (const [name, reading] of fragmentNames) {
    writeFileSync(join(CAPTURE_DIR, `${name}-${TODAY}.html`), reading.html, 'utf8')
  }

  const overlap01 = p0.ids.filter((id) => p1.ids.includes(id))
  const overlap12 = p1.ids.filter((id) => p2.ids.includes(id))
  const allCounts = [p0.cards, p1.cards, p2.cards]
  check('翻页：三页均 200 且有卡片', allCounts.every((n) => n > 0) && [p0, p1, p2].every((r) => r.status === 200), allCounts.join('/'))
  check('翻页：页间零重叠（start 步进有效）', overlap01.length === 0 && overlap12.length === 0, `p0∩p1=${String(overlap01.length)} p1∩p2=${String(overlap12.length)}`)
  INFO.push(`翻页条数分布：p0=${String(p0.cards)} p1=${String(p1.cards)} p2=${String(p2.cards)}（pageSize 判据的直接证据）`)

  // ── ② 筛选参数生效性（对照 = p0） ─────────────────────────────────────
  log('② 筛选参数对照…')
  const todayMs = Date.now()
  const daysAgoMs = (days: number): number => todayMs - days * 86_400_000

  const tpr = await probeGuest(page, 'f_TPR=r86400', '&f_TPR=r86400&start=0')
  const tprDatetimes = tpr.datetimes.map((dt) => new Date(dt).getTime()).filter((n) => !Number.isNaN(n))
  check(
    '筛选 f_TPR=24h：200 有卡且日期都在 2 天内',
    tpr.status === 200 && tpr.cards > 0 && tprDatetimes.every((t) => t >= daysAgoMs(2)),
    `条数=${String(tpr.cards)}，最老=${tpr.datetimes.slice().sort()[0] ?? '?'}`,
  )
  await sleep(GAP_MS)

  const fE = await probeGuest(page, 'f_E=4', '&f_E=4&start=0')
  check('筛选 f_E=4：200 有卡', fE.status === 200 && fE.cards > 0, `条数=${String(fE.cards)}`)
  INFO.push(`f_E=4 与对照 id 差异：${String(new Set([...fE.ids, ...p0.ids]).size - p0.ids.length)} 条（>0 说明参数参与结果集）`)
  await sleep(GAP_MS)

  const fWT = await probeGuest(page, 'f_WT=2', '&f_WT=2&start=0')
  check('筛选 f_WT=2：200 有卡', fWT.status === 200 && fWT.cards > 0, `条数=${String(fWT.cards)}`)
  await sleep(GAP_MS)

  const fAL = await probeGuest(page, 'f_AL=true', '&f_AL=true&start=0')
  check('筛选 f_AL=true：200 有卡', fAL.status === 200 && fAL.cards > 0, `条数=${String(fAL.cards)}`)
  await sleep(GAP_MS)

  const sortDD = await probeGuest(page, 'sortBy=DD', '&sortBy=DD&start=0')
  const ddSorted = sortDD.datetimes.slice().sort().reverse().join(',') === sortDD.datetimes.join(',')
  check(
    'sortBy=DD：datetime 降序（最新在前）',
    sortDD.status === 200 && sortDD.cards > 0 && ddSorted,
    `序列=${sortDD.datetimes.slice(0, 3).join(',')}`,
  )
  await sleep(GAP_MS)

  // ── ③ 详情两条路（用 p0 的第一个 id） ─────────────────────────────────
  const detailId = p0.ids[0]
  if (detailId === undefined || detailId === '') {
    check('详情：翻页没拿到 id，跳过', false, 'p0 ids 为空')
  } else {
    log(`③ 详情（id=${detailId}）：先 guest 详情端点（导航式，同翻页理由）…`)
    let detailApiStatus = 0
    try {
      const response = await page.goto(`https://${HOST}/jobs-guest/jobs/api/jobPosting/${detailId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      detailApiStatus = response?.status() ?? 0
    } catch (error) {
      log(`详情端点导航失败：${error instanceof Error ? error.message : String(error)}`)
    }
    await page.waitForTimeout(1_500)
    const detailApiUrl = page.url()
    const detailApiHtml = await page.content()
    const apiMarkers = await page
      .evaluate(scanDetailMarkers, { candidates: DETAIL_MARKER_CANDIDATES })
      .catch(() => [])
    // 薪资探查：直接复用适配器自己的薪资模式（一处定义 —— 探针与解析代码不各写一份正则）
    const apiSalary = detailApiHtml.match(new RegExp(LINKEDIN_SALARY_PATTERN, 'g')) ?? []
    check(
      'guest 详情端点：打开且未被 authwall 接管',
      detailApiStatus === 200 && !detailApiUrl.includes('/authwall') && detailApiHtml.length > 500,
      `status=${String(detailApiStatus)} 落点=${detailApiUrl.slice(0, 80)}`,
    )
    check('guest 详情端点：JD 候选锚点命中', apiMarkers.length > 0, apiMarkers.map((m) => `${m.selector}=${String(m.count)}`).join(' ') || '(0)')
    INFO.push(`详情端点薪资正则命中：${String(apiSalary.length)} 处 ${apiSalary.slice(0, 3).join(' | ')}`)
    writeFileSync(join(CAPTURE_DIR, `v2-detail-api-${TODAY}.html`), detailApiHtml, 'utf8')
    await sleep(GAP_MS)

    log('③ 详情页 /jobs/view/{id}（detail.extract 的导航目标）…')
    const detailUrl = `https://${HOST}/jobs/view/${detailId}`
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(7_000)
    const finalDetailUrl = page.url()
    const detailHtml = await page.content()
    const pageMarkers = await page.evaluate(scanDetailMarkers, { candidates: DETAIL_MARKER_CANDIDATES }).catch(() => [])
    check(
      '详情页：打开且未被 authwall 接管',
      !finalDetailUrl.includes('/authwall') && !finalDetailUrl.includes('/checkpoint'),
      `落点=${finalDetailUrl.slice(0, 100)}`,
    )
    check(
      '详情页：JD 锚点命中（show-more-less-text 一族）',
      pageMarkers.some((m) => /show-more-less-text|description__text|jobs-description/.test(m.selector)),
      pageMarkers.map((m) => `${m.selector}=${String(m.count)}`).join(' ') || '(0)',
    )
    writeFileSync(join(CAPTURE_DIR, `v2-detail-page-${TODAY}.html`), detailHtml, 'utf8')
    await sleep(GAP_MS)
  }

  // ── ④ 匿名侧（全新无 cookie context） ─────────────────────────────────
  log('④ 匿名侧（全新 context，无 cookie）…')
  const browser = context.browser()
  if (browser === null) {
    check('匿名侧：拿不到 browser 句柄', false, 'launchPersistentContext 下 browser() 可能为 null')
  } else {
    const anonContext = await browser.newContext({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
    await anonContext.addInitScript({ content: STEALTH_INIT_SCRIPT })
    const anonPage = await anonContext.newPage()
    // 先开一个 linkedin 页记录「匿名访问会落在哪」（登录判据与 authwall 的旁证）
    await anonPage.goto(`https://${HOST}/jobs/`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await anonPage.waitForTimeout(6_000)
    INFO.push(`匿名 /jobs/ 落点：${anonPage.url().slice(0, 110)}`)

    // 匿名 guest 列表：导航式（同登录侧口径）
    const anonGuestUrl = `https://${HOST}/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(KEYWORD)}&location=${encodeURIComponent(CITY)}&start=0`
    let anonGuestStatus = 0
    try {
      const response = await anonPage.goto(anonGuestUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      anonGuestStatus = response?.status() ?? 0
    } catch {
      anonGuestStatus = 0
    }
    await anonPage.waitForTimeout(1_200)
    const anonReading = await anonPage
      .evaluate(readLiveDocument)
      .catch(() => ({ cards: 0, ids: [], datetimes: [], salaryHits: 0 }))
    check(
      '匿名 guest 列表：200 且有卡片（searchWithoutLogin 的真机证据）',
      anonGuestStatus === 200 && anonReading.cards > 0 && !anonPage.url().includes('/authwall'),
      `status=${String(anonGuestStatus)} 条数=${String(anonReading.cards)}（主 context 对照=${String(p0.cards)}）`,
    )
    writeFileSync(join(CAPTURE_DIR, `v2-anon-guest-${TODAY}.html`), await anonPage.content(), 'utf8')
    await anonPage.waitForTimeout(GAP_MS)

    // 匿名直接访问搜索页：authwall 判据校准
    const searchUrl = `https://${HOST}/jobs/search/?keywords=${encodeURIComponent(KEYWORD)}&location=${encodeURIComponent(CITY)}&start=0&trk=${DEFAULT_LINKEDIN_CONFIG.guestTrk}`
    await anonPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await anonPage.waitForTimeout(7_000)
    const anonSearchUrl = anonPage.url()
    const anonSearchHtml = await anonPage.content()
    const anonSearchCards = await anonPage
      .evaluate(() => document.querySelectorAll('div.base-card').length)
      .catch(() => -1)
    INFO.push(`匿名搜索页落点：${anonSearchUrl.slice(0, 110)} · 卡片=${String(anonSearchCards)}`)
    check(
      '匿名搜索页：authwall 判据与 wallKindInPage 口径一致（authwall 或 SSR 卡片，二选一）',
      anonSearchUrl.includes('/authwall') || anonSearchCards > 0,
      `落点=${anonSearchUrl.includes('/authwall') ? 'authwall' : anonSearchUrl.slice(0, 80)}`,
    )
    writeFileSync(join(CAPTURE_DIR, `v2-anon-search-${TODAY}.html`), anonSearchHtml, 'utf8')
    await anonContext.close()
  }

  // ── 报告 ──────────────────────────────────────────────────────────────
  const report = {
    updatedAt: new Date().toISOString(),
    criteria: { keyword: KEYWORD, city: CITY },
    loggedIn,
    pagination: {
      counts: [p0.cards, p1.cards, p2.cards],
      overlap01: overlap01.length,
      overlap12: overlap12.length,
      idsP0: p0.ids,
      idsP1: p1.ids,
      idsP2: p2.ids,
    },
    filters: {
      f_TPR_r86400: { cards: tpr.cards, datetimes: tpr.datetimes },
      f_E_4: { cards: fE.cards, newIdsVsControl: new Set([...fE.ids, ...p0.ids]).size - p0.ids.length },
      f_WT_2: { cards: fWT.cards },
      f_AL_true: { cards: fAL.cards },
      sortBy_DD: { cards: sortDD.cards, datetimes: sortDD.datetimes },
    },
    anon: { guestCards: '(见上方 check 记录)' },
    pass: PASS,
    fail: FAIL,
    info: INFO,
  }
  writeFileSync(join(CAPTURE_DIR, `v2-report-${TODAY}.json`), JSON.stringify(report, null, 2), 'utf8')
  log(`报告已保存：${join(CAPTURE_DIR, `v2-report-${TODAY}.json`)}`)

  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${String(PASS.length)} · FAIL ${String(FAIL.length)}`)
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  console.log('\n-- PASS --')
  for (const item of PASS) console.log(`  ✓ ${item}`)
  console.log('\n-- FAIL（需要改适配器/文档） --')
  for (const item of FAIL) console.log(`  ✗ ${item}`)

  await context.close()
  activeContext = undefined
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch(async (error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  // 崩溃路径也要关浏览器 —— 否则孤儿 Chrome 占住 profile，下次启动秒退（本探针踩过）
  await activeContext?.close().catch(() => undefined)
  process.exitCode = 1
})
