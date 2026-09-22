/**
 * SinoJobs 的配置面：字段名 / 选择器接口 / 值域 / 地点码表 / 种子表 / 判墙信号常量 + `merge*`。
 *
 * 纯数据 + 纯函数，**不含**任何 `document` / 页面上下文逻辑（那些在 `./page.ts`）。
 * 完整实测记录（接口契约、robots 取舍、逐项实测证据）见 `./index.ts` 文件头。
 */

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
  /** 只用于"等页面渲染"，**不用于解析**（解析走接口 / 详情页 DOM；翻页判据是接口 total）。 */
  selectors: {
    card: string
  }
  /**
   * 详情页解析用的选择器（详情页是服务端渲染的静态 HTML，结构来自真实镜像夹具
   * `test/fixtures/sinojobs-detail.html`：概要与正文分居 `.Resume-info1` / `.Resume-info2`）。
   */
  detail: {
    /**
     * 概要区容器（标题 `h5` / 公司 `h6` / 信息列表 `ul` 都在这里面）。
     *
     * 为什么要限定作用域：正文区的小节标题（「职位描述」/「任职要求」…）也是 `h6`
     * —— 概要区一旦缺位，"全局取第一个 h6"就会把**小节标题当公司名**写进结果。
     * 容器未命中时相关字段按未锚定处理（留空 + note），**不回退整页**（fail-closed）。
     */
    headBox: string
    /** 职位名（概要区里的 `h5`；缺位时由 `document.title` 去站名后缀兜底）。 */
    title: string
    /** 公司名（概要区第一个 `h6`）。 */
    company: string
    /** 信息列表（薪资 / 城市 / 经验 / 工作性质 / 发布时间 五项）。 */
    infoList: string
    /** 正文区容器（职位描述 / 任职要求 / 联系方式 / 公司信息的 `h6` + `p`）。 */
    bodyBox: string
    /** JD 段落（正文区里的 `p`）。 */
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
  },
  detail: {
    // 实测（真实镜像夹具）：概要与正文分居 .Resume-info1 / .Resume-info2。
    // 限定作用域的理由见上面 `detail.headBox` 的注释（h6 有小节标题的撞名风险）。
    headBox: '.Resume-info1',
    title: 'h5',
    company: 'h6',
    infoList: 'ul li',
    bodyBox: '.Resume-info2',
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
 * SinoJobs 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 走"**共享词表、自有结构**"（同 zhaopin）：列表不是 DOM 渲染的，"卡片数"由上层算好后传进来，
 * 而且它有一个独有的**弹窗判据**（`.xcConfirm` 里带登录字样）——
 * 这既是结构差异，也不适合塞进共享函数。
 */
export const SINOJOBS_BLOCK_SIGNALS = {
  captchaSelectors: ['.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  // 阈值 80 比通用的 120 更严：它的"搜到 0 条"结果页也有筛选器文案
  blankTextLength: 80,
} as const
