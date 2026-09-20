/**
 * Indeed 的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、jobkey / 薪资正则、
 * 页数上下限、平台判墙信号与开关 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `indeedBlockFlags` 由 `./index.ts` 在判墙时按 `config.host` 调用，故导出。
 *
 * 完整实测记录（中国大陆站已停运、Cloudflare 墙、换域启用的办法）见 `./index.ts` 文件头。
 */

/** 结构锚点集（按照 Indeed JCS 稳定语义锚点，2026-09-18；待域校准后写 DB 覆盖）。 */
export interface IndeedSelectors {
  /** 职位标题链接：`a.jcs-JobTitle`（就业界稳定；href 内嵌 `jk=` 平台 id）。 */
  titleLink: string
  /** 公司名（教程/site:indeed 文档形态）。 */
  company: string
  /** 地点。 */
  location: string
  /** 薪资。 */
  salary: string
  /** 发布日期。 */
  date: string
  /** 分页容器（通常就是 `nav[aria-label*="分页"]` / `.pagination`）。 */
  pagination: string
  /** 「下一页」锚点。 */
  nextPage: string
  /** 「下一页」被禁用时打在这个属性上（如 `aria-disabled="true"`）。 */
  nextPageDisabledAttr: string
}

/** 字段 → URL 参数映射（get_jobs / Indeed 公开约定同款：`q` / `l` / `start`）。 */
export interface IndeedUrlParams {
  keywordParam: string
  locationParam: string
  /** 分页偏移参数（按 `pageSize` 递增）。 */
  startParam: string
}

export interface IndeedConfig {
  /** 站点域；默认 cn.indeed.com（已停运，见文件头）—— 换仍运营域见文件头说明。 */
  host: string
  selectors: IndeedSelectors
  urlParams: IndeedUrlParams
  /** 每页条数（免费版固定每页一个定长，`start` 步进默认 15；可按域实测调整）。 */
  pageSize: number
  /** 从职位链接 href 里抠 `jk=<jobkey>` 的模式。 */
  jobKeyPattern: string
  /** 薪资文本模式（字符串形态，序列化进页面）。 */
  salaryPattern: string
}

export const INDEED_JOB_KEY_PATTERN = '[?&]jk=([A-Za-z0-9]+)'
export const INDEED_SALARY_PATTERN =
  '\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?\\s*[-~至]\\s*\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?(?:\\s*元?(?:/月|/年|月薪|年薪))?\\b|\\d+(?:[,\\.]?\\d+)?\\s*[kK万](?:\\s*元?(?:/月|/年|月薪|年薪))?\\s*以上|面议'

/** 单次抓取页数上限。Indeed 免费版无页码按钮、Cloudflare 风控，默认 3 页、上限 5 页。 */
export const INDEED_DEFAULT_MAX_PAGES = 3
export const INDEED_MAX_PAGES = 5

export const DEFAULT_INDEED_CONFIG: IndeedConfig = {
  // ⚠️ 中国大陆站已停运。保留为默认值仅尊重原意；真正启用请换仍运营的域（见文件头）。
  host: 'cn.indeed.com',
  selectors: {
    titleLink: 'a.jcs-JobTitle',
    company: "[data-testid='company-name']",
    location: "[data-testid='text-location']",
    salary: "[data-testid='attribute_snippet_testid']",
    date: "[data-testid='jobListingDate']",
    pagination: 'nav[aria-label]',
    nextPage: "[data-testid='pagination-page-next']",
    nextPageDisabledAttr: 'aria-disabled',
  },
  urlParams: {
    keywordParam: 'q',
    locationParam: 'l',
    startParam: 'start',
  },
  pageSize: 15,
  jobKeyPattern: INDEED_JOB_KEY_PATTERN,
  salaryPattern: INDEED_SALARY_PATTERN,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeIndeedConfig(override: unknown): IndeedConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_INDEED_CONFIG
  const patch = override as Partial<IndeedConfig>
  const str = (key: keyof IndeedConfig, fallback: string): string =>
    typeof patch[key] === 'string' && patch[key] !== '' ? (patch[key] as string) : fallback
  const num = (key: keyof IndeedConfig, fallback: number): number =>
    typeof patch[key] === 'number' && patch[key] > 0 ? (patch[key] as number) : fallback
  return {
    host: str('host', DEFAULT_INDEED_CONFIG.host),
    selectors: { ...DEFAULT_INDEED_CONFIG.selectors, ...(patch.selectors ?? {}) },
    urlParams: { ...DEFAULT_INDEED_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    pageSize: num('pageSize', DEFAULT_INDEED_CONFIG.pageSize),
    jobKeyPattern: str('jobKeyPattern', DEFAULT_INDEED_CONFIG.jobKeyPattern),
    salaryPattern: str('salaryPattern', DEFAULT_INDEED_CONFIG.salaryPattern),
  }
}

/**
 * Indeed 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare 挑战的 DOM 特征**（`#challenge-error-title` / `.cf-error-*` /
 *     `challenges.cloudflare.com` 的 iframe）—— 通用词表里没有 Cloudflare；
 *   * **验证码文案**：Indeed 是「需要进行其他验证」+ 英文 `Ray ID` / `captcha` / `robot`。
 *     它们必须进 `captchaText` 而**不是** `rateText` —— 判定顺序上验证码在前，
 *     但语义错了会让界面把"人机验证"说成"限流"，给用户的下一步动作完全不同；
 *   * `expectedHost`：中国站停运的实际表现是被 302 送到别的域（`cn.indeed.com` →
 *     `www.indeed.com`）→ 判 `blank`。这是**地址级**事实；
 *   * `skipLoginWall`：原实现**没有**登录墙判据（Indeed 用 Cloudflare 而非登录墙），
 *     让通用词表替它猜会把"0 条"误报成"需要登录"。
 */
export const INDEED_BLOCK_SIGNALS = {
  captchaSelectors: [
    '#challenge-error-title',
    '.cf-error-details',
    '.cf-error-h1',
    '[id^="challenge-running"]',
    'iframe[src*="challenges.cloudflare.com"]',
  ],
  captchaText: ['需要进行其他验证', '请稍候', 'Ray ID', 'cloudflare', 'cf-error', '验证码', 'captcha', '安全验证', 'robot'],
  // 通用词表里没有「请求过于频繁」，Indeed 的文案是这一条
  rateText: ['请求过于频繁'],
} as const

/** 见 `INDEED_BLOCK_SIGNALS` 的说明；`expectedHost` 由配置传入。 */
export function indeedBlockFlags(host: string): { expectedHost: string; skipLoginWall: boolean } {
  return { expectedHost: host, skipLoginWall: true }
}
