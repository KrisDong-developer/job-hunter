/**
 * BOSS 直聘（zhipin.com）适配器 —— 2026-09-18 由 probe:zhipin 真实夹具校准。
 *
 * ## 环境一致性（D-17a）
 *
 * 与猎聘同一套三件套：patchright 启动式 + 系统 Chrome + stealth 注入。
 * BOSS 的 CDP 检测强度低于猎聘（§7.1：BossHunter 用 CDP attach 日常 Chrome
 * 都能跑完整流程），本探针实测 patchright 启动式未登录即可见列表。
 *
 * ## 未登录形态（2026-09-18 夹具实测，很重要）
 *
 * * **列表可见但薪资隐藏**：`.job-salary` 元素存在但为空 —— 所以本适配器的
 *   `requiredFields` **不含 salary_raw**（否则每条记录都被字段断言隔离），
 *   `fieldCompleteness: 'medium'` 如实声明；登录后薪资可见，届时再升级；
 * * `.boss-name` 装的是**公司名**（未登录视图；BossHunter 选择器
 *   `.boss-name || .company-name` 正是为此）；
 * * 无分页区（`hasNextPage` 恒 false，单页 15 条）；登录后有标准分页，待登录夹具补；
 * * 岗位链接 `/job_detail/<加密id>.html`，**未登录不带 securityId** ——
 *   BossHunter 站点规则"详情 URL 必须带完整 securityId"是**已登录**场景；
 *   本适配器只存原始 href（绝不重构 URL），详情抓取（detail.extract）需登录态
 *   才真正可用。
 * * 访问会被 `_security_check` 参数重定向一次（正常现象，不是风控墙）。
 *
 * ## 登录形态与翻页契约（2026-09-18 `npm run probe:zhipin-login` 实测，证据见
 *    `test/fixtures/zhipin-pagination-report.json` 与 `zhipin-search-api.json`）
 *
 * 登录之后有三件事和未登录视图**不一样**，逐条实测过：
 *
 *   * **薪资可见**：15/15 张卡片 `.job-salary` 有文本（未登录时元素在、文本空）；
 *   * **仍然没有页码分页区**，且 `&page=2` **无效**：SPA 忽略该参数。
 *     所以 `hasNextPage` 恒 false 不是"还没实现"，而是**平台事实**；
 *   * **翻页只有滚动加载**：滚动到底部自动追加，每轮 +15 条。列表接口
 *     `wapi/zpgeek/search/joblist.json` 自报 `totalCount = 300` ——
 *     即平台对这个搜索条件**封顶 300 条 = 20 轮**，这就是 `scrollRounds` 上限的来源。
 *
 * 搜索页 URL 实测会被重定向：`/web/geek/job` → `/web/geek/jobs`（两条都通，我们照旧用前者）。
 *
 * ⚠️ `requiredFields` 为什么仍然不含 `salary_raw`：适配器在**登录态与未登录态之间是同一个
 *   实例**，而登录态会静默过期。把薪资列进必需字段，会在某次会话失效后把**整页**记录
 *   打成待修复（`pending_repair`），等于用一次登录过期换掉一整轮数据。
 *
 * ⚠️ **2026-09-18 新发现的开放问题：登录态下列表薪资数字也不在 DOM 文本里。**
 *   真实登录态夹具与本次实测都显示卡片是 `<span class="job-salary">-K·薪</span>` ——
 *   数字（如 `12-20`、`13`）**完全不在 textContent 里**；页面里没有 `@font-face`、
 *   没有 `content:"数字"`、也没有带数字的 `aria-label`/`title`。
 *   即 `salaryRaw` 现在会记成 `-K·薪`（`salaryMin/Max` 因此恒为 null）。
 *   相关副作用：`zhipin.test.ts` 里那句「薪资可见率 100%」的判据只是"元素文本非空"，
 *   而 `-K·薪` 也是非空 —— **那个断言目前是误导性的**，别拿它当"薪资可用"的证据。
 *   下一步要查的是数字到底由什么渲染（内联 SVG 的 `<path>`？运行时注入的 CSSOM 规则？
 *   独立的接口字段？）。查到之前，列表薪资一律按"**不可信**"对待。
 *
 * ## 详情页：选择器与解析（2026-09-18 由**本仓真实登录态快照**校准）
 *
 * 先说结论：BossHunter（`shengjidaguai-china/BossHunter` 的 `collection/platforms/boss.py`）
 * 给的那套详情选择器**已经有两处腐烂**，第一次真机实测（`npm run probe:zhipin-chat`，
 * 深圳·Java 岗）逐条对过：
 *
 *   * 标题 `.info-primary .name h1` → `.name h1` → `document.title.split('-')[0]`：**仍有效**；
 *   * 薪资 `.info-primary .salary` → `.salary`：**仍有效**（登录态可见，如「14-15K」）；
 *   * 经验/学历 `.info-primary .tag-list span`：**命中 0，已改名** ——
 *     现行是 `.text-experiece` / `.text-degree`（`experiece` 是**官方自己的拼写**，不是笔误）；
 *   * JD 全文 `.job-sec-text`：**有效但危险** —— 页面上有**两个**：一个是职位描述，
 *     另一个在 `.job-detail-company` 里、带 `fold-text`，那是**公司介绍**。
 *     直接取第一个靠的是文档顺序，顺序一变就会把公司简介当 JD 写进库 → 本适配器**显式排除**该容器；
 *   * 公司名 `.sider-company .company-info a`：**仍有效**（第一个是 logo 链接、文本为空，
 *     取第一个有文本的即可；另以 `title` 属性兜底）；
 *   * 规模/行业 `.res-industry-item, .company-info-item`：**命中 0，已改名** ——
 *     现行是 `.sider-company p` 三行，靠行内图标类名区分：
 *     `i.icon-stage`→融资阶段、`i.icon-scale`→规模、`i.icon-industry`→行业。
 *     ⚠️ 不能沿用"文本里有没有「人」"的猜法：侧栏第一行是标题「公司基本信息」，
 *     猜法会把它当成行业。
 *   * 另外白捡一个：技能标签 `ul.job-keyword-list li`（Java/SpringCloud/MySQL…），
 *     填进 `RawJobDetail.tags`。
 *
 * `requiredFields` 不变：详情失败的兜底是"这条岗位的 jdText 留空"，由 crawl 侧按条降级。
 *
 * ## 打招呼 / 收件箱 / 附件投递（选择器来自 BossHunter 求职者端生产代码）
 *
 * BOSS 的**求职者端**（本适配器的对象）与招聘者端是两套 DOM。本节选择器取自
 * BossHunter 的 `executor/sender.py` 与 `executor/monitor.py`（求职者端生产实测）：
 *
 *   * **沟通入口**（岗位详情页）候选序列：`a[redirect-url*="/web/geek/chat"]`、
 *     `a[data-url*="/friend/add"]`、`a.btn-startchat`、`[ka="job_detail_chat"]`、
 *     `.op-btn-chat`、`.btn-startchat-wrap` —— 命中后按候选顺序取**第一个可见**的元素
 *     （BossHunter 还会按"是否在视口/是否最上层"打分，这里先做简化版；候选顺序已表达优先级）；
 *   * **首次沟通弹窗**：`.dialog-wrap.startchat-dialog` + `textarea.input-area`（要自己填话术），
 *     提交按钮 `.send-message / [ka="dialog_confirm"] / .btn-sure / .btn-send`；
 *   * **预设招呼语弹窗**：`.greet-boss-pop / .greet-pop`（平台自带文案，点确认即发，
 *     **发出去的不是本次生成的话术** —— 这一点必须在返回值里讲清楚）；
 *   * **会话页** `https://www.zhipin.com/web/geek/chat`：输入框 `#chat-input`（contenteditable，
 *     挂 Vue 实例）、发送按钮 `.btn-send`、消息列表 `.chat-record`；
 *   * **送达校验**：`.chat-record .message-item.item-myself` 里出现同文本即已进会话；
 *     `.message-status` 的 `status-loading` / `status-error` 分别对应「发送中 / 发送失败」
 *     （BossHunter `_message_delivery_state` 同款判据）；
 *   * **收件箱**：⚠️ 2026-09-18 空列表实测推翻了"照抄招聘者端"的做法 ——
 *     BossHunter 的 `li[role=listitem]` / `.chat-message-filter-left` 是**招聘者端**类名，
 *     求职者端实测是 `.chat-content .user-list`（容器）+ `.label-list`（筛选 tab）+
 *     `.user-list .no-data`（空态）。容器与空态已实测；**行元素与行内字段仍待一条真实会话确认**
 *     （当时账号一条会话都没有），所以行选择器先用"容器下直接子元素（排除空态）"这种结构式写法。
 *     `readInbox` 现在**先等容器**：容器在而列表空 = 可信的 0 条；**容器都找不到就抛错**，
 *     绝不把"选择器腐烂"混成"今天没人回我"。
 *   * **附件简历**（2026-09-18 真实会话实测**修正**了先前基于 BossHunter 的判断）：
 *     会话里**没有"把本地文件发给 HR"的入口**。页面上确实有 `input[type=file]`，但只有两个，
 *     都不是投递：`.upload-resume-dialog` 里的是「上传附件简历」**到你自己简历库**，
 *     `.btn-sendimg` 里的是**发图片**。而工具条「发简历」按钮是 `.toolbar-btn`（求职者端类名，
 *     `.operate-btn` 是招聘者端的），**未回复时带 `unable` + `aria-label` 写着"双方回复后可用"** ——
 *     即 BOSS 要求**双方回复之后**才能发简历。所以 `sendResume`：本地文件一律 fail-closed（如实说明），
 *     `filePath=null` 时先读按钮状态，`unable` 就如实告诉用户"等对方回复"，**绝不点一个点不动的按钮**。
 *     尚未实测：平台简历选择弹窗 `.choose-resume-dialog`（本次按钮不可用，弹窗没机会打开）。
 *
 * ⚠️ 按 §7 的站点规则：打招呼**必须**走 `platform/humanize.ts` 的 CDP Input 级点击与逐字符输入，
 *   绝不用 DOM `el.click()` / `fill`（`isTrusted=false` 是最廉价的自动化特征）。
 *   因此 `sayHello` / `sendResume` 在没有 `page.mouse` / `page.keyboard` 时 **fail-closed**。
 *
 * ## 本仓实测入口（用于日后校准选择器）
 *
 * `npm run probe:zhipin-chat` —— 会话页 + 岗位详情页的**登录态只读探针**：不发消息、不投递。
 * 产物落 `.probe-zhipin-capture/`（`.probe*` 已 gitignore，**刻意不写 `test/fixtures/`**）：
 * `chat-list-<日期>.html` / `chat-conversation-<日期>.html` / `detail-<日期>.html` /
 * `chat-report-<日期>.json`（逐选择器命中数 + 会话行子节点样本 + 工具条文案）。
 * 报告里 `count: 0` 的字段就是已经腐烂的那条选择器。`ZHIPIN_PROBE_SKIP_CHAT=1` 只采详情页。
 *
 * ⚠️ 已知的站点门槛（2026-09-18 实测）：**资料未完善**的账号访问 `/web/geek/*` 会被
 * **强制重定向**到简历完善引导页 `/web/geek/guide`，会话页因此打不开。
 * 探针在这种状态下**不关窗口**：把窗口留给人操作、每 30 秒重试会话页，填完自动继续采集
 * （用 `ZHIPIN_WAIT_MIN=25` 给它足够时间），只有等待窗口耗尽才放弃并记 `chatBlocked`。
 *
 * 仍**只有 BossHunter 证据、本仓未实测**的点（别假装是实测的）：
 *   * 平台简历选择弹窗 `.choose-resume-dialog`（本次「发简历」不可用，弹窗没机会打开）；
 *   * 会话行的**未读徽章**（本次那条会话是我们刚发的，没有未读可看）；
 *   * 首次沟通弹窗 `.dialog-wrap.startchat-dialog` 与预设招呼语弹窗 `.greet-boss-pop`
 *     （本次点「立即沟通」走的是"直接进会话"路径，两种弹窗都没出现）。
 *
 * ✅ 已于 2026-09-18 实测确认（会话级）：`#chat-input`（`div.chat-input[contenteditable]`）、
 *   `.btn-send`、`.chat-record`、`li.message-item.item-myself`、`div.message-content`、
 *   `i.message-status.status-delivery`、会话行 `li[role=listitem]` 及其 `.time` / `.name-text` /
 *   `.name-box` / `.last-msg-text` —— 这些**不必再怀疑**。
 */
import type { BlockKind, ContactStage, CoreField } from '../../../shared/enums.js'
import { humanClick, humanType } from '../humanize.js'
import { humanDelayMs } from '../pacing.js'
import { platformFacts } from '../platform-facts.js'
import { detectBlockWithSignals, signalsOf } from '../block-signals.js'
import { platformCriterion } from '../types.js'
import type {
  ActionResult,
  CriteriaDimension,
  PageLike,
  RawInboxMessage,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../types.js'

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
  /** 动作流程里等弹窗/输入框/会话出现的时间上限（ms）。 */
  actionWaitMs: number
  /** 发送后的送达校验轮询（次数 × 间隔）。 */
  deliveryPoll: ZhipinDeliveryPoll
}

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
const INBOX_TAB_LABELS: Record<ZhipinConfig['inboxTab'], string> = {
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
  actionWaitMs: 15_000,
  deliveryPoll: { attempts: 12, intervalMs: 500 },
}

/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override: unknown): ZhipinConfig {
  if (override === null || typeof override !== 'object') return DEFAULT_ZHIPIN_CONFIG
  const patch = override as Partial<ZhipinConfig>
  const pattern = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value !== '' ? value : fallback
  const positive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  const range = (value: unknown, fallback: [number, number]): [number, number] => {
    if (!Array.isArray(value) || value.length < 2) return fallback
    const [min, max] = value
    if (
      typeof min !== 'number' ||
      typeof max !== 'number' ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min < 0 ||
      max < min
    ) {
      return fallback
    }
    return [min, max]
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
    dwellBeforeGreetMs: range(patch.dwellBeforeGreetMs, DEFAULT_ZHIPIN_CONFIG.dwellBeforeGreetMs),
    actionWaitMs: positive(patch.actionWaitMs, DEFAULT_ZHIPIN_CONFIG.actionWaitMs),
    deliveryPoll: poll(patch.deliveryPoll, DEFAULT_ZHIPIN_CONFIG.deliveryPoll),
  }
}

/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export function buildZhipinSearchUrl(config: ZhipinConfig, criteria: SearchCriteria): string | null {
  const params = new URLSearchParams()
  if (criteria.keyword !== undefined && criteria.keyword !== '') {
    params.set(config.urlParams.keywordParam, criteria.keyword)
  }
  if (criteria.city !== undefined && criteria.city !== '') {
    const code = config.cityCodes[criteria.city]
    if (code === undefined) return null
    params.set(config.urlParams.cityParam, code)
  }
  const query = params.toString()
  return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`
}

/**
 * **在页面上下文里**滚动加载：滚到底 → 等新卡片出现 → 重复。
 *
 * 为什么需要它：BOSS 的搜索结果**没有可寻址的第 N 页**（`&page=2` 实测无效），
 * 唯一的翻页手段就是滚动触发的懒加载。所以"抓得更深"只能在一次页面加载之内做厚。
 *
 * 两个刻意的收手条件：
 *   * 某一轮**没有新增卡片**就停（平台封顶 300 条时就是这个表现，再滚也是白滚）；
 *   * 每轮只等到 `stepTimeoutMs` —— 站点不响应时不能让整轮预算被一个页面吃干。
 *
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export async function scrollToLoadInPage(arg: {
  card: string
  rounds: number
  stepTimeoutMs: number
}): Promise<number> {
  const count = (): number => {
    try {
      return document.querySelectorAll(arg.card).length
    } catch {
      return 0
    }
  }
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    })

  let loaded = count()
  for (let round = 0; round < arg.rounds; round += 1) {
    try {
      window.scrollTo(0, document.body.scrollHeight)
    } catch {
      /* 离线夹具没有滚动（静态 DOM），靠下面的超时收手 */
    }
    const deadline = Date.now() + arg.stepTimeoutMs
    let grew = false
    while (Date.now() < deadline) {
      await sleep(400)
      const current = count()
      if (current > loaded) {
        loaded = current
        grew = true
        break
      }
    }
    if (!grew) break
  }
  return loaded
}

/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export function extractJobsInPage(arg: {
  selectors: ZhipinSelectors
  jobIdPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    return out
  }
  if (cards === null) return out
  let idRe: RegExp | null = null
  try {
    idRe = new RegExp(arg.jobIdPattern)
  } catch {
    idRe = null
  }

  for (const card of Array.from(cards)) {
    let box: Element = card
    try {
      box = card.querySelector(arg.selectors.cardBox) ?? card
    } catch {
      box = card
    }

    let nameEl: Element | null = null
    try {
      nameEl = box.querySelector(arg.selectors.jobName)
    } catch {
      nameEl = null
    }
    if (nameEl === null) continue
    const href = nameEl.getAttribute('href') ?? ''
    if (href === '') continue
    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 原样给，字段断言会兜 */
    }

    const title = (nameEl.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    // 未登录薪资隐藏：元素在、文本空 —— 留空（requiredFields 不含 salary_raw）。
    let salaryRaw = ''
    try {
      salaryRaw = (box.querySelector(arg.selectors.salary)?.textContent ?? '').replace(/\s+/g, '').trim()
    } catch {
      salaryRaw = ''
    }

    // tag-list 固定顺序：经验 / 学历（夹具实测）。
    let expReq = ''
    let eduReq = ''
    try {
      const tags = Array.from(box.querySelectorAll(arg.selectors.tagList))
        .map((tag) => (tag.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((text) => text !== '')
      expReq = tags[0] ?? ''
      eduReq = tags[1] ?? ''
    } catch {
      /* 留空 */
    }

    let company = ''
    try {
      company = (box.querySelector(arg.selectors.company)?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      company = ''
    }

    // 「城市·区域·地标」→ city / district（夹具实测如「深圳·福田区·车公庙」）。
    let city = ''
    let district = ''
    try {
      const locationText = (box.querySelector(arg.selectors.location)?.textContent ?? '')
        .replace(/\s+/g, '')
        .trim()
      const parts = locationText.split('·')
      city = parts[0] ?? ''
      district = parts[1] ?? ''
    } catch {
      /* 留空 */
    }

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobIdPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('未登录视图薪资隐藏（登录后可升级）')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(district === '' ? {} : { district }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析详情页（2026-09-18 由真实登录态快照 `probe:zhipin-chat` 校准）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 *
 * 快照实证的真实结构（深圳·Java 岗，2026-09-18）：
 *
 *   div.job-primary.detail-box
 *     └ div.info-primary
 *         ├ .name h1（标题） / .salary（薪资）
 *         └ p → a.text-city（城市，未解析：地址以列表那条为准）+ span.text-experiece（经验）
 *              + span.text-degree（学历）
 *   div.detail-content-header h3（「职位描述」）
 *   ul.job-keyword-list li（技能标签）
 *   div.job-sec-text（**JD 正文**）
 *   div.job-detail-section.job-detail-company
 *     └ div.job-sec-text.fold-text（**公司介绍** —— 必须排除，否则会把公司简介当成 JD）
 *   div.sider-company
 *     ├ .company-info a（第一个是 logo 链接、文本空；第二个才是公司名）
 *     └ p × 3：i.icon-stage（融资阶段）/ i.icon-scale（规模）/ i.icon-industry（行业）
 */
export function extractDetailInPage(arg: { selectors: ZhipinDetailSelectors }): RawJobDetail {
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryOne = (selector: string): Element | null => {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }
  const queryAll = (selector: string): Element[] => {
    try {
      return Array.from(document.querySelectorAll(selector))
    } catch {
      return []
    }
  }
  const inside = (el: Element, selector: string): boolean => {
    if (selector === '') return false
    try {
      return el.closest(selector) !== null
    } catch {
      return false
    }
  }

  // 标题：`.info-primary .name h1` → `.name h1` → 文档标题去后缀（兜底链）
  let title = textOf(queryOne(arg.selectors.title))
  if (title === '') {
    const documentTitle = clean(document.title)
    const head = documentTitle.split('-')[0]
    title = head === undefined ? '' : clean(head)
  }
  const salaryRaw = textOf(queryOne(arg.selectors.salary)).replace(/\s+/g, '')

  // 经验/学历：新版走 `.text-experiece` / `.text-degree`；旧版 `.tag-list span` 按顺序兜底
  let expReq = textOf(queryOne(arg.selectors.experience))
  let eduReq = textOf(queryOne(arg.selectors.degree))
  if (expReq === '' || eduReq === '') {
    const legacyTags = queryAll(arg.selectors.tags)
      .map((tag) => clean(tag.textContent))
      .filter((text) => text !== '')
    if (expReq === '') expReq = legacyTags[0] ?? ''
    if (eduReq === '') eduReq = legacyTags[1] ?? ''
  }

  // 技能标签（`.job-keyword-list li`）
  const keywords = queryAll(arg.selectors.keywordList)
    .map((node) => clean(node.textContent))
    .filter((text) => text !== '')

  // JD 正文：跳过「公司介绍」区块（那里有第二份 `.job-sec-text`）
  let jdText = ''
  for (const node of queryAll(arg.selectors.jdText)) {
    if (inside(node, arg.selectors.jdExclude)) continue
    const text = textOf(node)
    if (text !== '') {
      jdText = text
      break
    }
  }

  // 公司名：跳过 logo 链接（文本为空），取第一个有文本的；再兜底 a 的 title，最后用文档标题
  let company = ''
  for (const link of queryAll(arg.selectors.companyLink)) {
    const text = clean(link.textContent)
    if (text !== '' && !text.includes('http')) {
      company = text
      break
    }
    if (company === '') {
      const attrTitle = clean(link.getAttribute('title'))
      if (attrTitle !== '') company = attrTitle
    }
  }
  if (company === '') {
    const match = /_(.+?)招聘/.exec(clean(document.title))
    company = match === null ? '' : clean(match[1])
  }

  // 公司侧栏事实行：**按行内图标类名**区分（`.icon-scale` / `.icon-industry` / `.icon-stage`）——
  // 不能用"文本里有没有『人』"去猜：侧栏第一行是标题「公司基本信息」，猜法会把它当成行业。
  let companySize = ''
  let industry = ''
  let companyNature = ''
  for (const line of queryAll(arg.selectors.companyFacts)) {
    const text = clean(line.textContent)
    if (text === '') continue
    if (line.querySelector('.icon-scale') !== null) companySize = text
    else if (line.querySelector('.icon-industry') !== null) industry = text
    else if (line.querySelector('.icon-stage') !== null) companyNature = text
  }
  // 旧版标签兜底（`.res-industry-item` / `.company-info-item`）
  if (companySize === '' || industry === '') {
    for (const tag of queryAll(arg.selectors.companyTags)) {
      const text = clean(tag.textContent)
      if (text === '') continue
      if (companySize === '' && text.includes('人')) companySize = text
      else if (industry === '') industry = text
    }
  }

  const notes: string[] = []
  if (jdText === '') notes.push('JD 未锚定（job-sec-text 待校准）')
  if (title === '') notes.push('详情标题未锚定，待校准')
  if (company === '') notes.push('详情公司名未锚定，待校准')
  if (salaryRaw === '') notes.push('详情薪资未锚定，待校准')
  if (expReq === '' && eduReq === '') notes.push('经验/学历未锚定（text-experiece / text-degree 待校准）')

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company,
    // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
    sourceUrl: location.href,
    ...(expReq === '' ? {} : { expReq }),
    ...(eduReq === '' ? {} : { eduReq }),
    ...(keywords.length === 0 ? {} : { tags: keywords }),
    ...(industry === '' ? {} : { industry }),
    ...(companySize === '' ? {} : { companySize }),
    ...(companyNature === '' ? {} : { companyNature }),
    ...(jdText === '' ? {} : { jdText }),
    ...(notes.length === 0 ? {} : { notes }),
  }
}

/** 页面上下文的元素定位结果（拟人点击的坐标来源 + 跳转线索）。 */
export interface ZhipinElementInfo {
  found: boolean
  x: number
  y: number
  text: string
  /**
   * 元素自带的跳转线索（`redirect-url` / `data-url` / `href`）。
   *
   * BOSS 的「立即沟通」按钮带 `redirect-url="/web/geek/chat/..."`。当点击**没能让
   * 当前页跳转**时（例如按钮 `target=_blank` 另开了标签页，而我们的 PageLike 只看得到
   * 当前页），用这个地址让当前页自己导航过去 —— BossHunter `_navigate_to_chat_redirect`
   * 就是为这个坑写的。
   */
  href: string
}

/**
 * **在页面上下文里**找一个"可点元素"并返回其视口中心坐标。
 *
 * 规则：只统计**可见**（有尺寸且没被 display/visibility/pointer-events 关掉）的元素；
 * `textIncludes` 非空时再按文本过滤；取**第一个命中的**。
 *
 * ⚠️ 逗号选择器返回的是**文档顺序**，不是候选优先级 —— 所以候选里只能放**同类可点元素**
 * （别放容器 div：容器总排在里面的链接之前，会被先选中）。
 * 2026-09-18 实测因此把 `.btn-startchat-wrap` 从候选里剔除，见 `chatButton` 的注释。
 *
 * ⚠️ 必须完全自包含。`scrollIntoView` 在离线夹具里不存在，故整段 try/catch。
 */
export function elementCenterInPage(arg: {
  selector: string
  textIncludes?: string
}): ZhipinElementInfo {
  const empty: ZhipinElementInfo = { found: false, x: 0, y: 0, text: '', href: '' }
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selector))
  } catch {
    return empty
  }
  const wanted = norm(arg.textIncludes)
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      // ⚠️ 必须写成 `window.getComputedStyle`：本函数会被序列化送进页面执行，
      // 裸 `getComputedStyle` 只有浏览器全局有；离线夹具（jsdom）里只挂了 `window`。
      const style = window.getComputedStyle(el)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none'
      )
    } catch {
      return false
    }
  }
  const chosen = nodes.find(
    (el) => visible(el) && (wanted === '' || norm(el.textContent).includes(wanted)),
  )
  if (chosen === undefined) return empty
  try {
    chosen.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* 离线夹具没有布局引擎 */
  }
  let rect: { x: number; y: number; width: number; height: number }
  try {
    rect = chosen.getBoundingClientRect()
  } catch {
    return empty
  }
  const viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 1024
  const viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 768
  const x = Math.min(Math.max(rect.x + rect.width / 2, 0), Math.max(0, viewportWidth - 1))
  const y = Math.min(Math.max(rect.y + rect.height / 2, 0), Math.max(0, viewportHeight - 1))
  const href =
    chosen.getAttribute('redirect-url') ?? chosen.getAttribute('data-url') ?? chosen.getAttribute('href') ?? ''
  return { found: true, x, y, text: norm(chosen.textContent).slice(0, 120), href }
}

/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export function hasSelectorInPage(arg: { selector: string }): boolean {
  try {
    return document.querySelector(arg.selector) !== null
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**读一个工具条按钮的状态（能不能点、为什么不能）。
 *
 * 需要它是因为 2026-09-18 实测：BOSS 的工具条按钮**用 CSS 类 + aria-label 表达"当前不可用"** ——
 * 「发简历」带 `unable`、`aria-label="求简历：双方回复后可用"`；直接点它什么也不会发生，
 * 而"点了没反应"最容易被误读成"投递成功了"。这里把不可用**读出来**再决定。
 * ⚠️ 必须完全自包含。
 */
export function toolbarButtonStateInPage(arg: {
  selector: string
  textIncludes: string
  disabledClass: string
}): { found: boolean; disabled: boolean; reason: string } {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selector))
  } catch {
    return { found: false, disabled: false, reason: '' }
  }
  const wanted = norm(arg.textIncludes)
  const target = nodes.find((el) => wanted === '' || norm(el.textContent).includes(wanted))
  if (target === undefined) return { found: false, disabled: false, reason: '' }
  const className = (target.getAttribute('class') ?? '').toLowerCase()
  const ariaLabel = norm(target.getAttribute('aria-label'))
  const marked =
    arg.disabledClass !== '' && className.split(/\s+/).includes(arg.disabledClass.toLowerCase())
  return {
    found: true,
    disabled: marked,
    reason: marked ? ariaLabel || `带 ${arg.disabledClass} 标记（平台当前不可用）` : ariaLabel,
  }
}

/** **在页面上下文里**识别首次沟通的两种弹窗。⚠️ 必须完全自包含。 */
export function detectGreetPopupInPage(arg: {
  selectors: ZhipinChatSelectors
}): { kind: 'preset' | 'startchat' | 'none' } {
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return (
        rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      )
    } catch {
      return false
    }
  }
  try {
    const preset = Array.from(document.querySelectorAll(arg.selectors.presetPopup)).some((el) =>
      visible(el),
    )
    if (preset) return { kind: 'preset' }
    for (const dialog of Array.from(document.querySelectorAll(arg.selectors.startchatDialog))) {
      if (!visible(dialog)) continue
      if (dialog.querySelector(arg.selectors.startchatInput) !== null) return { kind: 'startchat' }
    }
  } catch {
    /* 选择器非法 → none */
  }
  return { kind: 'none' }
}

/**
 * **在页面上下文里**读会话消息，判断"我们发的那条"到了哪一步。
 *
 * 判据取自 BossHunter `_message_delivery_state`：
 *   * 消息文本比对前先去掉零宽字符与「发送中/已读/未读/送达」这类尾标；
 *   * `.message-status` 带 `status-error` → 发送失败；`status-loading` → 发送中；
 *     其余视为已送达。
 * 找不到对应消息 → `missing`（**绝不能**把"没看到"当成"已送达"）。
 *
 * ⚠️ 必须完全自包含。
 */
export function readChatMessagesInPage(arg: {
  selectors: ZhipinChatSelectors
  expectText: string
}): { state: 'delivered' | 'pending' | 'failed' | 'missing' } {
  const norm = (value: string | null | undefined): string =>
    (value ?? '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  const stripTail = (value: string): string =>
    norm(value)
      .replace(/(发送中|已读|未读|送达|发送成功|重试|重新发送)$/g, '')
      .trim()
  const expected = norm(arg.expectText)
  if (expected === '') return { state: 'missing' }

  let list: Element | null = null
  try {
    list = document.querySelector(arg.selectors.messageList)
  } catch {
    list = null
  }
  if (list === null) return { state: 'missing' }

  let nodes: Element[] = []
  try {
    nodes = Array.from(list.querySelectorAll(arg.selectors.myMessage))
  } catch {
    nodes = []
  }
  const states: Array<'delivered' | 'pending' | 'failed'> = []
  for (const node of nodes) {
    let text = ''
    try {
      const content = node.querySelector(arg.selectors.messageText)
      text = stripTail(content === null ? node.textContent : content.textContent)
    } catch {
      text = ''
    }
    if (text === '' || !text.includes(expected)) continue
    let statusClass = ''
    try {
      statusClass = node.querySelector(arg.selectors.messageStatus)?.getAttribute('class') ?? ''
    } catch {
      statusClass = ''
    }
    states.push(
      statusClass.includes('error') ? 'failed' : statusClass.includes('loading') ? 'pending' : 'delivered',
    )
  }
  if (states.length === 0) return { state: 'missing' }
  if (states.includes('delivered')) return { state: 'delivered' }
  if (states.includes('pending')) return { state: 'pending' }
  return { state: 'failed' }
}

/**
 * **在页面上下文里**解析收件箱（求职者端会话列表）。
 *
 * 结构（BossHunter `JS_EXTRACT_CHAT_LIST` 实测）：
 *   li[role=listitem]
 *     ├ .name-box                              ← 名字容器
 *     │    ├ span[0] = HR 名
 *     │    ├ span[1] = 公司名
 *     │    └ span[last] = HR 头衔
 *     ├ .name-text                             ← HR 名（独立节点，更稳）
 *     ├ .last-msg-text                         ← 最后一条消息
 *     └ .message-status                        ← 方向线索（status-read/status-delivery 是"我发的"）
 *
 * `direction`：`RawInboxMessage` 只有 `hr | me` 两档。分不清时**按 hr 记**
 * —— 收件箱的用途是"有没有人回我"，漏报比误报贵（BossHunter 同样把不确定行
 * 当作候选回复来处理）。
 *
 * ⚠️ 必须完全自包含。
 */
export function readInboxInPage(arg: { selectors: ZhipinInboxSelectors }): RawInboxMessage[] {
  const out: RawInboxMessage[] = []
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

  // ① 容器必须先找到。找不到就是"选择器腐烂 / 当前不是求职者端会话页"——
  //    这里**抛错**而不是返回 []：空数组会被上层读成"今天没人回我"，
  //    那正是 `syncInbox` 反复强调不许发生的事（0 条必须可信）。
  let container: Element | null = null
  if (arg.selectors.listContainer !== '') {
    try {
      container = document.querySelector(arg.selectors.listContainer)
    } catch {
      container = null
    }
    if (container === null) {
      throw new Error(
        `会话列表容器未找到（${arg.selectors.listContainer}）—— 选择器可能已腐烂，或当前页面不是求职者端会话页`,
      )
    }
    // ② 空态：容器在 + 页面自报"暂无联系人" → 这才是**可信的 0 条**，如实返回空数组
    try {
      if (arg.selectors.emptyState !== '' && container.querySelector(arg.selectors.emptyState) !== null) {
        return out
      }
    } catch {
      /* 选择器非法 → 继续按行解析 */
    }
    try {
      const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, '')
      if (bodyText.includes('暂无联系人') || bodyText.includes('暂无沟通')) return out
    } catch {
      /* ignore */
    }
  }

  let rows: Element[] = []
  try {
    rows = Array.from(document.querySelectorAll(arg.selectors.row))
  } catch {
    return out
  }

  rows.forEach((row, index) => {
    let name = ''
    try {
      name = norm(row.querySelector(arg.selectors.name)?.textContent)
    } catch {
      name = ''
    }
    if (name === '') return

    let company = ''
    try {
      // ⚠️ 必须**先取容器再取 span**，不能拼 `${nameBox} span`：
      //    nameBox 是逗号候选列表，拼出来会变成 `.name-box, .name-contet span` ——
      //    逗号优先级最低，`.name-box`（容器本身）也会被选中，spans[1] 就取错了。
      const nameBox = row.querySelector(arg.selectors.nameBox)
      const spans = nameBox === null ? [] : Array.from(nameBox.querySelectorAll('span'))
      const second = spans[1]
      company = second === undefined ? '' : norm(second.textContent)
    } catch {
      company = ''
    }

    let lastMessage = ''
    let lastClass = ''
    try {
      const node = row.querySelector(arg.selectors.lastMessage)
      lastMessage = norm(node?.textContent)
      lastClass = (node?.getAttribute('class') ?? '').toLowerCase()
    } catch {
      lastMessage = ''
    }

    let statusClass = ''
    try {
      statusClass = (row.querySelector(arg.selectors.status)?.getAttribute('class') ?? '').toLowerCase()
    } catch {
      statusClass = ''
    }
    // 判据一（主）：`.message-status` 这个节点**只出现在我们发出的消息上**（文案形如 `[送达]` / `[已读]`），
    //   所以只要节点在，方向就是"我发的" —— 不要求认得出具体状态类名。
    //   曾经这里靠类名（`status-read` / `status-delivery`）判定：平台改一次类名，整行方向就读反了
    //   （HR 的会话被记成"我发的"，并在本地写出一条假消息）。`detectStageInPage` 用的是
    //   "节点在即我发的" —— 两处必须一致，否则同一行会被读成两种方向。
    // 判据二（兜底）：类名里带 myself / self / …（旧版式与离线夹具）。
    const isOurs = statusClass !== '' || /(myself|self|mine|outgoing|send)/.test(lastClass)

    let unread = false
    try {
      unread = row.querySelector(arg.selectors.unread) !== null
    } catch {
      unread = false
    }

    // ✅ 2026-09-18 实测：时间节点是 `.time`（形如 `00:53`）—— 之前一直没着落，所以留的 null
    let time = ''
    try {
      time = norm(row.querySelector(arg.selectors.time)?.textContent)
    } catch {
      time = ''
    }

    const rawId = row.getAttribute('id') ?? ''
    const conversationId =
      rawId !== '' ? rawId : company === '' ? `${name}#${String(index)}` : `${name}|${company}`

    out.push({
      conversationId,
      hrName: name,
      company,
      lastMessage,
      direction: isOurs ? 'me' : 'hr',
      unread,
      // 平台这里给的是「今天/昨天」这类相对时间（如 `00:53`），**不是**绝对时间戳 —— 原样带出去，
      // 由上层决定怎么解释（编一个日期比留原文更糟）。
      at: time === '' ? null : time,
    })
  })
  return out
}

/**
 * **在页面上下文里**核对"某公司的会话行里出现了完整话术"。
 *
 * 用途：点击沟通后页面**另开了标签页**、当前页看不到消息列表时的交叉验证
 * （BossHunter `_verify_greeting_in_chat_list` 同款）。要求公司与完整话术**同一行**命中，
 * 避免"公司对上但话术对不上"被误判成已发送。
 *
 * ⚠️ 必须完全自包含。
 */
export function chatRowMatchesInPage(arg: {
  selectors: ZhipinInboxSelectors
  company: string
  expectText: string
}): boolean {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const company = norm(arg.company)
  const expected = norm(arg.expectText)
  if (company === '' || expected === '') return false
  let rows: Element[] = []
  try {
    rows = Array.from(document.querySelectorAll(arg.selectors.row))
  } catch {
    return false
  }
  return rows.some((row) => {
    const text = norm(row.textContent)
    return text.includes(company) && text.includes(expected)
  })
}

/**
 * **在页面上下文里**判断某个岗位当前的接触阶段。
 *
 * 判据只用**已实测**的收件箱选择器（2026-09-18）：
 *   `.time` / `.name-text` / `.name-box` / `.last-msg-text` / `.message-status` / 未读徽章。
 *
 * ⚠️ 认不出来就返回 `null` 并带上原因，**绝不猜**：
 *   * 列表里没有这一行 → 分不清"从没打过招呼"与"会话已超出平台保留窗口"，返回 `none` 会写错账；
 *   * 状态类名不认识 → 返回 `null`，让上层**保留原值**而不是被降级。
 * ⚠️ 必须完全自包含。
 */
export function detectStageInPage(arg: {
  selectors: ZhipinInboxSelectors
  company: string
  title: string
}): { stage: ContactStage | null; reason: string } {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let container: Element | null = null
  if (arg.selectors.listContainer !== '') {
    try {
      container = document.querySelector(arg.selectors.listContainer)
    } catch {
      container = null
    }
    if (container === null) {
      return { stage: null, reason: `会话列表容器未找到（${arg.selectors.listContainer}）—— 判不出阶段` }
    }
  }

  let rows: Element[] = []
  try {
    rows = Array.from(document.querySelectorAll(arg.selectors.row))
  } catch {
    rows = []
  }
  const hints = [norm(arg.company), norm(arg.title)].filter((hint) => hint !== '')
  if (hints.length === 0) return { stage: null, reason: '岗位没有公司名也没有标题，无法在会话列表里定位' }
  const row = rows.find((node) => {
    const text = norm(node.textContent)
    return hints.some((hint) => text.includes(hint))
  })
  if (row === undefined) {
    return {
      stage: null,
      reason: '会话列表里没有这个岗位的会话（可能从未打过招呼，或平台已把它移出保留窗口）—— 不写成 none',
    }
  }

  let statusClass = ''
  let hasStatus = false
  try {
    const node = row.querySelector(arg.selectors.status)
    hasStatus = node !== null
    statusClass = (node?.getAttribute('class') ?? '').toLowerCase()
  } catch {
    hasStatus = false
    statusClass = ''
  }
  let lastClass = ''
  try {
    lastClass = (row.querySelector(arg.selectors.lastMessage)?.getAttribute('class') ?? '').toLowerCase()
  } catch {
    lastClass = ''
  }
  let unread = false
  try {
    unread = row.querySelector(arg.selectors.unread) !== null
  } catch {
    unread = false
  }

  if (unread) return { stage: 'replied', reason: '会话有未读，说明 HR 发了新消息' }
  // 「这条是不是我发的」看**节点在不在**，不看类名认不认得出 —— 见 `readInboxInPage` 里同一处的说明
  const ours = hasStatus || /(myself|self|mine|outgoing|send)/.test(lastClass)
  if (!ours) return { stage: 'replied', reason: '最后一条不是我们发的 → HR 已回复' }
  // ⚠️ `status-read` 这一档**代码支持但尚未实测**（还没见过被已读的样本）
  if (statusClass.includes('status-read')) return { stage: 'read', reason: '.message-status 为 status-read' }
  if (statusClass.includes('status-delivery')) {
    return { stage: 'delivered', reason: '.message-status 为 status-delivery（已送达，未见已读）' }
  }
  return {
    stage: null,
    reason: `最后一条是我们发的，但状态类名认不出来（class="${statusClass}"）—— 不猜`,
  }
}

export interface ZhipinAdapterOptions {
  config?: ZhipinConfig
  delayRangeMs?: [number, number]
  waitForListMs?: number
}

/** 构造 BOSS 直聘适配器。 */
export function createZhipinAdapter(options: ZhipinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_ZHIPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]

  /**
   * 本次要滚动加载几轮（`scrollRounds` 维度，方案里配）。
   *
   * 缺省 1 = 只读当前这一屏 15 条（**与改动前行为一致**：保守是默认，加深度要显式配）。
   * 上限取平台自报的 `totalCount / 15`，不是我们拍的保守值 —— 再多滚平台也不给。
   */
  const scrollRoundsOf = (criteria: SearchCriteria): number => {
    const parsed = Number.parseInt(platformCriterion(criteria, 'scrollRounds'), 10)
    if (!Number.isFinite(parsed) || parsed <= 1) return 1
    return Math.min(parsed, ZHIPIN_MAX_SCROLL_ROUNDS)
  }

  /**
   * 等元素出现。
   *
   * 两条路径的**失败形态不同**，必须都归一成布尔：
   *   * 真页面 = Playwright `waitForSelector`：超时**抛错**，成功返回 Locator；
   *   * 离线夹具 = 返回 `true` / `false`（静态 DOM 查一次）。
   * 所以既不能只看"有没有抛错"（会漏掉夹具的 false），也不能只看返回值。
   */
  const waitFor = async (page: PageLike, selector: string, timeoutMs: number): Promise<boolean> => {
    if (page.waitForSelector !== undefined) {
      try {
        const ready = await page.waitForSelector(selector, timeoutMs)
        return ready !== false
      } catch {
        return false
      }
    }
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (await page.evaluate(hasSelectorInPage, { selector })) return true
      if (Date.now() >= deadline) return false
      await page.waitForTimeout(150)
    }
  }

  /** 定位一个可见元素并返回它的信息（不点击）。 */
  const locate = async (
    page: PageLike,
    selector: string,
    textIncludes?: string,
  ): Promise<ZhipinElementInfo> =>
    await page.evaluate(
      elementCenterInPage,
      textIncludes === undefined ? { selector } : { selector, textIncludes },
    )

  /** 拟人点击一个选择器；返回定位信息（失败返回 null）。没有 CDP 鼠标 → 直接 null。 */
  const clickSelector = async (
    page: PageLike,
    selector: string,
    textIncludes?: string,
  ): Promise<ZhipinElementInfo | null> => {
    const mouse = page.mouse
    if (mouse === undefined) return null
    const info = await locate(page, selector, textIncludes)
    if (!info.found) return null
    await humanClick(mouse, info.x, info.y, { wait: (ms) => page.waitForTimeout(ms) })
    return info
  }

  /** 等某个选择器出现（轮询）；超时返回 false。 */
  const waitForPopup = async (
    page: PageLike,
    timeoutMs: number,
  ): Promise<'preset' | 'startchat' | 'none'> => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const state = await page.evaluate(detectGreetPopupInPage, {
        selectors: config.chatSelectors,
      })
      if (state.kind !== 'none') return state.kind
      if (Date.now() >= deadline) return 'none'
      await page.waitForTimeout(250)
    }
  }

  /** 读当前会话里这条消息的送达状态。 */
  const readDelivery = async (
    page: PageLike,
    text: string,
  ): Promise<'delivered' | 'pending' | 'failed' | 'missing'> =>
    (
      await page.evaluate(readChatMessagesInPage, {
        selectors: config.chatSelectors,
        expectText: text,
      })
    ).state

  /**
   * 轮询确认送达。看到 `delivered` 后**再等一拍复核一次** ——
   * 消息可能在"曾经出现"之后被平台回滚，一次采样不足以记为送达
   * （BossHunter `_message_delivery_state` 的稳定性复核同款）。
   */
  const waitForDelivery = async (
    page: PageLike,
    text: string,
  ): Promise<'delivered' | 'pending' | 'failed' | 'missing'> => {
    const { attempts, intervalMs } = config.deliveryPoll
    let last: 'delivered' | 'pending' | 'failed' | 'missing' = 'missing'
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      last = await readDelivery(page, text)
      if (last === 'failed') return 'failed'
      if (last === 'delivered') {
        await page.waitForTimeout(Math.max(800, intervalMs))
        const confirm = await readDelivery(page, text)
        return confirm === 'delivered' ? 'delivered' : confirm
      }
      await page.waitForTimeout(intervalMs)
    }
    return last
  }

  /** 打开某公司的会话（收件箱 → 点那一行）。 */
  const openConversation = async (
    page: PageLike,
    job: { title: string; company: string },
  ): Promise<boolean> => {
    const hint = job.company !== '' ? job.company : job.title
    if (hint === '') return false
    await page.goto(config.chatUrl)
    if (!(await waitFor(page, config.inboxSelectors.row, config.actionWaitMs))) return false
    const row = await clickSelector(page, config.inboxSelectors.row, hint)
    if (row === null) return false
    return await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs)
  }

  /** 清空并逐字符输入（走 humanize；没有修饰键能力时跳过清空）。 */
  const clearAndType = async (page: PageLike, selector: string, text: string): Promise<boolean> => {
    const keyboard = page.keyboard
    if (keyboard === undefined) return false
    if ((await clickSelector(page, selector)) === null) return false
    if (keyboard.down !== undefined && keyboard.up !== undefined) {
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await keyboard.down(modifier)
      await keyboard.press('KeyA')
      await keyboard.up(modifier)
      await keyboard.press('Backspace')
    }
    await humanType(keyboard, text, { wait: (ms) => page.waitForTimeout(ms) })
    return true
  }

  /** 打招呼前在岗位页停留一段时间（BossHunter `browse_before_greet`）。 */
  const dwellBeforeGreet = async (page: PageLike): Promise<void> => {
    const [min, max] = config.dwellBeforeGreetMs
    if (max <= 0) return
    await page.waitForTimeout(Math.round(min + Math.random() * Math.max(0, max - min)))
  }

  const missingInputSurface = (): ActionResult => ({
    ok: false,
    delivery: 'missing',
    evidence: 'none',
    message:
      '当前页面没有提供 CDP 输入能力（page.mouse / page.keyboard）—— 拒绝用 DOM 事件冒充真人点击' +
      '（isTrusted=false 是最廉价的自动化特征）。这条动作按未发送处理。',
  })

  const dimensions: CriteriaDimension[] = [
    { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '城市码来自 zhipin 官方 cityGroup 接口（经 BossHunter 2026-08-10 抓取）；其它城市写 DB 覆盖',
    },
    {
      key: 'maxPages',
      label: '抓取页数上限',
      values: [],
      max: ZHIPIN_MAX_PAGES,
      hint: 'BOSS 搜索页**没有可寻址的第 N 页**（2026-09-18 实测 `&page=2` 返回同一批数据）—— 深度改用「滚动加载轮数」',
    },
    {
      key: 'scrollRounds',
      label: '加载轮数',
      values: [],
      max: ZHIPIN_MAX_SCROLL_ROUNDS,
      hint:
        `BOSS 没有页码翻页，只能滚动加载：每滚一次 +${String(ZHIPIN_PAGE_SIZE)} 条。` +
        '填 1 = 只读第一屏 15 条；填 4 ≈ 60 条。平台自报 totalCount 封顶 300 条（= 20 轮），' +
        '再滚也没有新数据。轮数越大请求越密、风控风险越高 —— 保守起见先配 2–4 试。',
    },
  ]

  return {
    id: 'zhipin',
    ...platformFacts('zhipin'),
    displayName: 'BOSS直聘',
    capabilities: {
      // 夹具实测：未登录可见列表；但薪资隐藏 → 如实两说。
      searchWithoutLogin: true,
      // 平台能发简历（工具条「发简历」），但**要求双方回复之后**才可用（2026-09-18 实测
      // `unable` + aria-label「双方回复后可用」）；且会话里**没有**把本地文件发给 HR 的入口。
      supportsAttachment: true,
      // 会话里区分 status-read / status-delivery（BossHunter 实测），平台有回执可读。
      supportsReadReceipt: true,
      supportsInbox: true,
      supportsGreeting: true,
      fieldCompleteness: 'medium',
      antiBot: 'high',
    },
    // 未登录薪资隐藏：salary_raw 不进必需字段（否则全部被隔离）。
    requiredFields: ['title', 'company', 'source_url'] as readonly CoreField[],
    criteriaDimensions: dimensions,
    maxPages: ZHIPIN_MAX_PAGES,
    // 没有可寻址的页码（滚动加载走 scrollRounds 维度）—— 页数恒 1。
    defaultMaxPages: 1,

    criteria: {
      buildSearchUrl(criteria: SearchCriteria): string | null {
        return buildZhipinSearchUrl(config, criteria)
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildZhipinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`zhipin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        await page.goto(url)
        if (page.waitForSelector !== undefined) {
          try {
            await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
          } catch {
            /* 超时由 readListPage 的 0 条与判墙逻辑共同暴露 */
          }
        }
        // 滚动加载（`scrollRounds`，方案里配）：BOSS 的"翻页"只发生在页面内 ——
        // 第一屏已经在上面等到了，这里再滚 (rounds - 1) 次把它读厚。
        const rounds = scrollRoundsOf(criteria)
        if (rounds > 1) {
          await page.evaluate(scrollToLoadInPage, {
            card: config.selectors.card,
            rounds: rounds - 1,
            stepTimeoutMs: config.scrollStepTimeoutMs,
          })
        }
        if (delayMax > 0) {
          await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
        }
      },

      async readListPage(page): Promise<RawJob[]> {
        return await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          jobIdPattern: config.jobIdPattern,
        })
      },

      async hasNextPage(): Promise<boolean> {
        // 恒 false 是**平台事实**，不是没实现：2026-09-18 登录态实测，搜索页没有页码分页区，
        // 且 `&page=2` 返回的前 3 个岗位 id 与第 1 页完全相同（SPA 忽略该参数）——
        // 也就是说"下一页"这个东西在这个站点**不可寻址**。深度靠滚动加载（见 gotoSearch）。
        // 证据：test/fixtures/zhipin-pagination-report.json 的 `urlPaging.changed === false`。
        return false
      },
    },

    detail: {
      async extract(page): Promise<RawJobDetail> {
        return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
      },
    },

    guard: {
      async detectBlock(page): Promise<BlockKind | null> {
        // 判墙的**通用那一半**（验证码选择器、限流/配额/登录墙文案、blank 阈值）
        // 已抽到 `block-signals.ts`；这里只声明 BOSS 特有的 URL 特征：
        // 滑块页 `https://www.zhipin.com/web/user/safe/verify-slider`（get_jobs 实证）。
        return await page.evaluate(detectBlockWithSignals, {
          signals: signalsOf({ urlPatterns: ['zhipin\\.com/web/user/safe/verify'] }),
          card: config.selectors.card,
        })
      },
    },

    /**
     * 高危动作（§4.2.2 的 `actions`）。
     *
     * ⚠️ 这三个方法**不允许被 domain 直接调用** —— 实现放在这里，但必须由 `guard.run()`
     * 签发一次性令牌后经 `guard/actions/` 调用（§4.4.1）。适配器只负责"怎么点"。
     */
    actions: {
      /**
       * 打招呼。
       *
       * 流程（BossHunter `executor/sender.py` 的 `_send_greeting_once` 同款）：
       *   ① 打开岗位详情页 → ② 等「立即沟通」入口 → ③ 幂等检查（会话里已有同文本就不重发）
       *   → ④ 拟人停留 → ⑤ CDP 输入级点击入口 → ⑥ 处理弹窗（预设招呼语 / 首次沟通）
       *   → ⑦ 进入会话、逐字符输入话术、发送 → ⑧ 校验送达。
       *
       * 三种弹窗分支的**送达语义各不相同**，返回值里必须说清：
       *   * 预设招呼语弹窗：点确认即由平台发出**平台预设文案**（不是本次生成的话术）；
       *   * 首次沟通弹窗：在弹窗里填本次话术并提交；
       *   * 无弹窗（「继续沟通」）：直接进会话发本次话术。
       */
      async sayHello(page, job, text): Promise<ActionResult> {
        if (page.mouse === undefined || page.keyboard === undefined) return missingInputSurface()

        await page.goto(job.sourceUrl)
        if (!(await waitFor(page, config.chatSelectors.chatButton, config.actionWaitMs))) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              '岗位详情页没出现「立即沟通 / 继续沟通」入口 —— 可能岗位已关闭、未登录，或已被风控拦截。不重试。',
          }
        }

        await dwellBeforeGreet(page)

        const entry = await clickSelector(page, config.chatSelectors.chatButton)
        if (entry === null) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '找到沟通入口但坐标定位失败（元素不可见/无尺寸），未点击。',
          }
        }

        const popup = await waitForPopup(page, Math.min(config.actionWaitMs, 6_000))
        if (popup === 'preset') {
          const confirmed = await clickSelector(page, config.chatSelectors.dialogConfirm)
          if (confirmed === null) {
            return {
              ok: false,
              delivery: 'missing',
              evidence: 'none',
              message: '平台弹出了预设招呼语弹窗，但点不到「确定」。',
            }
          }
          return {
            ok: true,
            delivery: 'delivered',
            evidence: 'dom',
            message:
              '平台弹出了**预设招呼语**，已点确认发送 —— 发出去的是平台自带文案，不是本次生成的话术。',
          }
        }

        let submittedInDialog = false
        if (popup === 'startchat') {
          if (!(await clearAndType(page, config.chatSelectors.startchatInput, text))) {
            return {
              ok: false,
              delivery: 'missing',
              evidence: 'none',
              message: '首次沟通弹窗里找不到可输入的招呼语输入框。',
            }
          }
          if ((await clickSelector(page, config.chatSelectors.dialogSend)) === null) {
            return {
              ok: false,
              delivery: 'missing',
              evidence: 'none',
              message: '招呼语已填入首次沟通弹窗，但点不到发送按钮。',
            }
          }
          submittedInDialog = true
        }

        // 进会话：先等同页跳转；若点击另开了标签页（当前页没动），用入口自带的 redirect-url 导航过去。
        let inChat = await waitFor(page, config.chatSelectors.chatInput, 5_000)
        if (!inChat && entry.href !== '') {
          const target = entry.href.startsWith('http') ? entry.href : `https://www.zhipin.com${entry.href}`
          await page.goto(target)
          inChat = await waitFor(page, config.chatSelectors.chatInput, config.actionWaitMs)
        }
        if (!inChat && !submittedInDialog) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '点了沟通入口但没有进入会话（没出现聊天输入框），未发送。',
          }
        }

        // 消息级幂等：进入会话后先看这条话术是否已经在里面（重新点「继续沟通」会走这里）。
        // 必须放在**进会话之后** —— 岗位详情页上没有会话消息列表，在详情页上查等于永远查不到。
        if (inChat) {
          const existing = await readDelivery(page, text)
          if (existing === 'delivered') {
            return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true }
          }
          if (existing === 'failed' || existing === 'pending') {
            return {
              ok: false,
              delivery: existing,
              evidence: 'dom',
              message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
            }
          }
        }

        if (!submittedInDialog && inChat) {
          if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
            return {
              ok: false,
              delivery: 'missing',
              evidence: 'none',
              message: '会话已打开，但没能把话术输入到输入框。',
            }
          }
          await page.keyboard.press('Enter')
        }

        const state = await waitForDelivery(page, text)
        if (state === 'delivered') return { ok: true, delivery: 'delivered', evidence: 'dom' }

        // 交叉验证：当前页看不到消息列表（例如会话在另一个标签页）时，去会话列表核对
        // 「公司 + 完整话术」是否同一行命中（BossHunter `_verify_greeting_in_chat_list`）。
        if (job.company !== '') {
          await page.goto(config.chatUrl)
          if (await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)) {
            const matched = await page.evaluate(chatRowMatchesInPage, {
              selectors: config.inboxSelectors,
              company: job.company,
              expectText: text,
            })
            if (matched) return { ok: true, delivery: 'delivered', evidence: 'dom' }
          }
        }

        if (state === 'failed') {
          return {
            ok: false,
            delivery: 'failed',
            evidence: 'dom',
            message: '平台把这条消息标记为发送失败。',
          }
        }
        if (state === 'pending') {
          return {
            ok: false,
            delivery: 'pending',
            evidence: 'dom',
            message: '消息已出现在会话里但仍在「发送中」，未能确认送达。',
          }
        }
        return {
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message:
            '已点击发送，但会话里没有确认到这条消息 —— 按未发送处理（不重试，避免重复发送；请人工检查会话）。',
        }
      },

      /**
       * 在**已有会话**里回一条消息。
       *
       * 复用 `sayHello` 已经实测过的那条路径（`#chat-input` 逐字符输入 → Enter → 送达校验），
       * 区别只在"怎么命中会话"：回复是去会话列表按公司/岗位标题匹配那一行，不碰岗位详情页。
       *
       * 幂等语义比打招呼更保守：回复时"同文本已存在"更可能是我之前说过的话，所以
       * 发现同文本且已送达就**不重发**（`idempotentHit`），状态是 failed/pending 也不重发。
       */
      async reply(page, job, text): Promise<ActionResult> {
        if (page.mouse === undefined || page.keyboard === undefined) return missingInputSurface()

        if (!(await openConversation(page, job))) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              `没能在会话列表里找到「${job.company === '' ? job.title : job.company}」的会话 —— ` +
              '可能是对方还没回过话（会话不存在），或平台已把它移出保留窗口。未发送。',
          }
        }

        const existing = await readDelivery(page, text)
        if (existing === 'delivered') {
          return { ok: true, delivery: 'delivered', evidence: 'dom', idempotentHit: true }
        }
        if (existing === 'failed' || existing === 'pending') {
          return {
            ok: false,
            delivery: existing,
            evidence: 'dom',
            message: `会话里已有一条**相同文本**且状态为「${existing}」的消息 —— 不重发，请人工检查。`,
          }
        }

        if (!(await clearAndType(page, config.chatSelectors.chatInput, text))) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '会话已打开，但没能把回复内容输入到输入框。',
          }
        }
        await page.keyboard.press('Enter')

        const state = await waitForDelivery(page, text)
        if (state === 'delivered') return { ok: true, delivery: 'delivered', evidence: 'dom' }
        if (state === 'failed') {
          return { ok: false, delivery: 'failed', evidence: 'dom', message: '平台把这条回复标记为发送失败。' }
        }
        if (state === 'pending') {
          return {
            ok: false,
            delivery: 'pending',
            evidence: 'dom',
            message: '回复已出现在会话里但仍在「发送中」，未能确认送达。',
          }
        }
        return {
          ok: false,
          delivery: 'missing',
          evidence: 'none',
          message: '已点击发送，但会话里没有确认到这条回复 —— 按未发送处理（不重试，避免重复发送）。',
        }
      },

      /**
       * 探测某个岗位当前的接触阶段（§ `ContactStage`）。
       *
       * 判据全部来自**已实测**的收件箱选择器（2026-09-18）：
       *   * 会话列表里没有这个岗位的行 → `null`（**不返回 `none`**：分不清"从没打过招呼"
       *     和"平台已把会话移出保留窗口"，猜一个会比不报更糟）；
       *   * 行存在 + 最后一条是 HR 发的（或带未读）→ `replied`；
       *   * 行存在 + 最后一条是我发的 + `.message-status` 是 `status-read` → `read`；
       *   * 行存在 + 最后一条是我发的 + `status-delivery` → `delivered`；
       *   * 状态类名认不出来 → `null`（带原因，不猜）。
       *
       * ⚠️ `read` 这一档**代码支持但尚未实测**：目前唯一那条会话里我的消息还是 `status-delivery`，
       *   没等到被已读的样本。`interview_scheduled` 不在这里判 —— 那是 domain 的邀约识别职责。
       */
      async detectStage(page, job): Promise<ContactStage | null> {
        await page.goto(config.chatUrl)
        await waitFor(page, config.inboxSelectors.row, config.actionWaitMs)
        const probe = await page.evaluate(detectStageInPage, {
          selectors: config.inboxSelectors,
          company: job.company,
          title: job.title,
        })
        // 判不出来就 return null（契约允许），**不猜**：`none` 会被上层当成"没接触过"记下来，
        // 而"会话超出平台保留窗口"与"从没打过招呼"是两件事。
        return probe.stage
      },

      /**
       * 收件箱：读会话列表（HR 消息）。
       *
       * 这是纯读动作 —— 只要页面能打开就能做，不需要 CDP 输入面。
       * ⚠️ 未登录会停在登录墙，此时**选择器找不到容器 → 抛错**（而不是返回空数组）；
       * 「0 条」只会在"容器在、列表空"时出现，那样的 0 条才可信。
       */
      async readInbox(page): Promise<RawInboxMessage[]> {
        await page.goto(config.chatUrl)
        // 等**容器**而不是等行：空列表时容器在、行不在。等行会把"真的空"拖成一次超时，
        // 而超时后返回的 [] 又和"选择器腐烂"的 [] 长得一模一样 —— 0 条的可信度就没了。
        await waitFor(
          page,
          config.inboxSelectors.listContainer !== ''
            ? config.inboxSelectors.listContainer
            : config.inboxSelectors.row,
          config.actionWaitMs,
        )
        // 按 `inboxTab` 收窄（默认 all）：纯精度优化 —— 切不过去时读到的是当前展示的全量，
        // 那是**超集**，不会漏；所以这里点不上也不报错、不改变语义。
        if (config.inboxTab !== 'all') {
          const label = INBOX_TAB_LABELS[config.inboxTab]
          if ((await clickSelector(page, config.inboxSelectors.tabItem, label)) !== null) {
            await page.waitForTimeout(1_000)
          }
        }
        // 容器缺失时 readInboxInPage 会**抛错**（带选择器名），由 guard 如实转述，不谎报 0 条
        return await page.evaluate(readInboxInPage, { selectors: config.inboxSelectors })
      },

      /**
       * 附件投递（发简历）。
       *
       * 2026-09-18 真实会话实测把这条路看得比较清楚了，两点都推翻/修正了先前基于 BossHunter 的判断：
       *
       *   ① **会话里没有"把本地文件发给 HR"的入口**。页面上确实有 `input[type=file]`，但只有两个：
       *      `.upload-resume-dialog` 里的是「上传附件简历」**到你自己简历库**，
       *      `.btn-sendimg` 里的是**发图片**。拿它们冒充投递会把附件传错地方/发成图片 ——
       *      所以 `filePath ≠ null` 时**直接 fail-closed**，不假装成功。
       *   ② **「发简历」要等对方回复**。工具条按钮 `.toolbar-btn` 文案「发简历」，
       *      未回复时带 `unable` 且 `aria-label="求简历：双方回复后可用"`。这条要如实转述，
       *      否则用户会以为"投了但 HR 没理我"。
       *
       * 尚缺实测的一环：平台简历选择弹窗（`.choose-resume-dialog`）的结构 ——
       * 本次会话「发简历」不可用，弹窗没机会打开。
       */
      async sendResume(page, job, filePath): Promise<ActionResult> {
        if (page.mouse === undefined) return missingInputSurface()

        // ── 路径一：本地文件 —— 平台没有这个入口，绝不假装发出去了 ──────────
        if (filePath !== null) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              'BOSS 求职者端的会话里没有「把本地简历文件发给 HR」的入口（实测只有两个 file input：' +
              '「上传附件简历」到我的简历、以及「发送图片」）。请改用平台内简历投递（filePath 传 null），' +
              '或先在「我的简历」里上传附件简历再由 HR 侧查看。',
          }
        }

        // ── 路径二：平台内简历（工具条「发简历」）────────────────────────────
        if (!(await openConversation(page, job))) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: `没能在会话列表里找到「${job.company === '' ? job.title : job.company}」的会话，未发简历。`,
          }
        }

        // 先读按钮状态：不可用时点它毫无反应，那种"没反应"最容易被误读成投递成功
        const button = await page.evaluate(toolbarButtonStateInPage, {
          selector: config.chatSelectors.resumeButton,
          textIncludes: '简历',
          disabledClass: config.chatSelectors.resumeButtonDisabledClass,
        })
        if (!button.found) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '会话工具条里找不到「发简历」按钮（选择器可能已变，或该会话没有工具条）。',
          }
        }
        if (button.disabled) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message:
              `「发简历」当前**不可用**${button.reason === '' ? '' : `（平台提示：${button.reason}）`} —— ` +
              'BOSS 要求**双方回复之后**才能发简历。请等 HR 回复后再投，不要反复点。',
          }
        }

        if ((await clickSelector(page, config.chatSelectors.resumeButton, '简历')) === null) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '「发简历」按钮可见但坐标定位失败，未点击。',
          }
        }
        if (!(await waitFor(page, config.chatSelectors.resumeDialog, config.actionWaitMs))) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '点了「发简历」但没有出现简历选择弹窗（该弹窗结构尚未实测，选择器可能已变）。',
          }
        }
        if ((await clickSelector(page, config.chatSelectors.resumeDialogItem)) === null) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '简历选择弹窗里没有可选项（平台里可能还没有可用简历）。',
          }
        }
        if ((await clickSelector(page, config.chatSelectors.resumeDialogConfirm)) === null) {
          return {
            ok: false,
            delivery: 'missing',
            evidence: 'none',
            message: '已选中简历，但点不到弹窗的确认按钮。',
          }
        }
        const visible = await waitFor(page, config.chatSelectors.resumeCard, config.actionWaitMs)
        if (visible) return { ok: true, delivery: 'delivered', evidence: 'dom' }
        return {
          ok: false,
          delivery: 'pending',
          evidence: 'none',
          message: '已在平台弹窗里确认发送简历，但会话里还没出现简历卡片，未能确认送达。',
        }
      },
    },
  }
}
