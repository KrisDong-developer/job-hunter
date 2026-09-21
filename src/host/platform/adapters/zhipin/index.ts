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
 *   `fieldCompleteness: 'medium'` 如实声明。
 *   ⚠️ 别以为"登录后薪资就可见了"：**登录态下它照样不可用** —— 出现的是字体混淆的
 *   乱码（见下面「薪资混淆」那一节）。薪资的**唯一**可用来源是列表接口的 `salaryDesc`，
 *   已接上（见 `ZhipinConfig.salaryApiEnabled`）。
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
 * ⚠️ **薪资数字是字体混淆的（2026-09-18 定案，之前那段结论写错了）**。
 *   早先这里写的是"数字完全不在 textContent 里，页面也没有 `@font-face`"—— **不准确**。
 *   把登录态夹具的 `.job-salary` 逐字符打出来才看清：
 *
 *   * 卡片是 `<span class="job-salary">\uE032\uE033-\uE033\uE031K·\uE032\uE034薪</span>`，
 *     即 **10 个连续私有区码点 `U+E031`–`U+E03A` 一码一数字**（实测 15 张卡片共 70 处）；
 *     按位置对回真实值 `15-25K·13薪` 可以逐位对上（E032=1、E033=5、E031=2、E034=3）。
 *   * 码点靠**外部 CSS 的 `@font-face`** 渲染成人眼看到的数字 —— 所以 `page.content()`
 *     存的 HTML 里没有 `@font-face`（那份 CSS 在 CDN 上、没进快照），
 *     而 print 到终端时私有区字符是**空白**，于是看起来像 `-K·薪`。
 *   * 结论：`salaryRaw` 拿到的是乱码 ⇒ 适配器**一律置空 + 记 `salary:obfuscated`**，
 *     绝不把乱码当薪资写库（下游会把它当"读到的薪资"去排序/展示）。
 *
 *   **明文在接口里，而且已经接上了**（2026-09-19 定案 + 落地）：
 *   `wapi/zpgeek/search/joblist.json` 的 `zpData.jobList[].salaryDesc` 是
 *   `"12-20K·13薪"` 这样的**明文、无私有区字符**，连接键是接口的 `encryptJobId`
 *   ↔ 卡片 `href="/job_detail/<id>.html"` 的 id（实测 15/15 完全重合）。
 *   调用形态也探明了：**POST + 表单体**（不是 JSON），体形如
 *   `page=1&pageSize=15&city=101280600&query=Java&…&scene=1`；
 *   而且**只要 cookie + `content-type` 就调得通**（不需要 `zp_token`/`traceid` 那套 ——
 *   实测适配器自建的请求形态直接通，见 `probe-zhipin-login` 的第 6 步）。
 *   ⇒ 落地为"**DOM 定列表、接口只补薪资**"：`readListPage` 先走 DOM，再把空薪资按 id 回填
 *   （见 `ZhipinConfig.salaryApiEnabled`）。**为什么不让接口当主通道**：`sourceUrl` 必须来自
 *   搜索页返回的原始 href（BOSS 的 URL 带 `securityId`，重构即被拦），接口响应里没有现成 href。
 *   `requiredFields` 仍然**不含** `salary_raw`：接口通道要登录态，登录静默过期时
 *   整页记录不该被打成 `pending_repair`。
 *   `fieldCompleteness` 也仍是 `medium`：薪资现在**能拿到但不保证**（未登录时为空），
 *   声明 `high` 属于夸大。
 *   接口里另有 `jobName`/`brandName`/`cityName`/`jobExperience`/`jobDegree`/`skills`/
 *   `welfareList`/`brandStageName`，字段比 DOM 全 —— 后续想升级可以先从这些下手。
 *
 *   📌 **2026-09-20 复测（`npm run probe:zhipin-login`）**：通道仍然通 —— 对照组与适配器
 *   自建请求形态都取到薪资。但有一处**要把话收窄**：DOM 滚了 6 轮（105 条）之后，
 *   接口**第 1 页 15 条薪资里只有 13 条的 id 能与 DOM 对得上**（不是 09-19 那次"未滚动"时
 *   测到的 15/15）。也就是说 DOM 与接口的集合会随滚动小幅漂移，`fillSalariesFromApi`
 *   按 id 回填因此只能覆盖其中一部分 —— 这是**设计上接受的**：对不上就留空 + 保留原 note，
 *   绝不猜一个薪资写进去。想提高覆盖率就调 `joblistMaxPages`（每页 15 条、多翻一页多一轮请求）。
 *
 * ## 详情页：选择器与解析（2026-09-18 由**本仓真实登录态快照**校准）
 *
 * ⚠️ **2026-09-20 追加实测（本次最值钱的一条）**：JD 正文里**被注入了水印**，
 *   而适配器以前是直接取 `textContent` —— 于是**写库的 JD 是脏的**。
 *   真实快照里 `.job-sec-text` 的原文是：
 *
 *   ```
 *   <span class="TkBBeZbHdGjN">BOSS直聘</span>岗位职责<br>1. 参与后<span class="pyKakWzEQwNK">来自BOSS直聘</span>端业务系统的需求分析、…
 *   ```
 *
 *   取 `textContent` 得到「BOSS直聘岗位职责1. 参与后**来自BOSS直聘**端业务系统…」——
 *   开头多一段品牌串，而且**「后端业务系统」被从中间劈开**。
 *   这不是显示问题：`crawl.ts` 会把 `jdText` 原样写库（`store.job.setJdText`），
 *   而它下游喂给打分与面试技能差距分析（`interviews.ts` 的 `techTokens`）。
 *   水印 span 的**类名每次随机**（实测两种），只能**按文本**判；名单进
 *   `ZhipinDetailSelectors.jdWatermarkTexts`（可 DB 覆盖）。
 *   在线复验：同一份真实快照，修复前 `jdText` 297 字（含两处水印），修复后 **283 字、
 *   `直聘` 0 处、`后端业务系统` 复原**（差的 14 字正好是 6+8 两个水印串）。
 *   ⚠️ 只剔"**整个元素恰好等于水印串**"的节点 —— 句中正常提到「BOSS直聘」的不动（有用例钉住）。
 *   📌 顺带查过**列表页没有**这种注入（105 张卡片里 0 个随机类名 span、标题/公司名 0 处水印），
 *   所以只有详情页 JD 需要清洗。
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
 *     `.user-list .no-data`（空态）；**行元素与行内字段已由 09-18 / 09-20 两次真实会话确认**
 *     （`li[role=listitem]` / `.name-text` / `.name-box` / `.last-msg-text` / `.message-status` / `.time`）。
 *     `readInbox` 现在**先等容器**：容器在而列表空 = 可信的 0 条；**容器都找不到就抛错**，
 *     绝不把"选择器腐烂"混成"今天没人回我"。
 *   * **附件简历**（2026-09-18 真实会话实测**修正**了先前基于 BossHunter 的判断）：
 *     会话里**没有"把本地文件发给 HR"的入口**。页面上确实有 `input[type=file]`，但只有两个，
 *     都不是投递：`.upload-resume-dialog` 里的是「上传附件简历」**到你自己简历库**，
 *     `.btn-sendimg` 里的是**发图片**。而工具条「发简历」按钮是 `.toolbar-btn`（求职者端类名，
 *     `.operate-btn` 是招聘者端的），**未回复时带 `unable` + `aria-label` 写着"双方回复后可用"** ——
 *     即 BOSS 要求**双方回复之后**才能发简历。所以 `sendResume`：本地文件一律 fail-closed（如实说明），
 *     `filePath=null` 时先读按钮状态，`unable` 就如实告诉用户"等对方回复"，**绝不点一个点不动的按钮**。
 *
 * ## 2026-09-20 第二次登录态实测（会话级，补齐 09-18 的三处缺口）
 *
 * 这次账号里已经有 **2 条会话**，其中一条是 **HR 主动发来的未读会话**、另一条是**我发的且已被读**
 * —— 09-18 缺的样本一次性到齐（入口：`npm run probe:zhipin-chat`，产物 `chat-report-2026-09-20.json`）：
 *
 *   * **未读徽章的类名是 `.notice-badge`**（此前只有候选列表，从没命中过真实页面）：
 *     HR 主动发来的那行带它、文本就是未读数 `1`；同一行**没有** `.message-status`
 *     —— 与"节点在 ⇒ 最后一条是我发的"这条方向判据吻合。⇒ 候选中把它排到第一位；
 *   * **`.message-status status-read`（文案 `[已读]`）拿到真实样本** ——
 *     `actions.detectStage` 的 `read` 这一档从此**不再**是"代码支持但没见过"；
 *   * **「发简历」的 `unable` 消失**（HR 回复了）⇒ 探针用**真鼠标**点开 `.choose-resume-dialog`
 *     并采下原文（`resume-dialog-2026-09-20.html`）。结构见 `config.ts` 的
 *     `ZhipinChatSelectors.resumeDialog`；关键两条：
 *     ① 一条可选简历都没有时弹窗**照样打开**（空态 `.resume-top-tip`「未上传简历」）；
 *     ② 确认按钮是 `button.btn-v2.btn-sure-v2.btn-confirm`，未选中简历时带
 *     `class="… disabled" disabled`。⇒ `sendResume` 现在**先读弹窗状态再决定**
 *     （`resumeDialogStateInPage`：条目数 / 按钮是否 disabled / 空态文案），
 *     把"点了那个点不动的按钮"如实报成 `missing`，而不是讲成
 *     「已确认发送但没看到简历卡片（pending）」—— 那是这条链路上最容易撒的谎。
 *
 * ⚠️ 按 §7 的站点规则：打招呼**必须**走 `platform/humanize.ts` 的 CDP Input 级点击与逐字符输入，
 *   绝不用 DOM `el.click()` / `fill`（`isTrusted=false` 是最廉价的自动化特征）。
 *   因此 `sayHello` / `sendResume` 在没有 `page.mouse` / `page.keyboard` 时 **fail-closed**。
 *   探针侧同款教训：点会话行、点「发简历」都必须用 `page.mouse.click` —— DOM `el.click()`
 *   触发不了 Vue 处理器（09-18 点会话行、09-20 点「发简历」各踩一次）。
 *
 * ## 本仓实测入口（用于日后校准选择器）
 *
 * `npm run probe:zhipin-chat` —— 会话页 + 岗位详情页的**登录态只读探针**：不发消息、不投递。
 * 产物落 `.probe-zhipin-capture/`（`.probe*` 已 gitignore，**刻意不写 `test/fixtures/`**）：
 * `chat-list-<日期>.html` / `chat-conversation-<日期>.html` / `detail-<日期>.html` /
 * `chat-report-<日期>.json`（逐选择器命中数 + 会话行子节点样本 + 工具条文案）。
 * 报告里 `count: 0` 的字段就是已经腐烂的那条选择器。`ZHIPIN_PROBE_SKIP_CHAT=1` 只采详情页。
 * `ZHIPIN_PROBE_RESUME=1` 额外点开「发简历」弹窗并采它的**原文**
 * （`resume-dialog-<日期>.html`）—— 仍然**只按 Esc 关闭、绝不点确认**。
 *
 * ⚠️ 已知的站点门槛（2026-09-18 实测）：**资料未完善**的账号访问 `/web/geek/*` 会被
 * **强制重定向**到简历完善引导页 `/web/geek/guide`，会话页因此打不开。
 * 探针在这种状态下**不关窗口**：把窗口留给人操作、每 30 秒重试会话页，填完自动继续采集
 * （用 `ZHIPIN_WAIT_MIN=25` 给它足够时间），只有等待窗口耗尽才放弃并记 `chatBlocked`。
 *
 * 仍**只有 BossHunter 证据、本仓未实测**的点（别假装是实测的）：
 *   * 首次沟通弹窗 `.dialog-wrap.startchat-dialog` 与预设招呼语弹窗 `.greet-boss-pop`
 *     （09-18 与 09-20 两次点「立即沟通」走的都是"直接进会话"路径，两种弹窗都没出现）；
 *   * 简历弹窗里**条目本身**的类名（账号没有附件简历，弹窗只渲染空态 —— 容器
 *     `.resume-choose-container` 已实测，条目选择器里那条结构式候选是由它推导的）；
 *   * 发送成功后会话里的 `.resume-card`（没有可发的简历，走不到那一步）。
 *
 * ✅ 已于 2026-09-18 实测确认（会话级）：`#chat-input`（`div.chat-input[contenteditable]`）、
 *   `.btn-send`、`.chat-record`、`li.message-item.item-myself`、`div.message-content`、
 *   `i.message-status.status-delivery`、会话行 `li[role=listitem]` 及其 `.time` / `.name-text` /
 *   `.name-box` / `.last-msg-text` —— 这些**不必再怀疑**。
 * ✅ 2026-09-20 追加确认：`.notice-badge`（未读）、`status-read`（`[已读]`）、
 *   工具条 `.toolbar-btn`（有/无 `unable` 两种状态都见到过）、`.choose-resume-dialog`
 *   整棵弹窗树（含 `.resume-choose-container` / `.resume-top-tip` / `.btn-confirm`）。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createZhipinAdapter` 与 `ZhipinAdapterOptions`；含工厂里的编排状态
 *   （`lastSearch` WeakMap）与**判墙的唯一实现**（`detectBlockOf` / `assertActionPage`）。
 * * `config.ts` —— 选择器集 / 城市码 / 接口参数 / 默认配置与 `mergeZhipinConfig`（配置面）。
 * * `urls.ts` —— 搜索 URL 与 joblist 表单体的宿主机侧构造（不碰 `document`）。
 * * `api.ts` —— 页面内 joblist 请求通道 + 响应 → `encryptJobId → salaryDesc` 的解析。
 * * `actions.ts` —— 五个高危动作 + 它们的交互工具（`waitFor` / `clickSelector` / `dwell`…）。
 * * `page/list.ts` / `page/detail.ts` / `page/chat.ts` / `page/inbox.ts` —— 送进
 *   `page.evaluate` 的**自包含**页面上下文解析函数。
 * * 配置面（`DEFAULT_*` / `merge*`）一律从 `./config.js` 取，本文件不转出。
 */
import type { BlockKind, CoreField } from '../../../../shared/contract/enums/crawl.js'
import { humanBrowse } from '../../humanize.js'
import { humanDelayMs } from '../../pacing.js'
import { platformFacts } from '../../platform-facts.js'
import { detectBlockWithSignals, signalsOf } from '../../block-signals.js'
import { actionBlockOf, PlatformBlockedError, platformCriterion } from '../../types.js'
import type {
  AdapterLogger,
  CriteriaDimension,
  PageLike,
  RawJob,
  RawJobDetail,
  SearchCriteria,
  SiteAdapter,
} from '../../types.js'
import { createZhipinActions } from './actions.js'
import { extrasMapOf, fetchJoblistInPage, type ZhipinApiExtras } from './api.js'
import type { ZhipinConfig } from './config.js'
import {
  DEFAULT_ZHIPIN_CONFIG,
  ZHIPIN_DEFAULT_SCROLL_ROUNDS,
  ZHIPIN_MAX_PAGES,
  ZHIPIN_MAX_SCROLL_ROUNDS,
  ZHIPIN_PAGE_SIZE,
} from './config.js'
import { extractDetailInPage } from './page/detail.js'
import { extractJobsInPage, isLoggedInByMarkersInPage, scrollToLoadInPage } from './page/list.js'
import { ZHIPIN_BODY_FIELDS, buildJoblistBody, buildZhipinSearchUrl } from './urls.js'

export interface ZhipinAdapterOptions {
  config?: ZhipinConfig
  delayRangeMs?: [number, number]
  waitForListMs?: number
  /** 诊断日志：只用于上报"接口通道静默降级了"这一类**不报警的坏法**。 */
  logger?: AdapterLogger
}

/** 构造 BOSS 直聘适配器。 */
export function createZhipinAdapter(options: ZhipinAdapterOptions = {}): SiteAdapter {
  const config = options.config ?? DEFAULT_ZHIPIN_CONFIG
  const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0]
  const logger = options.logger

  /**
   * 记住每个页面最近一次 `gotoSearch` 的搜索条件 —— 供 `readListPage` 构造
   * joblist 请求体（那条通道要靠 `query` + `city` 才能问出同一批岗位的补充字段）。
   * `rounds` 一起记：回填要翻几页接口由它联动（滚了 N 屏就最多补 N 页）。
   *
   * 主链顺序 `gotoSearch → detectBlock → readListPage` 保证了它总是新鲜的
   * （与 liepin 的 `lastSearch` 同一模式）。
   */
  const lastSearch = new WeakMap<object, { query: string; cityCode: string; rounds: number }>()

  /**
   * 判墙的**唯一实现**（采集与动作链共用）。
   *
   * 抽出来是因为它现在有两个调用方：`guard.detectBlock`（主链在列表/详情页上判）
   * 与 `assertActionPage`（动作在岗位页/会话页上判）。各写一遍
   * `page.evaluate(detectBlockWithSignals, …)` 的话，改信号集时漏掉一处就会出现
   * "采集认得这道墙、动作不认得"——而动作那边恰恰是**会真发东西**的一侧。
   *
   * 信号只声明 BOSS 特有的 URL 特征：滑块页 `zhipin.com/web/user/safe/verify`（get_jobs 实证）。
   */
  const detectBlockOf = async (page: PageLike): Promise<BlockKind | null> =>
    await page.evaluate(detectBlockWithSignals, {
      signals: signalsOf({ urlPatterns: ['zhipin\\.com/web/user/safe/verify'] }),
      card: config.selectors.card,
    })

  /**
   * 动作链上的判墙：命中就抛 `PlatformBlockedError`（由 `guard.run()` 写平台级暂停）。
   *
   * `blank` **不算**风控（见 `types.ts` 的 `actionBlockOf`）：会话页上 0 张岗位卡片
   * 本来就是常态 —— 一个空收件箱（「30天内暂无联系人」）文本很短，会被判成 blank，
   * 照单全收就等于每同步一次就白白暂停一次平台。
   */
  const assertActionPage = async (page: PageLike): Promise<void> => {
    const kind = actionBlockOf(await detectBlockOf(page).catch(() => null))
    if (kind !== null) throw new PlatformBlockedError(kind, '动作页面上看到风控页面')
  }

  /**
   * 本次要滚动加载几轮（`scrollRounds` 维度，方案里配）。
   *
   * 缺省 `ZHIPIN_DEFAULT_SCROLL_ROUNDS = 3`（≈45 条/轮采集）；显式配 1 仍表示
   * "只读第一屏"。上限取平台自报的 `totalCount / 15`，不是我们拍的保守值 ——
   * 再多滚平台也不给。
   */
  const scrollRoundsOf = (criteria: SearchCriteria): number => {
    const parsed = Number.parseInt(platformCriterion(criteria, 'scrollRounds'), 10)
    const base = Number.isFinite(parsed) && parsed >= 1 ? parsed : ZHIPIN_DEFAULT_SCROLL_ROUNDS
    return Math.max(1, Math.min(base, ZHIPIN_MAX_SCROLL_ROUNDS))
  }

  /**
   * 用 joblist 接口把 DOM 里拿不到的字段补上（见 `ZhipinConfig.salaryApiEnabled` 的说明；
   * 2026-09-20 起从"只补薪资"升级为**字段级回填**，来源清单见 `ZhipinApiExtras`）。
   *
   * 四条纪律：
   *   1. **岗位集合仍以 DOM 为准** —— 接口只按 `encryptJobId` 补字段，**不引入新岗位**；
   *   2. `sourceUrl` 的路径与 id 仍来自 DOM 的原始 href，**只追加**同一接口给的
   *      `securityId` 查询参数（BossHunter 站点规则：详情抓取必须带它；这不是重构 URL）；
   *   3. **失败就保持原样** —— 接口挂了 / 结构变了，返回 DOM 的结果与原有 note，
   *      **不抛错**（这条通道是"锦上添花"，不该让整轮抓取失败）；
   *   4. **填上之后要撤掉 DOM 通道留下的那两条 note**（`salary:obfuscated` /
   *      "未登录视图薪资隐藏"）—— 否则数据是新的、说明是旧的，自相矛盾。
   *
   * 接口要翻几页与滚动轮数联动：滚了 N 屏（≈15N 条）就最多补 N 页（`joblistMaxPages`
   * 是老配置的下限兜底）。固定 5 页的老上限在滚 20 轮时只覆盖 75 条，后段岗位全部裸奔。
   */
  const enrichFromApi = async (page: PageLike, jobs: RawJob[]): Promise<RawJob[]> => {
    if (!config.salaryApiEnabled) return jobs
    const remembered = lastSearch.get(page as object)
    if (remembered === undefined || remembered.query === '') return jobs
    const missing = jobs.filter((job) => job.salaryRaw === '')
    if (missing.length === 0) return jobs

    const pages = Math.min(
      Math.max(config.joblistMaxPages, remembered.rounds),
      Math.max(1, Math.ceil(missing.length / config.joblistPageSize)),
    )
    const extrasById = new Map<string, ZhipinApiExtras>()
    for (let index = 1; index <= pages; index += 1) {
      // 页与页之间要有**间隔**：这是同一个站点上的连续请求，而 SPA 刚刚自己发过
      // 同一批（page=1..N）。零间隔连发正是 `pacing.ts` 突发规则要拦的形态 ——
      // 只是那条规则只挂在采集主链上，回填这条支线以前完全不受它管。
      if (index > 1 && delayMax > 0) await page.waitForTimeout(humanDelayMs([delayMin, delayMax]))
      const payload = await page
        .evaluate(fetchJoblistInPage, {
          apiPath: config.joblistApiPath,
          body: buildJoblistBody({
            query: remembered.query,
            cityCode: remembered.cityCode,
            page: index,
            pageSize: config.joblistPageSize,
          }),
        })
        .catch(() => null)
      const got = extrasMapOf(payload)
      // 一页都没解析出东西 ⇒ 视为通道不可用，保持 DOM 结果（不抛错）
      if (got.size === 0) {
        // **必须留痕**：这条通道是"锦上添花"，失败不抛错是对的；但它长期失效的表现
        // 是"薪资/补充字段永远是空"—— 而核心字段照常命中，字段健康度、量级基线
        // 一个都不会报警。日志是这种静默降级唯一的出口。
        const code = (payload as { code?: unknown } | null)?.code
        logger?.warn(
          `[zhipin] 列表接口没能取到数据（第 ${String(index)} 页，` +
            (payload === null ? '请求失败 / 未登录' : `code=${String(code)}`) +
            '）—— 保持 DOM 结果，这一批补充字段留空',
        )
        break
      }
      for (const [id, extras] of got) extrasById.set(id, extras)
      if (missing.every((job) => extrasById.has(job.platformJobId))) break
    }
    if (extrasById.size === 0) return jobs

    return jobs.map((job) => {
      const extras = extrasById.get(job.platformJobId)
      if (extras === undefined) return job
      const filled: RawJob = { ...job }
      if (extras.salaryDesc !== '') filled.salaryRaw = extras.salaryDesc
      // 技能 + 福利进 tags（与既有 DOM tags 合并去重；技能在前，它们对匹配更有用）
      const tags = [...new Set([...(job.tags ?? []), ...extras.skills, ...extras.welfareList])]
      if (tags.length > 0) filled.tags = tags
      // 单值补充字段：DOM 没给（zhipin 的列表卡片本来就没有）才写，已有值不覆盖
      if ((filled.industry ?? '') === '' && extras.brandIndustry !== '') filled.industry = extras.brandIndustry
      if ((filled.companySize ?? '') === '' && extras.brandScaleName !== '') filled.companySize = extras.brandScaleName
      // 融资阶段 → companyNature：与列表接口的 brandStageName、本适配器详情页 `.icon-stage` 同一去处
      if ((filled.companyNature ?? '') === '' && extras.brandStageName !== '') filled.companyNature = extras.brandStageName
      // 区 + 商圈（接口两段比 DOM 的第二段多一段商圈；DOM 值保留为兜底）
      if (extras.areaDistrict !== '') {
        filled.district =
          extras.businessDistrict !== '' ? `${extras.areaDistrict}·${extras.businessDistrict}` : extras.areaDistrict
      }
      // 详情页令牌：只追加参数，不动路径
      if (extras.securityId !== '' && !filled.sourceUrl.includes('securityId=')) {
        filled.sourceUrl = `${filled.sourceUrl}${filled.sourceUrl.includes('?') ? '&' : '?'}securityId=${extras.securityId}`
      }
      const notes = (job.notes ?? []).filter(
        (note) => note !== 'salary:obfuscated' && note !== '未登录视图薪资隐藏（登录后可升级）',
      )
      if (notes.length === 0) delete filled.notes
      else filled.notes = notes
      return filled
    })
  }

  const dimensions: CriteriaDimension[] = [
    {
      key: 'keyword',
      label: '关键词',
      values: [],
      hint: '自由文本，平台原样接收',
      // BOSS 的筛选**不在页面 URL 里**：真正的请求是页面内调 joblist 接口的表单体
      // （`query` / `city`），URL 只承载页面外壳。声明落到 body 字段上，预览与对账看的是同一个请求。
      wire: { target: 'body', param: ZHIPIN_BODY_FIELDS.keyword },
    },
    {
      key: 'city',
      label: '城市',
      values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
      hint: '城市码来自 zhipin 官方 cityGroup 接口（经 BossHunter 2026-08-10 抓取）；其它城市写 DB 覆盖',
      wire: { target: 'body', param: ZHIPIN_BODY_FIELDS.city },
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
      // 数值维度由**适配器**声明（不再靠宿主那张全局 NUMERIC_KEYS 猜）。
      numeric: true,
      hint:
        `BOSS 没有页码翻页，只能滚动加载：每滚一次 +${String(ZHIPIN_PAGE_SIZE)} 条。` +
        `不填默认 ${String(ZHIPIN_DEFAULT_SCROLL_ROUNDS)} 轮（≈${String(ZHIPIN_PAGE_SIZE * ZHIPIN_DEFAULT_SCROLL_ROUNDS)} 条）；` +
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
      /**
       * 预览：BOSS 的筛选**不在页面 URL 里**，而是页面内调 joblist 接口的表单体
       * （`query` / `city`），URL 只是把页面开起来。所以预览必须给出**那个请求**，
       * 否则界面上会显示"这个方案什么都没筛"（而声明里明明有 wire）。
       *
       * 与采集走**同一个** `buildJoblistBody`：预览与真实请求不可能分叉。
       */
      preview(criteria: SearchCriteria) {
        const url = buildZhipinSearchUrl(config, criteria)
        const cityCode =
          criteria.city === undefined || criteria.city === ''
            ? ''
            : (config.cityCodes[criteria.city] ?? '')
        const body = buildJoblistBody({
          query: criteria.keyword ?? '',
          cityCode,
          page: 1,
          pageSize: config.joblistPageSize,
        })
        const params: Record<string, string> = {}
        for (const [key, value] of new URLSearchParams(body)) params[key] = value
        // 城市码未知时 URL 是 null（不猜）—— 页面地址仍然给得出来，参数表能说明原因
        return {
          url: url ?? config.urlParams.base,
          method: 'POST' as const,
          params,
          body,
          crawlOnly: [],
        }
      },
    },

    /**
     * 登录态检测（2026-09-19 补）。
     *
     * 为什么必须有它：BOSS 是**最需要登录**的平台（详情页要登录后才有的 `securityId`），
     * 而在补上这一块之前 `adapter.auth === undefined` ⇒
     *   * `platforms.loginStatus('zhipin')` 直接抛「没有声明登录入口」，用户在设置里
     *     既看不到登录态、也没法走登录引导；
     *   * `account.loggedIn` 恒 `false`，而界面那些"需要登录"的入口都是按它过滤的 ——
     *     结果就是**打招呼 / 收件箱 / 回复全做好了，入口却永远不亮**。
     *
     * 不声明 auth 与"不需要登录"是两件事：后者看 `authRequirement.crawl`（BOSS 的
     * 搜索确实不需要登录），前者看这里有没有实现。
     */
    auth: {
      // 登录 URL 有据：未登录夹具里 `ka="header-login"` 那个链接的 href 就是它。
      loginUrl: 'https://www.zhipin.com/web/user/',
      // 检测判**搜索页**：`loginSelectors` 的两个锚点是在搜索页夹具上校准的（见
      // config.ts 的注释），而登录页 `/web/user/` 没有那套页头 —— 在登录页上判，
      // 两个锚点都不命中，null 被兜底成 false，于是**已登录也恒判未登录**。
      // 见 `auth.checkUrl` 的说明（猎聘/智联/51job 的同款坑）。传空 criteria：
      // 检测页只要"页头在"就够，不需要关键词与城市。
      checkUrl: buildZhipinSearchUrl(config, {}),
      async isLoggedIn(page): Promise<boolean> {
        // BOSS 页头是 SPA 异步挂载的：goto 一返回就判，锚点可能还没渲染（探针
        // 脚本 goto 后要等，gotoSearch 也等卡片）。先等两个锚点**任一**出现再判；
        // 等不到（超时 / 离线夹具没有 waitForSelector）就按原样 evaluate。
        if (page.waitForSelector !== undefined) {
          await page.waitForSelector(
            `${config.loginSelectors.loggedIn}, ${config.loginSelectors.notLoggedIn}`,
            options.waitForListMs ?? 15_000,
          )
        }
        const verdict = await page.evaluate(isLoggedInByMarkersInPage, {
          loggedIn: config.loginSelectors.loggedIn,
          notLoggedIn: config.loginSelectors.notLoggedIn,
        })
        // 判不出来时按"未登录"处理（保守，见 isLoggedInByMarkersInPage 的说明）。
        return verdict ?? false
      },
    },

    crawl: {
      async gotoSearch(page, criteria): Promise<void> {
        const url = buildZhipinSearchUrl(config, criteria)
        if (url === null) {
          throw new Error(`zhipin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`)
        }
        // 轮数在这里一次算好：滚动用它，回填的接口页数也用它（联动，见 enrichFromApi）
        const rounds = scrollRoundsOf(criteria)
        lastSearch.set(page as object, {
          query: criteria.keyword ?? '',
          cityCode: criteria.city === undefined || criteria.city === '' ? '' : config.cityCodes[criteria.city] ?? '',
          rounds,
        })
        await page.goto(url)
        if (page.waitForSelector !== undefined) {
          try {
            await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000)
          } catch {
            /* 超时由 readListPage 的 0 条与判墙逻辑共同暴露 */
          }
        }
        // "看一眼"（真实的滚轮 + 指针事件）。之所以要放在懒加载之前：
        // 下面的 `scrollToLoadInPage` 走的是页面内 `scrollTo`，那是**程序化滚动** ——
        // 它产生 scroll 事件，但**没有 wheel、也没有 mousemove**。
        await humanBrowse(page)
        // 滚动加载（`scrollRounds`，方案里配）：BOSS 的"翻页"只发生在页面内 ——
        // 第一屏已经在上面等到了，这里再滚 (rounds - 1) 次把它读厚。
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
        const jobs = await page.evaluate(extractJobsInPage, {
          selectors: config.selectors,
          jobIdPattern: config.jobIdPattern,
        })
        return await enrichFromApi(page, jobs)
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
      // 判墙的实现只有一份（`detectBlockOf`）—— 动作链与采集共用它。
      detectBlock: detectBlockOf,
    },

    /**
     * 高危动作（§4.2.2 的 `actions`）。
     *
     * ⚠️ 这三个方法**不允许被 domain 直接调用** —— 实现放在 `./actions.ts`，但必须由
     * `guard.run()` 签发一次性令牌后经 `guard/actions/` 调用（§4.4.1）。适配器只负责"怎么点"。
     *
     * 判墙实现留在本文件（`assertActionPage`，与 `guard.detectBlock` 共用 `detectBlockOf`），
     * 以 `assertActionPage` 的形式交给动作链 —— 一处实现两个消费者。
     */
    actions: createZhipinActions({ config, assertActionPage }),
  }
}
