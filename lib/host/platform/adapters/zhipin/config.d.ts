/** 列表页选择器集（BossHunter 生产选择器 + 本项目夹具双重验证）。 */
export interface ZhipinSelectors {
    card: string;
    cardBox: string;
    /** 职位名链接（标题 + href 三合一）。 */
    jobName: string;
    /** 薪资（未登录为空元素）。 */
    salary: string;
    /** 「经验 / 学历」标签列表。 */
    tagList: string;
    /** 公司名（未登录视图装在 boss-name 里；BossHunter 兜底 company-name）。 */
    company: string;
    /** 「城市·区域·地标」文本。 */
    location: string;
}
/** 详情页选择器集（2026-09-18 由 `npm run probe:zhipin-chat` 真实登录态快照校准）。 */
export interface ZhipinDetailSelectors {
    title: string;
    salary: string;
    /**
     * 经验（如「3-5年」）。
     *
     * ⚠️ 2026-09-18 实测：新版把经验/学历从 `.tag-list span` 改成了
     * `.info-primary .text-experiece` / `.text-degree` —— 注意 `experiece` 是**官方自己的拼写**，
     * 不是我们的笔误（快照里就是这么写的）。旧选择器仍在但已命中 0，只留作兜底。
     */
    experience: string;
    /** 学历（如「本科」）。 */
    degree: string;
    /** 旧版「经验/学历」标签（`.tag-list span`）—— 新页面已消失，仅兜底。 */
    tags: string;
    /** 技能标签列表（`.job-keyword-list li`，2026-09-18 实测）。 */
    keywordList: string;
    jdText: string;
    /**
     * JD 要**排除**的容器。
     *
     * ⚠️ 2026-09-18 实测：页面里有**两个** `.job-sec-text` —— 第二个在
     * `.job-detail-company` 里、且带 `fold-text`，那是「公司介绍」。
     * 直接 `querySelector('.job-sec-text')` 依赖文档顺序，一旦公司介绍排前面就会
     * **把公司简介当成 JD**（写进库、还会被拿去打分）。这里显式排除。
     */
    jdExclude: string;
    /** 公司侧栏（旧字段，保留兼容）。 */
    companySider: string;
    /** 公司名链接（第一个是 logo 链接、文本为空；取第一个有文本/有 title 的）。 */
    companyLink: string;
    /**
     * 公司侧栏的「事实」行（`.sider-company p`：融资阶段 / 规模 / 行业）。
     * 按行内图标类名区分：`.icon-stage` / `.icon-scale` / `.icon-industry`（2026-09-18 实测）。
     */
    companyFacts: string;
    /** 旧版规模/行业标签（`.res-industry-item` / `.company-info-item`）—— 仅兜底。 */
    companyTags: string;
}
/**
 * 会话/动作选择器集（BossHunter 求职者端 `sender.py` / `monitor.py` 生产实测）。
 */
export interface ZhipinChatSelectors {
    /** 岗位详情页「立即沟通 / 继续沟通」入口候选（逗号列表，命中后按可见性打分）。 */
    chatButton: string;
    /** 平台预设招呼语弹窗（点确认即发，文案不由我们控制）。 */
    presetPopup: string;
    /** 首次沟通弹窗（内含可编辑招呼语 textarea）。 */
    startchatDialog: string;
    /** 首次沟通弹窗里的招呼语输入框。 */
    startchatInput: string;
    /** 弹窗「确定」按钮。 */
    dialogConfirm: string;
    /** 首次沟通弹窗的提交按钮。 */
    dialogSend: string;
    /** 会话输入框（contenteditable，挂 Vue 实例）。 */
    chatInput: string;
    /** 发送按钮。 */
    sendButton: string;
    /** 消息列表容器。 */
    messageList: string;
    /** 「我发出的」消息条目。 */
    myMessage: string;
    /** 消息正文节点。 */
    messageText: string;
    /** 消息送达/失败状态节点。 */
    messageStatus: string;
    /** 工具条「发简历」候选（2026-09-18 实测：求职者端是 `.toolbar-btn`，文案「发简历」）。 */
    resumeButton: string;
    /** 工具条按钮「不可用」的类名标记（实测：`unable`）。 */
    resumeButtonDisabledClass: string;
    /** 简历选择弹窗。⚠️ 未实测（本次「发简历」不可用，弹窗没打开过）。 */
    resumeDialog: string;
    /** 弹窗里的简历条目。⚠️ 未实测。 */
    resumeDialogItem: string;
    /** 弹窗确认发送按钮。⚠️ 未实测。 */
    resumeDialogConfirm: string;
    /** 会话里已发出的简历卡片（用于校验）。⚠️ 未实测。 */
    resumeCard: string;
    /** 本地文件选择器（实测存在，但都属于「上传附件简历」/「发图片」，不是会话内发文件）。 */
    fileInput: string;
}
/**
 * 收件箱（求职者端会话列表）选择器集。
 *
 * ⚠️ **哪些是实测的、哪些还不是**（2026-09-18 `probe:zhipin-chat` 空列表外壳快照）：
 *   * ✅ **已实测**：列表容器 `.chat-content .user-list`、空态 `.user-list .no-data`；
 *   * ❌ **仍未实测**：行元素本身、以及行内的名字/公司/最后一条/未读 ——
 *     本账号当时**一条会话都没有**（页面自报「30天内暂无联系人」），没有行可看。
 *     所以行选择器先用"容器下的直接子元素（排除空态）"这种**结构式**写法（由实测容器推导，
 *     不是凭空编类名），再挂上招聘者端的类名作兜底。
 *
 * ⚠️ 招聘者端（BossHunter 的取证对象）与求职者端是**两套 DOM**：招聘者端用
 * `.chat-list-wrap` / `.geek-item-wrap` / `.chat-message-filter-left`，求职者端实测
 * `.user-list` / `.label-list` —— 直接用招聘者端的类名会全线命中 0（本次实测确认）。
 */
export interface ZhipinInboxSelectors {
    /** 会话列表容器（实测）。空列表时容器**仍在**，行不在 —— 这是区分"真的空"与"选择器腐烂"的锚点。 */
    listContainer: string;
    /** 空态节点（实测 `.user-list .no-data`）。 */
    emptyState: string;
    /** 筛选 tab 容器（实测 `.label-list`；全部/未读/新招呼/仅沟通 + 更多）。 */
    filterTabs: string;
    /** 单个筛选 tab 元素（实测 `.label-list li`，按 `.label-name` 文案匹配）。 */
    tabItem: string;
    /** 会话行（候选；容器已实测，行元素待一条真实会话确认）。 */
    row: string;
    /** 行内 HR 名（候选，招聘者端来源，**待确认**）。 */
    name: string;
    /** 名字容器（第 2 个 span 是公司名，最后一个是 HR 头衔；**待确认**）。 */
    nameBox: string;
    /** 最后一条消息（候选，**待确认**）。⚠️ 不要放 `.last-msg`（它是**容器**，文档顺序排在 `.last-msg-text` 之前，会被先选中）。 */
    lastMessage: string;
    /** 送达/已读状态（区分方向用，**待确认**）。 */
    status: string;
    /** 未读标记（候选，**待确认**）。 */
    unread: string;
    /** 时间节点（✅ 2026-09-18 实测存在，就是 `.time`，形如 `00:53`）。 */
    time: string;
}
/** 发送后轮询确认送达的节奏。 */
export interface ZhipinDeliveryPoll {
    attempts: number;
    intervalMs: number;
}
export interface ZhipinConfig {
    selectors: ZhipinSelectors;
    detailSelectors: ZhipinDetailSelectors;
    chatSelectors: ZhipinChatSelectors;
    inboxSelectors: ZhipinInboxSelectors;
    urlParams: {
        base: string;
        keywordParam: string;
        cityParam: string;
    };
    /** 求职者端会话页（收件箱与投递都从这里进）。 */
    chatUrl: string;
    /**
     * 读收件箱时先切到哪个筛选 tab。
     *
     * 会话页实测有 全部 / 未读 / 新招呼 / 仅沟通 四个 tab（`.label-list`）。
     * 默认 `all`。切到别的 tab 只影响**精度**（少读无关会话）：切不过去时读到的是当前展示的全量
     * —— 那是**超集**，不会漏；所以点不上不会让结果变错，只变慢。
     */
    inboxTab: 'all' | 'unread' | 'newGreet' | 'communicated';
    cityCodes: Record<string, string>;
    jobIdPattern: string;
    /**
     * 滚动加载时，**每一轮等新卡片出现的上限**（ms）。
     *
     * 为什么进配置：离线夹具是静态 DOM，永远等不到"新卡片"，只能靠超时收手 ——
     * 测试要把它调到几十毫秒，否则每个用例白等十几秒。
     */
    scrollStepTimeoutMs: number;
    /**
     * 打招呼前在岗位页「看一会儿」的时长区间（ms）—— BossHunter `browse_before_greet`
     * 的 15–30s 同款。打开岗位页立刻动手是最强的机器信号之一。
     * `[0, 0]` = 关闭（离线测试必须关掉，否则每个用例白等十几秒）。
     */
    dwellBeforeGreetMs: [number, number];
    /**
     * **回复之前**的停留区间（ms）。
     *
     * 比打招呼短得多：这里不是"第一次打开岗位页看一刻钟"，而是"读完对方那条消息再回"。
     * 但**不能是 0** —— 进会话后 0ms 开始打字、打完 0ms 回车，是纯机器节奏。
     * `[0, 0]` = 关闭（离线测试用）。
     */
    dwellBeforeReplyMs: [number, number];
    /**
     * **发简历之前**的停留区间（ms）。
     *
     * 比打招呼更长：`sendResume` 会走到「选中简历 → 确认发送」，是**不可逆**的一步
     * （对方会收到简历卡片）。真人在这之前会认真看一遍。
     * `[0, 0]` = 关闭（离线测试用）。
     */
    dwellBeforeResumeMs: [number, number];
    /** 动作流程里等弹窗/输入框/会话出现的时间上限（ms）。 */
    actionWaitMs: number;
    /** 发送后的送达校验轮询（次数 × 间隔）。 */
    deliveryPoll: ZhipinDeliveryPoll;
    /**
     * ── 登录态锚点（2026-09-19 定案）───────────────────────────────────
     *
     * 只认**结构性属性**，不认文案。两个锚点都是实测出来的（未登录夹具
     * `zhipin-search.html` vs 真实登录态快照 `zhipin-search-logged-in.html`，
     * 命中数分别 1/0 与 0/1）。
     *
     * ⚠️ 挑锚点时踩过一个**只有"数子串"才会踩**的坑：`.header-login-btn` 在**登录态**页面里
     * 也出现 4 次 —— 全部在 `<style>` 块里的 CSS 规则文本（`#header .header-login-btn{...}`）。
     * 按子串统计会以为"这个类两边都有"，于是选错锚点。**选择器匹配的是元素**，
     * 所以用属性选择器（`a[ka="header-login"]`）就天然避开它。
     */
    loginSelectors: {
        loggedIn: string;
        notLoggedIn: string;
    };
    /**
     * ── 列表薪资的**接口来源**（2026-09-19 实测定案）─────────────────────
     *
     * 为什么必须有这条通道：DOM 里的薪资要么**登录后才出现**、要么出现的是
     * **字体混淆的私有区码点**（见文件头「薪资混淆」）⇒ `salary_raw` 常年为空，
     * 而它是**核心字段**。明文其实就在同一个列表接口里：
     * `POST wapi/zpgeek/search/joblist.json` 的 `zpData.jobList[].salaryDesc`
     * （实测值如 `12-18K`、`13-17K·13薪`），连接键 `encryptJobId ↔ 卡片 href 里的 id`。
     *
     * 适配器的用法是**只补薪资**：岗位列表仍以 DOM 为准（`sourceUrl` 必须来自搜索页
     * 返回的原始 href，绝不重构 URL），接口只按 id 回填空缺的薪资。
     */
    salaryApiEnabled: boolean;
    /** joblist 接口路径（相对当前站点）。 */
    joblistApiPath: string;
    /** 接口每页条数（实测站点自己就发 15）。 */
    joblistPageSize: number;
    /**
     * 最多为补薪资翻几页接口。
     *
     * 为什么要有上限：DOM 滚了 N 屏就有 N×15 张卡，逐页补会把平台流量翻倍。
     * 默认 5 页（= 75 条）覆盖绝大多数场景；超出部分的薪资留空并保留原 note
     * （**如实留空**，不编）。
     */
    joblistMaxPages: number;
}
/**
 * 列表接口（**薪资明文的唯一来源**）—— 2026-09-19 实测它的调用形态：
 * `POST` + 表单体（不是 JSON！），体形如
 * `page=1&pageSize=15&city=101280600&query=Java&…&scene=1`，
 * 响应 `{code:0, zpData:{resCount, hasMore, jobList:[{encryptJobId, salaryDesc, …}]}}`。
 *
 * ⚠️ 顺带纠正一条旧结论：**接口的 `page` 参数是有效的**（实测站点滚动时会依次发
 * page=1,2,3…）。之前"BOSS 只能滚动加载、`&page=2` 无效"说的是**搜索页 URL 上的
 * `page` 参数被 SPA 忽略**，两件事不是一回事 —— 但本适配器的翻页模型没变
 * （`hasNextPage` 仍恒 false、深度仍走 `scrollRounds`），因为**列表仍以 DOM 为准**。
 */
export declare const ZHIPIN_JOBLIST_API_PATH = "/wapi/zpgeek/search/joblist.json";
/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export declare const ZHIPIN_CITY_CODES: Record<string, string>;
/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export declare const ZHIPIN_JOB_ID_PATTERN = "/job_detail/([0-9a-zA-Z~_-]+)\\.html";
/** 会话页筛选 tab 的文案（2026-09-18 实测：全部 / 未读 / 新招呼 / 仅沟通）。 */
export declare const INBOX_TAB_LABELS: Record<ZhipinConfig['inboxTab'], string>;
/** 求职者端会话页（登录后可见；收件箱与投递入口）。 */
export declare const ZHIPIN_CHAT_URL = "https://www.zhipin.com/web/geek/chat";
/** 未登录单页 15 条、无分页区；**登录后也没有 URL 翻页**（`&page=2` 实测无效）→ 1 页。 */
export declare const ZHIPIN_MAX_PAGES = 1;
/** 一屏 15 条；滚动加载每轮再追加一屏（2026-09-18 实测 15→30→…→105）。 */
export declare const ZHIPIN_PAGE_SIZE = 15;
/**
 * 滚动加载轮数上限（= `scrollRounds` 维度的 `max`）。
 *
 * 20 这个数**不是我们定的**：列表接口 `joblist.json` 自报 `totalCount = 300`，
 * 而每轮 15 条 → 平台自己对一个搜索条件封顶 300 条。再多滚也不会给新数据。
 */
export declare const ZHIPIN_MAX_SCROLL_ROUNDS = 20;
export declare const DEFAULT_ZHIPIN_CONFIG: ZhipinConfig;
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export declare function mergeZhipinConfig(override: unknown): ZhipinConfig;
//# sourceMappingURL=config.d.ts.map