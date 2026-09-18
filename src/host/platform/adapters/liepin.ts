/**
 * 猎聘（liepin.com）适配器 —— 风控强度最高的平台（R4 / `docs/ADAPTERS.md` §7.1）。
 *
 * ## 路线（D-17a 环境一致性）
 *
 * 平台层已就位的三件套是**能不能进门**的前提，本适配器自己不做任何反检测：
 *   * patchright 引擎（`platform/browser.ts`，默认 auto → 优先 patchright）；
 *   * stealth 注入（`platform/stealth.ts`）；
 *   * 端口守卫（`platform/cdp-guard.ts`，仅 TCP 调试端口开着时）。
 * 探针结论（§7.1）：猎聘检测的是"CDP 控制页面"的痕迹**本身**（`security.min.js`
 * 主动探测 + 页面被 `location.replace('about:blank')` 销毁），
 * 原版 playwright-core 与 attach 日常 Chrome 都过不去 —— 必须走 patchright 启动式。
 *
 * ## 猎聘特有信号
 *
 * 风控命中时页面被**整体销毁**成 about:blank —— `detectBlock` 把它判为 `blank`，
 * 调用方命中即停（C12），**绝不重试**（重试 = 再撞一次枪口）。
 *
 * ## 解析策略：语义锚点，不是类名锚点
 *
 * 猎聘是构建产物 DOM（class 混淆、随版本变），类名锚点易腐烂。
 * v1 用**语义锚点**（get_jobs 生产验证过的稳定结构）：
 *   * 卡片容器 `div[class*='job-card-pc-container']`（get_jobs Locators 生产在用）；
 *   * 职位链接 `a[href*='/job/']`：标题 + 详情 URL + 平台 id 三合一；
 *   * 公司链接 `a[href*='/company/']`：公司名（待夹具校准，锚不中就留空）；
 *   * 薪资：卡片文本匹配薪资模式（与 `parseSalary` 同一族形态）；
 *   * 「城市·经验·学历」三段文本：只在第三段命中学历词时才采信。
 *
 * **不编选择器**：锚不中的字段留空，由字段级断言隔离进 `pending_repair`
 * （原始片段保留，修好选择器后可重放）—— 这是 §4.2.4 设计好的降级路径。
 * 全部锚点与模式都在配置里（DB 可覆盖），待 `npm run probe:liepin` 保存的真实
 * 夹具（`test/fixtures/liepin-search.html`）校准后可换成精确选择器。
 *
 * ## 翻页（2026-09-18 实测验证）
 *
 * URL 参数 `currentPage`（**0 起**）真换数据：v8 探针对比第 1/2 页夹具，
 * 各 42 个 jobId **零重叠**（`test/fixtures/liepin-search{-p2}.html` 是证据，
 * 对应回归测试见 `test/platform/liepin.test.ts`）。只读采集用 URL 导航
 * （ADR-9），不需要 get_jobs 那种 AntD 按钮点击（那是投递场景）。
 * `hasNextPage` 看 `.list-pagination-box li.ant-pagination-next` 是否
 * disabled（夹具实测共 21 页）。
 *
 * ## 调研结论（夹具 + 接口采样交叉验证，2026-09-18）
 *
 * * 搜索接口 `POST api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`，
 *   请求体 `mainSearchPcConditionForm` 暴露了全部筛选参数：`city/dq`（码）、
 *   `pubTime`、`salaryCode`、`workYearCode`、`eduLevel`、`industry`、`compScale`…
 *   —— 但**只有 city 有 URL 证据**，其余维度不在搜索 URL 上（JS 控件），
 *   所以本适配器只声明 keyword/city/maxPages，**不编**其余维度；
 * * 无城市时接口默认 `city=410`（= 全国，接口采样证据）；具体城市码需逐城实测；
 * * 响应里的 `job.dq` 是**中文**（如 `北京-海淀区`），与 DOM【】文本一致；
 * * 响应字段比 DOM 富得多：`labels`（职位标签）、`refreshTime`（yyyymmddHHMMss）、
 *   `compId`、`recruiter.*`（HR 名/头衔/imId/是否已聊过）、`advViewFlag`（广告位）、
 *   `pcOuterLink`（外链岗）—— 这是 v2 接口化解析的方向（采样已存
 *   `test/fixtures/liepin-search-api*.json`）。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../types.js'

/** 结构锚点集（2026-09-18 由 v8 探针真实夹具校准）。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface LiepinSelectors {
  /** 卡片容器（get_jobs 生产验证 + 夹具确认：`div._40108Nrnc3.job-card-pc-container`）。 */
  card: string
  /**
   * 职位链接：猎聘给语义属性 `data-nick="job-detail-job-info"`（比 href 更精确，
   * 夹具确认每张真职位卡恰好一条；广告卡没有）。标题/薪资/经验/学历都在这个链接内。
   */
  jobLink: string
  /** 公司信息盒：`data-nick="job-detail-company-info"`，内含公司名/行业/规模三个 span。 */
  companyInfoBox: string
  /** 标题节点：链接内带 title 属性的 div（夹具：`<div class="ellipsis-1" title="招聘Java工程师">`）。 */
  titleNode: string
  /** 分页容器（AntD）。 */
  pagination: string
  /** 「下一页」按钮所在 li（get_jobs 生产验证）。 */
  nextPage: string
  /** 「下一页」disabled 的类名标记。 */
  nextPageDisabledClass: string
}

/** 字段 → URL 参数映射（get_jobs `getSearchUrl()` 同款：city 与 dq 双参数）。 */
export interface LiepinUrlParams {
  base: string
  keywordParam: string
  cityParam: string
  cityAliasParam: string
  /** 页码参数（**0 起**；本项目的 criteria.page 是 1 起，构造时换算）。 */
  pageParam: string
}

export interface LiepinConfig {
  selectors: LiepinSelectors
  urlParams: LiepinUrlParams
  /**
   * 城市名 → 平台城市码。**只放验证过的**；未列出的城市 buildSearchUrl 返回
   * null（入口层拒绝），**不猜**。城市码可在自己浏览器里开猎聘搜索页从 URL 抄，
   * 写进 DB 覆盖。`全国` → 空串 = 不带城市参数。
   */
  cityCodes: Record<string, string>
  /** 薪资文本模式（字符串形态，会序列化进页面）。 */
  salaryPattern: string
  /** 职位链接里抠平台 id 的模式。 */
  jobIdPattern: string
  /** 城市模式：猎聘把城市包在【】里（夹具实测：`Java工程师【佛山-顺德区】急聘…`）。 */
  cityPattern: string
  /** 经验词模式（链接文本尾部匹配，夹具实测如「5年以上」）。 */
  expPattern: string
  /** 学历词模式（夹具实测如「本科」）。 */
  eduPattern: string
  /**
   * v2 接口化解析（P1）：非空时 `readListPage` 先在页面上下文里 POST 搜索接口，
   * 失败/为空自动回退 DOM 解析（双通道，永不比 v1 差）。
   * ⚠️ 请求体里的 `ckId` 透传字段留空 —— 真实页面会带会话 ckId，留空是否被
   * 服务端接受**待下次真实抓取验证**；不接受也无妨，会静默走 DOM 通道。
   */
  searchApiOrigin: string
  searchApiPath: string
  /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
  searchApiEnabled: boolean
}

export const LIEPIN_SALARY_PATTERN =
  '\\d+(?:\\.\\d+)?\\s*[-~]\\s*\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*[kK万]\\s*以上|面议'

/** 岗位链接形态（夹具实测两种并存）：`/job/<纯数字>.shtml`（普通岗）与
 * `/a/<纯数字>.shtml`（Agent/劳务类岗，如「测试工程师（不要Java）」）。
 * 两者都是真实职位，都要收。
 */
export const LIEPIN_JOB_ID_PATTERN = '/(?:job|a)/(\\d+)\\.shtml'

/**
 * 搜索接口（v2 接口化解析，2026-09-18 采样）：
 * `POST https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`。
 * 响应比 DOM 富（labels/refreshTime/compId/recruiter），refreshTime 让
 * publishedAt 首次可用。请求体结构来自真实采样（见 fixtures/liepin-search-api.json）。
 */
export const LIEPIN_SEARCH_API_PATH = '/api/com.liepin.searchfront4c.pc-search-job'

/** 城市：夹具实测「Java工程师【佛山-顺德区】急聘15-30k·14薪」——【】里就是城市。 */
export const LIEPIN_CITY_PATTERN = '【([^】]{2,15})】'

/** 经验/学历词表（夹具实测位于链接文本尾部，如「5年以上本科」）。 */
export const LIEPIN_EXP_PATTERN = '(\\d+年以上|\\d+年以内|1年以下|经验不限|在校生|应届生)'
export const LIEPIN_EDU_PATTERN = '(本科|硕士|博士|大专|学历不限|中专|高中|MBA|统招本科)'

/**
 * 单次抓取的页数上限。猎聘 antiBot=high，给得比 51job/智联更保守：
 * 默认 3 页、上限 8 页。
 */
export const LIEPIN_DEFAULT_MAX_PAGES = 3
export const LIEPIN_MAX_PAGES = 8

export const DEFAULT_LIEPIN_CONFIG: LiepinConfig = {
  selectors: {
    card: "div[class*='job-card-pc-container']",
    jobLink: "a[data-nick='job-detail-job-info']",
    companyInfoBox: "[data-nick='job-detail-company-info']",
    titleNode: 'div[title]',
    pagination: '.list-pagination-box',
    nextPage: 'li.ant-pagination-next',
    nextPageDisabledClass: 'ant-pagination-disabled',
  },
  urlParams: {
    base: 'https://www.liepin.com/zhaopin/',
    keywordParam: 'key',
    cityParam: 'city',
    cityAliasParam: 'dq',
    pageParam: 'currentPage',
  },
  cityCodes: {
    // 全国 = 不带城市参数（最像真人默认进入）。接口采样证据：无 city 时
    // 站点自己发 `city=410&dq=410`（410 = 全国）。
    // 具体城市码**没有可靠来源，不编**：从自己浏览器的猎聘搜索 URL 抄，
    // 写进 DB 覆盖（setting scope='platform' scope_ref='liepin' key='adapter-config'）。
    全国: '',
  },
  salaryPattern: LIEPIN_SALARY_PATTERN,
  jobIdPattern: LIEPIN_JOB_ID_PATTERN,
  cityPattern: LIEPIN_CITY_PATTERN,
  expPattern: LIEPIN_EXP_PATTERN,
  eduPattern: LIEPIN_EDU_PATTERN,
  searchApiOrigin: 'https://api-c.liepin.com',
  searchApiPath: LIEPIN_SEARCH_API_PATH,
  searchApiEnabled: true,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeLiepinConfig(override: unknown): LiepinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_LIEPIN_CONFIG
  const patch = override as Partial<LiepinConfig>
  const pattern = (key: keyof LiepinConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  return {
    selectors: { ...DEFAULT_LIEPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_LIEPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_LIEPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    salaryPattern: pattern('salaryPattern', DEFAULT_LIEPIN_CONFIG.salaryPattern),
    jobIdPattern: pattern('jobIdPattern', DEFAULT_LIEPIN_CONFIG.jobIdPattern),
    cityPattern: pattern('cityPattern', DEFAULT_LIEPIN_CONFIG.cityPattern),
    expPattern: pattern('expPattern', DEFAULT_LIEPIN_CONFIG.expPattern),
    eduPattern: pattern('eduPattern', DEFAULT_LIEPIN_CONFIG.eduPattern),
    searchApiOrigin: pattern('searchApiOrigin', DEFAULT_LIEPIN_CONFIG.searchApiOrigin),
    searchApiPath: pattern('searchApiPath', DEFAULT_LIEPIN_CONFIG.searchApiPath),
    searchApiEnabled:
      typeof patch.searchApiEnabled === 'boolean' ? patch.searchApiEnabled : DEFAULT_LIEPIN_CONFIG.searchApiEnabled,
  }
}

/**
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export function buildLiepinSearchUrl(config: LiepinConfig, criteria: SearchCriteria): string | null {
  let cityCode: string | undefined
  if (criteria.city !== undefined && criteria.city !== '') {
    cityCode = config.cityCodes[criteria.city]
    if (cityCode === undefined) return null
  }

  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (cityCode !== undefined && cityCode !== '') {
    params.set(config.urlParams.cityParam, cityCode)
    params.set(config.urlParams.cityAliasParam, cityCode)
  }
  // criteria.page 是 1 起；猎聘 currentPage 是 0 起（get_jobs 实测首页为 0）。
  const page = criteria.page === undefined ? 1 : criteria.page
  params.set(config.urlParams.pageParam, String(Math.max(0, page - 1)))

  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}

/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 */
export function buildSearchRequestBody(criteria: SearchCriteria, cityCode: string): Record<string, unknown> {
  const page = criteria.page === undefined ? 1 : criteria.page
  const form: Record<string, unknown> = {
    city: cityCode,
    dq: cityCode,
    pubTime: '',
    currentPage: String(Math.max(0, page - 1)),
    pageSize: 40,
    key: criteria.keyword ?? '',
    suggestTag: '',
    workYearCode: '',
    compId: '',
    compName: '',
    compTag: '',
    industry: '',
    salaryCode: '',
    jobKind: '',
    compScale: '',
    compKind: '',
    compStage: '',
    eduLevel: '',
    salaryLow: '',
    salaryHigh: '',
  }
  return {
    data: {
      mainSearchPcConditionForm: form,
      passThroughForm: { scene: 'init', skId: '', fkId: '', ckId: '' },
    },
  }
}

/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg: { apiPath: string; body: Record<string, unknown> }): Promise<unknown> {
  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch
  if (typeof fetchImpl !== 'function') return Promise.resolve(null)
  return fetchImpl(arg.apiPath, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(arg.body),
  })
    .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
    .catch(() => null)
}

/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export function refreshTimeToIso(raw: string): string | null {
  if (!/^\d{14}$/.test(raw)) return null
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export function parseSearchApiResponse(payload: unknown): RawJob[] {
  const out: RawJob[] = []
  if (payload === null || typeof payload !== 'object') return out
  const root = payload as {
    data?: { data?: { jobCardList?: unknown[] }; jobCardList?: unknown[] }
  }
  const cards = root.data?.data?.jobCardList ?? root.data?.jobCardList
  if (!Array.isArray(cards)) return out

  for (const entry of cards) {
    if (entry === null || typeof entry !== 'object') continue
    const item = entry as {
      job?: Record<string, unknown>
      comp?: Record<string, unknown>
    }
    const job = item.job
    const comp = item.comp
    if (job === undefined) continue
    const jobId = job['jobId']
    if (jobId === undefined || jobId === null || String(jobId) === '') continue

    const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
    const refreshIso = refreshTimeToIso(text(job['refreshTime']))
    const labels = job['labels']
    const tags = Array.isArray(labels)
      ? labels.filter((label): label is string => typeof label === 'string' && label !== '').slice(0, 6)
      : undefined

    out.push({
      platformJobId: String(jobId),
      title: text(job['title']),
      salaryRaw: text(job['salary']),
      company: comp === undefined ? '' : text(comp['compName']),
      sourceUrl: text(job['link']),
      city: text(job['dq']),
      expReq: text(job['requireWorkYears']),
      eduReq: text(job['requireEduLevel']),
      industry: comp === undefined ? null : text(comp['compIndustry']) || null,
      companySize: comp === undefined ? null : text(comp['compScale']) || null,
      publishedAt: refreshIso,
      ...(tags === undefined || tags.length === 0 ? {} : { tags }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上会被序列化送进浏览器执行，闭包不存在）。
 * 卡片结构（夹具实测）：
 *
 *   div.job-card-pc-container
 *     └ a[data-nick=job-detail-job-info]                 ← 职位链接（广告卡没有）
 *         ├ div[title="招聘Java工程师"] → Java工程师      ← 标题
 *         ├ 【佛山-顺德区】                               ← 城市
 *         ├ 15-30k·14薪                                  ← 薪资（文本模式）
 *         └ 5年以上 / 本科                                ← 经验/学历（词表）
 *     └ [data-nick=job-detail-company-info]
 *         └ span × 3：库卡机器人 / 工业自动化 / 2000-5000人
 *
 * 解析失败的字段留空/记 notes，由字段级断言隔离 —— **不编**。
 */
export function extractJobsInPage(arg: {
  selectors: LiepinSelectors
  salaryPattern: string
  jobIdPattern: string
  cityPattern: string
  expPattern: string
  eduPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    return out
  }
  if (cards === null) return out

  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const salaryRe = compile(arg.salaryPattern)
  const idRe = compile(arg.jobIdPattern)
  const cityRe = compile(arg.cityPattern)
  const expRe = compile(arg.expPattern)
  const eduRe = compile(arg.eduPattern)

  for (const card of Array.from(cards)) {
    let link: Element | null = null
    try {
      link = card.querySelector(arg.selectors.jobLink)
    } catch {
      link = null
    }
    // 广告/推荐卡没有职位链接 → 跳过（夹具实测 42 卡中 5 张属于此类）。
    if (link === null) continue

    const href = link.getAttribute('href') ?? ''
    if (href === '') continue
    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 相对路径拼不成就原样给，字段断言会兜 */
    }

    const linkText = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cardText = (card.textContent ?? '').replace(/\s+/g, ' ').trim()

    // 标题：优先链接内带 title 属性的节点（文本比 title 属性干净——后者带"招聘"前缀）。
    let title = ''
    try {
      const titleNode = link.querySelector(arg.selectors.titleNode)
      if (titleNode !== null) {
        title = (titleNode.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (title === '') title = (titleNode.getAttribute('title') ?? '').trim()
      }
    } catch {
      title = ''
    }
    if (title === '') {
      // 兜底：链接文本截到第一个【或数字（薪资/城市）之前。
      const head = /[【\d]/.exec(linkText)
      title = head !== null ? linkText.slice(0, head.index).trim() : linkText.slice(0, 40).trim()
    }
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    const cityMatch = cityRe !== null ? cityRe.exec(linkText) : null
    const city = cityMatch !== null ? (cityMatch[1] ?? '').trim() : ''

    const salaryMatch = salaryRe !== null ? salaryRe.exec(cardText) : null
    const salaryRaw = salaryMatch !== null ? salaryMatch[0].replace(/\s+/g, '') : ''

    const expMatch = expRe !== null ? expRe.exec(linkText) : null
    const expReq = expMatch !== null ? (expMatch[1] ?? '') : ''
    const eduMatch = eduRe !== null ? eduRe.exec(linkText) : null
    const eduReq = eduMatch !== null ? (eduMatch[1] ?? '') : ''

    // 公司盒：span 文本按顺序是 公司名 / 行业 / 规模（夹具实测；logo 是 img 不干扰）。
    let company = ''
    let industry: string | null = null
    let companySize: string | null = null
    try {
      const box = card.querySelector(arg.selectors.companyInfoBox)
      if (box !== null) {
        const spans = Array.from(box.querySelectorAll('span'))
          .map((span) => (span.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter((text) => text !== '')
        company = spans[0] ?? ''
        industry = spans[1] ?? null
        companySize = spans[2] ?? null
      }
    } catch {
      company = ''
    }

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobIdPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      ...(industry === null ? {} : { industry }),
      ...(companySize === null ? {} : { companySize }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * 猎聘特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 *   * 验证码：多出 `.geetest_box` / `#nc_1_wrapper`（探针实测的极验容器），
 *     以及阿里云 WAF 的 `waf-nc-title` + `aliyunwaf_` 脚本名；
 *   * `blankOnAboutProtocol`：风控命中时 `security.min.js` 会
 *     `location.replace('about:blank')` **把页面销毁** —— 那不是文案也不是 DOM 特征，
 *     是结构性判据，所以只能是开关；
 *   * `skipLoginWall`：猎聘的登录墙文案**尚无实测证据**，原实现明确写着"不判"
 *     （宁可让 blank / 0 条暴露，也不猜）。这里把它变成**显式开关** ——
 *     不判也是一种决定，要写出来，而不是靠"通用词表里恰好没有它要的词"。
 */
const LIEPIN_BLOCK_SIGNALS = {
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
} as const

const LIEPIN_BLOCK_FLAGS = { blankOnAboutProtocol: true, skipLoginWall: true } as const

/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export function hasNextPageInPage(arg: {
  pagination: string
  nextPage: string
  disabledClass: string
}): boolean {
  try {
    const box = document.querySelector(arg.pagination)
    if (box === null) return false
    const next = box.querySelector(arg.nextPage)
    if (next === null) return false
    const cls = next.getAttribute('class') ?? ''
    return !cls.includes(arg.disabledClass)
  } catch {
    return false
  }
}

export interface LiepinAdapterOptions {
  config?: LiepinConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先；高斯 + 犹豫见 pacing.ts）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造猎聘适配器。 */
export function createLiepinAdapter(options: LiepinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_LIEPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 记住每个页面最近一次 gotoSearch 的条件（city 码 + 页码），供 readListPage
   * 构造接口请求体 —— 与 waiqi 的 `lastCode` 同一模式（主链顺序
   * `gotoSearch → detectBlock → readListPage` 保证了它总是新鲜的）。
   */
  const lastSearch = new WeakMap<object, { keyword: string; cityCode: string; page: number }>()

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '城市码需实测（自己浏览器开猎聘搜索页，从 URL 的 city 参数抄），写进 DB 覆盖 —— 未验证的城市不猜',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: LIEPIN_MAX_PAGES,
      hint: `默认 ${String(LIEPIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(LIEPIN_MAX_PAGES)} 页；猎聘风控强度最高（antiBot=high），刻意比其它平台更保守`,
    },
  ]

  return {
    id: 'liepin',
    ...platformFacts('liepin'),
    displayName: '猎聘',
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 公司/薪资锚点待夹具校准，可能缺失 → medium。
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
    requiredFields: [...CORE_FIELDS] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: LIEPIN_MAX_PAGES,
    defaultMaxPages: LIEPIN_DEFAULT_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildLiepinSearchUrl(config, criteria)
      },
    },

    // 不声明 auth：v1 按"免登录可搜"处理（searchWithoutLogin: true）。
    // 登录后数据更全，但不该把"没登录"做成阻塞 —— 等夹具校准出稳定的
    // 结构性登录信号（对齐 zhaopin 的类名锚点做法）再补。

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildLiepinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`liepin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        const cityCode =
          criteria.city !== undefined && criteria.city !== '' && config.cityCodes[criteria.city] !== ''
            ? (config.cityCodes[criteria.city] as string)
            : '410'
        lastSearch.set(page as object, {
          keyword: criteria.keyword ?? '',
          cityCode,
          page: criteria.page ?? 1,
        })
        await page.goto(url)
        // 等卡片挂载（不要求可见：猎聘卡片可能被弹窗遮挡）。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts）。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        // 双通道（v2 接口化）：先试搜索接口（字段更富：refreshTime/labels/compId），
        // 失败或空结果自动回退 DOM 解析 —— 永不比 v1 差。
        const remembered = lastSearch.get(page as object)
        if (config.searchApiEnabled && remembered !== undefined) {
          const payload = await page
            .evaluate(fetchListInPage, {
              apiPath: `${config.searchApiOrigin}${config.searchApiPath}`,
              body: buildSearchRequestBody(
                { keyword: remembered.keyword, page: remembered.page },
                remembered.cityCode,
              ),
            })
            .catch(() => null)
          const viaApi = parseSearchApiResponse(payload)
          if (viaApi.length > 0) return viaApi
        }
        return await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          salaryPattern: config.salaryPattern,
          jobIdPattern: config.jobIdPattern,
          cityPattern: config.cityPattern,
          expPattern: config.expPattern,
          eduPattern: config.eduPattern,
        })
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {
          pagination: config.selectors.pagination,
          nextPage: config.selectors.nextPage,
          disabledClass: config.selectors.nextPageDisabledClass,
        })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(LIEPIN_BLOCK_SIGNALS),
          card: config.selectors.card,
          flags: LIEPIN_BLOCK_FLAGS,
        })
      },
    },

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 猎聘的打招呼需要 hover 后才出现的按钮 + 登录态 + 实测契约
    // （见 docs/ADAPTERS.md §7.2），fail-closed 而不是假装能发。
  }
}
