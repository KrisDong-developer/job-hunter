# 各平台搜索筛选条件 · 证据台账

这份台账回答一个问题：**界面上给我们配的筛选条件，到底哪些是真的能发到平台参数上的？**
每一行都指向一次真实抓取/点击（探针），不是"看文档猜的"。

* 探针：`test/tools/probe-filters.ts`（打开搜索页 → 抓全部 XHR 的 URL/method/请求体/响应体 →
  抓筛选面板 HTML 与内联载荷脚本 → 按文案/选择器/多步点击筛选项 → URL 变体差分）
* 用法：`node scripts/run-ts.mjs test/tools/probe-filters.ts --platforms=waiqi,51job [--headful]`
* 原始报告：`.probe-filters/<平台>-<日期>.json`（未入库）；分析脚本同目录
  （`summarize` / `codes` / `groups` / `values` / `shape` / `post` / `clicks` / `pairs` / `api-diff`）
* 逐条细节与负结果：`.probe-filters/FINDINGS.md`

## 状态总表（2026-09-21）

| 平台 | 筛选证据 | 接线 | 备注 |
|---|---|---|---|
| 神仙外企 waiqi | ✅ 全量：`page-list` 请求体 8 个筛选键 + 3 个码表接口 | ✅ 已接（body） | 修掉了"行业 seed 抄成职能码"；补了 `companyTypeList`（多选） |
| 前程无忧 51job | ✅ 逐个点击得到 5 组 `标签→码` | ✅ 已接（URL） | `degree/workYear/companyType/companySize/jobType`；`issueDate` 实测**会清空结果集**→ 停发 |
| SinoJobs sinojobs | ✅ 点击证明 `salary_range`/`experience` **仍在上报**（只在选中时提交） | ✅ 无需改 | 站点的 6 个筛选容器与我们的声明一一对应 |
| 国聘 guopin | ✅ 10 组筛选字典（~153 项真码）+ 点击拿到形状 `search.<短名>:[码]`；`api-diff` 证明 `experience` 400→48、`major` 400→364 | ✅ **已接（接口）** | 列表改走 `POST /api/jobs/v1/recom-job`：筛选与翻页一起解决，字段还更全（JD 原文、报名截止、区划）；DOM 保留为兜底 |
| 智联 zhaopin | ✅ 9 组字典（`GET /c/i/search/base/data`，真码真标签）+ **点击实测 4 组 `标签→参数→码`** | ✅ **已接（URL）** | 点「本科」→ `…/jobs?jl=765&kw=Java&el=4`、点「1-3年」→ `we=0103`、点「国企」→ `ct=1`、点「全职」→ `et=2`；取值域照抄字典并钉进夹具 `test/fixtures/zhaopin-base-data-filters.json`。列表接口那条路**不走**（见下） |
| BOSS 直聘 zhipin | ✅ 8 组字典（`filter/conditions.json`：degree/experience/salary/jobType/scale/stage/payType/partTime）+ 站点自己的 joblist 表单键名 | ⛔ **待接** | 交付方式未证实：老 profile 掉登录、匿名被 `安全验证` 挡 → 需要**一次人工登录**才能点一次确认 |
| HiredChina | ⛔ 探针被 Cloudflare 挡（全新 profile 拿到挑战页） | — | 绕法：人工过一次挑战后复用该 profile（`--headful`） |
| Indeed | ✅ 变体对照（带基线重跑）：`fromage=1`→4 条、`fromage=7`→16 条、`jt=parttime`→**0 条**、基线两次都是 16 条 | ✅ **已接（URL）** | 新增「发布时间」(`fromage`) 与「职位类型」(`jt`) 两个维度，只收实测过的档位；站点其余筛选是不透明的 `sc=0kf:attr(…)`（学历/远程/薪资），没有可读参数名 → 不声明 |
| 猎聘 liepin | ✅ 面板 HTML 每个可选项都带 `data-key`/`data-code`/`data-name`；点击证明筛选走 `api-c.liepin.com` 的 **POST 体**（`workYearCode=3$5`、`salaryCode=4`、`hrActiveTimeCode=7`、`compTag=qua_0001`） | ⛔ **未接（有反证）** | 把面板里的码**当 URL 参数**直接试：卡片数与基线**一模一样（42/42/42）**→ 页面 URL 不认这些筛选。接通必须改爬取路径（接口 + `ckId/skId/fkId` 会话令牌），本轮不做 |
| 领英 linkedin | ⏳ guest 态实测：搜索 POST 体只有 `keywords` / `locationUnion`，**没有筛选字段** | — 保持现状 | 与该适配器已有声明一致（guest 端点忽略筛选）；登录态未探（要人工登录） |
| 智联/51job 的其余档位 | ⏳ 部分 | — | 51job 的发布时间/规模其余档位文案匹配不到（可能在弹层里）；智联的**薪资/行业/规模/融资**同理（站点登录表单 URL 上出现过 `cs`/`sl`/`in`/`jt`/`li`，但**哪个字典喂哪个参数没验证过**，所以没声明）。现在探针支持**多步点击**（`clickSequences`）可以去点弹层 |

## 接线方式为什么分三种

* **URL 参数**（51job、Indeed 这类）：适配器本来就是"拼 URL + 解析 DOM"，加一个维度 = 加一个
  `wire: { target: 'url', param }`，最省事。
* **请求体**（waiqi、sinojobs、zhipin）：适配器已经在页面里调接口（`page.evaluate(fetch…)`），
  加维度 = 扩展请求体构造 + `wire: { target: 'body', param }`。
* **需要改爬取路径**（guopin、zhipin）：筛选只存在于**页面内搜索接口的请求体**里，而适配器现在
  走 URL + DOM 解析 —— 直接加声明就会变成"界面能配、发不出去"，所以宁可先不声明，等把列表
  改成走接口（含夹具与对账）再接。

## 智联为什么最后走了 URL 而不是接口（2026-09-21 定案）

原先记的是"筛选只在 `POST /c/i/search/positions` 的请求体里"—— 这只说对了一半：

* 那个接口确实带全部筛选（body 里 `S_SOU_FULL_INDEX` / `S_SOU_WORK_CITY` /
  `S_SOU_EDUCATION_LOWESTLEVEL` / `S_SOU_WORK_EXPERIENCE` / `S_SOU_COMPANY_TYPE` /
  `S_SOU_POSITION_TYPE`），但**它要登录态令牌**：query 上要 `at`/`rt`/`x-zp-client-id`，
  body 里还要 `cvNumber`/`resumeNumber`（128 位哈希）。实测这三个令牌：
  - 是**可读 cookie**（`document.cookie` 里就有 `at` / `rt` / `x-zp-client-id`，非 httpOnly）；
  - 但 `cvNumber` / `resumeNumber` **既不在 localStorage、也不在 `__INITIAL_STATE__`、
    也不在 `search/base/data` 的响应里** —— 来源没查清，硬拼一个只会得到一次静默失败的请求；
  - 匿名态**根本不会调这个接口**（对照实验：同一地址换新 profile，103 个请求里一个
    `search/positions` 都没有）—— 也就是说这条路只在登录态存在。
* **而站点自己在加筛选时，用的是页面 URL**：点一下筛选，它跳到
  `https://www.zhaopin.com/jobs?jl=765&kw=Java&el=4` —— 城市从路径段变成 `jl` 参数，
  筛选值用 `el`/`we`/`ct`/`et`（与站点登录表单 URL 上的字母表完全一致）。
  这条路由适配器**本来就在用**：登录态请求 `/sou/jl765?kw=Java` 时服务端会自己 302 到
  `/jobs?jl=765&kw=Java`（实测 `finalUrl` 就是它）。

于是接线方案是"**照抄站点自己的形状**"：没有筛选走 `/sou/jl<码>`（有真实分页、薪资明文），
带了筛选走 `/jobs?jl=<码>&…`。两条路由适配器都得认，而它本来就得认。

顺带修掉一个静默 bug：`postedWithinDays` 在智联是"封闭 + 空值域"（平台上没打通），但它是个
**顶层槽位**，于是老方案里存着的值照样会被拼成 `pd=7` 发出去 —— 一个平台不认的参数。现在不发了
（与 51job 的 `issueDate` 同类，那条实测会把结果集清空）。

## 判定方法（可复用）

1. **找码表**：优先看有没有字典/枚举接口（`by-alias` / `filter/conditions.json` / `base/data` /
   `education-enum`）——一次就能拿全，不用一个个点。
2. **找参数名**：点一次筛选项，看**新出现的请求**里多了哪个键（`clicks` + `pairs` 工具）。
   ⚠️ 形状要对：国聘的 `experience` 必须嵌在 `search` 下、值是数组 —— 形状错了会得出"平台不认"的错误结论。
3. **验证真的生效**：URL 类用 `urlVariants` 比结果卡片数，**必须带对照组**（基线在最后再跑一次），
   否则分不清"参数生效"与"站点限流"；接口类用 `api-diff` 比 `total`（同样带基线对照）。
