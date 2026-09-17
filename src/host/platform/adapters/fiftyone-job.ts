/**
 * 前程无忧（51job）适配器。
 *
 * 两条设计要点：
 *
 * 1. **选择器与字段→URL 映射是配置，不是硬编码**（ADR-19 / D-18）。
 *    代码里带一份默认值，DB 里的覆盖优先（`setting` 表：scope='platform'、scope_ref='51job'、
 *    key='adapter-config'）。选择器坏了自己在 UI 改，不用等发版（J2 / R5）。
 *
 * 2. **解析函数是自包含的**，因为它在真路径上会被序列化后送进浏览器执行
 *    （`page.evaluate`）。它只读全局 `document`、只依赖入参 `config`，
 *    绝不引用模块作用域的自由变量 —— 否则真路径会 ReferenceError。
 *    离线测试用 jsdom 提供同一个 `document`，于是**同一份代码**在两条路径上跑。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../types.js'

/** 51job 列表页的选择器集。**每一项都可以在 UI 里改。** */
export interface FiftyOneSelectors {
  /** 卡片容器。 */
  card: string
  title: string
  salary: string
  area: string
  tags: string
  company: string
  /** 公司行里的「行业 / 性质 / 规模」三个 span。 */
  companyMeta: string
  /** 承载跟踪载荷的元素（里面有 jobId / 发布时间 / 经验 / 学历）。 */
  tracking: string
  /** 跟踪载荷所在的属性名。 */
  trackingAttr: string
}

/**
 * 字段 → URL 参数的映射。这一层**无法自动推导**，必须每平台人工建一次（§4.2.2）。
 *
 * SR-40 追加了"抓取深度"三件套（页数/排序/时间窗）的映射 ——
 * 它们**也**是 URL 参数，所以同样进配置、同样可人工修。
 */
export interface FiftyOneUrlParams {
  base: string
  keywordParam: string
  cityParam: string
  pageParam: string
  /** 排序方式（`sortType`）。取值域见 `SORT_OPTIONS`。 */
  sortParam: string
  /** 发布时间窗（`issueDate`），单位=天。 */
  postedWithinParam: string
}

/**
 * 51job 支持的排序取值域（实测于搜索页 URL）。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '综合排序' },
  { value: '1', label: '薪资最高' },
  { value: '2', label: '最新发布' },
  { value: '3', label: '距离最近' },
]

/** 发布时间窗取值域（天）。 */
export const POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '24 小时内' },
  { value: '3', label: '3 天内' },
  { value: '7', label: '一周内' },
  { value: '30', label: '一个月内' },
]

/** 页数上限：再大也不会更"全"，只会更容易触发风控。 */
export const FIFTYONE_MAX_PAGES = 5

export interface FiftyOneConfig {
  selectors: FiftyOneSelectors
  urlParams: FiftyOneUrlParams
  /** 城市名 → 平台城市码。 */
  cityCodes: Record<string, string>
  /** 详情页 URL 模板，`{jobId}` 会被替换。 */
  detailUrlTemplate: string
}

export const DEFAULT_FIFTYONE_CONFIG: FiftyOneConfig = {
  selectors: {
    card: '.joblist-item',
    title: '.jname',
    salary: '.sal',
    area: '.area',
    tags: '.joblist-item-tags .tag',
    company: '.cname',
    companyMeta: '.bc .dc',
    tracking: '[sensorsname="JobShortExposure"]',
    trackingAttr: 'sensorsdata',
  },
  urlParams: {
    base: 'https://we.51job.com/pc/search',
    keywordParam: 'keyword',
    cityParam: 'jobArea',
    pageParam: 'pageNum',
    sortParam: 'sortType',
    postedWithinParam: 'issueDate',
  },
  cityCodes: {
    北京: '010000',
    上海: '020000',
    广州: '030200',
    深圳: '040000',
    天津: '050000',
    重庆: '060000',
    南京: '070200',
    苏州: '070300',
    杭州: '080200',
    成都: '090200',
    青岛: '120300',
    郑州: '170200',
    武汉: '180200',
    长沙: '190200',
    西安: '200200',
  },
  detailUrlTemplate: 'https://jobs.51job.com/all/{jobId}.html',
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeFiftyOneConfig(override: unknown): FiftyOneConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_FIFTYONE_CONFIG
  const patch = override as Partial<FiftyOneConfig>
  return {
    selectors: { ...DEFAULT_FIFTYONE_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_FIFTYONE_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    cityCodes: { ...DEFAULT_FIFTYONE_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    detailUrlTemplate:
      typeof patch.detailUrlTemplate === 'string' && patch.detailUrlTemplate !== ''
        ? patch.detailUrlTemplate
        : DEFAULT_FIFTYONE_CONFIG.detailUrlTemplate,
  }
}

/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字上限）都会变成 `ReferenceError: X is not defined`。
 * 这条曾经真的踩过：`MAX_CARDS` 原本是模块级常量，离线 jsdom 测试照样通过
 * （Node 里闭包还在），一上真浏览器就整页解析失败。
 * 兜底办法是 `test/platform/fiftyone.test.ts` 里的「按源码重建函数」测试。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: FiftyOneConfig): RawJob[] {
  /** 列表页最多解析多少张卡片，防止异常页面把内存打满。 */
  const maxCards = 200
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const attrOf = (node: Element | null, name: string): string =>
    node === null ? '' : clean(node.getAttribute(name))
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  const selectors = config.selectors
  const cards = queryAll(document, selectors.card).slice(0, maxCards)
  const out: RawJob[] = []

  for (const card of cards) {
    const notes: string[] = []

    // 跟踪载荷：jobId / 发布时间 / 经验 / 学历 只能从这里拿到。
    // 它同时也是 source_url 的来源 —— 拿不到就等于这条记录缺 source_url。
    let tracking: Record<string, unknown> | null = null
    const trackNode = queryAll(card, selectors.tracking)[0] ?? null
    if (trackNode !== null) {
      const raw = trackNode.getAttribute(selectors.trackingAttr)
      if (typeof raw === 'string' && raw !== '') {
        try {
          tracking = JSON.parse(raw) as Record<string, unknown>
        } catch {
          notes.push('tracking:unparsable')
        }
      }
    } else {
      notes.push('tracking:missing-element')
    }
    const pick = (key: string): string => {
      if (tracking === null) return ''
      const value = tracking[key]
      return typeof value === 'string' ? clean(value) : ''
    }

    const domTitle = textOf(queryAll(card, selectors.title)[0] ?? null)
    const domSalary = textOf(queryAll(card, selectors.salary)[0] ?? null)
    const domArea = textOf(queryAll(card, selectors.area)[0] ?? null)
    const domCompany = textOf(queryAll(card, selectors.company)[0] ?? null)

    if (domTitle === '' && pick('jobTitle') !== '') notes.push('title:from-tracking')
    if (domSalary === '' && pick('jobSalary') !== '') notes.push('salary:from-tracking')
    if (domArea === '' && pick('jobArea') !== '') notes.push('area:from-tracking')

    const areaText = domArea !== '' ? domArea : pick('jobArea')
    const areaParts = areaText.split('·')
    const city = clean(areaParts[0] ?? '')
    const district = clean(areaParts[1] ?? '')

    const meta = queryAll(card, selectors.companyMeta).map(textOf).filter((value) => value !== '')
    const tags = queryAll(card, selectors.tags)
      .map(textOf)
      .filter((value) => value !== '')

    const jobId = pick('jobId')
    const sourceUrl = jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId)

    out.push({
      platformJobId: jobId,
      title: domTitle !== '' ? domTitle : pick('jobTitle'),
      salaryRaw: domSalary !== '' ? domSalary : pick('jobSalary'),
      company: domCompany,
      sourceUrl,
      city,
      district,
      expReq: pick('jobYear'),
      eduReq: pick('jobDegree'),
      tags,
      publishedAt: pick('jobTime') === '' ? null : pick('jobTime'),
      industry: meta[0] ?? null,
      companyNature: meta[1] ?? null,
      companySize: meta[2] ?? null,
      notes,
    })
  }

  return out
}

/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙。
 *
 * 命中即停、交还人工，**不硬重试**（C12 / P5）。宁可少抓，也不能把账号搞坏。
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
    '.geetest_panel, .geetest_holder, iframe[src*="captcha"], #captcha, [class*="verify-wrap"]',
  )
  if (captcha !== null) return 'captcha'
  if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常/.test(compact)) return 'rate-limited'
  if (cards === 0 && /登录|注册|扫码/.test(compact)) return 'login-required'
  // 阈值故意压得很低：真实的「页面没渲染出来」几乎是全空的，
  // 而「搜到 0 条」的结果页本身也有一两百字的筛选器文案，不该被误判成空白。
  if (cards === 0 && compact.length < 80) return 'blank'
  return null
}

export interface FiftyOneAdapterOptions {
  config?: FiftyOneConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等列表渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 51job 适配器。 */
export function createFiftyOneAdapter(options: FiftyOneAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_FIFTYONE_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  const buildSearchUrl = (criteria: SearchCriteria): string | null => {
    const params = new URLSearchParams()
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
      params.set(config.urlParams.keywordParam, criteria.keyword)
    }
    if (criteria.city !== undefined && criteria.city !== '') {
      const code = config.cityCodes[criteria.city]
      if (code === undefined) return null
      params.set(config.urlParams.cityParam, code)
    }
    if (criteria.page !== undefined && criteria.page > 1) {
      params.set(config.urlParams.pageParam, String(criteria.page))
    }
    // SR-40：抓取深度的三件套。**只在用户真的配了的时候才写进 URL** ——
    // 塞一个平台默认值会改变"什么都没配"时的行为，那是静默改变语义。
    if (criteria.sort !== undefined && criteria.sort !== '') {
      params.set(config.urlParams.sortParam, criteria.sort)
    }
    if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
      params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays))
    }
    for (const [key, value] of Object.entries(criteria.extra ?? {})) params.set(key, value)
    const query = params.toString()
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
  }

  /**
   * SR-41/42：**声明**本适配器支持的筛选维度。
   *
   * 这张表就是"能力驱动的 UI"的唯一来源：界面据它渲染、
   * 校验据它拒绝（SR-45 三条入口共用同一份）。
   */
  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '只有这张表里的城市有对应的平台城市码；其它城市无法构造搜索 URL',
    },
    {
      key: 'sort',
      label: '排序方式',
      values: SORT_OPTIONS,
      hint: '综合/薪资/最新/距离四种；平台没有更多排序维度',
    },
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: POSTED_WITHIN_OPTIONS,
      hint: '按天过滤；平台不提供"自定义起止日期"',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: FIFTYONE_MAX_PAGES,
      hint: `最多 ${String(FIFTYONE_MAX_PAGES)} 页 —— 再多不会更全，只会更容易触发风控`,
    },
  ]

  return {
    id: '51job',
    displayName: '前程无忧',
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: true,
      supportsReadReceipt: false,
      supportsInbox: true,
      supportsGreeting: true,
      fieldCompleteness: 'high',
      antiBot: 'medium',
    },
    // §4.2.4：适配器自己声明必需字段。这里是协议里的四个核心字段。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    // SR-41/42：声明支持的筛选维度（界面与校验的唯一来源）
    criteriaDimensions: dimensions,
    maxPages: FIFTYONE_MAX_PAGES,

    // P3 登录态：只回答「当前页会不会被登录墙挡住」。
    // 51job 的搜索本身不需要登录（capabilities.searchWithoutLogin），
    // 所以这里主要服务于打招呼/投递（P5）与「别把登录墙当成没有新岗位」这条要求。
    auth: {
      loginUrl: 'https://login.51job.com/login.php',
      async isLoggedIn(page): Promise<boolean> {
        const block = await page.evaluate(detectBlockInPage, { card: config.selectors.card })
        return block !== 'login-required'
      },
    },

    criteria: { buildSearchUrl },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildSearchUrl(criteria)
        if (url === null) {
          throw new Error(`51job: 无法为城市「${criteria.city ?? ''}」构造搜索 URL（城市码未配置）`)
        }
        await page.goto(url)

        // 51job 的搜索页是 SPA：`load` 时列表还没渲染。
        // 先等卡片容器出现（最可靠的信号），再叠一层随机延时（P5：请求间随机延时）。
        // 少了这一步，页面「打开正常」却解析出 0 条 —— 最容易被误读成「今天没有新岗位」。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        if (delayMax > 0) {
          const span = Math.max(0, delayMax - delayMin)
          await page.waitForTimeout(delayMin + Math.round(Math.random() * span))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, config)
      },

      async hasNextPage(page): Promise<boolean> {
        return await page.evaluate(hasNextPageInPage, {})
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        return await page.evaluate(detectBlockInPage, { card: config.selectors.card })
      },
    },
  }
}

/** 在页面上下文里找「下一页」是否可用（P1 只用于判断是否还有更多页）。 */
export function hasNextPageInPage(_arg: Record<string, never>): boolean {
  const next = document.querySelector('.j_next, .btn-next, [class*="pagination"] .next:not(.disabled)')
  return next !== null
}
