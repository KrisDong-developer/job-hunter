# 架构文档（ARCHITECTURE）

> 本文描述 `src/` 的整体架构：分层、数据流、安全模型与关键子系统。
> 依据为源码实读（2026-09，phase P8）。适配器怎么修见 [`ADAPTERS.md`](ADAPTERS.md)；
> 平台实测证据见 [`FILTER-EVIDENCE.md`](FILTER-EVIDENCE.md) 与各 `PLATFORM-*.md`。

## 1. 一句话定位与技术栈

**跑在用户自己电脑上的 DSH 插件**：宿主半（Node）用 Playwright 复用用户浏览器的登录态采集 10 个招聘平台，
存进本地 SQLite；界面半（React 面板 + 对话工具卡片）负责浏览、决策与跟进。没有服务器、不上传。

| 层 | 技术 |
|---|---|
| 插件框架 | cordis（DSH 桌面端），两侧各一个插件入口 |
| 界面半 | React 函数组件，CSS 常量注入（无 CSS 框架） |
| 宿主半 | Node 24，`node:sqlite`（DatabaseSync），零运行时 npm 依赖 |
| 采集 | Playwright（patchright 引擎）+ stealth 注入 + CDP 拟人交互 |
| 导出 | 零依赖手写 OOXML（docx）与 ZIP 容器；PDF 走临时 headless Chromium |
| 构建/测试 | `scripts/build.mjs` 产出 `lib/`（js+d.ts）；`npm test` 485 个离线测试 |

## 2. 三层结构与数据流

```
┌─ DSH 桌面端（Electron） ──────────────────────────────────────────────┐
│                                                                      │
│  浏览器侧                             Node 宿主侧                      │
│  ┌──────────────────────┐   HTTP     ┌─────────────────────────────┐ │
│  │ src/client/          │ ─────────→ │ src/host/                   │ │
│  │  面板 10 屏 (React)   │  /job-hunter*  http/  传输层+路由表       │ │
│  │  toolviews 对话卡片   │ ←───────── │  domain/ 领域服务 (21 个)    │ │
│  │  net/ 请求薄封装      │   SSE 提示 │  guard/ 安全闸门             │ │
│  └──────────────────────┘  (重拉)    │  platform/ 采集基础设施      │ │
│            ↑ 对话                      │   └─ adapters/ 10 平台      │ │
│            │                          │  scheduler/ 自排程           │ │
│  ┌─────────┴──────────┐               │  store/ SQLite (21 仓储)     │ │
│  │ 模型 (DSH 对话)     │ ──工具调用──→ │  tools/ 35 个模型工具        │ │
│  └────────────────────┘               │  ai/ AI 客户端+隐私闸门      │ │
│                                       │  render/ 简历渲染            │ │
│                                       └─────────────────────────────┘ │
│                                                                      │
│            src/shared/  两端共享契约（DTO/枚举/纯函数/常量）             │
└──────────────────────────────────────────────────────────────────────┘
```

三条进入宿主半的通道，**最终都汇到同一批方法**：

1. **界面**：`client/net/*` → `HTTP /job-hunter/*` → `http/router.ts` 路由表；
2. **模型**：对话中调用 `tools/` 注册的 35 个工具 → `HostRuntime`（与 HTTP 同一批方法，无独立读写路径）；
3. **排程器**：`scheduler/` 到点触发采集（只发采集，**不发任何高危动作**）。

出站通知只有一条：SSE 事件流（`http/sse.ts`）。ADR-24 铁律：**事件只作「去重拉取」的提示，
前端绝不靠事件内容构建状态**（有界缓冲 200、15s 心跳、Last-Event-ID 命不中则要求 resync）。

## 3. 目录总览（src/）

```
src/
├─ client/   界面半：app(外壳) format hooks net screens(10屏) styles toolviews ui views
├─ host/     宿主半：ai domain(领域) guard(闸门) http platform(采集) render runtime(装配)
│            scheduler store(存储) tools(模型工具) util + 6 个根配置文件
└─ shared/   config(常量) contract(dto+enums+dsh宿主类型面) domain(纯函数) text(文本契约)
```

> **逐文件的完整目录树（每个文件带职责注释）见 [附录 A](#附录-a完整目录树含逐文件注释)。**

构建产物 `lib/` 与 `src/` 同构（js + d.ts），**`src/` 是唯一真相**。`test/` 按域镜像 `src/`
（ai/client/domain/http/platform/tools/store…），`test/fixtures/` 存各平台真实页面快照供离线解析测试。

### 3.1 client/（界面半）

| 目录 | 职责 |
|---|---|
| `index.tsx` | cordis 插件入口 `apply()`：按序注册主面板 / 侧栏入口 / 浮层 / toolview 卡片（全挂 disposer，热重载幂等） |
| `app/` | 面板外壳：`panel.tsx` 编排 10 屏 + SSE 合并为 revision 重拉；`ScreenErrorBoundary` 单屏崩溃不拖垮面板；`intent.ts` 对话卡→面板跳转意图通道 |
| `net/` | 宿主 HTTP 唯一出口：`client.ts` 的 `request<T>()` + `ApiError`/`NeedsConfirmError`；其余文件按域薄封装（无状态 async 函数） |
| `screens/` | 10 个屏：今日 / 岗位库 / 简历 / 流水线 / 消息 / 面试 / 看板 / 校招 / 采集 / 设置。采集页是「index 编排 + 3 个 Tab 纯展示分区 + 子卡片」分层 |
| `views/` | 岗位详情：`body.tsx` 编排骨架，`pane.tsx`（内嵌栏）/`drawer.tsx`（抽屉）两种容器，`panels/` 各段落卡 |
| `toolviews/` | 对话流 tool.call 结果卡片（岗位列表/详情/话术草稿），与 GUI 共享同一批端点 |
| `ui/` | 跨屏基础控件：Modal/NumberField/Switch/AsyncView/FieldHint/Term 等 |
| `hooks/` | useAsync（三态）、useEventStream（SSE）、useDialogA11y（焦点陷阱）、useSticky（防闪断） |
| `styles/` | 纯 CSS 常量仓库，`index.ts` 的 `installStyles()` 按固定顺序一次注入（顺序即层叠关系） |
| `format/` | 展示口径纯函数（薪资/相对时间/Markdown/标签分组/风控一句话） |

### 3.2 host/（宿主半）

| 目录 | 职责 |
|---|---|
| `index.ts` | cordis 插件入口：`apply()` 立即返回，重活在异步 `ready()`；反应式注册 webServer 路由与模型工具 |
| `runtime.ts` | **组合根**：`createHostRuntime()` 把 sqlite store、适配器注册表、锁、浏览器、领域服务、租约、调度器接线成 `HostRuntime` 门面 |
| `http.ts` | 传输层：只注册一条 `/job-hunter` prefix 路由；同源校验、64KB 体积上限、SSE 挂载；`HttpError` |
| `settings.ts` / `browser-config.ts` / `crawl-config.ts` | 配置门面（界面改/模型改/审计同一写入路径）与浏览器、采集运行期配置 |
| `http/` | `router.ts` 按序命中**精确形状路由表**（即完整接口清单）；`routes/` 25 个文件是同构 handler 集合（返回 undefined=穿透下一表项） |
| `domain/` | 21 个领域服务：接口 + `createXxxService(deps)` 工厂，依赖全部注入（Store/AiService/Clock），可离线测试 |
| `guard/` | 安全闸门（见 §5.2） |
| `platform/` | 采集基础设施 + 10 平台适配器（见 §6） |
| `scheduler/` | 自排程器（见 §7） |
| `store/` | SQLite 持久层（见 §8） |
| `tools/` | 暴露给模型的 35 个工具（见 §9） |
| `ai/` | AI 调用客户端：用途开关 → 隐私闸门 → LLM/降级 → 留痕（见 §10） |
| `render/` | 简历导出：HTML（预览与打印同源）→ PDF（临时 headless Chromium）/ DOCX（手写 OOXML，字节级可重复） |
| `util/` | `DomainError`（领域唯一错误类型）、公司名归一、去重判定、薪资解析、词表匹配、离线闸门 |

### 3.3 shared/（两端契约）

**只放标量与纯函数，禁止活对象穿越 DTO 边界**（P7 铁律）。

| 目录 | 内容 |
|---|---|
| `config/` | 双端共用常量：插件标识与路由前缀、体积/条数上限、批量 5 条与条间 3–9s、浏览器空闲自关、采集阈值（日限 8 轮/单轮预算 20min/泳道 3）、分层保留策略 |
| `contract/dto/` | 17 个对外 DTO 文件（岗位/方案/平台/采集/流水线/看板/Offer/简历/消息/面试/校招/海外/批量/去重/配置/存储/今日） |
| `contract/enums/` | 16 个枚举文件，统一「`as const` 取值域 + 中文 Label Record」模式（TS 保证穷尽） |
| `contract/dsh.ts` | 项目实际消费的 Cordis 宿主接口**最小本地类型面**（运行态实测投影，不引官方依赖树） |
| `domain/` | 纯函数：筛选梯队 chips、Offer 16 维待遇字段、简历结构化形状与**防编造校验** |
| `text/` | 文本契约：条件→中文、错误→人话、时间格式化（绝不印裸 UTC）、工具结果行格式（宿主生产与 toolview 解析同一模块） |

## 4. 请求生命周期（HTTP 为例）

```
client/net → host/http.ts（同源校验/体积上限）
          → router.ts（按序匹配精确形状路由表）
          → routes/*.ts handler（解析参数 → 调 HostRuntime）
          → domain/ 领域服务（或 runtime/ 编排，高危动作必经 guard/）
          → store/ 仓储（SQLite）
          ← DomainError 沿栈抛出，router 统一翻译成 HTTP 状态与可读 hint
          ← ConfirmRequiredError 专用 409 两段式（前端弹确认后带 confirm 重发）
```

错误模型三级：**`DomainError`**（domain 抛，code/hint/status/toJson）→ **`HttpError`**（传输层）→
**`ApiError`/`NeedsConfirmError`**（client 侧还原为界面文案与确认弹窗）。

## 5. 安全模型（最重要的横切设计）

### 5.1 分层意图

所有「会对外产生副作用」的动作分三档（`guard/types.ts` 的 `Danger`）：

- **low**：读（探测接触阶段、看板查询）——只过基本检查；
- **mid**：模型发起的写（crawl_run、resume_save）——过审批；
- **high**：真发送（打招呼/投递/回复 HR/写闸门配置）——**规则链 + 审批 + 令牌**全走。

### 5.2 guard/（安全闸门）

```
createGuard().run(input)
  → 规则链 rules.ts：禁止项→开关→发送窗口→休息日→隐身→批量→额度→冷却→需否审批
  → 审批 approval.ts：fail-closed（拒绝/超时 5min/无界面/通道出错 = 一律拒绝）
  → 令牌 token.ts：AsyncLocalStorage 一次性令牌（guardAuthority 单例）
  → 平台锁 locks.ts + 拟人节流 pacing.ts（withPlatformPacing 串行）
  → 执行 actions/*（每个危险实现首行 assert 令牌，绕过在编译期/运行期都被拦）
  → 审计 store/repo/audit.ts（只存字段摘要与长度，敏感正文不入表）
```

默认额度（`DEFAULT_GUARD_CONFIG`）：打招呼 20/日、投递 10/日、回复 30/日、冷却 24h、
批量上限 5、发送时段 09:00–16:00。**模型不能改审计/审批/额度/冷却**（`MODEL_FORBIDDEN_KEYS`，
动作实现里还有第二道校验，防御纵深）。

批量发送另有共享机制（`runtime/batch.ts`）：批内同公司去重（`CompanyDeduper`）、
按当日额度预占（`QuotaReserver`）、条间随机 3–9s、逐条回执**永不整批失败**。

### 5.3 ai/（外发模型的三重防护）

1. **用途开关**（`purposes.ts`）：16 种用途逐个可关，低风险默认开、简历类默认关；
2. **隐私闸门**（`privacy.ts`）：出站先剥黑名单（手机号/身份证/邮箱/银行卡）再按白名单裁字段，
   每次外发字段清单落 `llm_call` 表供用户自查；
3. **提示注入围栏**（`prompts.ts`）：JD 等不可信文本用随机 nonce 围栏包裹，输出再经结构校验
   （如话术 `validateGreetingText` 防夹带联系方式、简历定制 `checkNoFabrication` 防编造经历）。

### 5.4 其它机制防线

- **离线闸门**（`util/offline.ts`）：环境变量 `DSH_JOB_HUNTER_NO_NETWORK`，真实网络动作前 assert，测试绝不访问招聘站；
- **不绕风控**：patchright + stealth（恢复 JS 环境原生样，不伪造身份）+ CDP 端口守卫（把页面
  对调试端口的探测在网络层伪造为 ConnectionRefused）；**不绕验证码、不做指纹伪造、无代理池**；
- **单实例租约**（`platform/lease.ts`）：lease.json 记 pid+心跳（90s 过期），防桌面端与 CLI 双开双抓。

## 6. 采集子系统（platform/）

### 6.1 基础设施

| 模块 | 职责 |
|---|---|
| `types.ts` | `SiteAdapter` 完整契约（criteria 声明 / crawl / guard 判墙 / auth / actions）；`PlatformBlockedError` |
| `browser.ts` | 浏览器生命周期：引擎可切换、持久化 profile、进程内单例、页面借还池、空闲自关、幽灵锁清理 |
| `humanize.ts` | **拟人输入唯一通道**：三段式 CDP 点击、逐字符打字、折线鼠标轨迹、分步滚动 |
| `pacing.ts` | 高斯随机延时、犹豫停顿、`BurstGuard` 突发罚延迟 |
| `health.ts` + `validate.ts` + `yield-baseline.ts` | 三层质量防线：字段断言（缺必需字段进 pending_repair 不污染主表）→ 健康状态机（healthy→degraded→broken，连续缺失 3 次降级）→ 产量骤降告警（字段全绿但条目掉一个数量级也能发现） |
| `registry.ts` + `config-merge.ts` | 适配器注册表（热替换）+ DB 覆盖合并（选择器可在界面改，不用等发版，ADR-19） |
| `risk-pause.ts` / `session.ts` / `cities.ts` | 平台级风控暂停（跨方案生效）/ 登录态检测与引导 / 373 城规范目录与支持度判定 |

### 6.2 采集链时序（`domain/crawl.ts` 的 `runCrawl()`）

```
平台锁 → 风控暂停检查 → 打开搜索页 → 判墙（block-signals + 平台私有信号）
  → 列表解析（page/ 或接口通道）→ 翻页循环（pacing 节流）
  → 字段断言（validate）→ 归一化 → 跨平台去重（保守判定，拿不准不合并）
  → 幂等入库（公司实体 ensure → 岗位 upsert）→ 智能标注与匹配分（intel）
  → 健康计数 / 产量基线 → CrawlSummaryDto
```

去重铁律：**必须可逆**（分组存显式成员 id，人工能拆开）；全库复核（`dedupe-sweep.ts`）
与抓取后处理用同一套判断标准。

### 6.3 适配器统一词汇（10 个平台）

每个平台目录同一套文件分工（详见 [`ADAPTERS.md`](ADAPTERS.md)）：`index.ts`（装配+判墙唯一实现）、
`config.ts`（选择器/配置/合并）、`urls.ts`（宿主侧 URL 与请求体）、`page/`（会被 `page.evaluate`
序列化的**自包含**函数，禁止引用模块作用域）、`api.ts`（页面内接口通道）、`actions.ts`（高危动作）。

| 平台 | id | 结构要点 | 动作能力 |
|---|---|---|---|
| BOSS 直聘 | `zhipin` | 滚动懒加载（唯一翻页）；薪资区码点字体混淆，唯一可信来源是接口 salaryDesc | 全套 5 动作 |
| 前程无忧 | `51job` | 功能最全的对标实现；时间窗参数实测会清空结果，刻意不提供 | 全套 5 动作 |
| 智联招聘 | `zhaopin` | DOM + `__INITIAL_STATE__` 双源（未登录薪资掩码取载荷真值）；AB 分流兜底 | 3 动作（无 sayHello/reply） |
| 猎聘 | `liepin` | 风控最强：about:blank 判停不重试；收件箱走接口；城市码表 370 条 | 3 动作（真键盘输入 IM） |
| LinkedIn | `linkedin` | guest 匿名端点**顶层导航**（绕 CSP）；判墙分 authwall/checkpoint | 仅 readInbox |
| 国聘网 | `guopin` | 列表卡片无平台 id，用内容哈希 FNV1a 做幂等键 | 无 |
| HiredChina | `hiredchina` | 列表数据在 `__next_f` RSC 流而非 DOM | 无 |
| Indeed | `indeed` | 匿名可搜；DOM 定集合 + 当页内嵌 mosaic 载荷补字段（默认 disabled，中国站停运） | 无 |
| SinoJobs | `sinojobs` | POST 表单接口型；HTTP 状态码抬升进判墙 | 无 |
| 神仙外企 | `waiqi` | 服务端翻页是坏的，声明 maxPages=1 不假装能翻 | 无 |

## 7. 排程子系统（scheduler/）

- **三种触发**（`index.ts`）：T1 窗口内随机到点 / T2 用户在场时只提示不自动跑 / T3 人工触发。
  **错过不猛跑**——弹待办问要不要补；「没跑」必带人话原因（`SkipReason`）；
- **确定性随机**（`schedule.ts`）：窗口内选点用 FNV-1a 哈希（落库不变、定时器不自旋），
  默认工作日 09:00–11:00 窗口而非单点时刻；
- **泳道并发**（`lanes.ts`）：最多 3 个平台并发跑一轮，失败不连坐，预算耗尽如实报 cut；
- **定时器端口**（`timer-port.ts`）：生产接 Cordis timer / 原生 setTimeout，测试用手动推进假定时器；
- **保险丝**：平台每日自动轮上限 8、单轮预算 20 分钟（只在页与页之间停）。

## 8. 存储子系统（store/）

- `db.ts`：固定 `$DSH_HOME/job-hunter/data.db`，`application_id` 自保护（防误开别人的库）；
- `migrate.ts` + `schema.ts`：v1–v12 迁移清单（只追加不改历史），每版一个事务，
  迁移前 `VACUUM INTO` 备份，失败回滚拒绝启动；
- `store.ts`：`openStore()` 门面组装 21 个仓储，**领域层只见 Store 门面不碰 DatabaseSync**
  （隔离 sqlite experimental 风险）；
- `repo/`：21 个表仓储（`createXxxRepo` 工厂）：岗位、方案、平台、账号、运行记录、公司、信号、
  标注、词表、字段健康、修复队列、去重组、流水线六表、简历、定制、Offer、校招/海外支线、
  待办、审计、LLM 留痕、配置；
- `cleanup.ts`：分层保留策略（投递/消息永久、JD 文本 180 天），清理预览与执行分离，
  **用户资产永不自动删**，执行后 VACUUM。

## 9. 模型工具层（tools/）

35 个工具按域分组（jobs/crawl/plans/outreach/applications/resumes/analytics/offers/campus/
overseas/data/settings），`index.ts` 的 `registerJobHunterTools()` 统一注册——**注册失败不静默**，
进 report 经 `/health` 暴露。

- 工具层只调 `HostRuntime`（与 HTTP 同一批方法），无独立读写路径；
- `exec-context.ts` 用 AsyncLocalStorage 传递「这次调用是谁在跑」（gui/model/schedule/user），
  供审批判断而领域层无感知；
- 刻意不提供的能力：执行清理（删除不可撤销只能界面做）、改审计/审批/额度配置；
- 高危工具逐条过审批；`greeting_draft` 只生成不发送，发送走 `greeting_send` 两段式确认。

## 10. AI 子系统（ai/）

```
调用方(domain 各服务) → createAiService().complete()
  ① 用途开关检查（purposes，16 种）
  ② 组提示词（prompts：系统围栏 + nonce 包裹的不可信文本）
  ③ 隐私闸门（privacy：黑名单脱敏 + 白名单裁字段，产出外发字段清单）
  ④ LlmPort（llm-port：适配 DSH 宿主流式 llm 服务；路由不可用抛 LlmRouteUnavailableError）
  ⑤ 结果结构校验 + llm_call 留痕（用途/状态/token/外发字段）
  ⑥ LLM 不可用 → 规则模板降级（outreach/resumes 各有 buildTemplateGreeting/ruleTailor），
     DTO 用 via 字段如实回传走了哪条路
```

## 11. 代码风格约定

- **函数式为主**：全仓仅 13 个 `class`，集中在错误类型与少量有状态设施：
  `ScreenErrorBoundary`、`ApiError`、`NeedsConfirmError`（client）；`ConfirmRequiredError`（guard）；
  `BurstGuard`、`PlatformBlockedError`（platform）；`HttpError`（host/http）；
  `CompanyDeduper`、`QuotaReserver`（runtime/batch）；`LlmRouteUnavailableError`（ai）；
  `DomainError`（util）。其余一律「接口定义行为 + 工厂函数返回实现」；
- **依赖注入**：所有服务工厂注入 deps（Store/AiService/Clock/TimerPort），测试可整体替换假实现；
- **叶子模块防循环**：`http/routes/types.ts`、`runtime/contract.ts`、`tools/types.ts` 不 import
  本项目任何模块；
- **读宽容写严格**：对外部输入（存储的 JSON、导入文件）读取时坏值退默认，写入前严格校验显式报错；
- **如实汇报**：识别不出写 null 不猜（工签 unknown 是一等取值）、发不出去说平台侧理由、
  降级了在 DTO 里带 via。

## 12. 相关文档

| 文档 | 内容 |
|---|---|
| [`../README.md`](../README.md) | 用户视角的功能与边界 |
| [`../README.dev.md`](../README.dev.md) | 实现细节、阶段验收证据、实测踩坑 |
| [`ADAPTERS.md`](ADAPTERS.md) | 适配器维护手册（平台改版怎么修） |
| [`FILTER-EVIDENCE.md`](FILTER-EVIDENCE.md) | 筛选参数实测证据 |
| [`PLATFORM-*.md`](PLATFORM-WAIQI.md) | 单平台接入记录 |
| [`OPTIMIZATION-PLAN.md`](OPTIMIZATION-PLAN.md) | 优化计划 |

---

## 附录 A：完整目录树（含逐文件注释）

> 说明：本仓库为函数式风格，真正的 `class` 极少，已用【类】显式标出；
> 其余注释列出该文件的主要导出（组件 / 工厂函数 / 常量）。权威以 `src/` 源码为准。

```text
src/                                            # 三层结构：client(界面) / host(宿主半) / shared(共享契约)
│
├─ client/                                      # 客户端插件（面板 UI，cordis）
│  ├─ index.tsx                                 # 插件入口 apply()：按序注册主面板/侧栏入口/浮层/toolview 卡片
│  ├─ app/
│  │  ├─ entry-icon.tsx                         # JobHunterEntryIcon：侧栏入口图标组件（18px SVG）
│  │  ├─ error-boundary.tsx                     # 【类】ScreenErrorBoundary：屏级 React 错误边界，单屏崩溃不拖垮面板
│  │  ├─ intent.ts                              # 跳转意图通道：requestPanelIntent / subscribe / consume（对话卡片→面板）
│  │  ├─ notice.tsx                             # JobHunterNotice：「已就绪」一次性浮层（TTL + 每标签页一次）
│  │  ├─ panel.tsx                              # JobHunterPanel：面板外壳（10 屏编排 + SSE 合并为 revision 重拉）
│  │  ├─ runtime.ts                             # layout 服务桥：showPanel / backToConversation（点击时懒解析）
│  │  └─ tabs.ts                                # Screen 联合类型 + TABS 标签顺序 + tabLabelOf 中文映射
│  ├─ format/
│  │  ├─ job.ts                                 # 岗位展示口径：salaryDetail / relativeTime / jobsToMarkdown / splitJobTags
│  │  ├─ risk-story.ts                          # riskStory()：风控态势一句话总结（只陈述配置事实）
│  │  └─ today.ts                               # 今日待办辅助：todoKindLabel / todoLevelLabel / planIdOf
│  ├─ hooks/
│  │  ├─ use-async.ts                           # useAsync：拉数据三态状态机（loading/ok/error + AbortController）
│  │  ├─ use-dialog-a11y.ts                     # useDialogA11y：Esc 关闭/焦点陷阱/焦点归还（modal 与 drawer 共用）
│  │  ├─ use-event-stream.ts                    # useEventStream：SSE 客户端（事件只作「去重拉」提示）
│  │  └─ use-sticky.ts                          # useSticky：重取期间沿用上次成功数据防闪断
│  ├─ net/                                      # 宿主 HTTP 唯一出口的薄封装（全部无状态 async 函数）
│  │  ├─ client.ts                              # 【类】ApiError（HTTP 状态+错误码+hint）/ 【类】NeedsConfirmError（高危需二次确认）；request<T>() 统一请求
│  │  ├─ collect/
│  │  │  ├─ plans.ts                            # 采集方案 CRUD + 校验 + 筛选维度 + 干跑预览
│  │  │  ├─ platforms.ts                        # 平台总览/登录引导与检测/待修复队列/适配器配置覆盖
│  │  │  ├─ runs.ts                             # 触发采集（runCrawl/runPlan/runDefaultPlan）与跳过原因
│  │  │  └─ schedule.ts                         # 排程暂停/风控恢复/租约重检与接管
│  │  ├─ campus.ts                              # 校招支线：批次推进/测评/三方协议/硬截止
│  │  ├─ companies.ts                           # 公司画像 + 人工复核（PATCH 命中键）
│  │  ├─ dedup.ts                               # 去重分组读取/全库复核/拆分与解散
│  │  ├─ inbox.ts                               # 收件箱同步/回复/面试识别与记录、面试准备
│  │  ├─ jobs.ts                                # 岗位库：列表/筛选面/详情/标记/查看历史/导出 URL
│  │  ├─ ops.ts                                 # 运维：设置/审计/LLM 留痕/存储清理/导入导出/待办
│  │  ├─ outreach.ts                            # 打招呼草稿与批量发送/接触阶段探测/跟进建议
│  │  ├─ overseas.ts                            # 海外支线：工签判定/时区换算/英文检查/Cover Letter
│  │  ├─ overview.ts                            # fetchHealth / fetchToday / fetchGuardUsage
│  │  ├─ pipeline.ts                            # 投递流水线：看板/漏斗/归因/薪资分析/简历 A/B
│  │  └─ resumes.ts                             # 简历版本 CRUD/附件/定制/打招呼模板
│  ├─ screens/
│  │  ├─ board/                                 # 数据看板
│  │  │  ├─ attribution-table.tsx               # AttributionTable：投递转化归因表（回复率唯一最高才高亮）
│  │  │  ├─ format.ts                           # formatRate()：0–1 小数→百分比字符串
│  │  │  ├─ funnel-chart.tsx                    # FunnelChart：连续梯形漏斗图（两段各算 100% 基线，可下钻）
│  │  │  ├─ index.tsx                           # BoardScreen：看板编排（筛选 + 六个数据块）
│  │  │  ├─ salary-box-chart.tsx                # SalaryBoxChart：薪资箱线图（min/P25/中位/P75/max）
│  │  │  └─ sample-badge.tsx                    # SampleBadge：样本量徽章（不足走警示色）
│  │  ├─ campus/
│  │  │  └─ index.tsx                           # CampusScreen：校招支线（硬截止 + 批次/三方/测评管理）
│  │  ├─ collect/                               # 采集页（U9）
│  │  │  ├─ adapter-maintenance.tsx             # RepairQueueCard + AdapterConfigCard：待修复队列与配置覆盖三层视图
│  │  │  ├─ capability-matrix.tsx               # CapabilityMatrix：平台能力 12 列矩阵（三态徽标）
│  │  │  ├─ criteria-line.tsx                   # CriteriaLine：采集条件一行中文呈现
│  │  │  ├─ criteria-preview.tsx                # CriteriaPreview：干跑预览各平台实际请求（防抖）
│  │  │  ├─ dashboard-tab.tsx                   # DashboardTab：分区一「运行仪表盘」纯展示编排
│  │  │  ├─ dedup-groups-card.tsx               # DedupGroupsCard：去重分组卡（拆组/拆出）
│  │  │  ├─ diagnostics-tab.tsx                 # DiagnosticsTab：分区三「诊断与明细」（能力矩阵 + 异常日志）
│  │  │  ├─ index.tsx                           # CollectScreen：采集页编排层（持有全部状态与弹窗）
│  │  │  ├─ lease-panel.tsx                     # LeasePanel：调度租约面板（心跳过期才可接管）
│  │  │  ├─ plan-editor-modal.tsx               # PlanEditorModal：方案编辑三步向导弹窗
│  │  │  ├─ plan-form.ts                        # PlanForm 表单形状与双向换算（parseKeywordsText/formOf/writeOf）
│  │  │  ├─ plans-tab.tsx                       # PlansTab：分区二「方案管理」+ 去重规则
│  │  │  ├─ platform-matrix.tsx                 # PlatformMatrix + PlatformDetail：平台状态总览与单平台诊断弹窗
│  │  │  ├─ run-history.tsx                     # RunHistoryTable + RunLogCard：运行流水表与异常日志卡
│  │  │  ├─ schedule-story.ts                   # scheduleStoryOf()：调度归属统一说法（谁在调度/下次何时）
│  │  │  ├─ state-tag.tsx                       # StateTag：CrawlState/HealthState 中文胶囊
│  │  │  └─ status-alert.tsx                    # StatusAlert：顶部只说一件最要紧事的 Alert
│  │  ├─ inbox/
│  │  │  └─ index.tsx                           # InboxScreen：消息中心（同步/回复起草/邀约只提示不改状态）
│  │  ├─ interviews/
│  │  │  ├─ index.tsx                           # InterviewsScreen：面试日程（冲突检测含通勤缓冲）
│  │  │  └─ prep-panel.tsx                      # PrepPanel：面试准备包（技能差距/公司风险/错题本/清单）
│  │  ├─ jobs/                                  # 岗位库（U1）
│  │  │  ├─ index.tsx                           # JobsScreen：左列表右详情主屏（筛选/勾选/批量/视图）
│  │  │  ├─ filters.ts                          # Filters 类型 + sameFilters/pageNumbers/describeAppliedFilters 等纯函数
│  │  │  ├─ filter-bar.tsx                      # FilterBar：筛选区（视图行/工具条/chips/高级折叠）
│  │  │  ├─ job-row.tsx                         # JobRow：岗位单行（勾选/徽章/行内动作/对照开关）
│  │  │  ├─ batch-toolbar.tsx                   # BatchToolbar：批量动作条（打招呼/投递/收藏/导出）
│  │  │  ├─ batch-greeting-modal.tsx            # BatchGreetingModal：批量打招呼弹窗（预览→逐条可编辑→分批发）
│  │  │  ├─ batch-deliver-modal.tsx             # BatchDeliverModal：批量投递弹窗（整批共用一份简历，不可逆）
│  │  │  ├─ dedup-compare-pane.tsx              # DedupComparePane：跨平台对照面板（按需拉取）
│  │  │  ├─ pager.tsx                           # Pager：分页导航（省略号页码）
│  │  │  └─ icons.tsx                           # IconChat/IconSend/IconCheck/IconCross：手绘 SVG 小图标
│  │  ├─ pipeline/
│  │  │  ├─ index.tsx                           # PipelineScreen：投递看板（列=阶段）+ 跟进建议
│  │  │  └─ follow-up-row.tsx                   # FollowUpRow：跟进建议单行（分级着色）
│  │  ├─ resumes/                               # 简历中心（U3）
│  │  │  ├─ index.tsx                           # ResumesScreen：左版本列表 + 右工作区
│  │  │  ├─ resume-work.tsx                     # ResumeWork：单份简历工作区（编辑/分屏/预览/附件/话术）
│  │  │  ├─ editors.tsx                         # BlockCard/LinesEditor/ChipsEditor/move：结构化表单编辑器原语
│  │  │  ├─ english-check-panel.tsx             # EnglishCheckPanel：英文体检（必改/建议分级）
│  │  │  ├─ greeting-templates-panel.tsx        # GreetingTemplatesPanel：打招呼模板管理（来源如实标注）
│  │  │  └─ sections/
│  │  │     ├─ basics.tsx                       # BasicsSection：基本信息分节表单
│  │  │     ├─ education.tsx                    # EducationSection：教育经历分节
│  │  │     ├─ experience.tsx                   # ExperienceSection：工作经历分节（成果分条/技术栈）
│  │  │     ├─ projects.tsx                     # ProjectsSection：项目经历分节
│  │  │     └─ other.tsx                        # OtherSection：证书/竞赛/开源分节
│  │  ├─ settings/                              # 设置 + 日志诊断（U10/U11）
│  │  │  ├─ index.tsx                           # SettingsScreen：三标签页整屏（写入不闪 loading）
│  │  │  ├─ config-panel.tsx                    # ConfigPanel：模型用途/系统控制/运行资源三卡布局
│  │  │  ├─ purposes-panel.tsx                  # PurposesPanel：AI 用途开关矩阵（总开关关即规则降级）
│  │  │  ├─ guard-panel.tsx                     # GuardPanel：发送分层/额度/冷却/批上限/时段
│  │  │  ├─ resources-panel.tsx                 # ResourcesPanel：浏览器与采集节奏设置
│  │  │  ├─ browser-panel.tsx                   # BrowserPanel：浏览器自动关闭策略
│  │  │  ├─ data-panel.tsx                      # DataPanel：保留策略/磁盘/清理预览与执行/导入导出
│  │  │  ├─ logs-panel.tsx                      # LogsPanel：诊断与调用日志页容器（三份数据）
│  │  │  ├─ diagnostics-panel.tsx               # DiagnosticsPanel：版本/运行时长/数据路径
│  │  │  ├─ llm-calls-table.tsx                 # LlmCallsTable：模型调用留痕表（谁最贵）
│  │  │  ├─ audit-table.tsx                     # AuditTable：过闸门动作审计表
│  │  │  └─ payload-drawer.tsx                  # PayloadDrawer：单次调用完整 JSON 抽屉
│  │  └─ today/                                 # 今日首屏（U0）
│  │     ├─ index.tsx                           # TodayScreen：回答「今天干什么」（四路数据聚合）
│  │     ├─ next-run-card.tsx                   # NextRunCard：新鲜度 + 立即采集 + 下次自动运行卡
│  │     └─ todo-list.tsx                       # TodoList：四种待办各配动作按钮
│  ├─ styles/                                   # 纯 CSS 常量仓库（index.ts 按固定顺序一次注入）
│  │  ├─ index.ts                               # installStyles()：总装注入/卸载
│  │  ├─ tokens.ts                              # SEMANTIC_TEXT：语义色令牌（color-mix 达标对比度）
│  │  ├─ primitives.ts                          # SCREEN/CARD_TITLE/CONTROLS 等 10 段通用基础样式
│  │  ├─ responsive.ts                          # SMALL/SMALL_TOP：小屏响应式降级
│  │  ├─ shell.ts                               # ENTRY_ICON/SHELL/OVERLAY：插件外壳样式
│  │  ├─ toolviews.ts                           # TOOLVIEW_CARD：对话流工具卡片样式
│  │  ├─ screens/
│  │  │  ├─ board.ts                            # FUNNEL/BOARD_FILTERS/SALARY_BOX：看板样式
│  │  │  ├─ campus.ts                           # CAMPUS：校招截止色阶（24h 橙/过期红）
│  │  │  ├─ collect.ts                          # 方案卡/弹窗/运行表/平台矩阵样式
│  │  │  ├─ jobs.ts                             # 岗位库筛选/分栏/分页样式
│  │  │  ├─ messages.ts                         # MESSAGES：HR 消息与面试卡片
│  │  │  ├─ pipeline.ts                         # PIPELINE：看板列布局（7 列防溢出）
│  │  │  ├─ resumes.ts                          # RESUMES：左列表右工作区 grid
│  │  │  ├─ settings.ts                         # SETTINGS：二级标签 + 容器查询两栏
│  │  │  └─ today.ts                            # TODAY/TODAY_HEALTH：统计卡与健康模块
│  │  └─ views/
│  │     ├─ freshness.ts                        # FRESHNESS：三级色阶新鲜度徽章
│  │     └─ job-detail.ts                       # 详情主体/匹配分/定制区/公司复核样式
│  ├─ toolviews/                                # 对话流 tool.call 结果卡片
│  │  ├─ greeting-card.tsx                      # GreetingCard：话术草稿卡（只复制/去面板发，不直接发）
│  │  ├─ job-detail-card.tsx                    # JobDetailCard：岗位详情卡（收藏/生成话术真实改状态）
│  │  ├─ jobs-card.tsx                          # JobsCard：岗位列表卡（job_search/job_list 共用）
│  │  ├─ open-panel.ts                          # openJobInPanel()：记意图再切面板
│  │  └─ parts.tsx                              # CardShell/Row/JobRow/useAction/textOf：卡片共用零件
│  ├─ ui/                                       # 跨屏基础控件
│  │  ├─ async-view.tsx                         # LoadingLine/ErrorLine/AsyncView：异步三态统一写法
│  │  ├─ clipboard.ts                           # copyText()：剪贴板写入（降级 execCommand）
│  │  ├─ feedback.tsx                           # Feedback 接口 + IDLE：动作进行中/结果反馈态
│  │  ├─ field-hint.tsx                         # FieldHint：可展开字段说明问号
│  │  ├─ icons.tsx                              # IconCopy/IconFolder：SVG 图标
│  │  ├─ inline-md.tsx                          # InlineMd/parseInline：极简行内 Markdown（零依赖）
│  │  ├─ modal.tsx                              # Modal：通用弹窗（Esc/遮罩/焦点陷阱）
│  │  ├─ number-field.tsx                       # NumberField：失焦才提交的数字输入
│  │  ├─ switch.tsx                             # Switch：真 checkbox 开关
│  │  └─ terms.tsx                              # Term + TERM_EXPLAIN：术语释义
│  └─ views/
│     ├─ freshness.tsx                          # FreshnessBadge：三级色阶 + 永远带文字
│     ├─ resume-file-picker.tsx                 # ResumeFilePicker：投递用简历附件选择器
│     └─ job-detail/                            # 岗位详情（U2）
│        ├─ body.tsx                            # JobDetailBody：正文编排骨架（抽屉/内嵌栏共用）
│        ├─ drawer.tsx                          # JobDetailDrawer：模态抽屉形态
│        ├─ pane.tsx                            # JobDetailPane：右侧内嵌栏形态（含空态引导）
│        ├─ gauge.tsx                           # Gauge：匹配分环形仪表（三档色带）
│        ├─ jd-text.tsx                         # JdText：JD 原文折叠展示（默认 320 字）
│        ├─ company-jobs.tsx                    # CompanyJobs：同司其它在招岗位列表
│        ├─ company-review.tsx                  # CompanyReview：公司人工复核表单（标签/拉黑/备注）
│        ├─ overseas-panel.tsx                  # OverseasPanel：工签分析/时区双显/Cover Letter
│        ├─ tailor-panel.tsx                    # TailorPanel：简历定制（规则定制 + AI 改写措辞）
│        └─ panels/
│           ├─ apply-panel.tsx                  # ApplyEntry + ApplyModal：投递入口与两步确认弹窗
│           ├─ company-jobs-panel.tsx           # CompanyJobsPanel：同司岗位卡壳
│           ├─ company-panel.tsx                # CompanyPanel：公司画像卡 + 拉黑醒目提示
│           ├─ jd-panel.tsx                     # JdPanel：JD 原文卡（没抓到如实说）
│           ├─ match-panel.tsx                  # MatchPanel：匹配分 + 逐条加减分理由
│           ├─ risk-panel.tsx                   # RiskPanel：风险标注红/黄/中性三档
│           ├─ summary-panel.tsx                # JobFacts + ContactStagePanel：基本信息与接触态
│           └─ tag-groups.tsx                   # TagGroups：技能要求/公司福利两组标签
│
├─ host/                                        # 宿主半（Node 侧：领域、采集、存储、HTTP、工具）
│  ├─ index.ts                                  # cordis 插件入口：apply 立即返回，重活在 ready()
│  ├─ runtime.ts                                # createHostRuntime()：组合根，装配成 HostRuntime 门面
│  ├─ http.ts                                   # 【类】HttpError：类型化 HTTP 错误；registerHttpRoutes()/serveEventStream() 传输层
│  ├─ settings.ts                               # createSettingsService()：配置门面（界面/模型/审计同一写入路径）
│  ├─ browser-config.ts                         # 浏览器运行期配置（空闲自关/跑完即关）读写与归一化
│  ├─ crawl-config.ts                           # 采集运行期配置（单轮预算分钟）读写与归一化
│  ├─ ai/
│  │  ├─ client.ts                              # createAiService()：AI 调用统一入口（用途开关+隐私闸+留痕+降级）
│  │  ├─ llm-port.ts                            # 【类】LlmRouteUnavailableError；createLlmPort()：宿主 llm 服务适配端口
│  │  ├─ privacy.ts                             # applyPrivacy()：出站黑名单脱敏 + 白名单裁字段
│  │  ├─ prompts.ts                             # makeNonce/wrapUntrusted/buildPrompt/extractJson：提示注入围栏
│  │  └─ purposes.ts                            # AI_PURPOSES 16 种用途枚举 + 开关默认值 + 配置归一化
│  ├─ domain/                                   # 领域服务层（接口 + createXxxService 工厂）
│  │  ├─ analytics.ts                           # createAnalyticsService()：漏斗/归因/薪资分位/箱线/A-B 对比（小样本不给 %）
│  │  ├─ campus.ts                              # createCampusService()：校招批次/测评/三方/硬截止（不可逆节点）
│  │  ├─ companies.ts                           # createCompanyService()：公司名归一与幂等登记
│  │  ├─ crawl.ts                               # runCrawl()：一轮抓取完整时序编排（锁→风控→解析→断言→去重→入库）
│  │  ├─ dedupe.ts                              # shouldMerge()/applyDedup()：保守去重判定（拿不准不合并）
│  │  ├─ dedupe-sweep.ts                        # sweepDedup()：全库去重复核（与抓取同一套标准）
│  │  ├─ dictionary-seed.ts                     # DICTIONARY_SEED：内置规则词表种子（五类，不走 LLM）
│  │  ├─ intel.ts                               # createIntelService()：风险标注/公司画像/可解释匹配打分
│  │  ├─ interviews.ts                          # createInterviewService()：冲突检测/准备包/错题本/状态机
│  │  ├─ job-views.ts                           # 保存的筛选视图读写（读宽容写严格）
│  │  ├─ jobs.ts                                # createJobService()：岗位查询/详情/标记/幂等写入
│  │  ├─ messages.ts                            # createMessageService()：会话分组/未读/邀约识别/回复草稿
│  │  ├─ offers.ts                              # createOfferService()：Offer 对比/截止倒计时（模型只建议不拍板）
│  │  ├─ outreach.ts                            # createOutreachService()：话术生成只出草稿 + 输出再校验
│  │  ├─ overseas.ts                            # createOverseasService()：工签/远程识别/时区双显/英文检查
│  │  ├─ pipeline.ts                            # createPipelineService()：双状态机（投递阶段+接触态）必留事件
│  │  ├─ plan-config.ts                         # validatePlanConfig()：方案唯一校验实现（三入口共用）
│  │  ├─ plans.ts                               # createPlanService()：搜索方案 CRUD + 默认方案
│  │  ├─ portability.ts                         # exportData()/importJobs()：JSON/CSV/zip 导出导入
│  │  ├─ resumes.ts                             # createResumeService()：版本化简历/定制/导出/话术模板
│  │  └─ today.ts                               # buildToday()：今日聚合（不返回恒 0 占位字段）
│  ├─ guard/                                    # 安全闸门（高危动作唯一通道）
│  │  ├─ index.ts                               # 【类】ConfirmRequiredError；createGuard()：规则链→审批→令牌→锁→执行→审计
│  │  ├─ approval.ts                            # createApprovalPort()：审批端口 fail-closed（超时=拒绝）
│  │  ├─ rules.ts                               # runRuleChain()：规则检查链 + GuardConfig 持久化 + DEFAULT_GUARD_CONFIG
│  │  ├─ token.ts                               # guardAuthority：AsyncLocalStorage 一次性令牌（危险实现首行校验）
│  │  ├─ types.ts                               # Danger/GuardInput/GuardDeniedReason 等纯类型
│  │  └─ actions/                               # 危险动作实现（首行令牌校验，不走 domain 公开面）
│  │     ├─ application.ts                      # sendApplication()：真投简历到平台（成功才落库）
│  │     ├─ greeting.ts                         # sendGreeting()：真发打招呼话术
│  │     ├─ inbox.ts                            # syncInbox()：同步平台收件箱（要开浏览器故过闸门）
│  │     ├─ reply.ts                            # sendReply()：真回复 HR 消息
│  │     ├─ settings.ts                         # writeGuardSettings()：写闸门配置（模型禁改键二次校验）
│  │     └─ stage.ts                            # probeContactStage()：只读探测接触阶段（绝不写库）
│  ├─ http/
│  │  ├─ router.ts                              # routeRequest()：唯一分发入口（精确形状路由表 + 错误翻译）
│  │  ├─ sse.ts                                 # createEventBus()/formatSseFrame()：事件总线 + SSE 线格式
│  │  └─ routes/                                # 同构 handler 集合（返回 undefined=穿透下一表项）
│  │     ├─ types.ts                            # RouteRequest/RouteResult（叶子，防循环引用）
│  │     ├─ kit.ts                              # RouteContext/json/parseRecordId 等路由共享工具
│  │     ├─ analytics.ts                        # funnel/attribution/salary/salaryBox/salaryBaseline/resumeCompare
│  │     ├─ applications.ts                     # deliver/deliverBatch/list/advance/board/followups
│  │     ├─ campus.ts                           # 校招/测评/三方/宣讲会/硬截止端点
│  │     ├─ companies.ts                        # list/review/detail：公司画像与复核
│  │     ├─ crawl.ts                            # status/runs/run/once/dimensions/previewCriteria
│  │     ├─ data.ts                             # exportData/importData：可携带性（bytes + 分批导入）
│  │     ├─ dedup.ts                            # groups/sweep/split/dropGroup：去重复核（可逆铁律）
│  │     ├─ health.ts                           # health/today/events：健康、首屏聚合、SSE 流
│  │     ├─ intel.ts                            # dictionary/recompute：词表与重算
│  │     ├─ interviews.ts                        # 面试 CRUD/冲突/准备包 + 错题本
│  │     ├─ jobs.ts                             # list/facets/mark/batchMark/views/export/detail
│  │     ├─ maintenance.ts                      # storage/cleanupPreview/cleanup：唯一删用户数据动作
│  │     ├─ messages.ts                         # inbox/post/read/reply/extractInterview/draftReply
│  │     ├─ offers.ts                           # list/create/compare/patch/setState/byJob
│  │     ├─ ops.ts                              # reveal/llmCalls/audit/guardUsage/settings
│  │     ├─ outreach.ts                         # greetingDraft/Send/Batch、inboxSync、contactStage、模板
│  │     ├─ overseas.ts                         # analyze/visa/timezone/englishCheck/coverLetters
│  │     ├─ plans.ts                            # 方案 CRUD/校验/run/resume
│  │     ├─ platforms.ts                        # list/loginStatus/loginStart/loginCheck/adapterConfig
│  │     ├─ repairs.ts                          # 待修复队列 list/discard/clear
│  │     ├─ resumes.ts                          # 简历 CRUD/附件/预览导出/定制/话术模板
│  │     ├─ schedule.ts                         # lease/pause/reasons/schedulerStatus
│  │     └─ todos.ts                            # list/get/confirmResume/close
│  ├─ platform/                                 # 平台采集基础设施
│  │  ├─ types.ts                               # SiteAdapter 契约 + 【类】PlatformBlockedError（携带 BlockKind）
│  │  ├─ block-signals.ts                       # COMMON_SIGNALS/detectBlockWithSignals()：判墙词表（页面上下文共用）
│  │  ├─ browser.ts                             # createBrowserManager()/createPagePool()：浏览器生命周期/页面池/幽灵锁
│  │  ├─ cdp-guard.ts                           # installPortGuard()：CDP 网络层伪造 ConnectionRefused 防探测
│  │  ├─ cities.ts                              # CITY_DIRECTORY：373 城规范目录 + 支持度判定
│  │  ├─ config-merge.ts                        # mergeAdapterConfig()：DB 覆盖合并共享实现
│  │  ├─ health.ts                              # readAdapterHealth()/applyFieldPresence()：健康状态机与降级
│  │  ├─ humanize.ts                            # humanClick/humanType/humanMoveTo：拟人输入唯一通道
│  │  ├─ idle-close.ts                          # createIdleCloser()：浏览器空闲自关（可取消/复问）
│  │  ├─ lease.ts                               # createLease()：单实例租约锁（pid+心跳防双开）
│  │  ├─ locks.ts                               # createPlatformLocks()：按平台互斥（忙则失败不排队）
│  │  ├─ pacing.ts                              # 【类】BurstGuard：突发罚延迟；humanDelayMs()/gaussBounded() 节奏
│  │  ├─ platform-facts.ts                      # PLATFORM_FACTS：平台事实表（成熟度/登录/上限/副作用）
│  │  ├─ preview.ts                             # previewOf()：筛选条件→实际请求预览
│  │  ├─ registry.ts                            # createAdapterRegistry()：适配器注册表（热替换）
│  │  ├─ risk-pause.ts                          # 平台级风控暂停读写（跨方案生效）
│  │  ├─ session.ts                             # createSessionService()/createLoginFlow()：登录态与引导
│  │  ├─ stealth.ts                             # STEALTH_INIT_SCRIPT：恢复 JS 环境原生样（不伪造身份）
│  │  ├─ validate.ts                            # partitionByRequiredFields()：字段断言与脏数据隔离
│  │  ├─ yield-baseline.ts                      # applyYieldBaseline()：产量骤降静默失败告警
│  │  ├─ runtime/
│  │  │  └─ cdp-proxy.mjs                       # 独立脚本：本地 HTTP→CDP 桥（连日常 Chrome 调试端口）
│  │  └─ adapters/                              # 10 平台适配器（均为 createXxxAdapter 工厂，无类）
│  │     ├─ zhipin/                             # BOSS 直聘：滚动加载+接口回填薪资反混淆+全套 5 动作
│  │     │  ├─ index.ts                         # createZhipinAdapter()：装配（滚动懒加载为唯一翻页）
│  │     │  ├─ config.ts                        # 选择器/城市码/ZHIPIN_MAX_PAGES=1 等配置 + mergeZhipinConfig
│  │     │  ├─ urls.ts                          # buildZhipinSearchUrl/buildJoblistBody
│  │     │  ├─ api.ts                           # fetchJoblistInPage()：接口明文薪资与补充字段回填
│  │     │  ├─ actions.ts                       # createZhipinActions()：sayHello/reply/sendResume/readInbox/detectStage
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # scrollToLoadInPage/extractJobsInPage：滚动加载与解析
│  │     │     ├─ detail.ts                     # extractDetailInPage：详情解析（剔品牌水印防脏 JD）
│  │     │     ├─ chat.ts                       # 会话页：弹窗/送达判读/会话行交叉验证
│  │     │     └─ inbox.ts                      # readInboxInPage/detectStageInPage：收件箱与接触态
│  │     ├─ fiftyone-job/                       # 前程无忧 51：功能对标 zhipin
│  │     │  ├─ index.ts                         # createFiftyOneAdapter()：装配 + 判墙唯一实现
│  │     │  ├─ config.ts                        # 选择器族/排序域/POSTED_WITHIN 刻意为空 + merge
│  │     │  ├─ urls.ts                          # buildSearchUrl（刻意不发 issueDate）
│  │     │  ├─ actions.ts                       # createFiftyOneActions()：五动作（证据分层 fail-closed）
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # 列表解析/翻页/登录锚点
│  │     │     ├─ detail.ts                     # 详情解析（选择器候选链）
│  │     │     ├─ chat.ts                       # 沟通入口形态/投递弹窗/消息送达
│  │     │     └─ inbox.ts                      # 收件箱与接触阶段判定
│  │     ├─ liepin/                             # 猎聘：风控最强，接口型收件箱
│  │     │  ├─ index.ts                         # createLiepinAdapter()：about:blank 判停不重试
│  │     │  ├─ config.ts                        # 选择器/API 路径/x-fscp-* 请求头/判墙信号
│  │     │  ├─ codes.ts                         # LIEPIN_CITY_CODES：370 城市码表
│  │     │  ├─ urls.ts                          # 搜索 URL 与搜索/会话接口请求体构造
│  │     │  ├─ api.ts                           # fetchListInPage/fetchContactListInPage：页面内接口通道
│  │     │  ├─ actions.ts                       # createLiepinActions()：真键盘输入 IM（3 动作）
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # 列表解析（语义锚点，不依赖混淆类名）
│  │     │     ├─ detail.ts                     # 详情解析（按文案锚定）
│  │     │     └─ chat.ts                       # 会话页：元素定位（排除侧边栏）/送达判读
│  │     ├─ zhaopin/                            # 智联：DOM+__INITIAL_STATE__ 双源
│  │     │  ├─ index.ts                         # createZhaopinAdapter()：AB 分流兜底（载荷为权威源）
│  │     │  ├─ config.ts                        # 选择器/掩码标记/城市码/筛选项
│  │     │  ├─ urls.ts                          # buildZhaopinSearchUrl/buildTalkListUrl
│  │     │  ├─ api.ts                           # 会话接口：talkRowsOf/mapTalkRowsToInbox/stageOfTalkRow
│  │     │  ├─ actions.ts                       # createZhaopinActions()：readInbox/detectStage/sendResume
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # 列表解析 + 载荷补字段/翻页/总数
│  │     │     ├─ detail.ts                     # 详情：未登录掩码时取 INITIAL_STATE 真值
│  │     │     ├─ apply.ts                      # 投递面：入口态/元素中心/成功弹窗（独有）
│  │     │     └─ block.ts                      # 判墙：静默登录失败识别（独有）
│  │     ├─ linkedin/                           # LinkedIn：guest 端点导航式主通道
│  │     │  ├─ index.ts                         # createLinkedInAdapter()：顶层导航绕 CSP（动作仅 readInbox）
│  │     │  ├─ config.ts                        # 选择器/URN 正则/maxPages=2 保守/判墙
│  │     │  ├─ urls.ts                          # buildLinkedInGuestApiUrl/buildLinkedInSearchUrl
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # guest 片段卡片解析 + 登录态薪资回填
│  │     │     ├─ detail.ts                     # 游客 SSR 详情解析
│  │     │     ├─ guard.ts                      # wallKindInPage：authwall/checkpoint 地址级判墙（独有）
│  │     │     └─ inbox.ts                      # readInboxInPage：无未读/方向标记则不猜
│  │     ├─ guopin/                             # 国聘：无动作，接口列表 + 内容哈希幂等键
│  │     │  ├─ index.ts                         # createGuopinAdapter()：platformJobId=FNV1a 内容哈希
│  │     │  ├─ config.ts                        # 12 个解析正则/登录 URL/上限
│  │     │  ├─ dictionaries.ts                  # GUOPIN_EXPERIENCE_OPTIONS(11 档)/MAJOR_OPTIONS(34)
│  │     │  ├─ urls.ts                          # 搜索/详情 URL 构造
│  │     │  ├─ api.ts                           # buildGuopinListBody/guopinListPageOf：列表接口
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # DOM 卡片解析 + 翻页 + 登录锚点
│  │     │     └─ detail.ts                     # 详情解析（登录态校准结构）
│  │     ├─ hiredchina/                         # HiredChina：列表走 RSC 流
│  │     │  ├─ index.ts                         # createHiredChinaAdapter()：__next_f RSC payload 通道
│  │     │  ├─ config.ts                        # RSC 锚点/类型枚举/上限
│  │     │  ├─ urls.ts                          # buildHiredChinaSearchUrl（无城市筛选）
│  │     │  └─ page/
│  │     │     ├─ list.ts                       # extractJobsFromPayloadInPage：RSC 流拼接抽取
│  │     │     └─ detail.ts                     # SSR 详情解析（JD 两段拼接）
│  │     ├─ indeed/                             # Indeed：匿名可搜，内嵌载荷回填
│  │     │  ├─ index.ts                         # createIndeedAdapter()：DOM 定集合 + mosaic 载荷补字段
│  │     │  ├─ config.ts                        # 分页选择器/fromage 实测档位/判墙与跨域登录墙
│  │     │  ├─ urls.ts                          # buildIndeedSearchUrl（start 步进 10）
│  │     │  └─ page.ts                          # extractJobsInPage/hasNextPage/isLoggedIn/extractDetail
│  │     ├─ sinojobs/                           # 中欧招聘：POST 表单接口型
│  │     │  ├─ index.ts                         # createSinoJobsAdapter()：页面上下文 fetch 列表接口
│  │     │  ├─ config.ts                        # API 路径/地点码/行业种子/上限
│  │     │  ├─ urls.ts                          # URL 外壳 + buildSinoJobsRequestBody
│  │     │  └─ page.ts                          # __SINOJOBS_LIST_PAYLOAD__ 写读协议 + 429 判墙
│  │     └─ waiqi-job/                          # 神仙外企：接口型，maxPages 恒 1
│  │        ├─ index.ts                         # createWaiqiAdapter()：翻页坏则声明 1 页不假装
│  │        ├─ config.ts                        # 类型/经验/学历枚举 + 三张种子表 + 上限
│  │        ├─ urls.ts                          # splitCityList/buildWaiqiSearchUrl/buildWaiqiRequestBody
│  │        └─ page.ts                          # __WAIQI_LIST_PAYLOAD__ 协议：JD 走同源 details 接口
│  ├─ render/
│  │  ├─ resume-html.ts                         # renderResumeHtml()：简历→自包含 HTML（预览与打印同源）
│  │  ├─ pdf.ts                                 # createPdfRenderer()：临时 headless Chromium 渲 PDF（懒启动）
│  │  ├─ docx.ts                                # renderResumeDocx()：零依赖手写 OOXML（字节级可重复）
│  │  └─ zip.ts                                 # buildZip()：最小 ZIP 容器（仅 node:zlib）
│  ├─ runtime/
│  │  ├─ contract.ts                            # dataNotReady()/RuntimeFailure：装配门面契约（叶子）
│  │  ├─ adapters.ts                            # ADAPTER_SPECS + registerAdapters()/rebuildAdapter()：平台注册样板
│  │  ├─ actions.ts                             # createRuntimeActions()：七高危动作编排（闸门+令牌+回写+广播）
│  │  ├─ batch.ts                               # 【类】CompanyDeduper（批内同公司去重）/ 【类】QuotaReserver（额度预占）
│  │  ├─ greeting-batch.ts                      # previewGreetingBatch()/sendGreetingBatch()：批量打招呼
│  │  ├─ application-batch.ts                   # previewApplicationBatch()/sendApplicationBatch()：批量投递
│  │  ├─ gate.ts                                # createPlatformGate()：每平台前置条件判定
│  │  ├─ lifecycle.ts                           # takeOverLease()/startHeartbeat()：租约接管与心跳
│  │  └─ views.ts                               # buildHealth/buildCrawlStatus 等：store→DTO 只读投影
│  ├─ scheduler/
│  │  ├─ index.ts                               # createScheduler()：T1 窗口随机/T2 在场提示/T3 人工，不发高危动作
│  │  ├─ lanes.ts                               # runInLanes()：泳道并发发令器（失败不连坐）
│  │  ├─ schedule.ts                            # nextRunAt()/insideWindow()：确定性哈希随机选点排程
│  │  └─ timer-port.ts                          # cordisTimerPort/nativeTimerPort/createManualTimer：定时器端口
│  ├─ store/
│  │  ├─ db.ts                                  # openDatabase()：SQLite 连接（固定路径 + application_id 自保护）
│  │  ├─ schema.ts                              # SCHEMA_V1~V12：全部建表 DDL 常量
│  │  ├─ migrate.ts                             # MIGRATIONS：v1–v12 迁移（每版一事务 + VACUUM INTO 备份）
│  │  ├─ row.ts                                 # asText/asInt/asJson 等：行值类型安全读取
│  │  ├─ store.ts                               # openStore()：Store 门面（组装 21 仓储，隔离 sqlite 风险）
│  │  ├─ cleanup.ts                             # storageUsageOf/cleanupPlanOf/runCleanupOf：保留策略与清理
│  │  └─ repo/                                  # 21 个表仓储（createXxxRepo 工厂，无类）
│  │     ├─ jobs.ts                             # JobRepo：岗位主表（写入/多维筛选/分页/facets）
│  │     ├─ plans.ts                            # PlanRepo + normalizeSchedule 等：方案与排程归一化
│  │     ├─ platforms.ts                        # PlatformRepo：平台注册与健康度
│  │     ├─ accounts.ts                         # AccountRepo：登录态（绝不存密码）
│  │     ├─ crawl-runs.ts                       # CrawlRunRepo：运行记录 + reapStaleRuns 收敛悬挂记录
│  │     ├─ companies.ts                        # CompanyRepo：公司实体幂等登记 + 画像统计
│  │     ├─ signals.ts                          # SignalRepo：公司识别信号留痕（重算前清旧）
│  │     ├─ flags.ts                            # FlagRepo：岗位风险标注（重算=先清后写）
│  │     ├─ dictionary.ts                       # DictionaryRepo：规则词表（幂等播种）
│  │     ├─ field-health.ts                     # FieldHealthRepo：字段缺失计数（降级告警）
│  │     ├─ repairs.ts                          # RepairRepo：隔离修复队列（HTML≤20KB）
│  │     ├─ dedup-groups.ts                     # DedupGroupRepo：去重分组（可逆，拆到一人即删组）
│  │     ├─ pipeline.ts                         # PipelineRepo：greeting/message/application/interview/错题本/阶段事件六表
│  │     ├─ resumes.ts                          # ResumeRepo：简历版本 + 附件（rev 只增）
│  │     ├─ tailorings.ts                       # TailoringRepo：定制建议（显式采用 + 归因）
│  │     ├─ offers.ts                           # OfferRepo：Offer（comp 过 normalize，外键 SET NULL）
│  │     ├─ campus.ts                           # BranchRepo：校招/海外支线（含 deadlines）
│  │     ├─ todos.ts                            # TodoRepo：待办（createOnce 幂等防刷屏）
│  │     ├─ audit.ts                            # AuditRepo + summarize()：审计只存摘要不存正文
│  │     ├─ llm-calls.ts                        # LlmCallRepo：模型调用留痕（外发字段清单）
│  │     └─ settings.ts                         # SettingRepo：三层作用域配置（global/platform/plan）
│  ├─ tools/                                    # 暴露给 AI 模型的 35 个工具
│  │  ├─ index.ts                               # registerJobHunterTools()：唯一公共入口（失败进 report 经 /health 可见）
│  │  ├─ types.ts                               # ToolRegistration/Report（叶子契约）
│  │  ├─ exec-context.ts                        # toolExec：AsyncLocalStorage 传「这次调用是谁在跑」
│  │  ├─ kit.ts                                 # schema/str/num 构造器 + TOOL_LIST_MAX/TOOL_BATCH_MAX 上限
│  │  ├─ jobs.ts                                # job_query/job_detail/job_mark/job_dedup/job_score/job_search
│  │  ├─ crawl.ts                               # crawl_run（中危过审批）/ crawl_status
│  │  ├─ plans.ts                               # job_plan_manage：方案查看/创建/启停/立即跑
│  │  ├─ outreach.ts                            # greeting_draft/greeting_send/inbox_list/contact_stage/message_reply
│  │  ├─ applications.ts                        # application_deliver/send/update + interview_* + 错题本
│  │  ├─ resumes.ts                             # resume_list/read/save（中危）/tailor（三重防护）
│  │  ├─ analytics.ts                           # job_report：漏斗/归因/薪资/对比
│  │  ├─ offers.ts                              # offer_manage：登记/对比/定夺合一
│  │  ├─ campus.ts                              # campus_manage：网申/测评/三方/宣讲会
│  │  ├─ overseas.ts                            # overseas_check：工签/双时区/英文体检
│  │  ├─ data.ts                                # data_transfer：占用/预览/导出/导入（刻意无执行清理）
│  │  └─ settings.ts                            # job_settings：模型可改键白名单（额度冷却一律不可改）
│  └─ util/
│     ├─ errors.ts                              # 【类】DomainError：领域层唯一错误类型（code/hint/status/toJson）
│     ├─ company-name.ts                        # normalizeCompanyName/strictCompanyName：公司名归一（两套后缀表）
│     ├─ dedupe.ts                              # compareCompanyNames/compareJobs：多级漏斗去重判定（阈值 0.88）
│     ├─ salary.ts                              # parseSalary()：薪资解析为统一元/月（保留原文）
│     ├─ text.ts                                # matchTerms/normalizeForMatch：纯规则词表命中
│     ├─ time.ts                                # detectTimezone/isoNow/Clock：ISO-8601 UTC 时间工具
│     ├─ offline.ts                             # assertNetworkAllowed()：离线闸门（环境变量开关）
│     └─ reveal.ts                              # revealDataFile()：系统文件管理器打开数据目录
│
└─ shared/                                      # 宿主与客户端共享（只放标量与纯函数）
   ├─ config/
   │  ├─ plugin.ts                              # PLUGIN_ID/ROUTE_PREFIX/DATA_DIR_NAME/APPLICATION_ID 等标识
   │  ├─ limits.ts                              # MAX_BODY_BYTES(64KB)/附件 5MB/分页/导入导出上限
   │  ├─ batch.ts                               # BATCH_MAX_ITEMS(5)/条间随机 3–9s
   │  ├─ browser.ts                             # 空闲自关默认 10min/范围/跑完即关 3s
   │  ├─ crawl.ts                               # 降级阈值/写批 200/延时 1.2–3.2s/日限 8 轮/单轮预算 20min/泳道 3
   │  └─ retention.ts                           # 分层保留默认（投递消息永久，JD 180 天）+ exports 目录
   ├─ contract/
   │  ├─ dsh.ts                                 # 宿主 Cordis 接口最小本地类型面（实测投影，不引官方依赖）
   │  ├─ dto/                                   # 17 个对外 DTO 文件（只允许标量 JSON）
   │  │  ├─ job.ts                              # JobDto/JobPageDto/JobFacetsDto/JobDetailDto/SavedJobViewDto 等
   │  │  ├─ plan.ts                             # PlanDto/SchedulerStatusDto/LeaseStatusDto/CriteriaPreviewDto 等
   │  │  ├─ platform.ts                         # PlatformOverviewDto/AdapterConfigDto/RepairDto/LoginStatusDto 等
   │  │  ├─ crawl.ts                            # HealthDto/CrawlRunDto/CrawlSummaryDto/AdapterHealthDto 等
   │  │  ├─ pipeline.ts                         # ApplicationDto/BoardDto/GreetingDraftDto/FollowUpDto/StageEventDto
   │  │  ├─ analytics.ts                        # FunnelDto/AttributionDto/AnalyticsFilter
   │  │  ├─ offer.ts                            # OfferDto/OfferCompareDto/SalaryBandDto/SalaryBoxDto/SalaryBaselineDto
   │  │  ├─ resume.ts                           # ResumeDto/TailoringDto/GreetingTemplateDto/ResumeCompare*
   │  │  ├─ message.ts                          # MessageDto（inviteSignal）/InboxDto/ReplyDraftDto
   │  │  ├─ interview.ts                        # InterviewDto/InterviewConflictDto/InterviewPrepDto/QuestionNoteDto
   │  │  ├─ campus.ts                           # CampusApplicationDto/AssessmentDto/TripartiteDto/DeadlineDto
   │  │  ├─ overseas.ts                         # VisaRequirementDto/TimezoneDisplayDto/CoverLetterDto
   │  │  ├─ batch.ts                            # GreetingBatch*/ApplicationBatch* 五件套
   │  │  ├─ dedup.ts                            # DedupGroupDto/DedupSweepResultDto
   │  │  ├─ settings.ts                         # SettingsDto/AuditRecordDto/LlmCallDto/AdapterConfigDto
   │  │  ├─ storage.ts                          # RetentionPolicy/StorageUsageDto/CleanupPlanDto/DataImportResultDto
   │  │  └─ today.ts                            # TodayDto/TodoDto/GuardUsageDto/ConfirmActionIntentDto
   │  └─ enums/                                 # 16 个枚举文件（as const 取值域 + 中文 Label Record）
   │     ├─ job.ts                              # JobState/FreshnessLevel/DeliveryState/JobFlagType/JobOrderValue
   │     ├─ pipeline.ts                         # ContactStage/ApplicationStage/GreetingTone + stageRank/nextStageOf
   │     ├─ crawl.ts                            # CrawlState/HealthState/CoreField/BlockKind
   │     ├─ plan.ts                             # SkipReason/RunReasonKey/SettingScope + runReasonLabel
   │     ├─ platform.ts                         # MaturityLevel/AuthRequirementValue + maturityNeedsWarning
   │     ├─ guard.ts                            # Actor(gui/model/schedule/user)/AuditResult + Label/Tone
   │     ├─ campus.ts                           # CampusBatch/CampusStage/AssessmentKind/TripartiteState
   │     ├─ interview.ts                        # InterviewState/InterviewKind
   │     ├─ offer.ts                            # OfferState/OFFER_OPEN_STATES
   │     ├─ overseas.ts                         # VisaStance/RemoteKind/CoverLetterLanguage
   │     ├─ resume.ts                           # ResumeState/ResumeLanguage/ResumeTemplate/ResumeFormat
   │     ├─ message.ts                          # MessageDirection(hr/me)/ReplyScenario
   │     ├─ analytics.ts                        # SalaryBasis(monthly_min/annualized)
   │     ├─ storage.ts                          # DataExportFormat(json/csv/archive)
   │     ├─ today.ts                            # TodoKind/TodoLevel
   │     └─ error.ts                            # CRAWL_FAILURE_CODES：失败码集中声明（含历史码）
   ├─ domain/
   │  ├─ job-facets.ts                          # expBucketOf/buildExpChips：筛选取值集归一（梯队 chips）
   │  ├─ offer-comp.ts                          # OfferComp 16 维待遇字段 + normalizeOfferComp/annualCashOf
   │  └─ resume-content.ts                      # ResumeContent 结构 + normalize/inspect/checkNoFabrication（防编造）
   └─ text/
      ├─ criteria-label.ts                      # describeCriteria/formatCriteriaLine：条件→中文一行
      ├─ error-text.ts                          # humanizeFailure/failureKindOf：错误→人话+建议
      ├─ time-format.ts                         # formatClock/formatRelative/formatLocalMoment 等 20 个时间格式化
      └─ tool-format.ts                         # formatJobListLine/parseJobListLine：工具结果文本契约
```

全仓 13 个真正的 `class`（其余均为函数组件/工厂函数/常量）：
`ScreenErrorBoundary`、`ApiError`、`NeedsConfirmError`（client）；`ConfirmRequiredError`（guard）；
`BurstGuard`、`PlatformBlockedError`（platform）；`HttpError`（host/http）；`CompanyDeduper`、
`QuotaReserver`（runtime/batch）；`LlmRouteUnavailableError`（ai）；`DomainError`（util）。
