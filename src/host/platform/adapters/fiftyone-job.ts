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
import type { BlockKind, CoreField } from '../../../shared/contract/enums/crawl.js'
import { CORE_FIELDS } from '../../../shared/contract/enums/crawl.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { mergeAdapterConfig } from '../config-merge.js'
import { humanDelayMs } from '../pacing.js'
import { humanBrowse } from '../humanize.js'
import { platformFacts } from '../platform-facts.js'
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
 * 51job 支持的排序取值域（探针实测 2026-09，搜索页「综合/活跃/最新/薪资/距离」五个按钮）。
 *
 * 取值来自探针逐项点击排序按钮后，读取 API `we.51job.com/api/job/search-pc` 请求里
 * `sortType=` 的实值（并用激活态 `.ss.on` 双重确认）：
 *
 * | 按钮文字 | sortType |
 * |---|---|
 * | 综合排序 | `0` |
 * | 最新优先 | `1` |
 * | 薪资优先 | `3` |
 * | 活跃职位优先 | `5` |
 * | 距离优先 | （未启用，无实值） |
 *
 * ⚠️ **「距离优先」故意不列出**：探针点击后按钮无「on」高亮、也不发请求（疑似依赖
 * 定位/经纬度上下文，当前未启用时点击不生效）。没测出实值就不编 —— 编错了用户选了
 * 只会静默拿到另一种排序（更糟）。所以 `render` 里只有上面四档。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '综合排序' },
  { value: '1', label: '最新优先' },
  { value: '3', label: '薪资优先' },
  { value: '5', label: '活跃职位优先' },
]

/**
 * 发布时间窗取值域（天）。
 *
 * **探针实测：本页面不存在「发布时间」筛选控件**（全文无「24小时/三天/一周/一个月」等文案）。
 * API 虽保留 `issueDate` 参数但恒为空。所以值域为空 —— 界面据此禁用该维度并给出原因，
 * 而不是摆一堆点击后不生效的选项。
 */
export const POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = []

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
    // ⚠️ 顶栏筛选区也有同名 `.area`，必须限定在卡片内（`.joblist-item .area`），
    //    否则可能抓到顶栏的「地点」筛选而非某张卡片的地址（探针 2026-09 提示）。
    area: '.joblist-item .area',
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
  // 通用合并（`platform/config-merge.ts`）：分组浅合并 + 字符串空值保护 +
  // 只认默认值里已有的键。以前这里是一份手写实现 —— 10 个适配器各写一遍
  // 同一套语义，漏掉哪一条都只会以"某平台配置突然被清空"的形式暴露。
  return mergeAdapterConfig(DEFAULT_FIFTYONE_CONFIG, override)
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
 * 51job 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 两条必须显式带上，否则会**悄悄改变行为**：
 *   * 阿里云 WAF 滑块：`waf-nc-title` 文案 + `aliyunwaf_` 脚本名（get_jobs 实战特征）；
 *   * 登录墙用的是**很宽的词**（`登录|注册|扫码`），而不是通用词表里那几个完整短语 ——
 *     收紧成"扫码登录"这类短语会让一条"登录后继续"的墙**判不出来**，
 *     而 `auth.isLoggedIn` 正是靠 `block !== 'login-required'` 反推的：
 *     判不出来就会报告"已登录"，然后安静地抓到 0 条（正是本项目一直在修的那类静默失败）；
 *   * `loginTextLength` 放到极大 = **保留**它原本"没有长度上限"的语义。
 *     通用词表的 800 上限是为了防"导航栏里有『登录』但没卡片"的误判，
 *     那是个**收紧**，应当作为独立改动 + 独立断言来做，不能混在迁移里。
 */
const FIFTYONE_BLOCK_SIGNALS = {
  captchaSelectors: ['.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  loginText: ['登录', '注册', '扫码'],
  loginTextLength: 1_000_000,
  // 51job 的 blank 阈值是 80（不是通用的 120）：它的空结果页有一两百字的筛选器文案，
  // 阈值放大到 120 会让"搜到 0 条"被误判成"页面空白"，错误码与界面提示都跟着变。
  blankTextLength: 80,
} as const

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
      hint: '实测：综合/活跃/最新/薪资四档有实值（sortType 分别为 0/5/1/3）；「距离优先」平台未启用、无实值，故不提供',
    },
    {
      key: 'postedWithinDays',
      label: '发布时间',
      values: POSTED_WITHIN_OPTIONS,
      hint: '探针实测本页面无「发布时间」筛选控件（API 的 issueDate 恒为空），该维度不可用',
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
    // 成熟度与登录需求来自统一事实表（platform-facts.ts）——见该文件头的填表纪律
    ...platformFacts('51job'),
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
    // 没有站点侧依据的"默认多抓几页"不编：留 1（hint 也只说了上限 5 页）。
    defaultMaxPages: 1,

    // P3 登录态：只回答「当前页会不会被登录墙挡住」。
    // 51job 的搜索本身不需要登录（capabilities.searchWithoutLogin），
    // 所以这里主要服务于打招呼/投递（P5）与「别把登录墙当成没有新岗位」这条要求。
    auth: {
      loginUrl: 'https://login.51job.com/login.php',
      // 检测判**搜索页**：判据是"0 卡片 + 文本里有『登录/注册/扫码』"，
      // 它是按结果页校准的 —— 在登录页上跑会恒判未登录（那一页本来就没有卡片、
      // 又到处都是"登录"）。见 `auth.checkUrl` 的说明。
      checkUrl: buildSearchUrl({}),
      async isLoggedIn(page): Promise<boolean> {
        const block = await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(FIFTYONE_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
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
          // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
        // "看一眼"：留下真实的滚轮与指针轨迹（见 `humanize.ts` 的 `humanBrowse`）。
        // 只读页面原先一次输入事件都不产生，而真人看列表一定会滚动。
        await humanBrowse(page)
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
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf(FIFTYONE_BLOCK_SIGNALS),
          card: config.selectors.card,
        })
      },
    },
  }
}

/**
 * 在页面上下文里找「下一页」是否可用（P1 只用于判断是否还有更多页）。
 *
 * 探针实测（2026-09）：51job 搜索页分页是 Element Plus：
 * `div.el-pagination.is-background > button.btn-prev + ul.el-pager + button.btn-next`，
 * 最大页数固定 50。**「下一页」的禁用态是按钮原生 `disabled` 属性**（实测末页时
 * `<button class="btn-next" disabled="disabled">`，DOM 上没有 `.is-disabled` 类）。
 * 所以这里必须查 `disabled` 属性而非 class —— 旧代码查 `.next:not(.disabled)` 会在末页误判「还有下一页」。
 */
export function hasNextPageInPage(_arg: Record<string, never>): boolean {
  // `.btn-next`（Element Plus 真实元素）为主；`.j_next`/`.next` 是历史站点的兼容兜底。
  const next = document.querySelector('.btn-next, .j_next, [class*="pagination"] .next')
  if (next === null) return false
  const el = next as HTMLElement
  // Element Plus 的禁用态是原生 disabled 属性，不是 class —— 所以不能只查 class。
  if (el.getAttribute('disabled') !== null) return false
  if (/is-disabled|btn-disabled/.test(el.className)) return false
  return true
}
