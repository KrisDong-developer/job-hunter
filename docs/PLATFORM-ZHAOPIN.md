# 智联招聘（zhaopin.com）平台调研与适配器落地

> 调研时间：2026-09（全部结论来自线上实测或既有真实 dump，不是猜的）
> 产出：`src/host/platform/adapters/zhaopin/`、`test/platform/zhaopin.test.ts`、
> 夹具 `test/fixtures/zhaopin-sz.html`
> 前置阅读：`docs/ADAPTERS.md`（适配器维护手册）

---

## 0. 一句话结论

**智联有两个长得都像搜索页的路由，DOM 完全不同 —— 抓错那个会"看起来成功、其实全废"。**
真正的搜索页是 `/sou/jl<城市码>`；`/jobs?jl=` 是老路由：薪资被掩码成 `**-**元`、没有分页、
卡片选择器也换了一套。所以适配器**以 `/sou/` 为搜索入口**。

**但 `/sou/` 自己也会被 AB 分流到 `/jobs` 老路由**（2026-09-18 实测，同一地址 `/sou/jl765?kw=Java`
连打两次，一次 jobinfo 明文页、一次 `/jobs` 掩码页）。所以单靠路由判断不可靠：
**`__INITIAL_STATE__.positionList` 才是唯一权威数据源**，DOM 只负责"页面实际展示了什么"。
适配器据此做了两处兜底（见 §4.3），保证分流过去也不丢数。

---

## 1. 两条路由的区别（这一节是本文档存在的理由）

| | `/jobs?jl=765&kw=Java`（老） | `/sou/jl765`（现行） |
|---|---|---|
| 卡片选择器 | `.job-card` | `.joblist-box__item` |
| 标题 | `.job-card__title-clamp` | `.jobinfo__name`（`<a>`，带详情链接） |
| 薪资 | `.job-card__salary`，未登录 = **`**-**元`** | `.jobinfo__salary`，**明文**（`8000-16000元`） |
| 分页 | 无；第 20 条后是 `.job-list-login-gate` | 有 `.pagination` / `.soupager__*`，未登录可翻页 |
| 内嵌载荷 | `__INITIAL_STATE__.positionList`（**薪资是真的**） | 同左 |
| 页面条数 | 20 | 20（站点自报 `pages:5`、`positionCount:100`） |

**两者都能解析出 20 条**，所以"抓到了数据"**不能**证明抓对了页面。
判断依据只能是卡片选择器与薪资是否明文。

---

## 2. URL 契约（实测）

```
第 1 页（带关键词）：https://www.zhaopin.com/sou/jl765?kw=Java&order=4
第 2 页起（站点自己生成的链接）：https://www.zhaopin.com/sou/jl765/p2
带关键词翻页（站点 token）：/sou/jl765/kw01500O80EO062/p2
```

| 项 | 值 | 依据 |
|---|---|---|
| 基址 | `https://www.zhaopin.com/sou/jl<城市码>` | 线上实测（jl530/765/489 各返 20 条） |
| 城市 | `jl<数字码>`，**在路径段里**，不是 query | 车站表单 + `originalUrlParams` 双证 |
| 关键词 | `?kw=<明文>` | 实测 `?kw=Java` 返回 Java 岗位 |
| 页码 | `p`，**1-based** | 站点分页链接 |
| 排序 | `order=4` = 最新发布 | `queryParams` / `displayParams` 双证 |
| 每页 | 20 条 | 三页实测 |

### 2.1 三个会踩的坑

1. **path 里的 `kw` 只接受站点自己的 token。** `/sou/jl765/kwJava/p1` → 0 条 + `noJobTip`
   （"登录之后再搜索"）。**绝不要自己造 token。** 要翻页就读分页区里站点生成的 href。
2. **path 的 `/p<N>` 会覆盖 query 的 `p`**，两种形式不要混用。
3. **`sou.zhaopin.com` 已废弃**（302 到 `www`）。网上多份 2026 年的开源实现仍在用它，
   照抄它们的 host 会静默拿到 0 条。

---

## 3. 城市码（`jl`）

城市码**无法推导**：`/citymap` 只给拼音 slug（`/shenzhen/`），不给数字码。
可靠做法是**第一方抓取**：打开 `https://www.zhaopin.com/<slug>/`，页面里的搜索链接
就是 `/sou/jl<码>`。已分两轮实测：首轮 20 城全部命中且与三份互相独立的开源城市表
**逐项一致**；2026-09-18 二轮又补 26 城，每城均用 `/jobs?jl=xxx` 搜索页标题反查归属
确认（`match:true` 才收编），**与首轮无冲突**。

已固化进 `ZHAOPIN_CITY_CODES`（共 47 城）：

全国 489、北京 530、上海 538、广州 763、深圳 765、杭州 653、成都 801、南京 635、
武汉 736、西安 854、苏州 639、天津 531、重庆 551、长沙 749、郑州 719、青岛 703、
合肥 664、济南 702、厦门 682、大连 600、东莞 779；

二轮补：福州 681、宁波 654、无锡 636、佛山 768、昆明 831、贵阳 822、南昌 691、
太原 576、石家庄 565、沈阳 599、长春 613、哈尔滨 622、呼和浩特 587、南宁 785、
兰州 864、乌鲁木齐 890、海口 799、银川 886、珠海 766、惠州 773、中山 780、
温州 655、泉州 685、徐州 637、常州 638、嘉兴 656。

> 未列出的城市**不要猜**：猜错会静默搜到**别的城市**。请在 DB 覆盖里补
> `adapter-config/zhaopin` 的 `cityCodes`（合并语义，只写要加的键）。

---

## 4. 数据来源：DOM 为主 + 内嵌载荷互补

`/sou/` 的卡片 DOM 已经带齐标题/薪资/城市·区/公司/经验/学历，所以 **DOM 是主路径**
（它也是"页面实际展示了什么"的直接证据）。`__INITIAL_STATE__.positionList`
与卡片**渲染顺序一致**（实测都 20 条、逐条对得上），按索引配对，用它补 DOM 上没有的
`publishTime`、`industryName`、`companySize`、`companyNumber` 与岗位 id。

### 4.1 载荷的形态（改版时最容易坏在这里）

真实形态是**裸赋值**（不是 `window.__INITIAL_STATE__ = ...`）：

```html
<script>__INITIAL_STATE__={"pageMode":"search",...,"positionList":[...]}</script>
```

解析走 `document` 里 script 的**文本**，用**大括号配平**取完整 JSON（只有配平能处理嵌套
与字符串里的引号）。不读 `window.__INITIAL_STATE__` 是因为是否挂到 window 取决于打包器，
而脚本文本一定在 DOM 里 —— 少依赖一个"打包器行为"。

⚠️ **载荷绝不能整个返回**：`page.evaluate` 只能回传标量 JSON，而实测它 200 KB+。

⚠️ **载荷字段名是平台自己的**（`salary60` / `number` / `publishTime` / `showSkillTags[].tag`），
**不是** `RawJob` 的字段名。曾经把载荷先映射成 `salary`/`positionUrl` 再读，
内联解析后就对不上号，会让薪资与详情地址**静默变成空串** ——
正是 §4.2.4 要防的那种失败。

### 4.2 薪资掩码（已修过一次真 bug）

老路由未登录时 DOM 薪资是 `**-**元`，但**同一页的载荷里往往是真值**
（`salary60: "1-1.6万"`）。

正确优先级是：**DOM 真值 > 载荷真值 > 留空**。
第一版写成"DOM 是掩码就直接留空"，把载荷里的真值白白丢掉了；
改为掩码时**回退到载荷**，只有两边都没有真值才留空（那种记录由
`platform/validate.ts` 隔离进 `pending_repair`）。掩码**永远不允许**回流成 `salaryRaw`。

### 4.3 AB 分流兜底（2026-09-18 新实测）

`/sou/` 不再稳定落地：同一地址可能被服务端分流到老 `/jobs` 掩码页，此时
DOM 卡片是 `.job-card`（不在适配器的 `selectors.card` 里）、薪资掩码 —— 而
`positionList` 仍带真值。若不兜底，那一半请求会**误判成登录墙被跳过**，真数据也丢掉。

两处兜底（都在 `zhaopin.ts`）：
1. `detectBlockInPage`：`cards === 0` 时先查 `positionList` 是否有元素，有 → **不判撞墙**；
2. `extractJobsInPage`：`cards.length === 0 && state.length > 0` 时，凭载荷**补开出数**，
   岗位 id 取 `number`、薪资取明文 `salary60`。

顺带：**岗位 id 统一优先取载荷 `number`**（126 字段的权威 id），DOM 详情链接解析
退为兜底 —— 与 §4.1 的结论一致：载荷才是主数据源。登录态判定也优先信
`__INITIAL_STATE__.isLogged === true`，结构类名退为兜底。

---

## 5. robots 与合规取舍

`robots.txt`（原文已核对）含：

```
User-agent: *
Disallow: /*?*
```

即**禁掉所有带 query 的 URL**。而站点自己的分页链接是**无 query 的 path 形式**
（`/sou/jl765/p2`、`/sou/jl765/kw<token>/p2`），不在任何 Disallow 规则里。

**本适配器的取舍（已与用户确认）**：只在**第 1 页**用 `?kw=<明文>` 取词（这是唯一能按
关键词进来的方式），**第 2 页起优先用站点自己给出的无 query path 链接**，拿不到才退回
query 形式。这样合规面最大，同时保留关键词搜索。

> 另外 `robots.txt` 单独点名禁掉了 `?sl=` / `?el=` / `?we=` / `?et=` / `?ct=` / `?cs=`，
> 也就是**所有筛选维度**。而实测这些筛选参数在未登录时还会返回 0 条 + 登录墙
> （静默失败）。两头都指向同一个结论：**不要依赖服务端筛选**，抓回来在本地过滤。

---

## 6. 登录墙（静默失败，必须显式识别）

| 场景 | 未登录结果 |
|---|---|
| `/sou/jl765`（无筛选） | ✅ 20 条 |
| `/sou/jl765?kw=Java&p=2` | ✅ 20 条（**可翻页**） |
| 加任一筛选参数（`sl=` / `we=` / `el=`…） | ❌ **0 条** + 「登录之后再搜索，海量职位等你挑！」 |

关键：**它不报错，只是返回 0 条** —— 会被误读成"今天没有新岗位"。
所以 `detectBlock` 把「0 条 + 该文案」判为 `login-required`。

但**反过来**：`/sou/` 的正常结果页**不会**出现登录闸门，所以"有卡片"就足以否定登录墙；
`detectBlock` 不能在 0 条以外的地方因为"页面上有登录字样"就判墙。

登录态判断只认**结构类名**（`joblist-box__item-unlogin` / `positionlist__list-unlogin`），
不认文案 —— 右上角一直有登录入口，拿文案判断会"永远判定为未登录"。
`positionlist__login-foot` **在已登录时也存在于 DOM**（只是 `display:none`），
所以不能"存在即未登录"，必须先看它是否真的显示。

---

## 7. 反爬

- 验证码：极验（`geetest_*`）与阿里云 nc（`#nc_1_wrapper`）都点名。
- 实测**搜索页未撞到风控**（连续多次匿名请求均正常）。
- **没有公开的限流数值**，别把第三方文档里"我们自己拍的"数字当依据。
- 冲突/降级即停手交人工，**不硬重试**（C12）。

---

## 8. 详情页与登录态动作（2026-09-18 登录态实测）

### 8.1 详情页：**已实现**（登录态 / 游客态各不相同 —— 2026-09-18 实测订正）

**⚠️ 先纠正一句曾经写错的话**：本文档早先写"未登录即可访问 `/jobdetail/{id}.htm` 拿 JD 全文
（载荷里薪资是真实值）"—— **那是登录态的现象**。用全新 profile 跑 `npm run probe:zhaopin-anon`
（从不登录）实测后订正如下：

| 环节 | 未登录（游客） | 登录 |
|---|---|---|
| 列表页 `/sou/jl765/p1` | 正常渲染（标题即"热门职位"） | 正常渲染 |
| 详情页 | **能打开、不跳登录**；但**没有 `__INITIAL_STATE__`**（载荷 JD 0 字）→ 只能读 DOM：正文可见（实测 199 字，游客版）、**薪资 `**-**元`（掩码）**、公司标签可能缺 | 载荷 `jobDetail.detailedPosition.description` 有完整正文 + 真实薪资 |
| 会话页 `i.zhaopin.com/im` | **302 → `passport.zhaopin.com/login`** | 正常 |

于是 `authRequirement` 三格的定谳：`crawl: 'none'`、`actions: 'required'`（都是实测），
`detail: 'required'` —— **含义是"要拿到完整准确的详情必须登录"**：未登录虽然能开出页面，
但载荷缺失 + 薪资掩码 + 正文可能是游客版，靠 DOM 只能拿到降级结果。
（适配器对此的处理是对的：载荷优先、载荷缺失才退 DOM，且**掩码绝不回流**成薪资。）

其它实测要点（登录态，未登录即可访问 `/jobdetail/{id}.htm` 的路径同样适用）：
- JD 全文取自 `__INITIAL_STATE__.jobDetail.detailedPosition.description`（纯文本），DOM
  `.describtion-card__detail-content` 的 `textContent` 兜底（游客 clamp 只是视觉截断，不删 DOM 文本）。
- ⚠️ 未登录时 **DOM 层薪资/地址会掩码**（`**-**元` / `深圳**********`）—— 掩码**绝不回流**，
  识别到就记 `salary:masked-by-login` 并留空（由 `platform/validate.ts` 隔离）。
- ⚠️ 自动化访问时站点可能加载后重定向到地区页（反爬）。采集侧需在窗口期取值或带合法 UA/Cookie。
- 公司标签 `.company-summary__list > li` 顺序固定为 `[融资状态, 规模, 行业]`。
- 未登录时详情页**照样渲染「立即投递」按钮**，点它只会被弹到登录页 —— 所以 `sendResume`
  会先认登录页、点了之后落在登录页也按 `missing`（"没投出去"）报，而不是 `pending`。

### 8.2 收件箱 / 阶段探测（2026-09-18 登录态实测后落地）

数据源是 **`GET https://cgate.zhaopin.com/imapi/imV2/getTalkList`**（会话页 `i.zhaopin.com/im`）。

**调用形式（探针逐个变体实测过）**：`pageNo=1&PageSize=20&pageSize=20&sessionType=1&imMessageListType=1&communicateStatusType=0`
——**只要 Cookie**（页面上下文 `fetch` + `credentials:'include'`）。真实页面请求还带着
`at`/`rt`(query)、`x-zp-client-id`、`x-zp-page-request-id`，但四个变体（仅 cookie / +client-id /
+at,rt / 全都带）返回**完全一样**（200 / code 200 / 11 条），所以适配器只发最简形式。

**为什么走接口而不是 DOM**：DOM 侧有 `.im-session-item` 那一套（`__name` / `__company-name` /
`__job` / `__preview-text` / `__time` / `__badge`，第一屏 11 条），但**只有接口有方向与已读/已回标记** ——
猜方向会让"我发的话"变成"HR 说的"。会话行实测字段（节选）：
`sessionid` / `peerPartnerId` / `staffName` / `staffJob` / `companyName` / `jobTitle` / `jobNumber` /
`salary` / `text` / `lastSentenceType` / `unreadCount` / `sendTime` / `userId` / `senderId` /
`oppositeRead` / `oppositeReply` / `selfRead` / `selfReply`。

**方向判据只有一条**：`senderId === userId` ⇒ 最后一条是我发的（实测那条
`text:"已发送附件简历"` 两者相等，且确实是我这边发出的）。两个字段缺任何一个 → **抛错**，不猜。

**阶段判据**（`stageOfTalkRow`）——只用**有真实样本**的两个字段：
`unreadCount>0` → `replied`；`selfReply>0` → `delivered`；其余 → `null`。

⚠️ **`oppositeRead` / `oppositeReply` 实测被否决，不要用**：它们按命名像"对方已读/已回"，
第一版就拿它们判 `read`/`replied`。探针把**每行的值**dump 出来之后否掉了这个假设 ——
第 1 页 11 条会话里这两个字段**全是 0**，**包括那几条有 2 条 / 1 条未读的会话**
（未读 = HR 刚发来消息，按命名 `oppositeReply` 本该是 1）。语义与命名不符 ⇒ 用它判阶段
会把"HR 已回复"说成"没回复"。**没有样本支撑的字段一律不用。**
代价说清楚：**`read`（HR 已读）这一档在智联判不出来**，如实返回 `null`。

**翻页**：实测**有效** —— 页长 5 时第 2 页给出**另外 5 条**、与第 1 页重叠 0。
⚠️ 这里有个反例值得记：用默认页长 20 测时"第 2 页 0 条"，**单看那次会得出"翻页无效"的错误结论**
（该账号只有 11 条会话，本来就该空）。所以适配器按 `talkListPageSize`（默认 20）+
`talkListMaxPages`（默认 3 页 / 60 条）翻页，跨页按会话 id 去重。

「0 条必须可信」：接口调不通 / `code≠200`（含**翻页中某一页**失败）/ 结构变了 → **一律抛错**；
只有某页真的返回 0 条（不满一页）才算读完，那才是可信的结束。

### 8.2.1 投递：**已实现（页面驱动）**，走 `application.send` 两段式确认

⚠️ 一次点击 = 投简历 **+ 平台自动发一句招呼语**，**不可逆**（实测弹窗
`deliver-greeting-modal`：「已向对方发送简历和打招呼语」）。

**为什么不是接口化**（接口链已抓全：`application/preparation` → `bdp/interceptService/intercept`
→ `jobs/application` → `imapi/imV2/getUserPrologueNew`，但**没有采用**）：
* `preparation` 要 `rootOrgId`(公司 id) 与 `staffId`(HR id) —— 详情页载荷里这两个键
  **出现 0 次**（实测 grep），从 `{title, company, sourceUrl}` 推不出来；
* `application` 还要 `cityIds`/`pageCode`/`jobSource`/`attachmentDefaultFileId`/`businessSystem`/
  `stSourceCode` … 十来个上下文字段，**哪些必需没人知道**。
在**不可逆**的动作上编这些字段是不能接受的（编错 = 投错岗 / 投错简历）。
页面驱动让平台自己拼请求，我们只负责"点"和"看结果"。

**实现要点**（选择器都来自实测 markup）：
* 入口容器 `.summary-planes__action`（里面那个 `button.a-button`），**判能不能投靠文案**：
  「立即投递」= 可投；「继续沟通」= 已投过/已沟通 ⇒ **一个字都不点**（避免重复投递）；
* 真鼠标点击（CDP）→ 等 `.deliver-greeting-modal` 出现，并确认文案含「已向对方发送简历」
  （弹窗模板常驻 DOM，所以**可见性 + 文案**两个条件都要）；
* 送达语义：看到成功弹窗 → `delivered`；点了但没确认到 → `pending` +「去『我的投递』核对，
  **别立刻重试**」；本地文件 → fail-closed（智联只用平台内简历）。
* **审批文案会明写这句副作用**（`platform-facts.ts` 的 `applicationSideEffect` →
  `renderApproval` 的「同时会发生：…」）—— 用户按下"确认"之前必须知道这一下也在替他说话。

### 8.3 打招呼：**做不了**（如实标 `supportsGreeting = false`）

三条实测结论把这条路封死了：
1. 智联**没有独立的"打招呼"动作** —— 详情页上的沟通入口叫「先聊聊」
   （`button.summary-planes__prechat`，投递后变「继续沟通」），点它进的是 IM 会话；
2. IM 的发送走**网易云信**（`wss://weblink-bgp.netease.im/websocket` + `imapi/imV2/getToken`
   换 `partnertoken`），是私有 WS 协议，**没有可直接调的 HTTP 发消息接口**；
3. 平台自己那条"招呼语"是**投递时自动发**的（`imapi/imV2/getUserPrologueNew` 生成文案）。

### 8.4 投递：见 §8.2.1（**已实现 · 页面驱动**）

保留一条**实测教训**在这里（它是探针护栏的由来）：

⚠️ 详情页的「立即投递」**没有二级确认** —— 点一下就把简历投出去，**并自动发一条招呼语**，
弹 `deliver-greeting-modal`「已向对方发送简历和打招呼语」。
（探针第一版以为它会先弹"选简历"的窗，于是**真投了一份简历出去**。此后护栏按**语义**挡：
`RISKY_CLICK_TEXT` 里"投递/申请"类入口默认一律不点，只有 `ZHAOPIN_ALLOW_APPLY=1` 才放行。）

一次投递的完整接口链（都带 `at`/`rt`，**仅作证据留档；适配器没有采用接口路径**，理由见 §8.2.1）：

| 顺序 | 接口 | 作用 |
|---|---|---|
| 1 | `POST fe-api.zhaopin.com/c/pc/alan/jobs/application/preparation` | 取可选简历（`resumes[]`/`resumeNumber`）、`isShowAttachmentSelect` |
| 2 | `POST cgate.zhaopin.com/bdp/interceptService/intercept` | 风控拦截检查（`{"alert":{}}` = 放行） |
| 3 | `POST fe-api.zhaopin.com/c/pc/alan/jobs/application` | **真投递**（`jobNumbers`/`cityIds`/`resumeNumber`/`deliveryChannelType:1`） |
| 4 | `POST cgate.zhaopin.com/imapi/imV2/getUserPrologueNew` | 平台生成那条自动招呼语 |

---

## 8.5 无关键词的坑（搜索侧，2026-09-18 实测补记）

**不加关键词**的 `/sou/` 无城市码也同理 —— `/sou/jl<码>` 在**无 `?kw` 时**会被 302 到
`/jobs?jl=<码>`（热门职位 feed 页，无分页、卡片是 `.job-card`）。本适配器的 AB 分流兜底已能
覆盖这种落地（载荷有数据照样出数）。若想要"某城市全部岗位"，用关键词或接受 feed 页即可，
不必为此改 URL 构造。

---

## 9. 失效了怎么修

1. **先确认路由没变**：`/sou/jl<码>` 是否仍是搜索页、`.joblist-box__item` 是否仍有 20 个。
   若卡片数为 0，先分清是"真没结果""被登录墙"还是"改版了" —— 见 §6 的文案与 `noJobTip`。
2. **选择器是配置**：改 DB 覆盖即可，不必等发版
   （`setting(key='adapter-config', scope='platform', scope_ref='zhaopin')`）。
3. **载荷字段名对不上**时症状是"标题/薪资/公司还在，但发布时间/行业/公司规模全空"
   —— 那是 `stateText(...)` 的 key 需要跟着改（见 §4.1 的字段名清单）。
4. 改完跑 `npm test`；`test/platform/zhaopin.test.ts` 里有「按源码重建」护栏，
   任何页面函数引用了模块级符号都会在那里炸出来。

---

## 10. 调研脚本留档

调研期间用过的一次性探针（构造夹具、比对路由、抓城市码）**没有进仓库**：
它们的价值已经固化成本文档的结论、代码注释与测试。需要复现时按 §2 / §3 / §9 的步骤重跑即可。

**但登录态走查探针进仓库了**：`npm run probe:zhaopin-login`
（`test/tools/probe-zhaopin-login.ts`）—— 它是 §8 全部结论的唯一来源，改选择器/接口前先跑它。

- **自动走查（默认）**：自己导航到真实岗位详情页 → 点页头消息入口进 IM 页 → 探测会话列表接口
  （**四个调用变体**逐个试，报告里 `tries[]` 会说清哪个拿到了数据）→ 探**翻页语义**与**每行阶段字段的值**
  （`pages[]` / `smallPage[]` / `flags[]`；后者就是"`oppositeRead`/`oppositeReply` 到底表示什么"的证据来源）
  → 投递入口只取证不点。
- **危险护栏（按语义分组，默认全关）**：`ZHAOPIN_ALLOW_CHAT=1` 才允许点「先聊聊」，
  `ZHAOPIN_ALLOW_APPLY=1` 才允许点「立即投递」（**会真的投出一份简历**）。
  这套护栏是被 §8.4 那次真实误投逼出来的 —— 之前按词面挡"提交/确认/发送"，
  而智联的提交按钮叫「立即投递」。
- **产物落 `.probe-zhaopin-capture/`**（`.gitignore` 的 `.probe*` 覆盖），**刻意不写 `test/fixtures/`** ——
  那里是被用例硬编码钉住的夹具。报告里的 `talkListProbe.tries[]` 会说清"哪个调用变体真的拿到了数据"。
- `ZHAOPIN_AUTO_WALK=0` 回到"只录制、你自己走"的手动模式；`ZHAOPIN_PROFILE` 指持久化 profile
  （默认 `.probe-zhaopin-profile`，**注意它与插件运行时那份 `browser-profile` 不共享登录态**）。

**还有一个匿名探针**：`npm run probe:zhaopin-anon`（`test/tools/probe-zhaopin-anon.ts`）——
用**全新 profile、从不登录**跑一遍列表页 / 详情页 / 会话页，逐项记录
"载荷在不在、JD 有多长、薪资是不是掩码、入口在不在、最终 URL 落到哪"。
§8.1 那张未登录 vs 登录的对照表就是它的产物。**凡是"要不要登录"的问题，先跑它，别靠推断。**
产物落 `.probe-zhaopin-anon-capture/`。
