/**
 * HiredChina（hiredchina.com）适配器 —— 2026-09-18 基于真实线上调研。
 *
 * ## 平台是什么
 *
 * HiredChina 是面向**在华外国人**的招聘平台（与 eChinacities 同源），帮助中国企业招聘
 * 全球人才（英语外教 / 市场营销 / 销售 / IT…），覆盖 120+ 国家、月访问约 300 万。
 * 招聘侧大量岗位天然支持签证担保 / 远程，与项目「海外支线 §4.M」高度相关。
 *
 * ## 调研来源（2026-09-18 一手，非二手资料）
 *
 * * **两个同源域名**（Next.js App Router 同一套应用）：
 *   - 主站 `www.hiredchina.com` —— 对外「人看的入口」，但 **raw HTTP 直接访问会被
 *     Cloudflare managed challenge 拦截**（实测返回 `Just a moment...` + `_cf_chl_opt`
 *     脚本）；真实浏览器里带着用户登录态/会话能正常通过 —— 这正是本插件走真浏览器的意义。
 *   - 子域 `hcweb.gicexpat.com` —— 同一应用，raw HTTP **不被 Cloudflare 拦截**
 *     （实测 200 + 430KB SSR 页面），是探针 / 夹具 / DB 覆盖时的可验证入口。
 * * **列表页**：`/<lang>/jobs`（`lang ∈ {en, zh}`），Next.js **RSC 服务端渲染**
 *   （HTML 内嵌 `self.__next_f.push(...)`，**没有** `__NEXT_DATA__`、也**没有**单独的
 *   jobs JSON 接口 —— 翻页与筛选都是整页 SSR 导航）。所以列表可直接抓 DOM，不需要
 *   像神仙外企那样在页面里调接口。
 * * **详情页**：`/en/job/<uuid>?returnTo=...`；`jobId` 是 **UUID**（8-4-4-4-12 十六进制）。
 *
 * ## 真实夹具校准的卡片 DOM（2026-09-18 浏览器探针逐字段验证）
 *
 * 每张卡片是一个 `<a>`（href 指向详情），内部包 `div[data-slot="card"]`：
 *
 * ```
 * a[href^="/(en|zh)/job/"]  .block.w-full.h-full     ← 卡片外层锚点（卡片身份）
 * └─ div[data-slot="card"]
 *    ├─ h3                                          ← 标题（含 text-emerald-600 font-bold）
 *    ├─ [行，含 lucide-building-2 svg] > span.truncate   ← 公司名
 *    └─ 五个徽章徽章 div（各带不同 Tailwind 底色，即字段判别锚点）：
 *       ├─ bg-emerald-50 text-emerald-700 > span.truncate  ← 薪资（如 "20K - 25K…" / "Negotiable"）
 *       ├─ bg-gray-50       text-gray-600   > span.truncate  ← 地点（如 "China · Guangzhou"）
 *       ├─ bg-blue-50       text-blue-600   > span.truncate  ← 雇佣类型（Full-time / Part-time）
 *       ├─ bg-orange-50     text-orange-600 > span.truncate  ← 工作模式（On-site / Remote）
 *       └─ bg-slate-50      text-slate-500   > span.truncate  ← 经验（"Unlimited experience" / "3～5 years"）
 *   最后一行 border-t（底部）：相对发布时间（"2d ago" / "7h ago"，首个有时是绝对日期）
 * ```
 *
 * ⚠️ 这些底色是 Tailwind 语义化色板（emerald=薪资 / gray=地点 / blue=雇佣 / orange=工作模式 /
 * slate=经验），是**平台自己用来区分字段的稳定约定**，比序号依赖稳。任何一项都可以在 DB 里
 * 覆盖着改（ADR-19），选错只影响该字段、不影响卡片总数。
 *
 * ## 翻页与筛选（已实测）
 *
 * * 翻页：`?page=N`（如 `?page=2`），每页 10 条、共 749 页；分页容器 `nav[aria-label="pagination"]`，
 *   `hasNextPage` 用「分页容器里是否存在页码 > 当前页的链接」判断 —— **不自己拼下一页 URL**。
 * * 类别筛选：`?type=marketing`（实测生效，筛选后 positions found 变少且与 `page` 可叠加）。
 *   Job Type 的四档取值直接来自页面内嵌 i18n 字典（`teaching` / `marketing` / `sales_support` /
 *   `other`），其中 `marketing` 已实测，其余三档是 UI 字典原样、建议用探针逐档确认。
 * * **未确证、故不编**：城市参数键名（探针确认地点会通过 query 参数表达，但没抓到具体键名）、
 *   关键词参数键名、雇佣类型/工作模式的具体参数键。所以 v1 **不声明城市维度**，
 *   带城市直接 `buildSearchUrl` 返回 null（fail-closed，绝不「抓了全国假装抓了深圳」）。
 *
 * ## 判定墙
 *
 * `www.hiredchina.com` 的 Cloudflare managed challenge 是**真实观测**到的第一层墙
 * （raw HTTP 直接命中）。`detectBlock` 显式认得 `_cf_chl_opt` / `Just a moment` /
 * `cf-browser-verification` 这些 Cloudflare 信号，命中即 `captcha` 交还人工（C12）。
 * 此外沿用通用文案判定（验证控件 / 频控 / 登录墙 / 空页）。antiBot 如实定 `medium`。
 *
 * ## 投递 / 打招呼
 *
 * 列表公共可看（未登录可抓，`searchWithoutLogin: true`），投递需登录。未在列表夹具验证
 * 稳定投递按钮契约之前，**不实现** `actions`（fail-closed，见 docs/ADAPTERS.md §6）。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../types.js'
import { platformCriterion } from '../types.js'

/** 用户面向的默认域名（对外入口）。raw HTTP 会吃 Cloudflare 挑战；真浏览器 + 登录态可过。 */
export const HIREDCHINA_WEB_BASE = 'https://www.hiredchina.com'

/** 页面语言路径段（决定卡片里文案是英文还是中文）。 */
export const HIREDCHINA_LANG = 'en'

/** 每张卡片是一个详情链接 `<a>`，href 形如 `/<lang>/job/<uuid>?returnTo=...`。 */
export const HIREDCHINA_CARD_SELECTOR = 'a[href^="/' + HIREDCHINA_LANG + '/job/"]'

/** 卡片本体容器（`div[data-slot="card"]`，shadcn/ui 的语义锚点）。 */
export const HIREDCHINA_CARD_BOX_SELECTOR = 'div[data-slot="card"]'

/** jobId 是 UUID：`8-4-4-4-12` 十六进制。 */
export const HIREDCHINA_JOB_ID_PATTERN = '/(?:en|zh)/job/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'

/** Job Type（类别筛选 `?type=`）取值 —— 键来自页面内嵌 i18n 字典；`marketing` 已实测。 */
export const HIREDCHINA_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'teaching', label: 'Teaching' },
  { value: 'sales_support', label: 'Sales Support' },
  { value: 'other', label: 'Other' },
]

/**
 * 单次抓取的页数上限。
 *
 * 翻页契约**已实测有效**（`?page=N`、每页 10 条、749 页），本可抓几十页；但主站带
 * Cloudflare 挑战层，且我们是保守优先（§P5），先按 `maxPages = 5` 封顶，跑稳了再放开。
 * 这不是平台限制，是我们对风控的取舍 —— 写清楚，避免后人误以为「上限 5 是平台事实」。
 */
export const HIREDCHINA_MAX_PAGES = 5

/** 结构锚点集。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface HiredChinaSelectors {
  /** 卡片身份锚（详情链接）。 */
  card: string
  /** 卡片本体容器。 */
  cardBox: string
  /** 标题。 */
  title: string
  /** 公司图标的行（`lucide-building-2`），取它所在行文本为公司名。 */
  companyRow: string
  /** 各字段徽章的底色判别（平台自己的色板约定）。 */
  salaryBadge: string
  locationBadge: string
  employmentBadge: string
  workModeBadge: string
  experienceBadge: string
  /** 分页容器（判 `hasNextPage`）。 */
  pagination: string
}

export interface HiredChinaUrlParams {
  /** 例子参数键名（见文件头：类别已实测、城市/关键词/雇佣/工作模式未确证故不建键）。 */
  jobsPath: string
  typeParam: string
  pageParam: string
}

export interface HiredChinaConfig {
  webBase: string
  lang: string
  selectors: HiredChinaSelectors
  urlParams: HiredChinaUrlParams
  /** 城市码。调研期未确证 URL 城市参数 → v1 空表，带城市即拒绝（不猜）。 */
  cityCodes: Record<string, string>
  jobIdPattern: string
  /** 抓取深度上限（页数）。 */
  maxPages: number
}

export const DEFAULT_HIREDCHINA_CONFIG: HiredChinaConfig = {
  webBase: HIREDCHINA_WEB_BASE,
  lang: HIREDCHINA_LANG,
  selectors: {
    card: HIREDCHINA_CARD_SELECTOR,
    cardBox: HIREDCHINA_CARD_BOX_SELECTOR,
    title: 'h3',
    companyRow: '[class*="lucide-building-2"]',
    salaryBadge: '[class*="bg-emerald-50"]',
    locationBadge: '[class*="bg-gray-50"]',
    employmentBadge: '[class*="bg-blue-50"]',
    workModeBadge: '[class*="bg-orange-50"]',
    experienceBadge: '[class*="bg-slate-50"]',
    pagination: 'nav[aria-label="pagination"]',
  },
  urlParams: {
    jobsPath: '/jobs',
    typeParam: 'type',
    pageParam: 'page',
  },
  cityCodes: {},
  jobIdPattern: HIREDCHINA_JOB_ID_PATTERN,
  maxPages: HIREDCHINA_MAX_PAGES,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeHiredChinaConfig(override: unknown): HiredChinaConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_HIREDCHINA_CONFIG
  const patch = override as Partial<HiredChinaConfig>
  const pattern = (key: keyof HiredChinaConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  return {
    webBase: pattern('webBase', DEFAULT_HIREDCHINA_CONFIG.webBase),
    lang: pattern('lang', DEFAULT_HIREDCHINA_CONFIG.lang),
    selectors: { ...DEFAULT_HIREDCHINA_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_HIREDCHINA_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_HIREDCHINA_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    jobIdPattern: pattern('jobIdPattern', DEFAULT_HIREDCHINA_CONFIG.jobIdPattern),
    maxPages:
      typeof patch.maxPages === 'number' && patch.maxPages > 0
        ? patch.maxPages
        : DEFAULT_HIREDCHINA_CONFIG.maxPages,
  }
}

/** 构造列表页 URL：`/<lang>/jobs?type=<类别>&page=<页码>`。 */
export function buildHiredChinaSearchUrl(
  config: HiredChinaConfig,
  criteria: SearchCriteria,
): string | null {
  // 城市筛选 v1 未实现（URL 参数键名未确证）—— 带城市即拒绝，绝不静默搜全国。
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
  }

  const params = new URLSearchParams()
  const type = platformCriterion(criteria, 'type')
  if (type !== '') params.set(config.urlParams.typeParam, type)
  if (criteria.page !== undefined && criteria.page > 1) {
    params.set(config.urlParams.pageParam, String(criteria.page))
  }
  const base = `${config.webBase}/${config.lang}${config.urlParams.jobsPath}`
  const query = params.toString()
  return query === '' ? base : `${base}?${query}`
}

/**
 * **在页面上下文里**解析列表页 —— 按「卡片身份锚 + 字段底色」策略（见文件头）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param config 由宿主序列化传入
 */
export function extractJobsInPage(arg: HiredChinaConfig): RawJob[] {
  const out: RawJob[] = []
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()

  let idRe: RegExp | null = null
  try {
    idRe = new RegExp(arg.jobIdPattern)
  } catch {
    idRe = null
  }

  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    cards = null
  }
  if (cards === null || cards.length === 0) return out

  /** 取卡片内某底色徽章下的 `span.truncate` 文本；没有返回空串。 */
  const badgeText = (box: Element, selector: string): string => {
    try {
      return clean(box.querySelector(`${selector} span.truncate`)?.textContent)
    } catch {
      return ''
    }
  }

  for (const card of Array.from(cards)) {
    const href = card.getAttribute('href') ?? ''
    if (href === '') continue

    let box: Element = card
    try {
      box = card.querySelector(arg.selectors.cardBox) ?? card
    } catch {
      box = card
    }

    let title = ''
    try {
      title = clean(box.querySelector(arg.selectors.title)?.textContent)
    } catch {
      title = ''
    }
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(href) : null
    const platformJobId = idMatch !== null && idMatch[1] !== undefined ? (idMatch[1] as string) : ''

    // ── 薪资：平台绝大多数卡片都有（"20K - 25K RMB per month" / "Under 10K…"），
    //    面议即 "Negotiable"（非空 = 合法值，见 validate.ts）。留空只发生在解析跑偏时。
    const salaryRaw = badgeText(box, arg.selectors.salaryBadge)

    // ── 公司：取 building 图标所在行的文本（探针：该行内的 span.truncate）。
    let company = ''
    try {
      const icon = box.querySelector(arg.selectors.companyRow)
      if (icon !== null && icon.parentElement !== null) {
        company = clean(icon.parentElement.textContent)
      }
    } catch {
      company = ''
    }

    // ── 地点 "Country · City" 或纯 "City"：取最后一个 "·" 段作城市名。
    const locationText = badgeText(box, arg.selectors.locationBadge)
    const locParts = locationText
      .split('·')
      .map((part) => part.trim())
      .filter((part) => part !== '')
    const city = locParts.length === 0 ? '' : locParts[locParts.length - 1]

    const employment = badgeText(box, arg.selectors.employmentBadge)
    const workMode = badgeText(box, arg.selectors.workModeBadge)
    const expReq = badgeText(box, arg.selectors.experienceBadge)

    const tags: string[] = []
    if (employment !== '') tags.push(employment)
    if (workMode !== '') tags.push(workMode)

    const notes: string[] = []
    if (platformJobId === '') notes.push('卡片未锚定岗位 UUID，待 probe:hiredchina 校准')
    if (salaryRaw === '') notes.push('薪资徽章未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 原样给，字段断言会兜 */
    }

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(expReq === '' ? {} : { expReq }),
      tags,
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**判断是否还有下一页：分页容器里是否存在「页码 > 当前页」的链接。
 * ⚠️ 自包含。`currentPage` 由宿主传入（真实路径上记录在 pending WeakMap 里）。
 */
export function hasNextPageInPage(arg: { selector: string; currentPage: number }): boolean {
  let nav: Element | null = null
  try {
    nav = document.querySelector(arg.selector)
  } catch {
    nav = null
  }
  if (nav === null) return false
  const current = arg.currentPage > 0 ? arg.currentPage : 1
  let links: NodeListOf<Element> | null = null
  try {
    links = nav.querySelectorAll('a[href*="page="]')
  } catch {
    links = null
  }
  if (links === null) return false
  for (const link of Array.from(links)) {
    const m = /[?&]page=(\d+)/.exec(link.getAttribute('href') ?? '')
    if (m !== null && m[1] !== undefined) {
      const page = Number.parseInt(m[1], 10)
      if (Number.isFinite(page) && page > current) return true
    }
  }
  return false
}

/**
 * **在页面上下文里**判墙。
 *
 * HiredChina 特有：`www.hiredchina.com` 的 **Cloudflare managed challenge** 是实测第一层墙
 * （raw HTTP 返回 "Just a moment..." + 注入 `_cf_chl_opt` 脚本）。判成 `captcha` 交还人工（C12）。
 * 其余沿用通用文案判定（验证控件 / 频控 / 登录墙 / 空页）。
 */
export function detectBlockInPage(arg: { card: string; cardBox: string }): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')

  let cards = 0
  try {
    cards = document.querySelectorAll(arg.card).length
  } catch {
    cards = 0
  }

  // Cloudflare managed challenge：标题/脚本/校验表单任一命中即判 captcha。
  const challenge = document.querySelector(
    'script[src*="challenge-platform"], form[action*="cf_chl"], iframe[src*="challenge-platform"], [class*="cf-browser-verification"]',
  )
  if (challenge !== null) return 'captcha'
  if (/justamoment|_cf_chl_opt|cf-browser-verification|cf_chl_/.test(compact)) return 'captcha'

  const captcha = document.querySelector(
    '.geetest_panel, .geetest_holder, iframe[src*="captcha"], #captcha, [class*="verify-wrap"], [class*="slide-verify"]',
  )
  if (captcha !== null) return 'captcha'
  if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|安全验证|异常流量|人机验证/.test(compact)) {
    return 'rate-limited'
  }
  if (/今日投递太多|休息一下明天再来|达到上限|次数过多/.test(compact)) return 'quota-exhausted'
  if (cards === 0 && /login|Sign in|登录/.test(compact) && compact.length < 800) return 'login-required'
  if (cards === 0 && compact.length < 120) return 'blank'
  return null
}

export interface HiredChinaAdapterOptions {
  config?: HiredChinaConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 HiredChina 适配器。 */
export function createHiredChinaAdapter(options: HiredChinaAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_HIREDCHINA_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 上一次 `gotoSearch` 记下的筛选条件（与 waiqi 同因：`readListPage(page)` / `hasNextPage(page)`
   * 只拿得到 page，拿不到 criteria —— 见 domain/crawl.ts 的循环）。
   */
  const pending = new WeakMap<object, SearchCriteria>()

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本（搜索框 placeholder："Search job title, keywords or company…"）' },
    {
      key: 'type',
      label: 'Job Type',
      values: HIREDCHINA_TYPE_OPTIONS,
      hint: '对应 ?type= 类别筛选；marketing 已实测，teaching / sales_support / other 来自页面 i18n 字典，建议探针逐档确认',
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: 'URL 城市参数键名未确证（调研期确认会用 query 参数，但键名未知）→ v1 不筛选；带城市一律拒绝，不猜',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: config.maxPages,
      hint: `翻页已实测有效（?page=N、每页 10 条、749 页）；` +
        `上限 ${String(config.maxPages)} 页是对 Cloudflare 主站风控的保守取舍，不是平台限制`,
    },
  ]

  return {
    id: 'hiredchina',
    displayName: 'HiredChina',
    capabilities: {
      // 列表公共可看（探针浏览器未登录即可渲染列表）→ 搜索不需要登录。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 结构化卡片：标题/公司/薪资/地点几乎都在；但字段靠底色徽章锚定，偶发缺失 → medium。
      fieldCompleteness: 'medium',
      // 主站带 Cloudflare managed challenge（raw HTTP 实测命中）→ 如实 medium。
      antiBot: 'medium',
    },
    // 薪资绝大多数存在（"Negotiable" 也是合法值，见 validate.ts）→ 用完整核心四字段。
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: config.maxPages,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildHiredChinaSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildHiredChinaSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`HiredChina：城市「${criteria.city ?? ''}」筛选未实现（URL 参数未确证）—— 拒绝猜测`)
        }
        pending.set(page as object, criteria)
        await page.goto(url)
        // 列表是 RSC SSR，load 时卡片应已在；仍等一次卡片锚点，防「今天没有新岗位」误读。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        const jobs = await page.evaluate(extractJobsInPage, config)
        if (jobs.length === 0) {
          // 0 条可能是真没结果，也可能是改版 —— 交给主链按 NO_RECORDS 记 partial，不在这里猜。
          return []
        }
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        const criteria = pending.get(page as object) ?? {}
        const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1
        return await page.evaluate(hasNextPageInPage, {
          selector: config.selectors.pagination,
          currentPage: pageNo,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockInPage, {
          card: config.selectors.card,
          cardBox: config.selectors.cardBox,
        })
      },
    },

    // ⚠️ 刻意不实现 `detail.extract`：详情页 /job/<uuid> 的选择器未用夹具验证过，
    //    按「只实现有已验证证据的细节」原则（见 waiqi/zhipin），不编详情选择器。
    // ⚠️ 不实现 `actions`：投递需登录且列表夹具未验证稳定投递契约 → fail-closed。
  }
}