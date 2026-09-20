/**
 * 国聘网的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、城市码表、
 * 各字段的正则常量、页数上限、登录锚点、平台判墙信号 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `GUOPIN_CARD` / `GUOPIN_COMPANY_LINK` / `GUOPIN_SALARY` / `GUOPIN_DETAIL_COMPANY` 只被本文件的
 * `DEFAULT_GUOPIN_CONFIG` 用到，所以保持模块私有（不导出）。
 *
 * 完整实测记录（列表卡片真实 DOM、薪资 18/20、无平台 id 的后果、翻页点击契约、
 * 登录锚点、详情页真实结构）见 `./index.ts` 文件头 —— 2026-09-20 登录态探针全面校准过一轮。
 */

/**
 * 列表卡片容器（probe 实证 `div.job-card` 命中 20）。以卡片为锚遍历，不再依赖详情链接。
 */
const GUOPIN_CARD = '.job-card'
/** 列表卡片公司链接锚点（`.company-name`，probe 实证；文本可能被截断，用 title 属性补全）。 */
const GUOPIN_COMPANY_LINK = '.company-name'
/**
 * 列表卡片薪资锚点（`.job-info .job-salary`）。
 * ⚠️ 推翻 2026-09-18 的旧结论"列表卡片无薪资"：那是对首卡（恰好无薪资）的过采样 ——
 * 夹具全量 20 张卡片里 **18 张带 `.job-salary`**（面议 / 10~13K / 8~9K·16薪 / 1.5K…），
 * 只有 2 张（同公司的引才计划卡）没有。读不到就留空，由详情页兜底。
 */
const GUOPIN_SALARY = '.job-info .job-salary'
/** 详情页公司名锚点（`.job-company-desc .company-title`，2026-09-20 登录态快照实证）。 */
const GUOPIN_DETAIL_COMPANY = '.job-company-desc .company-title'

/** 详情 URL 里抠出岗位 id：`/job/detail?id=<数字>`。 */
export const GUOPIN_JOB_ID_PATTERN = '/job/detail\\?id=(\\d+)'

/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id。 */
export const GUOPIN_DETAIL_URL_TEMPLATE = 'https://www.iguopin.com/job/detail?id={jobId}'

/** 登录页（未登录列表页头 `a.login` 的 href 实测为 `/login?redirect=…`）。 */
export const GUOPIN_LOGIN_URL = 'https://www.iguopin.com/login'

/** 薪资文本模式：列表 `.job-salary` / 详情薪资的合法性校验（面议、`10~13K`、`8~9K·16薪`、`1.5K`…实测形态）。 */
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
 * 单次抓取的页数上限。**20 来自 ant 分页自报**（2026-09-20 登录态实测：
 * `ul.ant-pagination` 文本「12345•••20跳至页」），不是拍的保守值。
 *
 * ⚠️ 翻页方式（同日 `npm run probe:guopin-pagination` 实测定案）：
 *   * URL `?page=2` **无效**（SPA 忽略，active 仍为 1）—— 不能像智联那样靠 URL 寻址；
 *   * 真鼠标点 `.ant-pagination-item-2` **有效**（active=2、数据换 9/20）——
 *     但翻页在页面内完成，URL 不变。⇒ `gotoSearch` 收到 `page>1` 时靠**连点 next** 到位
 *     （见 `page/list.ts` 的 `turnToPageInPage`），`hasNextPage` 读 next 的 disabled 状态。
 */
export const GUOPIN_MAX_PAGES = 20

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
  /** 列表薪资（`.job-info .job-salary`；实测 18/20 卡片有，读不到留空）。 */
  salary: string
  /** 公司「性质/规模/行业」三项（`.company-info .company-info-item`，顺序固定）。 */
  companyInfoItems: string
  /** 职能标签（`.job-tag .ant-tag`，进 tags）。 */
  jobTags: string
  // ── 详情页（2026-09-20 登录态快照 `.probe-guopin-capture/guopin-detail-2026-09-20.html` 实证）──
  /** 标题（`.title-box .title-section .title`；页面无 h1）。 */
  detailTitle: string
  /**
   * 薪资。⚠️ 快照样本（引才计划岗）**没有**薪资节点 —— 薪资不是每个详情页都有，
   * 保留语义候选兜底，读到就过 `salaryPattern` 校验。
   */
  detailSalary: string
  /** 公司名（`.job-company-desc .company-title`；logo 链接里没有文本，别用 `a[href*="/company"]`）。 */
  detailCompany: string
  /** JD 全文（`.job-intro-section .job-duty`）。 */
  detailJdText: string
  /** 「职位性质/最低学历/报名截止/工作经验…」键值对（`.overview-item`：overview-title + overview-desc，按 title 文本归类）。 */
  detailOverviewItems: string
  /** 详情页职能标签（`.intro-tag-wrap .intro-tag`，进 tags）。 */
  detailIntroTags: string
  /** 公司标签（`.job-company-tag .company-tag` ×4：服务类型/性质/行业/规模，**顺序不固定**，按词表归类性质与规模）。 */
  detailCompanyTags: string
  /** 更新时间（`.update-time`「更新于 2026-09-12」→ publishedAt）。 */
  detailUpdateTime: string
  // ── 分页（2026-09-20 登录态实测：ant-design 分页，共 20 页，纯 JS 点击无 href）──
  /** 分页容器（`ul.ant-pagination`）。 */
  pagination: string
  /** 「下一页」按钮（`li.ant-pagination-next`）。 */
  paginationNext: string
  /** 「下一页」不可用的标记（`li.ant-pagination-next.ant-pagination-disabled` —— ant 库级稳定类名）。 */
  paginationNextDisabled: string
  /** 当前页（`.ant-pagination-item-active`，`title` 属性是页码）。 */
  paginationActive: string
}

/** 登录态锚点（两端实测：未登录夹具 vs 2026-09-20 登录态快照，命中数 1/0 与 0/1）。 */
export interface GuopinLoginSelectors {
  /** 已登录：页头用户区（`.avatar-box .user-name`，文本是脱敏手机号；未登录 0）。 */
  loggedIn: string
  /** 未登录：页头「登录/注册」（`a.login`，href 是 `/login?redirect=…`；登录态 0）。 */
  notLoggedIn: string
}

export interface GuopinUrlParams {
  base: string
  keywordParam: string
}

export interface GuopinConfig {
  selectors: GuopinSelectors
  /** 登录态锚点（`auth.isLoggedIn` 用）。 */
  loginSelectors: GuopinLoginSelectors
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
  /**
   * 点击翻页后，**每一步**等「当前页码变化」的上限（ms）。
   *
   * 为什么进配置：离线夹具是静态 DOM，点了 next 页码不会变（没有 React），
   * 只能靠超时收手 —— 测试要把它调到几十毫秒，否则每个用例白等十几秒
   * （与 zhipin 的 `scrollStepTimeoutMs` 同一个理由）。
   */
  pageTurnTimeoutMs: number
}

export const DEFAULT_GUOPIN_CONFIG: GuopinConfig = {
  selectors: {
    card: GUOPIN_CARD,
    jobName: '.job-name',
    jobTitleAttr: 'title',
    jobInfoItems: '.job-info .tag-item',
    companyLink: GUOPIN_COMPANY_LINK,
    salary: GUOPIN_SALARY,
    companyInfoItems: '.company-info .company-info-item',
    jobTags: '.job-tag .ant-tag',
    // 详情页（2026-09-20 登录态快照实证；快照样本无薪资节点 → detailSalary 留语义候选）
    detailTitle: '.title-section .title',
    detailSalary: '[class*="salary"], [class*="amount"]',
    detailCompany: GUOPIN_DETAIL_COMPANY,
    detailJdText: '.job-intro-section .job-duty',
    detailOverviewItems: '.job-overview-section .overview-item',
    detailIntroTags: '.intro-tag-wrap .intro-tag',
    detailCompanyTags: '.job-company-tag .company-tag',
    detailUpdateTime: '.update-time',
    // 分页（ant-design，共 20 页；URL page 参数无效，翻页靠点击 next）
    pagination: 'ul.ant-pagination',
    paginationNext: 'li.ant-pagination-next',
    paginationNextDisabled: 'li.ant-pagination-next.ant-pagination-disabled',
    paginationActive: '.ant-pagination-item-active',
  },
  loginSelectors: {
    loggedIn: '.avatar-box .user-name',
    notLoggedIn: 'a.login',
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
  // 一步翻页给站点留 12 秒（实测点击后 1–3 秒出新数据；离线测试要调小，否则白等）
  pageTurnTimeoutMs: 12_000,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeGuopinConfig(override: unknown): GuopinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_GUOPIN_CONFIG
  const patch = override as Partial<GuopinConfig>
  const pattern = (key: keyof GuopinConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  const positive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  return {
    selectors: { ...DEFAULT_GUOPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    loginSelectors: { ...DEFAULT_GUOPIN_CONFIG.loginSelectors, ...(patch.loginSelectors ?? {}) },
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
    pageTurnTimeoutMs: positive(patch.pageTurnTimeoutMs, DEFAULT_GUOPIN_CONFIG.pageTurnTimeoutMs),
  }
}

/**
 * 国聘特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 国聘是政府平台、antiBot 低档，原实现就写着"**走通用文案判定，不编平台特有墙信号**" ——
 * 所以这里是最轻的一档：只多几条验证码选择器与文案。
 *
 * 两处必须显式带上（否则会悄悄改行为）：
 *   * `人机验证` 留在 **`rateText`** 而不是搬去 `captchaText`：搬过去会把返回值从
 *     `rate-limited` 变成 `captcha`，界面给的下一步动作就跟着变了；
 *   * `loginTextLength` 放到极大 = **保留**它原本"登录墙不看页面长度"的语义。
 */
export const GUOPIN_BLOCK_SIGNALS = {
  captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
  rateText: ['人机验证'],
  loginText: ['请登录', '登录后才能'],
  loginTextLength: 1_000_000,
} as const
