# dsh-job-hunter

> **这是开发 / 技术版 README**（原 `README.md` 的完整备份）：包含各阶段的实现细节、验收证据与踩坑记录。
> 只想了解这个项目是什么，请回 [`README.md`](README.md)；逐字节原文见 git 提交 `be13d88`。

本地求职情报系统 —— 跑在 DSH 宿主进程里的岗位采集 / 匹配 / 跟进工作台。

用 Playwright 复用你自己的浏览器登录态采集数据，用 sqlite 沉淀画像与历史，用同一套领域逻辑同时服务
GUI 面板与模型工具。

> **当前状态：P0 ~ P8 全部完成（v0.1.0）。** 这是个人学习项目，**不打算上架插件市场**。
>
> | 阶段 | 状态 | 内容 |
> |---|---|---|
> | P0 骨架 | ✅ 完成并通过端到端验证 | 包结构、宿主半 + 客户端半、槽位注册、构建、装包 |
> | P1 数据与采集 | ✅ 完成并通过离线验收 | sqlite 迁移、岗位/公司领域、浏览器管理、51job 适配器、**字段级断言 + 脏数据隔离** |
> | P2 界面 | ✅ 完成并通过真实 GUI 验收 | `/today`、`/jobs`、`/jobs/:id`、`/jobs/:id/mark`、`/crawl/*`、`/events`(SSE)；U0 今日 / U1 岗位库（左列表 / 右详情分栏）/ U2 详情（内嵌栏 + 抽屉） |
> | P3 调度与健康 | ✅ 完成并通过真实 GUI 验收 | 搜索方案 CRUD、自排程器（+抖动/自重新武装）、**错过只弹待办不自动跑**、登录态检测与引导、**单实例租约锁**、U0 暴露调度/登录/补跑 |
> | P4 情报引擎 | ✅ 完成并通过真实 GUI 验收 | 迁移 v2（`dictionary`/`job_flag`/`company_signal`/`dedup_group`）、词表驱动的黑话与信号词、公司画像打分、**外包/诈骗/僵尸/薪资虚标标注**、多级去重漏斗、**L1 可解释匹配** |
> | P5 安全与工具 | ✅ 完成并通过真实模型验收 | 迁移 v3（`audit_log`/`llm_call`）、**guard 六项检查链 + 两段式审批 + 一次性令牌**、`ai/` 隐私闸门与注入防御、**模型工具**、**toolview 卡片**、**离线闸门** |
> | P6 简历与附件 | ✅ 完成并通过真实 GUI 验收 | 迁移 v4（`resume`/`resume_file`/`tailoring` + `job.score_rev`）、**版本化简历**、**§4.1 分数随简历版本失效**、**真 PDF（headless Chromium）与真 DOCX（自建 OOXML ZIP）**、**三层防编造检查**、U3 简历中心 + U4 定制面板 |
> | P7 跟进与看板 | ✅ 完成并通过真实 GUI 验收 | 迁移 v5（七张表）、**三套状态机 + `stage_event` 全留痕**、**两条超时分支给不同建议**、投递/回复**高危走审批**、面试撞车与准备包、**漏斗与归因（样本量不足不给结论）**、U5 流水线 / U6 消息 / U7 面试 / U8 看板 |
> | P8 校招与海外支线 | ✅ P0 需求完成并通过真实 GUI 验收 | 迁移 v6（六张表 + 三个可空识别列）、**校招硬截止（笔试必填截止、错过即终态、三方签署不可逆）**、**工签识别（识别不出来就说识别不出来）**、**时区双重显示**、**英文简历只检查不翻译**、Cover Letter、校招屏 + 海外面板。**平台适配（牛客/实习僧/Indeed/LinkedIn）按文档结论不做** |
> | P9 上架 | ⏸ 不做 | 原本是 README / topic / 市场 PR。定位为个人学习项目，故不提交市场：**市场收录需要 CI + 维护者人工评审**，而我们不需要「被别人发现」这条渠道 |
>
> **需求文档自 v4 起冻结**（§10.4）。实现过程中与文档的差异都记在下面「与 `ARCHITECTURE.md` 的实现差异」表里。
>
> 设计与约束依据：`ARCHITECTURE.md`、`REQUIREMENTS.md`；验证记录：`P0-VERIFICATION.md`。
>
> **⚠️ 本项目仅供学习与技术研究使用。** 抓取与自动发送都有真实风险（平台条款、账号封禁、个人信息），
> 使用前请务必读 [`DISCLAIMER.md`](DISCLAIMER.md)。许可是 [`MIT`](LICENSE)。

---

## 安装

需要 **Node ≥ 24**（`node:sqlite` 是内置模块）、**DSH ≥ 0.1.5-rc.2**（web profile），以及 PATH 上的 **`pnpm`**
（`dsh plugin` 只是把参数转发给 pnpm）。

```bash
# ① 从 GitHub 安装（推荐）：仓库里已提交 lib/ 与 client/ 构建产物，装完即可用，不需要本地构建
dsh plugin --profile web add github:KrisDong-developer/job-hunter

# ② 本地开发：改源码即时生效
git clone https://github.com/KrisDong-developer/job-hunter
cd job-hunter && npm install && npm run build
dsh plugin --profile web add .
```

装完**重启一次 DSH**，侧栏出现「求职找工作」。这里没有需要你手填的配置项：`cordis.patch.yml`
是纯 insert、零 `config:`，配置全部自管在 sqlite（`$DSH_HOME/job-hunter/`）。

> ⚠️ **「装完即热挂载、无需重启」这句话我们并没有验证过**，别按它预期。
> `P0-VERIFICATION.md` §2.2 自己写着：端到端演示"不重启即生效"需要驱动市场安装流程或
> `ctx.plugin(HotTree, …)`，**本轮未做**；而 `dshmarket/lib/hot.js` 那条热挂载路径
> （`parseSimplePatch` / `mountClientOnlyDeps`）只服务**市场界面的安装流程**，
> 与本仓库的 `dsh plugin add` 命令行路径不是同一条。
> **实测补注（2026-09-17）**：命令行把插件装进**正在运行**的 `web` profile 后，
> 组合树（`dsh --profile web --dump-config`）里确实出现了 `dsh-job-hunter` 行、
> 解析到 `profiles/web/node_modules/dsh-job-hunter`，但**那个正在运行的进程不会因此长出侧栏入口** ——
> 重启后才有。所以：装完就重启，别赌它会热挂载。

> **为什么把构建产物提交进仓库**：`dsh plugin` 把参数原样转发给 pnpm，而 pnpm 会**拦截** git 依赖的
> `prepare` 构建脚本 —— 你必须先在 profile 的 `pnpm-workspace.yaml` 里手写 `allowBuilds` 才放行
> （DSH 自己的错误提示也是这么说的）。与其让你多走一步授权，不如把 `lib/`、`client/` 一起提交。
> 代价很明确：**改了 `src/` 必须 `npm run build` 之后再提交**，否则别人装到的还是旧产物。
>
> 安装时可能看到一个警告：`✕ missing peer react@^18.2.0`。**可以忽略** —— 客户端半要的 `react`
> 由 DSH 前端的 shell seed 提供（`__ModuleLoader__` 注入的 `require`），不需要你在 profile 里再装一份；
> 声明成 `peerDependencies` 只是为了让「react 由宿主提供」这件事在清单上可见。
>
> 另外，从 GitHub 装到的包只含运行所需文件（`lib/`、`client/client.js`、`cordis.patch.yml`、
> `LICENSE`、`DISCLAIMER.md`）—— 这是 `files` 字段限定的结果。想看源码、`docs/` 或 `assets/`，
> 直接 clone 仓库。

## 截图

| 今日（U0） | 岗位库（U1） |
|---|---|
| ![今日](assets/screenshot-today.png) | ![岗位库](assets/screenshot-jobs.png) |

| 岗位详情 + 简历定制（U2 / U4） | 数据看板（U8） |
|---|---|
| ![岗位详情](assets/screenshot-detail.png) | ![数据看板](assets/screenshot-board.png) |

| 校招支线（U9） | |
|---|---|
| ![校招](assets/screenshot-campus.png) | |

> 截图取自真实 GUI 的端到端验收运行（**离线闸门开启**，数据来自保存的 51job 页面 fixture）。
> 流水线 / 消息 / 面试三屏的验收断言写在各阶段章节里，没有单独截图。

## 环境

| 项 | 值 |
|---|---|
| Node | ≥ 24（`node:sqlite` 是内置模块） |
| DSH | 0.1.5-rc.x，web profile |
| 运行时依赖 | `playwright-core`（唯一一个；它没有 postinstall，不会被 pnpm 拦 —— C5） |
| 构建 / 测试 | `typescript`、`esbuild`、`jsdom`（都是 devDependency） |

## 常用命令

```bash
npm install          # 安装构建与测试依赖
npm run typecheck    # 只做类型检查
npm run build        # → lib/**（宿主 ESM）+ client/client.js（__ModuleLoader__ 工厂）
npm run verify       # 构建产物契约自检（不启动 DSH）
npm test             # 408 个测试（node --test，离线，绝不访问真实招聘网站）
npm run crawl:fixture # 用保存的 51job 页面跑一次完整采集入库
```

> **离线闸门**：`DSH_JOB_HUNTER_NO_NETWORK=1 npm test` 之外的场景（端到端脚本、CI）请显式打开它。
> 打开后 `crawl()` 与登录引导在发起任何真实访问之前就被拒绝，`/health` 与面板会显式说明原因。
> 这是 §14「自动化测试绝不访问真实招聘站」的机制化兜底 —— 只写在文档里的红线实测是挡不住的。

`crawl:fixture` 的可选参数（直接调 `node scripts/run-ts.mjs test/tools/crawl-fixture.ts …` 传）：

| 参数 | 作用 |
|---|---|
| `--rounds N` | 连跑 N 轮（看幂等与连续缺失计数） |
| `--break-selectors` | 故意把字段选择器改坏，验证「降级告警 + 不写脏数据」 |
| `--data-dir <path>` | 指定数据目录（默认 `$DSH_HOME/job-hunter`） |

## 目录结构

```
src/
├── shared/            # host 与 client 共享（只有标量与类型）
│   ├── constants.ts   # 包名 / 面板 key / 路由前缀 / 阈值 / PHASE
│   ├── enums.ts       # 状态机、核心字段、风控类型、待办类型、简历枚举
│   ├── labels.ts      # 状态与语气文案（宿主与界面共用同一套词）
│   ├── tool-format.ts # 工具结果的文本契约（宿主生产 / 界面解析，同源）
│   ├── resume.ts      # 简历结构 + 体检 + **防编造**（host/client/渲染器共用）
│   │   ├── dto.ts         # 对外 JSON DTO（P7：只允许标量）
│   │   └── dsh.ts         # 我们消费的 DSH 接口的**最小本地类型面**
├── host/              # ── 宿主半（Node）
│   ├── index.ts       # cordis 插件入口：name / inject / apply（立即返回）
│   ├── runtime.ts     # 宿主侧装配：store + 注册表 + 互斥 + 浏览器 + 领域/安全/模型服务
│   ├── settings.ts    # 插件配置门面（改 guard 配置必须持令牌）
│   ├── http.ts        # 唯一前缀路由的**传输层**（Node req/res + SSE 挂流）
│   ├── http/
│   │   ├── router.ts  # 路由与参数校验（与传输解耦，可离线单测）
│   │   └── sse.ts     # 事件总线（有界缓冲 + Last-Event-ID 补发 + resync）
│   ├── store/         # sqlite 层（R2：experimental API 只隔离在这里）
│   │   ├── db.ts      # 连接、PRAGMA、WAL、application_id 自保护
│   │   ├── migrate.ts # user_version 迁移（先 VACUUM INTO 备份，失败回滚并拒绝启动）
│   │   ├── schema.ts  # v1/v2/v3 建表 DDL（单一来源）
│   │   ├── store.ts   # Store 门面
│   │   ├── row.ts     # sqlite 行值安全读取
│   │   └── repo/      # jobs / companies / crawl-runs / repairs / field-health / platforms /
│   │                  # todos / settings / dictionary / flags / signals / dedup-groups /
│   │                  # audit / llm-calls
│   ├── domain/        # 领域服务（唯一实现）
│   │   ├── jobs.ts / companies.ts / plans.ts / today.ts
│   │   ├── crawl.ts   # 一次抓取的完整编排（§6.1）
│   │   ├── intel.ts   # 标注 + 公司画像 + L1 可解释匹配（P4；偏好来源含简历）
│   │   ├── outreach.ts# 打招呼话术（**只生成，不发送**）
│   │   ├── resumes.ts # 简历版本 / 定制（防编造）/ 附件生成（P6）
│   │   ├── pipeline.ts# 投递记录 + 接触态 + 状态事件（P7 的唯一留痕点）
│   │   ├── messages.ts# 消息与邀约识别（识别 != 改状态）
│   │   ├── interviews.ts # 面试日程 / 撞车 / 通勤 / 准备包
│   │   └── analytics.ts  # 漏斗 / 归因 / 薪资分位（样本不足不给结论）
│   │   ├── campus.ts   # 校招：硬截止 / 笔试不可逆 / 三方不可逆（P8）
│   │   └── overseas.ts # 海外：工签识别 / 时区双重显示 / Cover Letter（P8）
│   ├── render/        # ── 文档渲染（P6，纯函数：内容 → 字节）
│   │   ├── resume-html.ts # 结构化简历 → 自包含 HTML（两套模板 + CJK 字体栈）
│   │   ├── docx.ts        # → 真 OOXML（自建 ZIP + CRC-32，仅 node:zlib）
│   │   └── pdf.ts         # → PDF（**专用 headless Chromium**，空闲自关）
│   ├── guard/         # ── 安全闸门（P5，唯一危险动作入口）
│   │   ├── index.ts   # 检查链 + 审批 + 令牌 + 审计
│   │   ├── rules.ts   # 六项检查与 guard 配置
│   │   ├── approval.ts# 审批端口（fail-closed）
│   │   ├── token.ts   # 一次性令牌权威（AsyncLocalStorage 机制化强制）
│   │   ├── types.ts
│   │   └── actions/   # 危险实现（不在 domain 的公开面上）
│   ├── ai/            # ── 模型层（P5）
│   │   ├── client.ts  # 用途开关 + 隐私闸门 + 留痕 + 降级 + 重试
│   │   ├── privacy.ts # 硬黑名单剥离 + 白名单裁剪 + 外发字段清单
│   │   ├── prompts.ts # 系统提示 + nonce 围栏（结构隔离）+ JSON 抠取
│   │   ├── purposes.ts# 11 个用途与默认开关
│   │   └── llm-port.ts# 把宿主 llm 服务的流式接口适配成一次性调用
│   ├── tools/         # ── 模型工具（P5，§22.2）
│   │   ├── index.ts   # 11 个工具 + 注册结果报告
│   │   └── exec-context.ts # 把 agent/toolName 传给审批端口
│   ├── platform/      # 平台接入
│   │   ├── types.ts   # SiteAdapter / PageLike 契约
│   │   ├── browser.ts # playwright-core 单例 + 幂等清理 + 孤儿锁清理 + 可执行文件发现
│   │   ├── mutex.ts   # 全局抓取互斥
│   │   ├── registry.ts
│   │   ├── validate.ts# **字段级断言**（逐条闸门 + 逐轮命中统计）
│   │   ├── health.ts  # 健康状态机 + 降级告警 + 恢复
│   │   ├── session.ts # 登录态与隐身标记
│   │   └── adapters/fiftyone-job.ts
│   ├── scheduler/     # 自排程 + 补跑询问（C3/C9）
│   └── util/          # salary / company-name / text / dedupe / errors / time / offline
├── client/            # ── 浏览器半
│   ├── index.tsx      # apply：注册槽位（先 main，再侧栏入口、浮层、toolview 卡片）
│   ├── panel.tsx      # 外壳：顶栏 + 标签 + 实时状态 + 详情抽屉 + 对话意图消费
│   ├── screens/       # U0 today / U1 jobs / U2 job-detail（内嵌栏 + 抽屉两种承载）
│   │                  # U3 resumes / U4 tailor-panel / U5+U8 pipeline / U6+U7 messages
│   │                  # P8 campus + 海外面板 + 英文体检
│   ├── toolviews/     # 对话里的岗位/详情/话术卡片（§22.3）
│   ├── intent.ts      # 对话 → 面板的跳转意图通道
│   ├── use-async.ts   # 拉一次数据的加载/成功/失败三态
│   ├── use-event-stream.ts # SSE 客户端（事件只作提示，ADR-24）
│   ├── labels.ts      # 状态文案单一来源（转发 shared/labels.ts）
│   └── entry-icon.tsx / notice.tsx / styles.ts / api.ts / runtime.ts
test/                  # 测试与离线夹具（不参与构建）
├── fixtures/51job-sz.html
├── support/           # jsdom 页面、临时 store
├── ai/ guard/ tools/ host/ shared/  # P5 新增
├── tools/crawl-fixture.ts
└── **/*.test.ts
lib/                   # 构建产物（宿主 ESM + .d.ts）
client/client.js       # 构建产物（__ModuleLoader__ 工厂）
cordis.patch.yml       # 纯 insert、零 config 的 bundle patch
```

---

## P1 数据与采集层

### 数据层（`store/`）

- **`node:sqlite` 主数据**（ADR-2）：需要 SQL 与索引，`storageDomain` 这种 KV 扛不住按薪资/状态/时间筛选与聚合。
- **`application_id` 自保护**：值 `0x4A485031`（ASCII `"JHP1"`）。打开时校验：已是本项目的 id 就放行；
  全新的空文件才认领；**有表但没有 id 的库一律拒绝打开** —— 那多半是别人的库。
- **迁移**：`user_version` 落后才迁移；迁移前用 `VACUUM INTO` 做一致性快照（WAL 下手工复制 `.db` 会拿到半截状态）；
  每个版本一个事务，失败回滚并**拒绝启动**（带病运行会污染数据，比不启动更糟）。
- **强制 LIMIT**：查询一律走 `LIMIT` + 排序列白名单，禁止无界扫描进热路径。
- **事务与让出**：批量写入每 200 行 `setImmediate` 让出事件循环 —— `DatabaseSync` 是同步 API，不能长时间占住宿主。
- **幂等写入**：岗位按 `UNIQUE(platform_id, platform_job_id)` upsert，重复抓取只更新不新增；
  **不覆盖** `state`（用户处置态）与 `first_seen_at`（首次见到的事实）。

### 采集层（`platform/` + `domain/crawl.ts`）

一次抓取的时序（§6.1）：

```
mutex（全局互斥，忙就立刻失败，不排队）
  → adapter.criteria.buildSearchUrl（URL 优先，少触发风控）
  → adapter.crawl.gotoSearch → guard.detectBlock（命中即停、不硬重试）
  → adapter.crawl.readListPage
  → 【闸门 1】逐条字段断言：缺任一必需字段 → 不写主表，进 pending_repair
  → 薪资归一化 → 公司实体 ensure → 岗位幂等 upsert → 公司画像重算
  → 【闸门 2】逐轮字段命中统计：某字段整轮 0 命中 → 连续缺失 +1，达阈值 → 降级 + 主动告警
  → crawl_run 汇总
```

**两条硬语义**：

1. **降级即暂停写入** —— 平台处于 `degraded`/`broken` 时只解析、不落主表。
2. **解析恢复是唯一的恢复依据** —— 从 `degraded`/`broken` 回到 `healthy`，只认「有一轮解析出记录且字段全部命中」，
   而不是「这一轮没抛异常」。恢复时会清空逐字段计数并关掉告警待办。

### 适配器（`platform/adapters/fiftyone-job.ts`）

- **选择器与字段→URL 映射是配置，不是硬编码**（ADR-19 / D-18）：代码带一份默认值，
  DB（`setting` 表，`scope='platform'`/`scope_ref='51job'`/`key='adapter-config'`）里的覆盖优先。
  选择器坏了自己在 UI 改，不用等发版。
- **解析函数是自包含的**：真路径上它被序列化后送进 Chromium 执行（`page.evaluate`），
  所以它只读全局 `document`、只依赖入参 `config`，不引用任何模块作用域的自由变量。
  离线测试用 jsdom 提供同一个 `document` —— **同一份代码在两条路径上跑**，离线测试才有意义。
- **P1 只实现协议的子集**：`criteria.buildSearchUrl` / `crawl.*` / `guard.detectBlock`。
  `detail.extract`、`actions.*`、`auth.*`、`criteria.discover` 在 P2~P5 补，**不放假实现**。

### 浏览器（`platform/browser.ts`）

- 只依赖 `playwright-core` + `executablePath` 指向系统 Chrome（发现顺序：配置 → Chrome → Edge → ms-playwright 缓存）。
- `playwright-core` 是**动态导入**的：没装不该让插件挂不上。
- **幂等**：`ensure()` 并发调用只会启动一个实例（profile 是 `patchReload: live`，dispose → apply 会反复发生）。
- **孤儿锁清理**：宿主被强杀会留下 Chromium 锁文件，下次直接起不来 —— 只在确认没有活跃实例时才清。

---

## P2 界面层

### 路由（§4.7 的子集）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 插件 + 数据层 + 适配器健康快照 |
| GET | `/today` | U0 聚合（新增数、待办、待修复、适配器、最近抓取） |
| GET | `/jobs` | 查询：`q / city / state / minSalary / orderBy / desc / page / pageSize` |
| GET | `/jobs/:id` | 详情 + 公司画像 |
| POST | `/jobs/:id/mark` | 改处置态（**高危入口，过同源校验**） |
| GET | `/crawl/status` | 是否在跑、哪些平台被暂停、最近若干轮 |
| GET | `/crawl/runs` | 抓取历史 |
| POST | `/crawl/run` | 手动触发一次抓取（走真实浏览器） |
| GET | `/events` | SSE（15s 心跳） |
| GET | `/plans` · POST `/plans` · PATCH/DELETE `/plans/:id` | 搜索方案 CRUD（P3） |
| POST | `/plans/:id/run` | 立即跑一次方案（`{catchUp:true}` 表示这是补跑） |
| GET | `/scheduler/status` | 调度状态：下次/上次运行、是否武装、租约归属、只读原因 |
| GET | `/platforms` | 平台概览：健康 + 登录态 + 登录引导进度 |
| GET | `/login/status` | 各平台登录引导状态 |
| POST | `/platforms/:id/login/start` | 打开登录页并轮询（**立即返回**，进度靠 `status` 查） |
| POST | `/todos/:id/close` | 关掉一条待办（补跑询问的「忽略」） |
| GET | `/companies/:id` | 公司画像 + 累积信号 + 在手岗位 + 标注汇总（P4） |
| GET · POST | `/intel/dictionary` | 读 / 写词表（P4） |
| POST | `/intel/recompute` | 单次重算一批岗位的标注与匹配分（P4） |

**路由与传输是分开的**：`http/router.ts` 收 `RouteRequest`、出 `RouteResult`，完全不碰 Node 的
`IncomingMessage`/`ServerResponse`；`http.ts` 只做搬运与 SSE 挂流。所以上面这些路由**可以离线单测**
（`test/http/router.test.ts` 直接调 `routeRequest`，不需要造假流对象）。

**SSE 按 ADR-24 实现**：宿主只持有 **200 条有界缓冲**；客户端带 `Last-Event-ID`，命中就补发，
**命中不了就发 `resync`**。前端收到任何事件只做一件事 —— 合并成一次「去重新拉一遍」，
**不从事件内容构建状态**。这样丢事件最坏只是延迟，不会状态错乱。

### 界面

| 屏 | 内容 |
|---|---|
| U0 今日 | 24h 新增 / 岗位总数 / 待修复 / 紧急待办 四个数字；待办列表；适配器逐字段健康；最近一轮抓取；手动抓取按钮 |
| U1 岗位库 | 筛选条（关键词/城市/状态/最低月薪/排序）+ 分页列表；每行含薪资原文、地点、公司、标签、状态徽章 |
| U2 详情 | **两种承载、同一份正文**（`JobDetailBody`）：岗位库里是**右侧内嵌栏**（列表不动，逐个比较不打断）；流水线 / 消息 / 面试里是**抽屉**（那三屏是"处理一件事"，看完就关）。内容：岗位字段 + 匹配理由 + 标注依据 + 公司画像 + 动作按钮（收藏/忽略/标为已读/归档）+ 简历定制 + 海外面板 + 原始页面链接 |

> **为什么 U2 要分两种**（2026-09-17 改）：岗位库的主任务是"浏览 → 比较 → 决定"，
> 弹层会盖住列表，每看下一个都得先关一次再点，来回两步；分栏之后两栏各自滚动、互不打断。
> 其余三屏的任务是"处理一件事"，临时看一眼用弹层更合适 —— 关掉就回到原来的上下文。

### 视觉与可用性基线（2026-09-17，一轮复盘后重做）

起因是一次"看得累 / 找不到重点 / 边界看不见"的反馈。动手前先把主题变量量了一遍 ——
**很多"没画好"其实是取了这套主题里最淡的那一档**：

| 变量 | 实测值 | 后果 |
|---|---|---|
| `--dsw-alias-border-l1` | `#0000000a`（**4% 黑**） | 卡片与控件的描边等于没画 |
| `--dsw-alias-border-l2 / l3 / l4` | 10% / 12% / 16% | 真正能看见的三档 |
| `--dsw-alias-bg-base` 与 `-layer-1 / -2 / -3` | **全是 `#fff`** | 靠背景分不出任何层级，只能靠描边与阴影 |
| `--dsw-alias-label-primary / secondary` | `#0f1115` / `#61666b` | 正文用 primary；secondary 只给标签与次要说明 |
| `--dsw-alias-label-tertiary / caption` | `#81858c` / `#adb2b8` | 只配给"可以忽略"的东西 |
| `--dsw-alias-brand-primary` | bluish-1000（近黑） | 这个主题的"主色按钮"就是**黑底白字** |

据此做的改动：控件与卡片改用 `l3` / `l2` 描边 + 极轻阴影；主操作（筛选）实心、重置去边框；
列表选中用 `inset 3px` 主色条（不占宽度、文字不跳）；薪资提到 15px/700；
标签改"浅灰底 + 深色字"的扁平块；风险标注从灰字改 Alert 框；
**详情操作条吸顶**（原先在正文最底部，右侧一屏那么长，实测反馈就是"详情里没有操作按钮"）；
L1 粗筛分做成环形仪表 + ✓/✗ 逐条理由；长解释收进 `?`；分页器给出页码；
窄屏用 **container query** 而不是 media query —— 决定"窄不窄"的是**面板**宽度，不是窗口宽度。

一条**刻意不做**的：风险为 0 时**不刷成绿色**。绿色等于替用户宣布"这个岗位没问题"，
而"规则没命中"只说明"没命中已知模式" —— 那正是本项目一路拒绝下的那种结论。

每屏都有**加载态 / 空态 / 异常态**（§13）。改状态后由详情回调 bump 一次 revision，
列表与详情各自重拉 —— 不靠手写状态同步。

### 出口标准怎么验的

> 「能用面板完成**看岗位 → 看详情 → 收藏**」

用真实浏览器（Playwright）在独立 profile 起的实例上点了一遍，**14/14 断言通过**：

```
✔ entryRendered ✔ entryInsideButton ✔ noticeAppeared ✔ panelHiddenInitially
✔ clickSwitchesToPanel ✔ todayShowsStats ✔ sseConnected ✔ jobListRendered
✔ detailPaneShown ✔ detailIsInline ✔ markSaved ✔ listReflectsSaved
✔ noticeAutoDismissed ✔ backToConversation
```

> `detailIsInline` 是 2026-09-17 随分栏一起加的：它断言页面上**没有** `.jh-drawer`。
> 只说"详情显示了"是不够的 —— 弹层与内嵌栏都能让前半句为真。

验收脚本**不在本仓库**（它与开发机上的 DSH profile、Playwright 安装位置、`?token=` 入口绑定，
没有做成可复现的分发形态），使用时形如 `node jh-e2e.mjs "http://127.0.0.1:4399/?token=…"`。
仓库内可复现的是那 408 个离线单测（`npm test`）。

---

## P3 调度与健康

### 自排程器（`scheduler/`）

宿主没有 schedule 服务（C3），全部自实现：

| 决策 | 做法 |
|---|---|
| 触发 | Cordis `timer`（`timer.timeout`）→ 缺失时退到原生 `setTimeout`；两者都通过 `TimerPort` 抽象，**可取消**（C15） |
| 持久化 | `plan.next_run_at` / `last_run_at` 落库；重启后重算 |
| 自重新武装 | 每次触发后立刻把 `next_run_at` 推到未来再重新挂表 —— 否则定时器会自旋 |
| 抖动 | `jitterMs` 默认 10 分钟，避免每天同一秒打同一个接口 |
| **错过不猛跑** | 启动时若发现错过一轮 → **只生成一条 `catch-up` 待办**，等用户点「立即补跑」（C9） |
| 互斥 | 与手动触发共用 `crawl` 的全局互斥，不会并行 |
| 前置条件 | 未登录 / 适配器失效 / 被风控暂停 → 该平台跳过并记原因 |

### 单实例租约（R20）

`$DSH_HOME/job-hunter/lease.json` 记 pid + 心跳（原子写：临时文件 + rename）。
判据是**心跳是否新鲜**（90s），不是文件是否存在 —— 强杀会留下文件但心跳会停。

拿不到租约的实例**不启动调度、不开浏览器**，只提供只读面板并说明是谁在占用。
**并且它会继续探测**：对方心跳过期后自动接管，不必重启
（实测踩到过：上一个实例被强杀后，新实例一直卡在只读，只能重启才能恢复）。

### 登录态（`platform/session.ts`）

需求 §7 点名的坑：**抓到登录墙必须报错，绝不允许当作「没有新岗位」**。

- `account_state` 持久化 `logged_in` / `hint` / `last_check_at`；
- 记录未登录时**主动产生 urgent 待办**（`createOnce` 去重，不会每轮刷屏）；
- 登录引导：`login/start` 打开登录页 → **保持页面打开**（用户要在上面登录）→ 每 3s 轮询 → 成功即回写状态并关掉告警；
- 适配器通过 `auth.isLoggedIn(page)` 回答「当前页会不会被登录墙挡住」；没声明 `auth` 的适配器会明确报错，不假装成功。

### 到点自动跑怎么验的

两层，缺一不可：

1. **整链离线测试**（`test/scheduler/integration.test.ts`）：可控定时器 → 真调度器 → **真 `runCrawl`** → 真 sqlite 入库。
   推进定时器后断言：20 条岗位落库、`crawl_run` 挂在方案上、`next_run_at` 被推到未来。
   只把「页面来源」换成离线夹具 —— 自动化测试不许碰真实招聘网站（§14 红线）。
2. **真实 GUI 验收**（`jh-e2e.mjs`）：面板上能看到下次/上次运行、已武装、租约归属、平台登录态、补跑入口。

另外做过**一次**真实站点手动冒烟（§14 允许，频率保守）：5.3 秒内命中 20 条真实岗位，
四个核心字段 20/20，无隔离记录。

---

## P4 情报引擎

核心约束一句话：**任何分数与徽章都必须能回答「凭什么」**。所以这里的每个结论都带依据，
没有依据的结论在代码层就被丢掉（`evaluateJobFlags` 里 `evidence.length === 0` 直接 return）。

### 标注（`domain/intel.ts` + `util/text.ts`）

| 标注 | 依据来源 |
|---|---|
| `jargon_hit` 黑话 | 词表命中，逐条给出「命中「弹性工作」→ 往往指没有固定下班时间」 |
| `outsourcing` 外包 | JD 词表命中 + **公司名关键词**（人力资源/劳务/派遣…）+ 公司维度统计（驻场比例 ≥ 60%） |
| `fraud` 高风险 | 押金/保证金/培训费等词表命中；**组合规则**：无门槛话术与高薪并存会单独点出 |
| `zombie` 僵尸岗位 | 发布时间超过 60 天却仍在列表里 + 词表信号 |
| `salary_inflation` 薪资虚标 | 提成类话术命中 + 区间跨度 ≥ 2 倍且上限 ≥ 20k |

词表（`dictionary` 表）**以 DB 为权威**：内置 45 条默认词，用户可在 UI 增删改；
播种幂等，**不会覆盖用户改过的权重**。黑话匹配全程纯规则、不走 LLM —— 可解释、零成本、加词即生效。

### L1 可解释匹配（§4.5.1）

纯规则：硬条件（城市 / 薪资 / 排除词）+ 技能关键词命中率，产出分数与**逐条理由**（带权重）。
界面上标的是「**粗筛分**」而不是「匹配度」—— 语义级精评要等 L2，不能冒充完整评估。

偏好来源三级：`setting.match-profile`（用户显式配置）→ **从搜索方案派生**（方案本身就是意图声明，
"深圳 Java" 就是偏好）→ 空偏好（此时分数恒为中性 50，理由会如实写「没有设置偏好」）。
第三条是避免"功能看着有、实际永远 50 分"。P6 会加一条更高优先级来源：简历。

### 去重（`util/dedupe.ts`，§4.10.1）

五级漏斗，顺序不能换：**归一化 → 别名表 → 包含关系 → 相似度兜底 → 不确定不合并**。

只用编辑距离是错的：「北京字节跳动科技有限公司」与「字节跳动」距离很大，会被判成两家。
三条铁律都落了地：默认阈值偏保守（宁可漏合并）、成员是显式 id 列表（可拆）、
合并依据是人话（`basis`）而不是分数。

### 迁移 v2

`dictionary` / `job_flag` / `company_signal` / `dedup_group` 四张表走**迁移机制**（不是改 v1）。
实测在真实库上升级成功，并自动留下 `backups/data-v1-<时间戳>.db` 快照 —— 迁移前备份这条路径真的跑过了。

### 出口标准怎么验的

> 「给定样本能给出标注与依据」

- **离线测试**（`test/domain/intel.test.ts`、`test/util/dedupe.test.ts`）：标注必须有依据、匹配必须有理由、
  真实公司名样本集**不误合并**（平安人寿 vs 平安财险、腾讯科技 vs 腾讯音乐、京东数科 vs 京东世纪…）。
- **真实数据**：28 条真实 51job 岗位，19 条命中标注（多为僵尸岗位 —— 真实列表里确实有大量 72/85 天前发布的岗位），
  匹配分从 50 到 71 分化，详情里逐条列出 `+15 城市匹配（深圳）`、`+6 命中期望技能「Java」`
  与「岗位发布于 72 天前（超过 60 天）却仍在列表中，可能并不真的在招」。
- **真实 GUI**：23/23 断言通过（含列表徽章、粗筛分标记、理由条数、依据条数）。

---

## P5 安全与工具

### 安全闸门（`guard/`）

**唯一入口**：所有会改状态的动作都走 `guard.run(input, fn)`，`fn` 拿到一次性令牌才能执行危险实现。
检查链顺序：**禁止项 → 开关 → 隐身 → 批量 → 额度 → 冷却 → 审批 → 执行 → 审计**。
（与 §4.4 表格的唯一次序差异：**批量上限提到审批之前** —— 两个分支都是拒绝，不该白问用户一次。）

三类「绕过」被四层机制堵住（§4.4.1 / P10）：

| 绕过方式 | 被挡在哪 |
|---|---|
| 直接调用 `sendGreeting()` | 实现首行 `guardAuthority.assert(token, action)` → `GUARD_DENIED` |
| 伪造 / 复用令牌 | 令牌必须在当前 `AsyncLocalStorage` 上下文里，且**一次性** |
| 忘了传令牌 | 危险实现的签名强制要 `guardToken`，缺参编译不过 |
| 只改 `rules.ts` 放行 | `guard/actions/` 里**再校验一次**（用令牌里的 actor），改一处不够 |

模型的**禁止项**（`requireApproval` / `auditEnabled` / `batchLimit` / `dailyLimits` / `cooldownMinutes`）
在两条路径上各自硬编码校验，**审批通过也改不了** —— 「模型不得扩大自身权限」。

### 审批：两条路径，同一道闸门

| 谁发起 | 怎么问 | 落在哪 |
|---|---|---|
| **模型工具** | `ctx.approval.request({agent, toolName, callId, reason, signal})` | 对话里的橙色审批条，与那次工具调用配对 |
| **界面操作** | guard 抛 `ConfirmRequiredError` → HTTP `409 NEEDS_CONFIRM` + 完整文案 → 用户确认后带 `confirm:true` 重发 | 面板里的确认弹窗 |

`agent` 只有工具执行期间才有，所以用 `tools/exec-context.ts` 的 `AsyncLocalStorage` 把它传给装配期就建好的端口；
**领域层完全不知道"模型"存在**。界面的确认走另一个通道，因为界面没有 agent / 打开的回合。

三条 fail-closed 规则，没有例外：**超时即拒绝**（5 分钟）、**没有审批界面即拒绝**（headless / CLI）、
**审批通道抛错即拒绝**。被拒时写 `denied` 审计，并在 `todo` 里留一条「待确认动作」（超时/无界面时），不静默丢弃。

> ⚠️ **「需要确认」不是「被拒绝」**：界面第一次请求返回 409 + 文案，此时**不写** `denied` 审计、**不建**待办。
> 把它记成拒绝会污染审计，也会让用户看到一条自己从没拒绝过的记录。

**模型不能自我确认**：`guiConfirmed` 只有 `actor === 'gui'` 能置位，且这条判断在**检查链之前** ——
否则一次自封确认会先被隐身之类的规则挡下，看起来像"隐身没过"而不是"越权尝试"。模型置位一律拒绝并审计。

### 模型层（`ai/`）

```
ai.call(purpose, payload, opts) → { value, via, notes, outboundFields, callId }
```

- **用途开关**：11 个用途各自可关，默认只开低风险低成本的（话术、摘要、规则解释），简历相关的**默认关**。
- **隐私闸门**（I5）：出站前先剥**硬黑名单**（手机号/身份证/邮箱/银行卡，字段名子串匹配 + 值模式脱敏），
  再按用途白名单裁字段；嵌套对象**根本不发**，不靠"递归猜"保护。
- **调用留痕**：每次调用写一条 `llm_call`（用途 + **外发字段清单** + token + 耗时 + 结果），
  `GET /job-hunter/llm/calls` 可查。留痕里**没有正文**，只有字段名 —— 用户能回答"我的哪些数据被发出去了"。
- **降级**：模型不可用 / 超时 / 输出不合规（重试一次后仍不合规）/ 结果校验不过 → 一律退回规则或模板，
  返回 `via: 'fallback'` 与 `notes`，界面**如实标注**"这是模板，不是模型"（J10）。
  只有**真的发出去过**才声称外发了字段 —— 没调模型却报一串外发字段，等于让 I5 的查询结果说假话。
- **注入防御**（§4.5.2）：外部文本一律包进**带随机 nonce 的围栏**（外部文本里的 `>>>` 会被打散，
  拼不出闭合标记），系统提示明确宣布围栏内只是数据；模型输出**再过一遍结构校验**
  （话术里出现手机号/邮箱/链接/联系方式引导 → 丢弃并退回模板）。LLM 输出**永远不能直接触发高危动作**。

### 模型工具（`tools/`，§22.2）

11 个：`job_search` / `job_query` / `job_detail` / `job_mark` / `job_plan_manage` / `crawl_run` /
`crawl_status` / `job_match_explain` / `greeting_draft` / `greeting_send`（高危）/ `job_settings`（中危）。

**单一实现**：每个工具调用的都是 `HostRuntime` 上**与 HTTP 路由同一批**方法，工具里零业务逻辑。
所以"界面上收藏"和"对话里收藏"必然产生同样的数据变更与审计。

**上下文友好**（§22.5）：`output.render` 的输出**就是模型的上下文**，所以列表最多 20 条、
详情给的是 **JD 摘要**（400 字封顶 + 截断标记）而不是全文、批量类工具一次最多 5 个岗位。

> ⚠️ **`job_list` 落地名是 `job_query`** —— 宿主自带一个同名的后台任务工具，
> `tools.register` 对重名直接抛错。而且客户端 toolview 按工具名 keyed，
> 我们的卡片会**接管**宿主那个工具的渲染（实测表现：「列出后台任务」被画成一张岗位卡片）。
> 同理，注册失败**不再静默**：结果进 `ToolRegistrationReport`，经 `/health.tools` 暴露，冲突用 `error` 级日志点名。

### toolview 卡片（§22.3）

`job_search` / `job_query` / `job_detail` / `greeting_draft` 各一张卡。结果文本用
`src/shared/tool-format.ts` 里的**生产/解析同源**格式（列表行 `#12 标题 · 公司 · 城市 · 薪资 · 粗筛 82`；
详情行 `键：值`），宿主生产、客户端解析，改一边必然动另一边。

卡片上的按钮**打的是与界面完全相同的端点**：`收藏` → `POST /jobs/:id/mark`、
`生成话术` → `POST /jobs/:id/greeting/draft`。`在面板里打开` 经 `client/intent.ts` 的意图通道
（先记意图再切面板，因为 `main` 是 keyed 槽位，面板可能是刚挂载的）跳到主面板并自动打开详情。

### 离线闸门（§14 的机制化兜底）

`DSH_JOB_HUNTER_NO_NETWORK=1` → `crawl()` 与登录引导在发起任何真实访问前直接拒绝（409 `BLOCKED`），
`/health` 与 `/today` 回传 `offline` 标记，面板显式提示。

为什么需要它：实测踩到 —— 端到端脚本的提示词里写了"不要抓取、不要调用 `job_search`"，
模型**仍然**调了它，一次自动化运行真的打到了 51job（`crawl_run` #5：found 20 / inserted 20 / ok）。
**规矩要靠机制兜住，不能靠提示词里的自觉。** 验收脚本现在还会在运行前后比对 `crawl_run` 条数，
一旦新增就判失败。

### 出口标准怎么验的

> 「模型能在对话里完成"搜索 → 详情 → 生成话术"」

- **单测**：P5 结束时 244/244，P6 后 315/315（闸门六项检查、审批 fail-closed、**「没问到」与「用户拒绝」的区分**、
  令牌绕过、隐私闸门、提示词结构隔离、降级与重试、话术校验与注入扫描、工具注册与冲突可见、
  新增 HTTP 路由、离线闸门。- **独立 headless profile + 真实模型**（目标明确要求的那条）：`dsh --profile p5headless "<任务>"`，
  模型依次 **`job_query` → `job_detail` → `greeting_draft` → `greeting_send`**：
  前三个成功（48 条库里取 3 条；#48 结构化详情；**186 字话术，来源是模型生成**），
  第四个**失败且原因可读**：`「greeting.send」未获批准：当前环境没有审批界面（headless / CLI），高危动作一律拒绝`。
  模型自己的总结是：*"失败不是投递被平台拒、不是额度/冷却/开关问题，而是审批环节缺失……本次没有产生任何真实外发动作，
  也没有留下需要撤销的痕迹；唯一解锁路径是在有审批界面的会话里重发并确认。"*
  数据库侧取证：`audit_log` 记 `actor=model / greeting.send / denied`，
  `approval_json.via="unavailable"`；`todo` 自动建了一条 `confirm-action`（ref=48）；
  `llm_call` 记下 `provider=deepseek-official / model=deepseek-flash / tokens` 与**完整外发字段清单**；
  全程 `crawl_run` 停留在 5 条 —— **零真实站点流量**。
- **真实模型 GUI 验收 14/14**（`jh-p5-toolview.mjs`，profile `p5test`）：
  提示词让模型依次调 `job_query` → `job_detail` → `greeting_draft`，三张卡片分别渲染成
  3 个岗位行 / 7 行结构化详情 / 话术正文；**点击卡片里的岗位行 → 跳主面板 → 详情自动打开到那个岗位**（岗位库里就是右侧栏）。
- **基线 GUI 31/31**（`jh-e2e.mjs`，含 P5 的 HTTP 层检查）。
- **两段式确认 10/10**（`jh-p5-confirm.mjs`）：未确认 → `409 NEEDS_CONFIRM` 且审计增量为 0；
  确认后 → 真的走到动作实现并**如实失败**（`ADAPTER_BROKEN`：「前程无忧 的适配器还没实现打招呼动作」）且审计 +1；
  确认文案含发起者/平台/目标/全文/简历版本；审计里**没有正文**（只有长度与 `redacted: true`）。
- **诚实说明**：`greeting_send` 目前对 51job **必然失败** —— 适配器的 `actions.sayHello` 属于 P7。
  这是有意的：宁可失败得明明白白，也不要静默变成"已发送"。happy path 用假适配器在单测里覆盖。

---

## P6 简历与附件

### 版本化，不是每岗定制（§3.2）

一版简历 = 一行 `resume`，带 `direction`（方向）、`language`（中/英）、`rev`（版本号）。
**定制产出的是建议**（`tailoring` 表）+ 显式采用，绝不覆盖用户手上的简历 ——
"每投一个岗位改一次简历"会让面试时讲不一致，这是文档里明确否掉的做法。

`rev` 的语义很关键：**内容真的变了才 +1**。改名、或者把没改过的内容原样 PATCH 回来都不递增 ——
否则"分数失效"提示会天天出现，用户很快就学会无视它。

### 匹配分是简历版本的函数（§4.1）

文档把这条列为"最容易出的看起来对、其实全错的 bug"。落地方式：

- 算分时把 `{resumeId, rev}` 一起写进 `job.score_rev` / `job.score_resume_id`；
- 读岗位时与**当前启用版本**比对，不一致就在 DTO 上标 `scoreStale`；
- 界面上显示分数的地方会明确写"这是旧版简历下的分"。

两条失效路径都有端到端断言：**换启用版本** → 过期；**当前版本内容改了** → 过期；
重算后 → 新鲜。简历还会参与 L1 匹配偏好（技能名 → 关键词、城市 → 城市），
且**优先于搜索方案** —— 简历是用户资产，方案只是一次抓取的参数。

### 附件生成：PDF 与 DOCX

| 格式 | 怎么做的 | 为什么这么做 |
|---|---|---|
| **PDF** | 独立的 **headless** Chromium `printToPDF`，懒启动 + 空闲 90 秒自关 | ⚠️ **抓取用的浏览器是 headful 的**（用户要登录、要少踩自动化特征），而 `page.pdf()` 只在 headless 下可用。两者需求相反，硬凑只会两边都做不好 —— 所以单开一个专用实例，复用同一套可执行文件发现逻辑，零新依赖 |
| **DOCX** | 自建 ZIP 容器 + 最小 OOXML，仅用 `node:zlib` | 需求写的是"走模板替换、避免引入重型排版库"。自建 ZIP 需要自己算 CRC-32 与中央目录 —— 实测踩到过**把外部属性字段写成 u16 而不是 u32**，每条记录短 6 字节、偏移量整体错位，任何解压器都会报"文件损坏" |
| **HTML** | 同一份渲染器的输出直接落盘 | 预览用 |

**预览与导出共用同一个渲染器** —— "预览好看、导出走样"是最难查的一类 bug。
中文靠显式字体栈（`Microsoft YaHei` / `PingFang SC` / `Noto Sans CJK SC` …）+ 打印前等 `document.fonts.ready`。

### 防编造：三层检查（§4.5 / R8）

红线是"不许编造经历"。检查做在三层，**逐层收紧**：

1. **技术词**：候选里出现的拉丁技术 token 必须已存在于原简历（`allowTech` 只放行**目标岗位**的关键词）；
2. **数字**：年限、百分比、人数不许新增（把 3 年写成 5 年是最致命的失真）；
3. **结构性子集**：技能名、`(公司, 职位)`、项目名、学校都必须是原集的**子集** ——
   这一层与语言无关，专门堵住中文技能（技术词抽取基于拉丁 token，"精通分布式事务"一个词都抽不出来）。

不合格就**退回规则结果并如实说明原因**，不"先用了再说"。
规则定制（`ruleTailor`）的正确性来自"什么都不加"：只重排、只挑选、只用原简历已有的词写一句简介。

> 这三层是被测试逼出来的：一个"一份英文简历跟自己比都被判成编造"的误报，
> 会让合法的措辞改写全被拒 —— 而这类误报的最终结局一定是"把检查关掉"，等于没有检查。
> 所以 `test/shared/resume-fabrication.test.ts` 专门守误报，`checkNoFabrication(x, x)` 必须为真。

### AI 层的文档通道（`trusted`）

简历是深嵌套结构，塞不进只处理标量的 `payload`；塞 `instruction` 能跑，
但那样 `outboundFields` 会是空的 —— **`llm_call` 会记成"这次没发任何字段"，而整份简历都发出去了**。
让 I5 的查询结果说假话比没有留痕更糟。

所以 `ai.call` 新增 `trusted` 通道：会计入外发字段清单（记成 `trusted:resume`），
并按模式脱敏；域层在传进去之前还会先摘掉 `phone`/`email`（防御纵深）。

### 出口标准怎么验的

> 「能生成并预览附件」

- **单测 315/315**：敌意输入规范化、体检规则、防编造的**正反两面**（含 `checkNoFabrication(x,x)===true` 的误报回归）、
  文档真 ZIP 与 CRC、迁移 v4、分数过期、路由、定制两条路径（模型编造 → 退回规则）。
- **真实 GUI 验收 27/27**（`jh-p6-e2e.mjs`）：docx **3493 字节且以 `PK\x03\x04` 开头**、
  pdf **77291 字节且以 `%PDF` 开头**、`Content-Disposition` 对 docx 是 attachment / 对 pdf 是 inline、
  预览 HTML 里真的有姓名、简历中心渲染出编辑器/预览 iframe/附件列表、岗位详情里的定制面板渲染出来。
- **回归**：P0–P5 的四套验收（基线 31、toolview 14、两段式确认 10、离线闸门）全部重跑通过。

---

## P7 跟进与看板

### 三套状态机，一张事件表（§7.0）

§7.0 明确写了 v1 的建模错误：需求里有**三套独立状态机**，v1 硬塞进 `job.state` 一个字段，
表达不了「已收藏 + 已读未回」这种组合。P7 把它们各就各位：

| 状态机 | 落在哪 | 取值 |
|---|---|---|
| 岗位处置态 | `job.state` | `new` / `seen` / `saved` / `ignored` / `archived` |
| **接触态** | `greeting.stage`（**最新一条即当前**） | `none` / `greeted` / `delivered` / `read` / `replied` / `interview_scheduled` |
| **投递阶段** | `application.stage` | `sent` / `viewed` / `interviewing` / `interviewed` / `offer` / `rejected` / `no_reply` |
| 面试状态 | `interview.state` | `pending` / `confirmed` / `done` / `reviewed` / `cancelled` / `rescheduled` |

**`stage_event` 是这一版最重要的表。** §12.1 的转移表把"自动识别"与"人工打勾"混在一起，
只存当前状态就永远回答不了「这个状态是谁、什么时候、凭什么改的」。
所以每次变更都追加一条事件（含 `source`：auto / manual / model），主表的 `stage` 只是便于查询的冗余。
回退不是禁止而是**必须显式**（`allowBackward`）—— HR 确实会反悔，但手滑不该没人知道。

> 顺带补了一个 P5 留下的缺口：`sendGreeting` 此前**只发不记**，接触态永远是空的。
> 现在发送**成功后**记一条 `greeting` + 事件；记账失败只告警，不会反过来说"发送失败"。

### 两条超时分支，两种建议（§3.3 的核心洞察）

```
未接触 → 已打招呼 → 已送达 → HR已读 → HR已回复 → 已约面
                     │        │
                     │        └→ 已读未回超时（→ 改简历/话术）
                     └→ 未读超时（→ 放弃）
```

这两条**必须走不同分支、给不同建议**：未读超时说明 HR 不活跃，建议放弃；
已读未回说明你呈现的东西和岗位对不上，建议改简历 —— 而不是继续加量。

注意它们是**建议**，不是状态。超时是由时间推导出来的；一旦写成 `read_timeout` 这样的状态，
用户回了消息之后还得再改回去 —— 状态机就被时间污染了。

### 数据看板：先给样本量，再给比率

`analytics` 的三条硬规则：

1. **样本量小的时候不给结论** —— 投了 3 个岗位算出来的"内推回复率 100%"是噪声，
   照着它改策略会更糟。低于 `MIN_SAMPLE` 时 `note` 会明说"别据此下结论"。
2. **上一层为 0 时转化率是 `null`，不是 0** —— `0%` 会被读成"一个都没转化"，那是另一回事。
3. **跨总体不算转化率**。漏斗其实有**两个总体**：接触（打招呼/送达/已读/回复）与投递（投递/面试/Offer）。
   "投递数 ÷ 回复数"在两者之间没有意义，当投递数大于回复数时会算出 **>100%** 的转化率 ——
   一个能算出 120% 的图会让人不再信任整张图。所以总体切换那一层 `rate` 留空，
   并带上 `population` 让界面画一条分隔线。

漏斗的层用 `stage_event` 判断"**有没有走到过**"，而不是看当前状态 ——
一个"面试完被拒"的投递当前状态是 `rejected`，只看当前状态它就从"已面试"层凭空消失了，
而且**少报比多报更难发现**（数字看起来完全正常）。同时口径是**累计**的：
拿到 Offer 的人一定面试过，所以"已面试"包含 Offer，否则会出现"1 个 Offer 但 0 人面试过"的自相矛盾。

### 消息：识别 != 改状态

`detectInvite` 用一张**保守**的规则词表找面试邀约信号（只收"几乎只可能出现在邀约里"的词，
不收"沟通""聊聊"这类中性词），而且**只在 HR 发来的消息里找** —— 我自己说的"期待面试"不算。
命中只标一个 ⚠ 提示；改状态是另一次显式动作。

理由很直接：规则识别一定会误判，而状态一旦被误改，用户就会漏掉一个真正在推进的岗位。

### 面试：别撞车别迟到

- **撞车**用"默认时长 + 缓冲窗"判定，不是"时刻完全相同" —— 现实中撞车多是
  "上一场刚结束 10 分钟就要到另一场"。
- **通勤只在现场面试里算**。给视频面试算通勤只会制造假警告。
- **准备包**复用已有数据，不另做一套判断：技能差距来自简历 vs JD、公司风险直接用 P4 的标注、
  错题本按被问次数排。缺数据时如实说（"还没启用简历，无法做技能差距对比"）而不是给个空对比。

### 出口标准怎么验的

> 「全流程闭环」

- **单测 370/370**（P6 时 315）：状态事件留痕与顺序、回退门禁、高危闸门（含被判拒时**不落库**）、
  看板分列与陈旧计数、接触态"最新一条即当前"、两条超时分支、面试撞车与改期门禁、
  `done → 已面试` 的自动推进、归因分组、薪资分位手算插值、迁移 v5。
- **真实 GUI 验收 27/27**（`jh-p7-e2e.mjs`）：一条真实链路走完 ——
  投递**两段式审批** 409 `NEEDS_CONFIRM` → 确认后 201；状态事件 1 → 2 条且回退被拒 400；
  HR 消息命中邀约信号而我自己的消息不命中；回复两段式 409 → 200；
  两场面试撞车被检出；改期未确认 400 → 确认后 `rescheduled`；准备包给出通勤建议；
  漏斗两段总体、比率全在 0-1；四个新标签在真实 GUI 里都渲染出来（含漏斗的总体分隔线）。
- **回归**：P0–P6 的五套验收（基线 31、toolview 14、两段式确认 10、离线闸门、P6 27）全部重跑通过。

> **验收脚本自己踩的两个坑（都记下来，因为它们是真实的用户路径）**：
> ① `POST /applications` 一开始全是 403 —— 因为 **L4 分层默认是关的**（D-3：投递与回复是风险最高的两层）。
> 这是设计如此，脚本必须先像用户那样把它打开。
> ② 打开 L4 之后仍然 403 —— 卡在**隐身检查**。高危动作要求先确认"对当前雇主隐藏"，
> 脚本得先把这个前置条件摆好。

---

## P8 校招与海外支线

两条支线各自围着一个**不可逆节点**，这一阶段的全部设计都从那里长出来。

### §4.L 校招：笔试错过就出局

| 需求 | 落地 |
|---|---|
| L1 时间窗 | `campus_application.apply_open_at/close_at` + `windows()`；**网申截止只在还没网申时**才是你的待办（交了申请它就不再是行动项） |
| L2 网申进度 | §12.7 的状态机（意向→已网申→待笔试→…→已签三方），每次变更写 `stage_event` |
| **L3 笔试/测评** | **`dueAt` 是必填** —— 没有截止时间的测评做不出提醒，等于没用。`missed` 是**终态且不可逆** |
| L5 三方协议 | 签署不可逆：已签只能转「违约」，**不能改回待签**；违约条款单独记 |
| L4 宣讲会 / L7 校招筛选 | 宣讲会表 + JD 关键词识别批次（识别不出来留 NULL） |

**`deadlines()` 是这一节的核心**，不是 CRUD：它把笔试、网申、三方三类硬截止单独挑出来，
24 小时以内标 `urgent` 并**写进待办**（`kind='deadline'`），U0 与校招屏都盯着它。
理由就是决策记录第 3 条：这类错误没有第二次机会，必须是强提醒而不是普通通知。

界面上还有一条来自验收的修正：**已错过的截止一律留在页面上**。
第一版只显示"待处理"，于是错过的那条就静默消失了 —— 而"看不到了"和"没发生"是两回事，
在校招里这个区别意味着要不要重新规划一年。

### §4.M 海外：识别不出来就说识别不出来

| 需求 | 落地 |
|---|---|
| **M4 工签/Sponsorship** | 关键词识别，分"明确不提供 / 明确提供 / 未识别"三态。**`unknown` 是一等取值** —— 把"没写 no sponsorship"当成"提供担保"会让用户投一堆注定无效的岗位，比不识别更糟，因为它给了虚假的希望 |
| **M3 时区** | **双重显示**：对方时区 + 本地时区都给，外加时差与大时差警告。只换算一边的话用户无从判断对不对；两边一起给，错的时区会自己露出来 |
| **M1 英文简历** | 渲染器支持 `language: 'en'`；**只做检查，不翻译** —— 模块里连翻译入口都不提供（提供入口就等于鼓励用它） |
| M2 Cover Letter | 新用途 `cover_letter`（默认关）+ 规则兜底；提示词明确"不要复述简历"（§21） |
| M5 远程筛选 | `job.remote_kind` 识别列 + `filterJobs` |

工签识别的两条硬规则：**同一段文本里"提供"与"不提供"同时出现时按不提供处理**（保守，投错代价更大），
并且这种情况会带 `uncertainty` 说明冲突。识别不到时 `uncertainty` 会明确写"没写 ≠ 不提供，建议直接问 HR"。

> 海外支线的全流程还有 M7 InMail 与 M8 公司背景，属于 P1/P2，未做。

### 明确不做（文档自己标的"待预研"）

**校招平台适配（牛客/实习僧）与海外平台适配（Indeed/LinkedIn）没有做。**
需求 §4.L/§4.M 自己把这两项的"可行"列写成"⚠️ 待预研"，§16 的能力矩阵里它们的每一格都是"未知"。
文档的结论是"**没有预研就无法估工**"，所以这里既不做、也不假装做了 ——
假装做了的后果是用户以为能自动抓校招岗，实际什么都不会发生。

### 出口标准怎么验的

> 「按 §4.L / §4.M 验收」

- **单测 408/408**（P7 时 370）：38 条新的，覆盖状态机留痕、`missed` 不可逆、已签三方不可逆、
  `dueAt` 必填、`deadlines()` 三类 + 排序 + urgent/overdue + 终态排除、
  `detectVisa` 的四种情形（含"没写 ≠ 不提供"与冲突保守判定）、时区（含 DST 区间与坏时区不抛）、
  英文体检、Cover Letter 四条路径、**"没有翻译入口"本身作为一条断言**。
- **真实 GUI 验收 28/28**（`jh-p8-e2e.mjs`）：笔试缺截止被 400 挡下 → 补上后自动推进校招状态；
  三类硬截止进 `deadlines()` 且 24 小时内标 urgent；**全部走到终态后提醒清空**；
  错过改回 → 400；已签改回待签 → 400 而转"违约" → 200；
  时区双重显示（纽约 -12 小时带警告 / 东京 +1 小时无警告 / 坏时间 400）；
  英文体检把"年龄"与"照片"标为 error；Cover Letter 走模板且不编造；校招屏与海外面板都渲染。
- **回归**：P0–P7 六套验收全部重跑通过。

> **验收脚本自己踩的坑（记下来，因为它是产品的真实行为）**：
> P7 的脚本第二次跑时 `POST /applications` 变成 403 —— 卡在**冷却期**（同一公司 24 小时内不能重复投递）。
> 那是防误投在正常工作，不是 bug；脚本必须像用户那样把前置条件（L4 开关 + 冷却期）摆好。

---

## 包契约（改代码前先读）

| 契约 | 内容 | 依据 |
|---|---|---|
| host + client 单包 | 必须声明 `dsh.bundle.patch`，并有 `dsh.client.platform: "web"` | C1 / ADR-1 |
| `cordis.patch.yml` 纯 insert、零 config | 带 `config:` 就要求重启；纯 insert 才能热挂载。配置自管在 sqlite | C2 / ADR-7 |
| 客户端产物是工厂 | `window.__ModuleLoader__.load({ id, factory })`；react 由 shell seed 提供，一律 external | C6 |
| 路由只注册一条前缀 | `/job-hunter`，内部再分发；变更类请求过同源校验 | C4 / ADR-6 |
| `apply()` 立即返回 | 开库、迁移、自检、浏览器启动一律异步；数据层没就绪也要挂上，并如实报告原因 | §4.9 |
| **宿主半不声明硬依赖** | `inject = []`；`webServer` 用 `ctx.inject([…])` 反应式注册。硬依赖会让 headless profile 起不来（坑 12） | P5 实测 |

### 十六个实测踩过的坑（别踩第二遍）

1. **客户端插件必须声明 `inject: ['slots']`**。客户端插件树里，本插件被挂载时 `slots` 还没出现，
   `ctx.get('slots')` 会拿到 `undefined`，UI 会**静默消失**（不报错、不告警、控制台 0 条消息）。
   同理，只在个别交互里用到的服务改为懒解析（见 `client/runtime.ts`）。
2. **`shell.overlay` 是常驻层**。条目一旦渲染就永久占位。浮层必须 ① 无内容时返回 `null`；② 有内容时自动消失或可关闭。
3. **同步计时/目录解析不要放在 `apply()` 里**。迁移可能很慢，必须推到 `setImmediate` 之后（`runtime.ready()`）。
4. **SSE 建连后要立刻写一个字节**。Node 在第一次 `write` 之前不会刷出响应头；如果此刻没有可补发的事件，
   浏览器要等到第一次心跳（15s）才触发 `onopen` —— 表现为前端一直停在「连接中」。
   连上就先写一个注释帧 `: connected`（并顺手 `retry: 3000`）。
5. **同一份文案只能有一个来源**。列表和详情各写一份状态文案，结果「已收藏」在一处写成「收藏」，
   与动作按钮文案撞车 —— 既让用户分不清状态和按钮，也让断言假失败。见 `client/labels.ts`。
6. **送进浏览器的函数必须真的自包含**（P3 真站点冒烟抓到，离线测试全绿）。
   `extractJobsInPage` 里引用了模块级常量 `MAX_CARDS`：jsdom 测试没问题（Node 里闭包还在），
   一到真路径就是 `ReferenceError: MAX_CARDS is not defined`，整页解析失败。
   **护栏**：`test/platform/fiftyone.test.ts` 用 `new Function('return (' + fn + ')')` 按源码重建函数再调用 ——
   这是离线环境里唯一能复现该故障的手段。
7. **招聘站点基本都是 SPA**：`load` 事件到达时列表还没渲染，立刻解析只会拿到 0 条，
   而 0 条最容易被读成「今天没有新岗位」。所以 `gotoSearch` 要**等卡片容器出现**
   （`PageLike.waitForSelector`），再叠一层随机延时。`state=partial / errorCode=NO_RECORDS`
   是这条失手的可见信号，不是静默。
8. **只读实例要能自己接管租约**。上一个实例被强杀时租约文件还在，新实例启动看到对方心跳没过期
   就进只读；如果 `scheduler.start()` 只认第一次调用，这个实例就**永远**只能重启才能恢复。
   心跳循环里要顺带重试 `acquire()`。
9. **归一化不能只切头尾**（P4 写测试时抓到）。原本只做「去头部地域 + 循环去尾部后缀」：
   「华为技术有限公司」被剥成「华为」，而「华为技术有限公司深圳分公司」只剥到「…深圳分」——
   同一个集团的分支永远对不上。分公司形态的地域**夹在中间**，所以每一轮要同时考虑
   「头部地域 / 尾部地域 / 尾部后缀」三种切口。反过来说，发现这个 bug 的正是那条
   「分公司形态应当合并」的断言，所以**断言要写产品该有的行为，而不是代码当前的行为**。
10. **工具名与宿主共享一个命名空间**（P5 真实模型验收抓到）。宿主自带 `job_list`（列后台任务），
    我们的同名工具被 `tools.register` 拒绝 —— 而失败只有日志里一行 `warn`，界面上什么都没说。
    更糟的是客户端 toolview 按工具名 keyed，我们的"岗位库"卡片**接管**了宿主那个工具的渲染：
    表现是「列出后台任务」被画成一张岗位卡片（副标题 `(no background jobs)`）。
    **处置**：改名 `job_query`；注册结果进 `ToolRegistrationReport` 并经 `/health.tools` 暴露；
    冲突用 `error` 级日志点名。**教训**：与宿主共享命名空间时，"注册失败只写一行日志"就是隐患。
11. **§14 的红线不能靠提示词兜**。端到端脚本里明确写了"不要抓取、不要调用 `job_search`"，
    模型**仍然**调了它，一次自动化运行真的打到了 51job。加 `DSH_JOB_HUNTER_NO_NETWORK=1` 之后，
    拒绝发生在打开浏览器之前；验收脚本还会比对运行前后的 `crawl_run` 条数，新增即判失败。
12. **宿主半不能把 `webServer` 声明成硬依赖**（P5 跑 headless 验收时踩到）。
    `export const inject = ['webServer']` 在 web profile 上没问题，但在 **headless / CLI profile** 上
    根本没有这个服务 → 插件永久 `pending` → cordis 判定 `1 entry did not activate` →
    **整个 profile 启动失败**。而我们的模型工具在那种环境下恰恰完全可用（只是没有 GUI 路由）。
    改成 `inject = []` + `ctx.inject(['webServer'], …)` **反应式**注册路由：在就注册、晚到也补上、没有就只是没有 GUI。
    教训：**声明硬依赖前先问「没有它到底能不能干活」** —— 答案常常是"能，只是少一个入口"。
13. **「没问到」不等于「用户拒绝」**（真实模型跑 headless 时它自己提出来的）。
    宿主 `ctx.approval.request` 在没有应答者时返回 `unavailable`，我最初把它压成了 `false`，
    于是界面上显示"用户未批准"—— 而真相是这个环境根本没有审批界面。
    对用户是两件事：驳回 → 不重试、不建待办（他刚做过决定）；没界面 → fail-closed **并且要建待办**。
    所以询问端口现在返回 `ApprovalAnswer`（`boolean | 'unavailable' | 'cancelled' | 'timeout' | 'error'`），
    `toDecision()` 把每种取值翻译成各自的说法。**模型把这条当成产品缺陷提了出来，它是对的。**
14. **同一条规则两侧不能各写一份实现**（P6 写测试时抓到）。防编造检查原简历一侧用
    `factAtoms`、候选一侧用 `flattenResumeText`，两者覆盖的字段不同 →
    **一份英文简历跟自己比都会被判成"多出了技术词"**。误报的结局一定是"把检查关掉"，等于没有检查。
    现在两侧共用一个投影，并且 `checkNoFabrication(x, x)` 必须为真，这条被测试守着。
    同批还发现：技术词抽取基于拉丁 token，所以**中文技能（"精通分布式事务"）一个都抽不出来** ——
    补了与语言无关的**结构性子集检查**（技能/经历/项目/学历只允许是原集的子集）才真的堵住。
15. **「注释说要这样做」不等于代码真的这样做了**（P7 写测试时抓到两处）。
    `analytics.ts` 的注释写着"漏斗不能只看当前状态，否则推进过的会漏掉"，实现却写的是
    `record.stage === 'interviewed'` —— 一个"面试完被拒"的投递就从"已面试"层消失了。
    已在实现里改成查 `stage_event`。另一处是 `recordApplication` 把 `guiConfirmed` 静默丢了
    （路由用条件展开传参，绕过了 TS 的多余属性检查所以 `tsc` 不报），
    后果是界面陷入"点了确认还是让你确认"的死循环。
    **两个都是"实现与自己的注释/契约矛盾"，而这类矛盾只有测试会指出。**
16. **"改了状态却忘了写事件"会一次漏三处**（P8 写测试时抓到）。校招的
    `setAssessmentState(done)`、`addTripartite`、`setTripartiteState(signed)` 都改了校招记录的状态，
    但都没写 `stage_event` —— 于是事件表的最新一条与主表当前状态**自相矛盾**。
    同一个文件里那条"自动推进"的路径却是写了的。
    修法不是补三行，而是把"改状态 + 写事件"抽成一个 `advanceCampusStage()` ——
    **把这个不变量绑进一个函数，以后新增路径就不可能只做一半。**
    同批还抓到：`missed` 可以被改回 `pending`（而枚举注释写着"终态且不可逆"）、
    已签三方可以被改回待签（而代码注释写着"不可逆节点不该被随手改回去"）、
    硬截止 label 用了裸枚举（界面上出现 `written截止`）、
    `getVisa` 对没识别过的岗位回 `jobId: 0`（调用方无从知道这条结论属于哪个岗位）。
    **共性：注释描述了正确的意图，实现没有跟上，而 `tsc` 对这类偏差完全无感。**

## 与 `ARCHITECTURE.md` 的实现差异

| 文档写 | 实际 | 理由 |
|---|---|---|
| 客户端用 `tsdown` | `esbuild` + 自写工厂外壳 | 外壳由 `scripts/build.mjs` 的 `wrapFactory()` 控制更可预测；换回 tsdown 只改那一段 |
| `store/schema.sql` | `store/schema.ts` 导出 DDL 字符串 | `tsc` 逐文件输出与 esbuild 打包都不会自动带上同目录 `.sql`，一旦没带上就是运行期才报错 |
| 目录树里没有 `runtime.ts` | 新增 `host/runtime.ts` | 需要一个装配点把 store / 注册表 / 互斥 / 浏览器 / 领域服务接起来，入口层只跟它打交道 |
| 审批用 `ctx.userQuestions.ask()` | `ctx.approval.request()` | 后者自带工具身份（`toolName`+`callId`+打开的回合），审批记录能与那次工具调用配对；前者只是个通用提问 |
| 工具名 `job_list` | `job_query` | 宿主自带同名工具，重名会被 `tools.register` 拒绝（见坑 10） |
| 批量上限在审批之后 | 审批之前 | 两个分支都是拒绝，不该先问用户一次再告诉他超限（§4.4 表格的唯一次序差异） |
| （文档未提） | 离线闸门 `DSH_JOB_HUNTER_NO_NETWORK=1` | §14「自动化测试绝不访问真实招聘站」的机制化兜底（见坑 11） |
| PDF 复用"抓取用的那个 Chromium" | 另起一个**专用 headless** 实例 | 抓取浏览器是 headful 的（要登录、少踩自动化特征），而 `page.pdf()` 只在 headless 下可用 —— 两者需求相反 |
| `resume_file` 存绝对路径 | 存相对 `files/` 的路径 | 换数据目录只改一个根，不用批量改库 |
| 简历定制直接产出新版本 | 产出 `tailoring` **建议** + 显式采用 | §3.2 明确"不要每岗定制"；覆盖式生成会丢掉"哪版投了哪个岗位"的对应关系 |
| 消息归 `outreach` 服务 | 独立成 `messages` 服务 | §4.3 的服务表写的是"关键方法（示意）"；消息中心自己有完整语义（会话、未读、回复、邀约识别、与接触态联动），塞进话术生成里会让两边都变模糊 |
| （文档未提） | 漏斗在**总体切换处** `rate` 留空并标 `population` | 接触漏斗与投递漏斗是两个总体，跨总体算转化率会 >100% |
| （文档未提） | 回退状态必须显式 `allowBackward` | HR 确实会反悔所以要允许，但手滑改错状态必须留痕 |
| 校招平台与海外平台适配 | **不做** | §4.L/§4.M 自己标注"待预研"，§16 能力矩阵全"未知"。没有预研就无法估工，假装做了比不做更糟 |
| （文档未提） | 工签识别为 `unknown` 时**留 NULL 而不是写 'unknown'** | 筛选时"没识别"与"识别为未识别"是两件事，混在一起就再也分不开 |
| （文档未提） | 英文简历模块**不提供翻译入口** | §4.M 说机翻是致命错误；提供入口就等于鼓励用它 |
| 「纯 insert 即可热挂载，无需重启」（C2） | **未实测**：命令行安装后要重启才生效 | `P0-VERIFICATION.md` §2.2 自己标明"端到端演示不重启即生效本轮未做"；`dshmarket` 的热挂载（`hot.js`）只服务市场界面的安装流程，与 `dsh plugin add` 不是同一条路径。实践建议：装完就重启 |
| 侧栏入口的排版由 shell 的槽位决定 | 图标盒子固定 `24×22`、宽侧栏补 `2px` 左边距，向**手插 DOM** 的社区插件对齐 | shell 的 `.panelGlyph` **没有宽度**，标签起点跟着我们的 glyph 走：不补是 `8+16+8=32px`，邻居是 `10+24+8=42px`（差 10px，肉眼就是"不左对齐"）。高度退回 22px 是为了让行高与邻居的 `height:36px` 一致（24px 会把行撑到 38px，实测过）。数字与推导写在 `src/client/entry-icon.tsx` 顶部与 `styles.ts` 的 `.jh-entry-glyph` 注释里 |

---

## 许可与免责

- **许可**：[MIT](LICENSE) —— 可自由使用、修改、分发（含商用）。注意这意味着本仓库里的
  「仅供学习」是**立场与建议**，不是许可限制；要强制禁止商用就得换成非 OSI 的自定义许可。
- **免责**：本项目**仅供学习与技术研究使用**。完整条款见 [`DISCLAIMER.md`](DISCLAIMER.md)，要点：
  - 抓取必须遵守目标网站条款与当地法律；项目**刻意不含**任何反检测 / 绕过风控能力（D-17/R18）；
  - **L3 批量打招呼与 L4 批量投递默认关闭**，开启属于账号风险自担；高危动作一律过审批闸门，
    不要为了少点一次确认而绕过它；
  - 数据**全部留在本机**（`$DSH_HOME/job-hunter/`），**没有服务器、不上传、不联网同步**；
    但简历与联系方式仍由你自己保管，分享数据库或截图前请先自查；
  - 模型生成内容（话术 / 简历定制 / Cover Letter）必须人工复核，防编造检查只是兜底；
  - 本项目按**「现状」（AS IS）**提供，不附带任何担保，作者不承担使用后果。
- 本项目与任何招聘平台（前程无忧、BOSS 直聘、猎聘、智联招聘、牛客、实习僧、Indeed、LinkedIn 等）
  **没有任何隶属、合作或背书关系**；相关商标归各自所有者。
