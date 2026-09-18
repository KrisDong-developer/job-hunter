/**
 * SinoJobs 中欧招聘（sinojobs.com.cn）适配器 —— 列表页采集 + 详情页解析。
 *
 * ## 平台实测（2026-09-18，真实页面与接口交叉验证）
 *
 * SinoJobs 有中英德三个版本；**中文站 `sinojobs.com.cn`** 是面向"中欧双向求职者"
 * 的求职入口（`www.sinojobs.com` 是面向欧洲企业的主站/门户）。岗位多为德企 /
 * 欧洲企业在华与海外职位，城市常见 `国外` / `上海` / `常州` 等。
 *
 * 与神仙外企同款的关键事实：**列表不在 DOM 里**。页面打开后，站内脚本
 * （`$(function(){ ... onloadPage(1, 15) })`）会用 jQuery 同步 AJAX 把
 * `POST /Recruitment/indexAjaxPage.html` 返回的 JSON 渲染进 `#recruitmentList`，
 * 而且渲染模板**不展示薪资**。所以：
 *
 *   * 抓 DOM 拿不到核心字段 —— 必须**在页面上下文里调接口**（`page.evaluate` 里 `fetch`）；
 *   * 在页面里发请求顺带拿到**同源 Cookie / 登录态**（`credentials: 'include'`），
 *     与用户自己在浏览器里翻列表走同一条链路。
 *
 * ## 接口契约（全部实测）
 *
 * `POST /Recruitment/indexAjaxPage.html`，表单编码（`application/x-www-form-urlencoded`）：
 *
 * | 参数 | 含义 | 取值 |
 * |---|---|---|
 * | `page` | 页码，**1 起** | 实测第 2 页与第 1 页零重叠 |
 * | `limit` | 页容量 | 站点自己用 15；实测 20/50/100 均正常（100 时一次返回全量 78） |
 * | `keywords` | 关键词 | 实测 `工程师` → 78→17 条 |
 * | `job_type` | 行业类别 | 43 项，id 见 `SINOJOBS_JOB_TYPE_SEED`；实测 `574`(IT/互联网) 生效 |
 * | `work_nature` | 工作性质 | 1=全职 / 2=兼职 / 3=实习；实测 `3` → 4 条 |
 * | `address_id` | 地点 | `10000`=国内 / `10001`=国外 / 省级 id（北京=1、上海=3…）；实测 `3` → 15 条上海岗 |
 * | `salary_range` | 薪资档 | 0=面议 / 3=3K以下 / 5=3K-5K / 10=5K-10K / 15=10K-15K / 25=15K-25K / 26=25K+ |
 * | `experience` | 经验档 | 0=不限 / 1=应届毕业生 / 2=1年～3年 / 3=3年～5年 / 4=5年以上 |
 *
 * 响应 `{"status":1, "info":"数据获取成功", "data":{"total":"78","rows":[...]}}`，
 * 每行字段：`id` / `job_title` / `company` / `work_city` / `release_time`（**Unix 秒**）/
 * `end_time` / `top_time`（置顶时间戳，null 或值）/ `experience` / `education` /
 * `salary_range`（`面议` 或 `25K+` 等）/ `company_id` / `logo`。**薪资在接口里就有**，
 * 只是站点自己的渲染模板不展示 —— 这正是本适配器要走接口而不是抓 DOM 的理由。
 *
 * ## robots 取舍
 *
 * `robots.txt` 只禁 `User-agent: *` 下的 `/UserCenter/*`、`/CompanyUcenter/*`、
 * `/Ucenter/*`、`/Oauth/*`。本适配器访问的 `/Recruitment/*`（列表页与列表接口
 * `indexAjaxPage.html`）与详情页 `/Recruitment/content.html` 都在允许范围内。
 * 投递要登录（`/UserCenter/resumeShow.html`），采集链路**不碰**投递与任何 Ucenter 路径。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import { signalsOf, type BlockSignalSet } from '../block-signals.js'
import { platformFacts } from '../platform-facts.js'
import type { CriteriaDimension, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js'
import { platformCriterion } from '../types.js'

/** 页面外壳地址（人看的入口；筛选条件不在 URL 里，见 `buildSinoJobsSearchUrl`）。 */
export const SINOJOBS_WEB_BASE = 'https://sinojobs.com.cn'

/** 列表接口路径（POST，表单编码）。 */
export const SINOJOBS_API_PATH = '/Recruitment/indexAjaxPage.html'

export const SINOJOBS_LIST_URL = `${SINOJOBS_WEB_BASE}/Recruitment/index.html`

/** 详情页 URL 模板。`{jobId}` 会被替换（详情页是服务端渲染的静态 HTML）。 */
export const SINOJOBS_DETAIL_URL_TEMPLATE = `${SINOJOBS_WEB_BASE}/Recruitment/content.html?id={jobId}`

/**
 * 单页容量。站点自己用 15（分页插件 `pageSizeOpt: 5/10/15/20` 家族），
 * 实测接口收 20/50/100 都正常 —— 用 20 在"站点自己用过的取值"里取最大，
 * 少几轮请求（全量 78 条 → 4 页）。
 */
export const SINOJOBS_PAGE_SIZE = 20

/**
 * 页数上限。全量池实测 78 条（20 条/页 → 4 页），关键词搜索只会更少。
 * 给 6 页留足余量，同时把抓取深度压得保守（§P5 保守优先）。
 */
export const SINOJOBS_MAX_PAGES = 6

/** 薪资取值域（页面筛选项 `#work-salary strong[rel]`，rel 即接口 `salary_range`）。 */
export const SINOJOBS_SALARY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '面议' },
  { value: '3', label: '3K以下' },
  { value: '5', label: '3K-5K' },
  { value: '10', label: '5K-10K' },
  { value: '15', label: '10K-15K' },
  { value: '25', label: '15K-25K' },
  { value: '26', label: '25K+' },
]

/** 经验取值域（`#work-year strong[rel]`，rel 即接口 `experience`）。 */
export const SINOJOBS_EXPERIENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '不限' },
  { value: '1', label: '应届毕业生' },
  { value: '2', label: '1年～3年' },
  { value: '3', label: '3年～5年' },
  { value: '4', label: '5年以上' },
]

/** 工作性质取值域（`#work_nature`，值即接口 `work_nature`）。 */
export const SINOJOBS_WORK_NATURE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '全职' },
  { value: '2', label: '兼职' },
  { value: '3', label: '实习' },
]

/**
 * 地点取值域（`address_id`）。
 *
 * 取值来自平台自己的级联接口 `POST /Common/selectAddress.html`（实测）：
 * 第一级是 `10000`=国内 / `10001`=国外；选国内后第二级就是省份（北京=1、上海=3…
 * 海外=35）。站点搜索用的是 `select[name="work_city[]"]:last` 的**最后一级**值，
 * 所以省级 id 直接可当 `address_id` 用（实测 `address_id=3` → 只回上海岗）。
 *
 * 只放**实测拿到**的省级值；城市级（三级）id 要逐市点一遍级联才拿得到，未内置 ——
 * 需要时走 DB 覆盖 `config.addressCodes`（`setting(scope='platform', scope_ref='sinojobs', key='adapter-config')`）。
 */
export const SINOJOBS_ADDRESS_CODES: Record<string, string> = {
  国内: '10000',
  国外: '10001',
  北京: '1',
  天津: '2',
  上海: '3',
  重庆: '4',
  河北: '5',
  山西: '6',
  内蒙古: '7',
  辽宁: '8',
  吉林: '9',
  黑龙江: '10',
  江苏: '11',
  浙江: '12',
  安徽: '13',
  福建: '14',
  江西: '15',
  山东: '16',
  河南: '17',
  湖北: '18',
  湖南: '19',
  广东: '20',
  广西: '21',
  海南: '22',
  四川: '23',
  贵州: '24',
  云南: '25',
  西藏: '26',
  陕西: '27',
  甘肃: '28',
  青海: '29',
  宁夏: '30',
  新疆: '31',
  台湾: '32',
  香港: '33',
  澳门: '34',
  海外: '35',
}

/**
 * 行业类别取值域（`job_type`）—— 实测 seed，来自页面 `#job_type` 的全部 43 项。
 *
 * 与城市同一套「人工维护 + DB 覆盖」逻辑；站点增删行业时在 DB 覆盖 `jobTypeList` 即可。
 */
export const SINOJOBS_JOB_TYPE_SEED: Array<{ id: string; name: string }> = [
  { id: '574', name: 'IT/互联网' },
  { id: '575', name: '人力资源服务' },
  { id: '576', name: '休闲娱乐/旅游/文化/体育' },
  { id: '577', name: '传媒（电影/广播/电视/出版' },
  { id: '578', name: '保险' },
  { id: '579', name: '光电设备生产' },
  { id: '580', name: '公共管理与组织' },
  { id: '581', name: '其它产品生产' },
  { id: '582', name: '其它商业服务行业' },
  { id: '583', name: '其它部门和行业' },
  { id: '584', name: '其它非金属矿物制品生产' },
  { id: '585', name: '农业/渔业/林业/园艺' },
  { id: '586', name: '制药' },
  { id: '587', name: '化工/石油化工' },
  { id: '588', name: '医疗/医疗保障/医疗服务' },
  { id: '589', name: '医疗技术' },
  { id: '590', name: '学术/科研' },
  { id: '591', name: '广告/传媒/市场推广/公关' },
  { id: '592', name: '建筑建设' },
  { id: '593', name: '快速消费品/耐用品' },
  { id: '594', name: '房地产' },
  { id: '595', name: '手工' },
  { id: '596', name: '批发/零售' },
  { id: '597', name: '教育/培训' },
  { id: '598', name: '木业/木制品生产' },
  { id: '599', name: '机械设备制造' },
  { id: '600', name: '水电气供应/环保' },
  { id: '601', name: '汽车工业' },
  { id: '602', name: '法律/咨询/审计' },
  { id: '603', name: '物流/运输/后勤' },
  { id: '604', name: '电子通信' },
  { id: '605', name: '纺织/服装/皮革/时尚' },
  { id: '606', name: '笔译及口译' },
  { id: '607', name: '航空/航天' },
  { id: '608', name: '造纸/纸制品生产' },
  { id: '609', name: '酒店/饭店/餐饮服务' },
  { id: '610', name: '采矿' },
  { id: '611', name: '金融服务' },
  { id: '612', name: '钢铁工业' },
  { id: '613', name: '银行' },
  { id: '614', name: '非政府组织/非营利机构' },
  { id: '615', name: '食品/饮料' },
  { id: '616', name: '进出口贸易/公商务咨询/旅游/文化' },
  { id: '617', name: '工业科技/科技设备/科技研发' },
]

/**
 * 记录字段名 → 我们的语义。平台改字段名时**在 DB 里覆盖着改**即可（ADR-19）。
 * 右边一列全部来自实测响应原文（`test/fixtures/sinojobs-list-payload.json`）。
 */
export interface SinoJobsFields {
  id: string
  title: string
  company: string
  /** 城市文本（`国外` / `上海` / `常州`…）。 */
  workCity: string
  /** 发布时间，**Unix 秒**（字符串）。 */
  releaseTime: string
  /** 截止时间，Unix 秒（字符串）。 */
  endTime: string
  /** 置顶时间戳；null 或值（字符串化后空串 = 未置顶）。 */
  topTime: string
  salaryRange: string
  experience: string
  education: string
  companyId: string
  logo: string
}

export interface SinoJobsConfig {
  webBase: string
  apiPath: string
  /** 单页容量（默认 `SINOJOBS_PAGE_SIZE`）。 */
  pageSize: number
  detailUrlTemplate: string
  /** 地点名 → `address_id`。 */
  addressCodes: Record<string, string>
  /** 行业类别（`job_type`）取值域。实测 seed，可在 DB 覆盖扩充。 */
  jobTypeList: Array<{ id: string; name: string }>
  fields: SinoJobsFields
  /** 只用于"等页面渲染"与"翻页按钮探测"，**不用于解析**（解析走接口 / 详情页 DOM）。 */
  selectors: {
    card: string
    nextPage: string
  }
  /** 详情页解析用的选择器（详情页是服务端渲染的静态 HTML）。 */
  detail: {
    /** 职位名（页面结构实测是 `h5`）。 */
    title: string
    /** 公司名（第一个 `h6`）。 */
    company: string
    /** 信息列表（薪资 / 城市 / 经验 / 工作性质 / 发布时间 五项）。 */
    infoList: string
    /** JD 段落（职位描述 / 任职要求等正文）。 */
    jdBlocks: string
  }
}

export const DEFAULT_SINOJOBS_CONFIG: SinoJobsConfig = {
  webBase: SINOJOBS_WEB_BASE,
  apiPath: SINOJOBS_API_PATH,
  pageSize: SINOJOBS_PAGE_SIZE,
  detailUrlTemplate: SINOJOBS_DETAIL_URL_TEMPLATE,
  addressCodes: SINOJOBS_ADDRESS_CODES,
  jobTypeList: SINOJOBS_JOB_TYPE_SEED,
  fields: {
    id: 'id',
    title: 'job_title',
    company: 'company',
    workCity: 'work_city',
    releaseTime: 'release_time',
    endTime: 'end_time',
    topTime: 'top_time',
    salaryRange: 'salary_range',
    experience: 'experience',
    education: 'education',
    companyId: 'company_id',
    logo: 'logo',
  },
  selectors: {
    // 实测 AJAX 渲染出来的列表行容器（`.row.company-row`）。
    // 只用来等页面活过来 —— 数据来自接口，不来自这些节点。
    card: '.row.company-row',
    nextPage: '.page [name="whj_nextPage"]',
  },
  detail: {
    title: 'h5',
    company: 'h6',
    infoList: 'ul li',
    jdBlocks: 'p',
  },
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeSinoJobsConfig(override: unknown): SinoJobsConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_SINOJOBS_CONFIG
  const patch = override as Partial<SinoJobsConfig>
  const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  const number = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback
  return {
    webBase: text(patch.webBase, DEFAULT_SINOJOBS_CONFIG.webBase),
    apiPath: text(patch.apiPath, DEFAULT_SINOJOBS_CONFIG.apiPath),
    pageSize: number(patch.pageSize, DEFAULT_SINOJOBS_CONFIG.pageSize),
    detailUrlTemplate: text(patch.detailUrlTemplate, DEFAULT_SINOJOBS_CONFIG.detailUrlTemplate),
    addressCodes: { ...DEFAULT_SINOJOBS_CONFIG.addressCodes, ...(patch.addressCodes ?? {}) },
    jobTypeList: Array.isArray(patch.jobTypeList)
      ? patch.jobTypeList
      : DEFAULT_SINOJOBS_CONFIG.jobTypeList,
    fields: { ...DEFAULT_SINOJOBS_CONFIG.fields, ...(patch.fields ?? {}) },
    selectors: { ...DEFAULT_SINOJOBS_CONFIG.selectors, ...(patch.selectors ?? {}) },
    detail: { ...DEFAULT_SINOJOBS_CONFIG.detail, ...(patch.detail ?? {}) },
  }
}

/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 与神仙外企同理：筛选条件**不在 URL 里**（全部走 POST body），URL 只承载
 * 页面自己的 `keywords`（仅供人核对）。城市仍然在这里校验 ——
 * 表里没有的城市直接返回 `null`（**不猜**，否则"城市没配"会变成一次静默的全国搜索）。
 */
export function buildSinoJobsSearchUrl(config: SinoJobsConfig, criteria: SearchCriteria): string | null {
  if (criteria.city !== undefined && criteria.city !== '' && config.addressCodes[criteria.city] === undefined) {
    return null
  }
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set('keywords', criteria.keyword)
  }
  const query = params.toString()
  return query === '' ? SINOJOBS_LIST_URL : `${SINOJOBS_LIST_URL}?${query}`
}

/** 接口请求体（表单字段，与站点 `onloadPage(page, limit)` 发送的完全一致）。 */
export function buildSinoJobsRequestBody(
  config: SinoJobsConfig,
  criteria: SearchCriteria,
  page: number,
): Record<string, string> {
  const body: Record<string, string> = {
    page: String(page),
    limit: String(config.pageSize),
    // 站点脚本始终提交这五个键（值为空串 = 不筛）。
    keywords: criteria.keyword ?? '',
    job_type: platformCriterion(criteria, 'jobType'),
    work_nature: platformCriterion(criteria, 'workNature'),
    salary_range: platformCriterion(criteria, 'salaryRange'),
    experience: platformCriterion(criteria, 'experience'),
    address_id: '',
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.addressCodes[criteria.city]
    // 地点码未配置就**不写值**（宁可搜全国，也不要写一个错的地点码）。
    // `buildSinoJobsSearchUrl` 已经先拦过一次，这里是第二道。
    if (code !== undefined) body.address_id = code
  }
  for (const [key, value] of Object.entries(criteria.extra ?? {})) body[key] = value
  return body
}

/**
 * **在页面上下文里**解析列表响应。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以日期换算这类逻辑在函数体内**各写一遍**。
 *
 * @param config 字段配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: SinoJobsConfig): RawJob[] {
  const maxCards = 200 // 异常页面兜底：最多解析多少条
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  const fields = config.fields
  // 数据来源优先级：接口载荷（`__SINOJOBS_LIST_PAYLOAD__`，由 fetchListInPage 写入）
  //   → 内联夹具载荷（离线测试用 `<script id="sinojobs-fixture-payload">`）
  // 两者都没有时返回空数组 —— 上层会把它判成"没解析出记录"。
  const globalScope = globalThis as unknown as { __SINOJOBS_LIST_PAYLOAD__?: unknown }
  let payload: unknown = globalScope.__SINOJOBS_LIST_PAYLOAD__
  if (payload === undefined || payload === null) {
    const holder = queryAll(document, '#sinojobs-fixture-payload')[0] ?? null
    if (holder !== null) {
      try {
        payload = JSON.parse(holder.textContent ?? '')
      } catch {
        payload = null
      }
    }
  }

  const root = payload as { data?: unknown } | null | undefined
  const data = (root?.data ?? {}) as Record<string, unknown>
  const rawRows = data['rows']
  if (!Array.isArray(rawRows)) return []
  const rows = rawRows.slice(0, maxCards)

  const out: RawJob[] = []
  for (const item of rows) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = (key: string): string => clean(record[fields[key as keyof SinoJobsFields] ?? key])

    const id = text('id')
    if (id === '') continue

    const notes: string[] = []

    // ── 薪资：接口的 `salary_range` 就是展示值（`面议` / `25K+`…）。
    // `salary_raw` 是**核心字段**，空串会被 `partitionByRequiredFields` 拦下；
    // 万一字段缺失，给"面议"这个可读兜底（这个平台"面议"本就是真实值，不是掩码）。
    let salaryRaw = text('salaryRange')
    if (salaryRaw === '') {
      salaryRaw = '面议'
      notes.push('salary:absent')
    }

    const title = text('title')
    if (title === '') notes.push('title:missing')

    // ── 标签：置顶岗（`top_time` 非空）是平台的高优先级信号 ──
    const tags: string[] = []
    if (text('topTime') !== '') tags.push('置顶')

    // ── 发布时间：平台给的是 **Unix 秒**（`release_time`，实测 `1788424680`）。
    // 页面显示的是北京时区日期（Asia/Shanghai）—— 这里用 +8h 再取 UTC 日期段，
    // 避免 `new Date(sec*1000)` 在其它时区机器上漂移一天。
    const releaseSecs = Number(text('releaseTime'))
    let publishedAt: string | null = null
    if (Number.isFinite(releaseSecs) && releaseSecs > 0) {
      publishedAt = new Date(releaseSecs * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10)
    }

    out.push({
      platformJobId: id,
      title,
      salaryRaw,
      company: text('company'),
      sourceUrl: config.detailUrlTemplate.split('{jobId}').join(id),
      city: text('workCity'),
      expReq: text('experience'),
      eduReq: text('education'),
      tags,
      publishedAt,
      notes,
    })
  }

  return out
}

/** 接口响应的最小形状（页面上下文里没法 import 类型，只能就地描述）。 */
interface SinoJobsResponse {
  status?: unknown
  info?: unknown
  data?: { rows?: unknown }
}

/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 与神仙外企同款的两步拆分：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export async function fetchListInPage(arg: {
  url: string
  body: Record<string, string>
}): Promise<{ ok: boolean; statusCode: number | null; message: string; rawStatus: number }> {
  // ⚠️ 不写 `window.fetch`：真浏览器里 `fetch` 挂在 `window`（= globalThis）上，
  // 而离线夹具里 `window` 是 jsdom 的 window、**没有** fetch（见 `test/support/jsdom-page.ts`）。
  // `globalThis` 在两条路径上都拿得到"当前上下文"的东西，是唯一两边都成立的说法。
  const scope = globalThis as unknown as {
    __SINOJOBS_LIST_PAYLOAD__?: unknown
    /** 共享的"页面上下文 fetch"标记（jsdom-page.ts 会装；真浏览器不装，见下）。 */
    __WAIQI_FETCH__?: unknown
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{
      json(): Promise<unknown>
      status?: number
    }>
  }
  // 页面上下文里 fetch **一定存在**（真浏览器如此）。这里只防两种异常：
  //   1) fetch 根本不存在（页面上下文被破坏）；
  //   2) 标记在、但当前 fetch 不是装进去的那个 —— 那多半是宿主 Node 的 fetch 漏了进来。
  //      注意标记只有在**离线夹具**里才存在（jsdom-page.ts 每次 evaluate 都装），
  //      真浏览器路径标记是 undefined —— 所以"标记缺失"不能当错误。
  if (typeof scope.fetch !== 'function') {
    return { ok: false, statusCode: null, message: 'fetch 不可用（页面上下文异常）', rawStatus: 0 }
  }
  if (scope.__WAIQI_FETCH__ !== undefined && scope.__WAIQI_FETCH__ !== scope.fetch) {
    return {
      ok: false,
      statusCode: null,
      message: 'fetch 不是页面上下文的（拒绝回退宿主 fetch）',
      rawStatus: 0,
    }
  }

  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(arg.body)) form.set(key, value)

  let payload: unknown = null
  let rawStatus = 0
  try {
    const response = await scope.fetch(arg.url, {
      method: 'POST',
      // 带上同源 Cookie / 登录态 —— 与用户自己在页面上翻列表走同一条链路。
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body: form.toString(),
    })
    rawStatus = typeof response.status === 'number' ? response.status : 0
    payload = await response.json()
  } catch (error) {
    const name =
      error !== null && typeof error === 'object' && 'name' in error
        ? String((error as { name: unknown }).name)
        : 'Error'
    return { ok: false, statusCode: null, message: `网络请求失败（${name}）`, rawStatus }
  }

  // 把响应交给 `extractJobsInPage` —— 它在**同一次 evaluate 的后续调用**里读这个全局。
  scope.__SINOJOBS_LIST_PAYLOAD__ = payload
  const parsed = payload as SinoJobsResponse | null
  const statusValue = parsed?.status
  const statusCode =
    typeof statusValue === 'number' ? statusValue : typeof statusValue === 'string' && statusValue !== ''
      ? Number(statusValue)
      : null
  const message =
    parsed !== null && parsed !== undefined && typeof parsed.info === 'string' ? parsed.info : ''
  // 实测成功码：1（`{"status":1,"info":"数据获取成功"}`）。
  const ok = statusCode === 1
  return { ok, statusCode, message, rawStatus }
}

/**
 * SinoJobs 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 走"**共享词表、自有结构**"（同 zhaopin）：列表不是 DOM 渲染的，"卡片数"由上层算好后传进来，
 * 而且它有一个独有的**弹窗判据**（`.xcConfirm` 里带登录字样）——
 * 这既是结构差异，也不适合塞进共享函数。
 */
const SINOJOBS_BLOCK_SIGNALS = {
  captchaSelectors: ['.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  // 阈值 80 比通用的 120 更严：它的"搜到 0 条"结果页也有筛选器文案
  blankTextLength: 80,
} as const

/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 空白页。
 *
 * 与神仙外企同理：列表不是 DOM 渲染的，"卡片数"只能当佐证，**接口返回**才是主判据 ——
 * 但接口侧的错误（`status != 1`）已经在 `readListPage` 处以抛错暴露成 `PARSE_FAILED`，
 * 这里只处理**页面结构信号**（实测该平台未观察到接口侧的专门风控码）。
 */
export function detectBlockInPage(arg: {
  cardCount: number
  /** 通用词表（宿主侧用 `signalsOf(...)` 组装后传进来）。 */
  signals: BlockSignalSet
}): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')

  for (const selector of arg.signals.captchaSelectors) {
    try {
      if (document.querySelector(selector) !== null) return 'captcha'
    } catch {
      // 单个选择器非法不影响其它判据
    }
  }
  for (const word of arg.signals.rateText) {
    if (compact.includes(word)) return 'rate-limited'
  }
  // 平台侧"额度用完"≠ 频控：退避重试没用，今天就此打住。
  for (const word of arg.signals.quotaText) {
    if (compact.includes(word)) return 'quota-exhausted'
  }

  // 站内错误弹窗（xcConfirm，`window.wxc.xcConfirm`）：接口失败时页面会弹。
  // 弹窗里带登录字样 → 登录墙；否则只按页面文本继续往下判，**不硬猜**风控类型。
  if (document.querySelector('.xcConfirm') !== null) {
    if (/登录|请先登录|未登录/.test(compact)) return 'login-required'
  }

  // 阈值来自共享词表（80，比通用的 120 更严）
  if (arg.cardCount === 0 && compact.length < arg.signals.blankTextLength) return 'blank'
  return null
}

/** 在页面上下文里找「下一页」是否可用（UI 信号；真正的闸门是 `maxPages` + 接口 total）。 */
export function hasNextPageInPage(arg: { selector: string }): boolean {
  try {
    return document.querySelector(arg.selector) !== null
  } catch {
    return false
  }
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递（`/UserCenter/...`）。
 * 未登录时顶部导航是 `<a class="sign-out" href="/Ucenter/login.html">登录</a>`（实测）；
 * 已登录时该链接被用户菜单替换。所以这里只看一个结构性信号：**登录链接是否还在**。
 */
export function isLoggedInInPage(): boolean {
  return document.querySelector('a.sign-out') === null
}

/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export function countCardsInPage(arg: { selector: string }): number {
  try {
    return document.querySelectorAll(arg.selector).length
  } catch {
    return 0
  }
}

/**
 * **在页面上下文里**解析详情页（服务端渲染的静态 HTML，实测结构）：
 *
 *   * 职位名：`h5`；
 *   * 公司名：第一个 `h6`；
 *   * 信息列表（`ul li`）：`[薪资, 城市, 经验 X, 全职/兼职/实习, 发布于YYYY-MM-DD]`；
 *   * JD 正文：`h6`（职位描述/任职要求/联系方式/公司信息）+ 随后的 `p`。
 *
 * 信息列表**按文案模式分类而不是按下标**：平台字段增减时按位置读会错位。
 */
export function extractDetailInPage(config: SinoJobsConfig): RawJobDetail {
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

  const detail = config.detail
  // 岗位 id 从当前地址取（`/Recruitment/content.html?id=4319`）；两条路径都有 location。
  const idMatch = /[?&]id=(\d+)/.exec(String(location.href))
  const jobId = idMatch === null || idMatch[1] === undefined ? '' : idMatch[1]

  const title = textOf(queryAll(document, detail.title)[0] ?? null)
  const company = textOf(queryAll(document, detail.company)[0] ?? null)

  // ── 信息列表：按文案模式分类，不按下标 ──
  let salaryRaw = ''
  let city = ''
  let expReq = ''
  let publishedAt: string | null = null
  const tags: string[] = []
  for (const li of queryAll(document, detail.infoList)) {
    const value = clean(li.textContent)
    if (value === '') continue
    if (/^发布于/.test(value)) {
      const m = /^发布于(\d{4}-\d{2}-\d{2})/.exec(value)
      publishedAt = m === null || m[1] === undefined ? null : m[1]
      continue
    }
    if (/^经验\s*/.test(value)) {
      expReq = value.replace(/^经验\s*/, '').trim()
      continue
    }
    if (/^(全职|兼职|实习)$/.test(value)) {
      tags.push(value)
      continue
    }
    if (salaryRaw === '' && /(K|薪|元|万|面议)/.test(value)) {
      salaryRaw = value
      continue
    }
    // 兜底：还没拿到城市且这行不像薪资（既无 K/元/万/面议 也不是已分类项）→ 城市。
    if (city === '' && salaryRaw !== '' && /[\u4e00-\u9fff]/.test(value)) {
      city = value
    }
  }

  // ── JD 正文：拼接所有段落的可读文本（去重、去首尾空行） ──
  const paragraphs: string[] = []
  const seen = new Set<string>()
  for (const block of queryAll(document, detail.jdBlocks)) {
    const value = clean(block.textContent)
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    paragraphs.push(value)
  }
  const jdText = paragraphs.length === 0 ? null : paragraphs.join('\n')

  return {
    platformJobId: jobId,
    title,
    salaryRaw,
    company,
    sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
    city: city === '' ? undefined : city,
    expReq: expReq === '' ? undefined : expReq,
    tags,
    publishedAt,
    jdText,
  }
}

export interface SinoJobsAdapterOptions {
  config?: SinoJobsConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等页面渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造 SinoJobs 适配器。 */
export function createSinoJobsAdapter(options: SinoJobsAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_SINOJOBS_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 上一次 `gotoSearch` 记下的筛选条件。
   *
   * 为什么需要它：抓取主链每页会重新调 `gotoSearch`，而 `readListPage(page)`
   * 只拿得到 `page`，拿不到 `criteria`（见 `domain/crawl.ts` 的循环）。
   * 用 `WeakMap` 而不是 `Map`：页面关闭后条目自动消失，不留全局残留（C15）。
   */
  const pending = new WeakMap<object, SearchCriteria>()

  /**
   * 最近一次列表响应的 `{total, page}`，按页面记 —— `hasNextPage` 的**真判据**。
   *
   * 为什么不用下一页按钮：接口的 `page` 参数是真实分页（实测第 2 页与第 1 页零重叠），
   * 而"按钮在不在"只反映 UI 状态。抓取主链的顺序是 `readListPage → hasNextPage`，
   * 所以读上一轮响应的 total 最精确：`page * pageSize < total` 才翻页。
   */
  const lastMeta = new WeakMap<object, { total: number; page: number }>()

  /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，对应接口的 keywords 字段（实测生效：工程师 → 78→17 条）',
    },
    {
      key: 'city',
      label: '地点',
      values: Object.keys(config.addressCodes).map((name) => ({ value: name, label: name })),
      hint:
        '对应接口 address_id。取值来自平台级联接口（10000=国内/10001=国外/省级 id，实测 address_id=3 → 只回上海岗）；' +
        '城市级 id 未内置，需要时在 DB 覆盖 config.addressCodes 补',
    },
    {
      key: 'salaryRange',
      label: '薪资',
      values: SINOJOBS_SALARY_OPTIONS,
      hint: '对应接口 salary_range，值域来自页面筛选项（#work-salary strong[rel]）',
    },
    {
      key: 'experience',
      label: '经验',
      values: SINOJOBS_EXPERIENCE_OPTIONS,
      hint: '对应接口 experience，值域来自页面筛选项（#work-year strong[rel]）',
    },
    {
      key: 'workNature',
      label: '工作性质',
      values: SINOJOBS_WORK_NATURE_OPTIONS,
      hint: '对应接口 work_nature（全职/兼职/实习）',
    },
    {
      key: 'jobType',
      label: '行业类别',
      values: config.jobTypeList.map((item) => ({ value: item.id, label: item.name })),
      hint:
        '对应接口 job_type，内置为页面 #job_type 全部 43 项的实测 seed；' +
        '站点增删行业时在 DB 覆盖 config.jobTypeList 即可',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: SINOJOBS_MAX_PAGES,
      hint:
        `最多 ${String(SINOJOBS_MAX_PAGES)} 页（每页 ${String(config.pageSize)} 条）—— ` +
        '全量池实测约 78 条，4 页即可抓完；给 6 页留足余量',
    },
  ]

  return {
    id: 'sinojobs',
    ...platformFacts('sinojobs'),
    displayName: 'SinoJobs 中欧招聘',
    capabilities: {
      // 实测：列表接口匿名可读、可翻页、可筛选（关键词/薪资/经验/性质/行业/地点全部生效）。
      searchWithoutLogin: true,
      // 投递要登录（/UserCenter/resumeShow.html），且未登录 DOM 里没有可靠的投递入口 ——
      // 与打招呼一起留空（fail-closed）。
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      // 结构化接口：字段齐、几乎不用猜；但大量岗位薪资是"面议"（这是平台的真实展示值），
      // 且"国外"岗位没有区划信息，所以不是 high。
      fieldCompleteness: 'medium',
      // 简单 PHP+jQuery 站，匿名接口实测未观察到验证码 —— 按 low。
      antiBot: 'low',
    },
    // §4.2.4：适配器自己声明必需字段（协议里的四个核心字段）。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: SINOJOBS_MAX_PAGES,

    auth: {
      loginUrl: `${config.webBase}/Ucenter/login.html`,
      /**
       * 搜索不需要登录，所以这里只看**登录链接是否还在**这一个结构性信号
       * （未登录是 `a.sign-out`，已登录被用户菜单替换）。
       */
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, undefined as never)
      },
    },

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildSinoJobsSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildSinoJobsSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(
            `SinoJobs：无法为地点「${criteria.city ?? ''}」构造搜索地址（地点 id 未配置，` +
              '地点 id 只能从平台级联接口实测拿到）',
          )
        }
        // 筛选条件记在页面对象上：主链每页会重新调 gotoSearch，而 readListPage 只拿得到 page。
        // **先记再跳**：navigation 失败时条件也已经在，判墙仍能拿到正确的 page。
        pending.set(page as object, criteria)
        await page.goto(url)

        // 站点是静态页 + AJAX 渲染：`load` 时列表还没渲染。等卡片只是为了
        // "别在页面还没活过来时发请求"，**解析不依赖它**（数据来自接口），
        // 所以超时也不当错误。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
        }
        // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts），不是均匀随机。
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        const criteria = pending.get(page as object) ?? {}
        const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1
        const request = await page.evaluate(fetchListInPage, {
          url: `${config.webBase}${config.apiPath}`,
          body: buildSinoJobsRequestBody(config, criteria, pageNo),
        })

        if (!request.ok) {
          // 抛错 → 主链记 `PARSE_FAILED`、按阈值把适配器置为 degraded。
          // **绝不能静默返回空数组**：那会被当成"今天没有新岗位"（§4.2.4）。
          throw new Error(
            `SinoJobs：列表接口未返回可用数据（status=${request.statusCode === null ? '?' : String(request.statusCode)}，` +
              `message=${request.message === '' ? '（空）' : request.message}）`,
          )
        }

        const jobs = await page.evaluate(extractJobsInPage, config)
        // 记住 total + 当前页：hasNextPage 用 `page * pageSize < total` 决定是否翻页。
        // total 来自响应文本（`"78"`），页面上下文里已把载荷挂到全局。
        const total = await page.evaluate(readTotalInPage, undefined as never)
        lastMeta.set(page as object, { total, page: pageNo })

        if (jobs.length === 0) {
          // 接口成功但零记录有两种可能：真的没结果，或响应形状变了（字段/层级改名）。
          // 两种都让主链按 `NO_RECORDS` 记成 partial，**不在这里猜**。
          return []
        }
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        const meta = lastMeta.get(page as object)
        if (meta === undefined) return false
        // 真实分页判据：当前页已拉到的条数还不到总量就还有下一页。
        return meta.page * config.pageSize < meta.total
      },
    },

    // P2 详情页：服务端渲染的静态 HTML，选择器有实测证据（2026-09-18 逐项验证）。
    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, config)
      },
    },

    guard: {
      /**
       * 判墙**不发请求**：接口错误在 `readListPage` 处以抛错暴露（PARSE_FAILED），
       * 这里只读当前页面的结构性信号（验证码 / 限流文案 / 错误弹窗 / 空白页）。
       */
      async detectBlock(page): Promise<BlockKind | null> {
        const cardCount = await page.evaluate(countCardsInPage, { selector: config.selectors.card })
        return await page.evaluate(detectBlockInPage, {
          cardCount,
          signals: signalsOf(SINOJOBS_BLOCK_SIGNALS),
        })
      },
    },

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 投递要登录态，且未登录 DOM 里没有可靠的投递按钮契约（入口是 /UserCenter/resumeShow.html）。
    // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed）。
  }
}

/** 在页面上下文里读最近一次列表响应的 total（没抓到就 0）。 */
export function readTotalInPage(): number {
  const payload = (globalThis as unknown as { __SINOJOBS_LIST_PAYLOAD__?: unknown })
    .__SINOJOBS_LIST_PAYLOAD__
  const data = (payload as { data?: unknown } | null | undefined)?.data
  if (data === null || data === undefined || typeof data !== 'object') return 0
  const raw = (data as Record<string, unknown>)['total']
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}
