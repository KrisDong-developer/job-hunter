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
import type { ContactStage } from '../../../shared/enums.js';
import type { RawInboxMessage, RawJob, RawJobDetail, SearchCriteria, SiteAdapter } from '../types.js';
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
    /** 动作流程里等弹窗/输入框/会话出现的时间上限（ms）。 */
    actionWaitMs: number;
    /** 发送后的送达校验轮询（次数 × 间隔）。 */
    deliveryPoll: ZhipinDeliveryPoll;
}
/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export declare const ZHIPIN_CITY_CODES: Record<string, string>;
/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export declare const ZHIPIN_JOB_ID_PATTERN = "/job_detail/([0-9a-zA-Z~_-]+)\\.html";
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
/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export declare function buildZhipinSearchUrl(config: ZhipinConfig, criteria: SearchCriteria): string | null;
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
export declare function scrollToLoadInPage(arg: {
    card: string;
    rounds: number;
    stepTimeoutMs: number;
}): Promise<number>;
/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
 */
export declare function extractJobsInPage(arg: {
    selectors: ZhipinSelectors;
    jobIdPattern: string;
}): RawJob[];
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
export declare function extractDetailInPage(arg: {
    selectors: ZhipinDetailSelectors;
}): RawJobDetail;
/** 页面上下文的元素定位结果（拟人点击的坐标来源 + 跳转线索）。 */
export interface ZhipinElementInfo {
    found: boolean;
    x: number;
    y: number;
    text: string;
    /**
     * 元素自带的跳转线索（`redirect-url` / `data-url` / `href`）。
     *
     * BOSS 的「立即沟通」按钮带 `redirect-url="/web/geek/chat/..."`。当点击**没能让
     * 当前页跳转**时（例如按钮 `target=_blank` 另开了标签页，而我们的 PageLike 只看得到
     * 当前页），用这个地址让当前页自己导航过去 —— BossHunter `_navigate_to_chat_redirect`
     * 就是为这个坑写的。
     */
    href: string;
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
export declare function elementCenterInPage(arg: {
    selector: string;
    textIncludes?: string;
}): ZhipinElementInfo;
/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export declare function hasSelectorInPage(arg: {
    selector: string;
}): boolean;
/**
 * **在页面上下文里**读一个工具条按钮的状态（能不能点、为什么不能）。
 *
 * 需要它是因为 2026-09-18 实测：BOSS 的工具条按钮**用 CSS 类 + aria-label 表达"当前不可用"** ——
 * 「发简历」带 `unable`、`aria-label="求简历：双方回复后可用"`；直接点它什么也不会发生，
 * 而"点了没反应"最容易被误读成"投递成功了"。这里把不可用**读出来**再决定。
 * ⚠️ 必须完全自包含。
 */
export declare function toolbarButtonStateInPage(arg: {
    selector: string;
    textIncludes: string;
    disabledClass: string;
}): {
    found: boolean;
    disabled: boolean;
    reason: string;
};
/** **在页面上下文里**识别首次沟通的两种弹窗。⚠️ 必须完全自包含。 */
export declare function detectGreetPopupInPage(arg: {
    selectors: ZhipinChatSelectors;
}): {
    kind: 'preset' | 'startchat' | 'none';
};
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
export declare function readChatMessagesInPage(arg: {
    selectors: ZhipinChatSelectors;
    expectText: string;
}): {
    state: 'delivered' | 'pending' | 'failed' | 'missing';
};
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
export declare function readInboxInPage(arg: {
    selectors: ZhipinInboxSelectors;
}): RawInboxMessage[];
/**
 * **在页面上下文里**核对"某公司的会话行里出现了完整话术"。
 *
 * 用途：点击沟通后页面**另开了标签页**、当前页看不到消息列表时的交叉验证
 * （BossHunter `_verify_greeting_in_chat_list` 同款）。要求公司与完整话术**同一行**命中，
 * 避免"公司对上但话术对不上"被误判成已发送。
 *
 * ⚠️ 必须完全自包含。
 */
export declare function chatRowMatchesInPage(arg: {
    selectors: ZhipinInboxSelectors;
    company: string;
    expectText: string;
}): boolean;
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
export declare function detectStageInPage(arg: {
    selectors: ZhipinInboxSelectors;
    company: string;
    title: string;
}): {
    stage: ContactStage | null;
    reason: string;
};
export interface ZhipinAdapterOptions {
    config?: ZhipinConfig;
    delayRangeMs?: [number, number];
    waitForListMs?: number;
}
/** 构造 BOSS 直聘适配器。 */
export declare function createZhipinAdapter(options?: ZhipinAdapterOptions): SiteAdapter;
//# sourceMappingURL=zhipin.d.ts.map