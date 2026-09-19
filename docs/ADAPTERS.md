# 适配器维护手册

> 目标：平台改版把选择器打坏时，能**不用重读一遍全部代码**就完成定位 → 复现 → 修好 → 验证。
> 依据：`ARCHITECTURE.md` ADR-19 / R5 / D-18。

## 0. 现状一览（别按文档假设）

> **成熟度与登录需求不在本文档维护。** 它们的权威表是
> [`src/host/platform/platform-facts.ts`](../src/host/platform/platform-facts.ts) ——
> 由 `test/platform/facts.test.ts` 钉住，并经 `GET /platforms` 直接呈现给用户。
> 本文只记**"怎么修"与"已知陷阱"**，这样文档不会与代码各说一套
> （上一版这里漏记了 4 个已注册平台，还把其中两个写成"未实现"）。

注册表里的 10 个适配器（装配在 `runtime.ts`，id 清单由 `test/http/router.test.ts` 钉住）：

| 平台 | id | 文件 |
|---|---|---|
| 前程无忧 | `51job` | `adapters/fiftyone-job.ts` |
| 智联招聘 | `zhaopin` | `adapters/zhaopin.ts` |
| 猎聘 | `liepin` | `adapters/liepin.ts` |
| BOSS 直聘 | `zhipin` | `adapters/zhipin.ts` |
| 拉勾 | `lagou` | `adapters/lagou.ts` |
| 神仙外企 | `waiqi` | `adapters/waiqi-job.ts` |
| 国聘网 | `guopin` | `adapters/guopin.ts` |
| SinoJobs 中欧招聘 | `sinojobs` | `adapters/sinojobs.ts` |
| Indeed | `indeed` | `adapters/indeed.ts` |
| HiredChina | `hiredchina` | `adapters/hiredchina.ts` |

**唯一"没有代码"的是**：牛客 / 实习僧（校招，需求 §4.L 标"⚠️ 待预研"）与 LinkedIn（海外）。
其余 10 个都有代码 —— 但"有代码"≠"能用"，能用程度看 `platform-facts.ts`。

各平台的**已知陷阱**（选择器命名、风控特征、翻页形态）记在 §7；这里不重复。

## 1. 配置在哪里

`FiftyOneConfig` 四块（`fiftyone-job.ts` 顶部）：

| 块 | 作用 |
|---|---|
| `selectors` | 列表页每个字段的选择器（card / title / salary / area / tags / company / companyMeta / tracking + trackingAttr） |
| `urlParams` | 字段 → URL 参数映射。**这一层无法自动推导**，每个平台必须人工建一次（§4.2.2） |
| `cityCodes` | 城市名 → 平台城市码 |
| `detailUrlTemplate` | 详情页 URL 模板，`{jobId}` 会被替换 |

**优先级：DB 覆盖 > 代码默认。** DB 侧是 `setting` 表里
`key='adapter-config'`、`scope='platform'`、`scope_ref='51job'` 的一行，值是 JSON，
由 `mergeFiftyOneConfig()` **合并**到 `DEFAULT_FIFTYONE_CONFIG` 之上 —— 所以**只需要写你要改的那几个键**，
不必复制整份配置。装配时日志会打印配置来源：

```
[job-hunter] 适配器 51job 已注册（配置来源：代码默认 | DB 覆盖）
```

> ⚠️ **实测与源码注释不一致的一处**：`fiftyone-job.ts` 的注释写着「选择器坏了自己在 UI 改」，
> 但**写入路径没有实现** —— 全仓库只有 `ai-config` 与 `guard-config` 两个键有 `setting.set()` 调用，
> **没有任何 HTTP 路由或界面能改 `adapter-config`**。目前改它只能直接写 sqlite（见 §4）。
> UI 编辑是待办，不是已完成项。

## 2. 解析函数的硬约束（真踩过一次）

`extractJobsInPage` 会被序列化后送进浏览器执行（`page.evaluate`），因此它：

- 只读全局 `document`，只依赖入参 `config`；
- **绝不引用模块作用域的自由变量**。

反例就是那个真实故障：函数里引用了模块级常量 `MAX_CARDS`。离线 jsdom 测试全绿（Node 里闭包还在），
一到真实页面立刻 `ReferenceError: MAX_CARDS is not defined`，**整页解析失败**。

护栏在 `test/platform/fiftyone.test.ts`：用 `new Function('return (' + fn + ')')` **按源码重建函数**
再调用，从源码层面切断闭包。新增真路径代码时必须让它落在这条测试的覆盖范围内
（`test/platform/waiqi.test.ts` 与 `test/platform/zhaopin.test.ts` 各有一份同样的护栏）。

### 2.1 神仙外企是这条规矩的极端情形

它的列表**不在 DOM 里**（纯前端 SPA，数据由接口 JSON 渲染）。所以它的页面函数不仅要
自包含，还要**在页面上下文里自己发请求**：`readListPage` = `page.evaluate(fetchListInPage)`
+ `page.evaluate(extractJobsInPage)`。

由此多出一条硬约束：**只认页面上下文自己的 `fetch`**（真浏览器里就是 `window.fetch`），
用 `globalThis.__WAIQI_FETCH__` 这个标记确认"这个 fetch 是页面上下文的"，
**绝不回退到宿主 Node 的 fetch**。回退的后果有两层：

- 真路径上：本该系统走浏览器登录态的采集，变成宿主直连接口；
- 离线测试里：它**会真的打到线上**（§14 明令禁止）。这条不是推理出来的 ——
  `test/platform/waiqi.test.ts` 的「页面上下文的 fetch 抛错」用例就是被它逼出来的：
  当时测试没抛错，而是把真实接口的数据抓了回来。

`test/support/jsdom-page.ts` 因此多了一个 `fetchStub`：**无论有没有 stub 都装一个 fetch**，
并打上 `__WAIQI_FETCH__` 标记 —— 真浏览器里 `window.fetch` 一定存在，夹具要同形。

### 2.2 动了适配器的导出，先 grep 一遍探针脚本（真踩过一次）

`page.evaluate` 的函数必须是**导出的具名函数**（内联箭头函数跑得动，但单测不到、也进不了
2. 的"按源码重建"护栏），于是它天然是跨模块的公开符号 —— **调用方不止适配器和测试，还有 `test/tools/probe-*.ts`**。

真实故障：`guopin` 迁移到共享判墙后，删掉了自己那个已无用的 `detectBlockInPage` 导出；
`test/tools/probe-guopin.ts` 还 import 着它，于是 typecheck 报：

```
test/tools/probe-guopin.ts(33,33): error TS2305: Module '"../../src/host/platform/adapters/guopin.js"'
  has no exported member 'detectBlockInPage'.
```

规矩：**改 / 删适配器的导出前，先 grep 一遍 `test/tools/probe-*.ts`**（`npm run probe:*` 那些脚本）。
它们是"**工具链也是调用方**"的典型：漏掉不一定会让 `npm test` 变红，
却会让"下次真出问题时唯一的排查手段"先一步坏掉 —— 而那时你正忙着排查别的问题。

## 3. 失效是怎么被发现的（不是靠"抓不到"）

四个信号，都是字段级的、可定位的：

1. **逐条断言**（`platform/validate.ts`）：缺任一必需字段 → 该条**不写主表**，进 `pending_repair`（含原始片段）。
2. **逐字段计数**（表 `adapter_field_health`）：缺失时 `consecutive_miss += 1`，命中时清零。
3. **降级**：任一核心字段**连续 3 次缺失** → 平台 `health` 由 `healthy` 变 `degraded`，
   同时写一条 urgent 待办（`adapter-degraded`）。
4. **恢复**：重新命中后 `reset` 计数、健康度回 `healthy`、并关闭那条待办。

状态机：`healthy ──连续失败 N 次──→ degraded ──仍失败──→ broken ──修复并自检──→ healthy`

「抓到 0 条」也会被显式标注：`crawl_run.state = 'partial'`、`errorCode = 'NO_RECORDS'` ——
0 条最容易被误读成"今天没有新岗位"，所以它必须是一个可见状态，而不是静默。

## 4. 修一个坏掉的选择器

```bash
# ① 离线复现降级（不碰真实站点）
node scripts/run-ts.mjs test/tools/crawl-fixture.ts --break-selectors --rounds 3
#    期望：health=degraded、urgent 待办 1 条、主表 0 条脏数据、原始片段进 pending_repair

# ② 更新夹具 / 复现现场
#    位置：test/fixtures/51job-sz.html（仓库里已提交一份 51job 深圳 Java 的样本）
#    ⚠️ 抓取前先确认目标站点条款与 robots；本项目不提供任何反检测能力

# ③ 写 DB 覆盖（只写要改的键，会与代码默认值合并）
node -e "const{DatabaseSync}=require('node:sqlite');\
const db=new DatabaseSync(process.env.DSH_HOME+'/job-hunter/data.db');\
db.prepare(\"INSERT INTO setting(key,scope,scope_ref,value_json,updated_at) \
VALUES('adapter-config','platform','51job',?,datetime('now')) \
ON CONFLICT(key,scope,scope_ref) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at\") \
.run(JSON.stringify({selectors:{card:'.joblist-item',title:'.jname'}}))"

# ④ 离线全绿（绝不访问真实招聘站）
npm test
```

> **探针覆盖**：10 个适配器现在都有至少一个在线探针（`package.json` 里的 `probe:*`）——
> 浏览器型：`probe:51job` · `probe:liepin` · `probe:zhipin` · `probe:lagou` · `probe:guopin`
> · `probe:zhaopin-login`；纯 HTTP 型：`probe:sinojobs` · `probe:hiredchina` · `probe:indeed` · `probe:waiqi`。
> 它们都是**手动跑一次**的校准工具（§14），产物落到仓库根的 `.probe-<平台>-capture/`
> （已被 `.gitignore` 的 `.probe*` 忽略），**刻意不覆盖 `test/fixtures/` 里被用例钉住的夹具** ——
> 那些文件的首条记录标题/条数/源地址被硬编码断言，静默替换只会让测试红在与本次校准无关的地方。
> 要重新钉住，人工把 capture 复制进 `test/fixtures/` 并**同步改用例里的期望值**。
> 51job / sinojobs / hiredchina / indeed 这四个还支持 `*_OFFLINE=1`（只离线复跑上一份抓取，不碰网络；
> `probe:guopin` 的对应开关是 `GUOPIN_OFFLINE=1`），选择器腐烂时先用它排除"网络/风控"的干扰。

> 平台各自的实测记录（端点、参数、取值域、坑）写在 `docs/PLATFORM-WAIQI.md` 这类平台文档里，
> 本手册只讲**通用机制**。改一个平台前先读它那一份。

生效时机：**配置在装配时读取一次**，改完 DB 需要让插件重新加载（重启该 profile 最稳）。
改稳之后，把最终值回写到 `DEFAULT_FIFTYONE_CONFIG`，让新用户不必手工写 DB。

## 5. 新增一个平台

1. 实现 `SiteAdapter`（`platform/types.ts`）：`id` / `displayName` / `capabilities` /
   `criteria` / `crawl` / `guard`（`list()` / `detail()` 是协议里的旧形状，本仓库用 `crawl.*`）；
   **判墙（`guard.detectBlock`）别再从零写**：用 `platform/block-signals.ts` 的
   `page.evaluate(detectBlockWithSignals, { signals: signalsOf({ ...平台特有 }), card })`
   —— 验证码选择器、限流/配额/登录墙文案、`blank` 阈值都在通用词表里，
   你只需声明**自己特有**的那几条（如 BOSS 的滑块页 URL）。
   ⚠️ `detectBlockWithSignals` 会被序列化进页面，**它只引用自己的参数** ——
   想往里加判据就加数据（`signalsOf` 的 extra），不要在里面调任何模块里的函数。
   ⚠️ 流程**本身**不同的平台（有载荷探针、多段组合判据）别硬套共享函数 ——
   那就只领 `BlockSignalSet` 词表、判墙函数留在适配器里（`zhaopin` / `sinojobs` / `waiqi` 走这条路线）。
   ⚠️ 迁移**不能机械替换**：逐个比对下来 10 个适配器挖出 **9 处隐性差异**，
   **全都没有任何测试会红**（见 README.dev.md 的 P17 台账表）。
   （P17 已全部完成：10/10）
2. **在 `platform-facts.ts` 登记一行**（`PLATFORM_FACTS['<id>']`），并给返回对象加 `...platformFacts('<id>')`。
   这是**必须**的：`test/platform/facts.test.ts` 会断言"每个注册平台都登记了事实行"。
   填表纪律见该文件头 —— 未验证的环节写 `'unknown'`（比猜一个值更诚实），
   `experimental` / `disabled` 必须在 `notes` 里写清缺口原因。
   **只写 `capabilities` 是不够的**：它回答"平台有什么"，回答不了"我们实现了什么"（后者由
   `adapterImplementationOf` 派生）与"验证到什么程度"（后者是这一行）。
3. 解析函数遵守 §2 的自包含约束；
4. 在**装配处**注册（`runtime.ts` 的 `openDataLayer`；`platform/registry.ts` 的 id 重复会直接抛错，
   这是刻意的）；同时按 ADR-19 读一次 DB 覆盖：
   `setting(key='adapter-config', scope='platform', scope_ref='<id>')`；
5. 加**离线 fixture**（保存的响应/页面）+ 字段级断言测试 + 判墙测试 + 「按源码重建」护栏；
6. **平台特有筛选维度不要摊平成顶层键**：进 `SearchCriteria.platform` 命名空间
   （在 `domain/plan-config.ts` 的 `PLATFORM_KEYS` 里登记键名）。
   摊平会让"某平台才认识的键"被另一个平台的适配器当成自由参数拼进 URL —— 静默的语义污染。
   适配器读取用 `platformCriterion(criteria, 'workExp')`（它同时兼容直接构造的 `SearchCriteria`）；
   ⚠️ **声明 `city` 维度时，`closed` 要按真实行为给**（`platform/cities.ts` 的 `citySupportOf` 读它）：
   表里的值就是全部取值域 → 省略或 `true`；**表是空的但你会拒绝**（`guopin` / `hiredchina`
   带城市一律返回 `null`）→ **必须显式 `closed: true`**；表里只是**建议**、原样收自由文本
   （`lagou` / `indeed`）→ `closed: false`。
   缺了它用户收到的不是"少一条提示"就是"一条假警告" —— 而这个 flag **推不出来**，
   因为空表在这两种平台上的含义刚好相反；
7. 若该平台有「打招呼 / 投递 / 收件箱 / 阶段探测」动作，必须在 `guard/actions/` 里实现并配测试。
   返回类型是 `ActionResult`（**必须**给 `delivery`：`ok` 只说明"动作没抛错"，
   而"消息是否真的进了对方会话"是另一件事，也是本系统最不能猜的问题）。
   **现状（2026-09-18）**：`zhipin` 是**第一个真正实现** `actions` 的适配器
   （`sayHello` / `readInbox` / `sendResume`，见 `adapters/zhipin.ts` 与
   `test/platform/zhipin-actions.test.ts`），并且三条都已**接到底**：
   * `sayHello` → `guard/actions/greeting.ts`（既有）+ tool `greeting_send` / `POST /greeting/send`；
   * `readInbox` → `guard/actions/inbox.ts`（`inbox.sync`，**低危**、不需审批）
     + tool `inbox_sync` / `POST /inbox/sync`；
   * `sendResume` → `guard/actions/application.ts`（`application.send`，**高危**、两段式确认）
     + tool `application_deliver` / `POST /applications/deliver`。
   ⚠️ 注意区分：tool `application_send`（既有）是"**记一笔**我投了"（`pipeline.recordApplication`），
   而 `application_deliver` 是"**真的把简历发出去**"（走适配器）。两者都高危，但一件是记账、一件是对外发东西。
   其余 9 个平台的 `actions` 仍**刻意 fail-closed**：`greeting_send` 返回 `ADAPTER_BROKEN`（HTTP 409）。
   这是刻意的，不是 bug。
   ⚠️ 实现之后要**同时**更新 `platform-facts.ts` 的 `notes`，并检查
   `test/platform/facts.test.ts` 里那条三轴一致性断言（它要求"实现了就必须声明平台支持"）。
   高危动作的点击/输入**必须**走 `platform/humanize.ts`（CDP Input 级），页面没有
   `mouse`/`keyboard` 时 fail-closed —— 这条在 `zhipin.ts` 里有正反两个用例钉住。
   新增工具名要同步 `test/tools/registry.test.ts` 的 `ALL_TOOL_NAMES`（它就是为此存在的）。

## 6. 明确不要做的事

- **不要引入指纹伪造 / UA 轮换 / 代理池**（D-17 / D-17a）。"环境一致性"已由平台层统一提供
  （`platform/browser.ts` 的 patchright 引擎 + `platform/stealth.ts` 注入 + `platform/cdp-guard.ts` 端口守卫），
  **适配器不需要、也不应该自己再做**任何反检测处理（不要在 `evaluate` 里改 `navigator`、不要动 UA）。
- **不要在自动化测试里访问真实招聘站**（§14）。跑端到端脚本时用
  `DSH_JOB_HUNTER_NO_NETWORK=1` 强制拒绝 `crawl()`/登录引导。
  这条闸门是因为"只写在文档里的红线实测挡不住"才加的（见 README 坑 11）。
- **不要为了"抓得多"调高频率或并发**。定时抖动、单实例租约、请求间隔随机、定向选择器都是刻意的保守设计。
- **将来实现 `actions.sayHello` 时不要用 DOM click / `fill`**。输入必须走
  `platform/humanize.ts`（CDP Input 级三段式点击 + 逐字符打字 + 发送前停留 15–30s）——
  DOM 事件 `isTrusted=false`，是最廉价的自动化特征。

## 7. 风控观测与站点规则（2026-09-18 沉淀）

> 本节沉淀两条来源的实测结论：本仓库的探针（`test/tools/probe-liepin-*`、`probe-zhipin-cdp`），
> 以及两个同类开源项目的实战经验（BossHunter：BOSS 直聘；get_jobs：BOSS/猎聘/智联/51job）。
> **适配器实现必须遵守这里记录的站点规则**；新观测到规则往这里补，注明日期。

### 7.1 CDP 检测强度分级（我们自己的探针结论）

| 平台 | 检测层 | 结论 |
|---|---|---|
| 51job / 智联 / 神仙外企 | 基本不做 CDP 检测 | 原版 playwright-core 可正常出数 |
| BOSS 直聘 | 检测 CDP 自动化痕迹 | 原版 playwright-core 会被识别（get_jobs 至今被"页面回退/反复刷新"的新检测困扰，未解决）；patchright 可过 |
| 猎聘 | 检测"CDP 控制页面"本身 + 主动探测调试端口（`security.min.js`，字节系 SDK） | v6 只读 attach 实验证明：即使不开调试端口、只导航，页面也会被 `about:blank` 销毁 —— 端口守卫（`cdp-guard.ts`）**必要但不充分**，需 patchright。v8 探针（`npm run probe:liepin`）验证 patchright **启动式**（非 attach）+ stealth 注入的路线，并自动保存校准夹具 |

### 7.2 站点规则（做适配器前必读）

- **BOSS 直聘**：
  - 岗位 URL **必须携带完整 `securityId` 参数**，缺失即被拦截/加载失败 —— 永远用搜索页
    返回的原始 href 拼 `https://www.zhipin.com{job_url}`，**绝不重构 URL**（BossHunter site-patterns 实测）；
  - **没有页码分页，只能滚动加载**（2026-09-18 登录态实测，`npm run probe:zhipin-login`）：
    搜索页无分页区，URL 带 `&page=2` 返回的岗位 id 与第 1 页**完全相同**（SPA 忽略该参数）；
    滚到底部自动追加，每滚一次 +15 条。列表接口 `wapi/zpgeek/search/joblist.json` 自报
    `totalCount = 300` → 平台对一个搜索条件封顶 300 条（= 20 轮），适配器 `scrollRounds`
    维度的上限即由此而来。证据：`test/fixtures/zhipin-pagination-report.json`；
  - 登录后**薪资文本非空，但那是字体混淆的乱码**（2026-09-18 定案）：
    `.job-salary` 的数字被替换成 **10 个连续私有区码点 `U+E031`–`U+E03A`（一码一数字）**，
    靠**外部 CSS 的 `@font-face`** 画成人眼看到的数字。实测 15 张卡片共 70 处码点；
    按位置对回真实值 `15-25K·13薪` 可逐位对上（E032=1、E033=5、E031=2、E034=3）。
    ⚠️ 早先"数字不在 textContent 里、页面没有 @font-face"的结论**是错的** ——
    `page.content()` 存的快照里确实没有 `@font-face`（那份 CSS 在 CDN 上），
    而私有区字符打到终端就是空白，于是看起来像 `-K·薪`。
    **适配器口径**：一旦检测到私有区码点 ⇒ `salaryRaw` 置空 + 记 `salary:obfuscated`，
    绝不把乱码写库（下游会把它当"读到的薪资"去排序/展示）。**薪资数值目前拿不到**。
    适配器**不**把 `salary_raw` 列进必需字段：登录态会静默过期，列进去会让一次会话失效
    把整页记录打成 `pending_repair`（宁可让逐字段健康计数去报警）；
  - **薪资明文在哪**：`wapi/zpgeek/search/joblist.json` 与 `wapi/zpgeek/job/detail.json` 的
    `salaryDesc`（如 `"12-20K·13薪"`，无私有区字符）。连接键是接口 `encryptJobId`
    ↔ 卡片 `href="/job_detail/<id>.html"` 的 id（实测 15/15 完全重合）；接口另有
    `jobName`/`brandName`/`cityName`/`jobExperience`/`jobDegree`/`skills`/`welfareList` 等，比 DOM 全。
    ⚠️ **暂时不能照抄**：`test/fixtures/zhipin-search-api.json` 早期只记了 `url/status/body`，
    没有 method 与请求参数，而搜索条件不可能只靠 URL 里的 `_=时间戳` 表达。
    探针现已补记 `method` + `postData` ⇒ **下次跑 `npm run probe:zhipin-login` 就能拿到调用形态**，
    拿到后即可把列表薪资换成明文（DOM 定结构、接口取字段）。
  - **批量打开 >6 个 tab 要错开 1–2 秒**，同时开一批会触发风控；
  - 打招呼平台侧日上限约 150（get_jobs README 经验值）。
  - **求职者端的打招呼 / 收件箱 / 发简历（2026-09-18 落地，选择器来自 BossHunter 的
    `executor/sender.py`、`executor/monitor.py` 生产实测）**：
    - 岗位详情页「立即沟通 / 继续沟通」是**候选序列**（`a[redirect-url*="/web/geek/chat"]`、
      `a[data-url*="/friend/add"]`、`a.btn-startchat`、`[ka="job_detail_chat"]`、`.op-btn-chat`、
      `.btn-startchat-wrap`）—— 必须**按可见性打分**取，别盲点第一个；
    - 点击后有三种分支，**送达语义不同**：① 首次沟通弹窗
      `.dialog-wrap.startchat-dialog`（要自己填话术 → `.send-message`/`.btn-sure` 提交）；
      ② 预设招呼语弹窗 `.greet-boss-pop`/`.greet-pop`（点确认即发**平台自带文案**）；
      ③ 无弹窗（「继续沟通」直接进会话）；
    - 按钮带 `redirect-url`。点击**可能另开标签页** —— 我们的 `PageLike` 只看得到当前页，
      所以点击后若当前页没变成会话，要用 `redirect-url` 让当前页自己导航过去
      （BossHunter `_navigate_to_chat_redirect` 就是为这个坑写的）；
    - 会话页 `https://www.zhipin.com/web/geek/chat`：输入框 `#chat-input`（contenteditable，
      挂 Vue 实例）、发送 `.btn-send`、消息列表 `.chat-record`；送达校验 = 自己的消息条目
      （`.message-item.item-myself`）里出现同文本，`.message-status` 的
      `status-loading`/`status-error` → 发送中/失败；
    - 收件箱会话行是 **`li[role=listitem]`**（求职者端；招聘者端才是 `.geek-item-wrap`）：
      HR 名 `.name-text`，公司名取 `.name-box` 的**第 2 个 span**，最后一条 `.last-msg-text`；
    - **附件简历只能在平台内选着发**（工具条「发简历」→ `.choose-resume-dialog` →
      `.list-item` → `.btn-confirm`）。求职者网页端**没有会话内上传本地文件的入口** ——
      BossHunter 的定制 PDF 也是"生成后人工发送"。所以适配器对非空 `filePath`
      只在页面真存在 `input[type=file]` 时才上传，否则如实报 `missing`，**不假装发成功了**。
    - ⚠️ **一次打招呼会留下两条消息**：点「立即沟通」时 BOSS 自己会先替你发一句**平台默认招呼语**，
      随后适配器才发用户那段话术。适配器不替用户省掉自己那段（他要的就是那段），
      但这件事必须让用户在按"确认"之前看到 —— 所以写进了平台事实表的 `greetingSideEffect`，
      并由 `renderApproval` 渲染成审批文案里的「同时会发生：…」。
      计数口径：**一次 `greeting.send` 动作 = 一条审计 = 占 1 个日额度**（`dailyCaps.greeting: 150`），
      平台自己发的那条不是我们发起的动作，不额外计数。
     - 上面这些选择器的**本仓实测入口**是 `npm run probe:zhipin-chat`（会话页 + 详情页登录态探针，
       只读、不发消息、不投递；`ZHIPIN_PROBE_SKIP_CHAT=1` 可只采详情页）。产物落
       `.probe-zhipin-capture/`（`.probe*` 已 gitignore）：`chat-list-<日期>.html` /
       `chat-conversation-<日期>.html` / `detail-<日期>.html` / `chat-report-<日期>.json`
       （逐选择器命中数 + 会话行子节点样本 + 工具条文案）。**刻意不写 `test/fixtures/`**。
       改选择器前先跑它；报告里 `count: 0` 的字段就是已经腐烂的那条。
     - **2026-09-18 首次真实登录态实测结果**（`detail-2026-09-18.html`，深圳·Java 岗）：
       - 详情页**经验/学历改过名**：`.info-primary .tag-list span` 命中 **0**，
         现行是 `span.text-experiece`（**官方自己的拼写**，不是笔误）/ `span.text-degree`；
       - 公司侧栏也改了：`.res-industry-item` / `.company-info-item` 命中 **0**，
         现行是 `.sider-company p` 里的 `i.icon-stage`（融资阶段）/ `i.icon-scale`（规模）/
         `i.icon-industry`（行业）—— 必须**按图标类名**判定，不能按"文本里有没有『人』"猜
         （侧栏第一行是标题「公司基本信息」，猜法会把它当行业）；
       - 页面里有**两个** `.job-sec-text`：第二个在 `.job-detail-company` 里（带 `fold-text`），
         那是**公司介绍** —— 直接 `querySelector('.job-sec-text')` 靠文档顺序，一旦顺序变了
         就会把公司简介当 JD 写进库。适配器显式排除该容器，用例把公司介绍排在 JD 前面钉住它；
       - 沟通入口候选里 `a.btn-startchat` / `a[redirect-url*="/web/geek/chat"]` /
         `a[data-url*="/friend/add"]` 各命中 2（顶部+底部各一个），
         `[ka^="go_chat"]` / `[ka*="gochat"]` 各 1；`[ka="job_detail_chat"]` 与 `.op-btn-chat` 为 0。
         **`.btn-startchat-wrap` 已从候选里剔除**：它是容器 `div`，而逗号选择器走**文档顺序**，
         容器总在链接之前 → 会点到容器而不是 `a`；
       - **2026-09-18 第二次实测（登录态 + 会话页外壳）**：账号资料补全后会话页**打开了**
         （`/web/geek/chat`），但这个账号**一条会话都没有**（页面自报「30天内暂无联系人」）。
         空列表外壳给出了一条**推翻假设**的证据 —— **招聘者端与求职者端是两套 DOM**：
         - 求职者端实测：列表容器 `.chat-content .user-list`、筛选 tab `.label-list`
           （全部/未读/新招呼/仅沟通/更多）、空态 `.user-list .no-data` + `.chat-no-data .no-data-text`、
           搜索框 `.boss-search-input`（`placeholder="搜索30天内的联系人"`）；
         - **招聘者端**（BossHunter 的取证对象）的 `.chat-list-wrap`、`.chat-message-filter-left`、
           `.geek-item-wrap`、`li[role=listitem]` 在求职者端**全线命中 0**；
         - 因此收件箱选择器改为：容器 / 空态 / 筛选 tab 三项**用实测值**，
           行元素先用"**容器下直接子元素（排除空态）**"这种由实测容器推导的结构式写法，
           行内的名字/公司/最后一条/未读仍**待一条真实会话确认**（都标注了"待确认"）；
         - `readInbox` 改为**先等容器**：容器在而列表空 = **可信的 0 条**；
           **容器都找不到就抛错**（带选择器名），绝不把"选择器腐烂"混成"今天没人回我"；
         - 空列表下 `#chat-input` 命中 0（输入框只在会话视图里），
           所以 `#chat-input` / 消息列表 / `.choose-resume-dialog` **仍未实测**。
       - 会话页这次**没采到会话级证据**：原因是 `inbox-empty`（账号一条会话都没有）——
          报告 `chatNotCaptured.reason` 会把这一种与 `redirected-away-from-chat`（资料未完善被
          强制重定向）、`login-or-list-timeout`（没登录）**分开记**，三种要做的事完全不同。
          探针在这种状态下不关窗口：继续等你在窗口里建立一条会话，建立后自动接着采。
        - **2026-09-18 第三次实测（一条真实会话，端到端打通）**：先用
          `npm run zhipin:send-one`（显式开关 `ZHIPIN_SEND_ONE=1`）经**真实 guard 链**
          （`guard.run` 规则+审计+令牌 → `guard/actions/greeting.ts` → `adapters/zhipin.ts` 的
          `sayHello`）给一个真岗位发了一条招呼，审计留痕 `{action:"greeting.send", result:"ok"}` ——
          这同时**验证了 sayHello 在真站上端到端可用**（CDP 点击 → 进会话 → 逐字符输入 → Enter → 送达校验）。
          随后探针采到会话级证据，又**纠正了两个来自 BossHunter 的判断**：
          - ✅ 会话级选择器**全部命中**：`#chat-input`（`div.chat-input[contenteditable]`）、
            `.btn-send`、`.chat-record`、`li.message-item.item-myself`、`div.message-content`、
            `i.message-status.status-delivery`（文案 `[送达]`）—— 这些不必再怀疑；
          - ⚠️ 探针**必须用真鼠标点击**（`page.mouse.click`）打开会话：DOM `el.click()`
            触发不了 Vue 处理器，右栏一直是空态，会让人误判"`#chat-input`/`.chat-record` 全不对"（踩过）；
          - 会话行 `li[role=listitem]` 实测确认，且**不是** `.user-list` 的直接子级
            （在 `.user-list > .user-list-content > ul[role=group]` 里）；行内 `.time`（如 `00:53`）
            确认存在 —— 这就是此前一直没着落的时间节点；
          - 工具条按钮是 **`.toolbar-btn`**（`.operate-btn`/`.operate-icon-item` 是招聘者端，命中 0）；
            「发简历」未回复时带 `unable` + `aria-label="求简历：双方回复后可用"` →
            **平台要求双方回复后才能发简历**，适配器现在先读这个状态再决定，不点那个点不动的按钮；
          - 会话页上的 `input[type=file]` 只有两个：「上传附件简历」到**自己的简历库**
            （`.upload-resume-dialog`）与「发送图片」（`.btn-sendimg`）—— **都不是**把本地文件发给 HR。
            故 `sendResume(filePath≠null)` 直接 fail-closed 并说明；仍**未实测** `.choose-resume-dialog`；
          - 另一个文档顺序陷阱：`.last-msg` 是**容器**，逗号选择器里带上它会被先选中（拿到"消息+未读数"），
            和 `.btn-startchat-wrap` 同一类 —— 候选里只放叶子节点。
       - **2026-09-18 第四次：把"回复"从假动作改成真动作 + 阶段探测落地**（都用上面已实测的选择器，
         没有新增猜测）：
         - **`actions.reply`（在已有会话里接着聊）**：`#chat-input` → `clearAndType`（Ctrl/Cmd+A →
           Backspace → 逐字符输入）→ `Enter` → 用 `.chat-record` 里同文本 + `.message-status`
           做送达校验。四种结果如实区分（`delivered` / `pending` / `failed` / `missing`）。
           ⚠️ 这次修的是一个**正在撒谎的功能**：原 `domain/messages.ts` 的 `reply()` 走完
           `guard.run('message.reply')` 却只写本地一行 —— 工具文案写着「回复一条 HR 消息」，
           平台上什么都没发生。现在链路是 `runtime.replyToMessage()` → `guard/actions/reply.ts`
           （首行校验一次性令牌）→ `adapter.actions.reply`，**送达确认之后**才落本地记录；
           适配器没实现 `reply` 的平台（其余 9 个）一律 `ADAPTER_BROKEN`，不再有"本地记了、平台没发"。
         - **`actions.detectStage`（接触阶段探测）**：判据全部落在已实测的收件箱行上 ——
           会话行不存在 → `null`（**不是** `none`：分不清"从没打过招呼"与"会话被移出保留窗口"）；
           有未读、或最后一条不是我们发的 → `replied`；最后一条是我们的 + `status-read` → `read`；
           + `status-delivery` → `delivered`。⚠️ `read` 这一档**代码支持但真实站点尚未见到样本**
           （目前那条会话仍停在 `status-delivery`）。入口是 `POST /jobs/:id/detect-stage`（低危，
           只看不发），**只报事实、不改状态**（识别 ≠ 改状态）。
         - **方向判定口径改了（两处必须一致）**：`.message-status` 节点**只出现在我们发出的消息上**，
           所以"节点在 ⇒ 我发的"，不再要求认得出具体状态类名。旧写法靠 `status-read`/`status-delivery`
           类名判定 —— 平台改一次类名，HR 的会话会被整行读成"我发的"，并在本地写出一条假消息。
           `readInboxInPage` 与 `detectStageInPage` 现在共用这一条口径。
         - **收件箱可按 tab 读**（`inboxTab` = `all` / `unread` / `newGreet` / `communicated`，
           对应实测 tab 文案 全部 / 未读 / 新招呼 / 仅沟通）。默认 `all`；切 tab 只影响**精度**，
           点不上时读到的是当前展示的全量（**超集**，不会漏），所以点不上不报错。
         - ⚠️ **仍未解决（OPEN）**：列表卡的薪资数字**不在 `textContent` 里** —— 实测拿到的是
           `-K·薪`（没有 `@font-face`、没有 `content:"digits"`、没有数值型 `aria-label`/`title`）。
           因此 `test/platform/zhipin.test.ts` 里那条"薪资可见率"断言**只能证明登录态**，不能证明
           薪资可用；现在它同时量"文本可见率"与"带数字率"并把后者打印出来，不再给假的绿灯。
- **猎聘**（2026-09-18 深度调研，夹具 + 接口采样交叉验证）：
  - 搜索接口 `POST api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`，请求体
    `mainSearchPcConditionForm` 含全部筛选参数（city/dq/pubTime/salaryCode/workYearCode/eduLevel/industry…），
    但**只有 city 出现在搜索 URL 上**，其余是 JS 控件 → 适配器只声明 keyword/city/maxPages，不编；
  - 无城市时接口默认 `city=410`（= 全国）；具体城市码逐城实测补 DB；
  - 响应 `job.dq` 是**中文**（如 `北京-海淀区`）；`refreshTime` 是 `yyyymmddHHMMss`；
    响应字段比 DOM 富（labels/recruiter.*/compId/advViewFlag/pcOuterLink）—— v2 接口化方向，
    采样在 `test/fixtures/liepin-search-api*.json`；
  - **URL 翻页有效**（`currentPage` 0 起）：第 1/2 页夹具各 42 个 jobId **零重叠**（回归测试固化）；
  - 分页是 AntD 按钮组（`.list-pagination-box li.ant-pagination-next`，disabled 类名判尾页），
    一次搜索约 21 页、40 条/页；广告卡没有 `data-nick='job-detail-job-info'` 链接，天然被跳过；
  - 岗位链接两种形态并存：`/job/<id>.shtml`（普通岗）与 `/a/<id>.shtml`（Agent 类岗），都要收；
  - **列表与列表接口都不含 JD**（逐键采样确认）→ JD 只能**逐条进详情页**取。详情页是
    **SSR 直出**、**未登录也可读**（2026-09-18 详情探针，夹具 `test/fixtures/liepin-detail.html`）；
  - 详情页解析锚点（都已进 `DEFAULT_LIEPIN_CONFIG.selectors`）：
    - JD 正文：`section.job-intro-container` 里 **`dt` 文案 = `职位介绍`** 的那块 `dl > dd`
      （实测 1074 字）。**必须用 dt 文案当锚点**：同一容器还有 `dt=其他信息`（语言/行业/部门要求），
      按类名取会取错块，还要排除 `.ellipsis-1`；
    - 薪资：`.name-box .salary` —— **必须限定 `.name-box`**，裸 `.salary` 会命中侧栏推荐岗；
    - 关键信息行：`.job-properties` → `佛山-顺德区 5年以上 本科 招5人 9月17日更新`；
    - 公司名：`div.company-info-container .company-card .name` —— **不能复用列表页的
      `data-nick='job-detail-company-info'`**：该属性在详情页出现 20 次且**全部**落在
      `section.love-job-container`（「猜你喜欢」推荐位），第一个命中是**别家公司**的岗位卡，
      会静默把公司名写错（回归测试固化）；
  - 聊天按钮需要 **hover 后才出现**（get_jobs 实测）；点击前做鼠标像素微调可显著降低风控命中率。
  - 详情补抓的边界（`crawl.ts` 的 `fetchNewJobDetails`）：**只补本轮新增**（老岗位 JD 已取过）、
    每轮上限 `DETAIL_FETCH_MAX_PER_ROUND=20`、与列表同一个单轮预算（到点即停）、
    命中风控**即整轮停手**（记 `failed` + 平台级信号，绝不硬闯）。
- **51job**：阿里云 WAF 滑块特征是 `.waf-nc-title` 元素 + `script[name^="aliyunwaf_"]` 脚本名
  （已进判墙选择器）；投递上限 toast 文案"今日投递太多 / 休息一下明天再来"存活极短（<2s），
  **点击后要 200ms 间隔轮询 10 次**才抓得到 —— 一次性 detectBlock 会漏（已进 `quota-exhausted` 判墙）。
- **智联**：投递上限约 100（文案"达到上限"）；只第 1 页用 `?kw=`，第 2 页起用站点自己生成的
  无 query path 链接（robots 合规取舍，见 `PLATFORM-ZHAOPIN.md` §5）。
  2026-09-18 登录态实测补三条（详见 `PLATFORM-ZHAOPIN.md` §8）：**收件箱走
  `cgate.zhaopin.com/imapi/imV2/getTalkList` 接口**（页面上下文只要 cookie；方向判据 `senderId === userId`）；
  **智联没有独立的"打招呼"动作**、IM 发送走网易云信私有 WS（`getToken` 换 token）→ `sayHello` 做不了；
  **「立即投递」没有二级确认**（点一下 = 投简历 + 平台自动发一句招呼语）→ 探针里它按语义护栏默认不点，
  `actions.sendResume` 在严格两段式确认落地前保持不实现。
  该平台的登录态走查入口是 `npm run probe:zhaopin-login`（产物落 `.probe-zhaopin-capture/`）。
- **通用**：服务器 IP 会被招聘站直接拒绝返回数据（get_jobs 实测，本项目本机运行天然规避）；
  开着代理（墙外节点）访问国内平台既慢又异常，README 明确要求关闭。
