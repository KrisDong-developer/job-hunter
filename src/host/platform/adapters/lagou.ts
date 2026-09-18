/**
 * 拉勾网（lagou.com）适配器 —— 2026-09-18 基于真实平台调研。
 *
 * ## 调研来源（2026-09-18 线上抓取 + 搜索量抽样，多次互证）
 *
 * 抓取 `https://www.lagou.com/hangzhou-zhaopin/Python/`、`/jobs/list_AR`、`/jobs/list_Python`
 * 三个真实列表页（另见 docs/ADAPTERS.md 的调研记录）：
 *
 * ## 路由与 URL（**相机里的关键事实**）
 *
 * | 用途 | URL 形态 | 说明 |
 * |---|---|---|
 * | 搜索第 1 页 | `/jobs/list_<关键词>?city=<城市中文名>&px=new` | **关键词进路径**（`list_Java`），城市用**中文名**进 query，**不是数字码** —— 这跟其它平台都不一样 |
 * | 已登录详情 | `/wn/jobs/<纯数字id>.html?show=<token>` | 岗位 id 是**纯数字**（可作幂等键） |
 * | 分页 | `/hangzhou-zhaopin/Python/2/` | 城市拼**拼音 slug 段**，页码是尾部 `/2/`；slug 无法逐城推导 |
 * | 公司 | `/gongsi/v1/<hash>.html` | — |
 *
 * **翻页因此用「读真实 href」而不是自己拼**：第 2 页起读上一页分页区「下一页」链接的真实
 * href（`/hangzhou-zhaopin/Python/2/` 这种），与 zhaopin 的 `nextPageUrlInPage` 同一套路
 * （ADR-9 URL 导航、无 query、贴近站点自己生成的链接）。页码码段走不正也不敢猜。
 *
 * ## 风控强度（本平台最要紧的调研结论）
 *
 * 拉勾 **2020 年后重建 + 上了 WAF**：对 V8/Playwright 探测流量高频返回一个滑块验证页
 * （`appkey: "CF_APP_WAF"`、`sceneId` 随机、请求头注入 `userUserId`），URL 形如
 * `/s/list_<随机hex>`，正文「为了更好的访问体验，请滑动滑块进行验证」。
 * → **antiBot 定 `high`**；`detectBlock` 必须把这套滑块页与极验/阿里云 nc 一起判 `captcha`，
 *   命中即停不重试（C12）。
 *
 * 与此同时，**列表页本身是公开可爬的**（未登录就能拿到职位与薪资明文，本调研的 SEO
 * 直出页即证据），所以 `searchWithoutLogin: true`。`searchWithoutLogin:true` 与
 * `antiBot:high` 并存是拉勾的实情：**能不能进门是反爬的事，进不进得来不是登录的事**。
 *
 * ## 选择器现状（诚实声明）
 *
 * 本次调研拿到的是**内容结构**（标题/地点/薪资/经验/学历/公司/融资/标签），不是构建产物
 * 的 class。拉勾列表页是 Vue 重写，class 混淆且未做真机抓取校准 —— 按项目铁律**不编经典
 * 时代的选择器当真值**：默认选择器射到经典结构（`.con_list_item`/`.position_link`/
 * `.money`/`.company_name`…），但解析体用**语义模式**（薪资/经验/学历/地点从卡片文本抠，
 * 与猎聘同一族做法），锚不中的字段留空进 `pending_repair`。等 `npm run probe:lagou` 保存
 * 真实夹具（`test/fixtures/lagou-search.html`）后校准。
 *
 * ## 城市
 *
 * `city` 参数就是**中文城市名**（`city=深圳`、全国不带该参数）。所以不需要城市码表：
 * 任何中文城市名都能直接拼，UI 枚举用内置 20 城（identity 映射），别处城市自由文本也能收。
 */

import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'

/** 列表页选择器（默认射到经典结构，**待 probe:lagou 夹具校准**，DB 可覆盖）。 */
export interface LagouSelectors {
  /** 岗位卡片容器。 */
  card: string
  /** 标题链接（标题 + 详情 URL + 岗位 id 三合一）。 */
  titleLink: string
  /** 标题节点（经典 DOM 内嵌在 titleLink 里）。 */
  titleNode: string
  /** 薪资。 */
  salary: string
  /** 公司链接。 */
  company: string
  /** 「城市·区域」容器（经典结构在 li_b_l 里，文本形如【深圳-南山】）。 */
  location: string
  /** 「经验 / 学历」所在行。 */
  infoLine: string
  /** 职位标签。 */
  jobTags: string
  /** 发布时间。 */
  publish: string
  /** 分页容器。 */
  pagination: string
  /** 「下一页」链接。 */
  next: string
}

/** 详情页选择器集（经典结构，**待含登录夹具校准**，DB 可覆盖）。 */
export interface LagouDetailSelectors {
  /** 标题（经典 `//div[@class='name']/h1`）。 */
  title: string
  /** 「薪资 / 城市 / 经验 / 学历 / 性质」这一行（经典 `dd.job_request`）。 */
  request: string
  /** JD 全文（经典 `dd.job_bt`）。 */
  jdText: string
  /** 公司。 */
  company: string
}

/** 字段 → URL 参数映射。 */
export interface LagouUrlParams {
  /** 基础地址；关键词拼成 `${base}list_<关键词>`。 */
  base: string
  /** 城市参数（中文名，全国 = 省略该参数）。 */
  cityParam: string
  /** 排序参数（实测 `px=new` = 最新）。 */
  sortParam: string
}

export interface LagouConfig {
  selectors: LagouSelectors
  urlParams: LagouUrlParams
  /**
   * 城市名 → 城市名（identity）。拉勾 `city` 参数就是**中文城市名**，全国 → 空串 = 省参。
   * 这份枚举只为 UI 筛选器给常用城市；未列出的城市以自由文本照收（不需要码表）。
   */
  cityNames: Record<string, string>
  /** 薪资文本模式（序列化进页面）。 */
  salaryPattern: string
  /** 详情链接里抠纯数字 id 的模式（`/wn/jobs/<id>.html` 或 `/jobs/<id>.html`）。 */
  jobIdPattern: string
  /** 「经验/学历」行里的分隔符（页面显示形如「经验3-5年 / 本科」，是「 / 」）。 */
  infoSeparator: string
  /** 发布时间的文本模式（`YYYY-MM-DD` 形态）。 */
  publishPattern: string
  /** 详情页选择器（**待含登录夹具校准**）。 */
  detailSelectors: LagouDetailSelectors
  /**
   * v2 接口化解析（对照猎聘/神仙外企双通道）：非空启用时 `readListPage` 先在页面上下文里
   * POST `positionAjax.json`，拿到的字段比 DOM 富（createTime/companySize/financeStage/industryField），
   * 失败或空结果自动回退 DOM —— 永不比 v1 差。接口需要页面会话的 anti-forge cookie/token，是否被
   * 服务端接受**待真实抓取验证**；不接受也无妨，静默走 DOM 通道。
   */
  searchApiOrigin: string
  searchApiPath: string
  /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
  searchApiEnabled: boolean
}

/** 城市名清单（identity 映射；全过 = 不带 city 参数）。 */
export const LAGOU_CITY_NAMES: Record<string, string> = {
  全国: '',
  北京: '北京',
  上海: '上海',
  广州: '广州',
  深圳: '深圳',
  杭州: '杭州',
  成都: '成都',
  南京: '南京',
  苏州: '苏州',
  天津: '天津',
  重庆: '重庆',
  武汉: '武汉',
  西安: '西安',
  长沙: '长沙',
  郑州: '郑州',
  青岛: '青岛',
  合肥: '合肥',
  大连: '大连',
  东莞: '东莞',
  佛山: '佛山',
  厦门: '厦门',
}

export const LAGOU_SALARY_PATTERN =
  '\\d+(?:\\.\\d+)?k\\s*[-~]\\s*\\d+(?:\\.\\d+)?k(?:\\.\\d+)?|\\d+(?:\\.\\d+)?k\\s*以上|面议'

/** 详情链接形态：`/wn/jobs/<纯数字>.html`（新）或 `/jobs/<纯数字>.html`（旧）。 */
export const LAGOU_JOB_ID_PATTERN = '/(?:wn/jobs|jobs)/(\\d+)\\.html'

/** 经验/学历分隔符（页面显示「经验3-5年 / 本科」，是带空格的「 / 」）。 */
export const LAGOU_INFO_SEPARATOR = '/'

/** 发布时间形态：`YYYY-MM-DD`。 */
export const LAGOU_PUBLISH_PATTERN = '\\d{4}[-/]\\d{2}[-/]\\d{2}'

/** 搜索接口（v2 双通道）：POST `/jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`。 */
export const LAGOU_SEARCH_API_PATH = '/jobs/positionAjax.json'

/** 详情页选择器默认值（经典结构，`//div[@class='name']/h1` 等；**待含登录夹具校准**）。 */
export const DEFAULT_LAGOU_DETAIL_SELECTORS: LagouDetailSelectors = {
  title: '.name h1',
  request: 'dd.job_request',
  jdText: 'dd.job_bt',
  company: '.info-company .name a, .company-name a',
}

/** 排序取值域：只有「最新」（`px=new`）有线上证据（搜索页排序区回显 px=new）。 */
export const LAGOU_SORT_OPTIONS: Array<{ value: string; label: string }> = [{ value: 'new', label: '最新' }]

/** 发布时间窗：拉勾搜索 URL 不暴露该维度（那套筛选走 positionAjax POST），值域为空。 */
export const LAGOU_POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = []

/**
 * 单次抓取页数上限。拉勾 antiBot=high（WAF 滑块），给得保守：
 * 默认 3 页、上限 10 页。
 */
export const LAGOU_DEFAULT_MAX_PAGES = 3
export const LAGOU_MAX_PAGES = 10

export const DEFAULT_LAGOU_CONFIG: LagouConfig = {
  selectors: {
    card: '.con_list_item',
    titleLink: '.position_link',
    titleNode: '.position_name',
    salary: '.money',
    company: '.company_name',
    location: '.li_b_l',
    infoLine: '.list_item_bot .li_b_l',
    jobTags: '.list_item_bot .li_b_r .labels',
    publish: '.format-time',
    pagination: '.pager_container',
    next: '.pager_next',
  },
  urlParams: {
    base: 'https://www.lagou.com/jobs/list_',
    cityParam: 'city',
    sortParam: 'px',
  },
  cityNames: LAGOU_CITY_NAMES,
  salaryPattern: LAGOU_SALARY_PATTERN,
  jobIdPattern: LAGOU_JOB_ID_PATTERN,
  infoSeparator: LAGOU_INFO_SEPARATOR,
  publishPattern: LAGOU_PUBLISH_PATTERN,
  detailSelectors: DEFAULT_LAGOU_DETAIL_SELECTORS,
  searchApiOrigin: 'https://www.lagou.com',
  searchApiPath: LAGOU_SEARCH_API_PATH,
  searchApiEnabled: true,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeLagouConfig(override: unknown): LagouConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_LAGOU_CONFIG
  const patch = override as Partial<LagouConfig>
  const pattern = (key: keyof LagouConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  return {
    selectors: { ...DEFAULT_LAGOU_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_LAGOU_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityNames: { ...DEFAULT_LAGOU_CONFIG.cityNames, ...(patch.cityNames ?? {}) },
    salaryPattern: pattern('salaryPattern', DEFAULT_LAGOU_CONFIG.salaryPattern),
    jobIdPattern: pattern('jobIdPattern', DEFAULT_LAGOU_CONFIG.jobIdPattern),
    infoSeparator: pattern('infoSeparator', DEFAULT_LAGOU_CONFIG.infoSeparator),
    publishPattern: pattern('publishPattern', DEFAULT_LAGOU_CONFIG.publishPattern),
    detailSelectors: {
      ...DEFAULT_LAGOU_CONFIG.detailSelectors,
      ...(patch.detailSelectors ?? {}),
    },
    searchApiOrigin: pattern('searchApiOrigin', DEFAULT_LAGOU_CONFIG.searchApiOrigin),
    searchApiPath: pattern('searchApiPath', DEFAULT_LAGOU_CONFIG.searchApiPath),
    searchApiEnabled:
      typeof patch.searchApiEnabled === 'boolean' ? patch.searchApiEnabled : DEFAULT_LAGOU_CONFIG.searchApiEnabled,
  }
}

/**
 * 构造搜索 URL（**第 1 页**）。关键词进路径，城市用中文名进 query，全国省略 city。
 * `criteria.page > 1` 时返回 null —— 拉勾翻页要读上一页「下一页」的真实 href
 * （`/hangzhou-zhaopin/Python/2/`），由 `gotoSearch` 走 `readNextPageUrl`，**不自己拼**。
 */
export function buildLagouSearchUrl(config: LagouConfig, criteria: SearchCriteria): string | null {
  if (criteria.page !== undefined && criteria.page > 1) return null

  const keyword = criteria.keyword ?? ''
  const base = keyword === '' ? 'https://www.lagou.com/jobs/' : `${config.urlParams.base}${keyword}`

  const params = new URLSearchParams()
  // 城市是中文名，直接照收；全国 = 空串 = 省略参数（站点默认全国）。
  if (criteria.city !== undefined && criteria.city !== '' && criteria.city !== '全国') {
    params.set(config.urlParams.cityParam, criteria.city)
  }
  // SR-40：只在显式配了「最新」时才写 px=new，避免静默改默认排序。
  if (criteria.sort !== undefined && criteria.sort === 'new') {
    params.set(config.urlParams.sortParam, criteria.sort)
  }
  const query = params.toString()
  return query === '' ? base : `${base}?${query}`
}

/**
 * 构造搜索接口地址（v2 双通道）：城市在 query（中文名），全国省参。
 * `POST /jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`
 */
export function buildLagouSearchApiUrl(config: LagouConfig, cityName: string): string {
  const params = new URLSearchParams()
  params.set('needAddtionalResult', 'false')
  if (cityName !== '' && cityName !== '全国') params.set('city', cityName)
  return `${config.searchApiOrigin}${config.searchApiPath}?${params.toString()}`
}

/** 搜索接口请求体（`kd` 关键词、`pn` 页码 1 起、`first` 首翻页标记）。 */
export function buildLagouRequestBody(criteria: SearchCriteria, page: number): Record<string, string> {
  return {
    first: page <= 1 ? 'true' : 'false',
    pn: String(Math.max(1, page)),
    kd: criteria.keyword ?? '',
  }
}

/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整 Cookie/指纹/TLS，
 * 与猎聘/神仙外企同一铁律：绝不回退宿主 Node 的 fetch）。返回解析后的 JSON；
 * 任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg: { apiPath: string; form: Record<string, string> }): Promise<unknown> {
  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch
  if (typeof fetchImpl !== 'function') return Promise.resolve(null)
  let body = ''
  try {
    body = new URLSearchParams(arg.form).toString()
  } catch {
    body = ''
  }
  const referer = typeof location !== 'undefined' ? location.href : ''
  return fetchImpl(arg.apiPath, {
    method: 'POST',
    credentials: 'include',
    // 拉勾 positionAjax 是表单编码；anti-force 头来自经典爬虫 + 页面会话 cookie 配套。
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Anit-Forge-Code': '0',
      'X-Anit-Forge-Token': 'None',
      ...(referer === '' ? {} : { Referer: referer }),
    },
    body,
  })
    .then((response) => (response.ok ? (response.json() as Promise<unknown>) : null))
    .catch(() => null)
}

/**
 * 解析搜索接口响应（Node 侧纯函数；结构经典：`content.positionResult.result[]`）。
 * 字段比 DOM 富：createTime（毫秒）/ companySize / financeStage / industryField / positionAdvantage。
 */
export function parseSearchApiResponse(payload: unknown): RawJob[] {
  const out: RawJob[] = []
  if (payload === null || typeof payload !== 'object') return out
  const root = payload as { content?: { positionResult?: { result?: unknown[] } } }
  const result = root.content?.positionResult?.result
  if (!Array.isArray(result)) return out

  for (const entry of result) {
    if (entry === null || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const text = (key: string): string =>
      item[key] === null || item[key] === undefined
        ? ''
        : String(item[key]).replace(/\s+/g, ' ').trim()
    const rawId = item['positionId']
    // 广告/异常卡 positionId 可能缺或为 0 —— 跳过（真实岗位 id 是正整数）。
    if (rawId === null || rawId === undefined || rawId === '' || rawId === 0) continue
    const platformJobId = String(rawId)

    // createTime 是毫秒时间戳（本地时）→ ISO
    let publishedAt: string | null = null
    const rawTime = item['createTime']
    if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime > 0) {
      const date = new Date(rawTime)
      if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString()
    }

    const company = text('companyFullName') || text('companyName')
    const sourceUrl = text('positionURL') || `https://www.lagou.com/wn/jobs/${platformJobId}.html`
    const tags: string[] = []
    const advantage = text('positionAdvantage')
    if (advantage !== '') tags.push(advantage)

    const notes: string[] = []
    if (text('salary') === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title: text('positionName'),
      salaryRaw: text('salary'),
      company,
      sourceUrl,
      city: text('city'),
      district: text('district'),
      expReq: text('workYear'),
      eduReq: text('education'),
      ...(tags.length === 0 ? {} : { tags }),
      ...(publishedAt === null ? {} : { publishedAt }),
      industry: text('industryField') === '' ? null : text('industryField'),
      companySize: text('companySize') === '' ? null : text('companySize'),
      companyNature: text('financeStage') === '' ? null : text('financeStage'),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析详情页（选择器为经典结构，**待含登录夹具校准**）。
 * ⚠️ 必须完全自包含。详情页选择器未校准且有些字段需登录；打不开时调用方判墙兜底。
 */
export function extractDetailInPage(arg: { selectors: LagouDetailSelectors }): RawJobDetail {
  const pick = (selector: string): string => {
    try {
      return (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  // 「薪资 / 城市 / 经验 / 学历 / 性质」行（经典 dd.job_request 里的 <span> 按序）。
  let salaryRaw = ''
  let city = ''
  let expReq = ''
  let eduReq = ''
  try {
    const requestEl = document.querySelector(arg.selectors.request)
    if (requestEl !== null) {
      const spans = Array.from(requestEl.querySelectorAll('span'))
        .map((span) => (span.textContent ?? '').replace(/\s+/g, '').trim())
        .filter((text) => text !== '')
      // 经典顺序：薪资 / 城市·区 / 经验 / 学历 / 性质（`/` 分隔符已被 span 过滤掉）。
      salaryRaw = spans[0] ?? ''
      city = spans[1] ?? ''
      expReq = spans[2] ?? ''
      eduReq = spans[3] ?? ''
      if (expReq.startsWith('经验')) expReq = expReq.slice(2)
    }
  } catch {
    salaryRaw = ''
  }

  // 详情 URL 里抠纯数字 id（`/wn/jobs/<id>.html` 或 `/jobs/<id>.html`）。
  let platformJobId = ''
  try {
    const m = /\/(?:wn\/jobs|jobs)\/(\d+)\.html/.exec(location.href)
    if (m !== null) platformJobId = m[1] ?? ''
  } catch {
    platformJobId = ''
  }

  return {
    platformJobId,
    title: pick(arg.selectors.title),
    salaryRaw,
    company: pick(arg.selectors.company),
    sourceUrl: location.href,
    ...(city === '' ? {} : { city }),
    ...(expReq === '' ? {} : { expReq }),
    ...(eduReq === '' ? {} : { eduReq }),
    jdText: pick(arg.selectors.jdText),
  }
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * ⚠️ **待含登录夹具校准**。只认**结构性信号**（已登录时头部有用户头像/「我的」入口），
 * 不认"页面上有没有『登录』两个字" —— 正常结果页右上角一直有登录入口。
 */
export function isLoggedInInPage(): boolean {
  try {
    return (
      document.querySelector('.user-nav, [class*="user-avatar"], [class*="head-avatar"], .avatar-box') !== null
    )
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上被序列化送进浏览器执行）。
 * 解析以**语义模式**为主（与猎聘同族做法）：选择器是"锚点提示"，命中就细化，
 * 不命中就从卡片文本抠 —— 这样即使 class 变了，薪资/经验/学历/地点仍能采到。
 * 锚不中的字段留空/记 notes，由字段级断言隔离进 pending_repair，**不编**。
 */
export function extractJobsInPage(arg: {
  selectors: LagouSelectors
  salaryPattern: string
  jobIdPattern: string
  infoSeparator: string
  publishPattern: string
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
  const publishRe = compile(arg.publishPattern)

  const pick = (scope: Element, selector: string): string => {
    try {
      return (scope.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  for (const card of Array.from(cards)) {
    // 标题链接：标题文本 + 详情 URL + 岗位 id 三合一。
    let link: Element | null = null
    try {
      link = card.querySelector(arg.selectors.titleLink)
    } catch {
      link = null
    }
    if (link === null) continue
    const href = link.getAttribute('href') ?? ''
    if (href === '') continue
    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 原样给，字段断言兜 */
    }

    const cardText = (card.textContent ?? '').replace(/\s+/g, ' ').trim()

    let title = pick(card, arg.selectors.titleNode)
    if (title === '') title = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    // 薪资：优先 .money；拿不到就从卡片文本抠（语义模式）。
    let salaryRaw = pick(card, arg.selectors.salary)
    if (salaryRaw === '' && salaryRe !== null) {
      const m = salaryRe.exec(cardText)
      if (m !== null) salaryRaw = (m[0] ?? '').replace(/\s+/g, '')
    }

    // 公司：优先 .company_name；拿不到就从文本里找「](...gongsi...) 之前的文本」。
    let company = pick(card, arg.selectors.company)
    if (company === '') {
      try {
        const companyLink = card.querySelector("a[href*='/gongsi/']")
        company = (companyLink?.textContent ?? '').replace(/\s+/g, ' ').trim()
      } catch {
        company = ''
      }
    }

    // 「城市·区域」：优先 location 容器文本，形如【深圳-南山】或【郑州-金水区】。
    let city = ''
    let district = ''
    const locText = pick(card, arg.selectors.location)
    const locMatch = /【([^】]+)】/.exec(cardText)
    const locRaw = locText !== '' ? locText : locMatch !== null ? (locMatch[1] ?? '') : ''
    if (locRaw !== '') {
      // 先把方括号剥干净（【】[]），再切 —— 否则 split('-') 会把尾「】」留在值上。
      const cleanLoc = locRaw.replace(/[【】\[\]]/g, '').trim()
      // 分隔既可能用「·」（全角间隔点）也可能用「-」（经典结构）。
      const parts = cleanLoc.split('·')
      const [first, second] = parts.length > 1 ? parts : cleanLoc.split('-')
      city = (first ?? '').trim()
      district = (second ?? '').trim()
    }

    // 「经验 / 学历」：取 infoLine 文本，按分隔符拆两段。
    let expReq = ''
    let eduReq = ''
    const infoRaw = pick(card, arg.selectors.infoLine)
    if (infoRaw.indexOf(arg.infoSeparator) >= 0) {
      const [a, b] = infoRaw.split(arg.infoSeparator)
      expReq = (a ?? '').replace(/经验/i, '').trim()
      eduReq = (b ?? '').trim()
    } else if (infoRaw !== '') {
      // 无分隔符时整体当经验行（如「经验不限」），学历留给语义正则兜底。
      expReq = infoRaw.replace(/经验/i, '').trim()
      const eduMatch = /(本科|硕士|博士|大专|中专|高中|学历不限|不限)/.exec(cardText)
      if (eduMatch !== null) eduReq = eduMatch[1] ?? ''
    }
    if (expReq === '' || /经验.*本科/.test(infoRaw) === false) {
      const expMatch = /经验([\d\/.\-\u4e00-\u9fa5]{1,12})/.exec(cardText)
      if (expMatch !== null && expReq === '') expReq = (expMatch[1] ?? '').replace(/^\s+|\s+$/g, '')
    }
    if (eduReq === '') {
      const eduMatch = /(本科|硕士|博士|大专|中专|高中|学历不限)/.exec(cardText)
      if (eduMatch !== null) eduReq = eduMatch[1] ?? ''
    }

    // 发布时间：优先 .format-time，命中 YYYY-MM-DD 就转 ISO，否则留空。
    let publishedAt: string | null = null
    const publishRaw = pick(card, arg.selectors.publish)
    if (publishRe !== null && publishRaw !== '') {
      const m = publishRe.exec(publishRaw)
      if (m !== null) {
        const iso = String(m[0] ?? '').replace('/', '-') + 'T00:00:00.000Z'
        const date = new Date(iso)
        if (!Number.isNaN(date.getTime())) publishedAt = date.toISOString()
      }
    }

    // 职位标签。
    let tags: string[] = []
    try {
      tags = Array.from(card.querySelectorAll(arg.selectors.jobTags))
        .map((tag) => (tag.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((text) => text !== '')
    } catch {
      tags = []
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
      ...(district === '' ? {} : { district }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      ...(tags.length === 0 ? {} : { tags }),
      ...(publishedAt === null ? {} : { publishedAt }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**取「下一页」的真实 href（返回绝对 URL）。
 * 拉勾翻页靠 `/<城市拼音>-zhaopin/<关键词>/<页>/`，拼音 slug 无法逐城推导 ——
 * 所以**读站点生成的分页链接**，而不是自己拼（zhaopin `nextPageUrlInPage` 同一套路）。
 */
export function nextPageUrlInPage(arg: { pagination: string; next: string }): string | null {
  let pager: Element | null = null
  try {
    pager = document.querySelector(arg.pagination)
  } catch {
    return null
  }
  if (pager === null) return null
  let nextLink: Element | null = null
  try {
    nextLink = pager.querySelector(arg.next)
  } catch {
    return null
  }
  // 有的版本「下一页」是 <a>，有的受 `#order` 干扰；取离「下一页」文本最近的 a。
  if (nextLink === null || nextLink.tagName !== 'A') {
    try {
      const links = Array.prototype.slice.call(pager.querySelectorAll('a')) as Element[]
      for (const a of links) {
        if ((a.textContent ?? '').indexOf('下一页') >= 0) {
          nextLink = a
          break
        }
      }
    } catch {
      nextLink = null
    }
  }
  if (nextLink === null) return null
  const cls = (nextLink.getAttribute('class') ?? '').toLowerCase()
  const noHref = nextLink.getAttribute('href') === null || (nextLink.getAttribute('href') ?? '') === ''
  if (noHref || /disable/.test(cls)) return null
  const href = nextLink.getAttribute('href') ?? ''
  if (href.indexOf('http') === 0) return href
  return 'https://www.lagou.com' + (href.indexOf('/') === 0 ? href : '/' + href)
}

/** **在页面上下文里**判「下一页」是否可用。 */
export function hasNextPageInPage(arg: { pagination: string; next: string }): boolean {
  try {
    const pager = document.querySelector(arg.pagination)
    if (pager === null) return false
    const next = pager.querySelector(arg.next)
    if (next === null) return false
    const cls = (next.getAttribute('class') ?? '').toLowerCase()
    const hasHref = (next.getAttribute('href') ?? '') !== ''
    return hasHref && !/disable/.test(cls)
  } catch {
    return false
  }
}

/**
 * 拉勾特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 最特有的一条是 **WAF 滑块页的 URL 特征**：`appkey: "CF_APP_WAF"`、sceneId 随机，
 * URL 变成 `/s/list_<随机hex>`，正文「请滑动滑块进行验证」—— 判 `captcha`，命中即停
 * （C12：重试等于再撞一次滑块）。文案也一并带上，与 URL 特征双保险。
 */
const LAGOU_BLOCK_SIGNALS = {
  urlPatterns: ['lagou\\.com/s/list_'],
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.slide-verify-panel'],
  captchaText: ['请滑动滑块进行验证', '为了更好的访问体验', '请完成验证', '滑动滑块'],
  // 拉勾的登录表单用这几个词（通用词表只有「扫码登录」）
  loginText: ['手机号登录', '邮箱登录'],
} as const

export interface LagouAdapterOptions {
  config?: LagouConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造拉勾网适配器。 */
export function createLagouAdapter(options: LagouAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_LAGOU_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 记住每个页面「上一页读到的下一页真实 URL」，供 gotoSearch 在 page>1 时导航。
   * 与猎聘的 `lastSearch` 同一模式：单轮抓取内页面对象稳定、循环顺序推进
   * （gotoSearch → detectBlock → readListPage 顺序保证它是新鲜的）。
   */
  const nextUrlByPage = new WeakMap<object, string>()

  /** 记下某个页面读到的「下一页」URL。 */
  const rememberNextUrl = (page: object, next: string | null): void => {
    if (next === null || next === '') nextUrlByPage.delete(page)
    else nextUrlByPage.set(page, next)
  }

  /** 上一次 `gotoSearch` 记下的筛选条件：`readListPage(page)` 只拿得到 page，拿不到 criteria。 */
  const lastCriteria = new WeakMap<object, SearchCriteria>()

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，拼进路径段（/jobs/list_<关键词>）' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityNames).map((city) => ({ value: city, label: city })),
      // 表里的 20 个是**建议**不是取值域：`buildLagouSearchUrl` 把中文名原样拼进 URL
      closed: false,
      hint: '拉勾的 city 参数就是中文城市名，无需码表 —— 列表里没有的城市也能以自由文本直接收；「全国」不带 city 参数',
    },
    {
      key: 'sort',
      label: '排序方式',
      values: LAGOU_SORT_OPTIONS,
      hint: '搜索页只有默认与「最新」有证据（px=new）；其余取值无线上证据，故不提供',
    },
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: LAGOU_POSTED_WITHIN_OPTIONS,
      hint: '拉勾搜索 URL 不暴露发布时间维度（那套筛选走 positionAjax POST），因此该维度不可用',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: LAGOU_MAX_PAGES,
      hint: `默认 ${String(LAGOU_DEFAULT_MAX_PAGES)} 页、最多 ${String(LAGOU_MAX_PAGES)} 页；拉勾 antiBot=high（WAF 滑块），刻意比其它平台保守`,
    },
  ]

  return {
    id: 'lagou',
    ...platformFacts('lagou'),
    displayName: '拉勾',
    capabilities: {
      // 列表公开可爬（SEO 直出页即证据）；但能不能进门要过 WAF 滑块 —— 两件事分开说。
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 选择器待夹具校准，可能缺失 → medium。
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
    requiredFields: CORE_FIELDS as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: LAGOU_MAX_PAGES,
    defaultMaxPages: LAGOU_DEFAULT_MAX_PAGES,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildLagouSearchUrl(config, criteria)
      },
    },

    auth: {
      loginUrl: 'https://www.lagou.com/login',
      // 结构性信号（待含登录夹具校准）。搜索不需要登录，这个入口只服务登录引导与后续高危动作。
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, undefined as never)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        let url = buildLagouSearchUrl(config, criteria)
        // 第 2 页起用上一页读到的「下一页」真实 href（拼音 slug 拼不了，只能照抄）。
        if (url === null && criteria.page !== undefined && criteria.page > 1) {
          const next = nextUrlByPage.get(page as object) ?? ''
          if (next !== '') url = next
        }
        lastCriteria.set(page as object, criteria)
        await page.goto(url as string)
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        // 双通道（v2 接口化）：先试 positionAjax（字段更富：createTime/companySize/financeStage），
        // 失败或空结果自动回退 DOM 解析 —— 永不比 v1 差。
        const remembered = lastCriteria.get(page as object)
        if (config.searchApiEnabled && remembered !== undefined) {
          const payload = await page
            .evaluate(fetchListInPage, {
              apiPath: buildLagouSearchApiUrl(config, remembered.city ?? ''),
              form: buildLagouRequestBody(remembered, remembered.page ?? 1),
            })
            .catch(() => null)
          const viaApi = parseSearchApiResponse(payload)
          if (viaApi.length > 0) return viaApi
        }

        const raw = await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          salaryPattern: config.salaryPattern,
          jobIdPattern: config.jobIdPattern,
          infoSeparator: config.infoSeparator,
          publishPattern: config.publishPattern,
        })
        // 顺带把「下一页」真实链接记下来，供 gotoSearch 第 N+1 页使用。
        const next = await page
          .evaluate(nextPageUrlInPage, { pagination: config.selectors.pagination, next: config.selectors.next })
          .catch(() => null)
        rememberNextUrl(page as object, next)
        return raw
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {
          pagination: config.selectors.pagination,
          next: config.selectors.next,
        })
      },
    },

    detail: {
      /** 详情页解析（选择器为经典结构，**待含登录夹具校准**）。 */
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(LAGOU_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
      },
    },

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 拉勾的「立即沟通 / 投递」需要登录态 + 页面会话 anti-forge，且按钮层级无真机契约证据。
    // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed），
    // 也不上线一个会误点真实按钮的实现。详见文件头调研记录。
  }
}