import type { RawJob, SearchCriteria, SiteAdapter } from '../types.js';
/** 结构锚点集（按照 Indeed JCS 稳定语义锚点，2026-09-18；待域校准后写 DB 覆盖）。 */
export interface IndeedSelectors {
    /** 职位标题链接：`a.jcs-JobTitle`（就业界稳定；href 内嵌 `jk=` 平台 id）。 */
    titleLink: string;
    /** 公司名（教程/site:indeed 文档形态）。 */
    company: string;
    /** 地点。 */
    location: string;
    /** 薪资。 */
    salary: string;
    /** 发布日期。 */
    date: string;
    /** 分页容器（通常就是 `nav[aria-label*="分页"]` / `.pagination`）。 */
    pagination: string;
    /** 「下一页」锚点。 */
    nextPage: string;
    /** 「下一页」被禁用时打在这个属性上（如 `aria-disabled="true"`）。 */
    nextPageDisabledAttr: string;
}
/** 字段 → URL 参数映射（get_jobs / Indeed 公开约定同款：`q` / `l` / `start`）。 */
export interface IndeedUrlParams {
    keywordParam: string;
    locationParam: string;
    /** 分页偏移参数（按 `pageSize` 递增）。 */
    startParam: string;
}
export interface IndeedConfig {
    /** 站点域；默认 cn.indeed.com（已停运，见文件头）—— 换仍运营域见文件头说明。 */
    host: string;
    selectors: IndeedSelectors;
    urlParams: IndeedUrlParams;
    /** 每页条数（免费版固定每页一个定长，`start` 步进默认 15；可按域实测调整）。 */
    pageSize: number;
    /** 从职位链接 href 里抠 `jk=<jobkey>` 的模式。 */
    jobKeyPattern: string;
    /** 薪资文本模式（字符串形态，序列化进页面）。 */
    salaryPattern: string;
}
export declare const INDEED_JOB_KEY_PATTERN = "[?&]jk=([A-Za-z0-9]+)";
export declare const INDEED_SALARY_PATTERN = "\\d+(?:[,\\.]?\\d+)?\\s*[kK\u4E07]?\\s*[-~\u81F3]\\s*\\d+(?:[,\\.]?\\d+)?\\s*[kK\u4E07]?(?:\\s*\u5143?(?:/\u6708|/\u5E74|\u6708\u85AA|\u5E74\u85AA))?\\b|\\d+(?:[,\\.]?\\d+)?\\s*[kK\u4E07](?:\\s*\u5143?(?:/\u6708|/\u5E74|\u6708\u85AA|\u5E74\u85AA))?\\s*\u4EE5\u4E0A|\u9762\u8BAE";
/** 单次抓取页数上限。Indeed 免费版无页码按钮、Cloudflare 风控，默认 3 页、上限 5 页。 */
export declare const INDEED_DEFAULT_MAX_PAGES = 3;
export declare const INDEED_MAX_PAGES = 5;
export declare const DEFAULT_INDEED_CONFIG: IndeedConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeIndeedConfig(override: unknown): IndeedConfig;
/**
 * 构造搜索 URL：`https://{host}/jobs?q=Java&l=北京&start=0`。
 * 关键词 / 地点都是**自由文本**，没有城市码映射 —— 地点为空就不带 `l=`。
 * `criteria.page` 是 1 起（项目约定）；`start` = (page-1) * pageSize（0 起）。
 */
export declare function buildIndeedSearchUrl(config: IndeedConfig, criteria: SearchCriteria): string;
/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export declare function extractJobsInPage(arg: {
    selectors: IndeedSelectors;
    host: string;
    jobKeyPattern: string;
    salaryPattern: string;
}): RawJob[];
/** **在页面上下文里**看「下一页」是否可用（被禁用时打 `aria-disabled`）。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    nextPage: string;
    disabledAttr: string;
}): boolean;
export interface IndeedAdapterOptions {
    config?: IndeedConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 Indeed 适配器。 */
export declare function createIndeedAdapter(options?: IndeedAdapterOptions): SiteAdapter;
//# sourceMappingURL=indeed.d.ts.map