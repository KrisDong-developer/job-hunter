# P0 验证记录 · 槽位链路、Plan B 探测与骨架包端到端

> 日期：2026-09-16 · 环境：DSH Desktop 0.9.0 / Node 24.9.0 / Windows
> 目标：兑现 `ARCHITECTURE.md` §11 的 P0 出口标准 ——「侧栏出现入口、点击切到空面板」，并实测 C7 / C8 / R1 的静态推断
>
> **两轮，两条独立路线**：
> - **第一轮**：动态 Cordis 插件临时探针（ADR-3 明确允许的原型用途），挂在正在使用的 `web` profile 的 GUI 上 —— 快速判定槽位链路与 Plan B。
>   手段：活槽位 Inspect + 人工目视确认。
> - **第二轮**：**真实骨架包** `dsh-job-hunter`（本仓库产物），装进**独立 profile** `p0test`，用 Playwright 真实点击验收。
>   手段：构建产物契约自检 + 独立实例 + 真实浏览器点击。
>
> 两轮结论一致；第二轮把第一轮遗留的 3 项全部补上（真点击、C7 的 DOM 事实、装包/加载）。

---

## 0. 结论速览

| 判据 | 结论 | 证据 |
|---|---|---|
| **P0 出口**：侧栏出现入口 | ✅ **成立** | 活槽位占用者 + 人工目视 + 真实包 DOM |
| **P0 出口**：**点击**切到空面板 | ✅ **成立（真实点击）** | 第二轮：Playwright 点 shell 的按钮 → 面板渲染 |
| **C7**：`sidebar.panellist` 只出图标 glyph，label 由 shell 读元数据 | ✅ **成立，且取到 DOM** | `svg.jh-entry-icon → span.*_panelGlyph → button.*_panelRow[aria-label=求职找工作] → nav.*_panelList[全局面板]` |
| **C7**：做不了红点徽标 → 靠 `shell.overlay` 补偿 | ⚠️ **部分成立**：徽标做不了，但浮层补偿**必须自消失**，否则永久占位 | 活契约 + 人工目视（踩到）+ 真实包验自动消失 |
| **C8**：`main` = `keyed` + `root` scope，面板替换对话区，拿不到 `useSession` | ✅ **成立** | 活契约 + 真实点击切换 |
| **R1**：`selectPanel` 对未注册 key 会抛错 | ✅ **成立**（含错误原文） | 实测 |
| **C1**：只声明 `dsh.client` 会被拒收 | ⚠️ **理由需修正**：结论不变，但不是"被拒收" | 市场源码 |
| **C2**：patch 带 `config:` 必须重启，纯 insert 可热挂载 | ✅ **成立** | 市场源码（安装路径上的真实行为） |
| **C4**：宿主 HTTP 路由没有任何内建鉴权 | ⚠️ **需收窄**：宿主**前端 shell** 有连接级鉴权（带 token 的 URL）；**插件自建路由**确实没有 | 实测 401 + 源码 + 带 token URL |
| Plan B ①：`sidebar.footer.action` | ✅ 槽位存在（加性，已被 `cordis-panel` 占一格） | 活契约 |
| Plan B ②：`shell.overlay` 全框浮层 | ✅ 槽位存在（click-through 层，需条目自行 opt-in 指针事件） | 活契约 |
| Plan B ③：`settings.section` | ✅ 槽位存在 | 活树 |
| Plan B ④：DOM 注入 | **未动用**（主路线两轮都直接成功） | — |
| **真实包装进独立 profile 并加载** | ✅ **成立** | 宿主半 `GET /job-hunter/health` → 200；客户端半进入 index 的组合 bundle URL |
| **热挂载前提**（patch 纯 insert、零 config） | ✅ **成立** | `npm run verify` 断言；对应市场 `parseSimplePatch` 规则 |

**一句话**：`ARCHITECTURE.md` §5 客户端层的主路线（`sidebar.panellist` 入口 + `main` 面板 + `shell.overlay` 补偿）
**在真实运行态、用真实安装的包成立**；Plan B 三级备选也都在，不需要 DOM 注入。

---

## 1. 逐项证据

### 1.1 活槽位契约（Inspect，权威来源）

| 槽位 | kind / scope | replaceRisk | 注册项 | ownerProps |
|---|---|---|---|---|
| `main` | **keyed** / root | `shadows-shipped-ui` | `{ key }` | 无 |
| `sidebar.panellist` | **list** / root | `none` | `{ id, order?, label? }` | `{ size: number, active: boolean }` |
| `shell.overlay` | **list** / root | `none` | `{ id, order?, label? }` | 无 |
| `sidebar.footer.action` | list / root | `none` | `{ id, order?, label? }` | `{ wide: boolean }` |

关键原文（活契约，非文档推断）：

- `sidebar.panellist`：
  > "Global panel icons. **Each list id addresses the matching main panel; the sidebar owns the button and resolves its label from list metadata.**"
  > ownerProps：`SidebarPanelIconOwnerProps { size: number; active: boolean }`
  → **C7 成立**：按钮归 shell，我们只贡献图标内容；label 由 shell 从注册元数据读；能拿到的只有 `size` 与 `active`，**没有徽标位置**。
- `main`：
  > "Central panel selected by sidebar entry id. **The reserved `conversation` key hosts the Conversation; other keys receive no Session binding.**"
  > `keyDomain`: `open: any string the owner dispatches (no compile-time key set), already taken: conversation`
  > standardProps：`useResource / useWorkspaces / usePanelInfo / useSessions / useSessionPendingInteraction` —— **确实没有 `useSession`**
  → **C8 成立**。
- `shell.overlay`：
  > "Frame-wide floating layer… **The layer itself is click-through — entries opt back into pointer events** — so an occupant never blocks the app underneath."
  > 已有占用者 `dsh-market-toast` → **第三方包通过该槽位注册成功是可复现的事实**。
- `layout.selectPanel(panelId: MainPanelId | null): void`
  > "Select a global central panel without changing the current Session."
  > panelId：「registered main key, **or null to show the Conversation**」
  > throws：「**if the selected main key is not registered; preserves the current selection.**」

### 1.2 运行态注册（探针运行期间）

`Slots.listSubTree` 的 `selected.occupants`：

```
main                 → { registrant: "dyn/jhunt-1", key: "job-hunter-p0",  priority: -1, active: true }
                       { registrant: "Ba",         key: "conversation",    priority:  0, active: true }
sidebar.panellist    → { registrant: "dyn/jhunt-1", id:  "job-hunter-p0",  order: 50, priority: -2, active: true }
shell.overlay        → { registrant: "dyn/jhunt-1", id:  "job-hunter-p0-notice", … }
```

→ 三个槽位**全部注册成功**，且**先 `main` 后入口**的注册顺序可执行。

**停止探针后**，`sidebar.panellist.occupants` 回到 `[]` → 槽位贡献随 fiber 释放，**无残留**（对应 C15 / R19 的槽位侧结论）。

### 1.3 人工目视确认（用户在运行中的 GUI 上确认）

用户确认的三项界面事实：

1. 左侧栏出现了「求职找工作」图标入口，图标右上角带小红点；
2. 中央区域已经变成「求职找工作 · P0 空面板」；
3. 右下角出现了「求职找工作 · P0 探针」浮层卡片。

面板内自检清单原文（用户回贴）：

```
槽位链路自检
✔ main 槽位注册成功，key = job-hunter-p0
✔ sidebar.panellist 入口注册成功，id = job-hunter-p0
✔ shell.overlay 浮层注册成功（右下角提示）
C8 / R1 实证
✔ layout.selectPanel('job-hunter-p0') 成功 —— 本面板已接管中央对话区
✔ 对未注册的 main key 调用 selectPanel 会抛错（R1 断言成立）：
  layout.selectPanel: main panel "job-hunter-p0-not-registered" is not registered
```

→ **R1 的抛错语义得到实测原文**；**C8 的"面板替换对话区"得到实测**。

### 1.4 新发现 F1：`shell.overlay` 条目会永久占位

用户附带反馈：**「右下角浮层卡片不会消失，一直占位，是个问题」**。

这是"用浮层补偿无徽标"（C7 → R12）方案的真实缺陷：`shell.overlay` 是常驻层，条目一旦渲染就一直在。探针渲染的是一个**无条件常驻**的提示卡，于是永久遮挡右下角。

**必须落进设计的要求**（已写入 `ARCHITECTURE.md` §5.5 / R12）：

| 要求 | 做法 |
|---|---|
| 无内容不渲染 | 没有未读/告警时组件返回 `null`，**不要**渲染空卡片或常驻占位 |
| 有内容会消失 | 自动超时（如 5–8s）消失，或提供关闭按钮；二者至少其一 |
| 多条要合并 | 告警可能连发，按队列聚合 + 上限（如最多 3 条），避免堆叠成墙 |
| 不遮关键操作 | 尊重层的 click-through 语义，只有卡片自身 opt-in 指针事件 |

> 已实测：探针停止后浮层随之消失 —— 说明**只要条目归 fiber 管，清理是干净的**；问题纯粹是"渲染条件"，不是"清理机制"。

---

## 2. 对 `ARCHITECTURE.md` 的修正（已应用）

| # | 位置 | 修正 |
|---|---|---|
| 1 | §0 约束表后 | 新增「P0 实测补注」：C4 收窄、C7 精确形状、C8 成立、C1 理由改写、C2 成立 |
| 2 | §5.1 要点表 | 「先注册 main」一行补实测错误原文，并指出 `slots.inject` 让同 tick 注册、窗口期实际不存在 |
| 3 | §5.1 要点表 | 新增「注册对象形状（实测）」一行：keyed = `{name,key,locale?}`、list = `{name,id,order?,label?,locale?}`；disposer 语义 |
| 4 | §5.5 要点表 | 新增「浮层必须自消失」（F1） |
| 5 | §11 P0 行 | 标注槽位链路已实测通过 + 尚欠真实包热挂载 |
| 6 | §11 Plan B 段 | 标注三级备选槽位均实测存在，主路线成功故未动用 |
| 7 | §12 R1 | 标注已实测通过并给出错误原文 |
| 8 | §12 R12 | 补 F1 的浮层自消失要求 |

### 2.1 C1：结论不变，**理由要改**

`dshmarket/lib/hot.js` 的 `mountClientOnlyDeps` 对「只有 `dsh.client`、没有 `dsh.bundle`」的包有 **shim 热挂载**路径（给它造一条 `client-<pkg>` 的 loader 行），所以**并非一律拒收**。

但 `dshmarket/lib/check.js` 对**列进 `dsh.profile.bundles` 的包**判定：`bundle declares no dsh.bundle.patch — the profile will fail to boot`。

→ 我们仍然要做 host + client 单包，**理由改为**：① 本来就需要宿主半（sqlite / 浏览器 / 定时 / 路由）；② 作为 profile bundle 必须声明 `dsh.bundle.patch`。而不是"只声明 `dsh.client` 会被拒收"。

### 2.2 C2：**成立且是安装路径上的真实行为**

`dshmarket` 的热挂载只接受纯 insert：`parseSimplePatch` 遇到 config / 表达式行即拒绝，并明确提示「热挂载仅支持纯 insert，重启后生效」。

### 2.3 C4：**需收窄，且影响测试假设**

实测：裸 `GET http://127.0.0.1:43129/` → **401 Unauthorized**。
源码：`dsh-host-frontend-static` 用 **`ctx.connection.authorizeIndex(req, res)`** 授权 index 响应。

→ 收窄为：「**插件自建的 `webServer` 路由**没有任何内建鉴权（同源校验仍必须自建）；宿主**前端 shell 自身**有连接级鉴权。」

**对测试的副作用（重要）**：不能"用任意浏览器打开 `127.0.0.1:43129`"来验收端到端 —— 必须走 Desktop 窗口，或 `dsh web` 给出的带引导凭证的地址。本次实验正是因此失败（详见 §3）。

---

## 3. 未验证 / 遗留项（诚实清单）

第一轮的 5 项，第二轮把其中 3 项补上：

| # | 事项 | 第一轮状态 | 现在 | 说明 |
|---|---|---|---|---|
| 1 | 侧栏按钮 → `selectPanel(id)` 的最后一跳 | 未由人手点击实测 | ✅ **已补**（第二轮） | Playwright 真实点击 shell 的 `<button>` → 中央区切到空面板；且**初始不抢用户视图**（未点击前面板不存在） |
| 2 | `main` 占用者的 `active` 字段语义 | 未定 | ⚠️ **仍未定** | 探针注册后 `job-hunter-p0` 与 `conversation` 同时 `active: true`，**不能**把 `active` 当作"当前是否显示"的判据。本轮改用 DOM 断言（`.jh-root` 存在与否）判定，问题绕开但结论仍未定 |
| 3 | 动态包客户端半是否广播给**后连的页面** | 未判定 | ⚠️ **仍未判定** | 后开页面被 401 挡在引导之前，实验条件不成立。第二轮改用**独立实例 + 带 token 的 URL**，不需要广播，因此该问题对本项目已无实际影响 |
| 4 | **装包加载**：真实包 + `cordis.patch.yml`（独立 profile 端到端） | 未验证 | ✅ **已补**（第二轮） | 宿主半 `GET /job-hunter/health` → 200；客户端半进入 index 的组合 bundle URL 并成功挂载槽位 |
| 5 | C7 的"渲染在 shell 的 `<button>` 内"这一 **DOM 事实** | 未直接取到 DOM | ✅ **已补**（第二轮） | 见 §6.3 的祖先链 —— 真实安装的包里取到了 DOM |

**仍然诚实标注**：

- 「**热挂载**」的严格含义是"装完不重启即生效"。第二轮验证的是**装成 profile bundle 后正常加载**（这是 P0 的出口标准）；
  热挂载的**前提**（patch 纯 insert、零 config）由 `npm run verify` 断言，且与市场 `parseSimplePatch` 的规则一致。
  真要端到端演示"不重启即生效"，需要驱动市场安装流程或 `ctx.plugin(HotTree, …)`，本轮未做。
- 适配器 / sqlite / 调度 / guard / 模型工具全部属于 P1+，本记录不覆盖。

---

## 4. 复现方式

### 4.1 第一轮（动态探针）

```text
# 重新运行探针（定义保留，无需重新定义）
cordis_run  pluginId=jhunt-1  packageId=pkg-1  mode=run

# 查看活槽位
cordis_inspect_query platform=client provider=Slots method=listSubTree input={"root":"sidebar.panellist"}
cordis_inspect_query platform=client provider=Slots method=listSubTree input={"root":"main"}

# 收尾（已执行 stop：界面效果已全部移除，定义与版本保留）
cordis_stop pluginId=jhunt-1
cordis_undefine pluginId=jhunt-1     # 仅在确定不再需要时
```

探针源码：`cordis_inspect_self(pluginId="jhunt-1", packageId="pkg-1")`。

### 4.2 第二轮（真实骨架包）

```powershell
# 1) 构建 + 产物契约自检（不启动 DSH）
cd D:\DSH-work\job-hunter
npm install; npm run typecheck; npm run build; npm run verify

# 2) 独立 profile（已建好，删掉可重建）
dsh --profile p0test --from-default-profile web --dump-config
#   profiles/p0test/package.json 里：
#     dependencies:  { "dsh-job-hunter": "link:D:/DSH-work/job-hunter" }
#     dsh.profile.bundles: [ ..., "dsh-job-hunter" ]
#   然后在该目录 pnpm install

# 3) 起独立实例，拿到带 token 的 URL
dsh --profile p0test --port 4399 --no-open

# 4) 真实浏览器点击验收
node D:\DSH-work\p0-e2e.mjs "http://127.0.0.1:4399/?token=<打印出来的 token>"
```

附带产物（实验留下，可删）：

- `p0-dom-probe.js` / `p0-dom-report.json` —— 第一轮试图用独立页面做 DOM 复核的脚本与报告（记录了 401 与超时，可作 C4 的旁证）
- `p0-e2e.mjs` / `p0-e2e-report.json` —— 第二轮的端到端点击验收脚本与报告
- `p0-diag.mjs` —— 第二轮定位"UI 静默消失"用的页面诊断脚本
- `shots/p0e2e-*.png` —— 验收截图

---

## 5. 第二轮：真实骨架包的端到端验收

### 5.1 被验的产物

`D:\DSH-work\job-hunter`（包名 `dsh-job-hunter` 0.1.0）：

| 产物 | 形状 | 谁消费 |
|---|---|---|
| `lib/host/index.js` | 普通 ESM，导出 `name` / `inject:['webServer']` / `apply` | `exports["."]` → 宿主 loader |
| `client/client.js` | `window.__ModuleLoader__.load({ id, factory })`，react 为 external | `dsh.client` + `exports["./client"]` → 浏览器模块表 |
| `cordis.patch.yml` | 单条 `insert`，零 `config` | bundle patch 层 |

### 5.2 结果

`npm run verify` —— **18 项契约自检全过**（宿主半可导入并导出正确符号、工厂外壳形状、bundle id、
react 是否被误打包、patch 纯净性、清单字段）。

真实实例（独立 profile `p0test`，端口 4399）：

```
GET /job-hunter/health  → 200
{"ok":true,"name":"dsh-job-hunter","version":"0.1.0","phase":"P0",
 "routePrefix":"/job-hunter","hostUptimeMs":87469}

GET /job-hunter/nope    → 404 {"ok":false,"code":"NOT_FOUND"}
```

→ **宿主半真的被挂载并开始服务**；前缀路由与内部 404 分发都正确。

Playwright 真实点击（`p0-e2e.mjs`，7/7 全过）：

```
✔ entryRendered            侧栏入口渲染出来
✔ noticeAppeared           shell.overlay 浮层出现
✔ panelHiddenInitially     未点击前**不**抢用户视图
✔ clickSwitchesToPanel     真实点击入口 → 中央区切到空面板
✔ hostReachableFromPanel   面板读到 /job-hunter/health（客户端 → 宿主链路通）
✔ noticeAutoDismissed      浮层 6s 后自动消失（F1）
✔ backToConversation       「返回对话区」把中央区还给会话
```

### 5.3 C7 的 DOM 事实（第一轮没拿到的那一项）

点击前从页面里取到的入口祖先链：

```
svg.jh-entry-icon                       ← 我们贡献的全部内容（一个 glyph）
└ DIV
  └ SPAN.hHd-Xa_panelGlyph              ← shell 的图标位
    └ BUTTON.hHd-Xa_panelRow            ← shell 自己拥有的按钮，aria-label="求职找工作"
      └ NAV.hHd-Xa_panelList            ← aria-label="全局面板"
```

**结论（逐条对应 C7）**：
1. 我们的内容确实渲染在 shell 的 `<button>` 内 —— C7 的措辞**逐字成立**；
2. 按钮的 `aria-label` 与文本都等于我们注册时给的 `label: () => '求职找工作'` —— 活契约说的
   "the sidebar owns the button and resolves its label from list metadata" **实测成立**；
3. 我们能控制的只有 `svg` 那一层，`span/dimensions` 由 shell 决定 —— 所以**没有徽标位**，
   红点只能贴在图标自身，做不出真正的按钮角徽标 → 未读/告警必须走浮层。

### 5.4 本轮踩到并修掉的坑（已写进 README 与 §5.1）

**客户端插件必须声明 `inject: ['slots']`。**

第一版客户端半在 `apply()` 里 `ctx.get('slots')`，拿到 `undefined`（客户端插件树里本插件被挂载时
`slots` 服务还没出现），于是早退返回 —— 结果是 **UI 静默消失：不报错、不告警、控制台 0 条消息**。
用 DOM 标记（`data-jh-loaded` / `data-jh-applied` / `data-jh-slots`）才定位到。

→ `inject` 的用途正是这个：声明硬依赖，让 cordis 把插件驻留到服务就绪再激活。
同理，只在个别交互里用到的服务（如 `layout`）**不要**在 `apply()` 里一次性抓取，改为懒解析。

### 5.5 对 `ARCHITECTURE.md` 的第二轮修正

| # | 位置 | 修正 |
|---|---|---|
| 9 | §5.1 要点表 | 新增「客户端插件声明 `inject: ['slots']`」一行，附静默失败的实测现象 |
| 10 | §3 构建 | 标注本仓库实际用 esbuild + 自写工厂外壳（文档原写 tsdown），并说明可替换点 |
| 11 | §11 P0 行 | 标注 P0 全部出口标准已通过 |

---

## 6. 对下一步的直接影响

1. **§5 客户端层的形态已定并已验证**：`sidebar.panellist` + `main` + `shell.overlay` 三件套照写；
   **不需要** Plan B，也不需要 DOM 注入。
2. **浮层不是"随手渲染"**：必须条件渲染 + 自动消失，否则会永久占位（本轮已在真实包上验证该行为）。
3. **客户端插件的 `inject` 必须写**：否则 UI 会静默消失 —— 这是本项目第一个"不报错但完全不工作"的坑。
4. **端到端手测的入口要换**：不能用裸 `127.0.0.1:<port>`，必须用启动时打印的带 token 地址。
5. P0 已完成。接下来按 §11 进入 **P1 数据与采集**：sqlite schema/迁移、jobs/companies 领域、
   浏览器管理（含幂等清理）、**字段级断言 + 脏数据隔离**、51job 适配器（用 `dumps/51job-sz.html` 做离线 fixture）、`crawl_run`。
