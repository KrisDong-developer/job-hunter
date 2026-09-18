/**
 * Indeed（cn.indeed.com）适配器。
 *
 * ## ⚠️ 2026-09-18 真实调研结论：中国大陆站已停运（必须先读，再决定怎么用）
 *
 * * 直接请求 `cn.indeed.com/jobs?q=…&l=…`：被 **302 重定向到全球站 `www.indeed.com`**，
 *   随后被 **Cloudflare 验证墙拦截**（页面文案「需要进行其他验证」，响应带 `Ray ID`）。
 * * 站点自身也印证停运：全球站首页直接引导「For jobs in China, visit cn.indeed.com」，
 *   但 cn 站首页已变成通用跳转页，职位搜索入口不再返回岗位数据 —— 与 Indeed
 *   2022 年起退出中国大陆市场的事实一致。
 * * 因此**本适配器没有一个可信的「中国大陆岗位列表」真实夹具可校准**。
 *   ADAPTERS.md §6 铁律（不编选择器、未验证不猜）在这里直接适用。
 *
 * ## 那么这份适配器是什么 / 不是什么
 *
 * * **是**：对 Indeed 全球通行的职位搜索页（JCS，job search）真实结构的适配器。
 *   该结构的核心语义锚点（`data-testid` / 类名）在所有 Indeed 国家域上**多年稳定**，
 *   是社区公开文档描述的形态。选择器与 URL 约定全部进配置（DB 可覆盖，ADR-19），
 *   留了后续换域（`host` 可配）即可在仍运营的 Indeed 国家站上校准的余地。
 * * **不是**：对「中国大陆 Indeed 在营数据源」的承诺。默认 `host=cn.indeed.com` 只是
 *   尊重用户原意的默认值 —— 它当前会命中 Cloudflare 墙或重定向，判墙即停（C12）。
 *
 * 诚实边界：因为拿不到可信的中国大陆夹具，`capabilities.fieldCompleteness='low'`、
 * `antiBot='high'`，未锚定字段**留空 + notes**，由字段级断言隔离进 pending_repair，不编。
 *
 * ✍️ 换一个仍运营的域来启用真实采集（示例）：
 *   在 `setting` 表写一条
 *   `scope='platform', scope_ref='indeed', key='adapter-config'` 的 JSON：
 *   `{"host":"de.indeed.com"}`（德国）或 `{"host":"sg.indeed.com"}`（新加坡）等，
 *   再把 `test/fixtures/indeed-search.html` 换成对应域用手动浏览器保存的搜索结果页，
 *   跑 `npm run probe:*` 校准锚点后，本适配器即可变成真实在用的适配器。
 *
 * ## Indeed JCS 结构（社区文档描述的稳定形态，2026-09-18 据此实现，待校准）
 *
 * * 搜索 URL：`https://{host}/jobs?q={关键词}&l={地点}&start={第几批}`；
 *   `start` 每页偏移一个定长（`pageSize`，默认 15）—— Indeed 免费版没有页码按钮，
 *   只有「下一页」，`start=0,15,30…`；
 * * 地点是**自由文本**（`l=` 直接吃中文/英文地名），不依赖城市码映射；
 * * 卡片：职位标题锚 `a.jcs-JobTitle`（就业界稳定类名），href 内带 `jk=<jobkey>`，
 *   `jobkey` 就是平台 id（幂等 upsert 键）；公司 `[data-testid="company-name"]`、
 *   地点 `[data-testid="text-location"]`、薪资 `[data-testid="attribute_snippet_testid"]`、
 *   发布日期 `[data-testid="jobListingDate"]`；
 * * 翻页：分页区 `a[data-testid="pagination-page-next"]`，被禁用时打 `aria-disabled`。
 *
 * 以上锚点**只是实现依据，不是验证证据**（拿不到中国大陆夹具）。锚不中就留空，
 * 靠 `pp()` 架构里已有的字段级断言隔离，绝不假装抓到。
 */
import type { BlockKind } from '../../../shared/enums.js';
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
/**
 * **在页面上下文里**判断是否撞上风控 / 重定向 / 登录墙。
 *
 * Indeed 中国站停运的两个可观测信号都在这里判：
 *   1. **被 302 重定向出走**（如 cn → www.indeed.com）：`location.hostname` 与配置 host
 *      不一致 → 判 `blank`（站点把我们挪走了，不是我们要的结果页）；
 *   2. **Cloudflare 验证墙**（实测文案「需要进行其他验证」+ Ray ID）→ 判 `captcha`。
 * 命中即停（C12），**不重试**。
 */
export declare function detectBlockInPage(arg: {
    host: string;
    card: string;
}): BlockKind | null;
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