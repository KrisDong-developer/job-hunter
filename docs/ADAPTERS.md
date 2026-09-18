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

# ② 更新 fixture：用你自己已登录的浏览器保存一份新的搜索结果页
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

> 平台各自的实测记录（端点、参数、取值域、坑）写在 `docs/PLATFORM-WAIQI.md` 这类平台文档里，
> 本手册只讲**通用机制**。改一个平台前先读它那一份。

生效时机：**配置在装配时读取一次**，改完 DB 需要让插件重新加载（重启该 profile 最稳）。
改稳之后，把最终值回写到 `DEFAULT_FIFTYONE_CONFIG`，让新用户不必手工写 DB。

## 5. 新增一个平台

1. 实现 `SiteAdapter`（`platform/types.ts`）：`id` / `displayName` / `capabilities` /
   `criteria` / `crawl` / `guard`（`list()` / `detail()` 是协议里的旧形状，本仓库用 `crawl.*`）；
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
7. 若该平台有「打招呼 / 投递 / 收件箱 / 阶段探测」动作，必须在 `guard/actions/` 里实现并配测试。
   返回类型是 `ActionResult`（**必须**给 `delivery`：`ok` 只说明"动作没抛错"，
   而"消息是否真的进了对方会话"是另一件事，也是本系统最不能猜的问题）。
   目前 **10 个适配器的 `actions` 全部未实现**：`greeting_send` 一律返回
   `ADAPTER_BROKEN`（HTTP 409），文案是「<平台> 的适配器还没实现打招呼动作」。
   这是**刻意的 fail-closed**，不是 bug。
   ⚠️ 实现之后要**同时**更新 `platform-facts.ts` 的 `notes`，并放宽
   `test/platform/facts.test.ts` 里那条"平台支持但尚未实现 sayHello"的绊线（它失败时会告诉你该改哪里）。

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
  - **批量打开 >6 个 tab 要错开 1–2 秒**，同时开一批会触发风控；
  - 打招呼平台侧日上限约 150（get_jobs README 经验值）。
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
  - 聊天按钮需要 **hover 后才出现**（get_jobs 实测）；点击前做鼠标像素微调可显著降低风控命中率。
- **51job**：阿里云 WAF 滑块特征是 `.waf-nc-title` 元素 + `script[name^="aliyunwaf_"]` 脚本名
  （已进判墙选择器）；投递上限 toast 文案"今日投递太多 / 休息一下明天再来"存活极短（<2s），
  **点击后要 200ms 间隔轮询 10 次**才抓得到 —— 一次性 detectBlock 会漏（已进 `quota-exhausted` 判墙）。
- **智联**：投递上限约 100（文案"达到上限"）；只第 1 页用 `?kw=`，第 2 页起用站点自己生成的
  无 query path 链接（robots 合规取舍，见 `PLATFORM-ZHAOPIN.md` §5）。
- **通用**：服务器 IP 会被招聘站直接拒绝返回数据（get_jobs 实测，本项目本机运行天然规避）；
  开着代理（墙外节点）访问国内平台既慢又异常，README 明确要求关闭。
