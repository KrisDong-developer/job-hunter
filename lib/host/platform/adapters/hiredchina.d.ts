import type { RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** 用户面向的默认域名（对外入口）。raw HTTP 会吃 Cloudflare 挑战；真浏览器 + 登录态可过。 */
export declare const HIREDCHINA_WEB_BASE = "https://www.hiredchina.com";
/** 页面语言路径段（决定卡片里文案是英文还是中文）。 */
export declare const HIREDCHINA_LANG = "en";
/** 每张卡片是一个详情链接 `<a>`，href 形如 `/<lang>/job/<uuid>?returnTo=...`。 */
export declare const HIREDCHINA_CARD_SELECTOR: string;
/** 卡片本体容器（`div[data-slot="card"]`，shadcn/ui 的语义锚点）。 */
export declare const HIREDCHINA_CARD_BOX_SELECTOR = "div[data-slot=\"card\"]";
/** jobId 是 UUID：`8-4-4-4-12` 十六进制。 */
export declare const HIREDCHINA_JOB_ID_PATTERN = "/(?:en|zh)/job/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
/** Job Type（类别筛选 `?type=`）取值 —— 键来自页面内嵌 i18n 字典；`marketing` 已实测。 */
export declare const HIREDCHINA_TYPE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 雇佣类型筛选 `?employmentId=`（已实测：1=Full-time/全职，2=Part-time/兼职）。 */
export declare const HIREDCHINA_EMPLOYMENT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 工作模式筛选 `?isOnline=`（已实测：1=Remote/远程，0=On-site/现场）。 */
export declare const HIREDCHINA_WORK_MODE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 单次抓取的页数上限。
 *
 * 翻页契约**已实测有效**（`?page=N`、每页 10 条、749 页），本可抓几十页；但主站带
 * Cloudflare 挑战层，且我们是保守优先（§P5），先按 `maxPages = 5` 封顶，跑稳了再放开。
 * 这不是平台限制，是我们对风控的取舍 —— 写清楚，避免后人误以为「上限 5 是平台事实」。
 */
export declare const HIREDCHINA_MAX_PAGES = 5;
/** 结构锚点集。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface HiredChinaSelectors {
    /** 卡片身份锚（详情链接）。 */
    card: string;
    /** 卡片本体容器。 */
    cardBox: string;
    /** 标题。 */
    title: string;
    /** 公司图标的行（`lucide-building-2`），取它所在行文本为公司名。 */
    companyRow: string;
    /** 各字段徽章的底色判别（平台自己的色板约定）。 */
    salaryBadge: string;
    locationBadge: string;
    employmentBadge: string;
    workModeBadge: string;
    experienceBadge: string;
    /** 分页容器（判 `hasNextPage`）。 */
    pagination: string;
}
/** 详情页选择器（2026-09-18 探针注明，待 explore 详情夹具校准。每项可 DB 覆盖）。 */
export interface HiredChinaDetailSelectors {
    title: string;
    /** 薪资：渐变卡片内的金额元素。探针给出卡片容器，具体金额元素是 best-effort。 */
    salary: string;
    /** JD 全文。 */
    jdText: string;
    /** 徽章行容器（地点 → 行业 → 雇佣 → 工作模式 → 语言）。 */
    badgeRow: string;
}
export interface HiredChinaUrlParams {
    jobsPath: string;
    keywordParam: string;
    typeParam: string;
    employmentParam: string;
    workModeParam: string;
    pageParam: string;
}
export interface HiredChinaConfig {
    webBase: string;
    lang: string;
    selectors: HiredChinaSelectors;
    detailSelectors: HiredChinaDetailSelectors;
    urlParams: HiredChinaUrlParams;
    /** 城市码。⚠️ 本平台**没有城市 URL 筛选**（见文件头）→ 恒空，带城市即拒绝。 */
    cityCodes: Record<string, string>;
    jobIdPattern: string;
    /** 抓取深度上限（页数）。 */
    maxPages: number;
}
export declare const DEFAULT_HIREDCHINA_CONFIG: HiredChinaConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeHiredChinaConfig(override: unknown): HiredChinaConfig;
/** 构造列表页 URL：`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`。 */
export declare function buildHiredChinaSearchUrl(config: HiredChinaConfig, criteria: SearchCriteria): string | null;
/**
 * **在页面上下文里**解析列表页 —— 按「卡片身份锚 + 字段底色」策略（见文件头）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param config 由宿主序列化传入
 */
export declare function extractJobsInPage(arg: HiredChinaConfig): RawJob[];
/**
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器（`h1` / 渐变卡片薪资 / `div.prose.prose-sm` JD）探针注明，待详情夹具校准。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。company 也仅从徽章行外的
 * 常用锚点 best-effort，捞不到就留空（调用方用列表的公司兜底）。
 */
export declare function extractDetailInPage(arg: {
    selectors: HiredChinaDetailSelectors;
}): RawJobDetail;
/**
 * **在页面上下文里**判断是否还有下一页：分页容器里是否存在「页码 > 当前页」的链接。
 * ⚠️ 自包含。`currentPage` 由宿主传入（真实路径上记录在 pending WeakMap 里）。
 */
export declare function hasNextPageInPage(arg: {
    selector: string;
    currentPage: number;
}): boolean;
export interface HiredChinaAdapterOptions {
    config?: HiredChinaConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 HiredChina 适配器。 */
export declare function createHiredChinaAdapter(options?: HiredChinaAdapterOptions): SiteAdapter;
//# sourceMappingURL=hiredchina.d.ts.map