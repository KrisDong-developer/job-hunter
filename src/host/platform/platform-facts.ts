/**
 * 平台事实表（成熟度 + 登录需求）。
 *
 * ## 为什么单独一张表，而不是写在各适配器里
 *
 * 这两样是**人对平台的认知**，不是代码逻辑：成熟到什么程度、哪个环节要登录。
 * 它们最怕的不是写错，而是**散**：散在 10 个文件里，没人能一眼看出
 * "哪几个平台其实是没验过的"。集中一张表，才能：
 *   * 一次 review 全看清（改一个平台时也顺带看到邻居的状态）；
 *   * 被契约测试钉住（`test/platform/registry.test.ts`：注册了的适配器必须有事实行）；
 *   * 直接进 DTO 给界面（用户勾平台前就能看到"这个还只是实验性的"）。
 *
 * ## 填表纪律
 *
 *   * `unknown` **是合法值**，而且比猜一个值更有用 ——
 *     "我们不知道它要不要登录"本身就是用户该知道的信息；
 *   * `verifiedAt` 只在**真有真机验证记录**时填。有夹具但没标注日期的填 `null`；
 *   * `notes` 写**已知缺口/陷阱**，写到人看了就知道该怎么办的程度
 *     （"详情页需 securityId" 比 "部分未实现" 有用）。
 */
import type { AuthRequirementValue } from '../../shared/contract/enums/platform.js'
import type { AdapterMaturityFact, AuthRequirementFact } from './types.js'

export interface PlatformFacts {
  maturity: AdapterMaturityFact
  authRequirement: AuthRequirementFact
  /**
   * 平台的**每日动作安全上限**（平台事实）。
   *
   * 与用户的 `dailyLimits` 是**两层**：用户设的是"我今天想投多少"，
   * 这里是"这个平台允许多少"（超出会被限流、甚至标记账号）。取两者**较小的**。
   *
   * `undefined` = **不知道** —— 那时只有用户自己的额度在管。
   * 不知道就不编一个保守值：编出来的数字会平白拦掉合法使用，
   * 而"少投了几个"和"被平台盯上"都由用户承担，不该由我们瞎猜。
   */
  dailyCaps?: { greeting?: number; application?: number }
  /**
   * 投递时**简历从哪来**（平台事实）。
   *
   * `'platform-only'` = 只能用**平台上已有的那份**简历：本地附件一律 fail-closed
   * （实测如此，不是"没查"）。`'local'` = 支持上传本地文件。
   *
   * `undefined` = 该平台不能投递（没有 `sendResume`），或未实测 —— 两者都按
   * "本地附件发不出去"处理（fail-closed），但**说不出为什么**，所以批量预览里
   * 只会说"这个平台没接投递"，不会替它编一个理由。
   *
   * ⚠️ 这一格存在的意义：批量投递的预览要能**逐条**说清"为什么投不了"。
   * 光知道"适配器实现了 sendResume"不够 —— 实现里对非空 `filePath` 直接返回
   * `delivery: 'missing'`，那才是用户实际会撞到的那堵墙。
   */
  resumeSource?: 'platform-only' | 'local'
  /**
   * 投递时**平台自己还会做**的额外动作（平台事实，进审批文案）。
   *
   * 为什么要有这一格：智联的「立即投递」一次点击 = 投简历 **+ 平台自动发一句招呼语**
   * （实测结果弹窗：「已向对方发送简历和打招呼语」）。这是用户在按下"确认"之前就必须知道的事 ——
   * 只写"用哪版简历"是不够的，他同时还在替自己说了一句话。
   *
   * `undefined` = 该平台没有这类副作用（实测如此，不是"没查"）。
   */
  applicationSideEffect?: string
  /**
   * 打招呼时**平台自己还会做**的额外动作（平台事实，进审批文案）。
   *
   * BOSS 求职者端实测：点「立即沟通」会**先由平台替你发一句默认招呼语**，随后适配器才发
   * 用户那段 text —— 一次 `greeting.send` 会在会话里留下**两条**消息。
   *
   * 这里如实写出来而不是"让适配器少发一条"：用户要的正是他那段话术，不能替他省掉；
   * 但"对方会先看到一句不是你写的问候"必须在他按"确认"之前就知道。
   *
   * `undefined` = 该平台没有这类副作用（实测如此，不是"没查"）。
   */
  greetingSideEffect?: string
}

/** 不知道就说不。没验证过的环节一律 `unknown`。 */
const U: AuthRequirementValue = 'unknown'

/**
 * 已注册平台的认知表。键 = `SiteAdapter.id`。
 *
 * 分级口径见 `MATURITY_LEVEL_LABEL`；这里的分档依据是**证据强度**：
 *   * `stable`       = 真实夹具 + 真机冒烟通过；
 *   * `calibrated`   = 真实探针/响应夹具验证过，但有已知未覆盖的部分；
 *   * `experimental` = 夹具缺失、关键契约未确证、或没有测试；
 *   * `disabled`     = 平台侧已不可用（需改配置才启用）。
 */
export const PLATFORM_FACTS: Record<string, PlatformFacts> = {
  '51job': {
    maturity: {
      level: 'stable',
      verifiedAt: '2026-09-18',
      notes:
        '真实夹具 51job-sz.html（684KB）+ 真机冒烟（20 条 / 四核心字段 20/20）。阿里云 WAF 滑块；「今日投递太多」需 200ms×10 轮询。' +
        '2026-09-21 对标 zhipin 补齐功能深度（证据分层，逐条见适配器 config.ts）：' +
        '① `detail.extract` 落地 —— 选择器为**候选链、未实测**（无详情页夹具），锚不到留空 + 记 note，' +
        'DB 可覆盖校准（校准入口 `probe:51job` 现会顺带采详情页快照）；' +
        '② 五个高危动作落地 —— 投递链路（`button.btn.apply` → `.apply-component-resume-dialog` → ' +
        '`.success_title`）与「去聊聊」的未登录扫码形态（`.chat-popover`）来自**搜索夹具实证**；' +
        '登录态站内会话 DOM 与消息页地址（`chatUrl`）候选待校准，路径 fail-closed；' +
        '③ `auth.isLoggedIn` 升级为结构性锚点（未登录侧 `.loginBtnClick` 夹具实测；已登录侧候选）。',
    },
    authRequirement: { crawl: 'none', detail: U, actions: 'required' },
    // 投递弹窗（.apply-component-resume-dialog「选择投递简历」）选的是账号内简历 ——
    // 夹具样式证据 + 无本地文件直投入口（sendResume 对 filePath≠null fail-closed）。
    resumeSource: 'platform-only',
  },
  zhaopin: {
    maturity: {
      level: 'stable',
      verifiedAt: '2026-09-18',
      notes:
        '列表与详情夹具取自真实 dump（合成结构）。投递上限约 100；第 2 页起用无 query path；详情页有 AB 分流兜底。' +
        '2026-09-18 登录态走查（`probe:zhaopin-login`）后新增三件事：① 收件箱走 `imapi/imV2/getTalkList` 接口' +
        '（**只要 cookie** —— 四个调用变体实测等价），`readInbox`/`detectStage` 已落地（方向判据 senderId===userId）；' +
        '② 沟通入口叫「先聊聊」，且 IM 发送走**网易云信私有 WS**（`imapi/imV2/getToken` 换 token）→ ' +
        '智联没有独立的"打招呼"动作，`sayHello` 做不了（如实标 supportsGreeting=false）；' +
        '③ 「立即投递」**一步到底、不可逆**（一次点击 = 投简历 + 平台自动发一条招呼语，`deliver-greeting-modal`）→ ' +
        '`sendResume` **已实现**（页面驱动：点「立即投递」→ 验成功弹窗），走 `application.send` 两段式确认；' +
        '接口路径刻意不用（`preparation` 要的 `rootOrgId`/`staffId` 在详情页载荷里出现 0 次，不可逆动作上不能编）。' +
        '2026-09-18 未登录实测（`probe:zhaopin-anon`，全新 profile）钉住了 `authRequirement`：' +
        '列表页未登录正常渲染（`crawl: none`）；详情页**能打开但不跳登录**、然而**没有 `__INITIAL_STATE__`**' +
        '（载荷 JD 0 字）→ 只能读 DOM：正文为游客版、**薪资是掩码 `**-**元`**（`detail: required` 的含义是' +
        '"完整准确的详情要登录"）；会话页 302 到 `passport.zhaopin.com/login`（`actions: required`）。' +
        '另：未登录时详情页**照样有「立即投递」按钮**，点它只会被弹到登录页 —— `sendResume` 因此先认登录页。',
    },
    // 平台侧硬事实：投递上限约 100（ADAPTERS §7.2 实测）
    dailyCaps: { application: 100 },
    // 实测：智联的投递入口不接受本地文件（会话页的 file input 都不是"发给 HR"的）
    resumeSource: 'platform-only',
    // 实测：一次点击 = 投简历 + 平台自动发一句招呼语（内容由平台生成，见 `getUserPrologueNew`）
    applicationSideEffect:
      '智联会在投递的同时**替你发一句招呼语**（内容由平台生成，实测形如「您好，请问<岗位>职位还在招人吗？…」）。' +
      '这句不是你写的，但对方会收到。',
    authRequirement: { crawl: 'none', detail: 'required', actions: 'required' },
  },
  liepin: {
    maturity: {
      level: 'stable',
      verifiedAt: '2026-09-20',
      notes:
        '真实探针夹具（列表 p1/p2 + 接口 JSON），校准 42/42。检测「CDP 控制页面」本身且探测调试端口 → 必须 patchright 启动式。聊天按钮需 hover。' +
        '2026-09-18 未登录定谳：全新 profile（无 Cookie）未登录态下搜索列表完整可用（42 卡 + 接口采样成功），夹具即该次捕获 —— 适配器 searchWithoutLogin=true 成立。' +
        '2026-09-19 登录态走查（`npm run probe:liepin-chat`）补齐六件事：' +
        '① 沟通入口 `a.btn-main`/`a.btn-chat`「聊一聊」、投递入口 `a.btn-minor`「投简历」；' +
        '② 收件箱入口是侧边栏 `#im-c-entry`（**不是 `<a>`**，文案「我的沟通」），点了开 AntD 抽屉而非换页；' +
        '③ IM 会话列表走 `im.c.contact.get-contact-list`（`curPage` 0 起）；' +
        '④ 打招呼走 `im.c.chat.open-chat`（`jobId` 用**数字 jobId**，不是详情页 URL 上的 id），' +
        '门坎是**简历完整度**：没完善时 `{"flag":0,"code":"30011","msg":"简历完整度不足"}`，完善后 `flag:1` 受理；' +
        '⑤ **猎聘不会替你发消息**（与 BOSS 相反）：受理后会话里只有一条平台系统消息' +
        '「我们为您生成了合适的打招呼语，去使用＞」（`extType:200` / `lptd://lp/p/autoSayHi`）⇒ ' +
        '平台只是**生成建议**，真正那句话发没发取决于用户点不点。⇒ `greetingSideEffect` 写的是' +
        '「插入一条建议卡片、不代发」（2026-09-20 起随 `sayHello` 落地补上），**不是**照抄 BOSS 那句"平台先替你发一句"；' +
        '⑥ 「聊一聊」点完会立刻翻成「继续聊」，**即使被平台拒绝也翻**、刷新即复原 ⇒ 按钮文案不能当阶段判据。' +
        '⑦ **登录检测已补**（结构性标记，两份真实快照对比定案）：`#header-quick-menu-user-info`=已登录、' +
        '`.header-quick-menu-not-login-item`=未登录；⚠️ 侧边栏那个入口的标题会从「我的沟通」变成' +
        '「有新消息」（有未读时）⇒ 别把它当固定文案用；' +
        '⑧ **搜索接口的请求头门槛**：适配器的"接口化列表"通道曾因缺 `x-fscp-*` 一族而**静默回退 DOM**' +
        '（服务端回 `-1400` 但 HTTP 200），修复后在线复验 `42 条 / publishedAt 42 / industry 42`；' +
        '那套头不需要 `x-xsrf-token`、也不需要读 cookie，见 `LIEPIN_API_HEADERS`。' +
        '⑨ **城市码表已补齐 370 个**（2026-09-19 逐省点开页面自己的「请选择城市」弹窗采得，' +
        '原始数据见 `test/fixtures/liepin-city-codes.json`）—— 此前城市维度只有「全国」；' +
        '同时把跨平台城市目录 `CITY_DIRECTORY` 从 52 扩到 373 并把猎聘纳入"码表不许与目录脱节"的检查。' +
        '⚠️ 2026-09-19 收件箱与阶段探测**都刻意不实现**，理由是：' +
        '会话行形状已经拿到（`id`/`oppositeUserId`/`latestMsgTime`/`lastPayload`/`unReadCnt`/`direction`，' +
        '且 `totalCount` ' +
        '`pageSize`/`hasNext`/`hasMore` **四项全都不可信** —— 实测 list 有 1 条而它们全是 0/false），' +
        '但 **`direction` 的语义仍没定论**（两行样本的 `0`/`1` 与"消息方向""谁先发起"两种解释都吻合，' +
        '类型还不一致），且**猎聘 IM 是"人"维度**（会话行里一个岗位字段都没有，而打招呼是按岗位发起的）' +
        '⇒ `platformJobId` 与按岗位的 `detectStage` 在收件箱这一层对不上。' +
        '不过第二批样本（一位猎头主动发来）解掉了一半：`unReadCnt>0` 的正向样本有了，' +
        '且 `lastPayload.ext.extType` 能区分消息种类（200=平台系统提示、202=带岗位卡片的真实消息，' +
        '岗位信息就在 `extBody.bizData` 里）。' +
        '⑩ **2026-09-20 第二轮登录态探针**（`npm run probe:liepin-chat`，会话数 2→8，并首次采到会话面板）——' +
        '补齐三件事、落地一件事：**① IM 接口的门坎与搜索接口同款**（六项静态头 + 三项现造遥测才 `flag:1`；' +
        '只给静态头即 `{"flag":0,"code":"-1400"}`，且体的 content-type 必须是 urlencoded）；' +
        '**② 修掉一个真 bug —— platformJobId 双通道不一致**：接口给 `job.jobId`（8 位数字）、DOM 给 URL 路径 id' +
        '（10 位），实测同一批 42 条里 DOM 的 `pgRef` 集合与接口 jobId 集合**完全相等**，而 URL 路径 id 只有 19/42 相等' +
        '⇒ 统一到 `pgRef` 的数字 id（`LiepinConfig.jobPgRefPattern`），否则换通道就会把同一批岗位写两遍；' +
        '**③ 落地 `readInbox`**（`get-contact-list` 接口 + 按"本页不满即停"翻页）：`direction` **不作为判据**，' +
        '改用 `unReadCnt>0 ⇒ hr` 与 `extType 200（平台替我生成的招呼语建议）⇒ me` 两条有样本的规则、其余按 `hr`' +
        '（与 zhipin 同口径：漏报比误报贵）⇒ `supportsInbox` 随实现改为 true。' +
        '**仍未实现**（且这次说清了缺什么）：`sendResume` —— 投递入口 `a.btn-minor`「投简历」只取过证、' +
        '有没有二级确认未实测，不可逆动作上没有实测过的确认链路就不写；' +
        '`detectStage` 亦未实现：会话按**人**归并、而调用只给 `{title, company, sourceUrl}`，' +
        '拿不到与 `bizData.jobId`（数字 id）对齐的键 —— 只有 HR 主动发来的会话带岗位卡，覆盖不全。' +
        '⑪ **2026-09-20 发送实验（`LIEPIN_ALLOW_SEND=1 npm run probe:liepin-chat`）—— `sayHello`/`reply` 落地**：' +
        '在一条真实会话里真键盘打「测试，请忽略。」+ 回车，**三重证据闭环**（textarea value 上屏 → ' +
        '`.im-ui-message-item-send` 出现同文本且 loading 图标归 `hide` → `get-contact-list` 第一行 `lastPayload` 就是这句话）。' +
        '两次实验还钉死一个坑：**点击落在动画中的弹窗上、焦点没进输入框时，`insertText` 全部落空**（value 恒空、Enter 落空）——' +
        '所以实现里输入前必校验 value、失败再聚焦并回退真键盘路径，两路都不上屏就绝不按回车。' +
        '另两条结构事实：详情页上 `#im-c-entry` 的内层 `.im-ui-basic-entry` 是**懒加载**的（搜索页稳定有），' +
        'reply 因此固定从搜索页进抽屉；会话以 chat modal（`.im-ui-basic-chat-modal`）形式在当前页打开。' +
        '发送类动作的受理/被拒判据：被拒弹 `.complete-resume-modal`（code 30011）、受理则输入框出现。',
    },
    greetingSideEffect:
      '猎聘会在会话里插入一条**「打招呼语建议」系统卡片**（文案「我们为您生成了合适的打招呼语，去使用＞」），' +
      '但**不会替你发出任何消息**（与 BOSS 相反）——真正发给对方的就是你确认过的那段话术。',
    // 三格**都已定谳**（2026-09-19 更正 detail）：
    //   crawl=none   —— 2026-09-18 全新 profile 未登录实测：搜索列表完整出数（42 卡）。
    //   detail=none  —— **同一批未登录夹具**：`test/fixtures/liepin-detail.html` 的页头是
    //                   `.header-quick-menu-not-login-item`（未登录结构标记，×3），而它里面
    //                   JD 正文完整（>200 字）、薪资是**明文 `15-30k·14薪`**（不是掩码）
    //                   ⇒ 详情页未登录可读全。**此前写 required 是照抄"详情页要 securityId"
    //                   那个印象，与自家夹具矛盾** —— 现由用例
    //                   「authRequirement.detail=none 的论据」钉住（夹具换成登录态捕获会红）。
    //   actions=required —— IM/打招呼都建立在登录会话上（`im.c.chat.open-chat` 等接口靠 cookie 认人）。
    authRequirement: { crawl: 'none', detail: 'none', actions: 'required' },
  },
  zhipin: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-18',
      notes:
        '只有**未登录**夹具：单页 15 条、无分页区、薪资元素在但为空。详情页要带完整 securityId（登录后才有），登录夹具补齐后再升档。' +
        '⚠️ **薪资数字是字体混淆的**（2026-09-18 定案）：登录态下 `.job-salary` 的文本是 ' +
        '**私有区码点**（实测 10 个连续码点 U+E031–U+E03A 一码一数字），靠外部 CSS 的 @font-face ' +
        '画成人眼看到的数字 ⇒ 适配器检测到就置空并记 `salary:obfuscated`，**绝不当薪资写库**；' +
        '所以列表薪资目前**拿不到**（明文在 `wapi/zpgeek/search/joblist.json` 的 `salaryDesc`，' +
        '连接键 encryptJobId ↔ 卡片 href id，但该接口的 method/请求参数还没探明，见 ADAPTERS §7.2）。' +
        '详情页选择器已由 `probe:zhipin-chat` 的**真实登录态快照**（2026-09-18，两次不同岗位）校准：' +
        '经验/学历用 `.text-experiece`/`.text-degree`，规模/行业用 `.sider-company p` + `i.icon-scale`/`i.icon-industry`/`i.icon-stage`，' +
        'JD 显式排除 `.job-detail-company`（页面上有两个 `.job-sec-text`，第二个是公司介绍）。' +
        '**会话级选择器也已实测确认**（登录态 + 一条真实会话）：`#chat-input`（div.chat-input[contenteditable]）、`.btn-send`、' +
        '`.chat-record`、`li.message-item.item-myself`、`div.message-content`、`i.message-status.status-delivery`；' +
        '收件箱行是 `li[role=listitem]`（在 `.user-list > .user-list-content > ul[role=group]` 里，**不是** `.user-list` 直接子级），' +
        '行内 `.time`/`.name-text`/`.name-box`/`.last-msg-text` 全部命中 —— **招聘者端**的 `.chat-list-wrap`/`.chat-message-filter-left`/`.geek-item-wrap` 在求职者端命中 0。' +
        '两个**纠正 BossHunter 的实测结论**：① 工具条按钮是 `.toolbar-btn`（不是 `.operate-btn`），' +
        '且「发简历」要求**双方回复后**才可用（未回复时带 `unable` + aria-label 明写）；' +
        '② 会话页上的 `input[type=file]` 只有「上传附件简历到我的简历」与「发送图片」两个，**没有**把本地文件发给 HR 的入口。' +
        '仍未实测：`.choose-resume-dialog`（弹窗没机会打开）、会话行未读徽章、首次沟通/预设招呼语弹窗。' +
        '2026-09-19 补齐两件（`probe:zhipin-login` 复跑取证）：' +
        '① **登录检测已补**（`auth`）—— 此前 `auth === undefined` 会让 `platforms.loginStatus` 直接抛' +
        '「没有声明登录入口」、`account.loggedIn` 恒 false ⇒ 打招呼/收件箱全实现了、入口却永远不亮；' +
        '锚点是页头 `a[ka="header-username"]`（登录）/ `a[ka="header-login"]`（未登录），' +
        '±1 命中数由两份真实快照（未登录夹具 vs 登录态快照）实测；' +
        '② **列表薪资改用接口明文**：`POST wapi/zpgeek/search/joblist.json`（表单体，' +
        '**只要 cookie + content-type 就通**）的 `zpData.jobList[].salaryDesc`，' +
        '连接键 `encryptJobId ↔ 卡片 href id`（实测 **15/15** 命中）⇒ DOM 拿不到的薪资现在能补上；' +
        '列表本身仍以 DOM 为准（BOSS 的 URL 带 `securityId`，不可重构）。' +
        '⚠️ 顺带纠正：**接口的 `page` 参数是有效的**（站点滚动时自己发 page=1,2,3…），' +
        '旧结论"只能滚动加载"说的是**搜索页 URL 的 `&page=` 被 SPA 忽略**，两者不是一回事；' +
        '适配器的翻页模型未变（`hasNextPage` 仍恒 false、深度仍走 `scrollRounds`）。',
    },
    // 平台侧硬事实：打招呼日上限约 150（ADAPTERS §7.2 实测）
    dailyCaps: { greeting: 150 },
    // 实测：BOSS 求职者端会话页**没有**"把本地文件发给 HR"的入口
    // （`input[type=file]` 只有"上传附件简历到我的简历"与"发送图片"两个）⇒ 适配器对
    // 非空 filePath fail-closed。另外「发简历」还要**双方回复后**才可用。
    resumeSource: 'platform-only',
    // 实测：点「立即沟通」时平台会**先替你发一句默认招呼语**，随后适配器才发用户那段话术
    // —— 一次 `greeting.send` 在会话里留下**两条**消息（计数仍算一次动作）。
    greetingSideEffect:
      'BOSS 会先替你发一句**平台默认招呼语**（内容由平台生成），然后才发你这段话术 —— ' +
      '对方会连着看到两条开场消息。',
    authRequirement: { crawl: 'none', detail: 'required', actions: 'required' },
  },
  waiqi: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-21',
      notes:
        '真实响应夹具（页面 + 载荷 + 详情）。服务端翻页坏 → 声明 1 页（≤50 条/页）是平台事实，不是保守取舍。' +
        '接口 code=1022 表示未登录。2026-09-21 落地 detail 补抓：匿名 GET details 接口实测 code=1000 且 ' +
        'loginStatus=0 仍返回完整 JD（description 原文 + translateDescription 平台中文翻译，夹具 ' +
        'waiqi-detail-payload.json）；JD 走接口不解析 DOM，导航 /position/detail 的 robots 口径更新见适配器文件头' +
        '（DB 覆盖 detailApiEnabled=false 可下线）。同日修正 supportsInbox→false（无实现亦无平台证据）。',
    },
    // detail=none：2026-09-21 匿名实测（loginStatus=0 时 details 接口给全量 JD）。
    authRequirement: { crawl: U, detail: 'none', actions: 'required' },
  },
  guopin: {
    maturity: {
      level: 'experimental',
      verifiedAt: null,
      notes: '**当前完备度最低的在注册适配器**：城市码表为空、分页未确证、`hasNextPage` 恒 false、且没有任何测试（只有探针）。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  sinojobs: {
    maturity: {
      level: 'calibrated',
      verifiedAt: null,
      notes: '真实响应/页面夹具（列表 + 载荷 + 详情）。按接口 `total` 判页。夹具未标注抓取日期。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  indeed: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-21',
      notes:
        '2026-09-21 `probe:indeed-login` 两跑实证（产物 `.probe-indeed-capture/`）：cn.indeed.com 搜索**未登录即可用**（广州市 16 条，jobKey/标题/公司/城市全中）—— 2026-09-18「已停运」结论过时。' +
        '首访可能被送 secure.indeed.com/auth 登录墙（跨域由 expectedHost 判 blank；profile 有 cf_clearance 后直出）。' +
        '登录判据 = 页面载荷 "isLoggedIn"（匿名/登录页 false、已登录 true，两侧实测）→ auth.isLoggedIn 已落地。' +
        '翻页容器 nav[aria-label="pagination"]（页头 gnav 会干扰宽泛选择器）、start 步进 = 10（翻页 href 算术）。' +
        '**detail 探针（同日三页 3/3）**：标题 h1[data-testid=jobsearch-JobInfoHeader-title] / 公司 inlineHeader-companyName / ' +
        '地点 inlineHeader-companyLocation / JD #jobDescriptionText → detail.extract 已落地（夹具 indeed-detail.html）；' +
        '无 JSON-LD JobPosting，详情发布日期唯一来源 = 内嵌载荷 hiringInsightsModel.age；详情页匿名访问未测（探针在登录态 profile 下跑）。' +
        '**列表发布日期已有源（同日按夹具载荷复核）**：同页内嵌 mosaic-provider-jobcards 载荷的 formattedRelativeTime ' +
        '（「25天前」/「30+天前」，jobkey↔jk 15/16 重合）→ readListPage 走"DOM 定集合、载荷补字段"通道（零额外请求）。' +
        '缺口：薪资**两侧**确认无源（DOM 节点 0 命中 + 载荷 salarySnippet 匿名侧恒空）→ salary_raw 不进必需字段。',
    },
    authRequirement: { crawl: 'none', detail: U, actions: 'required' },
  },
  hiredchina: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-20',
      notes:
        '真实页面夹具（列表 p1/p2 + 详情，来自 hcweb 同源子域）。列表卡片不在 DOM 里（数据在 RSC 流 initialData.list，卡片是客户端渲染）→ 解析走 payload 通道；薪资约四成 keep.secret（→ Negotiable）故 salary_raw 不进必需字段；详情页 SSR 直出、选择器已全套校准。翻页满页判据（payload 无分页元信息）。',
    },
    authRequirement: { crawl: U, detail: U, actions: 'required' },
  },
  linkedin: {
    maturity: {
      level: 'calibrated',
      verifiedAt: '2026-09-20',
      notes:
        '2026-09-21 按公开稳定结构实现；**两轮真机校准**：`probe:linkedin-login`（登录侧）+ ' +
        '`probe:linkedin-v2`（深度探针，产物 `.probe-linkedin-capture/v2-report-*.json`）。' +
        '**v2 关键结论**：① **CSP 启用 Trusted Types** —— 页面内 `innerHTML`/`DOMParser` 都抛 ' +
        '「requires TrustedHTML」，适配器 v1 的「fetch+注入解析」在真机静默失败 → 已重构为' +
        '**导航式**（gotoSearch 直接导航 guest 端点，解析活 DOM）；② guest 端点只认 ' +
        'keywords/location/start/f_TPR（r86400 实测生效），**f_E/f_WT/f_AL/sortBy 全被忽略**' +
        '（f_E=4 与对照 id 差异 0）→ 这四个维度已删；③ 翻页定案：start=0/10/20 三页各 10 条、' +
        '零重叠、匿名侧同页大小；④ 详情页 `/jobs/view/{id}` 对游客 SSR 直出（无 authwall，' +
        '锚点全中：h1.topcard__title / .description__text--rich / criteria 列表）→ ' +
        '`detail.extract` 已落地、无需登录；⑤ 薪资无源（卡片 0/10、详情 0 命中 —— 藏给登录会员）' +
        '⇒ salary_raw 不进必需字段。**login 探针结论**：登录标记两侧定案 ' +
        '（.global-nav__me-photo 登录 1/未登录 0）→ auth.isLoggedIn 已落地；登录态搜索页初始 ' +
        'DOM 0 卡片（guest 视角）—— 采集全靠 guest 端点。**2026-09-21 `probe:linkedin-actions` ' +
        '登录态只读取证（三轮）**：`readInbox` 已落地且复验一致（Messaging 会话卡 ' +
        'msg-conversation-card 族有真机快照 + test/fixtures/linkedin-messaging.html 夹具钉住；' +
        'DOM 无未读/方向标记 → unread 恒 false、direction 按「漏报比误报贵」记 hr；' +
        '「人」维度无公司/岗位字段）。**第三轮关键翻案**：直连 /jobs/view/{id} 两轮不渲染是' +
        '路由形态问题 —— 登录态搜索页 + currentJobId 的**右侧详情面板正常渲染**：' +
        '.jobs-apply-button=2（aria-label 区分 Easy Apply/站外申请）、.jobs-save-button=2；' +
        '**薪资并非无源**：登录态搜索页列表卡（[data-occludable-job-id]）部分展示薪资明文' +
        '（实测 ¥20K/月 - ¥27K/月，节点类名是随机混淆串 → 按文本抠）→ 已接**可选回填通道**' +
        'salaryPanelEnabled（默认关，DB 可开；按 occludable id 回填空薪资，对不上留空）。' +
        'sendResume 仍 fail-closed：Easy Apply 是多步表单，入口有了但**提交链路**没有' +
        '（真实投递一次取证之前不写）；/my-items/applications/ 恒 404 空态 → detectStage 无证据。' +
        '中国版 InCareer 2023-08 停运，默认全球站。' +
        '风控业内最强一档（专属 999 / authwall / checkpoint）→ antiBot=high、默认 2 页上限 5 页。',
    },
    // crawl=none：guest 端点匿名可读（v2 真机：匿名侧 200、10 条）；
    // detail=none：详情页对游客 SSR 直出（v2 真机：匿名打开无 authwall、JD 全文直出）；
    // actions=required：readInbox / 后续动作全部建立在登录态上。
    authRequirement: { crawl: 'none', detail: 'none', actions: 'required' },
  },
}

/**
 * 取某个平台的事实。
 *
 * 未登记的 id **不抛错**（否则新增适配器会以最难查的方式失败），
 * 而是给一个**保守默认**：实验性 + 全部未验证。
 * 这会同时让它在界面上显示为"实验"，以及被契约测试点名。
 */
export function platformFacts(id: string): PlatformFacts {
  return (
    PLATFORM_FACTS[id] ?? {
      maturity: { level: 'experimental', verifiedAt: null, notes: '未登记的平台事实 —— 请补 PLATFORM_FACTS。' },
      authRequirement: { crawl: U, detail: U, actions: U },
    }
  )
}
