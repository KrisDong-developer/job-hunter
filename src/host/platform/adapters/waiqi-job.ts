/**
 * 神仙外企（waiqi.com）适配器 —— 列表页采集。
 *
 * ## 这个平台和 51job / 智联的根本区别：**页面里没有岗位列表的 HTML**
 *
 * `/position` 是纯前端 SPA（Vue3 + webpack 分包），列表由
 * `POST https://backservice.offerxiansheng.com/api/position-service/social-position/foreign/page-list`
 * 返回的 JSON 渲染而来。所以：
 *
 *   * 抓 DOM 只能拿到一堆空壳 —— 必须**在页面上下文里调接口**（`page.evaluate` 里 `fetch`）；
 *   * 在页面里发请求还顺带拿到了**同源 Cookie / 登录态**（`credentials: 'include'`），
 *     与用户自己在浏览器里翻列表走同一条链路（比在 Node 侧另起一个 HTTP 客户端更"像人"）。
 *
 * ## 两条实测出来的硬事实（决定了能力声明，不要试图"优化"掉）
 *
 * | 事实 | 实测 | 后果 |
 * |---|---|---|
 * | 服务端翻页是坏的 | `page>=2` 恒返回 `positionVO.records=[]`（`size` 取 1/3/10/20/21/50 都一样） | `maxPages = 1`，**不假装能翻页** |
 * | 单页容量上限 50 | `size=50` 正常；`size=100` → `code=1010 "size最大为50"` | 一次最多 50 条 |
 *
 * 翻页那条特别要紧：`page=2` 返回的是**成功响应 + 0 条**，
 * 如果声明 5 页，主链会把 4 次"成功但空"记成正常结果
 * —— 正好落进 §4.2.4 要防的"今天没有新岗位"静默失败。
 *
 * ## 哪些筛选真的生效（其余一律不声明）
 *
 * 实测生效：`name`（关键词）、`cityIds`（城市 id）、`workExp`、`education`、
 * `type`（外企 / 不限）、`posIds`（职能）、`businessCategoryIdList`（行业）、
 * `companyTypeList`（企业性质）。
 * 实测**不生效**：`keyword` / `positionName` / `searchKey`（原样返回全量）、
 * `cityName` / `city`（被忽略）、`foreignCompanyTag`、`status`、`expectId`；
 * `sort` 虽然收参数，但 0~5 的结果**逐条一致**（等于没有排序），所以也不声明。
 *
 * 所以本适配器只声明**验证过**的维度（关键词 / 城市 / 工作经验 / 学历 / 职位范围 /
 * 页数）；没验证过的一律不声明 —— 声明了却传不下去，用户会以为筛选生效了。
 * 职能 / 行业 / 企业性质虽然生效，但要各自挂一份 id 表才做得对，本轮先不做（见
 * `docs/PLATFORM-WAIQI.md` §6）。
 *
 * ## robots.txt 取舍
 *
 * `https://www.waiqi.com/robots.txt` 只禁 `/position/detail`：
 * ```
 * User-agent: *
 * Disallow: /position/detail
 * Allow: /
 * ```
 * 本适配器访问的是 `/position`（列表）与列表**接口**，不碰 `/position/detail`，
 * 因此与站点声明一致。详情页链接仍然会写进 `source_url`（那是给**人**点的），
 * 但采集链路不会去自动打开它。
 */
import type { BlockKind, CoreField } from '../../../shared/enums.js'
import { CORE_FIELDS } from '../../../shared/enums.js'
import { humanDelayMs } from '../pacing.js'
import type { CriteriaDimension, RawJob, SearchCriteria, SiteAdapter } from '../types.js'
import { platformCriterion } from '../types.js'

/** 页面外壳地址（人看的入口）。 */
export const WAIQI_WEB_BASE = 'https://www.waiqi.com'

/** 接口根：列表接口在 `position-service` 下。 */
export const WAIQI_API_BASE = 'https://backservice.offerxiansheng.com/api/position-service'

/** 列表接口路径。`/social-position/foreign/...` 就是外企平台自己在用的那个。 */
export const WAIQI_LIST_PATH = '/social-position/foreign/page-list'

/**
 * 单页容量上限（平台硬上限，不是我们保守）。
 *
 * 实测：`size=50` 正常返回 50 条；`size=100` → `code=1010, message="size最大为50"`。
 */
export const WAIQI_MAX_PAGE_SIZE = 50

/**
 * 最多抓几页 —— **只能是 1**。
 *
 * 实测：`page=2`（乃至 3、4）一律返回 `code=1000` + `positionVO.records=[]`，
 * 与 `size` 无关。也就是说第二页永远拿不到数据。
 * 与其声明 5 页然后静默返回 0 条，不如老实写 1：
 * **"抓不到"要让用户看见，不能伪装成"没有新岗位"**（§4.2.4）。
 */
export const WAIQI_MAX_PAGES = 1

/**
 * 职位范围（页面顶部的两个 tab）。
 *
 * 实测：`type=2` 是页面默认（外企），`type=1` 放宽到合资/民营；
 * `type=0` 会让服务端报 `code=999 系统数据异常`，所以值域里没有它。
 */
export const WAIQI_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '2', label: '外企职位（默认）' },
  { value: '1', label: '不限（含合资 / 民营）' },
]

/**
 * 工作经验取值域。
 *
 * 值域来自实测：`workExp=N` 的返回量呈钟形（0=不限、1=1年以下、2=1-3年、
 * 3=3-5年、4=5-10年、5=10年以上），`6`/`7` 恒为 0 条 —— 说明只有 0~5 是有效档位。
 * 与页面筛选项 `exp = ['不限经验','1年以下','1-3年','3-5年','5-10年','10年以上']` 一致。
 */
export const WAIQI_WORK_EXP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '不限经验' },
  { value: '1', label: '1年以下' },
  { value: '2', label: '1-3年' },
  { value: '3', label: '3-5年' },
  { value: '4', label: '5-10年' },
  { value: '5', label: '10年以上' },
]

/**
 * 学历取值域。
 *
 * 来源：前端 `getEducationEnum({scene:'not_limit'})`
 * → `GET https://backservice.offerxiansheng.com/api/backend-service/enum/education-enum`
 * 实测原样（**注意不是从 0 递增的**：6=初中及以下、7=高中、8=中专/中技）：
 * `0 不限 / 6 初中及以下 / 7 高中 / 8 中专中技 / 1 大专 / 2 本科 / 3 硕士 / 4 博士`。
 *
 * ⚠️ 这里的 `0` 与列表记录里的 `educationName="不限学历"` 是同一件事。
 */
export const WAIQI_EDUCATION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: '不限' },
  { value: '1', label: '大专' },
  { value: '2', label: '本科' },
  { value: '3', label: '硕士' },
  { value: '4', label: '博士' },
  { value: '6', label: '初中及以下' },
  { value: '7', label: '高中' },
  { value: '8', label: '中专/中技' },
]

/**
 * 城市名 → 平台城市 id。
 *
 * **必须人工维护**（§4.2.2：字段→平台编码的映射无法自动推导）。
 * 取值方式（已逐个实测）：
 * ```
 * GET {WAIQI_API_BASE}/city/search?name=深圳
 * → {"code":1000,"data":[{"id":248,"name":"深圳市","type":2,"parentId":20,...}]}
 * ```
 * 城市 id 是平台自增的城市表主键（北京=35、上海=37、深圳=248、苏州=124……），
 * **不能**按行政区划码猜 —— 猜错的表现是"搜出来 0 条"，静默无提示。
 *
 * 表里没有的城市 → `buildSearchUrl` 返回 `null`、`gotoSearch` 明确报错，
 * 而不是把城市名原样塞进去让服务端默默忽略（那会变成"抓了全国还以为抓了深圳"）。
 * 补城市请走 DB 覆盖：`setting(scope='platform', scope_ref='waiqi', key='adapter-config')`
 * 的 `cityCodes`，值直接从上面那条 `city/search` 抄。
 */
export const WAIQI_CITY_CODES: Record<string, number> = {
  北京: 35,
  上海: 37,
  广州: 247,
  深圳: 248,
  天津: 36,
  重庆: 38,
  南京: 120,
  苏州: 124,
  杭州: 133,
  成都: 282,
  青岛: 182,
  郑州: 198,
  武汉: 216,
  长沙: 233,
  西安: 354,
  无锡: 121,
  宁波: 134,
  厦门: 162,
  佛山: 252,
  东莞: 263,
  合肥: 144,
  济南: 181,
  大连: 85,
  沈阳: 84,
  福州: 161,
  南昌: 170,
  昆明: 330,
  贵阳: 303,
  南宁: 364,
  哈尔滨: 107,
  长春: 98,
  石家庄: 39,
  太原: 50,
  兰州: 268,
  珠海: 249,
  中山: 264,
  惠州: 257,
  温州: 135,
  嘉兴: 136,
  南通: 125,
  常州: 123,
  徐州: 122,
  烟台: 186,
  潍坊: 187,
  泉州: 165,
  香港: 425,
  澳门: 424,
  台北: 61,
}

/**
 * 职能取值域（`posIds`）—— 实测 **seed**，来自真实列表响应，非全量。
 *
 * 前端的筛选条件（`chunk-ce4890b6`）里职能是两级树：`businessCategory（行业）→ posInfos（职能）`，
 * 完整表由接口 `getPlatformTypes` 返回；这里只内置**抓取夹具里真实出现、且常见度高的 16 个职能**
 * （含 IT技术 / 医药 / 销售 / 运营 等高频类），走与城市完全相同的「人工维护 + DB 覆盖」逻辑（§7）。
 *
 * 需要扩充/补全时，请走 DB：`setting(scope='platform', scope_ref='waiqi', key='adapter-config')`
 * 的 `posInfoList`，值从 `GET {apiBase}/platform-type` 这类接口抄（见 `docs/PLATFORM-WAIQI.md` §6）。
 */
export const WAIQI_POS_INFO_SEED: Array<{ id: number; name: string }> = [
  { id: 43, name: '商务渠道' },
  { id: 67, name: '税务/审计/会计/咨询' },
  { id: 81, name: '私域运营' },
  { id: 97, name: '销售顾问' },
  { id: 98, name: '销售经理' },
  { id: 115, name: '零售管理' },
  { id: 137, name: '项目助理' },
  { id: 176, name: '仓储管理' },
  { id: 178, name: '工程管理' },
  { id: 203, name: '药品生产' },
  { id: 239, name: '热设计工程师' },
  { id: 323, name: '算法工程师' },
  { id: 408, name: '前台' },
  { id: 424, name: '会计经理/主管' },
  { id: 426, name: '总账会计' },
  { id: 585, name: '售前技术支持' },
]

/**
 * 行业取值域（`businessCategoryIdList`）—— 实测 **seed**，来自真实列表响应。
 *
 * 完整表由接口 `getBusList` 返回（前端已按 `name !== "不限"` 过滤）。
 * 这里的 13 个是夹具里真实出现的主行业（IT / 医药 / 金融 / 销售 / 运营 等）。同上，DB 可扩充。
 */
export const WAIQI_BUSINESS_CATEGORY_SEED: Array<{ id: number; name: string }> = [
  { id: 8, name: '产品' },
  { id: 10, name: '市场' },
  { id: 11, name: '运营' },
  { id: 13, name: '金融' },
  { id: 15, name: '供应链' },
  { id: 20, name: '销售' },
  { id: 21, name: '项目' },
  { id: 25, name: '工程' },
  { id: 30, name: '医药/医疗' },
  { id: 32, name: '机械设计/制造' },
  { id: 33, name: 'IT技术' },
  { id: 36, name: '人事/行政' },
  { id: 37, name: '财务/税务/法务' },
]

/** 详情页 URL 模板。`{jobId}` 与 `{posType}` 会被替换。 */
export const WAIQI_DETAIL_URL_TEMPLATE = `${WAIQI_WEB_BASE}/position/detail?id={jobId}&posType={posType}`

/**
 * 记录字段名 → 我们的语义。
 *
 * 平台改字段名时**在 DB 里覆盖着改**即可，不用等发版（ADR-19 / J2 / R5）。
 * 右边一列全部来自实测响应原文。
 */
export interface WaiqiFields {
  id: string
  /** 职位名（中文，可能为空）。 */
  title: string
  /** 职位名英文（很多外企岗位只有它更完整）。 */
  titleEn: string
  company: string
  /** 月薪下限 / 上限，单位 **K**。 */
  salaryMin: string
  salaryMax: string
  /** 年发薪月数（`coefficient`）。实测 12 或 13，也可能为 null。 */
  salaryMonths: string
  /** 是否面议（`negotiable`，1 = 面议）。 */
  negotiable: string
  /** 城市（`cityNameList` 是**一个字符串**，不是数组）。 */
  city: string
  district: string
  /** 岗位职能分类（`posCategoryName`，如 `人事/行政` / `IT技术` —— 与行业 `businessCategoryNameList` 不同）。 */
  posCategory: string
  /** 详细办公地址（`address`，也可能是一句说明如"地点不限，远程工作支持英国总部"）。 */
  address: string
  exp: string
  edu: string
  /** 平台标签数组（`tagNameList`，可能为 null）。 */
  tags: string
  /** 另一套标记，逗号分隔（如 `急招,可远程`）。 */
  attribute: string
  publishedAt: string
  industry: string
  companySize: string
  companyNature: string
  /** 外企国别标签（`美企` / `德企` / `瑞士外企`……）。 */
  foreignTag: string
  logoUrl: string
  /** 来源（实测 2/3，疑似"自投/官方渠道"）。 */
  source: string
  /** 岗位类别（1=社招，实测）。 */
  positionType: string
  /** 有的岗位直接跳官网 ATS，此时这里是外部地址。 */
  outsideUrl: string
  /** 投递背后的渠道 / ATS 名（`informationSource`，如 `successfactors` / `workday` / `万豪官网招聘`）。 */
  informationSource: string
  /** 投递方式（`sendType`）。 */
  applyKind: string
}

export interface WaiqiConfig {
  webBase: string
  apiBase: string
  listPath: string
  detailUrlTemplate: string
  /** 记录里 `posType` 缺失时的兜底值。 */
  defaultPosType: string
  cityCodes: Record<string, number>
  /** 职能（`posIds`）取值域。实测 seed，可在 DB 覆盖扩充。 */
  posInfoList: Array<{ id: number; name: string }>
  /** 行业（`businessCategoryIdList`）取值域。实测 seed，可在 DB 覆盖扩充。 */
  businessCategoryList: Array<{ id: number; name: string }>
  fields: WaiqiFields
  /** 只用于"等页面渲染"与"翻页按钮探测"，**不用于解析**（解析走接口）。 */
  selectors: {
    card: string
    nextPage: string
  }
}

export const DEFAULT_WAIQI_CONFIG: WaiqiConfig = {
  webBase: WAIQI_WEB_BASE,
  apiBase: WAIQI_API_BASE,
  listPath: WAIQI_LIST_PATH,
  detailUrlTemplate: WAIQI_DETAIL_URL_TEMPLATE,
  defaultPosType: '1',
  cityCodes: WAIQI_CITY_CODES,
  posInfoList: WAIQI_POS_INFO_SEED,
  businessCategoryList: WAIQI_BUSINESS_CATEGORY_SEED,
  fields: {
    id: 'id',
    title: 'name',
    titleEn: 'nameEn',
    company: 'companyName',
    salaryMin: 'salaryMin',
    salaryMax: 'salaryMax',
    salaryMonths: 'coefficient',
    negotiable: 'negotiable',
    city: 'cityNameList',
    district: 'districtName',
    posCategory: 'posCategoryName',
    address: 'address',
    exp: 'workExpName',
    edu: 'educationName',
    tags: 'tagNameList',
    attribute: 'attribute',
    publishedAt: 'createTime',
    industry: 'businessCategoryNameList',
    companySize: 'scaleName',
    companyNature: 'companyType',
    foreignTag: 'foreignCompanyTag',
    logoUrl: 'logoUrl',
    source: 'source',
    positionType: 'posType',
    outsideUrl: 'outsideUrl',
    informationSource: 'informationSource',
    applyKind: 'sendType',
  },
  selectors: {
    // 实测渲染出来的卡片容器（`.list-wrap` 下的岗位卡）。
    // 它只用来等页面活过来 —— 数据来自接口，不来自这些节点。
    card: '.list-wrap .position-item',
    nextPage: '.el-pagination .btn-next:not([disabled])',
  },
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeWaiqiConfig(override: unknown): WaiqiConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_WAIQI_CONFIG
  const patch = override as Partial<WaiqiConfig>
  const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  return {
    webBase: text(patch.webBase, DEFAULT_WAIQI_CONFIG.webBase),
    apiBase: text(patch.apiBase, DEFAULT_WAIQI_CONFIG.apiBase),
    listPath: text(patch.listPath, DEFAULT_WAIQI_CONFIG.listPath),
    detailUrlTemplate: text(patch.detailUrlTemplate, DEFAULT_WAIQI_CONFIG.detailUrlTemplate),
    defaultPosType: text(patch.defaultPosType, DEFAULT_WAIQI_CONFIG.defaultPosType),
    cityCodes: { ...DEFAULT_WAIQI_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    posInfoList: Array.isArray(patch.posInfoList)
      ? patch.posInfoList
      : DEFAULT_WAIQI_CONFIG.posInfoList,
    businessCategoryList: Array.isArray(patch.businessCategoryList)
      ? patch.businessCategoryList
      : DEFAULT_WAIQI_CONFIG.businessCategoryList,
    fields: { ...DEFAULT_WAIQI_CONFIG.fields, ...(patch.fields ?? {}) },
    selectors: { ...DEFAULT_WAIQI_CONFIG.selectors, ...(patch.selectors ?? {}) },
  }
}

/**
 * 把 `criteria.city` 归一化成城市名数组。
 *
 * 支持**多城市**：逗号分隔（`深圳,广州` 或中文顿号）、去空白、去重。
 * 平台接口的 `cityIds` 原生接受逗号拼接的多个城市码（`"248,247"`），
 * 一次请求就能覆盖多个目标城市 —— 因为服务端翻页是坏的（§3），单页抓取尤其值得把多城合并成一次过滤。
 */
export function splitCityList(city: string | undefined): string[] {
  if (city === undefined || city === '') return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of city.split(/[,，、]/)) {
    const name = part.trim()
    if (name !== '' && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 关键认知：筛选**不在 URL 里**。平台把条件放在 POST body 里，
 * URL 只承载页面自己的 `keyword` / `posType`。所以这里构造出来的地址
 * 是"人能看着核对"的入口，真正的筛选由 `buildWaiqiRequestBody` 负责。
 *
 * 城市我们仍然在这里校验：任一城市没配就直接返回 `null`（**不猜**），
 * 否则"城市没配"会变成一次静默的全国搜索。支持逗号分隔的多城市。
 */
export function buildWaiqiSearchUrl(config: WaiqiConfig, criteria: SearchCriteria): string | null {
  const cities = splitCityList(criteria.city)
  if (cities.some((name) => config.cityCodes[name] === undefined)) {
    return null
  }
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set('keyword', criteria.keyword)
  }
  // 页面自己的参数是 `posType`；与接口的 `type` 是同一件事。
  // 只在**非默认值**时才写进 URL —— 塞一个平台默认值会改变"什么都没配"时的行为。
  const posType = platformCriterion(criteria, 'type')
  if (posType !== '' && posType !== '2') {
    params.set('posType', posType)
  }
  const query = params.toString()
  const base = `${config.webBase}/position`
  return query === '' ? base : `${base}?${query}`
}

/** 接口请求体：页面初始值 + 用户配的筛选条件。 */
export function buildWaiqiRequestBody(
  criteria: SearchCriteria,
  cityCodes: Record<string, number>,
  page: number,
  size: number = WAIQI_MAX_PAGE_SIZE,
): Record<string, unknown> {
  // `type` 是平台特有维度，走 `platform` 命名空间（见 `platformCriterion`）。
  const type = platformCriterion(criteria, 'type')
  const body: Record<string, unknown> = {
    // 页面初始值（实测自前端组件 state.queryParams）：type=2 / status=1 / expectId=0 / sort=0。
    expectId: 0,
    status: 1,
    sort: criteria.sort === undefined || criteria.sort === '' ? 0 : Number(criteria.sort),
    type: type === '' ? 2 : Number(type),
    page,
    size,
    // `needAd=1` 与真实页面一致（服务端会在 records 里混入广告卡片，解析时按"没有 id"跳过）。
    needAd: 1,
  }
  // ⚠️ 关键词的键名是 `name`（实测）：`keyword` / `positionName` / `searchKey`
  // 都会被服务端忽略并原样返回全量 —— 那是最隐蔽的一种"筛选没生效"。
  if (criteria.keyword !== undefined && criteria.keyword !== '') body['name'] = criteria.keyword
  if (criteria.city !== undefined && criteria.city !== '') {
    // 多城市：把逗号分隔的城市名逐个映射成平台码，再用逗号拼成 `cityIds`（平台原生接受）。
    // 城市码未配置就**不写这个键**（宁可搜全国，也不要写一个错的城市码）。
    // `buildWaiqiSearchUrl` 已经先拦过一次，这里是第二道。
    const codes = splitCityList(criteria.city)
      .map((name) => cityCodes[name])
      .filter((code): code is number => code !== undefined)
    if (codes.length > 0) body['cityIds'] = codes.join(',')
  }
  const workExp = platformCriterion(criteria, 'workExp')
  if (workExp !== '') body['workExp'] = workExp
  const education = platformCriterion(criteria, 'education')
  if (education !== '') body['education'] = education
  // 职能 / 行业：前端取值域分别来自 `getPlatformTypes`（两级树）与 `getBusList`，
  // 我们在 config 里内置实测 seed（见 WAIQI_POS_INFO_SEED / WAIQI_BUSINESS_CATEGORY_SEED）。
  // `posIds` / `businessCategoryIdList` 均以**字符串**传（单值），与文档实测一致。
  const posInfo = platformCriterion(criteria, 'posInfo')
  if (posInfo !== '') body['posIds'] = posInfo
  const businessCategory = platformCriterion(criteria, 'businessCategory')
  if (businessCategory !== '') body['businessCategoryIdList'] = businessCategory
  for (const [key, value] of Object.entries(criteria.extra ?? {})) body[key] = value
  return body
}

/**
 * **在页面上下文里**解析列表。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以薪资拼接、日期截取这些逻辑在函数体内**各写一遍**，
 * 并由 `test/platform/waiqi.test.ts` 的「按源码重建函数」护栏守住。
 *
 * @param config 选择器与字段配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: WaiqiConfig): RawJob[] {
  // 下面这段是**同步**的：真正的网络请求在 `fetchListInPage` 里。
  // 这样"解析"与"取数"分开，解析逻辑可以被 jsdom 直接喂一段 JSON 验证。
  const maxCards = 200 // 异常页面兜底：最多解析多少条
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const asNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  const fields = config.fields
  // 数据来源优先级：接口载荷（`window.__WAIQI_LIST_PAYLOAD__`，由 fetchListInPage 写入）
  //   → 内联夹具载荷（离线测试用 `<script id="waiqi-fixture-payload">`）
  // 两者都没有时返回空数组 —— 上层会把它判成"没解析出记录"。
  const globalScope = globalThis as unknown as { __WAIQI_LIST_PAYLOAD__?: unknown }
  let payload: unknown = globalScope.__WAIQI_LIST_PAYLOAD__
  if (payload === undefined || payload === null) {
    const holder = queryAll(document, '#waiqi-fixture-payload')[0] ?? null
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
  const positionVo = (data['positionVO'] ?? {}) as Record<string, unknown>
  const rawRecords = positionVo['records']
  if (!Array.isArray(rawRecords)) return []
  const records = rawRecords.slice(0, maxCards)

  const out: RawJob[] = []
  for (const item of records) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = (key: string): string => clean(record[fields[key as keyof WaiqiFields] ?? key])

    const id = text('id')
    // 广告卡片没有 id —— 直接跳过（needAd=1 时它们与岗位混在同一数组里）。
    if (id === '') continue

    const notes: string[] = []

    // ── 薪资：平台的展示规则是 `{min}-{max}K`，`coefficient>12` 时挂 `*{n}薪` ──
    // `salary_raw` 是**核心字段**，空串会被 `partitionByRequiredFields` 拦下；
    // 这个平台大量岗位薪资为 null，所以必须给"面议"这个可读兜底，
    // 否则整轮抓取会全部进 `pending_repair`，看起来像适配器坏了。
    const min = asNumber(record[fields.salaryMin])
    const max = asNumber(record[fields.salaryMax])
    const months = asNumber(record[fields.salaryMonths])
    const negotiable = record[fields.negotiable] === 1
    let salaryRaw = '面议'
    if (!negotiable && (min !== null || max !== null)) {
      salaryRaw = `${String(min ?? 0)}-${String(max ?? min ?? 0)}K`
      if (months !== null && months > 12) salaryRaw = `${salaryRaw}*${String(months)}薪`
    } else if (min === null && max === null) {
      notes.push('salary:absent')
    }

    const title = text('title')
    const titleEn = text('titleEn')
    if (title === '' && titleEn === '') notes.push('title:missing')
    if (title === '' && titleEn !== '') notes.push('title:from-en')

    // ── 标签：`tagNameList`（数组）+ `attribute`（逗号分隔的另一套） ──
    const tags: string[] = []
    const tagList = record[fields.tags]
    if (Array.isArray(tagList)) {
      for (const tag of tagList) {
        const value = clean(tag)
        if (value !== '' && !tags.includes(value)) tags.push(value)
      }
    }
    const attribute = text('attribute')
    if (attribute !== '') {
      for (const part of attribute.split(/[,，、]/)) {
        const value = clean(part)
        if (value !== '' && !tags.includes(value)) tags.push(value)
      }
    }
    // 外企国别是"神仙外企"最有信息量的一个标签，单独缀到标签里（原始字段仍在记录里）。
    const foreignTag = text('foreignTag')
    if (foreignTag !== '') tags.push(`外企·${foreignTag}`)
    // 岗位职能分类（`posCategoryName`，如 人事/行政 / IT技术）—— 与行业 `industry` 互补，
    // 单独缀一个便于按"岗位性质"识别与检索。
    const posCategory = text('posCategory')
    if (posCategory !== '') tags.push(`职能·${posCategory}`)

    // ── 来源与投递方式（给后续"哪些要走官网 ATS"用） ──
    const sourceCode = text('source')
    if (sourceCode !== '') notes.push(`source:${sourceCode}`)
    const outsideUrl = text('outsideUrl')
    if (outsideUrl !== '') notes.push('apply:external-site')
    // `informationSource` 更具体：不只看是否外投，还指名背后是哪套渠道 / ATS
    // （`workday` / `successfactors` / `oraclecloud` / `万豪官网招聘`……）。实测常驻、很有信息量。
    const ats = text('informationSource')
    if (ats !== '') notes.push(`ats:${ats}`)

    const positionType = text('positionType')
    const posType = positionType === '' ? config.defaultPosType : positionType

    // ── 发布时间：平台给的是 `YYYY-MM-DD HH:mm:ss`（本地时、无时区） ──
    // **只取日期段**：`new Date("2026-09-17 11:18:51")` 在不同引擎上按本地时解析，
    // 跨时区会前后漂一天；而我们只需要"哪一天发的"。
    const createTime = text('publishedAt')
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(createTime)

    out.push({
      platformJobId: id,
      title: title !== '' ? title : titleEn,
      salaryRaw,
      company: text('company'),
      sourceUrl: config.detailUrlTemplate
        .split('{jobId}')
        .join(id)
        .split('{posType}')
        .join(posType),
      city: text('city'),
      // 有的岗位 `districtName` 为空，但 `address` 有真实办公地点（如"深圳龙岗区…"）。
      // 用 address 兜底落到 district，让用户至少知道岗位在哪儿。
      district: text('district') === '' ? text('address') : text('district'),
      expReq: text('exp'),
      eduReq: text('edu'),
      tags,
      publishedAt: dateMatch === null ? null : dateMatch[1],
      industry: text('industry') === '' ? null : text('industry'),
      companySize: text('companySize') === '' ? null : text('companySize'),
      companyNature: text('companyNature') === '' ? null : text('companyNature'),
      notes,
    })
  }

  return out
}

/** 接口响应的最小形状（页面上下文里没法 import 类型，只能就地描述）。 */
interface WaiqiResponse {
  code?: unknown
  message?: unknown
  data?: {
    count?: unknown
    totalCount?: unknown
    positionVO?: { records?: unknown }
  }
}

/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 为什么分两步而不是一个 async 函数干完：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果，不必给 jsdom 装 fetch。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export async function fetchListInPage(arg: {
  url: string
  body: Record<string, unknown>
}): Promise<{ ok: boolean; code: number | null; message: string; status: number }> {
  // ⚠️ 不写 `window.fetch`：真浏览器里 `fetch` 挂在 `window`（= globalThis）上，
  // 而离线夹具里 `window` 是 jsdom 的 window、**没有** fetch（见 `test/support/jsdom-page.ts`）。
  // `globalThis` 在两条路径上都拿得到"当前上下文"的东西，是唯一两边都成立的说法。
  const scope = globalThis as unknown as {
    __WAIQI_LIST_PAYLOAD__?: unknown
    __WAIQI_FETCH__?: unknown
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{
      json(): Promise<unknown>
      status?: number
    }>
  }
  // ⚠️ 只认**页面上下文自己的** fetch —— 也就是"上一次 evaluate 时装上的那个"
  // （真浏览器里是 `window.fetch`）。绝不回退到宿主 Node 的 fetch：
  // 那会让一次本该走浏览器登录态的采集，变成宿主直连接口；
  // 在离线测试里更糟 —— 它会**真的打到线上**（这条是被 `test/platform/waiqi.test.ts`
  // 的「页面上下文没有 fetch」用例逼出来的：当时它没抛错，而是把真实接口抓回来了）。
  if (scope.__WAIQI_FETCH__ !== scope.fetch || typeof scope.fetch !== 'function') {
    return { ok: false, code: null, message: 'fetch 不可用（页面上下文异常）', status: 0 }
  }

  let payload: unknown = null
  let status = 0
  try {
    const response = await scope.fetch(arg.url, {
      method: 'POST',
      // 带上同源 Cookie / 登录态 —— 与用户自己在页面上翻列表走同一条链路。
      credentials: 'include',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        accept: 'application/json, text/plain, */*',
        // 前端 axios 拦截器固定带 `source: 24`；缺了它服务端会走另一套分支。
        source: '24',
      },
      body: JSON.stringify(arg.body),
    })
    status = typeof response.status === 'number' ? response.status : 0
    payload = await response.json()
  } catch (error) {
    const name =
      error !== null && typeof error === 'object' && 'name' in error
        ? String((error as { name: unknown }).name)
        : 'Error'
    return { ok: false, code: null, message: `网络请求失败（${name}）`, status }
  }

  // 把响应交给 `extractJobsInPage` —— 它在**同一次 evaluate 的后续调用**里读这个全局。
  scope.__WAIQI_LIST_PAYLOAD__ = payload
  const parsed = payload as WaiqiResponse | null
  const code =
    parsed !== null && parsed !== undefined && typeof parsed.code === 'number' ? parsed.code : null
  const message =
    parsed !== null && parsed !== undefined && typeof parsed.message === 'string' ? parsed.message : ''
  // 实测成功码：1000。0/200 一并容忍（不同网关层的写法）。
  const ok = code === 1000 || code === 0 || code === 200
  return { ok, code, message, status }
}

/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 空白页。
 *
 * 与 51job / 智联不同：这里列表不是 DOM 渲染的，所以
 * "卡片数"只能当佐证，**接口返回**才是主判据。
 *
 * 已知的接口侧信号：
 *   * `code=1022` = 需要登录（收藏/订阅类接口会返回；列表接口匿名可用）；
 *   * `code=429` = 平台的频控墙（`访问行为异常，请稍后再试`）—— 匿名接口高频访问时实测会返回，
 *     判成 `rate-limited`，让主链**停手退避**，不硬重试（C12 / P5）；
 *   * `code=1010` = 参数校验失败（例如 `size>50`）—— 那是我们自己的 bug，不是墙，
 *     所以**不**报成 block，让它以 PARSE_FAILED 暴露出来；
 *   * `code=999` = 服务端数据异常（例如 `type=0`）。
 *
 * 命中即停、交还人工，**不硬重试**（C12 / P5）。
 */
export function detectBlockInPage(arg: {
  cardCount: number
  /** 最近一次列表接口返回的 code；`null` = 还没发过请求。 */
  code: number | null
}): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')

  const captcha = document.querySelector(
    '.geetest_panel, .geetest_holder, iframe[src*="captcha"], #captcha, [class*="verify-wrap"], .waf-nc-title, script[name^="aliyunwaf_"]',
  )
  if (captcha !== null) return 'captcha'
  if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|系统繁忙/.test(compact)) return 'rate-limited'
  // 平台侧"额度用完"≠ 频控：退避重试没用，今天就此打住。
  if (/今日投递太多|休息一下明天再来|达到上限|次数过多/.test(compact)) return 'quota-exhausted'

  if (arg.code === 1022) return 'login-required'

  // 实时探针触发过：匿名接口短时间高频访问 → `code=429 访问行为异常，请稍后再试`。
  // 判成 rate-limited，主链据此**停手退避**，而不是按 PARSE_FAILED 继续撞卷这堵墙。
  if (arg.code === 429) return 'rate-limited'

  // 阈值故意压得很低：真实的"页面没渲染出来"几乎是全空的，
  // 而"搜到 0 条"的结果页本身也有筛选器文案，不该被误判成空白。
  if (arg.cardCount === 0 && compact.length < 80) return 'blank'
  return null
}

/** 在页面上下文里找「下一页」是否可用。**注意**：真正的闸门是 `maxPages=1`。 */
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
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递、收藏、订阅。
 * 所以这里只看一个结构性信号：页面上是否有用户头像（未登录时是"登录"按钮）。
 *
 * ⚠️ **不认"页面上有没有『登录』两个字"**：正常结果页右上角一直有登录入口，
 * 拿它判断会导致"永远判定为未登录"，定时任务就永远不跑了（那是个很隐蔽的死锁）。
 */
export function isLoggedInInPage(): boolean {
  return (
    document.querySelector('.head-avatar') !== null || document.querySelector('[class*="user-icon"]') !== null
  )
}

export interface WaiqiAdapterOptions {
  config?: WaiqiConfig
  /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
  delayRangeMs?: [number, number]
  /** 等页面渲染出来的上限（ms）。 */
  waitForListMs?: number
}

/** 构造神仙外企适配器。 */
export function createWaiqiAdapter(options: WaiqiAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_WAIQI_CONFIG
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
   * 最近一次列表接口返回的 code，按页面记。
   *
   * 为什么需要它：抓取主链的顺序是 `gotoSearch → detectBlock → readListPage`，
   * 而接口请求发生在第三步。所以 `detectBlock` **不能**自己去再发一次请求
   * （那会让每次抓取都翻倍请求，把风控概率也翻倍）。
   * 我们记下上一轮的结果，让判墙用"最近一次真实的接口应答"。
   */
  const lastCode = new WeakMap<object, number | null>()

  /** SR-41/42：声明本适配器支持的筛选维度 —— 界面与校验的唯一来源。 */
  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，对应接口的 name 字段（实测：keyword/positionName 这些键**无效**，只有 name 生效）',
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint:
        '城市走接口的 cityIds（平台自增主键，不能按行政区划码猜）；表里没有的城市无法构造请求。' +
        '支持逗号分隔**多城市**（如 `深圳,广州`），一次请求按多个城市过滤',
    },
    {
      key: 'workExp',
      label: '工作经验',
      values: WAIQI_WORK_EXP_OPTIONS,
      hint: '平台只有 6 档（0~5）；实测 6/7 恒为 0 条，故不列出',
    },
    {
      key: 'education',
      label: '学历',
      values: WAIQI_EDUCATION_OPTIONS,
      hint: '取值域来自平台的 education-enum，**不是从 0 递增**（6/7/8 分别对应初中/高中/中专）',
    },
    {
      key: 'businessCategory',
      label: '行业',
      values: config.businessCategoryList.map((item) => ({ value: String(item.id), label: item.name })),
      hint:
        '对应接口 businessCategoryIdList（前端取值来自 getBusList，已过滤"不限"）。' +
        '内置为实测 seed，可在 DB 覆盖 config.businessCategoryList 补全',
    },
    {
      key: 'posInfo',
      label: '职能',
      values: config.posInfoList.map((item) => ({ value: String(item.id), label: item.name })),
      hint:
        '对应接口 posIds（前端为两级树 businessCategory→posInfos）。' +
        '内置为实测 seed，可在 DB 覆盖 config.posInfoList 补全',
    },
    {
      key: 'type',
      label: '职位范围',
      values: WAIQI_TYPE_OPTIONS,
      hint: '页面顶部的两个 tab；默认只看外企（type=2）',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: WAIQI_MAX_PAGES,
      hint:
        `最多 ${String(WAIQI_MAX_PAGES)} 页 —— 平台的服务端翻页是坏的（page≥2 恒定返回 0 条），` +
        `单页上限 ${String(WAIQI_MAX_PAGE_SIZE)} 条`,
    },
  ]

  return {
    id: 'waiqi',
    displayName: '神仙外企',
    capabilities: {
      // 实测：列表接口匿名可读（第一页 20 条），但页面上有「登录账号，查看更多好职位」遮罩。
      searchWithoutLogin: true,
      // 平台的投递要登录，且未登录 DOM 里没有可靠的投递入口 —— 与打招呼一起留空（fail-closed）。
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: true,
      supportsGreeting: false,
      // 结构化接口：字段齐、几乎不用猜；但薪资大量缺失（实测约 1/5 才有明文），所以不是 high。
      fieldCompleteness: 'medium',
      // 匿名可读、未观察到验证码；但页面确实有登录遮罩与订阅拦截，保守按 medium。
      antiBot: 'medium',
    },
    // §4.2.4：适配器自己声明必需字段（协议里的四个核心字段）。
    requiredFields: CORE_FIELDS as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: WAIQI_MAX_PAGES,

    auth: {
      loginUrl: `${config.webBase}/login`,
      /**
       * 搜索不需要登录，所以这里**只看用户头像**这一个正向信号；
       * 「没登录」不该让采集停摆（`runtime` 那侧也只在"确实被登录墙挡过"时才拦）。
       */
      async isLoggedIn(page): Promise<boolean> {
        return await page.evaluate(isLoggedInInPage, undefined as never)
      },
    },

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildWaiqiSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildWaiqiSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(
            `神仙外企：无法为城市「${criteria.city ?? ''}」构造搜索地址（城市 id 未配置，` +
              '城市 id 不能按行政区划码猜）',
          )
        }
        // 筛选条件记在页面对象上：主链每页会重新调 gotoSearch，而 readListPage 只拿得到 page。
        // **先记再跳**：navigation 失败时条件也已经在，判墙仍能拿到正确的 page。
        pending.set(page as object, criteria)
        await page.goto(url)

        // 站点是 SPA：`load` 时列表还没渲染。等卡片只是为了"别在页面还没活过来时发请求"，
        // **解析不依赖它**（数据来自接口），所以超时也不当错误。
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
          url: `${config.apiBase}${config.listPath}`,
          body: buildWaiqiRequestBody(criteria, config.cityCodes, pageNo),
        })
        lastCode.set(page as object, request.code)

        if (!request.ok) {
          // 抛错 → 主链记 `PARSE_FAILED`、按阈值把适配器置为 degraded。
          // **绝不能静默返回空数组**：那会被当成"今天没有新岗位"（§4.2.4）。
          throw new Error(
            `神仙外企：列表接口未返回可用数据（code=${request.code === null ? '?' : String(request.code)}，` +
              `status=${String(request.status)}，message=${request.message === '' ? '（空）' : request.message}）`,
          )
        }

        const jobs = await page.evaluate(extractJobsInPage, config)
        if (jobs.length === 0) {
          // 接口成功但零记录有两种可能：真的没结果，或响应形状变了（字段/层级改名）。
          // 两种都让主链按 `NO_RECORDS` 记成 partial，**不在这里猜**。
          return []
        }
        return jobs
      },

      async hasNextPage(page): Promise<boolean> {
        // 平台的翻页参数在服务端是坏的（page≥2 恒返回空），所以这一层只回答
        // "页面上还有没有下一页按钮"。**真正的闸门是 `maxPages = 1`**（见 WAIQI_MAX_PAGES）。
        return await page.evaluate(hasNextPageInPage, { selector: config.selectors.nextPage })
      },
    },

    guard: {
      /**
       * 判墙**不发请求**（见 `lastCode` 的注释）：它读的是
       * 「最近一次列表接口的应答 + 当前页面的结构性信号」。
       *
       * ⚠️ 主链的顺序是 `gotoSearch → detectBlock → readListPage`，
       * 所以**首次**判墙时还没有接口应答（`code = null`），此时只能靠页面信号
       * （验证码 / 限流文案 / 空白页）。这不是缺陷：真正的登录墙
       * 会在 `readListPage` 处以 `code=1022` 暴露出来，并在下一次判墙时被识别。
       */
      async detectBlock(page): Promise<BlockKind | null> {
        const cardCount = await page.evaluate(countCardsInPage, { selector: config.selectors.card })
        return await page.evaluate(detectBlockInPage, {
          cardCount,
          code: lastCode.get(page as object) ?? null,
        })
      },
    },

    // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
    // 神仙外企的投递要登录态，且未登录 DOM 里没有可靠的投递按钮契约；
    // 大量岗位的投递其实是**跳转到企业官网 ATS**（记录里的 `outsideUrl`）。
    // 按「不编选择器」的原则，宁可让 guard 以 ADAPTER_BROKEN 明确拒绝（fail-closed），
    // 也不上线一个会乱点的实现。
  }
}

/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export function countCardsInPage(arg: { selector: string }): number {
  try {
    return document.querySelectorAll(arg.selector).length
  } catch {
    return 0
  }
}
