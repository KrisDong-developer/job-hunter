import type { RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
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
    /**
     * ── 详情页（2026-09-18 详情探针夹具 `liepin-detail.html` 校准）──────
     * 详情页是 SSR 直出（真实文本就在 DOM 里），未登录也能读到 JD 正文。
     */
    /** 职位名（详情页）。 */
    detailTitle: string;
    /** 薪资。**必须限定在 `.name-box` 内** —— 裸 `.salary` 会命中侧栏推荐岗位。 */
    detailSalary: string;
    /** 关键信息行：「佛山-顺德区 5年以上 本科 招5人 9月17日更新」。 */
    detailProperties: string;
    /**
     * 公司名（详情页）。取 `公司信息` 侧栏卡片里的名字节点。
     *
     * ⚠️ **不能复用列表页的 `job-detail-company-info`**：夹具里这个 `data-nick`
     * 在详情页出现 20 次，**全部**落在 `section.love-job-container`（「猜你喜欢」
     * 推荐位），第一个命中是别家公司的岗位卡 —— 会静默把公司名写错。
     */
    detailCompany: string;
    /** JD 所在容器（语义类名，SSR 输出）。 */
    detailIntroSection: string;
    /**
     * JD 所在块的 `dt` 文案。**用文案当锚点而不是类名**：同一容器里有多个 `dl`，
     * 只有 `dt=职位介绍` 那块是正文，其余是「其他信息」（语言/行业/部门要求）。
     */
    detailIntroTitleText: string;
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
/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    nextPage: string;
    disabledClass: string;
}): boolean;
/**
 * **在页面上下文里**解析职位详情页（2026-09-18 探针真实夹具校准）。
 *
 * ⚠️ 必须完全自包含（会被序列化送进浏览器执行）。
 *
 * 与其它平台的关键差别：猎聘详情页是 **SSR 直出** —— JD 正文就在 DOM 里
 * （`section.job-intro-container` 中 `dt=职位介绍` 那块 `dd`，实测 1074 字），
 * **未登录也读得到**，不需要像智联那样从 `__INITIAL_STATE__` 挖载荷。
 * 薪资也**不做正则匹配**：详情页有明确的 `.salary` 节点（列表页才需要文本模式）。
 *
 * 为什么用 `dt` 的**文案**当锚点：同一个容器里有多个 `dl`，只有「职位介绍」
 * 那块是正文，其余是「其他信息」（语言/行业/部门要求）—— 按类名取会取错块。
 */
export declare function extractJobDetailInPage(arg: {
    selectors: LiepinSelectors;
    expPattern: string;
    eduPattern: string;
}): RawJobDetail;
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