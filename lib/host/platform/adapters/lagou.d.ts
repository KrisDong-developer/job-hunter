/**
 * 拉勾网（lagou.com）适配器 —— 2026-09-18 基于真实平台调研。
 *
 * ## 调研来源（2026-09-18 线上抓取 + 搜索量抽样，多次互证）
 *
 * 抓取 `https://www.lagou.com/hangzhou-zhaopin/Python/`、`/jobs/list_AR`、`/jobs/list_Python`
 * 三个真实列表页（另见 docs/ADAPTERS.md 的调研记录）：
 *
 * ## 路由与 URL（**相机里的关键事实**）
 *
 * | 用途 | URL 形态 | 说明 |
 * |---|---|---|
 * | 搜索第 1 页 | `/jobs/list_<关键词>?city=<城市中文名>&px=new` | **关键词进路径**（`list_Java`），城市用**中文名**进 query，**不是数字码** —— 这跟其它平台都不一样 |
 * | 已登录详情 | `/wn/jobs/<纯数字id>.html?show=<token>` | 岗位 id 是**纯数字**（可作幂等键） |
 * | 分页 | `/hangzhou-zhaopin/Python/2/` | 城市拼**拼音 slug 段**，页码是尾部 `/2/`；slug 无法逐城推导 |
 * | 公司 | `/gongsi/v1/<hash>.html` | — |
 *
 * **翻页因此用「读真实 href」而不是自己拼**：第 2 页起读上一页分页区「下一页」链接的真实
 * href（`/hangzhou-zhaopin/Python/2/` 这种），与 zhaopin 的 `nextPageUrlInPage` 同一套路
 * （ADR-9 URL 导航、无 query、贴近站点自己生成的链接）。页码码段走不正也不敢猜。
 *
 * ## 风控强度（本平台最要紧的调研结论）
 *
 * 拉勾 **2020 年后重建 + 上了 WAF**：对 V8/Playwright 探测流量高频返回一个滑块验证页
 * （`appkey: "CF_APP_WAF"`、`sceneId` 随机、请求头注入 `userUserId`），URL 形如
 * `/s/list_<随机hex>`，正文「为了更好的访问体验，请滑动滑块进行验证」。
 * → **antiBot 定 `high`**；`detectBlock` 必须把这套滑块页与极验/阿里云 nc 一起判 `captcha`，
 *   命中即停不重试（C12）。
 *
 * 与此同时，**列表页本身是公开可爬的**（未登录就能拿到职位与薪资明文，本调研的 SEO
 * 直出页即证据），所以 `searchWithoutLogin: true`。`searchWithoutLogin:true` 与
 * `antiBot:high` 并存是拉勾的实情：**能不能进门是反爬的事，进不进得来不是登录的事**。
 *
 * ## 选择器现状（诚实声明）
 *
 * 本次调研拿到的是**内容结构**（标题/地点/薪资/经验/学历/公司/融资/标签），不是构建产物
 * 的 class。拉勾列表页是 Vue 重写，class 混淆且未做真机抓取校准 —— 按项目铁律**不编经典
 * 时代的选择器当真值**：默认选择器射到经典结构（`.con_list_item`/`.position_link`/
 * `.money`/`.company_name`…），但解析体用**语义模式**（薪资/经验/学历/地点从卡片文本抠，
 * 与猎聘同一族做法），锚不中的字段留空进 `pending_repair`。等 `npm run probe:lagou` 保存
 * 真实夹具（`test/fixtures/lagou-search.html`）后校准。
 *
 * ## 城市
 *
 * `city` 参数就是**中文城市名**（`city=深圳`、全国不带该参数）。所以不需要城市码表：
 * 任何中文城市名都能直接拼，UI 枚举用内置 20 城（identity 映射），别处城市自由文本也能收。
 */
import type { RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** 列表页选择器（默认射到经典结构，**待 probe:lagou 夹具校准**，DB 可覆盖）。 */
export interface LagouSelectors {
    /** 岗位卡片容器。 */
    card: string;
    /** 标题链接（标题 + 详情 URL + 岗位 id 三合一）。 */
    titleLink: string;
    /** 标题节点（经典 DOM 内嵌在 titleLink 里）。 */
    titleNode: string;
    /** 薪资。 */
    salary: string;
    /** 公司链接。 */
    company: string;
    /** 「城市·区域」容器（经典结构在 li_b_l 里，文本形如【深圳-南山】）。 */
    location: string;
    /** 「经验 / 学历」所在行。 */
    infoLine: string;
    /** 职位标签。 */
    jobTags: string;
    /** 发布时间。 */
    publish: string;
    /** 分页容器。 */
    pagination: string;
    /** 「下一页」链接。 */
    next: string;
}
/** 详情页选择器集（经典结构，**待含登录夹具校准**，DB 可覆盖）。 */
export interface LagouDetailSelectors {
    /** 标题（经典 `//div[@class='name']/h1`）。 */
    title: string;
    /** 「薪资 / 城市 / 经验 / 学历 / 性质」这一行（经典 `dd.job_request`）。 */
    request: string;
    /** JD 全文（经典 `dd.job_bt`）。 */
    jdText: string;
    /** 公司。 */
    company: string;
}
/** 字段 → URL 参数映射。 */
export interface LagouUrlParams {
    /** 基础地址；关键词拼成 `${base}list_<关键词>`。 */
    base: string;
    /** 城市参数（中文名，全国 = 省略该参数）。 */
    cityParam: string;
    /** 排序参数（实测 `px=new` = 最新）。 */
    sortParam: string;
}
export interface LagouConfig {
    selectors: LagouSelectors;
    urlParams: LagouUrlParams;
    /**
     * 城市名 → 城市名（identity）。拉勾 `city` 参数就是**中文城市名**，全国 → 空串 = 省参。
     * 这份枚举只为 UI 筛选器给常用城市；未列出的城市以自由文本照收（不需要码表）。
     */
    cityNames: Record<string, string>;
    /** 薪资文本模式（序列化进页面）。 */
    salaryPattern: string;
    /** 详情链接里抠纯数字 id 的模式（`/wn/jobs/<id>.html` 或 `/jobs/<id>.html`）。 */
    jobIdPattern: string;
    /** 「经验/学历」行里的分隔符（页面显示形如「经验3-5年 / 本科」，是「 / 」）。 */
    infoSeparator: string;
    /** 发布时间的文本模式（`YYYY-MM-DD` 形态）。 */
    publishPattern: string;
    /** 详情页选择器（**待含登录夹具校准**）。 */
    detailSelectors: LagouDetailSelectors;
    /**
     * v2 接口化解析（对照猎聘/神仙外企双通道）：非空启用时 `readListPage` 先在页面上下文里
     * POST `positionAjax.json`，拿到的字段比 DOM 富（createTime/companySize/financeStage/industryField），
     * 失败或空结果自动回退 DOM —— 永不比 v1 差。接口需要页面会话的 anti-forge cookie/token，是否被
     * 服务端接受**待真实抓取验证**；不接受也无妨，静默走 DOM 通道。
     */
    searchApiOrigin: string;
    searchApiPath: string;
    /** 接口是否启用（false = 强制 DOM 通道，校准/排障用）。 */
    searchApiEnabled: boolean;
}
/** 城市名清单（identity 映射；全过 = 不带 city 参数）。 */
export declare const LAGOU_CITY_NAMES: Record<string, string>;
export declare const LAGOU_SALARY_PATTERN = "\\d+(?:\\.\\d+)?k\\s*[-~]\\s*\\d+(?:\\.\\d+)?k(?:\\.\\d+)?|\\d+(?:\\.\\d+)?k\\s*\u4EE5\u4E0A|\u9762\u8BAE";
/** 详情链接形态：`/wn/jobs/<纯数字>.html`（新）或 `/jobs/<纯数字>.html`（旧）。 */
export declare const LAGOU_JOB_ID_PATTERN = "/(?:wn/jobs|jobs)/(\\d+)\\.html";
/** 经验/学历分隔符（页面显示「经验3-5年 / 本科」，是带空格的「 / 」）。 */
export declare const LAGOU_INFO_SEPARATOR = "/";
/** 发布时间形态：`YYYY-MM-DD`。 */
export declare const LAGOU_PUBLISH_PATTERN = "\\d{4}[-/]\\d{2}[-/]\\d{2}";
/** 搜索接口（v2 双通道）：POST `/jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`。 */
export declare const LAGOU_SEARCH_API_PATH = "/jobs/positionAjax.json";
/** 详情页选择器默认值（经典结构，`//div[@class='name']/h1` 等；**待含登录夹具校准**）。 */
export declare const DEFAULT_LAGOU_DETAIL_SELECTORS: LagouDetailSelectors;
/** 排序取值域：只有「最新」（`px=new`）有线上证据（搜索页排序区回显 px=new）。 */
export declare const LAGOU_SORT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 发布时间窗：拉勾搜索 URL 不暴露该维度（那套筛选走 positionAjax POST），值域为空。 */
export declare const LAGOU_POSTED_WITHIN_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 单次抓取页数上限。拉勾 antiBot=high（WAF 滑块），给得保守：
 * 默认 3 页、上限 10 页。
 */
export declare const LAGOU_DEFAULT_MAX_PAGES = 3;
export declare const LAGOU_MAX_PAGES = 10;
export declare const DEFAULT_LAGOU_CONFIG: LagouConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeLagouConfig(override: unknown): LagouConfig;
/**
 * 构造搜索 URL（**第 1 页**）。关键词进路径，城市用中文名进 query，全国省略 city。
 * `criteria.page > 1` 时返回 null —— 拉勾翻页要读上一页「下一页」的真实 href
 * （`/hangzhou-zhaopin/Python/2/`），由 `gotoSearch` 走 `readNextPageUrl`，**不自己拼**。
 */
export declare function buildLagouSearchUrl(config: LagouConfig, criteria: SearchCriteria): string | null;
/**
 * 构造搜索接口地址（v2 双通道）：城市在 query（中文名），全国省参。
 * `POST /jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`
 */
export declare function buildLagouSearchApiUrl(config: LagouConfig, cityName: string): string;
/** 搜索接口请求体（`kd` 关键词、`pn` 页码 1 起、`first` 首翻页标记）。 */
export declare function buildLagouRequestBody(criteria: SearchCriteria, page: number): Record<string, string>;
/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整 Cookie/指纹/TLS，
 * 与猎聘/神仙外企同一铁律：绝不回退宿主 Node 的 fetch）。返回解析后的 JSON；
 * 任何失败返回 null（调用方走 DOM 兜底）。
 */
export declare function fetchListInPage(arg: {
    apiPath: string;
    form: Record<string, string>;
}): Promise<unknown>;
/**
 * 解析搜索接口响应（Node 侧纯函数；结构经典：`content.positionResult.result[]`）。
 * 字段比 DOM 富：createTime（毫秒）/ companySize / financeStage / industryField / positionAdvantage。
 */
export declare function parseSearchApiResponse(payload: unknown): RawJob[];
/**
 * **在页面上下文里**解析详情页（选择器为经典结构，**待含登录夹具校准**）。
 * ⚠️ 必须完全自包含。详情页选择器未校准且有些字段需登录；打不开时调用方判墙兜底。
 */
export declare function extractDetailInPage(arg: {
    selectors: LagouDetailSelectors;
}): RawJobDetail;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * ⚠️ **待含登录夹具校准**。只认**结构性信号**（已登录时头部有用户头像/「我的」入口），
 * 不认"页面上有没有『登录』两个字" —— 正常结果页右上角一直有登录入口。
 */
export declare function isLoggedInInPage(): boolean;
/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上被序列化送进浏览器执行）。
 * 解析以**语义模式**为主（与猎聘同族做法）：选择器是"锚点提示"，命中就细化，
 * 不命中就从卡片文本抠 —— 这样即使 class 变了，薪资/经验/学历/地点仍能采到。
 * 锚不中的字段留空/记 notes，由字段级断言隔离进 pending_repair，**不编**。
 */
export declare function extractJobsInPage(arg: {
    selectors: LagouSelectors;
    salaryPattern: string;
    jobIdPattern: string;
    infoSeparator: string;
    publishPattern: string;
}): RawJob[];
/**
 * **在页面上下文里**取「下一页」的真实 href（返回绝对 URL）。
 * 拉勾翻页靠 `/<城市拼音>-zhaopin/<关键词>/<页>/`，拼音 slug 无法逐城推导 ——
 * 所以**读站点生成的分页链接**，而不是自己拼（zhaopin `nextPageUrlInPage` 同一套路）。
 */
export declare function nextPageUrlInPage(arg: {
    pagination: string;
    next: string;
}): string | null;
/** **在页面上下文里**判「下一页」是否可用。 */
export declare function hasNextPageInPage(arg: {
    pagination: string;
    next: string;
}): boolean;
export interface LagouAdapterOptions {
    config?: LagouConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造拉勾网适配器。 */
export declare function createLagouAdapter(options?: LagouAdapterOptions): SiteAdapter;
//# sourceMappingURL=lagou.d.ts.map