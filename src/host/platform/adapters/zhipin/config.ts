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
  /**
   * JD 正文里要**剔掉**的平台水印字串（不是选择器，是清洗规则 —— 放这里是为了**可被 DB 覆盖**：
   * 平台换字串时不必发版，改 `detailSelectors.jdWatermarkTexts` 即可）。
   *
   * 为什么要它（2026-09-20 实测）：BOSS 把品牌字串做成**随机类名**的 `<span>` 塞进 JD 正文的
   * 任意位置，真实原文形如
   * `<span class="TkBBeZbHdGjN">BOSS直聘</span>岗位职责<br>1. 参与后<span class="pyKakWzEQwNK">来自BOSS直聘</span>端业务系统…`
   * ⇒ 直接取 `textContent` 会得到「…参与后来自BOSS直聘端业务系统…」，**把「后端业务系统」从中间劈开**，
   * 还会在开头多一段品牌串。JD 是要**写库并喂给打分/技能差距分析**的，脏文本一路带下去。
   *
   * ⚠️ 匹配口径：元素的（去空白）**全文恰好等于**名单里某一项才算水印 —— 整棵子树跳过。
   * 不用 `includes`：JD 里正常出现的「BOSS直聘」如果是**短语的一部分**，不该被删。
   * ⚠️ 类名每次随机（实测两种），所以**只能按文本判**，按类名一律匹配不到。
   */
  jdWatermarkTexts: readonly string[]
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
  /**
   * 简历选择弹窗里的**空态提示**（2026-09-20 实测：`.resume-top-tip`，
   * 文案形如「未上传简历」＋一个 `.btn-upload`「去上传」）。
   *
   * 为什么要读它：「弹窗里没有可选项」有两种原因，要做的事完全不同 ——
   *   * 空态（本账号就是这种）：**简历库里没有附件简历**，得先去「我的简历」上传；
   *   * 有条目但我没选中。
   * 不读提示就只能含糊地说"平台里可能还没有可用简历"，用户不知道下一步做什么。
   */
  resumeDialogEmptyTip: string
  /**
   * 简历选择弹窗（2026-09-20 实测打开过，`resume-dialog-2026-09-20.html`）。
   *
   * 结构（实测原文）：
   * ```
   * div.boss-popup__wrapper.boss-dialog…choose-resume-dialog   ← 弹窗外壳（也带这个类）
   *   div.boss-popup__content
   *     div.boss-dialog__header > h3 「请选择要发送的简历」
   *     div.boss-dialog__body
   *       div.choose-resume-dialog                              ← 内层业务容器（同类名）
   *         div.resume-choose-container                         ← 简历条目容器
   *           div.resume-top-tip（空态：「未上传简历」+ .btn-upload「去上传」）
   *         div.footer
   *           div.manage-btn 「管理附件」
   *           button.btn-v2.btn-sure-v2.btn-confirm 「发送」      ← 未选简历时带 disabled
   *   div.boss-popup__close > i.icon-close
   * ```
   * ⚠️ `.choose-resume-dialog` 实测命中 **2 个**节点（外壳 + 内层容器），两个都带这个类。
   *   判"弹窗开没开"够用；但**取条目/按钮必须带后代关系**（见下面两条）。
   */
  resumeDialog: string
  /**
   * 弹窗里的简历条目。⚠️ **条目本身的类名仍未实测**。
   *
   * 实测到的是**容器** `.resume-choose-container`（2026-09-20）；条目为空的原因是账号里
   * 根本没有附件简历（弹窗实测渲染的是空态 `.resume-top-tip`「未上传简历 / 去上传」）。
   * 所以这份候选里：第一条是实测容器 + BossHunter 的 `.list-item`，第二条是同一容器的
   * **结构式**候选（容器下非空态的直接子元素），由实测结构推导，不是凭空编的类名。
   */
  resumeDialogItem: string
  /**
   * 弹窗确认发送按钮 —— **2026-09-20 实测**：`button.btn-v2.btn-sure-v2.btn-confirm`（文案「发送」）。
   *
   * ⚠️ 未选中简历时它带 `disabled` 类**且**带 `disabled` 属性 ⇒ 点了什么都不会发生。
   * 这正是 `sendResume` 必须先读按钮状态的原因：不读就会把"弹窗还在那儿"误报成
   * 「已确认发送但没看到简历卡片（pending）」—— 那是在说一件没发生的事。
   */
  resumeDialogConfirm: string
  /** 会话里已发出的简历卡片（用于校验）。⚠️ 未实测。 */
  resumeCard: string
  /** 本地文件选择器（实测存在，但都属于「上传附件简历」/「发图片」，不是会话内发文件）。 */
  fileInput: string
}

/**
 * 收件箱（求职者端会话列表）选择器集。
 *
 * 📌 **2026-09-20 二次实测（账号有 2 条会话，其中一条是 HR 主动发来的未读会话）
 *    后，本节已无「未实测」项**：
 *   * ✅ 列表容器 `.chat-content .user-list`、筛选 tab `.label-list`、空态 `.user-list .no-data` /
 *     `.chat-no-data .no-data-text`（09-18 空列表外壳实测）；
 *   * ✅ 行元素 `li[role=listitem]`、行内 `.name-text` / `.name-box`（span 依次是 名字/公司/头衔）
 *     / `.last-msg-text` / `.message-status` / `.time`（09-18 真实会话实测）；
 *   * ✅ **未读徽章 = `.notice-badge`**（09-20 实测：HR 主动发来的那行有它，文本就是未读数
 *     `1`；同时**没有** `.message-status` —— 说明那条最后一句是 HR 说的，方向判据吻合）；
 *   * ✅ **`.message-status status-read`（文案 `[已读]`）**（09-20 实测：我发的那条被读了）。
 *     至此 `delivered` 与 `read` 两档都有真实样本 —— `detectStageInPage` 里那条分支
 *     不再是"代码支持但没样本"。
 *
 * ⚠️ 招聘者端（BossHunter 的取证对象）与求职者端是**两套 DOM**：招聘者端用
 * `.chat-list-wrap` / `.geek-item-wrap` / `.chat-message-filter-left`，求职者端实测
 * `.user-list` / `.label-list` —— 直接用招聘者端的类名会全线命中 0（已实测确认）。
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
  /** 会话行（✅ 实测 `li[role=listitem]`；后两条是同元素的结构式兜底）。 */
  row: string
  /** 行内 HR 名（✅ 实测 `.name-text`）。 */
  name: string
  /** 名字容器（✅ 实测 `.name-box`，span 依次是 名字 / 公司 / 头衔）。 */
  nameBox: string
  /** 最后一条消息（✅ 实测 `.last-msg-text`）。⚠️ 不要放 `.last-msg`（它是**容器**，文档顺序排在 `.last-msg-text` 之前，会被先选中）。 */
  lastMessage: string
  /** 送达/已读状态（✅ 实测 `.message-status`；**节点在 ⇒ 最后一条是我发的**）。 */
  status: string
  /** 未读标记（✅ 2026-09-20 实测 `.notice-badge`，文本就是未读数；其余为兜底候选）。 */
  unread: string
  /** 时间节点（✅ 实测 `.time`，形如 `00:53` / `昨天`）。 */
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
/**
 * `scrollRounds` 的缺省值（方案里没配时）。
 *
 * 2026-09-20 起从 1 提到 3（≈45 条/轮采集）：第一屏 15 条对"尽量多拉"太少，
 * 而 3 轮的请求密度仍在提示语建议的 2–4 安全区内（BOSS antiBot=high，
 * 缺省就该保守，拉满 20 轮要显式配置）。
 */
export const ZHIPIN_DEFAULT_SCROLL_ROUNDS = 3

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
    // 2026-09-20 实测注入串：JD 容器里见到 `BOSS直聘` 与 `来自BOSS直聘`；同一页的
    // 「职位描述」h3 与「举报」链接里还见到 `直聘` —— 同一套串随机落点，三种都列上。
    jdWatermarkTexts: ['BOSS直聘', '来自BOSS直聘', '直聘'],
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
     *
     * 📌 2026-09-20 补实测的两件事：
     *   * 真实嵌套是 `.toolbar-btn-content`（**外层容器**）→ `.toolbar-btn`（**可点的那层**，
     *     带埋点属性 `d-c="62009"`）⇒ 只需 `.toolbar-btn` 一条，原先那条
     *     `.toolbar-btn-content .toolbar-btn` 不可能多命中任何东西，已删；
     *   * 实测 `.toolbar-btn` 命中 3 个（发简历 / 换电话 / 换微信），所以**必须按文案筛**
     *     （`toolbarButtonStateInPage` 的 `textIncludes`）—— 否则会点到「换微信」。
     *   * HR 回复后 `unable` 消失、真鼠标点它**确实打开了** `.choose-resume-dialog` ⇒
     *     这条链路（选择器 + 点击方式）端到端验证过。
     */
    resumeButton: '.toolbar-btn',
    /** 工具条按钮不可用的类名标记（实测：`unable`）。 */
    resumeButtonDisabledClass: 'unable',
    /**
     * 平台简历选择弹窗。⚠️ **实测打开过**（2026-09-20，账号收到 HR 回复后「发简历」才可用）——
     * 真实结构与选择器见 `ZhipinChatSelectors.resumeDialog` 的注释。
     */
    resumeDialog: '.choose-resume-dialog',
    // 条目类名仍未实测（账号没有附件简历，弹窗只有空态）——容器已实测，结构式候选由它推导
    resumeDialogItem:
      '.resume-choose-container .list-item, .choose-resume-dialog .list-item, ' +
      '.resume-choose-container > *:not(.resume-top-tip)',
    // ✅ 2026-09-20 实测：`button.btn-v2.btn-sure-v2.btn-confirm`（文案「发送」）
    resumeDialogConfirm: '.choose-resume-dialog .btn-confirm, .choose-resume-dialog .btn-sure-v2',
    // ✅ 2026-09-20 实测空态：「未上传简历」+ `.btn-upload`「去上传」
    resumeDialogEmptyTip: '.resume-top-tip',
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
    // ✅ 2026-09-20 实测：未读徽章是 `.notice-badge`（文本就是未读数，如 `1`）。
    //    放在最前 —— 它是唯一实测过的那个；后面的候选全是兜底（`.unread-count` 只在
    //    离线合成夹具里出现过，从未在真实页面上命中）。
    unread: '.notice-badge, .unread-count, .badge-count, .red-dot, [class*="unread"]',
    // ✅ 实测：时间节点确实存在，就是 `.time`（形如 `00:53` / `昨天`）+ 同款阴影节点
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
  /**
   * JD 水印名单：只留非空字符串。
   *
   * 为什么要在**合并边界**校验：这个字段是数组，而 `detailSelectors` 是**浅合并**的
   * （不逐键校验）—— 一份写错的 DB 覆盖（比如 `jdWatermarkTexts: "BOSS直聘"` 给成字符串、
   * 或塞进 null）会让页面上下文里的 `for…of` 抛错，**整页详情解析全挂**。
   * 显式给空数组 = 不剔水印（这是个有意义的开关，不要用 fallback 把它吃掉）。
   */
  const watermarkTexts = (value: unknown, fallback: readonly string[]): readonly string[] => {
    if (!Array.isArray(value)) return fallback
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  }
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
    detailSelectors: {
      ...DEFAULT_ZHIPIN_CONFIG.detailSelectors,
      ...(patch.detailSelectors ?? {}),
      jdWatermarkTexts: watermarkTexts(
        patch.detailSelectors?.jdWatermarkTexts,
        DEFAULT_ZHIPIN_CONFIG.detailSelectors.jdWatermarkTexts,
      ),
    },
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
