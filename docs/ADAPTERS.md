# 适配器维护手册

> 目标：平台改版把选择器打坏时，能**不用重读一遍全部代码**就完成定位 → 复现 → 修好 → 验证。
> 依据：`ARCHITECTURE.md` ADR-19 / R5 / D-18。

## 0. 现状一览（别按文档假设）

| 平台 | 适配器 | 状态 |
|---|---|---|
| 前程无忧 51job | `src/host/platform/adapters/fiftyone-job.ts` | ✅ 可用：列表页解析 + 字段级断言 + 降级告警 |
| BOSS 直聘 / 猎聘 / 拉勾 | 无 | 实测有风控墙（R4），**未实现** |
| 牛客 / 实习僧（校招） | 无 | 需求 §4.L 标注"⚠️ 待预研"，**未实现** |
| Indeed / LinkedIn（海外） | 无 | 需求 §4.M 标注"⚠️ 待预研"，**未实现** |

「未实现」= **没有代码**，不是"代码在但没测过"。别把它们当成可用的降级选项。

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
再调用，从源码层面切断闭包。新增真路径代码时必须让它落在这条测试的覆盖范围内。

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

# ④ 离线全绿（408 个测试，绝不访问真实招聘站）
npm test
```

生效时机：**配置在装配时读取一次**，改完 DB 需要让插件重新加载（重启该 profile 最稳）。
改稳之后，把最终值回写到 `DEFAULT_FIFTYONE_CONFIG`，让新用户不必手工写 DB。

## 5. 新增一个平台

1. 实现 `SiteAdapter`（`platform/types.ts`）：`id` / `displayName` / `capabilities` / `list()` / `detail()`；
2. 解析函数遵守 §2 的自包含约束；
3. 在 `platform/registry.ts` 注册（**id 重复会直接抛错**，这是刻意的；注册返回 disposer，随 fiber 卸载）；
4. 加**离线 fixture**（保存的页面）+ 字段级断言测试 + `--break-selectors` 降级测试；
5. 若该平台有「打招呼 / 投递」动作，必须在 `guard/actions/` 里实现并配测试。
   目前 **51job 的打招呼动作未实现**：`greeting_send` 对它一律返回 `ADAPTER_BROKEN`（HTTP 409），
   文案是「前程无忧 的适配器还没实现打招呼动作」。这是**刻意的 fail-closed**，不是 bug。

## 6. 明确不要做的事

- **不要引入反检测 / 指纹伪装**（D-17 / R18）。文档里提过预留 `fingerprint.ts` 扩展点，
  但代码里**并没有这个文件** —— 不实现伪装是刻意的取舍，不是遗漏。
- **不要在自动化测试里访问真实招聘站**（§14）。跑端到端脚本时用
  `DSH_JOB_HUNTER_NO_NETWORK=1` 强制拒绝 `crawl()`/登录引导。
  这条闸门是因为"只写在文档里的红线实测挡不住"才加的（见 README 坑 11）。
- **不要为了"抓得多"调高频率或并发**。定时抖动、单实例租约、请求间隔随机、定向选择器都是刻意的保守设计。
