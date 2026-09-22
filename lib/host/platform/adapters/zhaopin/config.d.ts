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
 * 所以 `base` 那一支没有 `cityParam` 可用，只有路径段。
 *
 * ## 两条路由：带筛选的走 `filterBase`（2026-09-21 点击探针实测）
 *
 * 在登录态 `/sou/jl765?kw=Java` 上点一下筛选控件，**站点自己**跳到的地址是
 * `https://www.zhaopin.com/jobs?jl=765&kw=Java&el=4`（学历「本科」）——
 * 城市在这条路由上从路径段变成了 query 参数 `jl`，筛选值用 `el`/`we`/`et`/`ct`
 * 这样的两字母参数名（与上面那条登录表单 URL 的字母表一致）。
 *
 * 所以：**没有筛选时**用 `/sou/jl<码>`（那条路由有真实分页、薪资明文）；
 * **带了任何筛选**时用 `/jobs?jl=<码>&…`（筛选参数只在这条路由上被实测过）。
 * 两条路由适配器本来都要认：登录态请求 `/sou/jl765?kw=Java` 时，服务端会自己
 * 302 到 `/jobs?jl=765&kw=Java`（实测 `finalUrl` 就是它，渲染的是 `.job-card` 那套
 * 标记 —— 见 `selectors.card` 上面那段地雷说明）。
 */
export interface ZhaopinUrlParams {
    /** 无筛选时的基础地址，城市码会拼成 `${base}/jl${code}`。 */
    base: string;
    /**
     * **带筛选**时的基础地址；城市改用 `cityParam` 传。
     *
     * 单独一个键而不是复用 `base`：两条路由的城市编码位置不同（路径段 vs query），
     * 合成一个键就得在函数里猜"现在算哪种情况"，而这是能直接写清楚的事。
     */
    filterBase: string;
    /** 关键词参数。**只在第 1 页用**（见文件头的 robots 取舍）。 */
    keywordParam: string;
    /** 页码参数（query 兜底形式）。 */
    pageParam: string;
    /** 排序参数。实测 `order=4` 对应「最新发布」。 */
    sortParam: string;
    /** 发布时间窗参数。**平台在搜索 URL 上不提供该维度**，保留键位仅为将来扩展。 */
    postedWithinParam: string;
    /** `filterBase` 路由上的城市参数：实测 `jl=765`（深圳）。 */
    cityParam: string;
    /** 学历（**最低学历**语义）：实测点「本科」→ `el=4`。 */
    educationParam: string;
    /** 工作经验：实测点「1-3年」→ `we=0103`。 */
    workExperienceParam: string;
    /** 公司性质：实测点「国企」→ `ct=1`。 */
    companyTypeParam: string;
    /** 职位类型（全职/兼职/实习/校园）：实测点「全职」→ `et=2`。 */
    jobStatusParam: string;
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
 * 四个筛选维度的取值域 —— **全部照抄站点自己那份字典**。
 *
 * 来源：登录态搜索页后台请求 `GET /c/i/search/base/data`，响应 `data` 里有
 * `educationType` / `workExpType` / `companyType` / `jobStatus` 等字典（2026-09-21 实测，
 * 转储见 `test/fixtures/zhaopin-base-data-filters.json` —— 夹具就是那份响应的原样摘录，
 * 单测逐条对账，防止有人手改这些码）。
 *
 * 两条刻意的取舍：
 *   * **不提供「不限」类取值**（`-1` / `-99` / `?`）：语义上等于"不带这个参数"，
 *     收进值域只会让用户选出一个与不选完全等价的选项（界面上的"不填"已经表达了它）。
 *   * 公司性质里的 `6;10`（机关/事业单位）与 `7;14;15`（其他）**不提供**：
 *     它们是**分号拼的多码**，而 `URLSearchParams` 会把 `;` 转义成 `%3B` ——
 *     站点自己怎么发这两个值没有被实测过，宁缺勿编。
 */
export declare const ZHAOPIN_EDUCATION_OPTIONS: Array<{
    value: string;
    label: string;
}>;
export declare const ZHAOPIN_WORK_EXPERIENCE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
export declare const ZHAOPIN_COMPANY_TYPE_OPTIONS: Array<{
    value: string;
    label: string;
}>;
export declare const ZHAOPIN_JOB_STATUS_OPTIONS: Array<{
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
/** 投递入口在"可以投"状态时的文案（实测值；投过之后这里会变成「继续沟通」）。 */
export declare const ZHAOPIN_APPLY_ENTRY_TEXT = "\u7ACB\u5373\u6295\u9012";
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
    /**
     * **点「立即投递」之前**的停留区间（ms）。
     *
     * 这里必须停：`sendResume` 是"一次点击 = 投简历 + 平台替你发一句招呼语"，
     * 而且**不可逆**（见 `platform-facts.ts` 的 `applicationSideEffect`）。
     * 真人在这之前会认真看一遍 JD，绝不会"页面刚渲染完就点下去"。
     * `[0, 0]` = 关闭（离线测试用）。
     */
    dwellBeforeApplyMs: [number, number];
}
export declare const DEFAULT_ZHAOPIN_CONFIG: ZhaopinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeZhaopinConfig(override: unknown): ZhaopinConfig;
/**
 * 智联特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 智联走"共享词表、自有结构"：这里只声明**它比通用词表多的那几条**，
 * 加上它自己的 `blank` 阈值（80，比通用的 120 更严 —— 它的"搜到 0 条"结果页
 * 也有一两百字筛选器文案，120 会把那种页面误判成空白）。
 */
export declare const ZHAOPIN_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly [".geetest_box", "#nc_1_wrapper", ".waf-nc-title", "script[name^=\"aliyunwaf_\"]"];
    readonly blankTextLength: 80;
};
//# sourceMappingURL=config.d.ts.map