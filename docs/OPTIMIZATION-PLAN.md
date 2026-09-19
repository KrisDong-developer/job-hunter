# 优化完善计划（新会话执行手册）

> **这份文档是给一个"没有任何上下文的新会话"看的。** 它自包含：约束、已核实的事实、
> 按批次拆好的任务、每批的验收方式、以及**已经踩过的坑**。
>
> 目标读者：接手本仓库的 AI 会话或开发者。
> 入口文档：`README.dev.md`（实现细节与差异表）· `ARCHITECTURE.md`（设计）· `REQUIREMENTS.md`（需求，D-19 是本次的产品决定）。

---

## 0. 怎么用这份文档

1. 先读 **§1 硬约束** 与 **§2 已核实的现状** —— 这两节决定了后面所有任务怎么写。
2. 按 **§3 的批次顺序**执行。**每一批都必须可独立验证、并且结束时代码是绿的**。
3. 每批的收尾动作是固定的（§5）：typecheck → build → `npm test` → 相关验收脚本 → 更新文档 → commit & push。
4. **不要一次做完所有批次再验证**。这个项目一路上拒绝的正是"大改一通然后说应该没问题"。
5. 遇到与文档不符的事实，**先核实再改**，并把结论回写进文档（§2 里已经标了两条"待核实"，就属于这类）。

**建议的开场白（可直接粘给新会话）：**

```
读 job-hunter/docs/OPTIMIZATION-PLAN.md，按它的 §3 批次顺序执行。
先做批次 A（P0 bug），每批结束按 §5 的规范验证并更新文档，保持仓库全绿。
不确定的地方先核实再改，不要猜。
```

---

## 1. 硬约束（新会话必读）

### 1.1 位置与环境

| 项 | 值 |
|---|---|
| 包根 | `D:\DSH-work\job-hunter`（工作目录 `D:\DSH-work`） |
| DSH 检出 | `D:\DSH\DSH Desktop\resources\app\`（只用来查宿主契约，别改它） |
| `$DSH_HOME` | `C:\Users\<你>\AppData\Roaming\dsh-desktop\harness` |
| 开发 profile | `p5test`（用 `link:` 指向包根，改完 `npm run build` + 重启即可） |
| 测试 profile | `p5headless`（跑单轮对话，任务**必须写成一行**） |
| 数据目录 | `$DSH_HOME\job-hunter\data.db`（**累积型**，断言要用 `>=`/增量，别用精确数） |
| 单测基线 | **870 个（869 通过 / 1 跳过）**（`npm test`，离线，绝不访问真实招聘站）。2026-09-18 复核时更新（原记录 750 个）—— 期间落了 zhipin 的打招呼/回复/收件箱/阶段探测、zhaopin 的收件箱/阶段探测与对应护栏 |

### 1.2 不可违反的约束（违反即返工）

| # | 约束 | 出处 |
|---|---|---|
| 1 | **定时只做准备**：抓取、打分、标注、去重。**不发送、不投递、不回复** | D-5 |
| 2 | **欠账只提示不自动跑** | C9 |
| 3 | 只有**租约持有者**能抓取；只读实例连手动跑都拒绝 | R20 |
| 4 | 高危动作（发送/投递/回复）必须过审批闸门 + 一次性令牌 | R14 / §22.4 |
| 5 | **自动化测试绝不访问真实招聘站**；用 `DSH_JOB_HUNTER_NO_NETWORK=1` | §14 |
| 6 | **不引入指纹伪造 / UA 轮换 / 代理池**；环境一致性手段（patchright / stealth / 端口守卫）只在平台层统一提供 | D-17 / D-17a / R18 |
| 7 | **零新增运行时依赖**（现在只有 `playwright-core` + `patchright`，后者为 D-17a 环境一致性所需） | C5 |
| 8 | 颜色一律走主题 CSS 变量，不硬编码色值 | §5.3 |
| 9 | 改了**宿主半**（`src/host/**`）必须重启 DSH 才生效；只改客户端半刷新页面即可 | 实测 |
| 10 | 旧文案里的"永不"改成"不自动"时，要同步改测试期望 —— 但**不许放松断言** | 本文档 §5 |

### 1.3 已经踩过的坑（会重复踩，务必先看）

1. **绝不用 shell 编辑源码。** PowerShell 的 `Set-Content` 会毁掉 UTF-8（本项目被毁过 3 次，其中一次整个 `tools/index.ts` 重写）。读可以用 shell，**写只许用文件工具**（read/write/edit）。
2. **CSS 模板字符串（`styles.ts` 的 `const CSS = \`...\``）里不能出现反引号。** 我在 CSS 注释里写 `` `--jh-split` `` 直接把模板截断了，typecheck 报出一堆莫名其妙的错（`Property 'jh' does not exist`）。**踩过 3 次**。改完可以用这个守卫自查：`styles.ts` 里第 21 行之后应当**只剩收尾那一个反引号**。
3. **`git commit -m "..." -m "..."` 传多段中文消息会被 PowerShell 解析错**（git 把消息当路径，报 `pathspec ... did not match`），而且 `git push` 会显示 `Everything up-to-date` —— **看起来像成功，其实什么都没提交**。正确做法：把消息写进文件用 `-F 文件`，或从 stdin：`$msg | git commit -F -`。
4. **commit 后必须看到 `[main xxxx] ...` 那一行**。没有那行就是没提交（通常是忘了 `git add`）。
5. **`.NET` 的当前目录 ≠ PowerShell 的 `$PWD`**：`[System.IO.File]::ReadAllText($rel)` 会去进程 CWD 找，报 path not found。用绝对路径。
6. **`job_kill` 只杀 pwsh 包装进程，node 子进程会活着**（曾经留下两个实例抢租约）。停实例要**按 pid 杀**（命令见 §5.3）。
7. **破坏性验证不要碰真数据**：要验删除类接口，就删"不存在的 id"看 404、或用一个临时创建再删掉的对象。
8. **验收脚本要非破坏性 + 用增量/`>=` 断言**：数据库是累积的，精确计数会假失败。
9. **归因标签里不要写 `rev`**：`application` 表只记 `resume_id`，没记"投递当时是哪一版"，写当前 rev 是在说假话（已修，别再写回去）。
10. **主题变量先 diff 再用**：`--dsw-alias-*` 里有点是不存在的（例如 `state-error-tertiary`），不存在的变量**静默失效**、不报错。项目里用的 33 个变量与主题里定义的 357 个做过一次 diff。

---

## 2. 已核实的现状（带证据）

### 2.1 定时任务现状

| 项 | 现状 | 证据 |
|---|---|---|
| 排程 | 自实现：Cordis `timer` → 原生 `setTimeout`（`TimerPort`，可取消），**带抖动 + 自重新武装**，`next_run_at` 落库 | `src/host/scheduler/index.ts`、`schedule.ts` |
| 触发 | **固定单点时刻**（`runAt: '09:30'` + 工作日掩码） | `PlanSchedule` |
| 多方案 | `enabledPlans()` 遍历**全部**启用方案，都会排程 | `scheduler/index.ts:71` |
| 错过 | 只生成 `catch-up` 待办，**绝不自动跑**（C9） | `missedRun()` + `todo(ref='catch-up')` |
| 租约 | 单实例；非持有者只读，**连手动跑都拒绝** | `runPlan()` 开头的 readOnly 判定 |
| 一键暂停 | ❌ **没有**；只有 per-plan 的 `plan.enabled` / `plan.schedule.enabled` | — |
| 三条执行路径 | 「立即运行」「补跑」→ `runPlan()`（**推进 `lastRunAt`**）；「抓取一次」→ `runCrawl()`（**不碰排程**） | `scheduler/index.ts` / `today.tsx` |

### 2.2 三个已确认的问题

1. **时间显示是裸 UTC**：今日屏把 `nextRunAt` 原样打印 → `2026-09-18T01:34:08.060Z`，
   而计划写的是 09:30（本地）。用户第一眼会以为排程错了；抖动的 +4 分钟也没有说明。（`src/client/screens/today.tsx`）
2. **「抓取一次」的筛选条件写死在客户端**：
   `runCrawl({ platformId: '51job', criteria: { keyword: 'Java', city: '深圳' } })` ——
   按钮文案里的"深圳 Java"是**字面量**，不读用户的方案；且它不更新排程。
3. **手动跑隐式重置"错过"判定**：`runPlan()` 里 `setRunTimes({ lastRunAt: clock() })`，
   16:16 手动跑一次，09:30 那次"错过"被悄悄原谅。可能是想要的，但应当是**显式**语义（SR-7）。

### 2.3 两条**待核实**（先核实再改，别猜）

| 编号 | 待核实的问题 | 怎么核实 |
|---|---|---|
| **SR-15** | 崩溃后悬挂的 `crawl_run(state='running')` 有没有收敛逻辑。我在 `domain/crawl.ts` 与 `store/repo/crawl-runs.ts` **没找到**，但搜索范围有限 | 起一个实例，直接往库里插一条 `running` 的 `crawl_run`（或写一个用假 store 的单测），看启动/下次读取时它是否被改成 `failed/aborted`。**没有就补**：启动时把超过阈值的 `running` 收敛 |
| **SR-34** | 重抓会不会覆盖用户的处置态（收藏/忽略/归档） | 单测最快：用测试库插一个 `state='saved'` 的岗位，跑一次入库（upsert）同一 `(platform, platform_job_id)`，断言 `state` 仍是 `saved` |

### 2.4 界面现状

当前 8 个 tab：**今日 / 岗位库 / 流水线 / 消息 / 面试 / 校招 / 看板 / 简历中心**。

**`ARCHITECTURE.md` §5.4 规划过三块屏，三块都没实现**：

| 已规划 | 内容 | 状态 |
|---|---|---|
| **U9 平台与适配器** | 登录态、健康、**动态筛选项发现与人工覆盖** | **P0 · 未实现** |
| U10 设置 | 抓取、额度、隐私、保留 | P1 · 未实现 |
| U11 日志与诊断 | 运行历史、错误、LLM 调用记录 | P1 · 未实现 |

它们的内容现在**全挤在 U0 今日里**（「平台与登录」「定时抓取」就是 U9 该有的东西）。
**这就是今日屏拥挤、配置类内容混进日常动线的根因。**

### 2.5 采集配置面现状

| 可配（数据模型已有） | 不可配 / 缺的 |
|---|---|
| 方案名、`platforms[]`、`criteria`（自由键值对）、`schedule`、`enabled`；三条入口：GUI / `job_plan_manage` 工具 / HTTP `/plans` | 抓取深度（页数上限/排序/发布时间窗）、**适配器筛选维度声明**、重复方案提示、抓取后处理（打分/标注/去重）、全局暂停 |

**平台现实**：**只有 51job 一个适配器**，所以"去哪个平台抓"在模型上可配、**现实里没有选项**。
多平台是工程量问题（每个平台一个适配器 + 预研 + 风控实测），不是配置问题。

---

## 3. 任务清单（按批次，每批独立可验证）

> 需求编号 `SR-x` 的完整定义见 `ARCHITECTURE.md` **§4.6.1**；产品决定见 `REQUIREMENTS.md` **D-19**。

### 批次 A · P0 bug（先做，改动最小、你天天看得见）

| # | 任务 | 涉及文件 | 验收 |
|---|---|---|---|
| A1 | **时间显示本地化**：今日屏的「下次运行/上次运行」改成**本地时间 + 相对时间 + 抖动说明**（如 `今天 09:34（含 4 分钟抖动）`）；`scheduler/status` 顺带带上 `jitterMs` 与 `timezone` | `src/client/screens/today.tsx`、`src/shared/dto.ts`、`src/host/http/router.ts`、`src/host/scheduler/index.ts` | 浏览器里看到的是本地时间；构造一个 +4 分钟抖动的计划，界面文字含"抖动" |
| A2 | **「抓取一次」读方案**：删掉写死的 `{51job, 深圳, Java}`，改成走 `runPlan(默认方案)`；按钮文案从方案取 | `src/client/screens/today.tsx` | 改方案的 city/keyword 后，按钮文案与抓取条件都跟着变 |
| A3 | **SR-15 悬挂 `crawl_run`**：先**核实**（§2.3），没有收敛就补（启动时把超阈值 `running` 收成 `failed`） | `src/host/domain/crawl.ts`、`src/host/store/repo/crawl-runs.ts`、`runtime.ts` | 单测：插一条 2 小时前的 `running`，启动收敛后状态不再是 `running` |
| A4 | **SR-34 处置态**：先**核实**（§2.3），会被覆盖就改 upsert（只更新抓取字段，不动 `state`） | `src/host/store/repo/jobs.ts` | 单测：`saved` 岗位重抓后仍 `saved` |

### 批次 B · P1 语义修正（不改产品行为，只把话说准）

| # | 任务 | 需求 | 验收 |
|---|---|---|---|
| B1 | 新鲜度模型：拆 `last_attempt_at` / `last_success_at`；三级 fresh(<18h)/stale(18–48h)/cold(>48h)（阈值随计划频率）；cold 生成 catch-up 待办 | SR-7/8/9/10 | 单测：失败的尝试不推进 `last_success_at`；改库里的时间 → 三级与待办随之出现 |
| B2 | **跳过原因枚举**：`skipped(not_logged_in / adapter_broken / risk_paused / lease_lost / offline_gate / outside_window / quota_reached / another_run_active / backoff)`，面板显示人话 | SR-16/17/18/26 | 未登录时面板显示具体原因，不是"已武装" |
| B3 | **一键暂停（只停定时）**：全局开关，持久化；暂停后手动「立即运行」仍可用 | SR-30 | 暂停后等一个窗口不长跑；手动跑仍成功 |

### 批次 C · D-19 的模型变化（已获授权）

| # | 任务 | 需求 | 验收 |
|---|---|---|---|
| C1 | **窗口内随机**：配置从"时刻"改成"偏好时段"（如 09:00–11:00），窗口内随机选点，窗口内最多一次 | SR-1 | 用假时钟连跑 5 天，触发时刻互不相同且都在窗口内 |
| C2 | **在场触发**：启动/打开面板时若 stale/cold → 提示刷新（**不自动跑**） | SR-2 | 首屏可见提示；不点不跑 |
| C3 | **时区跟着人走**：存本地墙钟 + 时区快照，不存推算的绝对 UTC | SR-5 | 改系统时区后"下次运行"按当地时间算 |
| C4 | **时钟跳变/休眠**：唤醒后不补偿，只重算；假时钟模拟时间跳跃 | SR-6 / R22 | 时间 +3h 不导致连跑两次 |
| C5 | **退避 + 连续失败暂停**：15m→1h→4h；连续 N 次 → `risk_paused` + urgent 待办 + **人工确认恢复**；风控信号单独识别；每平台独立冷却 | SR-20/21/22/23 | 假时钟验退避曲线；连续失败达阈值后不再尝试 |

### 批次 D · U9「采集」页 + 今日减负（最大的一块）

> **不要新造页面。** 用 §5.4 已规划的 **U9**：tab 显示「采集」，页面标题「数据采集」。

| # | 任务 | 需求 | 说明 |
|---|---|---|---|
| D1 | U9 骨架 + tab 注册（`main` 面板 + `sidebar.panellist`） | — | 抄 `panel.tsx` 现有屏的注册方式；`PANEL_KEY` 与 tab key 一致 |
| D2 | **采集方案配置**：方案列表 + 新增/编辑（平台集合、筛选条件、**抓取深度：页数上限/排序/时间窗**、偏好时段、启用） | SR-38/40 | **需要先扩 `SearchCriteria` 与适配器 `urlParams`**（51job 的 URL 支持更多维度，现在只映射了 keyword/city/page） |
| D3 | **筛选维度声明**：适配器声明"我能筛什么"（维度 + 取值域）；界面据此渲染，不支持的维度**禁用而非隐藏**并给原因；未知键显式报错 | SR-41/42 | 与 §5.5「能力驱动的 UI」同一条原则 |
| D4 | **平台状态**：登录态、健康、逐字段健康、登录入口（从今日搬过来） | SR-16 | 今日的「平台与登录」整块迁移 |
| D5 | **触发与运行**：立即 / 补跑 / 一键暂停 / 下次运行（本地时间 + 为什么是这个时刻）/ **"为什么没跑"** | SR-17/26/28 | 运行历史小表：时间/状态/新增/失败原因/触发原因 |
| D6 | **今日减负**：只留 新鲜度徽章 + 下次运行 + 「立即采集」+「去配置」；健康留一行只读 | — | 今日回答"今天干什么"，不回答"系统怎么配" |
| D7 | **重复方案提示**（不合并）：同平台 + 同条件保存时提示"与方案 X 重复" | SR-43 | 只提示，不自动合并 |

### 批次 E · 配置面收尾

| # | 任务 | 需求 |
|---|---|---|
| E1 | 抓取后处理可配：打分 / 标注 / 去重（默认全开） | SR-44 |
| E2 | 三条入口（GUI / 工具 / HTTP）对等且**共用同一套校验** | SR-45 |
| E3 | U10 设置 / U11 日志与诊断（P1，可选） | — |

### 批次 F · 看板遗留（与定时无关，可穿插）

| # | 任务 | 前置 |
|---|---|---|
| F1 | **薪资箱线图**（P25–P75 高亮）+ Toggle | **需先定 Toggle 语义**（月薪下限？年薪折算？），否则是假交互 |
| F2 | **本地基准对比**：用**自己抓到的岗位库**当基准（该城市/关键词的全体分位 vs 你投递过的分位） | **不要编"行业数据"、不要联网**（本项目无服务器、无数据源） |
| F3 | **A/B 简历版本对比**：先做**对比表 + 每格标样本量**，样本够了再谈显著性 | 现在投递样本 2 条，做显著性图 = 假信息 |

---

## 4. 每批的收尾清单（照抄即可）

```powershell
cd D:\DSH-work\job-hunter
npm run typecheck            # 必须干净
npm run build                # 宿主半 → lib/，客户端半 → client/client.js
npm run verify               # 19 项构建产物契约自检（含 patch 纯 insert、react external）
npm test                     # 基线 727；新增测试后要更新文档里的计数
```

浏览器验收（需要真 GUI 时才做）：

```powershell
# 1) 起实例（后台）
Remove-Item "$env:APPDATA\dsh-desktop\harness\job-hunter\lease.json" -Force -ErrorAction SilentlyContinue
$env:DSH_JOB_HUNTER_NO_NETWORK='1'
node "D:\DSH\DSH Desktop\resources\app\node_modules\@deepseek-ai\dsh\lib\bin.js" --profile p5test --port 4399 --no-open
#    输出里那行 `dsh web: http://127.0.0.1:4399/?token=…` 就是后面脚本要的 URL

# 2) 跑验收脚本（都在 D:\DSH-work\，不在仓库里）
node D:\DSH-work\jh-e2e.mjs "<带 token 的 URL>"      # 31 条基线断言（入口/面板/岗位库/详情/收藏/P5 闸门）
node D:\DSH-work\jh-jobs-ui.mjs "<url>"              # 岗位库布局 + 对比度 + 窄屏溢出
node D:\DSH-work\jh-resume-ui.mjs "<url>"            # 简历中心（结构化表单/模式切换/纸张预览）
node D:\DSH-work\jh-resume-quick.mjs "<url>"         # 简历中心最小验证（tab/暂停空态/分屏拖拽条）

# 3) 停实例（**按 pid 杀**，job_kill 杀不掉 node 子进程）
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object {
  if ($_.CommandLine -match 'bin\.js' -and $_.CommandLine -match '--profile\s+p5test') {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
```

**提交（务必用 stdin 传消息，别用多段 `-m`）：**

```powershell
cd D:\DSH-work\job-hunter
git add -A
$msg = @'
<这里写中文提交消息>
'@
$msg | git commit -F -
# 看到 [main xxxx] 才算提交成功；没有就是没 add 上
$env:GIT_TERMINAL_PROMPT='0'
for ($i=1; $i -le 3; $i++) { git push 2>&1 | Select-Object -Last 1; if ($LASTEXITCODE -eq 0) { 'PUSH_OK'; break }; Start-Sleep -Seconds 5 }
```

> 网络不稳，`git push` 经常第一次失败（`Recv failure: Connection was reset`）。重试即可，
> 但**必须看到 `xxxx..yyyy main -> main`** 才算推上去。

---

## 5. 验证与文档纪律

| 规则 | 说明 |
|---|---|
| **每批必须绿** | 不允许"先改五处再一起跑测试"。批与批之间仓库必须是可跑的 |
| **新行为必须有断言** | 新增/修改的行为要落到 `test/**`。改期望值时**不许放松断言**（例如把 `equal` 改成 `ok`）——只能改期望的具体值，并在提交消息里说明为什么设计变了 |
| **文档同步** | 实现级细节 → `README.dev.md`；需求/决策 → `REQUIREMENTS.md`（走 D-xx 显式修订）；设计 → `ARCHITECTURE.md`（§4.6.1 的 SR 表、§5.4 的屏清单、§11 的 P 行） |
| **测试计数变了要改文档** | 当前是 **705**（P15 之后）。这个数在 `README.dev.md`、`docs/OPTIMIZATION-PLAN.md` 里出现过 —— 改完先 grep 一遍计数 |
| **改完代码全绿也要警惕** | P15 改掉两个**静默少合并**的 bug（R25）之后，705 条用例**一条都没红** —— 那不代表改对了，而代表**这件事此前完全没被覆盖**。改的是"少了一个结果"这类静默行为时，必须自己补一条**会红**的断言，再确认它变绿 |
| **需求标 ✅ 前先回读断言本身** | 只看用例名会漏掉 R24 那类（用例标题与断言方向相反，需求因此看起来已达成）。**一条需求的验收标准必须能逐字对上断言** |
| **停机/复现问题要留证据** | 时间/状态/数字尽量来自实测（接口返回、计算样式、DOM 测量），不要"应该没问题" |
| **写不清楚就写进差异表** | 实现与文档不一致的地方，记进 `README.dev.md` 的「与 `ARCHITECTURE.md` 的实现差异」表，别让下一个人再困惑一次 |

---

## 6. 红线（做了就是返工）

1. **不新造页面**承载采集 —— 用已规划的 **U9**（§5.4）。
2. **不做后台常驻/系统服务** —— 插件只在 DSH 运行时存在，这不是缺陷，是边界。
3. **不引入指纹伪造 / 代理池**（D-17）；适配器层不做任何反检测处理（D-17a：环境一致性由平台层统一提供）。
4. **定时任务不发送任何东西**（D-5）。
5. **不加运行时依赖**（C5）。
6. **不在测试里访问真实招聘站**（§14）—— 端到端脚本一律带 `DSH_JOB_HUNTER_NO_NETWORK=1`。
7. **不用 shell 编辑源码**（§1.3 第 1 条）。
8. **不把"行业基准数据"编出来** —— 本地没有就只用本地能算出来的（自己的岗位库）。
9. **不为小样本画显著性结论** —— 看板的 `MIN_SAMPLE = 5` 原则不许绕过。

---

## 7. 已知未完成（**不是本次范围**，但别以为做完了）

| 项 | 状态 |
|---|---|
| 平台适配：BOSS 直聘 / 猎聘 / 拉勾 | **已过期**（2026-09-18 复核更正）：BOSS（`zhipin`）**已实现**打招呼 / 回复 / 收件箱 / 阶段探测，且经真实账号端到端验证；`zhaopin` 的收件箱 / 阶段探测也已实现（接口化）；猎聘 / 拉勾的适配器**已注册**（列表/详情夹具校准过）但仍无 `actions` |
| 平台适配：牛客 / 实习僧（校招）、Indeed / LinkedIn（海外） | 需求文档标注"⚠️ 待预研"，**未实现**（Indeed 有适配器但默认域已停运，需改配置换域） |
| `greeting_send` 对 51job / zhaopin | 一律 `ADAPTER_BROKEN`：51job 没实现打招呼动作；zhaopin **没有独立的打招呼动作**（IM 发送走网易云信私有 WS），实测后如实标 `supportsGreeting=false` |
| `sendResume` 对 zhaopin | **已实现（2026-09-18 复核更正）**：页面驱动（点「立即投递」→ 验证 `.deliver-greeting-modal`），走 `application.send` 两段式确认；接口路径**刻意不用**（`preparation` 要的 `rootOrgId`/`staffId` 在详情页载荷里出现 0 次，不可逆动作上不能编）。同一次点击会**顺带发一句平台生成的招呼语**，已写进审批文案（`applicationSideEffect`） |
| zhaopin 会话列表 | **已支持翻页**（2026-09-18 复核更正）：实测页长 5 时第 2 页给出另外 5 条、重叠 0 ⇒ 翻页有效；按 `talkListPageSize`（20）× `talkListMaxPages`（3）翻，跨页去重 |
| zhaopin 阶段判据 | 只用 `unreadCount` / `selfReply`（有真实样本）；`oppositeRead`/`oppositeReply` 实测**语义与命名不符**（有未读的会话里也是 0）⇒ 不用，**`read` 这一档判不出来**（返回 null） |
| L2（LLM 语义精评） | 未实现；界面只给"粗筛分" |
| U10 设置 / U11 日志与诊断 | **已实现大半**（2026-09-18 复核更正）：`src/client/screens/settings.tsx` 已有「设置与诊断 / 当前风控态势 / 模型用途 / 系统控制中心 / 诊断 / 模型调用留痕 / 操作审计」；**未逐项核对**原规划清单，若还要做请先重新基线 |
| 薪资箱线图 / 本地基准 / A/B 对比 | 批次 F |
| Word 导出的**像素级**验证 | 做不了：这台机器 Word COM 激活失败（`CO_E_SERVER_EXEC_FAILURE`），只能做 OOXML 级断言 + 让你打开 docx 看 |
| 验收脚本的仓库化 | 脚本都在 `D:\DSH-work\`，**不在仓库**（绑定了本机 profile 与 playwright 安装位置） |

---

## 8. 交付标准（Definition of Done）

一个批次算完成，必须同时满足：

- [ ] `npm run typecheck` 干净、`npm run build` 通过、`npm run verify` 19/19、`npm test` 全绿
- [ ] 新行为有测试；改动的期望值有说明
- [ ] 用**真实浏览器或真实接口**验过（不是"应该没问题"）
- [ ] `README.dev.md` / `ARCHITECTURE.md` / `REQUIREMENTS.md` 按 §5 同步
- [ ] commit 消息写清"改了什么、为什么、怎么验的"，并且**确认已 push**（看到 `xxxx..yyyy main -> main`）
- [ ] 没有留下运行中的测试实例（按 pid 杀干净）
