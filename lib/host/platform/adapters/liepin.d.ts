/**
 * 猎聘（liepin.com）适配器 —— 风控强度最高的平台（R4 / `docs/ADAPTERS.md` §7.1）。
 *
 * ## 路线（D-17a 环境一致性）
 *
 * 平台层已就位的三件套是**能不能进门**的前提，本适配器自己不做任何反检测：
 *   * patchright 引擎（`platform/browser.ts`，默认 auto → 优先 patchright）；
 *   * stealth 注入（`platform/stealth.ts`）；
 *   * 端口守卫（`platform/cdp-guard.ts`，仅 TCP 调试端口开着时）。
 * 探针结论（§7.1）：猎聘检测的是"CDP 控制页面"的痕迹**本身**（`security.min.js`
 * 主动探测 + 页面被 `location.replace('about:blank')` 销毁），
 * 原版 playwright-core 与 attach 日常 Chrome 都过不去 —— 必须走 patchright 启动式。
 *
 * ## 猎聘特有信号
 *
 * 风控命中时页面被**整体销毁**成 about:blank —— `detectBlock` 把它判为 `blank`，
 * 调用方命中即停（C12），**绝不重试**（重试 = 再撞一次枪口）。
 *
 * ## 解析策略：语义锚点，不是类名锚点
 *
 * 猎聘是构建产物 DOM（class 混淆、随版本变），类名锚点易腐烂。
 * v1 用**语义锚点**（get_jobs 生产验证过的稳定结构）：
 *   * 卡片容器 `div[class*='job-card-pc-container']`（get_jobs Locators 生产在用）；
 *   * 职位链接 `a[href*='/job/']`：标题 + 详情 URL + 平台 id 三合一；
 *   * 公司链接 `a[href*='/company/']`：公司名（待夹具校准，锚不中就留空）；
 *   * 薪资：卡片文本匹配薪资模式（与 `parseSalary` 同一族形态）；
 *   * 「城市·经验·学历」三段文本：只在第三段命中学历词时才采信。
 *
 * **不编选择器**：锚不中的字段留空，由字段级断言隔离进 `pending_repair`
 * （原始片段保留，修好选择器后可重放）—— 这是 §4.2.4 设计好的降级路径。
 * 全部锚点与模式都在配置里（DB 可覆盖），待 `npm run probe:liepin` 保存的真实
 * 夹具（`test/fixtures/liepin-search.html`）校准后可换成精确选择器。
 *
 * ## 翻页（2026-09-18 实测验证）
 *
 * URL 参数 `currentPage`（**0 起**）真换数据：v8 探针对比第 1/2 页夹具，
 * 各 42 个 jobId **零重叠**（`test/fixtures/liepin-search{-p2}.html` 是证据，
 * 对应回归测试见 `test/platform/liepin.test.ts`）。只读采集用 URL 导航
 * （ADR-9），不需要 get_jobs 那种 AntD 按钮点击（那是投递场景）。
 * `hasNextPage` 看 `.list-pagination-box li.ant-pagination-next` 是否
 * disabled（夹具实测共 21 页）。
 *
 * ## 调研结论（夹具 + 接口采样交叉验证，2026-09-18）
 *
 * * 搜索接口 `POST api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`，
 *   请求体 `mainSearchPcConditionForm` 暴露了全部筛选参数：`city/dq`（码）、
 *   `pubTime`、`salaryCode`、`workYearCode`、`eduLevel`、`industry`、`compScale`…
 *   —— 但**只有 city 有 URL 证据**，其余维度不在搜索 URL 上（JS 控件），
 *   所以本适配器只声明 keyword/city/maxPages，**不编**其余维度；
 * * 无城市时接口默认 `city=410`（= 全国，接口采样证据）；具体城市码需逐城实测；
 * * 响应里的 `job.dq` 是**中文**（如 `北京-海淀区`），与 DOM【】文本一致；
 * * 响应字段比 DOM 富得多：`labels`（职位标签）、`refreshTime`（yyyymmddHHMMss）、
 *   `compId`、`recruiter.*`（HR 名/头衔/imId/是否已聊过）、`advViewFlag`（广告位）、
 *   `pcOuterLink`（外链岗）—— 这是 v2 接口化解析的方向（采样已存
 *   `test/fixtures/liepin-search-api*.json`）。
 */
import type { BlockKind } from '../../../shared/enums.js';
import type { RawJob, SearchCriteria, SiteAdapter } from '../types.js';
/** 结构锚点集（2026-09-18 由 v8 探针真实夹具校准）。每一项都可以在 DB 里覆盖着改（ADR-19）。 */
export interface LiepinSelectors {
    /** 卡片容器（get_jobs 生产验证 + 夹具确认：`div._40108Nrnc3.job-card-pc-container`）。 */
    card: string;
    /**
     * 职位链接：猎聘给语义属性 `data-nick="job-detail-job-info"`（比 href 更精确，
     * 夹具确认每张真职位卡恰好一条；广告卡没有）。标题/薪资/经验/学历都在这个链接内。
     */
    jobLink: string;
    /** 公司信息盒：`data-nick="job-detail-company-info"`，内含公司名/行业/规模三个 span。 */
    companyInfoBox: string;
    /** 标题节点：链接内带 title 属性的 div（夹具：`<div class="ellipsis-1" title="招聘Java工程师">`）。 */
    titleNode: string;
    /** 分页容器（AntD）。 */
    pagination: string;
    /** 「下一页」按钮所在 li（get_jobs 生产验证）。 */
    nextPage: string;
    /** 「下一页」disabled 的类名标记。 */
    nextPageDisabledClass: string;
}
/** 字段 → URL 参数映射（get_jobs `getSearchUrl()` 同款：city 与 dq 双参数）。 */
export interface LiepinUrlParams {
    base: string;
    keywordParam: string;
    cityParam: string;
    cityAliasParam: string;
    /** 页码参数（**0 起**；本项目的 criteria.page 是 1 起，构造时换算）。 */
    pageParam: string;
}
export interface LiepinConfig {
    selectors: LiepinSelectors;
    urlParams: LiepinUrlParams;
    /**
     * 城市名 → 平台城市码。**只放验证过的**；未列出的城市 buildSearchUrl 返回
     * null（入口层拒绝），**不猜**。城市码可在自己浏览器里开猎聘搜索页从 URL 抄，
     * 写进 DB 覆盖。`全国` → 空串 = 不带城市参数。
     */
    cityCodes: Record<string, string>;
    /** 薪资文本模式（字符串形态，会序列化进页面）。 */
    salaryPattern: string;
    /** 职位链接里抠平台 id 的模式。 */
    jobIdPattern: string;
    /** 城市模式：猎聘把城市包在【】里（夹具实测：`Java工程师【佛山-顺德区】急聘…`）。 */
    cityPattern: string;
    /** 经验词模式（链接文本尾部匹配，夹具实测如「5年以上」）。 */
    expPattern: string;
    /** 学历词模式（夹具实测如「本科」）。 */
    eduPattern: string;
    /**
     * v2 接口化解析（P1）：非空时 `readListPage` 先在页面上下文里 POST 搜索接口，
     * 失败/为空自动回退 DOM 解析（双通道，永不比 v1 差）。
     * ⚠️ 请求体里的 `ckId` 透传字段留空 —— 真实页面会带会话 ckId，留空是否被
     * 服务端接受**待下次真实抓取验证**；不接受也无妨，会静默走 DOM 通道。
     */
    searchApiOrigin: string;
    searchApiPath: string;
    /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
    searchApiEnabled: boolean;
}
export declare const LIEPIN_SALARY_PATTERN = "\\d+(?:\\.\\d+)?\\s*[-~]\\s*\\d+(?:\\.\\d+)?\\s*[kK\u4E07](?:\\s*[\u00B7x\u00D7]\\s*\\d+\\s*\u85AA)?|\\d+(?:\\.\\d+)?\\s*[kK\u4E07]\\s*\u4EE5\u4E0A|\u9762\u8BAE";
/** 岗位链接形态（夹具实测两种并存）：`/job/<纯数字>.shtml`（普通岗）与
 * `/a/<纯数字>.shtml`（Agent/劳务类岗，如「测试工程师（不要Java）」）。
 * 两者都是真实职位，都要收。
 */
export declare const LIEPIN_JOB_ID_PATTERN = "/(?:job|a)/(\\d+)\\.shtml";
/**
 * 搜索接口（v2 接口化解析，2026-09-18 采样）：
 * `POST https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`。
 * 响应比 DOM 富（labels/refreshTime/compId/recruiter），refreshTime 让
 * publishedAt 首次可用。请求体结构来自真实采样（见 fixtures/liepin-search-api.json）。
 */
export declare const LIEPIN_SEARCH_API_PATH = "/api/com.liepin.searchfront4c.pc-search-job";
/** 城市：夹具实测「Java工程师【佛山-顺德区】急聘15-30k·14薪」——【】里就是城市。 */
export declare const LIEPIN_CITY_PATTERN = "\u3010([^\u3011]{2,15})\u3011";
/** 经验/学历词表（夹具实测位于链接文本尾部，如「5年以上本科」）。 */
export declare const LIEPIN_EXP_PATTERN = "(\\d+\u5E74\u4EE5\u4E0A|\\d+\u5E74\u4EE5\u5185|1\u5E74\u4EE5\u4E0B|\u7ECF\u9A8C\u4E0D\u9650|\u5728\u6821\u751F|\u5E94\u5C4A\u751F)";
export declare const LIEPIN_EDU_PATTERN = "(\u672C\u79D1|\u7855\u58EB|\u535A\u58EB|\u5927\u4E13|\u5B66\u5386\u4E0D\u9650|\u4E2D\u4E13|\u9AD8\u4E2D|MBA|\u7EDF\u62DB\u672C\u79D1)";
/**
 * 单次抓取的页数上限。猎聘 antiBot=high，给得比 51job/智联更保守：
 * 默认 3 页、上限 8 页。
 */
export declare const LIEPIN_DEFAULT_MAX_PAGES = 3;
export declare const LIEPIN_MAX_PAGES = 8;
export declare const DEFAULT_LIEPIN_CONFIG: LiepinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeLiepinConfig(override: unknown): LiepinConfig;
/**
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export declare function buildLiepinSearchUrl(config: LiepinConfig, criteria: SearchCriteria): string | null;
/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 */
export declare function buildSearchRequestBody(criteria: SearchCriteria, cityCode: string): Record<string, unknown>;
/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export declare function fetchListInPage(arg: {
    apiPath: string;
    body: Record<string, unknown>;
}): Promise<unknown>;
/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export declare function refreshTimeToIso(raw: string): string | null;
/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export declare function parseSearchApiResponse(payload: unknown): RawJob[];
/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上会被序列化送进浏览器执行，闭包不存在）。
 * 卡片结构（夹具实测）：
 *
 *   div.job-card-pc-container
 *     └ a[data-nick=job-detail-job-info]                 ← 职位链接（广告卡没有）
 *         ├ div[title="招聘Java工程师"] → Java工程师      ← 标题
 *         ├ 【佛山-顺德区】                               ← 城市
 *         ├ 15-30k·14薪                                  ← 薪资（文本模式）
 *         └ 5年以上 / 本科                                ← 经验/学历（词表）
 *     └ [data-nick=job-detail-company-info]
 *         └ span × 3：库卡机器人 / 工业自动化 / 2000-5000人
 *
 * 解析失败的字段留空/记 notes，由字段级断言隔离 —— **不编**。
 */
export declare function extractJobsInPage(arg: {
    selectors: LiepinSelectors;
    salaryPattern: string;
    jobIdPattern: string;
    cityPattern: string;
    expPattern: string;
    eduPattern: string;
}): RawJob[];
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙。
 *
 * 猎聘特有：风控命中时页面被 `location.replace('about:blank')` 销毁 ——
 * 这里把 about: 协议与"整页被清空"都判成 `blank`，调用方命中即停（C12）。
 * 登录墙的稳定文案**尚无实测证据，不判**（宁可让 blank / 0 条暴露，也不猜）。
 */
export declare function detectBlockInPage(arg: {
    card: string;
}): BlockKind | null;
/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    nextPage: string;
    disabledClass: string;
}): boolean;
export interface LiepinAdapterOptions {
    config?: LiepinConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先；高斯 + 犹豫见 pacing.ts）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造猎聘适配器。 */
export declare function createLiepinAdapter(options?: LiepinAdapterOptions): SiteAdapter;
//# sourceMappingURL=liepin.d.ts.map