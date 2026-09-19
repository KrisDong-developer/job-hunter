/**
 * 智联招聘（zhaopin.com）适配器 —— 列表页采集。
 *
 * ## 先纠正一个会让人白写一遍的坑：`/jobs?jl=` **不是**搜索页
 *
 * 实测（2026-09，直接抓取线上）有两个长得像搜索页的路由，**DOM 完全不同**：
 *
 * | 路由 | 卡片选择器 | 薪资 | 翻页 |
 * |---|---|---|---|
 * | `https://www.zhaopin.com/jobs?jl=765&kw=Java` | `.job-card` | **被掩码成 `**-**元`**（未登录） | 无，第 20 条后是 `.job-list-login-gate` |
 * | `https://www.zhaopin.com/sou/jl765` | `.joblist-box__item` | **明文**（`8000-16000元` / `1.5-2.5万·20薪`） | 有真实分页，未登录可翻到深页 |
 *
 * 两者都有 `__INITIAL_STATE__`、都能出 20 条，所以"抓到了数据"并不能证明抓对了页面。
 * 本适配器**以 `/sou/jl<code>` 为搜索入口**（有分页、薪资明文）—— **但不假设一定能落到它**：
 *
 * ## ⚠️ AB 分流：`/sou/` 自己也会被丢到 `/jobs` 老路由（2026-09-18 新实测）
 *
 * 同一地址 `/sou/jl765?kw=Java` 连打两次，一次落到 jobinfo 明文页（→ `/sou/jl765/kw<token>/p1`、
 * 薪资 `1-1.1万`），一次被服务端分流到旧 `/jobs` 掩码页（`.job-card`、薪资 `**-**元`）。
 * 所以「只认 `/sou/`」**不够** —— 分流去的那半，DOM 卡片与薪资都变了套。
 * 应对（本适配器的两处兜底，详见下方「AB 分流兜底」节）：
 *   - `detectBlockInPage`：只要 `__INITIAL_STATE__.positionList` 有真数据，就不判登录墙；
 *   - `extractJobsInPage`：DOM 卡片为 0 但载荷有真值时，凭载荷补开出数（薪资取明文 `salary60`）。
 * 总之 **`positionList` 载荷才是唯一权威数据源**，DOM 只负责"页面实际展示了什么"这一层证据。
 *
 * ## 数据来源：DOM 为主，内嵌载荷补时间与公司信息
 *
 * `/sou/` 的卡片 DOM 已经带齐了核心字段（标题/薪资/城市·区·街道/公司/经验/学历），
 * 所以 DOM 是主路径 —— 它也是"页面实际展示了什么"的直接证据。
 * `__INITIAL_STATE__.positionList` 与卡片**渲染顺序一致**（都 20 条、逐条对得上），
 * 用它补 DOM 上没有的 `publishTime`、`industryName`、`companySize` 与岗位 id。
 * 载荷缺失时降级为纯 DOM，并留下 note —— 不静默。
 *
 * ## robots 取舍（用户已确认）
 *
 * `robots.txt` 含 `Disallow: /*?*`，即**禁掉所有带 query 的 URL**。
 * 而站点自己的分页链接是无 query 的 path 形式 `/sou/jl765/kw<token>/p2`（或 `/sou/jl765/p2`）。
 * 所以本适配器的取词策略是：
 *   - **只在第 1 页**用 `?kw=<明文>` 取词（这是唯一能按关键词进来的方式）；
 *   - **第 2 页起优先用站点自己给出的无 query path 链接**（从分页区真实 href 里读），
 *     拿不到才退回 query 形式。
 * 这样合规面最大，同时保留关键词搜索。
 *
 * ⚠️ 顺带记下两条实测事实，避免后来者踩：
 *   1. path 里的 `kw` **只接受站点自己发的 token**：`/sou/jl765/kwJava/p1` 会返回
 *      0 条 + `noJobTip`（"登录之后再搜索"）。**绝不要自己造 token。**
 *   2. path 的 `/p<N>` 会**覆盖** query 的 `p`，两种形式不要混用。
 */
import type { BlockKind, ContactStage } from '../../../shared/enums.js';
import { type BlockSignalSet } from '../block-signals.js';
import type { RawInboxMessage, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
/** `/sou/` 列表页的选择器集。**每一项都可以在 DB 里覆盖着改**（ADR-19）。 */
export interface ZhaopinSelectors {
    /** 卡片容器。 */
    card: string;
    /** 标题（同时是详情链接）。 */
    title: string;
    salary: string;
    /** 「地点 / 经验 / 学历」三项容器。 */
    otherInfo: string;
    /** 上面容器里的单项。 */
    otherInfoItem: string;
    /** 地点项里的 `<span>`（有它才说明这一项是地点）。 */
    locationSpan: string;
    company: string;
    /**
     * ⚠️ legacy：曾经用它在卡片里抓 `.joblist-box__item-tag`（会同时命中职位技能标签与
     * 公司标签，混在一起）。2026-09-18 起技能/福利标签改从载荷 `showSkillTags` 读，公司
     * 性质/规模/行业走 `propertyName/companySize/industryName` 字段，这个选择器**已不再被
     * 读取**只有在既有 DB 覆盖里还引用它 —— 保留键位兼容，勿再依赖。
     */
    companyTags: string;
    /** 分页容器。 */
    pagination: string;
    /** 「下一页」链接（无 query 的 path 形式）。 */
    nextLink: string;
    /** 登录弹窗（未登录时会弹）。 */
    loginPopup: string;
    /** "没有结果"图（被登录墙挡住时也会出现）。 */
    noJobTip: string;
}
/**
 * 详情页（`/jobdetail/{id}.htm`）的选择器集。同样可 DB 覆盖（ADR-19）。
 *
 * 实测（2026-09-18）：
 *   - JD 全文容器 `.describtion-card__detail-content` 的 `textContent` 即完整描述
 *     （游客 clamp 只是视觉截断 6 行，**不删除 DOM 文本**）；
 *   - 公司标签是 `.company-summary__list` 下的一组 `<li>`，顺序固定为
 *     [融资状态, 规模, 行业]。
 *
 * ⚠️ 详情页未登录时 **DOM 层薪资/地址会掩码**（`**-**元` / `深圳**********`），但
 * `__INITIAL_STATE__.jobDetail.detailedPosition` 里却是真实值 —— 所以薪资/JD 正文等
 * 以载荷为准（见 `extractJobDetailInPage`）。
 */
export interface ZhaopinDetailSelectors {
    /** 职位标题（`H1`）。 */
    title: string;
    /** JD 全文容器（`textContent` 即全文）。 */
    jdText: string;
    /** 公司名。 */
    companyName: string;
    /** 公司标签（`.company-summary__list` 下的 `<li>`，顺序 [融资, 规模, 行业]）。 */
    companyTags: string;
}
/**
 * 会话（IM）页的选择器集。2026-09-18 登录态实测（`i.zhaopin.com/im`）。
 *
 * 数据来源有两条：**接口优先**（`talkListApi`，字段比 DOM 全得多），DOM 只作为
 * "页面确实渲染出来了"的证据（以及 `waitForSelector` 的等待锚点）。
 */
export interface ZhaopinImSelectors {
    /** 会话列表容器（`.im-container` 里那一列）。 */
    listContainer: string;
    /**
     * 单条会话行。实测 class 全清单：`__avatar-wrap/__avatar/__body/__row/__title/__name/
     * __company/__company-name/__sep/__job/__salary/__preview-row/__preview/__preview-text/
     * __time/__badge/__tag/__tag--secondary/__online`（第一屏 11 条）。
     */
    sessionRow: string;
    /**
     * ⚠️ **下面这 6 个键当前没有任何代码读取**（`readInbox` / `detectStage` 走的是接口）。
     * 留着是因为它们是**实测值**，将来要做 DOM 兜底（接口挂了仍能读个大概）时直接用；
     * 但在那之前，改它们不会有任何效果 —— 别把它当成"可调参数"。
     */
    name: string;
    company: string;
    job: string;
    preview: string;
    time: string;
    badge: string;
}
/**
 * 字段 → URL 参数的映射。这一层**无法自动推导**，必须每平台人工建一次（§4.2.2）。
 *
 * 实测依据：线上 `/sou/jl530` 页面的登录表单 URL 原文为
 * `passport.zhaopin.com/org/login?jl=530&kw=&jt=&in=&li=&sc=&el=&we=&et=&ct=&cs=&sl=&p=1`，
 * 以及 `__INITIAL_STATE__.originalUrlParams` 回显 —— 两处都点名 `kw` / `p`。
 *
 * ⚠️ 注意**城市不在 query 里，而在路径段**：`/sou/jl<cityCode>`。
 * 所以这里没有 `cityParam`，只有 `cityPrefix`。
 */
export interface ZhaopinUrlParams {
    /** 基础地址，城市码会拼成 `${base}/jl${code}`。 */
    base: string;
    /** 关键词参数。**只在第 1 页用**（见文件头的 robots 取舍）。 */
    keywordParam: string;
    /** 页码参数（query 兜底形式）。 */
    pageParam: string;
    /** 排序参数。实测 `order=4` 对应「最新发布」。 */
    sortParam: string;
    /** 发布时间窗参数。**平台在搜索 URL 上不提供该维度**，保留键位仅为将来扩展。 */
    postedWithinParam: string;
}
/**
 * 排序取值域。
 *
 * 页面上的排序控件只有三项：**智能匹配 / 薪酬最高 / 最新发布**。
 * 其中只有 `order=4`（最新发布）是**实测**出来的 —— `__INITIAL_STATE__` 的
 * `queryParams` 与 `displayParams` 都回显 `order:4`，且控件高亮「最新发布」。
 * 另外两项的参数值**没有证据，所以不编** —— 编一个错的取值，用户选了不会报错，
 * 只会静默拿到另一种排序，那比缺功能更糟。
 */
export declare const ZHAOPIN_SORT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/** 发布时间窗：智联的搜索 URL 不暴露这个维度，所以值域为空（界面据此禁用并给出原因）。 */
export declare const ZHAOPIN_POSTED_WITHIN_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 单次抓取的页数上限（默认）。
 *
 * 实测：`/sou/jl765` 无关键词时站点自报 `pages:5 / positionCount:100`；
 * 带关键词时同样按 20 条一页。所以默认 5 页足够覆盖一次搜索，
 * 也更保守（§P5 保守优先）。**上限**给 10 页，供用户在方案里显式放宽。
 */
export declare const ZHAOPIN_DEFAULT_MAX_PAGES = 5;
export declare const ZHAOPIN_MAX_PAGES = 10;
/**
 * 城市名 → 平台城市码（`jl`）。
 *
 * 与 51job 那张表**来源完全不同，别混淆**：51job 的城市码是人工从搜索页 URL 里抄的；
 * 这张表是**从智联自己的城市落地页第一方抓出来的** ——
 * 流程是：打开 `https://www.zhaopin.com/<拼音>/`，页面的搜索链接就是 `/sou/jl<code>`。
 * 实测 20 个城市全部命中，且与三份独立开源城市表**逐项一致**（无冲突）。
 *
 * 城市码**无法推导**：`/citymap` 只给拼音 slug，不给数字码。
 * 所以这里只放**已验证过**的城市；未列出的城市请在 DB 覆盖里补
 * （`setting(scope='platform', scope_ref='zhaopin', key='adapter-config')` 的 `cityCodes`）。
 */
export declare const ZHAOPIN_CITY_CODES: Record<string, string>;
/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id（形如 `CC381381910J40896290805`）。 */
export declare const ZHAOPIN_DETAIL_URL_TEMPLATE = "https://www.zhaopin.com/jobdetail/{jobId}.htm";
/** 未登录时薪资被掩码的样子（`/jobs` 老路由上会出现；`/sou/` 上实测是明文）。 */
export declare const ZHAOPIN_SALARY_MASK = "**-**\u5143";
/**
 * 投递入口的选择器集（2026-09-18 登录态实测，`zhaopin-walk-01-detail.html`）。
 *
 * 实测 markup（未投递时）：
 * ```html
 * <div class="summary-planes__right">
 *   <button class="summary-planes__prechat">先聊聊</button>
 *   <div class="summary-planes__action"><button type="button" class="a-button a--bordered a--filled">立即投递</button></div>
 * </div>
 * ```
 * 投递之后**同一个位置**变成「继续沟通」—— 所以判"能不能投"靠**文案**，不能靠"按钮在不在"。
 */
export interface ZhaopinApplySelectors {
    /** 投递按钮的容器（实测 `div.summary-planes__action`；裸 `.a-button` 太泛，会命中页面上别的按钮）。 */
    entry: string;
    /** 投递成功弹窗（实测 `.deliver-greeting-modal`，文案「已向对方发送简历和打招呼语」）。 */
    successModal: string;
    /** 成功弹窗里的结论文案片段 —— 用来确认弹出来的**不是**别的弹窗。 */
    successText: string;
}
export interface ZhaopinConfig {
    selectors: ZhaopinSelectors;
    urlParams: ZhaopinUrlParams;
    cityCodes: Record<string, string>;
    detailUrlTemplate: string;
    /** 详情页选择器（`detail.extract` 用）。 */
    detailSelectors: ZhaopinDetailSelectors;
    /** 会话页地址（求职者端 IM；2026-09-18 实测，点页头「消息」即到）。 */
    imUrl: string;
    /** 会话页选择器（`readInbox` / `detectStage` 的 DOM 侧用）。 */
    imSelectors: ZhaopinImSelectors;
    /**
     * 会话列表接口。
     *
     * 2026-09-18 实测：**只要 Cookie**（`credentials:'include'`）就能拿到数据 ——
     * 观察到的真实请求还带着 `at`/`rt`(query)、`x-zp-client-id`、`x-zp-page-request-id`，
     * 但四个变体（仅 cookie / +client-id / +at,rt / 全都带）**返回完全一样**（200/code 200/11 条），
     * 所以适配器只发最简形式。见 `test/tools/probe-zhaopin-login.ts` 的 `talkListProbe`。
     */
    talkListApi: string;
    /** 会话列表每页条数（实测 `PageSize` 与 `pageSize` **两个参数名都要带**）。 */
    talkListPageSize: number;
    /**
     * 会话列表最多翻几页（默认 3 页 = 60 条会话）。
     *
     * 实测**翻页有效**：页长 5 时第 2 页给出另外 5 条、与第 1 页重叠 0（页长 20 那次第 2 页为空
     * 只是因为该账号只有 11 条会话 —— 单看那次会得出"翻页无效"的错误结论）。
     * 设上限的理由是"一次同步要把这些会话入库"，无上限地翻只会拖慢同步。
     */
    talkListMaxPages: number;
    /** 投递入口/结果弹窗的选择器（`sendResume` 用）。 */
    applySelectors: ZhaopinApplySelectors;
    /**
     * 投递动作的等待上限（ms）：等入口渲染、以及点击后等结果弹窗。
     *
     * 实测一次投递要串 4 个接口（preparation → intercept → application → getPrologue），
     * 加上平台的动画，给 20 秒；等不到就如实报"没确认到"，不重试。
     */
    applyWaitMs: number;
}
export declare const DEFAULT_ZHAOPIN_CONFIG: ZhaopinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeZhaopinConfig(override: unknown): ZhaopinConfig;
/**
 * 构造搜索 URL。
 *
 * 两种形式（见文件头）：
 *   - 第 1 页：`https://www.zhaopin.com/sou/jl765?kw=Java&order=4`
 *   - 第 2 页起：**优先**用站点给的无 query path 形式；这里只能构造 query 兜底，
 *     真正的 path 形式由 `gotoSearch` 从上一页分页区里读出来（`nextPageUrl`）。
 */
export declare function buildZhaopinSearchUrl(config: ZhaopinConfig, criteria: SearchCriteria): string | null;
/**
 * **在页面上下文里**把内嵌的 `__INITIAL_STATE__` 载荷读成紧凑数组。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。
 *
 * ⚠️ 也**绝不能返回整个 state** —— `page.evaluate` 只能回传标量 JSON，
 * 而这个载荷有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 为什么从 `document` 的 script 文本里解析，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 */
/**
 * 载荷解析**必须**留在 `extractJobsInPage` 内部，不能提成模块级函数：
 * 页面函数会被序列化后送进浏览器，闭包不存在，引用任何模块作用域的符号都会
 * `ReferenceError` 并导致整页解析失败（51job 踩过同一个坑）。
 */
/**
 * **在页面上下文里**解析列表页（DOM 为主，内嵌载荷补字段）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量或函数都会变成 `ReferenceError`（51job 真的踩过这个坑，
 * 见 `docs/ADAPTERS.md` §2）。所以**载荷解析与配平全部内联在函数体里** ——
 * 抽成模块级的 `readStateFromPage()` 看着更整洁，但一上真浏览器就整页失败。
 * `test/platform/zhaopin.test.ts` 的「按源码重建」护栏就是钉死这条的。
 *
 * ⚠️ 载荷**绝不能整个返回**：`page.evaluate` 只能回传标量 JSON，
 * 而它在真实页面上有 200 KB+（实测）。所以在这里就裁成需要的字段。
 *
 * 合并策略：`__INITIAL_STATE__.positionList` 与 `.joblist-box__item` **渲染顺序一致**
 * （实测都是 20 条、逐条对得上），按索引配对；DOM 能给的优先用 DOM
 * （它是"页面实际展示了什么"的直接证据），DOM 给不了的（发布时间/行业/公司规模）
 * 用载荷补。
 *
 * 为什么从 `document` 的 script 文本里解析载荷，而不是读 `window.__INITIAL_STATE__`：
 * 实测那段脚本是**裸赋值**（`__INITIAL_STATE__={...}`），是否挂到 `window` 上
 * 取决于打包器的后续处理，而**脚本文本一定在 DOM 里** —— 少依赖一个"打包器行为"。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export declare function extractJobsInPage(config: ZhaopinConfig): RawJob[];
/**
 * **在页面上下文里**解析职位详情页，返回完整 `RawJobDetail`（列表扫码的字段 + `jdText`）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，闭包不存在。只依赖
 * `config`、`document`、`location` —— 任何模块级符号都会 `ReferenceError`。
 *
 * ⚠️ **关键掩码事实（2026-09-18 实测）**：详情页未登录时 **DOM 层薪资/地址被掩码**
 * （`**-**元` / `深圳**********`），但 `__INITIAL_STATE__.jobDetail.detailedPosition` 里
 * 是真实值（`salary: "1-1.1万"`）。所以薪资/JD 正文等**以载荷为准**，DOM 只兜底公司名
 * 这类页面本体就暴露的东西。
 *
 * 载荷字段名（平台自己的，不是 `RawJob` 的）：`positionName`（标题）、`salary`、
 * `positionWorkingExp`、`education`、`description`（JD 纯文本）、`welfareTags`。
 */
export declare function extractJobDetailInPage(config: ZhaopinConfig): RawJobDetail;
/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 验证。
 *
 * 关键取舍：智联**加了筛选参数**时会返回 0 条 + 「登录之后再搜索」而不是报错，
 * 这是典型的**静默失败** —— 会被误读成"没有岗位"。所以这里必须把它识别成
 * `login-required`，让调用方知道是被墙了。
 *
 * 反过来，`/sou/` 的正常结果页**不会**出现登录闸门，所以"有卡片"就足以否定登录墙。
 */
export declare function detectBlockInPage(arg: {
    card: string;
    loginPopup: string;
    noJobTip: string;
    /**
     * **通用词表**（由 `signalsOf(...)` 在宿主侧组装后传进来）。
     *
     * 智联走的是"**共享词表、自有结构**"这条路：验证码选择器 / 限流 / 配额 / blank 阈值
     * 用共享的那一份，但**判断流程仍是它自己的** —— 因为下面那段载荷探针
     * （`__INITIAL_STATE__.positionList` 配平）与 `noJobTip` 的组合判据是它独有的，
     * 硬塞进 `detectBlockWithSignals` 只会让那个共享函数长出一堆平台分支。
     */
    signals: BlockSignalSet;
}): BlockKind | null;
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 只认**结构性信号**，不认文案：实测 `/sou/` 结果页在未登录时会给列表容器和
 * 每张卡片加上 `-unlogin` 修饰类（`positionlist__list-unlogin` /
 * `joblist-box__item-unlogin`），底部还有一个 `positionlist__login-foot`。
 * 这些比"页面上有没有『登录』两个字"稳得多 —— 后者在**正常结果页**上同样成立
 * （右上角一直有登录入口），拿它判断会导致"永远判定为未登录"。
 */
export declare function isLoggedInInPage(_arg: {
    loginPopup: string;
    loginGateText: string;
}): boolean;
/**
 * **在页面上下文里**取下一页的无 query path 地址。
 *
 * 为什么读真实 href 而不是自己拼：站点把关键词编码成了自己的 token
 * （`/sou/jl765/kw01500O80EO062/p2`），明文塞进 path 会被判无效并返回 0 条。
 * 分页区的 href 是**站点自己生成的**，直接用它最稳，也顺带满足 robots（无 query）。
 */
export declare function nextPageUrlInPage(arg: {
    pagination: string;
}): string | null;
/** 站点自报的总页数（用于"别翻过实际页数"）。 */
export declare function totalPagesInPage(): number;
/** 会话行里我们真正用到的字段（**接口字段名是平台自己的**，别照我们的名字去找）。 */
export interface ZhaopinTalkRow {
    sessionid: string;
    peerPartnerId: string;
    staffName: string;
    companyName: string;
    jobTitle: string;
    jobNumber: string;
    text: string;
    unreadCount: number;
    sendTime: number;
    userId: number;
    senderId: number;
    oppositeRead: number;
    oppositeReply: number;
    selfRead: number;
    selfReply: number;
}
/**
 * 会话列表接口地址（某个页号的最简调用形式：**不带** at/rt 与任何自定义头 —— 实测四个变体等价）。
 *
 * ⚠️ `PageSize` 与 `pageSize` **两个参数名都要带**：实测的真实请求里两个都出现了，
 * 而只带一个是否也生效**没单独验证过** —— 一次只读请求多带一个参数没有代价，就不去赌。
 */
export declare function buildTalkListUrl(config: ZhaopinConfig, pageNo: number): string;
/**
 * **在页面上下文里**取会话列表（自包含）。
 *
 * ⚠️ 必须走页面上下文的 `fetch`：那才带着智联的登录 Cookie，与用户自己翻会话走同一条链路。
 * 绝不回退到宿主 Node 的 fetch —— 那等于绕开登录态直连接口，在离线测试里还会**真的打到线上**。
 */
export declare function fetchTalkListInPage(arg: {
    url: string;
}): Promise<{
    ok: boolean;
    status: number;
    code: number | null;
    message: string;
    payload: unknown;
}>;
/** 把接口返回的 `data` 数组收窄成 `ZhaopinTalkRow[]`。结构不符**抛错**（不静默降级）。 */
export declare function talkRowsOf(payload: unknown): ZhaopinTalkRow[];
/**
 * 会话行 → `RawInboxMessage`。
 *
 * 方向判定只有一条判据：**`senderId === userId` ⇒ 最后一条是我发的**。
 * 实测样本（`text:"已发送附件简历"` 那条）两者相等、且那条确实是系统代我发出的。
 * 两个字段缺任何一个都**抛错**而不是猜 —— 猜错会让"我发的话"变成"HR 说的"，
 * 那正是本仓库最不愿意看到的谎（见 §4.2.4）。
 */
export declare function mapTalkRowsToInbox(rows: ZhaopinTalkRow[]): RawInboxMessage[];
/**
 * 会话行 → 接触态。**判不出来返回 null，不猜**。
 *
 * 判据只用**有真实样本**的两个字段（`unreadCount`、`selfReply`）：
 *   * `unreadCount > 0` → `replied`（会话里有 HR 发来的未读 ⇒ 对方回过话）；
 *   * `selfReply > 0` → `delivered`（我这边发过 ⇒ 至少送达过）；
 *   * 其余 → `null`。
 *
 * ## ⚠️ 为什么**不用** `oppositeRead` / `oppositeReply`（2026-09-18 实测否决）
 *
 * 这两个字段按命名看着像"对方已读 / 对方已回"，所以第一版拿它们判 `read` / `replied`。
 * 探针把每行的**值**dump 出来之后否掉了这个假设：第 1 页 11 条会话里
 * `oppositeRead`/`oppositeReply` **全是 0**，**包括那几条有 2 条 / 1 条未读的会话**
 * （未读 = HR 刚发来消息，按命名 `oppositeReply` 本该是 1）。语义与命名不符 →
 * 用它判阶段就会把"HR 已回复"说成"没回复"。**没有样本支撑的字段一律不用。**
 *
 * 代价说清楚：**`read`（HR 已读）这一档在智联判不出来** —— 返回 `null`（契约允许），
 * 上层保留原值。要恢复这一档，得先拿到"已知已读"的会话样本、确认哪个字段真的会变。
 */
export declare function stageOfTalkRow(row: ZhaopinTalkRow): ContactStage | null;
/** 投递入口在"可以投"状态时的文案（实测值；投过之后这里会变成「继续沟通」）。 */
export declare const ZHAOPIN_APPLY_ENTRY_TEXT = "\u7ACB\u5373\u6295\u9012";
/**
 * 投递入口当前是哪句话（自包含）。
 *
 * 为什么只读文案就够：入口容器 `.summary-planes__action` 投递前后**都在**，
 * 变的只是里面那个按钮的文案（「立即投递」→「继续沟通」）—— 判"能不能投"必须靠文案。
 */
export declare function applyEntryStateInPage(arg: {
    selector: string;
}): {
    found: boolean;
    text: string;
};
/**
 * 定位一个**可见**元素的中心坐标（自包含）。只定位、不点击 ——
 * 点击由 host 侧的真鼠标完成（DOM `el.click()` 的 `isTrusted=false` 是最廉价的自动化特征）。
 */
export declare function elementCenterInPage(arg: {
    selector: string;
}): {
    found: boolean;
    x: number;
    y: number;
    text: string;
};
/**
 * 成功弹窗是否**可见且**写着预期那句话（自包含）。
 *
 * 两步都要：只看"元素在不在"会被模板里那个隐藏的弹窗骗到（`.deliver-greeting-modal`
 * 在没投递时也可能存在于 DOM 里），只看文案又会把别的提示当成投递成功。
 */
export declare function applySuccessInPage(arg: {
    selector: string;
    textIncludes: string;
}): {
    visible: boolean;
    text: string;
};
export interface ZhaopinAdapterOptions {
    config?: ZhaopinConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造智联招聘适配器。 */
export declare function createZhaopinAdapter(options?: ZhaopinAdapterOptions): SiteAdapter;
/** 当前页码（从内嵌载荷里读）。 */
export declare function currentPageInPage(): number;
//# sourceMappingURL=zhaopin.d.ts.map