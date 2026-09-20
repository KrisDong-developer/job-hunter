/**
 * BOSS 直聘的配置面：选择器集 / 城市码 / 接口参数 / 默认配置与 merge。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import { numberRange } from '../../config-merge.js'

/** 列表页选择器集（BossHunter 生产选择器 + 本项目夹具双重验证）。 */
export interface ZhipinSelectors {
  card: string
  cardBox: string
  /** 职位名链接（标题 + href 三合一）。 */
  jobName: string
  /** 薪资（未登录为空元素）。 */
  salary: string
  /** 「经验 / 学历」标签列表。 */
  tagList: string
  /** 公司名（未登录视图装在 boss-name 里；BossHunter 兜底 company-name）。 */
  company: string
  /** 「城市·区域·地标」文本。 */
  location: string
}

/** 详情页选择器集（2026-09-18 由 `npm run probe:zhipin-chat` 真实登录态快照校准）。 */
export interface ZhipinDetailSelectors {
  title: string
  salary: string
  /**
   * 经验（如「3-5年」）。
   *
   * ⚠️ 2026-09-18 实测：新版把经验/学历从 `.tag-list span` 改成了
   * `.info-primary .text-experiece` / `.text-degree` —— 注意 `experiece` 是**官方自己的拼写**，
   * 不是我们的笔误（快照里就是这么写的）。旧选择器仍在但已命中 0，只留作兜底。
   */
  experience: string
  /** 学历（如「本科」）。 */
  degree: string
  /** 旧版「经验/学历」标签（`.tag-list span`）—— 新页面已消失，仅兜底。 */
  tags: string
  /** 技能标签列表（`.job-keyword-list li`，2026-09-18 实测）。 */
  keywordList: string
  jdText: string
  /**
   * JD 要**排除**的容器。
   *
   * ⚠️ 2026-09-18 实测：页面里有**两个** `.job-sec-text` —— 第二个在
   * `.job-detail-company` 里、且带 `fold-text`，那是「公司介绍」。
   * 直接 `querySelector('.job-sec-text')` 依赖文档顺序，一旦公司介绍排前面就会
   * **把公司简介当成 JD**（写进库、还会被拿去打分）。这里显式排除。
   */
  jdExclude: string
  /** 公司侧栏（旧字段，保留兼容）。 */
  companySider: string
  /** 公司名链接（第一个是 logo 链接、文本为空；取第一个有文本/有 title 的）。 */
  companyLink: string
  /**
   * 公司侧栏的「事实」行（`.sider-company p`：融资阶段 / 规模 / 行业）。
   * 按行内图标类名区分：`.icon-stage` / `.icon-scale` / `.icon-industry`（2026-09-18 实测）。
   */
  companyFacts: string
  /** 旧版规模/行业标签（`.res-industry-item` / `.company-info-item`）—— 仅兜底。 */
  companyTags: string
}

/**
 * 会话/动作选择器集（BossHunter 求职者端 `sender.py` / `monitor.py` 生产实测）。
 */
export interface ZhipinChatSelectors {
  /** 岗位详情页「立即沟通 / 继续沟通」入口候选（逗号列表，命中后按可见性打分）。 */
  chatButton: string
  /** 平台预设招呼语弹窗（点确认即发，文案不由我们控制）。 */
  presetPopup: string
  /** 首次沟通弹窗（内含可编辑招呼语 textarea）。 */
  startchatDialog: string
  /** 首次沟通弹窗里的招呼语输入框。 */
  startchatInput: string
  /** 弹窗「确定」按钮。 */
  dialogConfirm: string
  /** 首次沟通弹窗的提交按钮。 */
  dialogSend: string
  /** 会话输入框（contenteditable，挂 Vue 实例）。 */
  chatInput: string
  /** 发送按钮。 */
  sendButton: string
  /** 消息列表容器。 */
  messageList: string
  /** 「我发出的」消息条目。 */
  myMessage: string
  /** 消息正文节点。 */
  messageText: string
  /** 消息送达/失败状态节点。 */
  messageStatus: string
  /** 工具条「发简历」候选（2026-09-18 实测：求职者端是 `.toolbar-btn`，文案「发简历」）。 */
  resumeButton: string
  /** 工具条按钮「不可用」的类名标记（实测：`unable`）。 */
  resumeButtonDisabledClass: string
  /** 简历选择弹窗。⚠️ 未实测（本次「发简历」不可用，弹窗没打开过）。 */
  resumeDialog: string
  /** 弹窗里的简历条目。⚠️ 未实测。 */
  resumeDialogItem: string
  /** 弹窗确认发送按钮。⚠️ 未实测。 */
  resumeDialogConfirm: string
  /** 会话里已发出的简历卡片（用于校验）。⚠️ 未实测。 */
  resumeCard: string
  /** 本地文件选择器（实测存在，但都属于「上传附件简历」/「发图片」，不是会话内发文件）。 */
  fileInput: string
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
  listContainer: string
  /** 空态节点（实测 `.user-list .no-data`）。 */
  emptyState: string
  /** 筛选 tab 容器（实测 `.label-list`；全部/未读/新招呼/仅沟通 + 更多）。 */
  filterTabs: string
  /** 单个筛选 tab 元素（实测 `.label-list li`，按 `.label-name` 文案匹配）。 */
  tabItem: string
  /** 会话行（候选；容器已实测，行元素待一条真实会话确认）。 */
  row: string
  /** 行内 HR 名（候选，招聘者端来源，**待确认**）。 */
  name: string
  /** 名字容器（第 2 个 span 是公司名，最后一个是 HR 头衔；**待确认**）。 */
  nameBox: string
  /** 最后一条消息（候选，**待确认**）。⚠️ 不要放 `.last-msg`（它是**容器**，文档顺序排在 `.last-msg-text` 之前，会被先选中）。 */
  lastMessage: string
  /** 送达/已读状态（区分方向用，**待确认**）。 */
  status: string
  /** 未读标记（候选，**待确认**）。 */
  unread: string
  /** 时间节点（✅ 2026-09-18 实测存在，就是 `.time`，形如 `00:53`）。 */
  time: string
}

/** 发送后轮询确认送达的节奏。 */
export interface ZhipinDeliveryPoll {
  attempts: number
  intervalMs: number
}

export interface ZhipinConfig {
  selectors: ZhipinSelectors
  detailSelectors: ZhipinDetailSelectors
  chatSelectors: ZhipinChatSelectors
  inboxSelectors: ZhipinInboxSelectors
  urlParams: { base: string; keywordParam: string; cityParam: string }
  /** 求职者端会话页（收件箱与投递都从这里进）。 */
  chatUrl: string
  /**
   * 读收件箱时先切到哪个筛选 tab。
   *
   * 会话页实测有 全部 / 未读 / 新招呼 / 仅沟通 四个 tab（`.label-list`）。
   * 默认 `all`。切到别的 tab 只影响**精度**（少读无关会话）：切不过去时读到的是当前展示的全量
   * —— 那是**超集**，不会漏；所以点不上不会让结果变错，只变慢。
   */
  inboxTab: 'all' | 'unread' | 'newGreet' | 'communicated'
  cityCodes: Record<string, string>
  jobIdPattern: string
  /**
   * 滚动加载时，**每一轮等新卡片出现的上限**（ms）。
   *
   * 为什么进配置：离线夹具是静态 DOM，永远等不到"新卡片"，只能靠超时收手 ——
   * 测试要把它调到几十毫秒，否则每个用例白等十几秒。
   */
  scrollStepTimeoutMs: number
  /**
   * 打招呼前在岗位页「看一会儿」的时长区间（ms）—— BossHunter `browse_before_greet`
   * 的 15–30s 同款。打开岗位页立刻动手是最强的机器信号之一。
   * `[0, 0]` = 关闭（离线测试必须关掉，否则每个用例白等十几秒）。
   */
  dwellBeforeGreetMs: [number, number]
  /**
   * **回复之前**的停留区间（ms）。
   *
   * 比打招呼短得多：这里不是"第一次打开岗位页看一刻钟"，而是"读完对方那条消息再回"。
   * 但**不能是 0** —— 进会话后 0ms 开始打字、打完 0ms 回车，是纯机器节奏。
   * `[0, 0]` = 关闭（离线测试用）。
   */
  dwellBeforeReplyMs: [number, number]
  /**
   * **发简历之前**的停留区间（ms）。
   *
   * 比打招呼更长：`sendResume` 会走到「选中简历 → 确认发送」，是**不可逆**的一步
   * （对方会收到简历卡片）。真人在这之前会认真看一遍。
   * `[0, 0]` = 关闭（离线测试用）。
   */
  dwellBeforeResumeMs: [number, number]
  /** 动作流程里等弹窗/输入框/会话出现的时间上限（ms）。 */
  actionWaitMs: number
  /** 发送后的送达校验轮询（次数 × 间隔）。 */
  deliveryPoll: ZhipinDeliveryPoll
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
  loginSelectors: { loggedIn: string; notLoggedIn: string }
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
  salaryApiEnabled: boolean
  /** joblist 接口路径（相对当前站点）。 */
  joblistApiPath: string
  /** 接口每页条数（实测站点自己就发 15）。 */
  joblistPageSize: number
  /**
   * 最多为补薪资翻几页接口。
   *
   * 为什么要有上限：DOM 滚了 N 屏就有 N×15 张卡，逐页补会把平台流量翻倍。
   * 默认 5 页（= 75 条）覆盖绝大多数场景；超出部分的薪资留空并保留原 note
   * （**如实留空**，不编）。
   */
  joblistMaxPages: number
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
export const ZHIPIN_JOBLIST_API_PATH = '/wapi/zpgeek/search/joblist.json'

/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export const ZHIPIN_CITY_CODES: Record<string, string> = {
  北京: '101010100',
  上海: '101020100',
  广州: '101280100',
  深圳: '101280600',
  杭州: '101210100',
  成都: '101270100',
  南京: '101190100',
  苏州: '101190400',
  天津: '101030100',
  重庆: '101040100',
  武汉: '101200100',
  西安: '101110100',
  长沙: '101250100',
  郑州: '101180100',
  青岛: '101120200',
  合肥: '101220100',
  大连: '101070200',
  东莞: '101281600',
  佛山: '101280800',
  厦门: '101230200',
}

/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export const ZHIPIN_JOB_ID_PATTERN = '/job_detail/([0-9a-zA-Z~_-]+)\\.html'

/** 会话页筛选 tab 的文案（2026-09-18 实测：全部 / 未读 / 新招呼 / 仅沟通）。 */
export const INBOX_TAB_LABELS: Record<ZhipinConfig['inboxTab'], string> = {
  all: '全部',
  unread: '未读',
  newGreet: '新招呼',
  communicated: '仅沟通',
}

/** 求职者端会话页（登录后可见；收件箱与投递入口）。 */
export const ZHIPIN_CHAT_URL = 'https://www.zhipin.com/web/geek/chat'

/** 未登录单页 15 条、无分页区；**登录后也没有 URL 翻页**（`&page=2` 实测无效）→ 1 页。 */
export const ZHIPIN_MAX_PAGES = 1
/** 一屏 15 条；滚动加载每轮再追加一屏（2026-09-18 实测 15→30→…→105）。 */
export const ZHIPIN_PAGE_SIZE = 15
/**
 * 滚动加载轮数上限（= `scrollRounds` 维度的 `max`）。
 *
 * 20 这个数**不是我们定的**：列表接口 `joblist.json` 自报 `totalCount = 300`，
 * 而每轮 15 条 → 平台自己对一个搜索条件封顶 300 条。再多滚也不会给新数据。
 */
export const ZHIPIN_MAX_SCROLL_ROUNDS = 20

export const DEFAULT_ZHIPIN_CONFIG: ZhipinConfig = {
  selectors: {
    card: '.job-card-wrap',
    cardBox: '.job-card-box',
    jobName: '.job-name',
    salary: '.job-salary',
    tagList: '.tag-list li',
    company: '.boss-name, .company-name',
    location: '.company-location',
  },
  detailSelectors: {
    title: '.info-primary .name h1, .name h1',
    salary: '.info-primary .salary, .salary',
    // 2026-09-18 实测：`.text-experiece` 是官方自己的拼写（不是笔误）
    experience: '.info-primary .text-experiece',
    degree: '.info-primary .text-degree',
    // 旧版标签：新页面已命中 0，留作兜底
    tags: '.info-primary .tag-list span',
    keywordList: '.job-keyword-list li',
    jdText: '.job-sec-text',
    // 公司介绍里也有一份 `.job-sec-text`（带 fold-text）——必须排除，否则会把公司简介当 JD
    jdExclude: '.job-detail-company',
    companySider: '.sider-company',
    companyLink: '.sider-company .company-info a',
    companyFacts: '.sider-company p',
    companyTags: '.sider-company .res-industry-item, .company-info-item',
  },
  chatSelectors: {
    /**
     * 「立即沟通 / 继续沟通」入口候选。
     *
     * 2026-09-18 真实登录态详情页实测（两个不同岗位各一次）命中数：
     * `a[redirect-url*="/web/geek/chat"]` 2 · `a[data-url*="/friend/add"]` 2 ·
     * `a.btn-startchat` 2 · `[ka^="go_chat"]` 1 · `[ka*="gochat"]` 1；
     * `[ka="job_detail_chat"]` 0 · `.op-btn-chat` 0（保留作其它版式兜底）。
     * 命中 2 是因为页面顶部与底部各有一个沟通入口。
     *
     * ⚠️ 刻意**不含** `.btn-startchat-wrap`（BossHunter 原候选里有，且给它减分）：
     * 它是**容器 div**，里面才是 `a.btn-startchat`；而逗号选择器返回的是**文档顺序**，
     * 容器总排在链接之前 —— 带上它就会点到容器而不是链接本身。
     */
    chatButton:
      '.btn-startchat, a[redirect-url*="/web/geek/chat"], a[data-url*="/friend/add"], ' +
      '[ka^="go_chat"], [ka*="gochat"], [ka="job_detail_chat"], .op-btn-chat',
    presetPopup: '.greet-boss-pop, .greet-pop',
    startchatDialog: '.dialog-wrap.startchat-dialog',
    startchatInput: 'textarea.input-area, textarea',
    dialogConfirm: '[ka="dialog_confirm"], .btn-sure',
    dialogSend: '.send-message, [ka="dialog_confirm"], .btn-sure, .btn-send',
    /** 会话输入框：✅ 2026-09-18 实测 `div#chat-input.chat-input[contenteditable=true]`。 */
    chatInput: '#chat-input',
    /** 发送按钮：✅ 实测 `button.btn-v2.btn-sure-v2.btn-send`（文案「发送」；空内容时带 `disabled`）。 */
    sendButton: '.btn-send',
    /** 消息列表容器：✅ 实测 `div.chat-record`。 */
    messageList: '.chat-record',
    /** 「我发出的」消息：✅ 实测 `li.message-item.item-myself`。 */
    myMessage: '.message-item.item-myself, .item-myself, [class*="item-my"]',
    /** 消息正文：✅ 实测 `div.message-content`。 */
    messageText: '.message-content, .text, .message-text',
    /** 送达状态：✅ 实测 `i.message-status.status-delivery`，文案形如 `[送达]`。 */
    messageStatus: '.message-status',
    /**
     * 工具条「发简历 / 换电话 / 换微信」。
     *
     * ⚠️ 2026-09-18 实测：求职者端工具条按钮是 **`.toolbar-btn`**（`.operate-btn` /
     * `.operate-icon-item` 是**招聘者端**的，命中 0）。且「发简历」带 `unable`、
     * `aria-label="求简历：双方回复后可用"` —— **对方回复之后才可用**。
     */
    resumeButton: '.toolbar-btn, .toolbar-btn-content .toolbar-btn',
    /** 工具条按钮不可用的类名标记（实测：`unable`）。 */
    resumeButtonDisabledClass: 'unable',
    /**
     * 平台简历选择弹窗。⚠️ **未实测** —— 本次会话里「发简历」是 `unable`（双方未回复），
     * 弹窗根本没机会打开。保留 BossHunter 的类名待下次校准。
     */
    resumeDialog: '.choose-resume-dialog',
    resumeDialogItem: '.choose-resume-dialog .list-item',
    resumeDialogConfirm: '.choose-resume-dialog .btn-confirm',
    /** 会话里已发出的简历卡片（用于校验）。⚠️ 同上，未实测。 */
    resumeCard: '.resume-card, [class*="resume-card"], [class*="resumeCard"]',
    /**
     * 本地文件选择器。
     *
     * ⚠️ 2026-09-18 实测：页面上**确实有** `input[type=file]`，但**都不是"在会话里发本地简历"**：
     *   * `.upload-resume-dialog` 里的那个（accept 含 `.doc/.docx/.pdf`）是
     *     **「上传附件简历」到"我的简历"**（弹窗文案「拖拽文件到这里…上传附件简历」）；
     *   * `.btn-sendimg` 里的那个（accept 只有图片）是**发图片**。
     * 所以 `sendResume(filePath≠null)` **不能**拿它们冒充投递 —— 见该方法里的说明。
     */
    fileInput: 'input[type=file]',
  },
  inboxSelectors: {
    // ✅ 实测（2026-09-18 空列表外壳）：容器与空态都在 `.chat-content .user-list` 里
    listContainer: '.chat-content .user-list',
    emptyState: '.user-list .no-data, .chat-no-data .no-data-text',
    filterTabs: '.label-list',
    tabItem: '.label-list li',
    // ✅ 实测（2026-09-18 真实会话行）：行就是 `li[role=listitem]`，位于
    //    `.user-list > .user-list-content > ul[role=group] > li` —— 注意**不是** `.user-list` 的直接子级。
    //    后面两条是同一元素的结构式/宽松写法，作版式变动时的兜底。
    row: 'li[role=listitem], .user-list-content > ul[role="group"] > li, .chat-content .user-list li',
    // 行内字段：✅ 2026-09-18 全部实测通过（`.name-box` 的 span 依次是 名字 / 公司 / 头衔）
    name: '.name-text, .geek-name, .user-name',
    nameBox: '.name-box, .name-contet',
    lastMessage: '.last-msg-text, .push-text',
    status: '.message-status',
    // ⚠️ 未读标记仍未实测：本次那条会话是我们刚发的（`status-delivery`），没有未读徽章可看
    unread: '.unread-count, .badge-count, .notice-badge, .red-dot, [class*="unread"]',
    // ✅ 实测：时间节点确实存在，就是 `.time`（形如 `00:53`）
    time: '.time, .time-shadow',
  },
  urlParams: {
    base: 'https://www.zhipin.com/web/geek/job',
    keywordParam: 'query',
    cityParam: 'city',
  },
  chatUrl: ZHIPIN_CHAT_URL,
  inboxTab: 'all',
  cityCodes: ZHIPIN_CITY_CODES,
  jobIdPattern: ZHIPIN_JOB_ID_PATTERN,
  // 一轮滚动给站点留 12 秒（实测每轮 1–3 秒就追加完，留足余量但不至于卡死整轮预算）
  scrollStepTimeoutMs: 12_000,
  // BossHunter `browse_before_greet` 同款区间：打开岗位页先"看一会儿"再动手
  dwellBeforeGreetMs: [15_000, 30_000],
  // 会话里回复前的"读完再回"（3–8s）；发简历是不可逆的一步，给得更长（8–16s）
  dwellBeforeReplyMs: [3_000, 8_000],
  dwellBeforeResumeMs: [8_000, 16_000],
  actionWaitMs: 15_000,
  deliveryPoll: { attempts: 12, intervalMs: 500 },
  loginSelectors: {
    // 已登录：页头那个「求职者」下拉（未登录夹具里命中 0，登录态 1）
    loggedIn: 'a[ka="header-username"]',
    // 未登录：页头「登录/注册」按钮（未登录夹具 1，登录态 0）
    notLoggedIn: 'a[ka="header-login"]',
  },
  salaryApiEnabled: true,
  joblistApiPath: ZHIPIN_JOBLIST_API_PATH,
  joblistPageSize: 15,
  joblistMaxPages: 5,
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override: unknown): ZhipinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_ZHIPIN_CONFIG
  const patch = override as Partial<ZhipinConfig>
  const pattern = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  const positive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const poll = (value: unknown, fallback: ZhipinDeliveryPoll): ZhipinDeliveryPoll => {
    if (value === null || typeof value !== 'object') return fallback
    const candidate = value as Partial<ZhipinDeliveryPoll>
    return {
      attempts:
        typeof candidate.attempts === 'number' &&
        Number.isInteger(candidate.attempts) &&
        candidate.attempts > 0
          ? candidate.attempts
          : fallback.attempts,
      intervalMs:
        typeof candidate.intervalMs === 'number' &&
        Number.isFinite(candidate.intervalMs) &&
        candidate.intervalMs >= 0
          ? candidate.intervalMs
          : fallback.intervalMs,
    }
  }
  return {
    selectors: { ...DEFAULT_ZHIPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
    detailSelectors: { ...DEFAULT_ZHIPIN_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
    chatSelectors: { ...DEFAULT_ZHIPIN_CONFIG.chatSelectors, ...(patch.chatSelectors ?? {}) },
    inboxSelectors: { ...DEFAULT_ZHIPIN_CONFIG.inboxSelectors, ...(patch.inboxSelectors ?? {}) },
    urlParams: { ...DEFAULT_ZHIPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
    chatUrl: pattern(patch.chatUrl, DEFAULT_ZHIPIN_CONFIG.chatUrl),
    inboxTab:
      patch.inboxTab === 'unread' || patch.inboxTab === 'newGreet' || patch.inboxTab === 'communicated'
        ? patch.inboxTab
        : DEFAULT_ZHIPIN_CONFIG.inboxTab,
    cityCodes: { ...DEFAULT_ZHIPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
    jobIdPattern: pattern(patch.jobIdPattern, DEFAULT_ZHIPIN_CONFIG.jobIdPattern),
    scrollStepTimeoutMs: positive(
      patch.scrollStepTimeoutMs,
      DEFAULT_ZHIPIN_CONFIG.scrollStepTimeoutMs,
    ),
    dwellBeforeGreetMs: numberRange(patch.dwellBeforeGreetMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeGreetMs),
    dwellBeforeReplyMs: numberRange(patch.dwellBeforeReplyMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeReplyMs),
    dwellBeforeResumeMs: numberRange(patch.dwellBeforeResumeMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeResumeMs),
    actionWaitMs: positive(patch.actionWaitMs, DEFAULT_ZHIPIN_CONFIG.actionWaitMs),
    deliveryPoll: poll(patch.deliveryPoll, DEFAULT_ZHIPIN_CONFIG.deliveryPoll),
    loginSelectors: { ...DEFAULT_ZHIPIN_CONFIG.loginSelectors, ...(patch.loginSelectors ?? {}) },
    salaryApiEnabled:
      typeof patch.salaryApiEnabled === 'boolean' ? patch.salaryApiEnabled : DEFAULT_ZHIPIN_CONFIG.salaryApiEnabled,
    joblistApiPath: pattern(patch.joblistApiPath, DEFAULT_ZHIPIN_CONFIG.joblistApiPath),
    joblistPageSize: positive(patch.joblistPageSize, DEFAULT_ZHIPIN_CONFIG.joblistPageSize),
    joblistMaxPages: positive(patch.joblistMaxPages, DEFAULT_ZHIPIN_CONFIG.joblistMaxPages),
  }
}
