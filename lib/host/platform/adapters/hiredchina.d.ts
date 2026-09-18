/**
 * HiredChina（hiredchina.com）适配器 —— 2026-09-18 基于真实线上调研。
 *
 * ## 平台是什么
 *
 * HiredChina 是面向**在华外国人**的招聘平台（与 eChinacities 同源），帮助中国企业招聘
 * 全球人才（英语外教 / 市场营销 / 销售 / IT…），覆盖 120+ 国家、月访问约 300 万。
 * 招聘侧大量岗位天然支持签证担保 / 远程，与项目「海外支线 §4.M」高度相关。
 *
 * ## 调研来源（2026-09-18 一手，非二手资料）
 *
 * * **两个同源域名**（Next.js App Router 同一套应用）：
 *   - 主站 `www.hiredchina.com` —— 对外「人看的入口」，但 **raw HTTP 直接访问会被
 *     Cloudflare managed challenge 拦截**（实测返回 `Just a moment...` + `_cf_chl_opt`
 *     脚本）；真实浏览器里带着用户登录态/会话能正常通过 —— 这正是本插件走真浏览器的意义。
 *   - 子域 `hcweb.gicexpat.com` —— 同一应用，raw HTTP **不被 Cloudflare 拦截**
 *     （实测 200 + 430KB SSR 页面），是探针 / 夹具 / DB 覆盖时的可验证入口。
 * * **列表页**：`/<lang>/jobs`（`lang ∈ {en, zh}`），Next.js **RSC 服务端渲染**
 *   （HTML 内嵌 `self.__next_f.push(...)`，**没有** `__NEXT_DATA__`、也**没有**单独的
 *   jobs JSON 接口 —— 翻页与筛选都是整页 SSR 导航）。所以列表可直接抓 DOM，不需要
 *   像神仙外企那样在页面里调接口。
 * * **详情页**：`/en/job/<uuid>?returnTo=...`；`jobId` 是 **UUID**（8-4-4-4-12 十六进制）。
 *
 * ## 真实夹具校准的卡片 DOM（2026-09-18 浏览器探针逐字段验证）
 *
 * 每张卡片是一个 `<a>`（href 指向详情），内部包 `div[data-slot="card"]`：
 *
 * ```
 * a[href^="/(en|zh)/job/"]  .block.w-full.h-full     ← 卡片外层锚点（卡片身份）
 * └─ div[data-slot="card"]
 *    ├─ h3                                          ← 标题（含 text-emerald-600 font-bold）
 *    ├─ [行，含 lucide-building-2 svg] > span.truncate   ← 公司名
 *    └─ 五个徽章徽章 div（各带不同 Tailwind 底色，即字段判别锚点）：
 *       ├─ bg-emerald-50 text-emerald-700 > span.truncate  ← 薪资（如 "20K - 25K…" / "Negotiable"）
 *       ├─ bg-gray-50       text-gray-600   > span.truncate  ← 地点（如 "China · Guangzhou"）
 *       ├─ bg-blue-50       text-blue-600   > span.truncate  ← 雇佣类型（Full-time / Part-time）
 *       ├─ bg-orange-50     text-orange-600 > span.truncate  ← 工作模式（On-site / Remote）
 *       └─ bg-slate-50      text-slate-500   > span.truncate  ← 经验（"Unlimited experience" / "3～5 years"）
 *   最后一行 border-t（底部）：相对发布时间（"2d ago" / "7h ago"，首个有时是绝对日期）
 * ```
 *
 * ⚠️ 这些底色是 Tailwind 语义化色板（emerald=薪资 / gray=地点 / blue=雇佣 / orange=工作模式 /
 * slate=经验），是**平台自己用来区分字段的稳定约定**，比序号依赖稳。任何一项都可以在 DB 里
 * 覆盖着改（ADR-19），选错只影响该字段、不影响卡片总数。
 *
 * ## 翻页与筛选（全部已实测）
 *
 * * 翻页：`?page=N`（如 `?page=2`），每页 10 条、共 749 页；分页容器 `nav[aria-label="pagination"]`，
 *   `hasNextPage` 用「分页容器里是否存在页码 > 当前页的链接」判断 —— **不自己拼下一页 URL**。
 * * 关键词：`?kw=<词>`（键名是 **`kw`**，不是 `keyword`）；触发需在搜索框逐字输入 + 回车。
 * * 类别：`?type=<slug>`，值 `teaching / marketing / sales_support / other`（`marketing` 与
 *   zh 站「市场营销」都实测映射到 `type=marketing`）。
 * * 雇佣类型：`?employmentId=1`（Full-time / 全职）、`?employmentId=2`（Part-time / 兼职）。
 * * 工作模式：`?isOnline=1`（Remote / 远程）、`?isOnline=0`（On-site / 现场）。
 * * **没有城市 URL 筛选**：页面的地点 quick 按钮（中国/英国…）点击**不产生 URL 参数**，
 *   纯客户端；「More」下拉给的是 `nationalitieParentN`（国籍/语言过滤，不是城市）——
 *   所以本适配器**不声明城市维度**，带城市一律 `buildSearchUrl` 返回 null（fail-closed，
 *   绝不「抓了全国假装抓了深圳」）。
 *
 * ## 详情页（2026-09-18 探针注明，待 probe:hiredchina 落盘详情夹具校准）
 *
 * 标题 `h1`；薪资在渐变卡片 `div[class*="bg-gradient-to-br"]` 内的 `[class*="text-3xl"]`；
 * 徽章行 `div.flex.flex-wrap.gap-2` 按「地点 → 行业 → 雇佣类型 → 工作模式 → 语言」顺序；
 * JD 全文 `div.prose.prose-sm`。⚠️ **本平台详情页没有**签证担保 / 公司规模 / 公司性质 /
 * relocation 字段 —— 因此 `visa` / `companySize` / `companyNature` 一律不编（该平台没有，
 * 编了就是臆造）。
 *
 * ## 判定墙
 *
 * `www.hiredchina.com` 的 Cloudflare managed challenge 是**真实观测**到的第一层墙
 * （raw HTTP 直接命中）。`detectBlock` 显式认得 `_cf_chl_opt` / `Just a moment` /
 * `cf-browser-verification` 这些 Cloudflare 信号，命中即 `captcha` 交还人工（C12）。
 * 此外沿用通用文案判定（验证控件 / 频控 / 登录墙 / 空页）。antiBot 如实定 `medium`。
 *
 * ## 投递 / 打招呼
 *
 * 列表公共可看（未登录可抓，`searchWithoutLogin: true`），投递需登录。未在列表夹具验证
 * 稳定投递按钮契约之前，**不实现** `actions`（fail-closed，见 docs/ADAPTERS.md §6）。
 */
import type { BlockKind } from '../../../shared/enums.js';
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
/**
 * **在页面上下文里**判墙。
 *
 * HiredChina 特有：`www.hiredchina.com` 的 **Cloudflare managed challenge** 是实测第一层墙
 * （raw HTTP 返回 "Just a moment..." + 注入 `_cf_chl_opt` 脚本）。判成 `captcha` 交还人工（C12）。
 * 其余沿用通用文案判定（验证控件 / 频控 / 登录墙 / 空页）。
 */
export declare function detectBlockInPage(arg: {
    card: string;
    cardBox: string;
}): BlockKind | null;
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