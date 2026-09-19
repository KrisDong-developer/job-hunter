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
 * ## 翻页与筛选（全部已实测）
 *
 * * 翻页：`?page=N`（如 `?page=2`），每页 10 条、共 749 页；分页容器 `nav[aria-label="pagination"]`，
 *   `hasNextPage` 用「分页容器里是否存在页码 > 当前页的链接」判断 —— **不自己拼下一页 URL**。
 * * 关键词：`?kw=<词>`（键名是 **`kw`**，不是 `keyword`）；触发需在搜索框逐字输入 + 回车。
 * * 类别：`?type=<slug>`，值 `teaching / marketing / sales_support / other`（`marketing` 与
 *   zh 站「市场营销」都实测映射到 `type=marketing`）。
 * * 雇佣类型：`?employmentId=1`（Full-time / 全职）、`?employmentId=2`（Part-time / 兼职）。
 * * 工作模式：`?isOnline=1`（Remote / 远程）、`?isOnline=0`（On-site / 现场）。
 * * **没有城市 URL 筛选**：页面的地点 quick 按钮（中国/英国…）点击**不产生 URL 参数**，
 *   纯客户端；「More」下拉给的是 `nationalitieParentN`（国籍/语言过滤，不是城市）——
 *   所以本适配器**不声明城市维度**，带城市一律 `buildSearchUrl` 返回 null（fail-closed，
 *   绝不「抓了全国假装抓了深圳」）。
 *
 * ## 详情页（2026-09-18 探针注明，待 probe:hiredchina 落盘详情夹具校准）
 *
 * 标题 `h1`；薪资在渐变卡片 `div[class*="bg-gradient-to-br"]` 内的 `[class*="text-3xl"]`；
 * 徽章行 `div.flex.flex-wrap.gap-2` 按「地点 → 行业 → 雇佣类型 → 工作模式 → 语言」顺序；
 * JD 全文 `div.prose.prose-sm`。⚠️ **本平台详情页没有**签证担保 / 公司规模 / 公司性质 /
 * relocation 字段 —— 因此 `visa` / `companySize` / `companyNature` 一律不编（该平台没有，
 * 编了就是臆造）。
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
import type { BlockKind, CoreField } from '../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../shared/contract/enums/crawl.js'
import { humanDelayMs } from '../pacing.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'
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

/** 雇佣类型筛选 `?employmentId=`（已实测：1=Full-time/全职，2=Part-time/兼职）。 */
export const HIREDCHINA_EMPLOYMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '全职（Full-time）' },
  { value: '2', label: '兼职（Part-time）' },
]

/** 工作模式筛选 `?isOnline=`（已实测：1=Remote/远程，0=On-site/现场）。 */
export const HIREDCHINA_WORK_MODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '远程（Remote）' },
  { value: '0', label: '现场（On-site）' },
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

/** 详情页选择器（2026-09-18 探针注明，待 explore 详情夹具校准。每项可 DB 覆盖）。 */
export interface HiredChinaDetailSelectors {
  title: string
  /** 薪资：渐变卡片内的金额元素。探针给出卡片容器，具体金额元素是 best-effort。 */
  salary: string
  /** JD 全文。 */
  jdText: string
  /** 徽章行容器（地点 → 行业 → 雇佣 → 工作模式 → 语言）。 */
  badgeRow: string
}

export interface HiredChinaUrlParams {
  jobsPath: string
  keywordParam: string
  typeParam: string
  employmentParam: string
  workModeParam: string
  pageParam: string
}

export interface HiredChinaConfig {
  webBase: string
  lang: string
  selectors: HiredChinaSelectors
  detailSelectors: HiredChinaDetailSelectors
  urlParams: HiredChinaUrlParams
  /** 城市码。⚠️ 本平台**没有城市 URL 筛选**（见文件头）→ 恒空，带城市即拒绝。 */
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
  detailSelectors: {
    title: 'h1',
    // 薪资：渐变卡内的金额元素。探针给出其容器 `div.flex.flex-col.items-start.shrink-0`，
    // 金额元素 best-effort（用 shrink-0 加 text-3xl 双锚，避免与同样带 text-3xl 的 h1 撞）。
    salary: '[class*="shrink-0"] [class*="text-3xl"]',
    jdText: 'div.prose.prose-sm',
    badgeRow: 'div.flex.flex-wrap.gap-2',
  },
  urlParams: {
    jobsPath: '/jobs',
    keywordParam: 'kw',
    typeParam: 'type',
    employmentParam: 'employmentId',
    workModeParam: 'isOnline',
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
    detailSelectors: {
      ...DEFAULT_HIREDCHINA_CONFIG.detailSelectors,
      ...(patch.detailSelectors ?? {}),
    },
    urlParams: { ...DEFAULT_HIREDCHINA_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_HIREDCHINA_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    jobIdPattern: pattern('jobIdPattern', DEFAULT_HIREDCHINA_CONFIG.jobIdPattern),
    maxPages:
      typeof patch.maxPages === 'number' && patch.maxPages > 0
        ? patch.maxPages
        : DEFAULT_HIREDCHINA_CONFIG.maxPages,
  }
}

/** 构造列表页 URL：`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`。 */
export function buildHiredChinaSearchUrl(
  config: HiredChinaConfig,
  criteria: SearchCriteria,
): string | null {
  // 本平台**没有城市 URL 筛选**（见文件头）—— 带城市即拒绝，绝不静默搜全国。
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  const type = platformCriterion(criteria, 'type')
  if (type !== '') params.set(config.urlParams.typeParam, type)
  const employment = platformCriterion(criteria, 'employment')
  if (employment !== '') params.set(config.urlParams.employmentParam, employment)
  const workMode = platformCriterion(criteria, 'workMode')
  if (workMode !== '') params.set(config.urlParams.workModeParam, workMode)
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

  // ⚠️ 这两个词表归一必须在函数体内（自包含）：真路径上 `extractJobsInPage` 会连同它
  // 一起被序列化送进浏览器，"按源码重建"护栏从源码层面切断对模块作用域的引用。
  const normalizeEmployment = (value: string): string => {
    const v = value.toLowerCase().replace(/\s+/g, '')
    if (/全职|fulltime|full[-\s]?time/.test(v)) return '全职'
    if (/兼职|parttime|part[-\s]?time/.test(v)) return '兼职'
    return ''
  }
  const normalizeWorkMode = (value: string): string => {
    const v = value.toLowerCase().replace(/\s+/g, '')
    if (/远程|remote|在家办公|fullyremote/.test(v)) return '远程'
    if (/现场|onsite|on[-\s]?site|实地/.test(v)) return '现场'
    if (/混合|hybrid/.test(v)) return '混合'
    return ''
  }

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

    // ── 雇佣类型 / 工作模式的 en/zh 词表归一（自包含，不能引用模块常量）──
    // 平台有两个语言站，卡片文案随 lang 切换（如 Full-time/全职、Remote/现场）。
    // 归一到中文稳定值，避免"同一字段两个看似不同标签"污染去重/统计。
    const employmentNorm = normalizeEmployment(employment)
    const workModeNorm = normalizeWorkMode(workMode)

    const tags: string[] = []
    if (employmentNorm !== '') tags.push(employmentNorm)
    if (workModeNorm !== '') tags.push(workModeNorm)

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
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器（`h1` / 渐变卡片薪资 / `div.prose.prose-sm` JD）探针注明，待详情夹具校准。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。company 也仅从徽章行外的
 * 常用锚点 best-effort，捞不到就留空（调用方用列表的公司兜底）。
 */
export function extractDetailInPage(arg: { selectors: HiredChinaDetailSelectors }): RawJobDetail {
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const pick = (selector: string): string => {
    try {
      return clean(document.querySelector(selector)?.textContent)
    } catch {
      return ''
    }
  }

  const title = pick(arg.selectors.title)
  const salaryRaw = pick(arg.selectors.salary)

  let employment = ''
  let workMode = ''
  let expReq = ''
  try {
    const row = document.querySelector(arg.selectors.badgeRow)
    if (row !== null) {
      const badges = Array.from(row.querySelectorAll('span'))
        .map((span) => clean(span.textContent))
        .filter((text) => text !== '')
      for (const badge of badges) {
        const v = badge.toLowerCase().replace(/\s+/g, '')
        if (employment === '' && /全职|兼职|fulltime|full[-\s]?time|parttime|part[-\s]?time/.test(v)) {
          employment = /兼职|parttime|part[-\s]?time/.test(v) ? '兼职' : '全职'
        } else if (workMode === '' && /远程|remote|现场|onsite|on[-\s]?site|混合|hybrid/.test(v)) {
          if (/远程|remote|在家办公/.test(v)) workMode = '远程'
          else if (/混合|hybrid/.test(v)) workMode = '混合'
          else workMode = '现场'
        } else if (expReq === '' && /\d+\s*[-～~]\s*\d+\s*(?:年|years?)|\d+\s*(?:年|years?)|experience|经验不限/i.test(v)) {
          expReq = badge
        }
      }
    }
  } catch {
    /* 徽章行解析失败不影响其余字段 */
  }

  const tags: string[] = []
  if (employment !== '') tags.push(employment)
  if (workMode !== '') tags.push(workMode)

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company: '',
    sourceUrl: location.href,
    jdText: pick(arg.selectors.jdText),
    ...(expReq === '' ? {} : { expReq }),
    tags,
  }
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
 * HiredChina 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare managed challenge**（实测第一层墙：raw HTTP 返回 "Just a moment..." +
 *     注入 `_cf_chl_opt` 脚本）：`challenge-platform` / `cf_chl` / `cf-browser-verification`
 *     这一组选择器与文案，通用词表里没有 Cloudflare；
 *   * `人机验证` 留在 **`rateText`**（同 guopin）：搬去 `captchaText` 会把返回值从
 *     `rate-limited` 变成 `captcha`，界面给的下一步动作就跟着变了；
 *   * `loginText` 带上**英文**（`login` / `Sign in`）—— 这是外企站，通用词表只有中文短语。
 */
const HIREDCHINA_BLOCK_SIGNALS = {
  captchaSelectors: [
    'script[src*="challenge-platform"]',
    'form[action*="cf_chl"]',
    'iframe[src*="challenge-platform"]',
    '[class*="cf-browser-verification"]',
  ],
  captchaText: ['_cf_chl_opt', 'cf_chl_', 'cf-browser-verification', 'justamoment'],
  rateText: ['人机验证'],
  loginText: ['login', 'Sign in', '登录'],
} as const

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
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，对应 ?kw=（实测键名；需在页面输入触发）' },
    {
      key: 'type',
      label: 'Job Type',
      values: HIREDCHINA_TYPE_OPTIONS,
      hint: '对应 ?type= 类别筛选；marketing 已实测，teaching / sales_support / other 建议 probe 逐档确认',
    },
    {
      key: 'employment',
      label: '雇佣类型',
      values: HIREDCHINA_EMPLOYMENT_OPTIONS,
      hint: '对应 ?employmentId=（已实测：1=全职 / 2=兼职）',
    },
    {
      key: 'workMode',
      label: '工作模式',
      values: HIREDCHINA_WORK_MODE_OPTIONS,
      hint: '对应 ?isOnline=（已实测：1=远程 / 0=现场）；解析时归一到 远程/现场/混合 标签',
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      // 同上：本平台**没有**城市筛选，带城市一律拒绝 —— 空表在这里是"别给"，不是"随便给"
      closed: true,
      hint: '⚠️ 本平台**没有城市 URL 筛选**（地点 quick 按钮纯客户端，More 下拉是国籍过滤）→ 不筛选；带城市一律拒绝，不猜',
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
    ...platformFacts('hiredchina'),
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
    // 未声明默认深度（hint 只说了上限的取舍理由）—— 1 页。
    defaultMaxPages: 1,

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
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(HIREDCHINA_BLOCK_SIGNALS),
          card: config.selectors.card,
          // ⚠️ **刻意不传 `cardBox`**：原实现的 arg 里声明了它，但函数体从未使用过
          //    （只 querySelectorAll(arg.card)）。传进去会让"卡片数为 0"多一条兜底判据，
          //    从而少判 blank —— 那是行为改变，不是迁移。
        })
      },
    },

    // 详情页 JD 全文（P2 详情抓取）。选择器（h1 / 渐变卡片薪资 / prose JD）探针注明，
    // 待 probe:hiredchina 落盘详情夹具校准；该平台无签证/公司规模字段，故不编这些。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    // ⚠️ 不实现 `actions`：投递需登录且列表夹具未验证稳定投递契约 → fail-closed。
  }
}