/** 51job 列表页的选择器集。**每一项都可以在 UI 里改。** */
export interface FiftyOneSelectors {
    /** 卡片容器。 */
    card: string;
    title: string;
    salary: string;
    area: string;
    tags: string;
    company: string;
    /** 公司行里的「行业 / 性质 / 规模」三个 span。 */
    companyMeta: string;
    /** 承载跟踪载荷的元素（里面有 jobId / 发布时间 / 经验 / 学历）。 */
    tracking: string;
    /** 跟踪载荷所在的属性名。 */
    trackingAttr: string;
}
/**
 * 字段 → URL 参数的映射。这一层**无法自动推导**，必须每平台人工建一次（§4.2.2）。
 *
 * SR-40 追加了"抓取深度"三件套（页数/排序/时间窗）的映射 ——
 * 它们**也**是 URL 参数，所以同样进配置、同样可人工修。
 */
export interface FiftyOneUrlParams {
    base: string;
    keywordParam: string;
    cityParam: string;
    pageParam: string;
    /** 排序方式（`sortType`）。取值域见 `SORT_OPTIONS`。 */
    sortParam: string;
    /** 发布时间窗（`issueDate`），单位=天。 */
    postedWithinParam: string;
    /**
     * 学历 / 工作经验 / 公司性质 —— **2026-09-21 点击探针实测**。
     *
     * 证据：点一次页面的筛选项，站点的搜索历史接口就会回一份
     * `searchKeyValue`，形如 `keyword=Java&searchType=2&jobArea=040000&degree=04&sortType=0&pageNum=1`
     * —— 参数名与取值码都在里面（点「本科」→ `degree=04`）。
     */
    degreeParam: string;
    workYearParam: string;
    companyTypeParam: string;
    /** 公司规模 / 职位类型（同为点击探针实测：点「500-1000人」→ `companySize=04`，点「全职」→ `jobType=01`）。 */
    companySizeParam: string;
    jobTypeParam: string;
}
/**
 * 51job 支持的排序取值域（探针实测 2026-09，搜索页「综合/活跃/最新/薪资/距离」五个按钮）。
 *
 * 取值来自探针逐项点击排序按钮后，读取 API `we.51job.com/api/job/search-pc` 请求里
 * `sortType=` 的实值（并用激活态 `.ss.on` 双重确认）：
 *
 * | 按钮文字 | sortType |
 * |---|---|
 * | 综合排序 | `0` |
 * | 最新优先 | `1` |
 * | 薪资优先 | `3` |
 * | 活跃职位优先 | `5` |
 * | 距离优先 | （未启用，无实值） |
 *
 * ⚠️ **「距离优先」故意不列出**：探针点击后按钮无「on」高亮、也不发请求（疑似依赖
 * 定位/经纬度上下文，当前未启用时点击不生效）。没测出实值就不编 —— 编错了用户选了
 * 只会静默拿到另一种排序（更糟）。所以 `render` 里只有上面四档。
 *
 * **只在声明里出现**：界面据它渲染下拉，校验据它拒绝非法值。
 * 加一项只需要改这里和 `SORT_OPTIONS`。
 */
export declare const SORT_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 发布时间窗取值域（天）。
 *
 * **探针实测：本页面不存在「发布时间」筛选控件**（全文无「24小时/三天/一周/一个月」等文案）。
 * API 虽保留 `issueDate` 参数但恒为空。所以值域为空 —— 界面据此禁用该维度并给出原因，
 * 而不是摆一堆点击后不生效的选项。
 */
export declare const POSTED_WITHIN_OPTIONS: Array<{
    value: string;
    label: string;
}>;
/**
 * 详情页选择器集（`jobs.51job.com/all/<jobId>.html`）。
 *
 * ⚠️ **整组都是候选、没有一条在本仓实测过**（详情页没有夹具；搜索夹具是另一棵 DOM 树）。
 * 老版详情页的经典类名（`.job_msg` 等）在前，新版 we-SPA 风格的结构式候选在后；
 * 锚不到的字段留空 + 记 note（`page/detail.ts`），选择器可经 DB 覆盖修正。
 */
export interface FiftyOneDetailSelectors {
    /** 职位名（候选；`document.title` 另有兜底）。 */
    title: string;
    salary: string;
    /** 「经验 / 学历」标签行（按内容特征分流到 expReq / eduReq）。 */
    tags: string;
    /** JD 正文（**取候选链里第一个有文本的**）。 */
    jdText: string;
    company: string;
    /** 公司「行业 / 性质 / 规模」三段（与列表侧 `.bc .dc` 同一去处）。 */
    companyMeta: string;
}
/**
 * 沟通面选择器集（动作链用：打招呼入口 / 投递弹窗 / 会话消息）。
 *
 * 证据分层（逐条注明）：
 *   * ✅ **实测**（真实夹具 `51job-sz.html`，2026-09-21 摘录）：
 *     卡片「去聊聊」`.chat` + 未登录扫码弹层 `.chat-popover`（`.hr-name` / `.hr-position` /
 *     `.hr-tip`「微信扫码与我聊聊吧」/ `.qrcode`）；投递按钮 `button.btn.apply`
 *     （trace-name="申请职位-职位下"）；投递弹窗组件样式 `.apply-component-resume-dialog`
 *     （`.pc-apply-resume__row` / `__select--resume` 逐条渲染）、提示形态
 *     `.apply-component-hint-dialog`、成功提示 `.success_title`；
 *   * ⚠️ **候选待校准**（登录态会话 DOM 未实测）：`chatInput` / `sendButton` /
 *     `messageList` / `myMessage` / `messageText` / `messageStatus`。
 */
export interface FiftyOneChatSelectors {
    /** 「去聊聊 / 立即沟通」入口（✅ 实测 `.chat`；详情页形态为候选）。 */
    chatButton: string;
    /** 未登录视图的微信扫码弹层（✅ 实测 `.chat-popover`）。在场 = 没有可输入面。 */
    chatQrPopover: string;
    /** 弹层文案（✅ 实测 `.hr-tip`，如「微信扫码与我聊聊吧」）。 */
    chatQrTip: string;
    /** 弹层里的二维码（✅ 实测 `.qrcode`）。 */
    chatQrCode: string;
    /** 弹层里的 HR 名（✅ 实测 `.hr-name`）。 */
    hrName: string;
    /** 弹层里的 HR 头衔（✅ 实测 `.hr-position`）。 */
    hrPosition: string;
    /** 站内会话输入框（⚠️ 候选：登录态形态未实测）。 */
    chatInput: string;
    /** 发送按钮（⚠️ 候选）。 */
    sendButton: string;
    /** 消息列表容器（⚠️ 候选）。 */
    messageList: string;
    /** 「我发出的」消息条目（⚠️ 候选）。 */
    myMessage: string;
    /** 消息正文节点（⚠️ 候选）。 */
    messageText: string;
    /** 消息送达/失败状态节点（⚠️ 候选）。 */
    messageStatus: string;
    /** 「投递」按钮（✅ 实测 `button.btn.apply`，trace-name^="申请职位"）。 */
    applyButton: string;
    /** 投递（选择简历）弹窗（✅ 组件样式实测 `.apply-component-resume-dialog`）。 */
    applyDialog: string;
    /** 弹窗里的简历条目行（✅ 样式证据 `.pc-apply-resume__row`）。 */
    applyResumeRow: string;
    /** 弹窗里的简历选择控件（✅ 样式证据 `.pc-apply-resume__select--resume`）。 */
    applyResumeSelect: string;
    /** 弹窗确认按钮（✅ 容器样式证据 + Element Plus 惯例）。 */
    applyDialogConfirm: string;
    /** 投递提示形态弹窗（✅ 样式证据 `.apply-component-hint-dialog`，如「今日投递太多」）。 */
    applyHintDialog: string;
    /** 投递成功提示（✅ 样式证据 `.success_title`；Element Plus toast 兜底）。 */
    applySuccess: string;
}
/**
 * 收件箱（会话列表）选择器集。
 *
 * ⚠️ **整组候选待校准**：51job 消息页没有夹具、没有探针记录。结构按 zhipin 求职者端
 * 会话列表的同一套写（容器 → 行 → 行内字段），配齐 DB 覆盖即可在真机校准后点亮。
 */
export interface FiftyOneInboxSelectors {
    /** 会话列表容器。空列表时容器**仍在** —— 这是区分"真的空"与"选择器腐烂"的锚点。 */
    listContainer: string;
    /** 空态节点。 */
    emptyState: string;
    /** 会话行。 */
    row: string;
    /** 行内 HR 名。 */
    name: string;
    /** 行内公司名。 */
    company: string;
    /** 最后一条消息。 */
    lastMessage: string;
    /** 送达/已读状态节点（**节点在 ⇒ 最后一条是我发的**）。 */
    status: string;
    /** 未读标记。 */
    unread: string;
    /** 时间节点（相对时间，原样带出）。 */
    time: string;
}
/** 发送后轮询确认送达的节奏。 */
export interface FiftyOneDeliveryPoll {
    attempts: number;
    intervalMs: number;
}
/** 页数上限：再大也不会更"全"，只会更容易触发风控。 */
export declare const FIFTYONE_MAX_PAGES = 5;
export interface FiftyOneConfig {
    selectors: FiftyOneSelectors;
    detailSelectors: FiftyOneDetailSelectors;
    chatSelectors: FiftyOneChatSelectors;
    inboxSelectors: FiftyOneInboxSelectors;
    urlParams: FiftyOneUrlParams;
    /** 城市名 → 平台城市码。 */
    cityCodes: Record<string, string>;
    /** 详情页 URL 模板，`{jobId}` 会被替换。 */
    detailUrlTemplate: string;
    /**
     * 求职者侧消息页（收件箱动作的入口）。
     *
     * ⚠️ **候选地址、未实测**：搜索页（未登录）不暴露消息入口。真机走查（2026-09-21）
     * 实测消息入口**不在页头**，在「我的51job」（we.51job.com/pc/my/myjob）—— 具体
     * 消息页地址以 `npm run probe:51job`（FIFTYONE_LOGIN=1，从 myjob 收割消息链接并采样）
     * 的采证为准，经 DB 覆盖修正，不必发版。
     */
    chatUrl: string;
    /**
     * ── 登录态锚点 ──────────────────────────────────────────
     *
     * 未登录锚点 ✅ 实测（夹具 `51job-sz.html`：页头 `.login.loginBtnClick`「登录/注册」）；
     * 已登录锚点 ⚠️ 候选（登录态夹具缺位）。判不出来时按"未登录"处理（保守）。
     */
    loginSelectors: {
        loggedIn: string;
        notLoggedIn: string;
    };
    /** 动作流程里等弹窗/输入框/会话出现的时间上限（ms）。 */
    actionWaitMs: number;
    /** 发送后的送达校验轮询（次数 × 间隔）。 */
    deliveryPoll: FiftyOneDeliveryPoll;
    /** 打招呼前在岗位页「看一会儿」的时长区间（ms）；`[0, 0]` = 关闭（离线测试用）。 */
    dwellBeforeGreetMs: [number, number];
    /** **回复之前**的停留区间（ms）；语义是"读完对方那条再回"。`[0, 0]` = 关闭。 */
    dwellBeforeReplyMs: [number, number];
    /** **投递之前**的停留区间（ms）；投递是不可逆动作，给得最长。`[0, 0]` = 关闭。 */
    dwellBeforeApplyMs: [number, number];
}
export declare const DEFAULT_FIFTYONE_CONFIG: FiftyOneConfig;
/**
 * 把 DB 里的覆盖合并到默认配置上。
 *
 * 选择器分组走通用 `mergeAdapterConfig`（分组浅合并 + 空串保护）；
 * **形状敏感的字段**（轮询对象 / 停留区间）单独校验 —— 一份写坏的 DB 覆盖
 * （`deliveryPoll: {attempts: 0}`、`dwell: [8000, 1000]`）会让动作链静默变成
 * "永不轮询 / 停留恒 0ms"，那正是校验要拦的形态。
 */
export declare function mergeFiftyOneConfig(override: unknown): FiftyOneConfig;
/**
 * 51job 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 两条必须显式带上，否则会**悄悄改变行为**：
 *   * 阿里云 WAF 滑块：`waf-nc-title` 文案 + `aliyunwaf_` 脚本名（get_jobs 实战特征）；
 *   * 登录墙用的是**很宽的词**（`登录|注册|扫码`），而不是通用词表里那几个完整短语 ——
 *     收紧成"扫码登录"这类短语会让一条"登录后继续"的墙**判不出来**，
 *     而 `auth.isLoggedIn` 正是靠 `block !== 'login-required'` 反推的：
 *     判不出来就会报告"已登录"，然后安静地抓到 0 条（正是本项目一直在修的那类静默失败）；
 *   * `loginTextLength` 放到极大 = **保留**它原本"没有长度上限"的语义。
 *     通用词表的 800 上限是为了防"导航栏里有『登录』但没卡片"的误判，
 *     那是个**收紧**，应当作为独立改动 + 独立断言来做，不能混在迁移里。
 */
export declare const FIFTYONE_BLOCK_SIGNALS: {
    readonly captchaSelectors: readonly [".waf-nc-title", "script[name^=\"aliyunwaf_\"]"];
    readonly loginText: readonly ["登录", "注册", "扫码"];
    readonly loginTextLength: 1000000;
    readonly blankTextLength: 80;
};
//# sourceMappingURL=config.d.ts.map