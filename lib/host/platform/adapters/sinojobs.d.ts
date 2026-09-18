/**
 * SinoJobs 中欧招聘（sinojobs.com.cn）适配器 —— 列表页采集 + 详情页解析。
 *
 * ## 平台实测（2026-09-18，真实页面与接口交叉验证）
 *
 * SinoJobs 有中英德三个版本；**中文站 `sinojobs.com.cn`** 是面向"中欧双向求职者"
 * 的求职入口（`www.sinojobs.com` 是面向欧洲企业的主站/门户）。岗位多为德企 /
 * 欧洲企业在华与海外职位，城市常见 `国外` / `上海` / `常州` 等。
 *
 * 与神仙外企同款的关键事实：**列表不在 DOM 里**。页面打开后，站内脚本
 * （`$(function(){ ... onloadPage(1, 15) })`）会用 jQuery 同步 AJAX 把
 * `POST /Recruitment/indexAjaxPage.html` 返回的 JSON 渲染进 `#recruitmentList`，
 * 而且渲染模板**不展示薪资**。所以：
 *
 *   * 抓 DOM 拿不到核心字段 —— 必须**在页面上下文里调接口**（`page.evaluate` 里 `fetch`）；
 *   * 在页面里发请求顺带拿到**同源 Cookie / 登录态**（`credentials: 'include'`），
 *     与用户自己在浏览器里翻列表走同一条链路。
 *
 * ## 接口契约（全部实测）
 *
 * `POST /Recruitment/indexAjaxPage.html`，表单编码（`application/x-www-form-urlencoded`）：
 *
 * | 参数 | 含义 | 取值 |
 * |---|---|---|
 * | `page` | 页码，**1 起** | 实测第 2 页与第 1 页零重叠 |
 * | `limit` | 页容量 | 站点自己用 15；实测 20/50/100 均正常（100 时一次返回全量 78） |
 * | `keywords` | 关键词 | 实测 `工程师` → 78→17 条 |
 * | `job_type` | 行业类别 | 43 项，id 见 `SINOJOBS_JOB_TYPE_SEED`；实测 `574`(IT/互联网) 生效 |
 * | `work_nature` | 工作性质 | 1=全职 / 2=兼职 / 3=实习；实测 `3` → 4 条 |
 * | `address_id` | 地点 | `10000`=国内 / `10001`=国外 / 省级 id（北京=1、上海=3…）；实测 `3` → 15 条上海岗 |
 * | `salary_range` | 薪资档 | 0=面议 / 3=3K以下 / 5=3K-5K / 10=5K-10K / 15=10K-15K / 25=15K-25K / 26=25K+ |
 * | `experience` | 经验档 | 0=不限 / 1=应届毕业生 / 2=1年～3年 / 3=3年～5年 / 4=5年以上 |
 *
 * 响应 `{"status":1, "info":"数据获取成功", "data":{"total":"78","rows":[...]}}`，
 * 每行字段：`id` / `job_title` / `company` / `work_city` / `release_time`（**Unix 秒**）/
 * `end_time` / `top_time`（置顶时间戳，null 或值）/ `experience` / `education` /
 * `salary_range`（`面议` 或 `25K+` 等）/ `company_id` / `logo`。**薪资在接口里就有**，
 * 只是站点自己的渲染模板不展示 —— 这正是本适配器要走接口而不是抓 DOM 的理由。
 *
 * ## robots 取舍
 *
 * `robots.txt` 只禁 `User-agent: *` 下的 `/UserCenter/*`、`/CompanyUcenter/*`、
 * `/Ucenter/*`、`/Oauth/*`。本适配器访问的 `/Recruitment/*`（列表页与列表接口
 * `indexAjaxPage.html`）与详情页 `/Recruitment/content.html` 都在允许范围内。
 * 投递要登录（`/UserCenter/resumeShow.html`），采集链路**不碰**投递与任何 Ucenter 路径。
 */
import type { BlockKind } from '../../../shared/enums.js';
import type { RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** 页面外壳地址（人看的入口；筛选条件不在 URL 里，见 `buildSinoJobsSearchUrl`）。 */
export declare const SINOJOBS_WEB_BASE = "https://sinojobs.com.cn";
/** 列表接口路径（POST，表单编码）。 */
export declare const SINOJOBS_API_PATH = "/Recruitment/indexAjaxPage.html";
export declare const SINOJOBS_LIST_URL = "https://sinojobs.com.cn/Recruitment/index.html";
/** 详情页 URL 模板。`{jobId}` 会被替换（详情页是服务端渲染的静态 HTML）。 */
export declare const SINOJOBS_DETAIL_URL_TEMPLATE = "https://sinojobs.com.cn/Recruitment/content.html?id={jobId}";
/**
 * 单页容量。站点自己用 15（分页插件 `pageSizeOpt: 5/10/15/20` 家族），
 * 实测接口收 20/50/100 都正常 —— 用 20 在"站点自己用过的取值"里取最大，
 * 少几轮请求（全量 78 条 → 4 页）。
 */
export declare const SINOJOBS_PAGE_SIZE = 20;
/**
 * 页数上限。全量池实测 78 条（20 条/页 → 4 页），关键词搜索只会更少。
 * 给 6 页留足余量，同时把抓取深度压得保守（§P5 保守优先）。
 */
export declare const SINOJOBS_MAX_PAGES = 6;
/** 薪资取值域（页面筛选项 `#work-salary strong[rel]`，rel 即接口 `salary_range`）。 */
export declare const SINOJOBS_SALARY_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 经验取值域（`#work-year strong[rel]`，rel 即接口 `experience`）。 */
export declare const SINOJOBS_EXPERIENCE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 工作性质取值域（`#work_nature`，值即接口 `work_nature`）。 */
export declare const SINOJOBS_WORK_NATURE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
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
export declare const SINOJOBS_ADDRESS_CODES: Record<string, string>;
/**
 * 行业类别取值域（`job_type`）—— 实测 seed，来自页面 `#job_type` 的全部 43 项。
 *
 * 与城市同一套「人工维护 + DB 覆盖」逻辑；站点增删行业时在 DB 覆盖 `jobTypeList` 即可。
 */
export declare const SINOJOBS_JOB_TYPE_SEED: Array<{
    id: string;
    name: string;
}>;
/**
 * 记录字段名 → 我们的语义。平台改字段名时**在 DB 里覆盖着改**即可（ADR-19）。
 * 右边一列全部来自实测响应原文（`test/fixtures/sinojobs-list-payload.json`）。
 */
export interface SinoJobsFields {
    id: string;
    title: string;
    company: string;
    /** 城市文本（`国外` / `上海` / `常州`…）。 */
    workCity: string;
    /** 发布时间，**Unix 秒**（字符串）。 */
    releaseTime: string;
    /** 截止时间，Unix 秒（字符串）。 */
    endTime: string;
    /** 置顶时间戳；null 或值（字符串化后空串 = 未置顶）。 */
    topTime: string;
    salaryRange: string;
    experience: string;
    education: string;
    companyId: string;
    logo: string;
}
export interface SinoJobsConfig {
    webBase: string;
    apiPath: string;
    /** 单页容量（默认 `SINOJOBS_PAGE_SIZE`）。 */
    pageSize: number;
    detailUrlTemplate: string;
    /** 地点名 → `address_id`。 */
    addressCodes: Record<string, string>;
    /** 行业类别（`job_type`）取值域。实测 seed，可在 DB 覆盖扩充。 */
    jobTypeList: Array<{
        id: string;
        name: string;
    }>;
    fields: SinoJobsFields;
    /** 只用于"等页面渲染"与"翻页按钮探测"，**不用于解析**（解析走接口 / 详情页 DOM）。 */
    selectors: {
        card: string;
        nextPage: string;
    };
    /** 详情页解析用的选择器（详情页是服务端渲染的静态 HTML）。 */
    detail: {
        /** 职位名（页面结构实测是 `h5`）。 */
        title: string;
        /** 公司名（第一个 `h6`）。 */
        company: string;
        /** 信息列表（薪资 / 城市 / 经验 / 工作性质 / 发布时间 五项）。 */
        infoList: string;
        /** JD 段落（职位描述 / 任职要求等正文）。 */
        jdBlocks: string;
    };
}
export declare const DEFAULT_SINOJOBS_CONFIG: SinoJobsConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeSinoJobsConfig(override: unknown): SinoJobsConfig;
/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 与神仙外企同理：筛选条件**不在 URL 里**（全部走 POST body），URL 只承载
 * 页面自己的 `keywords`（仅供人核对）。城市仍然在这里校验 ——
 * 表里没有的城市直接返回 `null`（**不猜**，否则"城市没配"会变成一次静默的全国搜索）。
 */
export declare function buildSinoJobsSearchUrl(config: SinoJobsConfig, criteria: SearchCriteria): string | null;
/** 接口请求体（表单字段，与站点 `onloadPage(page, limit)` 发送的完全一致）。 */
export declare function buildSinoJobsRequestBody(config: SinoJobsConfig, criteria: SearchCriteria, page: number): Record<string, string>;
/**
 * **在页面上下文里**解析列表响应。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以日期换算这类逻辑在函数体内**各写一遍**。
 *
 * @param config 字段配置（由宿主序列化传入）
 */
export declare function extractJobsInPage(config: SinoJobsConfig): RawJob[];
/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 与神仙外企同款的两步拆分：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export declare function fetchListInPage(arg: {
    url: string;
    body: Record<string, string>;
}): Promise<{
    ok: boolean;
    statusCode: number | null;
    message: string;
    rawStatus: number;
}>;
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 空白页。
 *
 * 与神仙外企同理：列表不是 DOM 渲染的，"卡片数"只能当佐证，**接口返回**才是主判据 ——
 * 但接口侧的错误（`status != 1`）已经在 `readListPage` 处以抛错暴露成 `PARSE_FAILED`，
 * 这里只处理**页面结构信号**（实测该平台未观察到接口侧的专门风控码）。
 */
export declare function detectBlockInPage(arg: {
    cardCount: number;
}): BlockKind | null;
/** 在页面上下文里找「下一页」是否可用（UI 信号；真正的闸门是 `maxPages` + 接口 total）。 */
export declare function hasNextPageInPage(arg: {
    selector: string;
}): boolean;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递（`/UserCenter/...`）。
 * 未登录时顶部导航是 `<a class="sign-out" href="/Ucenter/login.html">登录</a>`（实测）；
 * 已登录时该链接被用户菜单替换。所以这里只看一个结构性信号：**登录链接是否还在**。
 */
export declare function isLoggedInInPage(): boolean;
/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export declare function countCardsInPage(arg: {
    selector: string;
}): number;
/**
 * **在页面上下文里**解析详情页（服务端渲染的静态 HTML，实测结构）：
 *
 *   * 职位名：`h5`；
 *   * 公司名：第一个 `h6`；
 *   * 信息列表（`ul li`）：`[薪资, 城市, 经验 X, 全职/兼职/实习, 发布于YYYY-MM-DD]`；
 *   * JD 正文：`h6`（职位描述/任职要求/联系方式/公司信息）+ 随后的 `p`。
 *
 * 信息列表**按文案模式分类而不是按下标**：平台字段增减时按位置读会错位。
 */
export declare function extractDetailInPage(config: SinoJobsConfig): RawJobDetail;
export interface SinoJobsAdapterOptions {
    config?: SinoJobsConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等页面渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造 SinoJobs 适配器。 */
export declare function createSinoJobsAdapter(options?: SinoJobsAdapterOptions): SiteAdapter;
/** 在页面上下文里读最近一次列表响应的 total（没抓到就 0）。 */
export declare function readTotalInPage(): number;
//# sourceMappingURL=sinojobs.d.ts.map