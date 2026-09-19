# dsh-job-hunter

> **这是开发 / 技术版 README**（原 `README.md` 的完整备份）：包含各阶段的实现细节、验收证据与踩坑记录。
> 只想了解这个项目是什么，请回 [`README.md`](README.md)；逐字节原文见 git 提交 `be13d88`。
>
> **要接着做优化？先读 [`docs/OPTIMIZATION-PLAN.md`](docs/OPTIMIZATION-PLAN.md)** ——
> 那是给新会话的执行手册：硬约束、已核实的现状（含两条待核实）、按批次拆好的任务与验收、
> **已经踩过的坑**、红线、以及每批的收尾清单。

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
npm test             # 485 个测试（node --test，离线，绝不访问真实招聘网站）
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
│   ├── runtime.ts     # 宿主侧装配门面：store + 注册表 + 互斥 + 浏览器 + 领域/安全/模型服务
│   ├── runtime/       # 装配点的子模块（都是叶子/单向依赖，不反向 import runtime.ts）
│   │   ├── contract.ts # RuntimeFailure + dataNotReady（路由不必为一个错误 import 整个装配点）
│   │   ├── adapters.ts # **平台清单**（10 个适配器一行一个）+ 注册样板 + platform 行登记
│   │   ├── gate.ts     # SR-16 每平台前置（离线/风控/健康/登录/冷却/配额）+ 冷却与配额两个读数
│   │   ├── views.ts    # 只读投影：store → DTO（health / crawlStatus / platforms / loginStatuses）
│   │   ├── actions.ts  # 七个编排：闸门 + 令牌 + **成功后才回写** + 事件广播
│   │   └── lifecycle.ts# 租约（R20）与心跳：只读原因 / 接管 / 拒绝驱动浏览器
│   ├── scheduler/     # 自排程（§4.6 / D-19）
│   │   ├── schedule.ts   # **纯函数**：偏好时段 → 窗口内触发点（稳定哈希，可离线断言）
│   │   ├── index.ts      # 触发/跳过/退避/风控暂停/一键暂停/新鲜度
│   │   └── timer-port.ts # 可取消定时器（Cordis timer / 原生 / 测试手动）
│   ├── settings.ts    # 插件配置门面（改 guard 配置必须持令牌）
│   ├── http.ts        # 唯一前缀路由的**传输层**（Node req/res + SSE 挂流）
│   ├── http/
│   │   ├── router.ts  # **有序路由表** + 同源校验 + 领域错误→HTTP 映射（表 = 全部端点清单）
│   │   ├── routes/    # 19 个按域分的模块；**一个 handler 只接一个精确形状**（不接就返回 undefined）
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
│   │   ├── plan-config.ts # **采集方案校验的唯一实现**（SR-45：GUI/工具/HTTP 共用）
│   │   ├── dedupe.ts  # 跨平台去重落到分组（SR-44 的 dedup 开关；保守到宁可不合并）
│   │   ├── crawl.ts   # 一次抓取的完整编排（§6.1）
│   │   ├── intel.ts   # 标注 + 公司画像 + L1 可解释匹配（P4；偏好来源含简历）
│   │   ├── outreach.ts# 打招呼话术（**只生成，不发送**）
│   │   ├── resumes.ts # 简历版本 / 定制（防编造）/ 附件生成（P6）
│   │   ├── pipeline.ts# 投递记录 + 接触态 + 状态事件（P7 的唯一留痕点）
│   │   ├── messages.ts# 消息与邀约识别（识别 != 改状态）
│   │   ├── interviews.ts # 面试日程 / 撞车 / 通勤 / 准备包
│   │   └── analytics.ts  # 漏斗 / 归因 / 薪资分位（样本不足不给结论）
│   │   ├── campus.ts   # 校招：硬截止（含**同步进待办**）/ 笔试不可逆 / 三方不可逆（P8）
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
│   ├── tools/         # ── 模型工具（P5，§22.2；31 个工具按**所消费的领域服务**分文件）
│   │   ├── index.ts   # 公共入口：工具聚合 + 注册结果报告（注册失败必须可见）
│   │   ├── kit.ts     # 共享工具箱：schema 片段 / 工具装配 / 参数收敛 / 数据层就绪检查
│   │   ├── types.ts   # 注册结果契约（叶子模块：runtime.ts 只依赖它，不反向依赖 index.ts）
│   │   ├── jobs.ts    # job_*（岗位库）            plans.ts    # job_plan_manage（方案与调度配置）
│   │   ├── crawl.ts   # crawl_*（抓取执行）        outreach.ts # 打招呼 / 收件箱 / 消息
│   │   ├── applications.ts # 投递 / 面试           resumes.ts  # resume_*
│   │   ├── campus.ts  # 校招                     overseas.ts # 海外 / Cover Letter
│   │   ├── analytics.ts # job_report              settings.ts # job_settings
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
│   │                  # U9 `collect.tsx` 是薄入口（编排 + 三分区骨架），子组件在 `collect/` 下按职责分文件；
│   │                  #    表单派生逻辑在 `collect/plan-form.ts`（测试直接引用它，改动要连带看 test/shared/collect-form.test.ts）
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
locks（按平台互斥：同平台忙就立刻失败、不排队；不同平台并发）
  → adapter.criteria.buildSearchUrl（URL 优先，少触发风控）
  → adapter.crawl.gotoSearch → guard.detectBlock（命中即停、不硬重试）
  → adapter.crawl.readListPage
  → 【闸门 1】逐条字段断言：缺任一必需字段 → 不写主表，进 pending_repair
  → 薪资归一化 → 公司实体 ensure → 岗位幂等 upsert
  → 【闸门 1 之后 · 仅本轮新增】详情补抓（列表不含 JD 的平台，如猎聘：逐条进详情页取 JD；
      上限 `DETAIL_FETCH_MAX_PER_ROUND=20`／与列表同一个单轮预算（到点即停）／判墙即停手）
  → 公司画像重算（**必须在补抓之后**：打分与标注读的就是 `jd_text`）
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

**路由与传输是分开的**：`http/router.ts`（每条路由的实现在 `http/routes/*`）收 `RouteRequest`、出 `RouteResult`，完全不碰 Node 的
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
仓库内可复现的是那 485 个离线单测（`npm test`）。

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
| 互斥 | 与手动触发共用 `crawl` 的**平台锁**：同一平台不会并行；不同平台并发（`MAX_CONCURRENT_PLATFORMS` 条泳道） |
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

### 定时任务：需求基线与现状差距（2026-09-17）
**前提**：插件**不是守护进程** —— DSH 关着的时候没有调度。
所以目标不是"09:30 准时触发"，而是"**用户坐下来的时候数据是新鲜的**"。
完整需求（SR-1…SR-37）见 `ARCHITECTURE.md` **§4.6.1**，产品决定见 `REQUIREMENTS.md` **D-19**。

**现状（逐条核对过代码）**

| 项 | 现状 |
|---|---|
| 排程 | 自实现：Cordis `timer` → 原生 `setTimeout`（`TimerPort` 抽象、可取消），**带抖动 + 自重新武装**，`next_run_at` 落库 |
| 触发 | **固定单点时刻**（`runAt: '09:30'` + 工作日掩码）——按 D-19 要改成"窗口内随机" |
| 多方案 | `enabledPlans()` 遍历**全部**启用方案，都排程 ✅ |
| 错过 | 只生成 `catch-up` 待办、**绝不自动跑**（C9）✅ |
| 租约 | 单实例；非持有者只读，**连手动跑都拒绝** ✅ |
| 一键暂停 | ❌ 只有 per-plan 开关（`plan.enabled` / `plan.schedule.enabled`），没有全局的 |
| 三条执行路径 | 「立即运行」「补跑」走 `runPlan()`（**会推进 `lastRunAt`**）；「抓取一次」走 `runCrawl()`（**不碰排程**） |

**已发现的三个问题**

1. **时间是裸 UTC**：今日屏把 `nextRunAt` 原样打印 → `2026-09-18T01:34:08.060Z`，
   而计划写的是 09:30（本地）。用户第一眼会以为排程错了；抖动的 +4 分钟也没有任何说明。
2. **「抓取一次」的条件写死在客户端**：`runCrawl({ platformId: '51job', criteria: { keyword: 'Java', city: '深圳' } })`
   —— 按钮文案里的"深圳 Java"是**字面量**，不读用户的方案；而且它不更新排程（手动抓十次，排程不知道）。
3. **手动跑会隐式重置"错过"判定**：`runPlan()` 里 `setRunTimes({ lastRunAt: clock() })`，
   所以 16:16 手动跑一次，09:30 那次的"错过"被悄悄原谅。可能是想要的，但应当是**显式**语义（SR-7）。

**待确认（疑似缺口）**：崩溃后悬挂的 `crawl_run(state='running')` —— 我在 `domain/crawl.ts`
与 `store/repo/crawl-runs.ts` 里没找到收敛逻辑。若确实没有，面板"最近一轮"会一直显示在跑（已列 P0 / SR-15 / R23）。

**D-19 的四个决定**：窗口内随机 + **在场触发** · 时区**跟着人走** · **话术草稿暂不纳入** · 一键暂停**只停定时**。

**追加决定（同日，三项）**：① 抓取深度（页数/排序/时间窗）**进本版配置** ② 多方案重复抓取**只提示不合并**
③ 适配器**筛选维度声明白本版就做**（界面据此渲染，不支持的维度禁用而非隐藏）。

**界面落点（这条比实现更值得先看）**：架构 **§5.4 早就规划了三块屏，而且三块都没实现** ——
**U9 平台与适配器**（P0：登录态、健康、动态筛选项发现与人工覆盖）、**U10 设置**（P1：抓取/额度/隐私/保留）、
**U11 日志与诊断**（P1：运行历史、错误、LLM 调用记录）。它们的内容现在**全挤在 U0 今日里**
（截图里的「平台与登录」「定时抓取」就是 U9 的内容）。所以"要不要单独一个页面叫数据采集"的答案是：
**要单独一页，但那一页架构里已经有了 —— 是 U9**；新造一页只会和 U9/U10/U11 职责重叠。
落地方式：U9 承载「采集」（tab 显示「采集」，页标题「数据采集」），**今日减负**成
"新鲜度徽章 + 下次运行（本地时间）+ 立即采集 + 去配置"。

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

### U3 简历中心：结构化表单（2026-09-17 重做）

初版编辑区是"手拼标记"：工作经历要求用户自己写 `## 公司｜职位` 再一行一条成果，
技能用「、」分隔的一整块 textarea。用户反馈原话是「开发思维主导、操作门槛高、
少敲一个空格就渲染错乱」—— 这条批评成立，已整体换成结构化表单：

| 项 | 现在 |
|---|---|
| 工作经历 / 项目 / 教育 / 其他 | **重复块**：一块一框，带编号、上移/下移/删除；「＋ 添加一段」按钮 |
| 成果 | 一条一行，**回车接着加一条** |
| 技能 / 技术栈 | **标签输入**：回车或「、」确认一个，点 × 删掉；只改名字不会丢掉 `level`/`years`/`evidence` |
| 短字段 | 同行并排（姓名+目标岗位、城市+年限+年龄、起止时间…），纵向空间留给长文本 |
| 保存 | **只有一个显式「保存」**，脏了就亮起；不做自动保存，也不在 blur 时偷偷提交 |

其余几处一起改了：

- **布局**：`列表(25%) | 工作区`，工作区内可切「编辑 / 分屏 / 预览」。
  默认「编辑」是量出来的：面板 ~1184px 时工作区只有 ~872px，分屏会把编辑器压到 400px 出头，
  而单栏 872px 正好放下 A4（794px）。窄于 900px 时"分屏"用 **container query** 自动退回单栏。
- **体检**从"预览区的一行绿字"搬到**编辑区顶部**的提示条 —— 它指导的是"改表单"。
- **导出**（主操作，实心按钮）留在预览区；**复制 / 删除 / 设为启用**这些版本属性操作挪到工作区标题栏。
- **预览给"纸张"隐喻**：`bg-mask-2`（实测 12% 黑）当深灰底，白纸带阴影浮在上面。
- 左侧卡片：`启用中` 做成独立徽章；计数只显示非零项；`⚠ 体检 N 项` **悬停即出明细**
  （列表接口只给数量，明细是按需拉的）。

顺手修掉一个会误导人的展示 bug：卡片副行原先印的是 `RESUME_STATE_LABEL[state]`，
而 `state==='active'` 只表示"没归档"，于是**每张卡都写着「启用中」**、徽章却只有一个。
现在副行只印方向与语言（归档态才额外标一行）。

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

## P9 定时模型与采集配置面（D-19 / SR-1…SR-45）

> 需求依据：`REQUIREMENTS.md` **D-19**；实现级需求：`ARCHITECTURE.md` **§4.6.1**。
> 逐条落地状态见 §4.6.1 后面那张表。

这一轮不是"加功能"，而是把定时与采集从**固定单点 + 写在客户端的条件**改成
**偏好时段 + 方案驱动**。四条最容易搞错的地方单独写下来：

### 1. 窗口内随机点为什么是哈希，不是 `Math.random()`

`next_run_at` 要落库（NFR-4），而且会被**反复重算**：启动一次、每次 tick、每次 `status()` 查询。
用随机数的话同一个窗口每次算出不同的时刻，后果是两个：

* 界面上的"下次运行"会在刷新之间自己跳动，用户没法判断到底什么时候跑；
* **定时器会自旋** —— 武装到 A 点，tick 时重算却得到 B 点，永远追不上。

所以偏移由 `hash(FNV-1a('YYYY-MM-DD#planId'))` 派生：**同一窗口恒定、不同窗口不同、不同方案不同**。
它同时满足 SR-1 的两条验收（连续 5 天互不相同 + 都在窗口内）与"落库之后不再变"。

### 2. `last_attempt_at` 与 `last_success_at` 必须分开

原来只有一个 `last_run_at`，失败也推进它 —— 于是**新鲜度永远看起来是新鲜的**，
而那是最坏的一种谎：用户以为数据是今天的，其实是三天前那次失败之前的。
现在只有 `state === 'ok'` 才推进 `last_success_at`；失败推进 attempt 与退避。

### 3. 跳过**不写** `crawl_run`

`crawl_run` 记录的是"真的去抓了一轮"，而跳过连浏览器都没开。
硬写一条会让运行历史混进一堆 `found=0` 的假运行，**反而掩盖真正失败的那几条** ——
而那正是这张表要回答的问题。跳过的去向是 `planStatus.lastDecision`（界面显示"为什么没跑"）
与 SSE 的 `plan.skipped` 事件。

### 4. 三条入口共用同一份校验

`domain/plan-config.ts` 是**唯一实现**，GUI / 模型工具 / HTTP 都调它。
否则"界面拦住了、对话里绕过去了"是必然的，而用户只会相信**严的那一套**，
于是界面上过一个条件、工具上报一个错，两边都不可信。

### 新增/改动的接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/crawl` | **A2**："抓取一次"改走默认方案（不再写死 `{51job, 深圳, Java}`），返回里带 `planId`/`planName` |
| POST | `/plans/:id/validate` | SR-45：只校验、不写库（界面保存前先问一次，与写入路径同一份校验） |
| POST | `/plans/:id/resume` | SR-21：**人工确认**恢复风控暂停（系统不会自动恢复） |
| POST | `/schedule/pause` | SR-30：全局一键暂停（**只停定时**，手动永远可用） |
| GET | `/schedule/reasons` | SR-17/26：跳过原因 → 人话（宿主是唯一来源，界面不自己写一套） |
| GET | `/criteria/dimensions` | SR-41：当前平台声明了哪些筛选维度（界面据此渲染） |
| GET | `/analytics/salary/box` | F1：箱线图（`basis` **必填**：`monthly_min` / `annualized`） |
| GET | `/analytics/salary/baseline` | F2：与**自己岗位库**的基准对比（不联网、不编行业数据） |
| GET | `/analytics/resume/compare` | F3：简历版本 A/B 对比（每格带样本量，不做显著性） |

`job_plan_manage` 工具同步扩到与新配置面对等（`platforms` / `sort` / `postedWithinDays` /
`maxPages` / `weekdays` / `windowStartHour` / `windowEndHour` / `score|flag|dedup`，
外加 `dimensions` / `pause` / `resume` 三个动作）；`job_report` 扩出 `box` / `baseline` / `resume`。

### 采集页可用性修复（2026-09-17 第二轮）

用户报了三类"界面把内部东西漏出来了"，逐条修掉，并且都抽成了**纯函数**以便离线断言：

| 报的问题 | 根因 | 修法 | 落地 |
|---|---|---|---|
| 顶部警告显示 `**连手动跑也会被拒绝**` | 文案里写了 Markdown，而界面**从来没有解析过**（同一问题在今日/简历/看板/校招都有） | 自写十行**行内** Markdown（只认 `**粗体**` 与 `` `代码` ``），返回 React 节点，**从不**用 `dangerouslySetInnerHTML`（抓来的 JD 是不可信输入，走 HTML 直通等于开注入口子）。同时把 `title=` 里的标记换成 `stripInlineMd` | `src/client/inline-md.tsx` |
| 方案条件显示 `{"keyword":"Java","city":"深圳"}` | 直接渲染了 `JSON.stringify(criteria)` | `describeCriteria()` 翻成「关键词：Java · 城市：深圳」，取值域里的值再翻一层（`sort:"2"` → 「排序方式：最新发布」）；未声明的键**原样显示**而不是消失 | `src/shared/criteria-label.ts`（host 工具共用） |
| 运行记录里堆着 `page.evaluate: ReferenceError… at …` | 直接印了 `errorMsg` | `humanizeFailure()` 给一句人话（"代码语法异常"）+ **对症的下一步建议**，原始全文完整收进可展开的 `details`（简化显示≠藏起来） | `src/shared/error-text.ts`（host 工具共用） |

另外三件事：

* **状态矛盾**：「调度：未启动」和「下次运行：还有 9 小时」并排出现。根因是 `scheduling`（本实例在不在调度）
  与"有没有下次运行"是两件事，被塞进了同一个 KV 列表。现在合成**一句**「调度归属」叙述
  （本窗口负责 / 由另一个窗口负责 / 定时已暂停），并在只读时明确说"那个窗口会在 … 自动采集"。
* **英文枚举直出**：`ok`/`partial`/`failed`/`degraded` 变成中文徽章（成功/部分成功/失败/正常/降级/失效），
  标签表放在 `shared/enums.ts` —— 面板与模型工具返回文本共用同一份，所以两边不会说两套话。
* **极客术语**：`pid`、`租约`、`抖动`、`退避`、`风控暂停`、`逐字段健康` 等都带上了悬浮释义
  （`src/client/terms.tsx`），并且**用户可见文本里的 `SR-x` / `R-xx` 需求编号全部删掉** —— 那是我们内部的账。
* **死胡同提示**："非租约持有者连手动跑也会被拒绝" 补上了下一步：租约面板给「重新检测」与「接管调度」两个动作，
  并写明"怎么解决"。接管**只在对方心跳已过期时才成功** —— 抢一个活着的实例会让两个调度器同时抓取，
  那正是这把锁要防的事，所以它不能是"强抢"按钮（对方活着时置灰并解释原因）。
  新增接口：`POST /schedule/lease/recheck`、`POST /schedule/lease/takeover`。
* **异常指引**：选择器失效/脚本异常/平台降级的行尾有「排查方案」折叠块（含具体核对步骤与「去设置看诊断」跳转）。
* **表格**：「触发」列全为 `—` 时**整列隐藏**（实测确实会全空：schema v7 之前的历史运行没有 `reason`）；
  数值列右对齐 + 等宽数字。

> **踩到并立刻修正的两处**（都是这份文档 §1.3 已经点名的坑）：
> ① CSS 注释里写了反引号 —— 直接把 `const CSS = \`…\`` 模板截断，typecheck 报出一堆莫名其妙的错。
> **同一轮里踩了两次**，说明"改完 styles.ts 要数一遍反引号"必须变成动作而不是记忆。
> ② `.jh-num{text-align:right}` 被 `.jh-table td{text-align:left}` 按特异性压过去
> （类 0,1,0 输给 0,1,1），计算样式实测仍是 `left`；改成 `.jh-table td.jh-num` 才对。
> **教训**："我加了样式"不等于"样式生效了"，要用 `getComputedStyle` 验。

#### 顺带修掉的一个真 bug：**「被拒绝」被当成「抓取失败」**

为 SR-18（一个平台失败不阻断其它平台）加的多平台 `try/catch`，把**离线闸门的拒绝**
（`BLOCKED`）包成了一句 `INTERNAL：方案没能跑出结果` —— 接口回 **500**，用户看到"程序坏了"，
而真相是"离线模式下这条路本来就不让走"，连错误码都丢了。
现在：`isRefusal()` 把 `BLOCKED`/`CONFLICT`/`INVALID_INPUT`/`NOT_FOUND`/`DATA_UNAVAILABLE`
识别为"动作被拒绝"，**原样抛出**并且**不进退避、不加连续失败计数、不弹风控待办**。
（否则跑几次离线测试就能把方案推到 `risk_paused`。）有两条行为测试钉住这个区分。

#### 另一个准确性问题：时区显示成 `UTC`

`schema v7` 之前的方案行没有 `timezone` 快照，而 `toDto` 的兜底写的是字符串 `'UTC'` ——
**那是假的**：排程用的是本地墙钟（实测本机是 `Asia/Shanghai`）。改成兜底时**真的问一次本机时区**
（`detectTimezone()` 搬到 `util/time.ts`，调度器与仓储共用）。

### 采集页界面评审第二轮（2026-09-17）

四块评审意见的落地，以及各自"为什么这么改"：

| 评审意见 | 改法 | 判断依据 |
|---|---|---|
| 顶部三段黄色提示内容重叠 | 合并成**一条** Alert，并**自带该做的动作**（「恢复定时」）；暂停时不再同时出现头部那个开关按钮 —— 两个按钮做同一件事正是要消掉的重复 | 优先级：已暂停 > 数据偏旧，同一时刻只说一件最需要处理的事 |
| 表格里错误大段散落在单元格 | 单元格只留**状态胶囊 + 一句人话**（可点击），全文与排查步骤进**弹窗**；`<pre>` 不再出现在表格里 | 评审要求"移入 Hover Tooltip 或点击弹窗"；长 trace 放弹窗比 tooltip 可读 |
| 状态要 Tag 胶囊（绿/黄/红） | `StateTag`（中文 + 色调）。**顺手删掉同义的 `.jh-badge-state`** —— 上一轮同时留了两个同义类，那会让"这个类还有人用吗"查不清 | 颜色一律走主题变量，**不写死 red** |
| 方案卡片视觉太平 | 明确边框 + 阴影；**"连续失败 N 次"升格为卡片最顶部的警告 Banner** | 埋在正文里的一行小字等于没提示 |
| 四个按钮同级平铺 | 分三档权重：立即采集 = 主按钮；编辑/重新检测 = 次级；确认恢复 = 警示色；**删除 = 危险色**。主操作与危险操作同时可见（不用下拉菜单） | 一个方案卡片只有 4 个动作，藏进菜单反而多一次点击 |
| 起(时)/起(分)/止(时)/止(分) 四个数字框 | 换成**两个原生 `<input type="time">`** + 中间"至" | 原生控件零依赖、自带键盘与移动端行为；`clockValueOf`/`parseClockValue` 是唯一转换点（可离线测） |
| 周一…周六 勾选框 | 换成**分段标签**（`aria-pressed`）+ 工作日/周末/每天/清空 一键预设 | 预设是**产品决定**（我们怎么定义"工作日"），所以放 `shared/time-format.ts` 而不是散在 JSX 里 |
| 输入框下方长段解释 | 收进字段标题旁的 `?`（`title` + `aria-label`） | 长解释**没有删掉**，只是不再占版面 |
| 「检查重复」孤立在左下角 | 挪到**方案名同一行右侧** | 它校验的就是这份配置是否重复 → 属于表单级校验，不是提交前总校验 |
| 表单嵌在页面下方导致页长 | 改成**弹窗** | 含 Esc 关闭、点遮罩关闭、焦点移入/还回；**刻意不做焦点陷阱**（半吊子的陷阱比不做更糟） |
| 输入框深灰底偏暗 | 明确用主题的"基础底色" + 浅灰边框 + 聚焦光环 | 用 `getComputedStyle` 在真实实例上验（上一轮吃过"加了样式但被特异性压过去"的亏） |

> **两次"期望搬走"（都不是放松断言）**：
> ① `.jh-badge-state` → `.jh-tag`（类名统一），中文那一条不受影响；
> ② 行内 `details.jh-details` → 胶囊 + 弹窗，验收脚本改成**真的点开一次**并验证弹窗内容，比原来更严。

### commercial-ui-ux 技能审核（2026-09-17 第三轮）

用 `commercial-ui-ux` 技能的 `docs/01-commercial-ui-ux-rules.md` 与 `docs/06-quality-gates.md`
对采集页做了一次**取证式**审核，然后按 findings 修。规则文档与质量门槛都读的是
包内原文（技能加载失败的原因见本文末尾）。

#### findings（按严重度）

| # | 严重度 | 位置 | 问题 | 用户影响 | 修法 |
|---|---|---|---|---|---|
| 1 | **P1** | `styles.ts` 语义色当**文字色**（`.jh-tag` / `.jh-fresh` / `.jh-story-warn` / `.jh-ok` / `.jh-warn` …） | 主题的 `state-*-primary` 是**指示色**不是文字色：实测成功 #22c55e **2.28:1**、警告 #f59e0b **2.15:1**、调度归属文字 **2.15:1** —— 远低于正文要求的 4.5:1 | 关键状态文字在浅底上**看不清**，尤其警告与成功 | 在自有层里由主题色混出**深色文本变体**：`--jh-ok-fg/--jh-warn-fg/--jh-error-fg = color-mix(语义色 55%, label-primary)`（实测 5.1–9.8:1） |
| 2 | **P1** | `styles.ts` 4 处用 `--dsw-alias-state-error-tertiary` | 这个变量**不存在**（实测 7 个不存在的变量之一），写了等于背景**静默失效**、退成透明 | 错误横幅/胶囊"看起来有底"其实没有，语义只能靠字色，又正好不达标 | 换成项目既有的 `color-mix(语义色 9%, transparent)` 做法（截止日期样式里早已这么写过） |
| 3 | **P1** | `styles.ts` 危险底 + 白字 | 主题 `state-error-primary` 配 `label-primary-foreground` 实测 **4.4996:1** —— 比 AA 的 4.5 差一点点 | 危险按钮文字处于"看着没问题、量了不达标" | 底色改用 `--jh-error-fg`（9.79:1），视觉上仍是明确的红 |
| 4 | **P1** | `collect.tsx` 方案列表 / 平台列表 / 运行历史 | **加载态被当成空态**：还在加载的一两秒里显示"还没有方案 / 还没有注册平台" | 用户以为数据丢了（`ARCHITECTURE.md` §5.5 早就点过这个坑） | 三处都加 `loading` 分支；空态补"原因 + 下一步" |
| 5 | **P1** | `collect.tsx` 删除按钮 | **破坏性操作没有硬闸门**：一次点击即永久删除方案 | 误点即失去配置，无法恢复（宪法第六条 / SKILL.md Protected actions） | 加确认弹窗：列出方案与后果、危险色按钮、可取消；验收脚本验证"未确认前数据未变 + 取消后未删" |
| 6 | **P2** | `modal.tsx` | 没有 focus trap：Tab 会跑到被遮住的页面上 | 键盘用户在一堆看不见的控件里迷路（quality-gates §4 明确要求） | 实现**正确**的陷阱：每次 Tab 重新枚举可聚焦元素、首尾环绕、焦点外逃时拉回；验收脚本连按 Tab `N+3` 次（N=28）与 Shift+Tab 双向验证 |
| 7 | **P2** | `collect.tsx` 时段输入 | 字段级错误没有与控件关联（只有可见红字） | 读屏用户不知道哪个字段错、错在哪 | `aria-invalid` + `aria-describedby` 指向错误文本（`role="alert"`） |
| 8 | **P2** | `styles.ts` 小屏顶栏 | 375px 下标题被挤成"求\n职\n找\n工\n作"一列一个字，10 个 tab 竖排十行 | 移动端导航不可用（rules §7 要求小屏有合理降级） | ≤600px：顶栏换行 + tab 条整行**横向滚动**（保留"我在哪"的可达性） |
| 9 | **P3** | `styles.ts` 运行表 | 表格行没有 hover 反馈（quality-gates §4 要求 row hover） | 扫行时丢失"鼠标在哪一行" | 加 `tbody tr:hover` |
| 10 | **P3** | `collect.tsx` 表格 | 小屏没有表格策略（6 列被压进 375px） | 列挤成一条，读不了 | 有意的**横向滚动** + `min-width` + 首列粘性（保留行身份）+ ≤480px 隐藏"更新"列 |
| 11 | **P3** | `collect.tsx` 反馈条 | Alert 缺 dismiss / 读屏语义（quality-gates §4 列了 severity/dismiss/timeout/screen-reader） | 提示只能自己消失，读屏不播报 | `role="status" aria-live="polite"` + 关闭按钮 |
| 12 | **P3** | `collect.tsx` 按钮权重 | 「新增方案」与「立即采集」同为最强主按钮，同一工作区两个主行动 | 主次不分（rules §4.2 要求一个最强主行动） | 「新增方案」降为次级 |

#### 两处"测量工具的错误伪装成产品缺陷"

审核过程中踩到两次**假失败**，都记下来（宪法第十条：没有证据不能称完成，反过来**错误的证据也不能当缺陷**）：

1. 第一版可访问性扫描扫了**整个文档**，把 shell 自己的搜索框（`INPUT.bhn1Oq_searchInput`）
   报成我们的问题 → 改成只扫 `.jh-root`。假阳性会让真问题被淹没。
2. 第一版对比度脚本只认 `rgb()/rgba()`，而 `color-mix()` 的计算结果会被序列化成
   **`color(srgb 0.53 0.07 0.08 / 0.09)`**（浮点 + alpha）→ 解析失败后静默退到"白底"，
   把 9.8:1 的合格配色报成 1.00:1，又把"9% 淡红底"读成"纯红底"报出 2.17:1。
   修好解析（含 alpha 合成）后，**两个脚本才一致收敛到 0 条**。
   教训：**两个测量脚本互相矛盾时，先怀疑测量**。

#### 验证方式与结果

| 检查 | 方式 | 结果 |
|---|---|---|
| 对比度 | 枚举页面上**真实存在的每一种文字样式**（不预设选择器清单，避免"没测到=通过"），在列表态/表单弹窗/删除确认弹窗三处各测一遍 | **151 种样式，0 处不合格** |
| 响应式 | 375 / 768 / 1280，读 `documentElement.scrollWidth`、screen、卡片、弹窗的溢出与"立即采集/保存"是否在视口内 | 全部 0 溢出；小屏主操作与保存按钮均可达 |
| 交互状态 | Tab `N+3` 次 + Shift+Tab 双向；`tbody tr:hover` 规则；`aria-modal`；`aria-invalid`+`aria-describedby` | 全部通过 |
| 破坏性操作 | 真实点「删除」→ 看确认弹窗 → 点取消 → 比对方案数 | 未确认前数据未变、取消后未删 |
| 工程 | `typecheck` / `build` / `verify` / `npm test` | 干净 / 通过 / 19-19 / **485 通过 0 失败** |

> **这一轮没有新增单测**：改动集中在视觉与交互状态，而项目**没有组件测试基建**
> （引入 React Testing Library 会违反 C5 零新增运行时依赖）。所以证据来自上面的
> 真实浏览器审计 —— 这也正是质量门槛 §7 对视觉任务建议的方式（"视觉任务建议补充浏览器
> 截图或手动视口检查"）。纯函数部分（时间转换、条件标签、错误人话）已在前两轮覆盖。

> **`commercial-ui-ux` 技能本体加载失败**：`skill` 工具报
> `loaded skill "commercial-ui-ux" source must be a string`，可复现。
> 原因是该插件的 `index.js` 向 `ctx.skills.register({...})` 传的是 **`content`** 字段，
> 而宿主读取的是 **`source`**（两者字段名不一致）。
> 本轮改为**直接读包内原文**（`<profile>/node_modules/dsh-commercial-ui-ux/skills/commercial-ui-ux/`）：
> `SKILL.md`、`docs/01-commercial-ui-ux-rules.md`、`docs/03-design-constitution.md`、
> `docs/06-quality-gates.md`。这是宿主/插件契约不一致的问题，不在本仓库范围内，
> 但**如实记下来**以免下一个人以为读的是缓存或猜测。

### 真实实例验收（2026-09-17）

离线闸门（`DSH_JOB_HUNTER_NO_NETWORK=1`）+ `--profile p5test --port 4399`，**不碰招聘站**：

| 脚本 | 结果 |
|---|---|
| `jh-p9-verify.mjs`（本次新增，**74/74 通过**） | 直接打真实 HTTP 接口：A1 本地时间/抖动/时区、SR-1 触发点落在窗口内、SR-7 attempt/success 拆分、SR-17 原因枚举、SR-32 拒绝单点时刻、SR-39/41/42/43/45 校验、SR-30 暂停与恢复、F1 两个口径 + 拒绝乱写的口径、F2 基准来源声明、F3 禁止显著性 |
| `jh-e2e.mjs`（基线，**总体通过**） | 断言数从 31 → **34**（见下面的"期望搬走"说明） |
| `jh-p8-e2e.mjs`（**总体通过**，28 条） | 顺带修掉脚本自己的一个老 bug：它等的是 `.jh-drawer`，而岗位库的详情一直是**右侧内嵌栏**（抽屉只服务流水线/消息/面试）—— 于是这条**一直在超时**，P8 的 27 条断言其实早就全过。现在改成等 `.jh-detail-pane`，这条验证才真的在验东西 |
| `jh-jobs-ui.mjs` / `jh-resume-ui.mjs` / `jh-resume-quick.mjs` | 全部 `pageErrors: []` |
| `jh-collect-ui.mjs`（可用性修复） | **27/27 通过**（含"没有任何 `**` 标记被原样显示"、"没有源码 JSON"、"没有裸堆栈"、"数值列右对齐（读计算样式）"、"置灰按钮都有悬浮解释"、"接管按钮在对方活着时置灰并解释"、"点击胶囊打开排查弹窗"） |
| `jh-uiux-audit.mjs`（commercial-ui-ux 质量门槛） | **0 findings**：§5 响应式三档无溢出；§6 对比度/焦点/label/不只靠颜色；§4 Table row hover / Modal focus trap 双向；§2 字段错误关联 / 破坏性操作硬闸门 |
| `jh-contrast.mjs`（对比度专项） | 枚举三处界面共 **151 种文字样式，0 处不合格** |
| `jh-responsive.mjs`（响应式专项） | 375/768/1280 均 0 横向溢出；小屏「立即采集」与弹窗「保存」都在视口内；截图 `jh-uiux-{mobile,tablet,desktop}.png` |
| `jh-collect-ui2.mjs`（界面评审第二轮） | **39/39 通过**（重复提示只出现 1 次、表格里 0 个 `<pre>`、弹窗 `role=dialog` + Esc 可关、时间是**两个** `type=time`、分段标签 7 个且 `aria-pressed` 正确、点"周末"只剩周日与周六、`?` 释义 9 个、长句不再直铺、"检查是否重复"在方案名同行、卡片有边框+阴影、主/次/危险按钮计算样式不同、输入框白底+1px 边框+聚焦光环、保存/取消在 footer） |

> **期望搬走 ≠ 放松断言**（§5 的纪律）。「定时抓取」与「平台与登录」两块按 D6 迁到了 U9 采集页，
> 所以 `jh-e2e.mjs` 里那两条详细断言**搬到采集页继续验**，并且**加严**：
> 今日屏改为断言减负后该有的那几样（新鲜度 / 立即采集 / 去配置 / 健康一行只读），
> 采集页新增"为什么没跑"（SR-17/26）、一键暂停、方案配置三条。
> 验收脚本不在仓库里（绑了本机 profile 与 playwright 位置），所以这些改动记在这里。

> **验收脚本抓到的一条边界**：本机桌面宿主通常**已经持有租约**，于是 `p5test` 实例是只读的 ——
> 这时它**不应该**武装任何定时器（两个调度器同时抓取正是 R20 要防的）。
> 所以"恢复定时后 armed=true"这条断言必须按 `readOnly` 分流，否则会把**正确行为**判成失败。

---

## P10 多平台治理粒度（2026-09-18）

多平台之后暴露出的第一类问题不是"平台不够多"，而是**判定、风控、退避、留痕四样东西
挂错了层**：一个方案往往只有 1 个平台时，挂在方案上与挂在平台上没有区别；
平台数上来之后两者会分叉。本批把这四样搬到平台级。

### 改了什么

| # | 改动 | 位置 |
|---|---|---|
| ① | **跳过判定不再连坐**：`decide()` 产出逐平台结论，只要还有一个平台能跑就跑；一个都跑不了才跳过 | [scheduler/index.ts](file:///d:/DSH-work/job-hunter/src/host/scheduler/index.ts) |
| ② | **逐平台留痕**：新增 `PlanScheduleStatusDto.platformDecisions`；采集页逐平台展示"为什么没跑" | `shared/dto.ts`、`client/screens/collect.tsx` |
| ③ | **平台冷却用自己的账**：`recordPlatformFailure` 改吃 `platform.fail_streak`，不再是 `plan.failStreak` | `scheduler/index.ts` |
| ④ | **风控暂停下移到平台级**：新模块 `platform/risk-pause.ts`（存 `setting(scope='platform')`，无 schema 迁移）；方案级 `riskPaused` 改为派生值 | `platform/risk-pause.ts`、`runtime.platformGate` |
| ⑤ | **逐平台记账**：`finishPlanRun` 改吃「逐平台结果数组」，修掉"风控信号被最后一个成功平台覆盖"；"任一失败即整轮失败"改为"**有平台成功即本轮成功**" | `scheduler/index.ts` |
| ⑥ | **恢复按平台**：`resumeRisk` 按平台清暂停 + 复位 `fail_streak` 与健康态；另有一次性搬运把旧库的方案级 `risk_paused` 落到各平台 | `scheduler/index.ts` |

### 三条不能忘的语义

1. **`risk_paused` 只表达"平台认出你了"**（`BLOCKED` / `NOT_LOGGED_IN` / `RATE_LIMITED` /
   `PLATFORM_QUOTA`）。「连续失败达阈值」由已有的平台 `health=broken` + `adapter_broken` 承担 ——
   两者阈值都是 3，再叠一层会对同一个事件产生**两条 urgent 待办**和两个重叠的跳过状态。
   `RISK_PAUSE_THRESHOLD` 常量已删除（被 `ADAPTER_FAIL_THRESHOLD` 覆盖）。
2. **`backoffMsFor` 的入参必须是"该层自己的"失败次数**：平台冷却传 `platform.fail_streak`，
   方案退避传 `plan.fail_streak`。混用会让一层的失败替另一层受罚。
3. **`platformGate` 的顺序**：离线 → 平台级风控暂停 → 适配器健康 → 登录态 → 冷却 → 配额。
   风控暂停排在最前，是为了保持迁移前的可见行为（旧实现里方案级 `riskPaused` 也先于平台 gate）。

### 出口标准怎么验的

- **单测 674 个（673 通过 / 1 跳过）**（P8 时 408）。本批新增 4 条：
  `test/host/risk-pause.test.ts` 三条（平台级写读清且不牵连别的平台、方案级派生口径、裸 `true` 兼容）
  + 一条端到端（经真实 `runtime`：置暂停 → `schedulerStatus().planStatus[].riskPaused === true`
  → `runPlan` 抛 CONFLICT → `resumeRisk` 后归假）。
- **重写的断言**（改需求落点，**未放松**）：
  * SR-18 那条用例原来**标题写"其它平台照常跑"、断言写 `runs.length === 0`（整条跳过）**，
    名字与断言方向相反 —— 需求因此被标成 ✅ 而实际行为相反（记进 §12 的 R24）。
    现在断言 `runs` 恰好含 `['other']`，并逐平台核对 51job 是 `not_logged_in`。
  * SR-21 从"方案级 `risk_paused`"改为断言**平台级** `failStreak=3` / `health=broken` /
    `adapter-broken` urgent 待办 / 被 `adapter_broken` 拦住。
  * SR-22 从方案级字段改为断言**平台级**暂停（`readPlatformRiskPause`）+ 方案级派生值，
    并新增一条"甲平台命中风控、乙平台成功时风控信号不被吞掉"。
- **`npm run typecheck` / `npm run build` / `npm run verify`（19/19）/ `npm test` 全绿。**

> **测试替身也要跟着改**：`test/scheduler/dispatch.test.ts` 的抓取替身现在**承担记账职责**
> （按返回的 summary 状态调 `recordRunFailure` / `recordRunSuccess`），并把方案用到的平台
> `ensure` 进 `platform` 表 —— 否则 `platform.fail_streak` 永远是 0，
> 而调度器现在正是按"平台自己的账"定档的，断言会变成空转。

---

## P11 适配器契约三轴（2026-09-18）

多平台的第二个问题：**契约里两个字段互相矛盾，而调用方只能绕开它**。
`51job` 声明 `capabilities.supportsGreeting: true`，而 `actions` 压根是 `undefined` ——
任何读 `capabilities` 去渲染"打招呼"按钮的地方都会渲染出一个点了就失败的按钮。

### 拆成三个互不替代的轴

| 轴 | 回答的问题 | 怎么得到 |
|---|---|---|
| `capabilities` | 这个**平台**有什么能力 | 手写（平台事实） |
| `implementation` | **我们**实现到哪一步 | **派生**（`adapterImplementationOf`）—— 手写必然漂移 |
| `maturity` + `authRequirement` | 验证到什么程度 / 哪个环节要登录 | 手写，但**统一登记在一张表** |

第三条是这次的重点：成熟度与登录需求是**人对平台的认知**，最怕的不是写错而是**散**。
所以集中到 [platform-facts.ts](file:///d:/DSH-work/job-hunter/src/host/platform/platform-facts.ts)：

```
stable（真实夹具 + 真机冒烟）      51job · zhaopin · liepin
calibrated（探针/夹具验证，有缺口） zhipin · waiqi · sinojobs · hiredchina
experimental（未验证/关键契约未证）  lagou · guopin
disabled（平台侧已不可用）          indeed（cn.indeed.com 停运）
```

**填表纪律**：`unknown` 是合法且更诚实的取值（"我们不知道它要不要登录"本身就是用户该知道的信息）；
`verifiedAt` 只在真有真机验证记录时填；`experimental`/`disabled` 必须写清缺口原因。

### 顺带修掉的一个真实缺陷

`auth` 的注释原本写着"不声明 auth 的适配器表示**不需要登录**"，
而 `liepin` / `zhipin` / `guopin` / `indeed` / `hiredchina` **都没有声明 `auth`** ——
其中 `liepin` 的搜索接口、`zhipin` 的详情页（`securityId`）其实**需要**登录。
后果：`platformGate` 的登录检查对这 5 个平台**永远不会触发**，
一个被登录墙挡住的平台会安静地返回 0 条，而界面显示"采集完成"。

现在这两件事分开表达：**「没实现检测」看 `auth` 有没有，「不需要登录」看 `authRequirement`**。
采集页对"需要登录但本机没有检测"的平台直接给出提示。

### `actions` 的形状在实现之前就定死

10 个平台的 `actions` 目前全是 fail-closed（`ADAPTER_FAIL_BROKEN`）。
这是在**实现前**定形状的唯一时机 —— 否则 10 个平台会各写一套返回结构，上层要写 10 个分支。
关键改动是 `sayHello` / `sendResume` 返回 `ActionResult` 而不是 `{ ok: boolean }`：

```ts
interface ActionResult {
  ok: boolean
  delivery: 'delivered' | 'pending' | 'failed' | 'missing'   // ← 关键
  evidence: 'dom' | 'inline-state' | 'none'
  idempotentHit?: boolean
  message?: string
}
```

`ok` 只说明"动作没抛错"，**"消息是否真的进了对方会话"必须单独表达** ——
发不出去的招呼语与发出去的，后续处理完全不同（重试 vs 不重试、是否记接触态）。
同时补上 `readInbox` / `detectStage`（文档承诺过、类型里一直没有）。

### 出口标准怎么验的

- **单测 679 个（678 通过 / 1 跳过）**（P10 时 674）。新增 5 条，见
  [facts.test.ts](file:///d:/DSH-work/job-hunter/test/platform/facts.test.ts)：
  ① 每个注册平台都必须登记事实行（**不允许靠默认兜底混过去**）；
  ② 成熟度可核查（`stable` 必须有验证日期、日期必须 `YYYY-MM-DD`、`experimental`/`disabled` 必须写清原因）；
  ③ `implementation` 由实现派生（合成适配器逐字段验真/假两支）；
  ④ `capabilities` 与 `implementation` **允许不一致但必须都可见**——
     并把它写成一条**会在实现 sayHello 时主动失败并告诉你怎么改**的绊线；
  ⑤ 登录需求自洽（实现了登录检测却把全部环节标 `unknown` → 不自洽）。
- **界面**：采集页平台列表新增成熟度提示、以及"平台支持但尚未实现"的清单。
- **typecheck / build / verify 19/19 / test 全绿。**

> **我自己写错并被测试抓住的一条**：最初写的是"`disabled` 的平台不该声明需要登录" ——
> 而 `indeed` 正是"平台停用 + 若要投递则需登录"，两者并不矛盾。
> 断言跑红了才想清楚：真正该验的自洽性是**登录需求与登录检测实现之间**的关系，不是与成熟度的关系。

---

## P12 多平台校验与提示通道（2026-09-18）

批次 3 的**校验侧**。数据模型侧（每平台独立条件/开关）未做，见本节末尾。

### 为什么先做这个：0 条与 0 条长得一样

多平台最伤人的失败形态不是报错，而是**平台安静地返回 0 条**：

* 勾了国聘，却选了它城市表里没有的城市 → 它一定返回空；
* 勾了 indeed，而它的大陆站已经停运 → 抓完 0 条，界面显示"采集完成"；
* 方案设了 5 页，而 waiqi 服务端翻页是坏的、最多 1 页 → 只抓了 1 页。

这三种情况从数据里**根本查不出来**（"今天没岗位"和"平台坏了"的 `crawl_run` 长得一样）。
但**报错又太严**：用户没法在一个方案里同时选能力不同的平台 ——
`workExp` 只有神仙外企认识，为它报错等于禁止多平台。

所以加了第三条通道：**`notices`（提示，不阻断保存）**，与已有的 `duplicates` 同一族。

### 提示的四种来源（`domain/plan-config.ts`）

| 情况 | 提示 |
|---|---|
| 平台未校准 / 已停用 | 「拉勾（lagou）实验（未验证或部分未实现，可能返回空）—— …」 |
| 抓取是否需要登录**未验证**、且本机没有登录态检测 | 「…未登录时可能静默抓到空结果」 |
| 方案 `maxPages` 超过某平台上限 | 「waiqi 最多 1 页，本方案设的 5 页对它无效（实际只抓 1 页）」 |
| 城市不在该平台的城市表里 | 「…不认识城市「成都」—— 它会返回空结果，建议去掉这个平台或换成它支持的城市」 |

### 三条入口都要看得见

- **GUI**：方案编辑器里**实时**显示（防抖 600ms），保存后也保留；有提示时**不自动关窗**
  （关掉就等于把提示一起关掉了）。
- **模型工具**：`job_plan_manage` 的创建回执里逐条转述。
- **HTTP**：`POST /plans`、`PATCH /plans/:id`、`POST /plans/:id/validate` 都带 `notices`。

顺带补了一个洞：**新建方案现在也能校验**（新增 `POST /plans/validate`，不需要 id）。
在这之前，"与谁重复"只有已存在的方案才查得到 —— 而新建时恰恰最需要。

### 出口标准怎么验的

- **单测 683 个（682 通过 / 1 跳过）**（P11 时 679）。新增 4 条，
  见 [plans.test.ts](file:///d:/DSH-work/job-hunter/test/domain/plans.test.ts)：
  ① 未校准/停用平台给出提示**且仍然保存成功**（提示 ≠ 拒绝）；
  ② 城市不一致提示（用例**运行时探测**两个平台城市表的差集，两个方向都试，
     不把断言绑死在某一版城市表上）；
  ③ `maxPages` 被平台上限截断的提示；
  ④ **反面用例**：单平台 + 城市支持 + 深度在限内 → `notices` 必须为空
     （否则用户会学会忽略提示，等于没有提示）。
- **typecheck / build / verify 19/19 / test 全绿。**

### 明确未做（下一批）

* **跨平台城市目录**（单一来源 + 每平台码表 + 覆盖度）：城市码仍散在 6 个适配器里、
  3 个平台是空表。本次靠"提示"兜住，没有建目录。
  （每平台独立条件/深度/开关**已在 P13 补上**。）

---

## P13 每平台覆盖项（2026-09-18）

批次 3 的**数据模型侧**。P12 只把"不一致会伤人"**说出来**了，这一批让它**表达得出来**。

### 方案级表达不了的两件事

1. **临时停掉一个平台**：以前只能把它从 `platforms` 里删掉 —— 于是丢了"这个方案本来
   就包含它"的意图，重复方案的判定也跟着变（改回来时又得重新配）。
2. **每平台各自的抓取深度**：`maxPages` 是方案级单值，而平台真实上限差得很远
   （waiqi 服务端翻页坏 → 1 页，zhaopin → 10 页）。"方案设 5 页"在 waiqi 上被
   **静默截断**成 1 页 —— 用户以为自己抓了 5 页。

### 形状：为什么是"稀疏的覆盖表"，而不是把 `platforms` 变成对象数组

```ts
// 不变：集合与顺序（多处按它遍历）
platforms: string[]
// 新增：按 id 查的稀疏表，只含**用户真的改过**的平台
platformOverrides: { [platformId]: { enabled: boolean; maxPages: number | null } }
```

两条都是刻意的：

* `platforms` 是**集合与顺序**，覆盖项是**按 id 查的稀疏表**。混成一个对象数组会让
  每处遍历都多一层解包，收益只是"少一列"；
* **稀疏**（等于默认的条目不落库）让"什么都没配"的方案在库里与升级前**形状完全一致** ——
  升级安全，回滚也安全。

### 三条入口 + UI 都对等

* **UI**：方案编辑器里多了一行「每个平台」—— 勾掉 = 不抓它，填页数 = 只对它生效；
* **HTTP**：`POST/PATCH /plans` 接受 `platformOverrides`（整份替换，与 `criteria` 一致：
  稀疏存储下"删掉某平台的覆盖"必须能表达得出来）；
* **模型工具**：`job_plan_manage` 同名参数，原样透传 —— 收敛与校验都只发生在
  `planService.validate` 一处（SR-45）。

### 校验（都在 `plan-config.ts`，三条入口共用）

| 情况 | 结果 |
|---|---|
| 覆盖项里的平台不在方案的 `platforms` 里 | **报错** —— 留着它会在"某天把该平台加回方案"时静默生效 |
| 所有平台都被停用 | **报错** —— 那种方案永远不会抓任何东西 |
| 某平台的 `maxPages` 超过**它自己的**上限 | **报错**（附该平台上限）—— 不再静默截断 |
| 平台被移出方案 | 它的覆盖项**一起消失**（读取侧与写入侧各收敛一次） |

顺带修正两处行为：

* 提示（`notices`）只对**启用中**的平台生成 —— 用户刚把某个平台关掉，还继续提示就是噪音；
* `job_plan_manage` 里"方案下的平台都处于风控暂停"的判断、`resumeRisk` 清理的范围，
  现在都只覆盖**启用中**的平台（停用的平台不需要被"恢复"，它本来就不跑）。

### 出口标准怎么验的

- **单测 690 个（689 通过 / 1 跳过）**（P12 时 683）。新增 7 条：
  * `plans.test.ts` 5 条 —— 稀疏性（显式给默认值 → 库里没有该条目）、越界覆盖报错、
    全停用报错、**每平台页数按该平台上限校验**（含"限内通过"的正例）、
    平台移出后覆盖项一起消失；
  * `dispatch.test.ts` 2 条 —— **被停用的平台真的不跑**（定时与手动都不跑，
    且它不出现在逐平台判定里）、每平台页数覆盖只进到**该平台**的条件里。
- **typecheck / build / verify 19/19 / test 全绿。**

### 实施中撞到并修掉的一个真实张力

`PlanService.update` 会把**现有的**覆盖项一起合并进校验输入。于是"把某个平台移出方案"
会被"覆盖项越界"的严格校验拦住 —— 而那不是用户的错（覆盖项是系统自己带过来的）。
修法是**在合并处按新的平台集合先收敛一次**，而不是放宽校验：
越界检查仍然对直接的 API 调用生效（有断言钉住），而"移出即清理"也成立（也有断言钉住）。
两条规则都需要，冲突只在合并那一层。

### 仍未做

* **每平台各自的筛选条件**（如"51job 搜 Java、waiqi 搜 外企 Java"）：`criteria` 仍是全方案共享一份。
  目前跨平台能力差异的处置方式是"停用该平台"或改用共享条件 —— 由 P12 的提示引导。
* **跨平台城市目录**：见 P12 末节。

---

## P14 量级基线告警（2026-09-18）

批次 5 的第一项。补的是**逐字段健康回答不了**的一类故障。

### 它补的是哪个洞

现有的两层健康各自只能发现一类问题：

| 机制 | 能发现 | 发现不了 |
|---|---|---|
| `adapter_field_health` | 某个字段**整页**解析不出来 | 字段都好好的、条目数掉了一个数量级 |
| `NO_RECORDS`（`suspicious`） | 整轮 **0 条** | `found=2` 而平时是 20 |

漏掉的那一类长这样：**选择器仍然匹配、每个字段都解析得出、`quarantined=0`、
`state='ok'`** —— 懒加载没触发、翻页静默失效、卡片容器只匹配到一部分。
这种轮次在 `crawl_run` 里**和正常轮次长得一模一样**，所以必须跟这个平台**自己的历史**比。

### 规则（`platform/yield-baseline.ts`）

* 基线 = 该平台最近 30 轮里**只取 `state='ok'`** 的 `found` 的**中位数**；
  * 只取 `ok`：`partial`（含隔离/暂停）与 `failed` 的条数本来就不代表平台给多少，
    混进来会把基线压低 —— **于是越坏越不告警**，正好反过来；
  * 中位数而非均值：某天放量到 200 条不该把之后正常的 20 条都判成骤降；
* **本轮自己被排除**在基线之外（真实调用序是 `finish()` 之后才判定，
  把掉量的那一轮算进去会自己拉低标准）；
* 阈值：样本 ≥ 5 轮、基线 ≥ 5 条、且 `found < 基线 × 0.3` 才告警。
  松是有意的 —— 这条告警的价值在于**不漏**，代价是偶尔误报；
* **0 条也算掉量**：它带着"平时是 20 条"这个上下文，而那正是用户需要的。

### 出口

* `yield-drop`（新增待办类型，`warn` 级）—— **恢复即自动关闭**（挂着不清的告警
  会被用户学会无视，比没有更糟）；
* `GET /platforms` 的 `yield` 字段 + 采集页平台行：常态 **20** 条 / 最近一轮 **2** 条，
  骤降时变警示色并提示"字段健康可能是全绿的，先查翻页与懒加载"；
* 日志 `[crawl] <platform> 量级骤降：…`。

### 出口标准怎么验的

- **单测 700 个（699 通过 / 1 跳过）**（P13 时 690）。新增 10 条：
  * `yield-baseline.test.ts` 9 条 —— 中位数（空数组 → `null`、偶数取中、**不改动入参**）、
    样本不足给 `null` 而不是猜 0、基线太小不下结论、**边界（正好三成）不告警**、
    0 条也算骤降、`warning` 待办产生与**恢复即关闭**、基线只取 `ok` 轮次、本轮被排除
    （断言 `samples`）、只读快照不产生待办；
  * `crawl.test.ts` 1 条**走真实 `runCrawl` 主链**：5 轮常态（真实夹具）→ 一轮空结果 →
    产生 `yield-drop` → 回到常态自动关闭。
- **typecheck / build / verify 19/19 / test 全绿。**

### 顺带修掉的一处代码里的谎

`domain/crawl.ts` 的去重段还写着"目前只有 51job 一个适配器，所以这里实际上是空转" ——
现在注册了 10 个平台，这句话会让人以为去重不必细看。已改写为它**实际**的性质，
并指向下面这个已知缺口。

### 仍未做

* **跨平台去重的门槛**（记在 ARCHITECTURE 的 R25）：薪资档硬相等会被"空薪资"
  击穿（BOSS 未登录时薪资为空 → 与 51job 的同岗位永远合不上）；
  城市硬相等会被"市 vs 市·区"击穿。批次 4 处理。
* 批次 5 的其余项：单轮预算 + 到点中止、平台按新鲜度排序、per-platform 日上限、
  平台总览矩阵屏。

---

## P15 去重门槛修正与"疑似"出口（2026-09-18）

批次 4。修的是 R25 记下的两处**静默少合并**。

### 两处 bug：把"缺值"当成了"不同"

| 键 | 旧行为 | 后果 |
|---|---|---|
| 薪资 | 一侧 `salaryMin` 为空时桶是 `'unknown'`，被当成**一个普通档位**去比 | BOSS 未登录时薪资为空 → 它与 51job 上的**同一个岗位永远不会合并**；等于要求"有薪资的那边必须是空" |
| 城市 | `city` 原样比较 | BOSS 卡片给「深圳·福田区」、别的平台给「深圳」→ 判成两个城市 |

修法：`UNKNOWN_SALARY_BUCKET` 做**哨兵**（不等于任何真实档位），**只在两边都锚定时**才作门槛；
城市比较前 `normalizeCityForDedupe` **归一到市级**（拆 `· - — | / 、` 等分隔符、去尾部「市」）。
依据文本里会写明"**薪资未锚定（一侧为空，此项未作门槛）**" —— 否则事后复盘会以为它比过了。

### 新增"疑似"出口

标题 bigram 相似度：

| 区间 | 行为 |
|---|---|
| ≥ 0.9 | **合并** |
| **[0.75, 0.9)** | **不合并**，但报 `candidate: true` + 指向疑似对象 + 人话依据 |
| < 0.75 | 不提（否则这个出口会变成噪音，用户会学会忽略它） |

不自动合并是对的（宁可漏、不可错：合并后投递记录会串）。但**"没合并"这件事本身必须能被看见** ——
否则用户永远不知道自己少了几个合并，也无从纠正。合并与疑似同时存在时**合并优先**。

出口：`applyDedup` 的返回值 + 抓取汇总里的「疑似重复待确认 N 条」+ 日志。

### ⚠️ 这一批最值得记的一件事

改完两处门槛后跑测试：**705 条，一条都没红。**

那不是"改对了"，而是**这两个 bug 此前完全没有测试覆盖** —— 也正解释了它们为什么能一直静默存在：
"少了一个结果"在测试与数据里都不可见。于是补了 **5 条会红的断言**：
`normalizeCityForDedupe` 的六种输入、`UNKNOWN_SALARY_BUCKET` 不等于任何真实档位、
**一侧未锚定必须能合并**、**两侧锚定且档不同仍不合并**（放宽不能伤到原规则）、
疑似区间与"太远不提"、以及 `applyDedup` 的合并优先。

这条已写进 `OPTIMIZATION-PLAN.md` 的纪律表：**改的是"静默少一个结果"这类行为时，
"全绿"不构成证据，必须自己补一条会红的断言再确认它变绿。**

### 出口标准怎么验的

- **单测 705 个（704 通过 / 1 跳过）**（P14 时 700）。新增 5 条，见
  [util/dedupe.test.ts](file:///d:/DSH-work/job-hunter/test/util/dedupe.test.ts) 与
  [domain/dedupe.test.ts](file:///d:/DSH-work/job-hunter/test/domain/dedupe.test.ts)。
- **typecheck / build / verify 19/19 / test 全绿。**

### 仍未做

* **疑似候选没有持久化队列与确认界面**（目前只进日志与抓取汇总）——
  ARCHITECTURE §4.10.1 里"级 5 待人工确认分组"这条设计仍待真正落地；
* 批次 4 的另两项：**去重可独立触发**（现在只在单次抓取的后处理里跑）、
  **岗位列表按组折叠 + 跨平台对照**。

---

## P16 调度公平与两层额度（2026-09-18）

批次 5 的两项（该批其余项见文末"仍未做"）。

### ① 平台按**新鲜度**排（修"尾部平台饿死"）

`decide()` 与 `runPlan()` 现在按 `platform.last_ok_at` **升序**决定执行顺序
（从没成功过的最优先），并列时保持方案里的原顺序（`sort` 稳定）。

为什么必须改：窗口与每日预算是有限的，而固定按方案数组的顺序跑，会让
**数组靠前的平台永远跑得完、靠后的平台系统性跑不到**。用户看不出这是 bug ——
他只会觉得"拉勾怎么老没数据"，而在数据里那几次确实"没跑过"，
因为压根没写 `crawl_run`（跳过的留痕本就不落这张表）。

> 注意：这个顺序只影响**执行**。`planStatus.platformDecisions` 仍按方案里的顺序
> 返回 —— 界面列表不该因为"上次成功时间"而跳动。

### ② 两层额度取较小者（防踩平台红线）

`guard` 的每日额度原本只有用户自己的一层（`dailyLimits`），
于是用户把打招呼额度调到 200 时，系统会**照着 200 去发** —— 而 BOSS 的平台侧
日上限约 150（`ADAPTERS.md §7.2` 的实测事实）。

现在：`min(用户额度, 平台侧上限)`，其中平台侧上限进 `platform-facts.ts`：

```ts
zhipin:  dailyCaps: { greeting: 150 }   // 打招呼日上限约 150
zhaopin: dailyCaps: { application: 100 } // 投递上限约 100
```

两条纪律：
* **`undefined` = 不知道，就不设限**。不知道就编一个保守值，会平白拦掉合法使用，
  而"少投几个"与"被平台盯上"的代价都由用户承担，不该由我们猜；
* 拒绝理由必须说清是**哪一层**限住的 —— 否则用户会去改自己的额度，白改一场
  （被平台侧限住时提示直接写明"改自己的额度没有用"）。

### 出口标准怎么验的

- **单测 709 个（708 通过 / 1 跳过）**（P15 时 705）。新增 4 条：
  * `dispatch.test.ts` 2 条 —— 最久没成功过的平台排到前面（用
    `platform.recordSuccess` 造出一个"刚成功过"的平台）；**都没成功过时保持原顺序**
    （证明 `sort` 稳定，排序不会让可预期的行为变成不可预期）；
  * `guard.test.ts` 2 条 —— 平台侧上限兜住用户额度（发满 150 次后第 151 次被拒，
    **且理由点名"平台侧上限 150"**）、用户额度更小时理由指向用户自己
    （避免把自家限制说成平台的）。
- **typecheck / build / verify 19/19 / test 全绿。**

### 仍未做（本轮到此为止）

| 项 | 为什么还没做 |
|---|---|
| 批次 5 · **单轮预算 + 到点中止** | **已在 P18 完成**（跳过原因最终叫 `round_budget` —— 不是这里先写的 `budget_exhausted`：它与 `quota_reached` 必须是两个键，前者是"这一轮到此为止"，后者是"今天别来了"） |
| 批次 5 · 平台总览矩阵屏 | **已在 P18 完成**（`/platforms` 新增 `governance`，采集页多一张矩阵；原来的平台列表改称「平台明细」） |
| 批次 4 · **去重可独立触发** | 要把它从"抓取后处理"抽成可单独跑的全库任务（跨方案） |
| 批次 4 · 岗位列表按组折叠 + 跨平台对照 | 纯 UI |
| 批次 6 · 抽取共享判墙信号表 / 共享构造样板 | 已在 P17 完成（判墙表 10/10；构造样板 `mergeAdapterConfig` 只迁移了 `51job`，其余 9 个仍内联） |
| 批次 3 · 跨平台城市目录 | 数据密集（6 份私有码表 + 3 个空表），且需单一来源 |

---

## P17 判墙信号表（2026-09-18，批次 6 的第一半）

### 它要消灭的是什么

10 个适配器各自重写了一遍同一套判墙判据：验证码选择器、限流文案、配额文案、
登录墙判据、`blank` 阈值。**这已经从"风格问题"变成"正确性问题"**：
`quota-exhausted` 在 indeed / guopin 上缺失、`login-required` 在 liepin / indeed
上故意不判 —— 这些遗漏散在 10 份独立实现里，没人能一眼看出谁漏了什么。

### 形状：数据 + **自包含**函数

关键约束来自 `page.evaluate(fn, arg)` 会**序列化函数源码** —— 页面里没有这个模块，
函数体里任何"引用本模块的东西"都会变成 `X is not defined`。所以：

* [block-signals.ts](file:///d:/DSH-work/job-hunter/src/host/platform/block-signals.ts)
  导出 `COMMON_SIGNALS`（通用词表）、`signalsOf(extra)`（**并集**：通用 ∪ 平台特有）、
  `detectBlockWithSignals(arg)`（**只引用 `arg`**）；
* 平台特有的东西（indeed 的 host 校验、sinojobs 的卡片数、waiqi 的载荷错误码、
  BOSS 的滑块页 URL）**不塞进来** —— 它们留在自己的适配器里，只把通用那一半领走。

判断顺序固定：**URL 特征 → 验证码 DOM → 限流 → 配额 → 登录墙 → blank**。
`blank` 放最后，因为它是**最弱**判据 —— 还没渲染完的正常页面也长这样。

### 为什么"并集"而不是"平台整份覆盖"

平台特有文案是**额外的证据**，不是"换一套判据"。覆盖式很容易在某次改动里
把通用词表悄悄丢掉 —— 而那正是这个模块要消灭的那类问题（有断言钉住）。

### 已经迁移 / 还没迁移（**如实记账**）

| 状态 | 适配器 |
|---|---|
**迁移完成（10/10）**，两条路线各归其位：

| 路线 | 适配器 | 它们各自多带的东西 |
|---|---|---|
| **共享函数**<br>（`detectBlockWithSignals`） | `zhipin` · `51job` · `liepin` · `indeed` · `lagou` · `guopin` · `hiredchina` | zhipin：滑块页 URL<br>51job：阿里云 WAF 选择器 + **宽口径**登录墙 + `blank` 80<br>liepin：极验容器 + `about:` 销毁页 + **刻意不判**登录墙<br>indeed：Cloudflare DOM + 验证码文案 + `expectedHost` + 不判登录墙<br>lagou：WAF 滑块 URL + 滑块文案 + 登录表单用词<br>guopin：几条 WAF 选择器<br>hiredchina：Cloudflare 挑战 + **英文**登录词 |
| **共享词表、自有结构** | `zhaopin` · `sinojobs` · `waiqi` | zhaopin：`__INITIAL_STATE__.positionList` 载荷探针 + `noJobTip` 组合判据<br>sinojobs：`.xcConfirm` 弹窗 + 登录字样<br>waiqi：载荷码 `1022` → 登录墙 / `429` → 限流 |

三个 `blankTextLength: 80` 的例外（`51job` · `zhaopin` · `sinojobs` · `waiqi`）都是**保留原语义**：
它们"搜到 0 条"的结果页也有一两百字筛选器文案，用通用的 120 会把那种页面误判成空白。

### 迁移的两条流程纪律（血换来的）

1. **不能机械替换，要逐条比对自己的判据与通用词表**。10 个适配器一共挖出 9 处隐性差异
   （宽口径登录墙、`blank` 阈值 80、"刻意不判"、"声明了但从未使用"的参数……），
   **全都没有任何测试会红** —— 与 P15 那个"改完全绿其实是没覆盖"是同一类陷阱。
2. **删导出前先 grep `test/tools/probe-*.ts`**。`probe-guopin.ts` 直接 import 了
   `detectBlockInPage`，删掉后 typecheck 才暴露 —— 工具链也是调用方。

### `zhaopin`：共享词表、自有结构（一条新路线）

它除了通用判据，还有一段**载荷探针**（配平 `__INITIAL_STATE__.positionList` 数组、
看里面有没有真岗位，用来识别"AB 分流丢到老 `/jobs` 掩码页"——**有真数据就不算撞墙**），
以及"登录之后再搜索"这类它独有的静默失败文案。

把它塞进 `detectBlockWithSignals` 需要给那个共享函数加"平台自定义探针"的钩子，
结果就是它长出一堆平台分支。所以走另一条路：**共享词表、自有结构** ——
`detectBlockInPage` 仍是智联自己的，但从 `arg.signals` 里取通用的
验证码选择器 / 限流 / 配额 / `blank` 阈值，只声明自己多的那几条。

两条路线的分工因此是清楚的：

| 路线 | 什么时候用 |
|---|---|
| **共享函数**（`detectBlockWithSignals`） | 判断流程与通用流程一致，只差几个词/选择器/开关（zhipin / 51job / liepin / indeed） |
| **共享词表、自有结构** | 流程本身不同（有载荷探针、多段组合判据）——只领词表，不领流程（zhaopin） |

**`hiredchina` 的一个额外发现**：它的 `detectBlockInPage` arg 里声明了 `cardBox`，
但**函数体从未用过它**（只 `querySelectorAll(arg.card)`）。迁移时**刻意没把它传给共享函数** ——
共享函数在"卡片数为 0"时会拿 `cardBox` 兜底再数一次，传进去就会少判 `blank`。
**声明了但没用的参数，迁移时最容易被"顺手补上"**，那正是最隐蔽的行为改变。

**每迁移一个都要逐条比对，不能机械替换** —— 上面三个各挖出了不同的隐性差异：

| 挖出的差异 | 如果不显式带上会怎样 |
|---|---|
| 51job 的登录墙用**宽口径**词（`登录\|注册\|扫码`），通用表是几个完整短语 | 判不出墙 → `isLoggedIn` 靠 `block !== 'login-required'` 反推 → 报告"**已登录**" → 安静抓到 0 条 |
| 51job 的 `blank` 阈值是 **80**，通用是 120 | "搜到 0 条"（页面有一两百字筛选器文案）被误判成"页面空白" |
| 猎聘**故意不判**登录墙（无实测证据） | 通用表会替它猜，把"搜到 0 条"误报成"需要登录"，把用户引向错误方向 |

**这三个差异全都没有任何测试会红** —— 与 P15 那个"改完全绿其实是没覆盖"是同一类陷阱。

### 为此新增的 `BlockFlags`（结构性判据的开关）

平台的差异不只有"多加几个词"，还有**判断方式本身**的差异与**故意不判**的决定。这两类只能表达成开关：

```ts
flags: {
  blankOnAboutProtocol?: boolean  // 页面被风控销毁（猎聘 security.min.js 的处置）
  skipLoginWall?: boolean         // 明确不判登录墙 —— 不判也是一种决定，要写出来
}
```

`skipLoginWall` 尤其重要：没有它，适配器为了保住"不猜"的决定只能退回各写一份，共享表就白做了。

### 出口标准怎么验的

- **单测 713 个（712 通过 / 1 跳过）**（P16 时 709）。新增 4 条，见
  [block-signals.test.ts](file:///d:/DSH-work/job-hunter/test/platform/block-signals.test.ts)：
  * **并集语义**（平台特有加进来、通用那半不能丢 —— 断言长度是"相加"）；
  * **纯数据**（JSON 往返，因为它要进 `evaluate` 的 arg）；
  * **自包含**：把函数源码剥出来断言它**不出现本模块的任何标识符**，连
    "同模块的小工具函数"也不许调 —— 这个仓库踩过这个坑；
  * 判断顺序（越确定的越先判、`blank` 最后）。
- **迁移未放松旧断言**：`zhipin` 的 captcha / quota / blank 用例原样通过。
- **typecheck / build / verify 19/19 / test 全绿。**

### 第二半 · 共享构造样板（`config-merge.ts`）

每个适配器都有一个 `merge*Config(override)`，把 DB 覆盖叠在内置默认值上。
10 份实现写的是**同一套语义**，但漏掉任何一条都只会以"某个平台的配置突然被清空"
的形式暴露 —— 极难归因。现在规则只有一份：`mergeAdapterConfig(base, override)`。

**四条语义里有两条是容易写错的**（都有断言钉住）：

| 规则 | 为什么 |
|---|---|
| **顶层**多出来的键**丢弃** | 安全性质：DB 里拼错顶层键名（`selector` 少个 s）应当静默无效，而不是塞进一个从未被读过的字段 |
| **分组内**的新键**保留** | 这条**必须**保留 —— 给 `cityCodes` 覆盖加一个内置表里没有的城市，正是靠它。分组内也做成白名单的话，"用 DB 补城市码"这条路会直接断掉 |

另外两条：字符串空值 = 没改（界面清空输入框不该把必填字段清成空串）、
数组整体替换（按索引合并从来不是想要的语义）、脏覆盖（`null`/数组/字符串/类型不符）回落默认值。

> 我第一版测试把"分组内新键"的期望写成了会被丢弃 —— **是测试错了，不是实现错了**。
> 跑红之后才想清楚这条必须是保留的（否则 cityCodes 覆盖没法加城市）。
> 已把两者的区别写进模块注释与断言名，免得下次又有人把它"顺手改成一致"。

**共享构造样板这边只迁移了 `51job`**：其余 9 个适配器的配置合并仍是各自内联的，
逐个换成 `mergeAdapterConfig` 即可（各自的配置覆盖用例就是验收）—— 台账纪律同上。

---

## P18 单轮预算与平台总览矩阵（2026-09-18）

多平台只剩这两件事没做：**一轮的时长没有上界**，以及**没有一个地方能横向看平台**。
前者是正确性（卡住的页面会拖住整轮），后者是可用性（纵向的列表答不了横向的问题）。

### 一、单轮预算：为什么平台级的门还不够

`decide()` 会依次跑**用户配的任意多个**平台 —— 一轮能有多长，取决于用户勾了几个平台、
每个平台配了几页，**没有上界**。一个卡住的页面就能把整轮（以及紧随其后的其它方案）拖住：
`running` 一直为真，界面永远显示"正在采集"。

预算 = **本轮开始时刻 + `ROUND_BUDGET_MS`（20 分钟）**。两处收手，**这两处不是同一件事**：

| 位置 | 谁在管 | 结果 |
|---|---|---|
| **平台之间** | 调度器（`budgetExhausted`） | 还没开始的平台**根本不开始**，如实报 `round_budget` |
| **平台之内** | `crawl.ts`（每开一页前比同一个终点） | `state='aborted'` + `DEADLINE_REACHED`，已解析的记录照常入库 |

四条设计约束，每条都有断言：

1. **传绝对时刻，不传"还剩多少"**。传剩余量的话，同一轮里第二个平台会**重新拿到一份预算**
   —— 多平台下等于没有预算。调度器把**同一个** `deadlineAt` 发给每个平台。
2. **只在页与页之间停**。请求中途打断会留下一个状态未知的页面，同一浏览器上下文的下一次
   使用行为不可预期；宁可跑完当前这一页（代价最多是一页）。
3. **中止不是失败**。平台正常响应、字段都解析出来了，是我们自己收手 ——
   所以不推进 `fail_streak`、不进退避、不弹风控待办（`aborted` ≠ `failed`）。
4. **被剪掉的平台必须留痕**。`record()` 在开跑**之前**就调用了（SR-26：到点就该有结论），
   而预算是在跑的过程中才用尽的 —— 不重记一次，那几个平台会停在 `reason=null`（= 跑过了），
   而它们一条都没抓。**又一处"静默少一个结果"**。

> ⚠️ 第 3 条牵出一个容易漏的交互：中止轮的 `found` 是**半截**的。
> 不管它的话，`readYieldSnapshot` 会把它当成"最近一轮" → 立刻误报一次量级骤降，
> 而这跟平台一点关系都没有。所以 `applyYieldBaseline` 直接跳过中止轮，
> `readYieldSnapshot` 取"最近一轮"时也跳过 `aborted`（两条都写了断言）。

为什么给 20 分钟这么松：它是**保险丝**，不是节流阀（节流是每日上限与平台额度的事）。
给紧了只会让正常但慢的站点被腰斩 —— "慢"比"失控"常见得多。

### 二、平台总览矩阵：横向的问题，纵向的列表答不了

平台列表是**纵向**读的（一个平台一段，能写很多解释），而多平台真正要回答的是**横向**的
问题 —— "这些平台今天哪几个真的能跑"。纵向列表答不了：得逐段读完，还得自己记住上一段。

采集页因此多了一张 **「平台总览」矩阵**（原来的平台列表改称「平台明细」，继续放
"为什么"与动作）。矩阵列：平台 / 今天能跑 / 登录 / 健康 / 成熟度 / 今日额度 / 产量 / 最近一轮。
它**没有任何按钮** —— 是读数盘，不是操作台。

这一批最要紧的一点是：**三处判定与调度共用同一份算法**。

| 矩阵里的列 | 与谁共用 | 不共用会怎样 |
|---|---|---|
| 今天能跑（`blocked`） | `runtime.platformGate` —— 那一格就是它的返回值 | 矩阵写「可以」、到点却被挡住 |
| 今日额度 | `crawlQuotaOf`（门与矩阵都调它） | 显示 3/8 而实际已经跑满 |
| 冷却至 | `cooldownUntilOf`（门与矩阵都调它） | 显示"还在等"而门早就放行了 |

「今天能跑」的长原因用 CSS 截断 + `title` 显示全文，**刻意不做一套短标签** ——
短标签是**第二份文案**，迟早与 `SKIP_REASON_LABEL` 漂移，用户在两处读到两种说法。

### 出口标准怎么验的

- **单测 727 个（726 通过 / 1 跳过）**（P17 时 719）。新增 8 条：
  * `dispatch.test.ts` 4 条 —— 预算边界（到点那一刻即用尽）、预算用尽后剩下的平台**不跑**
    且报 `round_budget`、没到点时**所有**平台照常跑（反面：预算不能剪掉正常的一轮）、
    每个平台拿到的是**同一个**绝对时刻；
  * `crawl.test.ts` 3 条 —— 到点中止（`pages` 停住、数据入库、**第 3 页连导航都没发**、
    `fail_streak` 不动）、到点早于第一页时**一次导航都不发**且不报成 `NO_RECORDS`、
    中止轮不进量级基线也不算"最近一轮"；
  * `router.test.ts` 1 条 —— `/platforms` 的 `governance` 与平台门**同源**（打开风控暂停后
    那一格立刻变 `risk_paused`，而别的平台不受影响）。
- **变异验证（这一批的纪律）**：8 条新断言写完就全绿 —— 而**全绿不构成证据**。
  于是把四处行为分别改坏（`withCut` 重记 / `aborted` 过滤 / 到点 break / `blocked` 同源），
  每次都有**指定的那条**变红，改回即绿。与 P15 那次"改完 705 条一条都没红"是同一课：
  **新写的断言必须先证明它会红。**
- **typecheck / build / verify 19/19 / test 全绿。**

### 仍未做

| 项 | 为什么还没做 |
|---|---|
| 批次 4 · **去重可独立触发** | 要把它从"抓取后处理"抽成可单独跑的全库任务（跨方案） |
| 批次 4 · 岗位列表按组折叠 + 跨平台对照 | 纯 UI |
| 批次 3 · 跨平台城市目录 | 数据密集（6 份私有码表 + 3 个空表），且需单一来源 |
| P17 第二半 · `mergeAdapterConfig` 推广 | 还剩 9 个适配器未迁移，逐个替换即可 |

---

## P19 批次 3 / 批次 4 收尾（2026-09-18）

三个早就自己标下的"未做项"。它们的共同点是：**都不新增功能面，而是把已经成立的判断
搬到它本来该在的位置**（全库、查询层、一处声明）。

### 一、去重可独立触发（批次 4）

去重以前**只在抓取的后处理里**发生（`postProcess.dedup`）。于是两个场合完全没有入口：

* **补做**：刚打开去重开关、或刚把某个平台加进方案 —— 库里已有的重复要等"再抓一轮"，
  而那一轮可能一条新岗位都没有；
* **重判**：去重规则改过之后（例如 R25 修掉"薪资未锚定不当门槛"），老数据里
  **本该合并却漏了**的仍然散着。

做法是新建 `domain/dedupe-sweep.ts`，两件事：

| 导出 | 作用 |
|---|---|
| `dedupDepsOf(store)` | 候选 = **同一家公司的其它岗位**（跨平台由 `shouldMerge` 过滤）。**抓取后处理也改用它** —— 判断有第二份实现意味着"抓取时合并、复核时不合并"，而这种自相矛盾不会报错，只会少合并 |
| `sweepDedup(store, now)` | 全库复核：分页取岗位（`DatabaseSync` 是同步 API，一次读全库会卡住宿主），**跳过已经有分组的**，其余走同一套门槛 |

**为什么跳过已有分组的**：`applyDedup` 的语义是"把这个岗位并进它该在的组"。
对已有组的岗位再跑一次，要么白跑，要么想把它挪到别的组 —— 而"挪组"不是这套模型支持的
（成员是显式 id 列表，挪动等于悄悄改掉用户看过的分组）。新岗位会通过
"候选有组 → 并进那个组"正确挂上去，所以复核**幂等**（第二次跑 `merged: 0`）。

三条入口：`POST /dedup/run`、模型工具 `job_dedup`（低危，可逆）、采集页「全库复核一遍」。

### 二、岗位列表按组折叠 + 跨平台对照（批次 4）

同一条岗位在 4 个平台各抓一条时，列表里是四张几乎一样的卡片。折叠的关键决定是
**在哪一层折叠**：

* **在查询层折**（`JobQuery.groupDuplicates` + 一段相关子查询）：`total`、分页、排序
  全部跟着折叠后的集合算。先取 20 条再在浏览器里折，会让"共 40 条 / 只有 12 行"
  变成一个新谜题，而且**同一组会跨页重复出现**；
* 代表取**组内最小 id**，不取 `dedup_group.primary_job_id`：primary 是"第一次合并时那个候选"，
  折叠留谁不该跟着它走（它会被拆组、被加成员）。最小 id 稳定，且与插入顺序一致。

界面上：「跨平台折叠」开关（**默认关闭** —— 折叠会少显示行，"默认少显示"是替用户做决定）、
卡片上的「跨平台」徽章、右侧「对照」按钮展开一张表（来源 / 标题 / 薪资 / 城市 / 原页面）。

> 对照表是**按需拉的**（`GET /dedup/groups/:id`），不预取全部分组：
> 大多数行用户根本不会展开，预取等于每次翻页都多传一份全库的分组。

### 三、跨平台城市目录（批次 3）

城市是唯一一个**跨平台共享的人的概念**（"深圳"在哪个平台都是深圳），而它以前是最乱的一处：
码表散在 8 个适配器里（字符串码 / 数字码 / 省级码 / 中文名直传 / 空表），
而"我选的这几个平台支不支持这个城市"没有任何地方回答得了 —— 界面只拿到
**第一个**声明了 city 的平台那张表。

根因是一句偷懒的推理：**"闭不闭，从 `values` 空不空推不出来"**。它在两个方向上都错了：

| 平台 | `values` | 真实语义 | 旧行为（错） |
|---|---|---|---|
| `guopin` / `hiredchina` | **空** | 带城市**一律拒绝** | 当成"自由文本"跳过 → 存得下，然后每次抓取那个平台整轮失败 |
| `lagou` | 非空（20 个建议） | **自由文本**（中文名原样进 URL） | 当成封闭取值域 → 填「珠海」收到一条**假的**警告 |
| 多平台组合 | — | 取值域是**并集** | 只按第一个平台的表判 → `51job`+`zhipin` 时选不到（也存不进）`zhipin` 支持的「东莞」 |

于是：`CriteriaDimension.closed` 显式声明（guopin/hiredchina `true`、lagou `false`）、
新建 `platform/cities.ts`（52 城目录 + `canonicalCityOf` + `orderCities` + `citySupportOf`）、
取值域改为**并集**且"至少一个平台接受即放行"（**一个都不接受才硬拒** —— 那种配置一定跑不出结果，
存下去只会让人以为平台坏了）。

两处细节值得记下来：

1. **归一化复用 `normalizeCityForDedupe`**，不另写一份：「深圳市」「深圳·福田」在
   **去重**与**城市校验**两处必须给出同一个答案 —— 两套实现分叉的表现是
   "去重认它是深圳、城市校验说不认识"。校验时只在"原样不行、规范名可用"时改写，
   且**改写进 notice**（不许悄悄改用户填的东西）；
2. **提示要给出下一步**：`51job 不认识城市「厦门」` 后面直接跟「支持它的是：zhipin」。
   只说"它会返回空"，用户还得自己一个个平台去试。

### 出口标准怎么验的

- **单测 750 个（749 通过 / 1 跳过）**（P18 时 727）。新增：
  * `dedupe-sweep.test.ts` 7 条 —— 补做（库里早就存在的重复被合并）、幂等（第二次
    `merged: 0` 且 `skippedGrouped` 计上）、保守不放松（公司/城市/薪资三处硬键）、
    疑似计数、没公司名不参与、分页不漏、`dedupDepsOf` 只取同公司跨平台；
  * `cities.test.ts` 5 条 —— 目录无重复、归一化（与去重同规则）、排序（目录外排最后且稳定）、
    `citySupportOf` 的两种"闭不闭"、**城市级码表不许与目录脱节**（这条当场抓出了遗漏的
    waiqi「南通」等 6 个城市）；
  * `plans.test.ts` 4 条 —— 并集放行 / 部分平台不支持→提示 / 空表→硬拒 / 自由文本不被误报 /
    归一化改写要说出来；
  * `jobs-filter.test.ts` 2 条 + `router.test.ts` 1 条 —— 折叠只留一行且 `total` 跟着折、
    分页在折叠后的集合上不重不漏、HTTP 三条路径（复核 / 单个分组 / 折叠参数）。
- **变异验证（这一批的纪律，6 处）**：复核跳过已分组、折叠代表 MIN↔MAX、城市归一、
  取值域并集、`closed` 标志、`groupDuplicates` 参数名 —— 逐处改坏，每次都有**指定的那条**
  断言变红，改回即绿。
- **typecheck / build / verify 19/19 / test 全绿。**

### 仍未做

| 项 | 为什么还没做 |
|---|---|
| 疑似重复的**持久化待确认队列 + 确认界面** | 要在 `dedup_group` 之外再立一张"待确认"表（含否掉后不再提示的状态），属独立一次改动 |
| 城市覆盖度的**矩阵界面** | 现在提示里给"支持它的是谁"，够用；做成"每城 × 每平台"的表格要一个新屏（或塞进方案编辑器），收益不足以单开一批 |
| P17 第二半 · `mergeAdapterConfig` 推广 | 还剩 9 个适配器未迁移，逐个替换即可 |

---

## P20 三条「断链」补口（2026-09-19）

一轮**只做接口盘点**的复查（"站在业务角度还有没有该加的接口"）暴露出三处**不是缺功能、
而是缺最后一段路**的地方：领域层写好了、界面也提示了，但**没有任何入口能把它走完**。
三处都补上，判据不是"路由返回 200"，而是**那条链路真的通了**。

### 1. 接触态：写好了 `advanceContact`，却零调用

`pipeline.advanceContact()`（§12.2 的状态机）一直存在且有单测，但**全仓没有任何调用方** ——
没有 HTTP 路由、没有模型工具、界面上也看不到本地接触态。后果是连锁的：

```
接触态永远停在 greeted
  → followUpSuggestions() 只认 delivered / read 两条分支
  → GET /followups 恒为空（§3.3「未读超时 vs 已读未回」整条洞察落不了地）
  → 漏斗的「已送达 / HR 已读 / 已回复」三列恒为 0
```

补的三条：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/jobs/:id/contact-stage` | 人工标记接触态（`greeted`/`delivered`/`read`/`replied`/`interview_scheduled`）；写 `stage_event`，`source='manual'` |
| GET | `/greetings` | 打招呼记录（D6）：内容 + 模板名 + 渠道 + 当前接触态 + 回复时间 |
| — | `contact_stage` 工具 | 原来是纯探测，现在多一个可选 `stage`：**不传=探测，传=标记**（同类操作合并，不新开工具） |

三处刻意保留的边界：

- **`none` 不可标记**（`MANUAL_CONTACT_STAGES`）。它的含义是"没有打招呼记录"，
  而标记的载体恰恰是一条打招呼记录 —— 允许它会得到一条写着"未接触"的打招呼记录，自相矛盾。
- **探测仍然不改状态**。`POST /jobs/:id/detect-stage` 一个字段都不写；界面在探测结果旁给
  「采纳为本地状态」，由用户显式点。`probeContactStage` 的 note 里"没有改动任何本地状态"
  这句承诺没有被这一批改动破坏。
- **发送成功时按 `delivery` 记哪一态**。适配器**确认送达**（`delivery === 'delivered'`）才记
  `delivered`，否则停在 `greeted` —— 不猜。这一步正是"未读超时"建议能不能触发的前提。

### 2. 待修复队列：只有计数，没有列表与清空

`pending_repair` 里 `listPending` / `markReplayed` / `clear` 全都写好了，但**没有任何入口**：
「今日」「设置」上只显示一个数字（`pendingRepair`），点不进去。于是用户看到"待修复 20"，
却看不到坏在哪个字段、样本是哪个岗位 —— "修选择器"这件事没有入口。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/repairs` | 待修复列表（缺哪些字段 / 样本地址 / 当时解析出的标量）+ 按平台汇总 + 口径说明 |
| POST | `/repairs/:id/discard` | 丢弃单条（行保留，状态置 `discarded`，留痕） |
| POST | `/repairs/clear` | 清空**某个平台**的队列（`platformId` 必填） |

两条**刻意的否决**，都写在代码里：

- **没有「重放」端点**。`pending_repair` 有 `raw_html` 列，但 `crawl.ts` 入队时**不传**它
  （§18：原始页面是体积杀手，默认不存）。没有原始 HTML 就没有"离线重放解析"这种能力 ——
  加一个点下去什么都不会发生的按钮，正是本仓库明令避免的形态（同 `domain/messages.ts` 里
  那个被删掉的假 `reply`）。正确顺序是：**改选择器覆盖 → 重跑一轮 → 确认数据正常 → 清空这一队**。
- **没有"一键清空全部平台"**。它不对应任何真实场景（真实场景是"某个平台的选择器坏了"），
  却会让一次手滑抹掉所有平台的诊断线索。要清多个平台就多按几次。

### 3. 适配器配置覆盖：文档写着"只能在 UI 改"，而写入路径不存在

`docs/ADAPTERS.md` §1 自己标出了这处矛盾：`fiftyone-job.ts` 的注释说"选择器坏了自己在 UI 改"，
但**全仓库只有 `ai-config` / `guard-config` 两个键有写入调用**，`adapter-config` 只能直接写 sqlite。
J2（"选择器配置化，UI 内可改并热生效，不依赖发版"）因此一直是**未完成**状态。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/platforms/:id/adapter-config` | 三层视图：代码默认 / DB 覆盖 / **实际生效** |
| PUT | `/platforms/:id/adapter-config` | 写入覆盖并**热替换适配器**；`override: null` = 清除覆盖 |

落地要点：

- `AdapterSpec` 多一格 `config: { defaults, merge }`，`merge` **必须与 `build` 内部同一个函数** ——
  否则界面显示的"生效值"与适配器实际拿到的不是同一份，那种不一致比不显示更糟。
- `merge` 走的是 `mergeAdapterConfig()`：**只写要改的键**，没写的沿用默认；顶层不认识的键被丢弃。
  写入路径对 `override` 只做两件事——必须是普通对象（或 `null`）、不超过 64KB ——
  脏值不会污染配置（合并函数自己会收敛）。
- **热生效**靠 `AdapterRegistry.replace()` + `rebuildAdapter()`：配置是在 `build` 时快照进闭包的，
  只写库要等下次装配才生效，而"界面说改好了、实际还是旧选择器"正是 J2 要消灭的那类问题。
- `override` 必须**显式出现**：把"没传"与"传了 `null`（清除）"区分开，
  免得一次拼错的请求体把用户刚写好的选择器删掉。

### 4. 额度读数：以前只在被拒的那一刻才说

`checkQuota` 算得出 `used / limit / 平台侧 cap`，但**只在拒绝时**才写进 deny 文案。
于是 U0 要求的「额度余量」没有数据面，用户只能撞墙才知道还剩几次 —— 而且会去改自己的额度，
却发现还是被拒（因为限住他的是**平台侧上限**）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/guard/usage` | 按平台分组的三动作读数：`used / budget / platformCap / limit / limitedBy / remaining` |

- 新读数函数 `guardUsageOf()` 与 `checkQuota` **共用同一份口径**（bucket 映射、平台侧 cap、
  取较小者、审计表 + UTC 日）—— 各写一份必然漂移，漂移的表现是"界面说还剩 5 次、第 3 次就被拒"。
- `limitedBy` 这一格存在的唯一意义：告诉用户**该改哪里**。`platform` 时改自己的额度没有用。
- 与**抓取配额**（`/platforms` 的 `governance.todayRuns`）是两回事：那个数"自动跑了几轮采集"，
  这个数"发了几条招呼 / 投了几份 / 回了几条"。首屏以前只有前者。
- 模型侧并入 `job_settings` 的读回（同类操作合并，不新开工具）。
- 数据层未就绪时返回空结构 + 说明（U0 要能把"为什么没有数据"显示出来），**不抛错**。

### 界面落点

| 屏 | 加了什么 |
|---|---|
| 岗位详情（U2） | 接触态卡片：本地接触态 + 五个标记按钮 + 探测结果（含「采纳为本地状态」）+ 变更记录 |
| 岗位详情工具面 | `job_detail` 输出补上接触态与最近一次打招呼 —— 之前模型答不了"我打过招呼了吗" |
| 采集（U9） | 「待修复记录」卡（缺哪些字段 / 样本 / 丢弃 / 按平台清空）+「适配器配置覆盖」卡（三层视图 + 编辑 + 清除） |
| 今日（U0） | 「今日额度余量」卡（只在用过或已用满时出现）；「待修复记录」数字变成可点，跳到采集页 |

### 出口标准怎么验的

- **`test/http/p9-routes.test.ts`（15 条）**，重点在链路而非状态码：
  标记 `delivered` 之后 `/followups` 必须真的产出 `unread-timeout`（**这条断言在这批之前不可能通过**）；
  写覆盖之后 `effective.selectors.card` 必须真的变成新值、清除后回到默认；注册表里那个适配器
  必须是**新实例**（证明热替换而非只写库）；额度读数必须与闸门口径一致（被拒的那次不计数、
  用户额度高于平台上限时 `limitedBy === 'platform'`）。
- `route-precedence.test.ts` 补 `/repairs/clear` vs `/repairs/:id/discard` 的字面量优先。
- **typecheck / build / verify 19/19 / test 全绿（927 通过）**。

### ⚠️ 同一轮里第三次踩同一个坑

`client/styles.ts` 是 `const CSS = \`…\``，我在新增的 CSS 注释里写了反引号（`` `width:100%` ``），
模板被截断，typecheck 报出一堆与 CSS 无关的错。§1.3 与上面"采集页可用性修复"两处都记过这条 ——
**它已经记了三次，说明这条得变成动作**：改完 `styles.ts` 先 grep 一遍注释里的反引号。
（正确的写法就是不带反引号的 `width:100%`。）

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
| Word（docx）与 HTML/PDF 的模板分叉不同步 | docx 侧**不做**经历块的左侧框线；"段落标题的短线"在 Word 里用**文字下划线**表达 | 两条都是 OOXML 的能力边界：段落左边框在带缩进的段落上会落在缩进处，一行一个位置 → 得到一条参差不齐的竖线；段落下边框又只能横贯版心（正是要摆脱的"表格观感"）。所以专业模板在 Word 里靠**主色**（姓名/标题/页眉线）区分，concise 靠灰阶 |
| 时区"跟着人走"（SR-5） | 排程按**本地墙钟**（`getHours()` 这一族），`plan.timezone` 只作为写入时的**快照**回传给界面显示 | 纯 JS 里没有"按任意 IANA 时区算墙上时间"的原生能力（要引入 `Intl` 的重型用法或一个时区库，而 C5 禁止新增运行时依赖）。而插件跑在用户自己的机器上，**本地就是用户的时区** —— 改系统时区后 `next_run_at` 下次重算即按新时区走，这正是 SR-5 要的效果 |
| U9"筛选维度**发现**与人工覆盖"（§4.2.2 的 `discovery.ts`） | 只落地**声明式**那一半：适配器 `criteriaDimensions` 声明 + 界面据此渲染 + 未声明键报错。DOM 遍历自动发现**未实现** | 51job 的"字段→URL 参数"映射本来就是**无法自动推导**的（§4.2.2 自己写了这句），人工建一次才是设计意图；自动发现只对"选项集合会变"（如城市列表）有额外价值，而那属于下一轮 |
| §4.6.1 说"`skipped` 落 `crawl_run`" | 跳过**不写** `crawl_run`，只进 `planStatus.lastDecision` + SSE `plan.skipped` | `crawl_run` 记录的是"真的去抓了一轮"，而跳过连浏览器都没开。硬写一条会让运行历史混进一堆 `found=0` 的假运行，**反而掩盖真正失败的那几条** —— 而那正是这张表要回答的问题 |
| 定时"窗口内随机"用随机数 | 用**稳定哈希** `FNV-1a(YYYY-MM-DD#planId)` 派生窗口内偏移 | `next_run_at` 要落库（NFR-4）且会被反复重算（启动/每次 tick/`status()`）。用 `Math.random()` 的话同一个窗口每次算出不同的点：① 界面上的"下次运行"会自己跳动；② **定时器会自旋**（武装到 A 点，tick 重算得到 B 点，永远追不上）。稳定哈希同时满足"同窗口恒定"与"连续 5 天互不相同" |
| `PlanSchedule.hour/minute`（单点时刻） | 换成 `windowStart/End*` 四个字段 | SR-32 明确不提供"精确到分钟的单点时刻"。HTTP 收到 `hour`/`minute` 会**显式报错**并指向窗口字段（静默忽略会让调用方以为自己配成功了） |
| 全局暂停是一个布尔开关 | 存 `{ paused, reason }` 对象 | 要记住"谁暂停的、为什么"。**踩过**：读取时拿它跟 `true` 直接比，于是暂停看起来生效了（`armed` 变 false）而每次判定都当没暂停、定时照跑 —— 被 `dispatch.test.ts` 的行为测试抓住 |
| §4.10.1 提到 `domain/dedupe.ts` | 之前**不存在**（只有 `util/dedupe.ts` 的判定函数）；2026-09-17 补上 | 判定纯函数与"怎么落到分组、可不可逆"是两件事；补上之后 SR-44 的 `dedup` 开关才有真实作用点 |
| （文档未提） | 表单说明文案收进 `?` 的 `title`，而不是删掉 | 删掉会让"为什么这个筛选项是灰的"变成不可查；收进 tooltip 既不占版面又留着答案 |
| （文档未提） | 弹窗**不做焦点陷阱**（focus trap） | 半吊子的陷阱（只处理 Tab 到头、不处理 Shift+Tab 与动态增删的可聚焦元素）会让键盘用户在某些路径上彻底卡住，比不做更糟。这里唯一的场景是"填个表单然后关掉" |
| （文档未提） | 时间用原生 `<input type="time">`，**不引入日期/时间选择器库** | C5 零新增运行时依赖；原生控件自带键盘与移动端行为，而这两个函数（`clockValueOf`/`parseClockValue`）就是唯一转换点 |
| 每平台冷却只提"退避" | **计划级**退避 + **平台级**冷却两份 | 风控是按平台算的：51job 被限流不该让另一个平台的方案跟着停，反过来 51job 被限流后**任何**方案去碰它都该被拦住。平台级状态存 `setting`（`scope=platform`）而不是加列 —— 它是几小时就过期的短命状态，不值得一次 schema 迁移 |

---

## 许可与免责

- **许可**：[MIT](LICENSE) —— 可自由使用、修改、分发（含商用）。注意这意味着本仓库里的
  「仅供学习」是**立场与建议**，不是许可限制；要强制禁止商用就得换成非 OSI 的自定义许可。
- **免责**：本项目**仅供学习与技术研究使用**。完整条款见 [`DISCLAIMER.md`](DISCLAIMER.md)，要点：
  - 抓取必须遵守目标网站条款与当地法律；项目**不做指纹伪造 / UA 轮换 / 代理池**，仅含环境一致性手段（D-17a：patchright / stealth 注入 / 端口守卫，不伪装身份）；
  - **L3 批量打招呼与 L4 批量投递默认关闭**，开启属于账号风险自担；高危动作一律过审批闸门，
    不要为了少点一次确认而绕过它；
  - 数据**全部留在本机**（`$DSH_HOME/job-hunter/`），**没有服务器、不上传、不联网同步**；
    但简历与联系方式仍由你自己保管，分享数据库或截图前请先自查；
  - 模型生成内容（话术 / 简历定制 / Cover Letter）必须人工复核，防编造检查只是兜底；
  - 本项目按**「现状」（AS IS）**提供，不附带任何担保，作者不承担使用后果。
- 本项目与任何招聘平台（前程无忧、BOSS 直聘、猎聘、智联招聘、牛客、实习僧、Indeed、LinkedIn 等）
  **没有任何隶属、合作或背书关系**；相关商标归各自所有者。
