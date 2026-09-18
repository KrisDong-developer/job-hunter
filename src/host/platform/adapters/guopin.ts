/**
 * 国聘网（iguopin.com）适配器 —— 2026-09-18 基于真实线上页面一手调研。
 *
 * 国聘网是「国聘行动」官方平台（国务院国资委推动、央视总台合作），聚合大量央企 /
 * 国企 / 事业单位 / 部分民企岗位，校招（秋招/春招）与社招并重。运行方为国投人力。
 *
 * ## 调研来源（2026-09-18 直接抓取线上 + probe 夹具实证，非二手资料）
 *
 * * **列表页**：真实路由 `/jobList?keyword=<明文>` **302 到 `/job?keyword=Java`**
 *   （probe 实证，2026-09-18）。未登录可看、服务端 SSR。
 * * **详情页**：`https://www.iguopin.com/job/detail?id=<19位数字>`（WebFetch 实证命中
 *   「财税管理岗（校招）」详情页）。页面含标题 / 更新于 / 薪资 / 公司 / 职位性质 /
 *   招聘人数 / 最低学历 / 工作经验 / 专业要求 / 行业要求 / **报名截止** / 职位介绍（度量 JD）。
 * * **列表卡片真实 DOM**（probe 实证，`test/fixtures/guopin-search.html`）：
 *
 *   ```html
 *   <div class="job-card">
 *     <div class="job-title" title="java后端 「北京-东城区」">   ← 标题+城市（全角书名号）
 *       <div class="job-name">java后端</div>
 *     </div>
 *     <div class="job-info">     ← 3 个 tag：「性质/经验/学历」（顺序不固定，经验偶缺）
 *       <span class="tag-item">校招</span><span>应届生</span><span>本科</span>
 *     </div>
 *     <div class="job-tag"><span class="ant-tag">Java工程师</span>…</div>
 *     <a class="company-name" href="/company?id=…" title="…">…</a>  ← 公司（文本可能省略号截断）
 *     <div class="company-info">  ← 顺序固定 ×3：性质/规模/行业
 *       <span class="company-info-item">国企</span><span>1000-2000人</span><span>软件和信息技术服务业</span>
 *     </div>
 *   </div>
 *   ```
 *
 * ## ⚠️ 两个 phase-1 就被 probe 推翻的事实（决定本适配器形态）
 *
 * 1. **列表卡片无薪资**：`.job-info` 只有性质/经验/学历，薪资只出现在详情页。
 *    因此 `requiredFields` **不含 `salary_raw`**（否则每条都被隔离）；`salaryRaw` 留空，
 *    由详情抓取（detail.extract）补。
 * 2. **列表页无平台 id**：无 `/job/detail?id=` 链接、无 `__NEXT_DATA__`/`jobId`/`positionId`
 *    持久化载荷。id 只在详情页。⇒ **upsert 幂等键用内容哈希**（用户拍板）：
 *    `platformJobId = "ch:" + FNV1a(title|company|city|district)`，deterministic，
 *    同岗位重复抓不重复；`sourceUrl` 存列表页 URL（不编详情 URL）。
 *
 * ## 分页 / 城市码：仍未确证（**不编**）
 *
 * * **分页参数未确证**：真实路由 `/job?keyword=` 无页码参数；从页面底部数字分页拿到
 *   真实 href 前，`hasNextPage` 恒 false、`maxPages=1`（单页采集，绝不去猜参数）。
 * * **城市码未实测**：筛选栏有北京/上海…，但 URL 城市参数未实证 → `cityCodes` 置空，
 *   未列出城市 `buildSearchUrl` 返回 null（入口层拒绝）。
 *
 * ## 判定墙
 *
 * 国聘是政府背景平台，未观测到 CDP 检测（对应 §7.1「51job/智联/神仙外企」那一档）。
 * `detectBlock` 走通用文案判定：验证控件 → 频控 → 登录墙 → 空页。列表页未登录可看
 * （投递才要登录），所以 `searchWithoutLogin: true`；antiBot 如实定 `low`。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'

/**
 * 列表卡片容器（probe 实证 `div.job-card` 命中 20）。以卡片为锚遍历，不再依赖详情链接。
 */
const GUOPIN_CARD = '.job-card'
/** 列表卡片公司链接锚点（`.company-name`，probe 实证；文本可能被截断，用 title 属性补全）。 */
const GUOPIN_COMPANY_LINK = '.company-name'
/** 详情页公司链接锚点（`/job/detail?id=` 页，WebFetch 实证）。 */
const GUOPIN_DETAIL_COMPANY_LINK = 'a[href*="/company"]'

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

/** 详情页报名截止模式（详情页正文「报名截止：2026-12-12 23:50:05」，为硬截止铺路）。 */
export const GUOPIN_DEADLINE_PATTERN = '报名截止[:：]\\s*([\\d\\-\\s:]+)'

/**
 * 单次抓取的页数上限。分页参数未确证（见文件头）→ v1 单页采集是平台事实，不是保守取舍。
 * 等 probe:guopin 夹具确认分页参数后放开。
 */
export const GUOPIN_MAX_PAGES = 1

/** 结构锚点集。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface GuopinSelectors {
  /** 列表卡片容器（probe 实证：`div.job-card`）。 */
  card: string
  /** 标题节点（`.job-name`，纯标题）。 */
  jobName: string
  /** 标题容器上带「城市-区域」的 title 属性名（`.job-title[title]`，如 `java后端 「北京-东城区」`）。 */
  jobTitleAttr: string
  /** 卡片内「性质/经验/学历」标签（`.job-info .tag-item`，顺序不固定，按词表归类）。 */
  jobInfoItems: string
  /** 公司链接（`.company-name`）。 */
  companyLink: string
  /** 公司「性质/规模/行业」三项（`.company-info .company-info-item`，顺序固定）。 */
  companyInfoItems: string
  /** 职能标签（`.job-tag .ant-tag`，进 tags）。 */
  jobTags: string
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
  /** 详情页报名截止模式（为接入 campus 硬截止铺路；解析不到则省略）。 */
  deadlinePattern: string
}

export const DEFAULT_GUOPIN_CONFIG: GuopinConfig = {
  selectors: {
    card: GUOPIN_CARD,
    jobName: '.job-name',
    jobTitleAttr: 'title',
    jobInfoItems: '.job-info .tag-item',
    companyLink: GUOPIN_COMPANY_LINK,
    companyInfoItems: '.company-info .company-info-item',
    jobTags: '.job-tag .ant-tag',
    detailTitle: 'h1, .detail-title, [class*="title"]',
    detailSalary: '[class*="salary"], [class*="amount"]',
    detailCompany: GUOPIN_DETAIL_COMPANY_LINK,
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
  deadlinePattern: GUOPIN_DEADLINE_PATTERN,
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
    deadlinePattern: pattern('deadlinePattern', DEFAULT_GUOPIN_CONFIG.deadlinePattern),
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
 * **在页面上下文里**解析列表页 —— 卡片遍历（probe 实证结构），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 事实（2026-09-18 probe 实证 `test/fixtures/guopin-search.html`）：
 *   * 卡片容器 `.job-card`；标题 `.job-name`；城市在 `.job-title[title]`（`标题 「城市-区域」`）；
 *   * `.job-info .tag-item` 是「性质/经验/学历」（顺序不固定，经验偶缺，按词表归类）；
 *   * **列表卡片无薪资、无岗位 id、无详情链接 / 持久化载荷** —— 详见文件头；
 *   * 公司 `.company-name`（文本可能被省略号截断，用 title 属性补全）；
   *   * `.company-info .company-info-item` 顺序固定：性质/规模/行业；
   *   * `.job-tag .ant-tag` 是职能标签（进 tags）。
 *
 * 幂等键：列表无 id → `platformJobId` 用内容哈希（FNV-1a，同步、自包含）——
 * `ch:` + hash(title|company|city|district)，deterministic，同岗位重复抓不重复。
 * ▸ 这是用户拍板的方案（列表页无 id 的适应层兜底），不是平台 id；`sourceUrl` 存列表页 url。
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
  const cityRe = compile(arg.cityPattern)
  const expRe = compile(arg.expPattern)
  const eduRe = compile(arg.eduPattern)
  const natureRe = compile(arg.naturePattern)

  /** 确定性内容哈希（FNV-1a 32bit → hex）。自包含、同步，页面/夹具都可跑。 */
  const contentKey = (title: string, company: string, city: string, district: string): string => {
    const s = `${title}\u0001${company}\u0001${city}\u0001${district}`
    let h = 2166136261
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return `ch:${(h >>> 0).toString(16)}`
  }

  /** 抽「城市-区域」。 */
  const splitCity = (text: string): { city: string; district: string } => {
    const m = cityRe === null ? null : cityRe.exec(text)
    const inner = m !== null && m[1] !== undefined ? (m[1] as string).trim() : ''
    const firstDash = inner.indexOf('-')
    if (firstDash > 0) {
      return { city: inner.slice(0, firstDash).trim(), district: inner.slice(firstDash + 1).trim() }
    }
    return { city: inner, district: '' }
  }

  const clean = (node: Element | null): string =>
    node === null ? '' : (node.textContent ?? '').replace(/\s+/g, ' ').trim()

  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    cards = null
  }
  if (cards === null) return out

  for (const card of Array.from(cards)) {
    // 标题 + 城市/区域。
    let title = clean(card.querySelector(arg.selectors.jobName))
    let city = ''
    let district = ''
    try {
      // `.job-title[title]` 带「城市-区域」；company-name 的 title 在其后，取第一个 [title] 即可。
      const titleWrap = card.querySelector('[title]')
      if (titleWrap !== null) {
        const attrText = (titleWrap.getAttribute(arg.selectors.jobTitleAttr) ?? '').replace(/\s+/g, ' ').trim()
        if (attrText !== '') {
          const loc = splitCity(attrText)
          city = loc.city
          district = loc.district
          if (title === '') {
            title = city === '' ? attrText : attrText.slice(0, attrText.indexOf('「')).trim()
          }
        }
      }
    } catch {
      /* 城市拿不到就留空 */
    }
    if (title === '') continue

    // 「性质/经验/学历」标签：顺序不固定、经验偶缺，按词表归类。
    let nature = ''
    let expReq = ''
    let eduReq = ''
    try {
      for (const item of Array.from(card.querySelectorAll(arg.selectors.jobInfoItems))) {
        const t = clean(item)
        if (t === '') continue
        if (natureRe !== null && natureRe.test(t)) nature = t
        else if (eduRe !== null && eduRe.test(t)) eduReq = t
        else if (expRe !== null && expRe.test(t)) expReq = t
      }
    } catch {
      /* 留空 */
    }

    // 公司：`.company-name`（title 属性补全文）。
    let company = ''
    try {
      const cl = card.querySelector(arg.selectors.companyLink)
      if (cl !== null) {
        company = (cl.getAttribute('title') ?? cl.textContent ?? '').replace(/\s+/g, ' ').trim()
      }
    } catch {
      company = ''
    }

    // 公司性质/规模/行业：`.company-info .company-info-item` 顺序固定 ×3。
    let companyNature: string | null = null
    let companySize: string | null = null
    let industry: string | null = null
    try {
      const items = Array.from(card.querySelectorAll(arg.selectors.companyInfoItems)).map((node) =>
        clean(node),
      )
      companyNature = items[0] ?? null
      companySize = items[1] ?? null
      industry = items[2] ?? null
    } catch {
      /* 留空 */
    }

    // 职能标签。
    const fnTags: string[] = []
    try {
      for (const node of Array.from(card.querySelectorAll(arg.selectors.jobTags))) {
        const t = clean(node)
        if (t !== '') fnTags.push(t)
      }
    } catch {
      /* 忽略 */
    }

    const tags: string[] = []
    for (const t of [nature, expReq, eduReq, ...fnTags]) {
      if (t !== '' && !tags.includes(t)) tags.push(t)
    }

    const notes: string[] = []
    if (company === '') notes.push('公司未锚定，待校准')

    // 列表无平台 id → 内容哈希幂等键（用户拍板方案）；sourceUrl 存列表页（回到列表）。
    const platformJobId = contentKey(title, company, city, district)
    const sourceUrl = location.href

    out.push({
      platformJobId,
      title,
      salaryRaw: '',
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
export function extractDetailInPage(arg: {
  selectors: GuopinSelectors
  jobIdPattern: string
  deadlinePattern: string
}): RawJobDetail {
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
    const link = document.querySelector(arg.selectors.detailCompany)
    if (link !== null) company = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
  } catch {
    company = ''
  }

  // 报名截止：从详情页正文抽「报名截止：<时间>」，为 campus 硬截止铺路（RawJobDetail.applyDeadline）。
  let applyDeadline: string | null = null
  try {
    const m = new RegExp(arg.deadlinePattern).exec(document.body?.textContent ?? '')
    if (m !== null && m[1] !== undefined) {
      const raw = (m[1] as string).trim()
      applyDeadline = raw === '' ? null : raw
    }
  } catch {
    applyDeadline = null
  }

  return {
    platformJobId,
    title: pick(arg.selectors.detailTitle),
    salaryRaw: pick(arg.selectors.detailSalary),
    company,
    sourceUrl: location.href,
    jdText: pick(arg.selectors.detailJdText),
    ...(applyDeadline === null ? {} : { applyDeadline }),
  }
}

/**
 * **在页面上下文里**判断撞上风控 / 登录墙。
 * 国聘是政府平台：antiBot 低档，走通用文案判定，不编平台特有墙信号。
 */
export function detectBlockInPage(arg: { card: string }): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')
  let cards = 0
  try {
    cards = document.querySelectorAll(arg.card).length
  } catch {
    cards = 0
  }

  const captcha = document.querySelector(
    '.geetest_panel, .geetest_holder, .geetest_box, #nc_1_wrapper, iframe[src*="captcha"], #captcha, [class*="verify-wrap"], .waf-nc-title, script[name^="aliyunwaf_"]',
  )
  if (captcha !== null) return 'captcha'
  if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|安全验证|异常流量|人机验证/.test(compact)) {
    return 'rate-limited'
  }
  if (cards === 0) {
    // 列表页没卡片：可能是登录墙 / 空页 / 改版。
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
    ...platformFacts('guopin'),
    displayName: '国聘网',
    capabilities: {
      // 列表页未登录可看（投递才要登录）。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 列表卡片**无薪资**（probe 实证）→ salary_raw 不在必需字段里；其余核心字段齐全。
      fieldCompleteness: 'medium',
      antiBot: 'low',
    },
    // 列表卡片无薪资、无平台 id（幂等键用内容哈希）→ 核心必需字段只声名 title/company/source_url。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
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
        // 页面服务端可渲染，但仍等一次卡片容器存在：0 条最易被误读成「今天没有新岗位」。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
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
          deadlinePattern: config.deadlinePattern,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockInPage, { card: config.selectors.card })
      },
    },

    // ⚠️ 不实现 `actions.sayHello` / `actions.sendResume`：国聘投递要登录态且未见稳定按钮契约，
    //    fail-closed（见 docs/ADAPTERS.md §6），而不是上线一个会乱点的实现。
  }
}