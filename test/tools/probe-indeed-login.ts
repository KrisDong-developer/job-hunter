#!/usr/bin/env node
/**
 * Indeed（cn.indeed.com）「登录态」探针 —— 同一搜索页上采**未登录侧 vs 已登录侧**对比证据。
 *
 * ## 背景：一份需要当场复核的矛盾证词
 *
 * 适配器（`adapters/indeed/index.ts` 文件头，2026-09-18）记录：cn.indeed.com 已停运，
 * 请求被 302 送到 www.indeed.com 并撞 Cloudflare 墙 —— 因此 `fieldCompleteness='low'`、
 * `antiBot='high'`、判墙 `skipLoginWall=true`（Indeed 用 Cloudflare 而非登录墙）。
 *
 * 但 2026-09-21 用户提供了一条**真实可用**的搜索地址（广州市，q 为空）：
 *   https://cn.indeed.com/jobs?q=&l=广州市&from=searchOnHP,whereautocomplete&vjk=6544fa41aeb898dc
 * —— 与「停运」结论矛盾。按 ADAPTERS.md §6 铁律（不编、以真实页面为准），这份证词必须
 * 用当天的真实浏览器跑一遍来裁决，而不是直接改文档了事。
 *
 * ── 首跑实测（2026-09-21，证据在 .probe-indeed-capture/）────────────────
 *
 *   * `cn.indeed.com/jobs?…` 返回 **200 未死**，但浏览器最终被送到
 *     `https://secure.indeed.com/auth?hl=zh_CN&co=CN&continue=<原搜索地址>` 的**登录墙**
 *     （标题「登录 | Indeed 账户」，页面内嵌载荷 `"isLoggedIn":false`）——
 *     与适配器文件头「302 → www 站 + Cloudflare 墙」的记录**形态不同**：是搜索强制登录；
 *   * Indeed 给**未登录**访客也发 `INDEED_CSRF_TOKEN` / `JSESSIONID` / `preExtAuthParams`
 *     这类名字 —— cookie 名启发式（token/session/auth…）对 Indeed **没有区分度**，
 *     第一版就是被它误判「已带登录态」而跳过了登录等待。登录判定改为只认：
 *     ① 页面载荷权威标记 `"isLoggedIn":true`（zhaopin 探针的 payload.isLogged 同款）；
 *     ② 已登录侧强 DOM 标记。cookie 名单仍照记（只名不值），仅供人工复核。
 *
 * ## 它要补的三个证据缺口
 *
 *   1. **cn.indeed.com 今天到底能不能出数**：跳转链（逐跳 status/Location，地址级事实）、
 *      判墙读数（适配器自己的 `detectBlockWithSignals`）、卡片解析读数（适配器自己的
 *      `extractJobsInPage`）—— 未登录侧先跑一遍；
 *   2. **登录契约**：Indeed 适配器至今没有任何 auth 判据（`skipLoginWall=true`）。本探针在
 *      **同一页型（搜索页）**上扫登录标记候选，两侧各扫一遍（LinkedIn 登录探针同款）——
 *      挑「一侧恒 0、另一侧 ≥1」的判据，就是将来 `auth.isLoggedIn` 的校准依据；
 *      外加 cookie 名单（**只记名不记值**，guopin 探针同款）；
 *   3. **登录态下解析读数变化**：登录后条数 / jobKey 命中率 / `hasNextPage` / 判墙是否
 *      不同 —— 两侧各跑一遍，回答「登录对这个适配器有没有用」。
 *
 * ## 流程（本仓登录等待套路 + D-17a 三件套）
 *
 *   1. patchright 启动式 + 系统 Chrome + stealth 注入，持久化 profile（登录一次，后续复用）；
 *   2. 打开用户给的真实搜索页，采**未登录侧**：标记扫描 + HTML 快照 + 解析读数 + 跳转链；
 *      若 profile 已带登录态（重跑场景）则如实标注，直接当已登录侧采集；
 *   3. **发现**登录入口（从页面里找 href 含 account.indeed.com / login 的链接 —— 发现而非
 *      猜测 URL；找不到就请人在窗口里自己点），**窗口留给人**完成登录 / 验证码 / 二步验证；
 *      轮询 context 级 cookie（auth 类名字启发式）∨ 已登录侧强标记；
 *   4. 登录就位 → 回**同一条**搜索地址采**已登录侧**，同款采集；
 *   5. 落盘 `.probe-indeed-capture/`（`.probe*` 已 gitignore，**不写 test/fixtures/** ——
 *      那里的夹具被用例硬编码钉住，静默替换只会让测试红在与本次校准无关的地方）：
 *      - `indeed-search-anon-<日期>.html`     未登录侧快照
 *      - `indeed-search-logged-<日期>.html`   已登录侧快照
 *      - `indeed-login-report-<日期>.json`    两侧对比报告（判据 / cookie 名单 / 跳转链 /
 *        解析读数 / 接口采样 / 供人复核的结论建议）
 *
 * ⚠️ **只读取证**：不点任何岗位动作、不投递、不发消息 —— Indeed 侧没有任何已验证的
 *    actions 契约，登录态调研第一步只看不动（与 LinkedIn 登录探针同边界）。
 * ⚠️ 接口采样**刻意排除 account.* / secure.* 域**：登录 POST 带凭据，绝不能落进仓库。
 *
 * ## 用法
 *
 *   npm run probe:indeed-login
 *   $env:INDEED_LOGIN_MIN='20'                        # 登录等待上限（分钟，默认 12）
 *   $env:INDEED_URL='https://cn.indeed.com/jobs?...'  # 换一条搜索地址（默认 = 用户给的证据 URL）
 *   $env:INDEED_KEY='Java'; $env:INDEED_CITY='广州'    # 或按关键词/地点构造（覆盖默认 URL）
 *   $env:INDEED_PROFILE / INDEED_CAPTURE_DIR           # profile 与产物目录
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点，
 *    Cloudflare 在，别连打（§P5 保守优先）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { DEFAULT_INDEED_CONFIG, INDEED_BLOCK_SIGNALS, indeedBlockFlags } from '../../src/host/platform/adapters/indeed/config.js'
import type { IndeedConfig } from '../../src/host/platform/adapters/indeed/config.js'
import { extractJobsInPage, hasNextPageInPage } from '../../src/host/platform/adapters/indeed/page.js'
import { buildIndeedSearchUrl } from '../../src/host/platform/adapters/indeed/urls.js'
import { detectBlockWithSignals, signalsOf } from '../../src/host/platform/block-signals.js'
import type { RawJob } from '../../src/host/platform/types.js'

/** 用户 2026-09-21 提供的证据 URL（原样保留，不重排参数 —— 证据要保真）。 */
const USER_EVIDENCE_URL =
  'https://cn.indeed.com/jobs?q=&l=%E5%B9%BF%E5%B7%9E%E5%B8%82&from=searchOnHP%2Cwhereautocomplete&vjk=6544fa41aeb898dc'

const HOST = process.env['INDEED_HOST'] ?? DEFAULT_INDEED_CONFIG.host
const CONFIG: IndeedConfig = { ...DEFAULT_INDEED_CONFIG, host: HOST }
const KEYWORD = process.env['INDEED_KEY'] ?? ''
const CITY = process.env['INDEED_CITY'] ?? ''
/** 搜索地址：显式 URL > 关键词/地点构造 > 用户证据 URL。 */
const SEARCH_URL =
  process.env['INDEED_URL'] !== undefined && process.env['INDEED_URL'] !== ''
    ? process.env['INDEED_URL']
    : KEYWORD !== '' || CITY !== ''
      ? buildIndeedSearchUrl(CONFIG, { keyword: KEYWORD, city: CITY, page: 1 })
      : USER_EVIDENCE_URL

/** 独立 profile：只给 Indeed 登录态调研复用（probe:indeed 是纯 fetch 探针，无 profile）。 */
const PROFILE = process.env['INDEED_PROFILE'] ?? join(process.cwd(), '.probe-indeed-profile')
/** 产物落点：与 probe:indeed 共用目录（都被 .gitignore 的 .probe* 覆盖）。 */
const CAPTURE_DIR = process.env['INDEED_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-indeed-capture')
const TODAY = new Date().toISOString().slice(0, 10)
const LOGIN_WAIT_MS = Math.max(1, Number(process.env['INDEED_LOGIN_MIN'] ?? '12')) * 60_000
const POLL_MS = 3_000
/** 单份 HTML 落盘上限（真实整页可能 2–3 MB，超了截断）。 */
const MAX_HTML_CHARS = 6_000_000
const MAX_NETWORK = 200
const MAX_REDIRECTS = 60

/**
 * cookie 名分类（**仅供报告分组展示，不参与登录判定**）。
 * ⚠️ 首跑实测：Indeed 给未登录访客也发 `INDEED_CSRF_TOKEN` / `JSESSIONID` /
 * `preExtAuthParams` —— 这类名字带 token/session/auth 却是匿名的，启发式没有区分度。
 */
const AUTH_COOKIE_RE = /(token|session|user|auth|jwt|sso|login|ssid)/i

/**
 * 已登录侧标记候选 —— **全部是待验证假设**（Indeed 页头社区称 gnav，但具体锚点没有
 * 本仓可信夹具），靠两侧对比裁决；`testids[]` 会把页面上全部 data-testid 值带回，
 * 离线挑判据时以它为准，不以这里的猜测为准。
 */
const LOGGED_MARKERS = [
  '#gnav-user-menu',
  '[data-testid*="user-menu"]',
  '[data-testid="account-menu"]',
  '[class*="userMenu"]',
  'img[data-testid="avatar"]',
]
const LOGGED_TEXT = ['退出登录', '我的职位', 'My jobs', '消息中心', 'Notification']
/** 未登录侧候选：登录/注册入口（Indeed 未登录也会渲染 gnav，所以两侧都要扫才分得开）。 */
const ANON_MARKERS = [
  '[data-testid="login-button"]',
  '[class*="signin"]',
  '[class*="sign-in"]',
  'a[href*="account.indeed.com"]',
  'a[href*="/login"]',
]
const ANON_TEXT = ['登录', 'Sign in', '注册', '创建账户']

/**
 * 登录等待循环只认**强标记**（弱文案如「我的职位」未登录侧也可能渲染，进去当已登录
 * 就是写假证据 —— LinkedIn 登录探针同款教训）。cookie 启发式与之取或。
 */
const STRONG_LOGGED_SELECTORS = ['#gnav-user-menu', '[data-testid*="user-menu"]']
const STRONG_LOGGED_TEXT = ['退出登录', 'Sign out']

function log(message: string): void {
  console.log(`[probe-indeed-login] ${new Date().toISOString()} ${message}`)
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/* ── 页面上下文探针（自包含：必须能被序列化送进浏览器） ─────────────── */

interface MarkerHit {
  selector: string
  count: number
  samples: Array<{ tag: string; cls: string; testid: string | null }>
}

interface PageScan {
  url: string
  title: string
  bodyTextLength: number
  textHead: string
  loggedHits: MarkerHit[]
  anonHits: MarkerHit[]
  loggedTextHits: string[]
  anonTextHits: string[]
  /** 页面上全部 data-testid 值（聚合、前 80 个）—— Indeed 重度使用 data-testid，这是锚点校准的第一手证据。 */
  testids: Array<{ id: string; count: number }>
  /** 登录入口候选（发现而非猜测）：href 或文案像登录链接的锚点。 */
  loginLinkCandidates: Array<{ href: string; text: string }>
}

/** 两侧标记扫描 + data-testid 聚合 + 登录入口发现（自包含）。 */
const scanPage = (arg: {
  loggedSelectors: string[]
  anonSelectors: string[]
  loggedText: string[]
  anonText: string[]
}): PageScan => {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const visible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return false
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }

  const scanSelectors = (selectors: string[]): MarkerHit[] => {
    const hits: MarkerHit[] = []
    for (const selector of selectors) {
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
        samples: nodes.slice(0, 3).map((el) => ({
          tag: el.tagName.toLowerCase(),
          cls: clean(el.getAttribute('class')).slice(0, 120),
          testid: el.getAttribute('data-testid'),
        })),
      })
    }
    return hits
  }

  const scanText = (words: string[]): string[] => {
    const hit: string[] = []
    let candidates: Element[] = []
    try {
      candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'))
    } catch {
      candidates = []
    }
    for (const word of words) {
      const found = candidates.some((el) => {
        if (!visible(el)) return false
        const text = clean(el.textContent)
        return text !== '' && text.length <= 30 && text.includes(word)
      })
      if (found) hit.push(word)
    }
    return hit
  }

  const testidCounts = new Map<string, number>()
  try {
    for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
      const id = el.getAttribute('data-testid') ?? ''
      if (id === '') continue
      testidCounts.set(id, (testidCounts.get(id) ?? 0) + 1)
    }
  } catch {
    /* ignore */
  }
  const testids = Array.from(testidCounts.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 80)

  const loginLinkCandidates: Array<{ href: string; text: string }> = []
  try {
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') ?? ''
      if (href === '' || href.startsWith('javascript') || href === '#') continue
      if (!visible(a)) continue
      const text = clean(a.textContent).slice(0, 60)
      const hrefLikeLogin = /account\.indeed\.com|\/login|\/access|signin/i.test(href)
      const textLikeLogin = /登录|登入|Sign in/i.test(text)
      if (!hrefLikeLogin && !textLikeLogin) continue
      let absolute = ''
      try {
        absolute = new URL(href, location.origin).href
      } catch {
        absolute = ''
      }
      if (absolute === '') continue
      if (!loginLinkCandidates.some((item) => item.href === absolute)) {
        loginLinkCandidates.push({ href: absolute, text })
      }
      if (loginLinkCandidates.length >= 10) break
    }
  } catch {
    /* ignore */
  }

  return {
    url: location.href,
    title: document.title,
    bodyTextLength: clean(document.body?.textContent).length,
    textHead: clean(document.body?.textContent).slice(0, 400),
    loggedHits: scanSelectors(arg.loggedSelectors),
    anonHits: scanSelectors(arg.anonSelectors),
    loggedTextHits: scanText(arg.loggedText),
    anonTextHits: scanText(arg.anonText),
    testids,
    loginLinkCandidates,
  }
}

/** 登录等待循环的强标记探针（自包含）。 */
const strongLoggedProbe = (arg: { selectors: string[]; text: string[] }): { hits: string[] } => {
  const hits: string[] = []
  for (const selector of arg.selectors) {
    try {
      if (document.querySelector(selector) !== null) hits.push(`dom:${selector}`)
    } catch {
      /* 选择器非法 → 跳过 */
    }
  }
  const body = (document.body?.textContent ?? '').replace(/\s+/g, ' ')
  for (const word of arg.text) {
    if (body.includes(word)) hits.push(`text:${word}`)
  }
  return { hits }
}

/**
 * 页面载荷登录态探针（自包含）—— Indeed 的**权威**登录标记。
 * 首跑实测：登录页（secure.indeed.com/auth）内嵌 JSON 自带 `"isLoggedIn":false`；
 * 已登录页面应带 `true`。present=false 表示该页没有这个标记（不作数，回落强标记）。
 */
const isLoggedInPayloadProbe = (): { present: boolean; loggedIn: boolean } => {
  try {
    const text = document.body?.textContent ?? ''
    const match = /"isLoggedIn"\s*:\s*(true|false)/.exec(text)
    if (match === null) return { present: false, loggedIn: false }
    return { present: true, loggedIn: match[1] === 'true' }
  } catch {
    return { present: false, loggedIn: false }
  }
}

/* ── 宿主侧 ─────────────────────────────────────────────────────────── */

interface Reading {
  total: number
  withKey: number
  withTitle: number
  withCompany: number
  withCity: number
  withSalary: number
  hasNext: boolean
  block: string | null
  sample: { title: string; company: string; city: string; salaryRaw: string; sourceUrl: string } | null
}

/** 用**适配器自己的解析函数**在真页上跑读数（与 npm test 走同一条解析代码）。 */
async function readWithAdapter(page: Page): Promise<Reading> {
  const empty: Reading = {
    total: 0,
    withKey: 0,
    withTitle: 0,
    withCompany: 0,
    withCity: 0,
    withSalary: 0,
    hasNext: false,
    block: null,
    sample: null,
  }
  let jobs: RawJob[] = []
  try {
    jobs = await page.evaluate(extractJobsInPage, {
      selectors: CONFIG.selectors,
      host: CONFIG.host,
      jobKeyPattern: CONFIG.jobKeyPattern,
      salaryPattern: CONFIG.salaryPattern,
    })
  } catch {
    return empty
  }
  let block: string | null = null
  try {
    const kind = await page.evaluate(detectBlockWithSignals, {
      signals: signalsOf(INDEED_BLOCK_SIGNALS),
      card: CONFIG.selectors.titleLink,
      flags: indeedBlockFlags(CONFIG.host),
    })
    block = kind === null ? null : String(kind)
  } catch {
    block = 'evaluate-error'
  }
  let hasNext = false
  try {
    hasNext = await page.evaluate(hasNextPageInPage, {
      pagination: CONFIG.selectors.pagination,
      nextPage: CONFIG.selectors.nextPage,
      disabledAttr: CONFIG.selectors.nextPageDisabledAttr,
    })
  } catch {
    hasNext = false
  }
  const sample = jobs[0]
  return {
    total: jobs.length,
    withKey: jobs.filter((job) => job.platformJobId !== '').length,
    withTitle: jobs.filter((job) => job.title !== '').length,
    withCompany: jobs.filter((job) => job.company !== '').length,
    withCity: jobs.filter((job) => job.city !== undefined && job.city !== '').length,
    withSalary: jobs.filter((job) => job.salaryRaw !== '').length,
    hasNext,
    block,
    sample:
      sample === undefined
        ? null
        : {
            title: sample.title,
            company: sample.company,
            city: sample.city ?? '',
            salaryRaw: sample.salaryRaw,
            sourceUrl: sample.sourceUrl,
          },
  }
}

interface NetworkEntry {
  at: string
  method: string
  url: string
  resourceType: string
  status: number | null
  postData: string | null
  bodyHead: string | null
}

interface RedirectHop {
  at: string
  url: string
  status: number
  location: string | null
}

interface PhaseCapture {
  label: 'anon' | 'logged'
  at: string
  url: string
  finalHost: string
  hostChanged: boolean
  /** 页面载荷里的权威登录标记（true/false）；null = 该页没有这个标记。 */
  isLoggedInPayload: boolean | null
  scan: PageScan | null
  reading: Reading | null
  snapshotFile: string
}

/** indeed.com 域下的 cookie 名单（**只记名 + 域，不记值**）。 */
async function indeedCookieNames(context: BrowserContext): Promise<Array<{ name: string; domain: string }>> {
  try {
    const cookies = await context.cookies()
    const seen = new Map<string, string>()
    for (const cookie of cookies) {
      const domain = cookie.domain.replace(/^\./, '')
      if (!/(^|\.)indeed\.com$/.test(domain)) continue
      seen.set(cookie.name, cookie.domain)
    }
    return Array.from(seen.entries())
      .map(([name, domain]) => ({ name, domain }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

async function main(): Promise<void> {
  log(`搜索地址：${SEARCH_URL}`)
  log(`期望 host：${CONFIG.host} · profile：${PROFILE} · 登录等待上限 ${String(Math.round(LOGIN_WAIT_MS / 60_000))} 分钟`)
  log('⚠️ 只读取证：不点岗位动作、不投递、不发消息。')

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

  /* 跳转链（document 级逐跳）：「cn 站被 302 送到别的域」这条地址级事实的唯一来源。 */
  const redirects: RedirectHop[] = []
  /* 接口采样：数据域的 xhr/fetch。⚠️ account./secure.（凭据域）一律不采样。 */
  const network: NetworkEntry[] = []
  const networkSeen = new Set<string>()
  const watched = new WeakSet<object>()

  const attachWatchers = (page: Page): void => {
    if (watched.has(page)) return
    watched.add(page)
    page.on('request', (request) => {
      try {
        const url = request.url()
        let host = ''
        try {
          host = new URL(url).hostname
        } catch {
          return
        }
        if (!/(^|\.)indeed\.com$/.test(host)) return
        if (host.startsWith('account.') || host.startsWith('secure.')) return // 凭据域：不采样
        if (!['xhr', 'fetch'].includes(request.resourceType())) return
        const postData = request.postData() ?? null
        const key = `${request.method()} ${url} ${postData ?? ''}`
        if (networkSeen.has(key)) return
        if (network.length >= MAX_NETWORK) return
        networkSeen.add(key)
        network.push({
          at: new Date().toISOString(),
          method: request.method(),
          url: url.slice(0, 300),
          resourceType: request.resourceType(),
          status: null,
          postData: postData === null ? null : postData.slice(0, 2_000),
          bodyHead: null,
        })
      } catch {
        /* 监听本身不许炸 */
      }
    })
    page.on('response', (response: Response) => {
      try {
        const request = response.request()
        const url = response.url()
        let host = ''
        try {
          host = new URL(url).hostname
        } catch {
          return
        }
        if (!/(^|\.)indeed\.com$/.test(host) && !/challenges\.cloudflare\.com/.test(host)) return

        // document 级响应 → 跳转链（含 Cloudflare 挑战页）
        if (request.resourceType() === 'document' && redirects.length < MAX_REDIRECTS) {
          const location = response.headers()['location'] ?? null
          redirects.push({
            at: new Date().toISOString(),
            url: url.slice(0, 200),
            status: response.status(),
            location: location === null ? null : location.slice(0, 200),
          })
        }

        // xhr/fetch 响应 → 回填采样条目（凭据域仍不落任何内容）
        if (host.startsWith('account.') || host.startsWith('secure.')) return
        if (!['xhr', 'fetch'].includes(request.resourceType())) return
        const entry = network.find((item) => item.url === url.slice(0, 300) && item.status === null)
        const finish = (body: string | null): void => {
          if (entry !== undefined) {
            entry.status = response.status()
            entry.bodyHead = body === null ? null : body.slice(0, 6_000)
            return
          }
          if (network.length >= MAX_NETWORK) return
          network.push({
            at: new Date().toISOString(),
            method: request.method(),
            url: url.slice(0, 300),
            resourceType: request.resourceType(),
            status: response.status(),
            postData: request.postData()?.slice(0, 2_000) ?? null,
            bodyHead: body === null ? null : body.slice(0, 6_000),
          })
        }
        const contentType = response.headers()['content-type'] ?? ''
        if (/json|text/.test(contentType)) {
          void response
            .text()
            .then((body: string) => finish(body === '' ? null : body))
            .catch(() => finish(null))
        } else {
          finish(null)
        }
      } catch {
        /* ignore */
      }
    })
  }

  context.on('page', (page) => {
    attachWatchers(page)
  })
  for (const page of context.pages()) attachWatchers(page)
  const page: Page = context.pages()[0] ?? (await context.newPage())

  /** 采一侧：标记扫描 + 快照 + 适配器读数。 */
  const capturePhase = async (label: 'anon' | 'logged'): Promise<PhaseCapture> => {
    const at = new Date().toISOString()
    let scan: PageScan | null = null
    try {
      scan = await page.evaluate(scanPage, {
        loggedSelectors: LOGGED_MARKERS,
        anonSelectors: ANON_MARKERS,
        loggedText: LOGGED_TEXT,
        anonText: ANON_TEXT,
      })
    } catch {
      scan = null
    }
    let html = ''
    try {
      html = await page.content()
    } catch {
      html = ''
    }
    let snapshotFile = '(未取到 HTML)'
    if (html !== '') {
      const truncated = html.length > MAX_HTML_CHARS
      mkdirSync(CAPTURE_DIR, { recursive: true })
      snapshotFile = `indeed-search-${label}-${TODAY}.html`
      writeFileSync(
        join(CAPTURE_DIR, snapshotFile),
        truncated ? html.slice(0, MAX_HTML_CHARS) : html,
        'utf8',
      )
      log(`✔ ${label === 'anon' ? '未登录' : '已登录'}侧快照：${snapshotFile}（${String(html.length)} 字符${truncated ? '，截断' : ''}）`)
    }
    const reading = await readWithAdapter(page)
    const payload = await page.evaluate(isLoggedInPayloadProbe).catch(() => ({ present: false, loggedIn: false }))
    const url = scan?.url ?? '(scan 失败)'
    const finalHost = hostOf(url)
    return {
      label,
      at,
      url,
      finalHost,
      hostChanged: finalHost !== '' && finalHost !== CONFIG.host,
      isLoggedInPayload: payload.present ? payload.loggedIn : null,
      scan,
      reading,
      snapshotFile,
    }
  }

  const describeReading = (reading: Reading | null): string => {
    if (reading === null) return '读数失败'
    return (
      `条数 ${String(reading.total)} · jobKey ${String(reading.withKey)}/${String(reading.total)} · ` +
      `标题 ${String(reading.withTitle)}/${String(reading.total)} · 公司 ${String(reading.withCompany)}/${String(reading.total)} · ` +
      `薪资 ${String(reading.withSalary)}/${String(reading.total)} · hasNext=${String(reading.hasNext)} · ` +
      `detectBlock=${reading.block ?? '无'}`
    )
  }

  /* ── 1. 未登录侧（首次运行；profile 复用时可能直接是已登录侧，如实标注） ── */
  log('打开搜索页采「当前侧」…')
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: unknown) => {
    log(`导航失败（风控/网络也可能是原因）：${error instanceof Error ? error.message : String(error)}`)
  })
  await page.waitForTimeout(8_000)

  const cookiesBefore = await indeedCookieNames(context)
  const anon = await capturePhase('anon')
  log(`未登录侧落点：${anon.url.slice(0, 120)}`)
  log(`未登录侧读数：${describeReading(anon.reading)}`)
  log(`未登录侧登录态（载荷 isLoggedIn）：${anon.isLoggedInPayload === null ? '页面无此标记' : String(anon.isLoggedInPayload)}`)

  const strongBefore = await page
    .evaluate(strongLoggedProbe, { selectors: STRONG_LOGGED_SELECTORS, text: STRONG_LOGGED_TEXT })
    .catch(() => ({ hits: [] as string[] }))
  // 权威口径：载荷有标记就听载荷的（false = 确定未登录）；没有标记才回落强 DOM 标记。
  // cookie 名不作数 —— 首跑实测匿名访客也有 INDEED_CSRF_TOKEN / JSESSIONID（见文件头）。
  const alreadyLoggedIn = anon.isLoggedInPayload !== null ? anon.isLoggedInPayload : strongBefore.hits.length > 0

  let logged: PhaseCapture | null = null
  let loginOutcome: { ok: boolean; detectedBy: string[]; waitedMs: number } = {
    ok: alreadyLoggedIn,
    detectedBy: alreadyLoggedIn
      ? [...(anon.isLoggedInPayload === true ? ['payload:isLoggedIn=true'] : []), ...strongBefore.hits]
      : [],
    waitedMs: 0,
  }

  /* ── 2. 登录等待（窗口留给人） ──────────────────────────────────────── */
  if (alreadyLoggedIn) {
    log('✔ profile 已带登录态（载荷/强标记命中）—— 跳过登录引导，直接按已登录侧采集')
  } else {
    // 首跑实测：搜索会被送到 secure.indeed.com/auth 登录墙 —— 已在登录页就不用再找入口。
    const onAuthPage = /(^|\.)(secure|account)\.indeed\.com$/.test(hostOf(page.url()))
    if (onAuthPage) {
      log('已落在登录页（secure/account）—— 请直接在窗口里完成登录')
    } else {
      // 发现登录入口（发现而非猜测 URL）；找不到就留给人在窗口里自己点。
      const loginUrl = anon.scan?.loginLinkCandidates[0]?.href ?? null
      if (loginUrl !== null) {
        log(`发现登录入口，导航过去：${loginUrl.slice(0, 120)}`)
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: unknown) => {
          log(`登录页导航失败（请手动在窗口里点登录）：${error instanceof Error ? error.message : String(error)}`)
        })
      } else {
        log('页面里没发现登录链接 —— 请在窗口里自己点「登录」入口')
      }
    }
    await page.waitForTimeout(3_000)
    log('⚠️ 请在弹出的浏览器窗口里手动完成登录（账密 / 验证码 / 二步验证都算流程的一部分）')

    const deadline = Date.now() + LOGIN_WAIT_MS
    let lastHintAt = 0
    while (Date.now() < deadline) {
      const markerHits: string[] = []
      let payloadTrue = false
      for (const candidate of context.pages().filter((item) => !item.isClosed())) {
        const url = candidate.url()
        if (!/indeed\.com/.test(url)) continue
        const payload = await candidate
          .evaluate(isLoggedInPayloadProbe)
          .catch(() => ({ present: false, loggedIn: false }))
        if (payload.present && payload.loggedIn) {
          payloadTrue = true
          if (!markerHits.includes('payload:isLoggedIn=true')) markerHits.push('payload:isLoggedIn=true')
        }
        const probe = await candidate
          .evaluate(strongLoggedProbe, { selectors: STRONG_LOGGED_SELECTORS, text: STRONG_LOGGED_TEXT })
          .catch(() => ({ hits: [] as string[] }))
        for (const hit of probe.hits) {
          if (!markerHits.includes(hit)) markerHits.push(hit)
        }
      }
      if (payloadTrue || markerHits.length > 0) {
        loginOutcome = {
          ok: true,
          detectedBy: markerHits,
          waitedMs: LOGIN_WAIT_MS - (deadline - Date.now()),
        }
        log(`✔ 登录态就位（命中：${loginOutcome.detectedBy.join(' / ')}）`)
        break
      }
      if (Date.now() - lastHintAt > 20_000) {
        lastHintAt = Date.now()
        const url = page.isClosed() ? '(closed)' : page.url()
        const remainSec = Math.round((deadline - Date.now()) / 1000)
        const hint = /secure\.indeed\.com\/auth|account\.indeed\.com/.test(url)
          ? '⏳ 登录页 —— 请在窗口里登录'
          : /challenge|verify|secure\.indeed\.com/.test(url)
            ? '⛔ 验证 / 二步验证页 —— 请在窗口里完成（不算失败）'
            : '⏳ 等待登录信号出现'
        log(`${hint} · 还剩 ${String(remainSec)}s · ${url.slice(0, 90)}`)
      }
      await page.waitForTimeout(POLL_MS).catch(() => undefined)
    }
    if (!loginOutcome.ok) {
      loginOutcome = { ...loginOutcome, waitedMs: LOGIN_WAIT_MS }
      log(`⚠️ 等满 ${String(Math.round(LOGIN_WAIT_MS / 60_000))} 分钟未见登录信号 —— 已登录侧不采（宁可缺证据，也不写假证据）`)
    }
  }

  /* ── 3. 已登录侧：回同一条搜索地址，同款采集 ───────────────────────── */
  if (loginOutcome.ok) {
    await page.waitForTimeout(5_000).catch(() => undefined)
    log('回搜索页采「已登录侧」…')
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: unknown) => {
      log(`导航失败：${error instanceof Error ? error.message : String(error)}`)
    })
    await page.waitForTimeout(8_000)
    logged = await capturePhase('logged')
    log(`已登录侧落点：${logged.url.slice(0, 120)}`)
    log(`已登录侧读数：${describeReading(logged.reading)}`)
  }

  /* ── 4. 落盘报告 ───────────────────────────────────────────────────── */
  const cookiesAfter = await indeedCookieNames(context)
  const conclusion = (): string => {
    const anonAlive = anon.reading !== null && anon.reading.total > 0 && anon.reading.block === null && !anon.hostChanged
    if (anonAlive) {
      return (
        `cn 站今日真实可用：未登录侧即解析出 ${String(anon.reading?.total ?? 0)} 条且未判墙 —— ` +
        '与适配器文件头「已停运」结论矛盾，需按本报告复核 platform-facts / 判墙信号（这是供人复核的建议，不是自动改库的理由）'
      )
    }
    if (/(^|\.)(secure|account)\.indeed\.com$/.test(anon.finalHost)) {
      return (
        `cn 站搜索被登录墙拦（${anon.finalHost}，载荷 isLoggedIn=${anon.isLoggedInPayload === null ? '无标记' : String(anon.isLoggedInPayload)}）` +
        ' —— 与适配器文件头「302 → www 站 + Cloudflare 墙」形态不同：站点活着但搜索强制登录，判墙/登录策略需按本报告复核'
      )
    }
    if (anon.hostChanged) return `未登录侧被挪到 ${anon.finalHost}（地址级停运/跳转证据仍在）`
    if (anon.reading?.block !== null && anon.reading?.block !== undefined) return `未登录侧判墙：${anon.reading.block}`
    return '未登录侧未解析出岗位 —— 见跳转链与快照人工判读'
  }

  const report = {
    updatedAt: new Date().toISOString(),
    searchUrl: SEARCH_URL,
    expectedHost: CONFIG.host,
    evidenceUrl: USER_EVIDENCE_URL,
    redirects,
    cookies: {
      /** 只记名 + 域，不记值 —— 复核登录判据用。 */
      before: cookiesBefore,
      after: cookiesAfter,
      authLikeAfter: cookiesAfter.filter((cookie) => AUTH_COOKIE_RE.test(cookie.name)),
    },
    login: loginOutcome,
    anon,
    logged,
    /** 两侧候选全集（判据校准时的「假设清单」，以 scan.testids 为准）。 */
    candidateGroups: {
      loggedSide: { selectors: LOGGED_MARKERS, text: LOGGED_TEXT },
      anonSide: { selectors: ANON_MARKERS, text: ANON_TEXT },
      strongLoginDetection: { selectors: STRONG_LOGGED_SELECTORS, text: STRONG_LOGGED_TEXT },
    },
    verdict: {
      anonReachable: anon.reading !== null && anon.reading.total > 0 && anon.reading.block === null && !anon.hostChanged,
      anonBlock: anon.reading?.block ?? null,
      loggedReachable: logged !== null && logged.reading !== null && logged.reading.total > 0 && logged.reading.block === null && !logged.hostChanged,
      conclusion: conclusion(),
    },
    network,
    nextSteps: [
      'verdict.anonReachable=true ⇒ 复核 platform-facts 的 indeed notes 与适配器文件头的「停运」结论，并把快照人工钉成 test/fixtures/ 夹具（同步改用例期望值）。',
      '从 candidateGroups 里挑「anon 侧恒 0、logged 侧 ≥1」的判据写进适配器的 auth 锚点；scan.testids 是第一手锚点证据。',
      'network[] 是数据域 xhr/fetch 采样 —— 列表若有稳定 JSON 接口，优先按接口实现（比 DOM 稳）。',
      '本探针未点任何岗位动作；actions（投递/沟通）调研须另开探针单独评审。',
    ],
  }
  mkdirSync(CAPTURE_DIR, { recursive: true })
  const reportPath = join(CAPTURE_DIR, `indeed-login-report-${TODAY}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  log(`登录对比报告已保存：${reportPath}`)
  log(`跳转链 ${String(redirects.length)} 跳 · 接口采样 ${String(network.length)} 条 · cookie（只名） ${String(cookiesAfter.length)} 个`)
  log(`结论建议：${report.verdict.conclusion}`)

  if (!loginOutcome.ok) process.exitCode = 1
  await context.close().catch(() => undefined)
  log('✔ 探针完成（只读取证）。')
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
