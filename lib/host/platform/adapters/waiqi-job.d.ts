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
import type { BlockKind } from '../../../shared/enums.js';
import type { RawJob, SearchCriteria, SiteAdapter } from '../types.js';
/** 页面外壳地址（人看的入口）。 */
export declare const WAIQI_WEB_BASE = "https://www.waiqi.com";
/** 接口根：列表接口在 `position-service` 下。 */
export declare const WAIQI_API_BASE = "https://backservice.offerxiansheng.com/api/position-service";
/** 列表接口路径。`/social-position/foreign/...` 就是外企平台自己在用的那个。 */
export declare const WAIQI_LIST_PATH = "/social-position/foreign/page-list";
/**
 * 单页容量上限（平台硬上限，不是我们保守）。
 *
 * 实测：`size=50` 正常返回 50 条；`size=100` → `code=1010, message="size最大为50"`。
 */
export declare const WAIQI_MAX_PAGE_SIZE = 50;
/**
 * 最多抓几页 —— **只能是 1**。
 *
 * 实测：`page=2`（乃至 3、4）一律返回 `code=1000` + `positionVO.records=[]`，
 * 与 `size` 无关。也就是说第二页永远拿不到数据。
 * 与其声明 5 页然后静默返回 0 条，不如老实写 1：
 * **"抓不到"要让用户看见，不能伪装成"没有新岗位"**（§4.2.4）。
 */
export declare const WAIQI_MAX_PAGES = 1;
/**
 * 职位范围（页面顶部的两个 tab）。
 *
 * 实测：`type=2` 是页面默认（外企），`type=1` 放宽到合资/民营；
 * `type=0` 会让服务端报 `code=999 系统数据异常`，所以值域里没有它。
 */
export declare const WAIQI_TYPE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 工作经验取值域。
 *
 * 值域来自实测：`workExp=N` 的返回量呈钟形（0=不限、1=1年以下、2=1-3年、
 * 3=3-5年、4=5-10年、5=10年以上），`6`/`7` 恒为 0 条 —— 说明只有 0~5 是有效档位。
 * 与页面筛选项 `exp = ['不限经验','1年以下','1-3年','3-5年','5-10年','10年以上']` 一致。
 */
export declare const WAIQI_WORK_EXP_OPTIONS: Array<{
    value: string;
    label: string;
}>;
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
export declare const WAIQI_EDUCATION_OPTIONS: Array<{
    value: string;
    label: string;
}>;
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
export declare const WAIQI_CITY_CODES: Record<string, number>;
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
export declare const WAIQI_POS_INFO_SEED: Array<{
    id: number;
    name: string;
}>;
/**
 * 行业取值域（`businessCategoryIdList`）—— 实测 **seed**，来自真实列表响应。
 *
 * 完整表由接口 `getBusList` 返回（前端已按 `name !== "不限"` 过滤）。
 * 这里的 13 个是夹具里真实出现的主行业（IT / 医药 / 金融 / 销售 / 运营 等）。同上，DB 可扩充。
 */
export declare const WAIQI_BUSINESS_CATEGORY_SEED: Array<{
    id: number;
    name: string;
}>;
/** 详情页 URL 模板。`{jobId}` 与 `{posType}` 会被替换。 */
export declare const WAIQI_DETAIL_URL_TEMPLATE = "https://www.waiqi.com/position/detail?id={jobId}&posType={posType}";
/**
 * 记录字段名 → 我们的语义。
 *
 * 平台改字段名时**在 DB 里覆盖着改**即可，不用等发版（ADR-19 / J2 / R5）。
 * 右边一列全部来自实测响应原文。
 */
export interface WaiqiFields {
    id: string;
    /** 职位名（中文，可能为空）。 */
    title: string;
    /** 职位名英文（很多外企岗位只有它更完整）。 */
    titleEn: string;
    company: string;
    /** 月薪下限 / 上限，单位 **K**。 */
    salaryMin: string;
    salaryMax: string;
    /** 年发薪月数（`coefficient`）。实测 12 或 13，也可能为 null。 */
    salaryMonths: string;
    /** 是否面议（`negotiable`，1 = 面议）。 */
    negotiable: string;
    /** 城市（`cityNameList` 是**一个字符串**，不是数组）。 */
    city: string;
    district: string;
    /** 岗位职能分类（`posCategoryName`，如 `人事/行政` / `IT技术` —— 与行业 `businessCategoryNameList` 不同）。 */
    posCategory: string;
    /** 详细办公地址（`address`，也可能是一句说明如"地点不限，远程工作支持英国总部"）。 */
    address: string;
    exp: string;
    edu: string;
    /** 平台标签数组（`tagNameList`，可能为 null）。 */
    tags: string;
    /** 另一套标记，逗号分隔（如 `急招,可远程`）。 */
    attribute: string;
    publishedAt: string;
    industry: string;
    companySize: string;
    companyNature: string;
    /** 外企国别标签（`美企` / `德企` / `瑞士外企`……）。 */
    foreignTag: string;
    logoUrl: string;
    /** 来源（实测 2/3，疑似"自投/官方渠道"）。 */
    source: string;
    /** 岗位类别（1=社招，实测）。 */
    positionType: string;
    /** 有的岗位直接跳官网 ATS，此时这里是外部地址。 */
    outsideUrl: string;
    /** 投递背后的渠道 / ATS 名（`informationSource`，如 `successfactors` / `workday` / `万豪官网招聘`）。 */
    informationSource: string;
    /** 投递方式（`sendType`）。 */
    applyKind: string;
}
export interface WaiqiConfig {
    webBase: string;
    apiBase: string;
    listPath: string;
    detailUrlTemplate: string;
    /** 记录里 `posType` 缺失时的兜底值。 */
    defaultPosType: string;
    cityCodes: Record<string, number>;
    /** 职能（`posIds`）取值域。实测 seed，可在 DB 覆盖扩充。 */
    posInfoList: Array<{
        id: number;
        name: string;
    }>;
    /** 行业（`businessCategoryIdList`）取值域。实测 seed，可在 DB 覆盖扩充。 */
    businessCategoryList: Array<{
        id: number;
        name: string;
    }>;
    fields: WaiqiFields;
    /** 只用于"等页面渲染"与"翻页按钮探测"，**不用于解析**（解析走接口）。 */
    selectors: {
        card: string;
        nextPage: string;
    };
}
export declare const DEFAULT_WAIQI_CONFIG: WaiqiConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeWaiqiConfig(override: unknown): WaiqiConfig;
/**
 * 把 `criteria.city` 归一化成城市名数组。
 *
 * 支持**多城市**：逗号分隔（`深圳,广州` 或中文顿号）、去空白、去重。
 * 平台接口的 `cityIds` 原生接受逗号拼接的多个城市码（`"248,247"`），
 * 一次请求就能覆盖多个目标城市 —— 因为服务端翻页是坏的（§3），单页抓取尤其值得把多城合并成一次过滤。
 */
export declare function splitCityList(city: string | undefined): string[];
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
export declare function buildWaiqiSearchUrl(config: WaiqiConfig, criteria: SearchCriteria): string | null;
/** 接口请求体：页面初始值 + 用户配的筛选条件。 */
export declare function buildWaiqiRequestBody(criteria: SearchCriteria, cityCodes: Record<string, number>, page: number, size?: number): Record<string, unknown>;
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
export declare function extractJobsInPage(config: WaiqiConfig): RawJob[];
/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 为什么分两步而不是一个 async 函数干完：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果，不必给 jsdom 装 fetch。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export declare function fetchListInPage(arg: {
    url: string;
    body: Record<string, unknown>;
}): Promise<{
    ok: boolean;
    code: number | null;
    message: string;
    status: number;
}>;
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
export declare function detectBlockInPage(arg: {
    cardCount: number;
    /** 最近一次列表接口返回的 code；`null` = 还没发过请求。 */
    code: number | null;
}): BlockKind | null;
/** 在页面上下文里找「下一页」是否可用。**注意**：真正的闸门是 `maxPages=1`。 */
export declare function hasNextPageInPage(arg: {
    selector: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递、收藏、订阅。
 * 所以这里只看一个结构性信号：页面上是否有用户头像（未登录时是"登录"按钮）。
 *
 * ⚠️ **不认"页面上有没有『登录』两个字"**：正常结果页右上角一直有登录入口，
 * 拿它判断会导致"永远判定为未登录"，定时任务就永远不跑了（那是个很隐蔽的死锁）。
 */
export declare function isLoggedInInPage(): boolean;
export interface WaiqiAdapterOptions {
    config?: WaiqiConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等页面渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造神仙外企适配器。 */
export declare function createWaiqiAdapter(options?: WaiqiAdapterOptions): SiteAdapter;
/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export declare function countCardsInPage(arg: {
    selector: string;
}): number;
//# sourceMappingURL=waiqi-job.d.ts.map