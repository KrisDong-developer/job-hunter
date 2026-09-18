/**
 * 国聘网（iguopin.com）适配器 —— 2026-09-18 基于真实线上页面一手调研。
 *
 * 国聘网是「国聘行动」官方平台（国务院国资委推动、央视总台合作），聚合大量央企 /
 * 国企 / 事业单位 / 部分民企岗位，校招（秋招/春招）与社招并重。运行方为国投人力。
 *
 * ## 调研来源（2026-09-18 直接抓取线上，非二手资料）
 *
 * * **列表页**：`https://www.iguopin.com/jobList?keyword=<明文>` 生效（实测 `keyword=Java`
 *   返回 java 相关岗位）；同一站点还有 `/job` 路由，与 `/jobList` 是**新旧路由别名**，
 *   解析不依赖路由名，只锚岗位详情链接。
 * * **详情页**：`https://www.iguopin.com/job/detail?id=<19位数字>`（实证命中
 *   「财税管理岗（校招）」详情页）。页面含：标题、更新于、薪资、公司、
 *   「职位性质 / 招聘人数 / 最低学历 / 工作经验 / 专业要求 / 行业要求 / 报名截止」、
 *   「职位介绍」（= JD 全文）。
 * * **列表条目 DOM 语义结构**（WebFetch 纯文本还原，每条卡片）：
 *
 *   ```
 *   <标题>
 *   「<城市-区域>」                    ← 全角书名号包裹，如「北京-石景山区」
 *   <薪资><性质><经验><学历>            ← 如「面议校招应届生本科」「10~13K校招应届生硕士」
 *   <职位职能/部门>                    ← 一条职能或部门文本（可能是详情链接文本）
 *   [公司名](company?id=<19位数字>)     ← 公司链接（语义锚点）
 *   <公司内部门>（可选）
 *   国企500-1000人商务服务业            ← 公司性质｜规模｜行业（可选）
 *   申请职位                           ← 投递按钮（忽略）
 *   ```
 *
 * ## 诚实标注的两处"未确证"（**不编**，见 §2 / §6）
 *
 * 1. **分页参数未确证**：列表底部有数字分页（`- 1 2 … 20 -`），但 `?p=2` 抓到与首页
 *    相同的条目 —— 参数名可能不是 `p`，也可能 WebFetch 命中了两套结果。在 probe:guopin
 *    落盘真实夹具确认前，`hasNextPage` 恒 false、`maxPages=1`（单页采集，绝不去猜参数）。
 * 2. **列表卡片 class / 城市码未确证**：本适配器**不编 class 锚点**，改以「岗位详情链接」
 *    为语义锚点，向上 `closest(container)` 取单条容器（`container` 是 DB 可覆盖的配置，
 *    默认宽松取 `li / .job-item / [class*='card']` 之一）；并将各字段词表全部放进配置，
 *    待 `npm run probe:guopin` 保存真实夹具后校准成精确选择器（与猎聘 v1 同思路）。
 *    城市筛选栏有北京/上海…，但 URL 城市参数未实证 → `cityCodes` 先置空，**不编**，
 *    未列出的城市 `buildSearchUrl` 返回 null（入口层拒绝）。
 *
 * ## 薪资「面议」是合法值
 *
 * 国聘不少岗位薪资为「面议」。`validate.ts` 的字段级判定把「面议」当**合法值**、
 * 只有**空串**才算缺失 —— 所以薪资总能解析到（至少「面议」），`requiredFields`
 * 可用完整核心四字段。解析失败留空则由 sentinel 隔离进 `pending_repair`。
 *
 * ## 判定墙
 *
 * 国聘是政府背景平台，未观测到 CDP 检测（对应 §7.1「51job/智联/神仙外企」那一档）。
 * `detectBlock` 走通用文案判定：验证控件 → 频控 → 登录墙 → 空页。列表页未登录可看
 * （投递才要登录），所以 `searchWithoutLogin: true`；antiBot 如实定 `low`。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'

/**
 * 详情链接候选锚点（列表卡片里的岗位详情跳转）。国聘列表卡片内通常是标题或「职位职能」
 * 作为可点链接指向 `/job/detail?id=<19位数字>`。语义锚点，DB 可覆盖。
 */
const GUOPIN_DETAIL_LINK = 'a[href*="job/detail"], a[href*="/job?"]'
/** 公司链接锚点。 */
const GUOPIN_COMPANY_LINK = 'a[href*="/company"]'

/** 详情 URL 里抠出岗位 id：`/job/detail?id=<数字>`。 */
export const GUOPIN_JOB_ID_PATTERN = '/job/detail\\?id=(\\d+)'

/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id。 */
export const GUOPIN_DETAIL_URL_TEMPLATE = 'https://www.iguopin.com/job/detail?id={jobId}'

/** 薪资文本模式（组合行 `10~13K校招应届生硕士` 的薪资格，或独立「面议」）。 */
export const GUOPIN_SALARY_PATTERN = '面议|\\d+(?:\\.\\d+)?\\s*~\\s*\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*元/天'

/** 城市模式：国聘用全角书名号 `「<城市-区域>」` 包裹（实测多种形态，缺省按 城市/区域 拆）。 */
export const GUOPIN_CITY_PATTERN = '「([^「」]*)」'

/** 经验词表（组合行尾部，实测诸形态）。 */
export const GUOPIN_EXP_PATTERN = '(应届生|在校生|经验不限|1年以内|1-3年|3-5年|5-10年|10-15年|15-20年|20年以上|\\d+年)'

/** 学历词表。 */
export const GUOPIN_EDU_PATTERN = '(博士|硕士|本科|大专|无学历要求|中专|高中)'

/** 招聘性质词表（放 tags，国聘是重要筛选维度：校招/社招/实习/见习/公职/兼职）。 */
export const GUOPIN_NATURE_PATTERN = '(校招|社招|实习|见习|公职类|兼职)'

/** 公司性质词表（从 `国企500-1000人商务服务业` 这类行拆出）。 */
export const GUOPIN_NATURE_COMPANY_PATTERN = '(国有企业|国企|民营企业|民营|上市公司|事业单位|地方政府|外商独资|中外合资|其他)'

/** 公司规模模式（`1000-2000人` / `50人以下`）。 */
export const GUOPIN_SIZE_PATTERN = '(\\d+\\s*-\\s*\\d+人|\\d+人(?:以下|以上|以内)?)'

/**
 * 单次抓取的页数上限。分页参数未确证（见文件头）→ v1 单页采集是平台事实，不是保守取舍。
 * 等 probe:guopin 夹具确认分页参数后放开。
 */
export const GUOPIN_MAX_PAGES = 1

/** 结构锚点集。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface GuopinSelectors {
  /** 岗位详情链接锚点（卡片内跳转详情）。 */
  detailLink: string
  /** 公司链接锚点。 */
  companyLink: string
  /** 单条卡片容器，向上 `closest()` 用它包裹详情链接（宽松默认，待夹具校准成精确 class）。 */
  container: string
  /** 详情页选择器。 */
  detailTitle: string
  detailSalary: string
  detailCompany: string
  /** JD 全文（职位介绍）。 */
  detailJdText: string
  /** 分页容器（未确证，占位）。 */
  pagination: string
}

export interface GuopinUrlParams {
  base: string
  keywordParam: string
}

export interface GuopinConfig {
  selectors: GuopinSelectors
  urlParams: GuopinUrlParams
  /**
   * 城市码。**只放实测确认过的**；调研期筛选栏有城市名但 URL 城市参数未实证，故 v1 置空。
   * 未列出城市 `buildSearchUrl` 返回 null（入口层拒绝），**不猜**。逐城实测后写 DB 覆盖。
   */
  cityCodes: Record<string, string>
  /** 从详情链接里抠平台 id 的模式。 */
  jobIdPattern: string
  detailUrlTemplate: string
  salaryPattern: string
  cityPattern: string
  expPattern: string
  eduPattern: string
  /** 招聘性质词（校招/社招…，进 tags）。 */
  naturePattern: string
  /** 公司性质词。 */
  companyNaturePattern: string
  /** 公司规模模式。 */
  companySizePattern: string
}

export const DEFAULT_GUOPIN_CONFIG: GuopinConfig = {
  selectors: {
    detailLink: GUOPIN_DETAIL_LINK,
    companyLink: GUOPIN_COMPANY_LINK,
    // 宽松取一个条目容器；list 里 li 最普遍。未确证，夹具校准后改精确 class。
    container: 'li, [class*="card"], [class*="item"]',
    detailTitle: 'h1, .detail-title, [class*="title"]',
    detailSalary: '[class*="salary"], [class*="amount"]',
    detailCompany: 'a[href*="/company"]',
    detailJdText: '[class*="job-desc"], [class*="jd"], [class*="intro"]',
    pagination: 'div[class*="pager"], [class*="page"]',
  },
  urlParams: {
    base: 'https://www.iguopin.com/jobList',
    keywordParam: 'keyword',
  },
  cityCodes: {},
  jobIdPattern: GUOPIN_JOB_ID_PATTERN,
  detailUrlTemplate: GUOPIN_DETAIL_URL_TEMPLATE,
  salaryPattern: GUOPIN_SALARY_PATTERN,
  cityPattern: GUOPIN_CITY_PATTERN,
  expPattern: GUOPIN_EXP_PATTERN,
  eduPattern: GUOPIN_EDU_PATTERN,
  naturePattern: GUOPIN_NATURE_PATTERN,
  companyNaturePattern: GUOPIN_NATURE_COMPANY_PATTERN,
  companySizePattern: GUOPIN_SIZE_PATTERN,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeGuopinConfig(override: unknown): GuopinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_GUOPIN_CONFIG
  const patch = override as Partial<GuopinConfig>
  const pattern = (key: keyof GuopinConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  return {
    selectors: { ...DEFAULT_GUOPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_GUOPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_GUOPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    jobIdPattern: pattern('jobIdPattern', DEFAULT_GUOPIN_CONFIG.jobIdPattern),
    detailUrlTemplate: pattern('detailUrlTemplate', DEFAULT_GUOPIN_CONFIG.detailUrlTemplate),
    salaryPattern: pattern('salaryPattern', DEFAULT_GUOPIN_CONFIG.salaryPattern),
    cityPattern: pattern('cityPattern', DEFAULT_GUOPIN_CONFIG.cityPattern),
    expPattern: pattern('expPattern', DEFAULT_GUOPIN_CONFIG.expPattern),
    eduPattern: pattern('eduPattern', DEFAULT_GUOPIN_CONFIG.eduPattern),
    naturePattern: pattern('naturePattern', DEFAULT_GUOPIN_CONFIG.naturePattern),
    companyNaturePattern: pattern('companyNaturePattern', DEFAULT_GUOPIN_CONFIG.companyNaturePattern),
    companySizePattern: pattern('companySizePattern', DEFAULT_GUOPIN_CONFIG.companySizePattern),
  }
}

/** 用平台 id 构造详情 URL。 */
export function buildGuopinJobDetailUrl(config: GuopinConfig, jobId: string): string {
  return config.detailUrlTemplate.split('{jobId}').join(jobId)
}

/**
 * 构造列表页 URL：`https://www.iguopin.com/jobList?keyword=<kw>`。
 * 城市码未配置（v1 空表）时带城市即返回 null —— **不猜**。
 * 页码：分页参数未确证，v1 单页（不加页码参数）。
 */
export function buildGuopinSearchUrl(config: GuopinConfig, criteria: SearchCriteria): string | null {
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}

/**
 * **在页面上下文里**解析列表页 —— 语义锚点（详见文件头），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 策略：以「岗位详情链接」为锚（国聘列表卡片内标题/职能可点跳详情），
 * 每找到一个详情链接 → 用 `closest(container)` 定位单条容器 → 文本抽取各字段。
 * 抠不到 id 的卡片记 note、`platformJobId` 留空（由 sentinel 兜底隔离），不编。
 */
export function extractJobsInPage(arg: GuopinConfig): RawJob[] {
  const out: RawJob[] = []

  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const idRe = compile(arg.jobIdPattern)
  const cityRe = compile(arg.cityPattern)
  const salaryRe = compile(arg.salaryPattern)
  const expRe = compile(arg.expPattern)
  const eduRe = compile(arg.eduPattern)
  const natureRe = compile(arg.naturePattern)
  const companyNatureRe = compile(arg.companyNaturePattern)
  const sizeRe = compile(arg.companySizePattern)

  /** 在容器文本上抽「城市-区域」：优先从 `「x」` 拆。 */
  const splitCity = (text: string): { city: string; district: string } => {
    const m = cityRe === null ? null : cityRe.exec(text)
    const inner = m !== null && m[1] !== undefined ? (m[1] as string).trim() : ''
    const firstDash = inner.indexOf('-')
    if (firstDash > 0) {
      return { city: inner.slice(0, firstDash).trim(), district: inner.slice(firstDash + 1).trim() }
    }
    return { city: inner, district: '' }
  }

  let links: NodeListOf<Element> | null = null
  try {
    links = document.querySelectorAll(arg.selectors.detailLink)
  } catch {
    links = null
  }
  if (links === null) return out
  if (links.length === 0) return out

  for (const link of Array.from(links)) {
    const href = link.getAttribute('href') ?? ''
    if (href === '') continue

    let container: Element = link
    try {
      container = link.closest(arg.selectors.container) ?? link
    } catch {
      container = link
    }
    const boxText = (container.textContent ?? '').replace(/\s+/g, ' ').trim()

    const idMatch = idRe !== null ? idRe.exec(href) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    // 标题：优先详情链接文本；兜底取详情链接前的容器文本段。
    let title = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') {
      const pre = boxText.slice(0, boxText.indexOf('「'))
      title = pre.trim() === '' ? boxText.slice(0, 60).trim() : pre.trim()
    }

    // 城市 / 区域。
    const loc = splitCity(boxText)
    const city = loc.city
    const district = loc.district

    // 组合行抽 薪资/性质/经验/学历（不限顺序，各自词表匹配；薪资「面议」是合法值）。
    const salaryMatch = salaryRe !== null ? salaryRe.exec(boxText) : null
    const salaryRaw = salaryMatch !== null ? salaryMatch[0].replace(/\s+/g, '') : ''
    const natureMatch = natureRe !== null ? natureRe.exec(boxText) : null
    const expMatch = expRe !== null ? expRe.exec(boxText) : null
    const eduMatch = eduRe !== null ? eduRe.exec(boxText) : null
    const nature = natureMatch !== null ? (natureMatch[1] ?? '') : ''
    const expReq = expMatch !== null ? (expMatch[1] ?? '') : ''
    const eduReq = eduMatch !== null ? (eduMatch[1] ?? '') : ''

    // 公司：第一个 `/company` 链接文本。
    let company = ''
    try {
      const companyLink = container.querySelector(arg.selectors.companyLink)
      if (companyLink !== null) {
        company = (companyLink.textContent ?? '').replace(/\s+/g, ' ').trim()
      }
    } catch {
      company = ''
    }

    // 公司性质/规模/行业：公司名下方「国企500-1000人商务服务业」行。
    let companyNature: string | null = null
    let companySize: string | null = null
    let industry: string | null = null
    if (company !== '') {
      const afterCompany = boxText.slice(boxText.indexOf(company) + company.length)
      const cnMatch = companyNatureRe !== null ? companyNatureRe.exec(afterCompany) : null
      const sizeMatch = sizeRe !== null ? sizeRe.exec(afterCompany) : null
      if (cnMatch !== null) companyNature = cnMatch[1] ?? null
      if (sizeMatch !== null) companySize = sizeMatch[1]?.replace(/\s+/g, '') ?? null
      if (sizeMatch !== null) {
        const rest = afterCompany.slice((sizeMatch[0] ?? '').length)
        industry = rest.trim() === '' ? null : rest.trim()
      }
    }

    const tags: string[] = []
    if (nature !== '') tags.push(nature)
    if (expReq !== '') tags.push(expReq)
    if (eduReq !== '') tags.push(eduReq)

    const notes: string[] = []
    if (platformJobId === '') notes.push('详情链接未锚定岗位 id，待 probe:guopin 校准')
    if (salaryRaw === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 相对路径拼不成就原样给，字段断言会兜 */
    }

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(district === '' ? {} : { district }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      tags,
      ...(industry === null ? {} : { industry }),
      ...(companySize === null ? {} : { companySize }),
      ...(companyNature === null ? {} : { companyNature }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析详情页（`/job/detail?id=`）。
 * ⚠️ 自包含；详情选择器为语义锚点，待 probe:guopin 详情夹具校准。
 */
export function extractDetailInPage(arg: { selectors: GuopinSelectors; jobIdPattern: string }): RawJobDetail {
  const pick = (selector: string): string => {
    try {
      return (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }
  const idMatch = new RegExp(arg.jobIdPattern).exec(location.href)
  const platformJobId = idMatch !== null && idMatch[1] !== undefined ? (idMatch[1] as string) : ''

  let company = ''
  try {
    const link = document.querySelector(arg.selectors.companyLink)
    if (link !== null) company = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
  } catch {
    company = ''
  }

  return {
    platformJobId,
    title: pick(arg.selectors.detailTitle),
    salaryRaw: pick(arg.selectors.detailSalary),
    company,
    sourceUrl: location.href,
    jdText: pick(arg.selectors.detailJdText),
  }
}

/**
 * **在页面上下文里**判断撞上风控 / 登录墙。
 * 国聘是政府平台：antiBot 低档，走通用文案判定，不编平台特有墙信号。
 */
export function detectBlockInPage(arg: { detailLink: string }): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')
  let links = 0
  try {
    links = document.querySelectorAll(arg.detailLink).length
  } catch {
    links = 0
  }

  const captcha = document.querySelector(
    '.geetest_panel, .geetest_holder, .geetest_box, #nc_1_wrapper, iframe[src*="captcha"], #captcha, [class*="verify-wrap"], .waf-nc-title, script[name^="aliyunwaf_"]',
  )
  if (captcha !== null) return 'captcha'
  if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|安全验证|异常流量|人机验证/.test(compact)) {
    return 'rate-limited'
  }
  if (links === 0) {
    // 列表页没锚到详情链接：可能是登录墙 / 空页 / 改版。
    if (/请先登录|登录后才能|请登录|扫码登录/.test(compact)) return 'login-required'
    if (compact.length < 120) return 'blank'
  }
  return null
}

export interface GuopinAdapterOptions {
  config?: GuopinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造国聘网适配器。 */
export function createGuopinAdapter(options: GuopinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_GUOPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '城市码未实测（调研期 URL 城市参数未实证），v1 置空 —— 待逐城实测后写 DB 覆盖；未列城市一律拒绝',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: GUOPIN_MAX_PAGES,
      hint: '分页参数未确证（?p=2 未翻页），v1 单页采集；探针夹具确认分页契约后放开',
    },
  ]

  return {
    id: 'guopin',
    displayName: '国聘网',
    capabilities: {
      // 列表页未登录可看（投递才要登录）；薪资大量「面议」为合法值。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 详情链接/薪资/公司锚点待夹具校准，可能偶发缺失 → medium。
      fieldCompleteness: 'medium',
      antiBot: 'low',
    },
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: GUOPIN_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildGuopinSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildGuopinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`国聘网：城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        await page.goto(url)
        // 页面服务端可渲染，但仍等一次详情链接锚点存在：0 条最易被误读成「今天没有新岗位」。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.detailLink, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, config)
      },

      async hasNextPage(): Promise<boolean> {
        // 分页参数未确证（见文件头）—— 恒 false；probe:guopin 夹具确认后补真实分页契约。
        return false
      },
    },

    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, {
          selectors: config.selectors,
          jobIdPattern: config.jobIdPattern,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockInPage, { detailLink: config.selectors.detailLink })
      },
    },

    // ⚠️ 不实现 `actions.sayHello` / `actions.sendResume`：国聘投递要登录态且未见稳定按钮契约，
    //    fail-closed（见 docs/ADAPTERS.md §6），而不是上线一个会乱点的实现。
  }
}