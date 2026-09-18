# 神仙外企（waiqi.com）平台调研与适配器落地

> 调研时间：2026-09-18（全部结论来自线上实测，不是猜的）
> 产出：`src/host/platform/adapters/waiqi-job.ts`、`test/platform/waiqi.test.ts`、
> 夹具 `test/fixtures/waiqi-position-{sz.html,payload.json}`
> 前置阅读：`docs/ADAPTERS.md`（适配器维护手册）

---

## 0. 一句话结论

**这是一个"接口站"，不是"页面站"**：`/position` 的 HTML 里没有岗位列表，
列表由 `POST https://backservice.offerxiansheng.com/api/position-service/social-position/foreign/page-list`
的 JSON 渲染而来。所以适配器的取数路径是**在页面上下文里 `fetch` 那个接口**，
而不是 `querySelectorAll` 抓卡片 —— 抓 DOM 只会拿到空壳。

两条会影响产品行为的硬事实：

1. **服务端翻页是坏的**：`page>=2` 恒定返回 `positionVO.records = []`（`size` 取 1/3/10/20/21/50 都一样）。
   → 适配器声明 `maxPages = 1`，**不假装能翻页**。
2. **单页容量上限 50**：`size=50` 正常，`size=100` 直接 `code=1010 "size最大为50"`。
   → 一次最多 50 条。

---

## 1. 站点形态

| 项目 | 实测结果 |
|---|---|
| 技术栈 | Vue 3 SPA（webpack 分包，`/static/js/app.*.js`），**纯前端渲染，无 SSR** |
| 渲染载荷 | 首屏 HTML 只有 `<div id="app"></div>` + 分包脚本，**没有任何岗位数据** |
| 页面路由 | `/position`（职位列表，name=`positionList`）、`/position/detail?id=&posType=`、`/company`、`/company/detail`、`/search`、`/resume`、`/community`、`/member`、`/user/*` |
| 移动端跳转 | JS 里按 UA/path 把 `/position/detail` 重定向到 `m.waiqi.com/pages/position/detail`；PC 采集不受影响 |
| robots.txt | `Disallow: /position/detail`，其余 `Allow: /` |
| 接口集群 | `https://backservice.offerxiansheng.com/api/{position,user,resume,backend}-service` |
| 静态资源 | `https://image.waiqi.com/...`、`https://recruit-pro01.oss-cn-chengdu.aliyuncs.com/...` |
| 登录 | 微信扫码 / 手机号验证码；列表**匿名可读**，投递/收藏/订阅要登录 |

### 1.1 服务端口径（前端的 baseURL 原文）

```js
// position-service（列表、详情、城市、标签）
axios.create({ baseURL: 'https://backservice.offerxiansheng.com/api/position-service' })
// 请求拦截器固定加两个头：
//   access-token: <本地存的 token，匿名时为空串>
//   source: 24
// 响应约定：code === 200 | 0 | 1000 视为成功，其余 reject
```

关键 code（实测）：

| code | 含义 | 我们看到它时该做什么 |
|---|---|---|
| `1000` | 成功 | 正常解析 |
| `1010` | 参数校验失败（如 `size>50`、`page` 缺失） | **我们的 bug** → `PARSE_FAILED`，不判成"墙" |
| `996` | 请求方法不对（GET/POST 用反了） | 同上 |
| `998` | 参数缺失或类型错误 | 同上 |
| `999` | 服务端数据异常（如 `type=0`） | 同上 |
| `1022` | 需要登录 | 判成 `login-required`，交还人工 |
| `429` | 频控（`访问行为异常，请稍后再试`），探针实测会触发 | 判成 `rate-limited`，停手退避 |

### 1.2 `/` 之外的旁路入口

`/position` 的列表页组件（`chunk-ce4890b6`）同时挂了「标签专场」接口
`POST /position/all/page-list`（带 `tagId`），实测可返回 6 万+ 条。
本适配器**不用它**：它要求 `tagId`，语义是"某个标签专场"，不是通用搜索。

---

## 2. 列表接口契约（适配器的唯一数据来源）

```
POST {apiBase}{listPath}
  apiBase  = https://backservice.offerxiansheng.com/api/position-service
  listPath = /social-position/foreign/page-list
Headers:
  content-type: application/json;charset=UTF-8
  source: 24
  access-token: <可空>            # 匿名可用；带上则带登录态
Cookie: 同源自动携带（页面上下文 fetch 的 credentials:'include'）
```

### 2.1 请求体

必填：`page`、`size`。其余都是可选筛选。

```jsonc
{
  "expectId": 0,          // 求职意向 id，0 = 不限
  "status": 1,            // 实测对结果无影响
  "sort": 0,              // 页面没有排序控件；实测 0..5 都能收，但结果不变
  "type": 2,              // 2 = 外企（页面默认）；1 = 不限；0 → code 999
  "page": 1,              // ★ page>=2 恒返回空
  "size": 50,             // ★ 上限 50，>50 → code 1010
  "needAd": 1,            // 与真实页面一致：records 里会混入广告卡片
  "name": "Java",         // 关键词（★ 只有这个键生效）
  "cityIds": "248",       // 城市 id（逗号分隔可传多个）
  "workExp": "3",         // 工作经验档位
  "education": "2",       // 学历档位
  "posIds": "209",        // 职能 id
  "businessCategoryIdList": "30",   // 行业 id
  "companyTypeList": ["外企"]       // 企业性质（数组）
}
```

**实测生效 vs 不生效（这一节最值钱，别再试一遍）**：

| 想筛什么 | 写法 | 实测 |
|---|---|---|
| 关键词 | `name` | ✅ 生效（`name=市场` → 26 条 / 全量 918 条） |
| 关键词（想当然的写法） | `keyword` / `positionName` / `searchKey` / `posName` | ❌ **被静默忽略**，原样返回全量 |
| 城市 | `cityIds` | ✅ 生效 |
| 城市（想当然的写法） | `cityName` / `city` | ❌ 被忽略 |
| 工作经验 | `workExp` | ✅ 生效（0~5 有效，6/7 恒 0 条） |
| 学历 | `education` | ✅ 生效（见 §4 的值域） |
| 职位范围 | `type` | ✅ 生效（1/2/3 收，0 报错） |
| 职能 / 行业 / 企业性质 | `posIds` / `businessCategoryIdList` / `companyTypeList` | ✅ 生效（本轮未声明进适配器，见 §6） |
| 发布时间窗 | 无此参数 | ❌ 平台不提供 |
| 排序 | `sort` | ⚠️ 收参数但**结果不变**（0..5 逐条对比 id 顺序一致）→ 不声明 |
| 外企标签 | `foreignCompanyTag` | ❌ 被忽略 |
| 只看已登录投递的 | `status` / `expectId` | ❌ 被忽略 |

> 「静默忽略」是这个平台最危险的地方：**参数写错不报错，只是不筛**。
> 所以适配器只声明上面打 ✅ 的维度；没验证过的一律不声明（SR-42 的同类取舍）。

### 2.2 响应体

```jsonc
{
  "code": 1000,
  "message": "success",
  "data": {
    "count": 912,            // ★ 当前筛选下的结果数（不是"已取回条数"）
    "totalCount": 60266,     // 平台全部在招岗位数
    "browseCount": null,
    "collectionCount": null,
    "sort": 0,
    "positionVO": {
      "records": [ /* 岗位或广告卡片 */ ],
      "total": 50,           // 本页条数
      "size": 50, "current": 1,
      "pages": 1
    }
  }
}
```

`records` 里**混着广告卡片**（`needAd=1` 时）：广告没有 `id`，适配器按"没有 id 就跳过"处理。
实测一页 20 条里可能夹 1 条广告。

单条岗位记录的字段（实测全量，节选我们真正用的）：

```jsonc
{
  "id": 255831,                  // ★ 平台岗位 id（upsert 键）
  "name": "精整操作员",           // ★ 标题（可能为空，此时用 nameEn）
  "nameEn": "Finishing Operator",
  "companyName": "ANDRITZ 安德里茨",
  "companyId": 39300,
  "cityNameList": "佛山市",       // ★ 注意：是**一个字符串**，不是数组
  "cityIds": "252",
  "districtName": null,
  "salaryMin": null, "salaryMax": null,   // 单位 K；可为 null
  "coefficient": 12,                      // ★ 年发薪月数（12 / 13 / null）
  "negotiable": 1,                        // ★ 1 = 面议
  "workExpName": "1-3年", "workExp": 2,
  "educationName": "不限学历", "education": 0,
  "postType": 1, "postTypeName": "社招",
  "posType": 1,                           // ★ 详情页 URL 要用它
  "posInfoName": "其它职位", "posCategoryName": "其它职位类别",
  "businessCategoryNameList": "机械/制造业", // 行业
  "scaleName": "10000人以上",               // 公司规模
  "companyType": "外企",                    // 企业性质
  "foreignCompanyTag": null,                // 美企/德企/瑞士外企…（多为 null）
  "tagNameList": null,                      // 平台标签数组，如 ["女性友好","学历友好"]
  "attribute": null,                        // 另一套标记，逗号分隔，如 "急招,可远程"
  "informationSource": "successfactors",    // 企业用的 ATS 名（很有信息量）
  "outsideUrl": null,                       // 非空 = 投递跳企业官网
  "sendType": 2,
  "source": 3,                              // 2 = 平台自投，3 = 官方渠道抓取
  "createTime": "2026-09-17 11:18:51",      // ★ 本地时、无时区
  "updateTimeStr": "2分钟前更新",
  "logoUrl": "https://image.waiqi.com/...",
  "status": 1
}
```

### 2.3 详情接口（本轮未接进采集链）

```
GET {apiBase}/social-position/details?id=256420
→ data.description = 完整 JD（纯文本，含中英文）、workExp、education、companyId…
```
适配器暂不抓详情：列表字段已经够入库，且详情是**逐条**请求
（50 条 = 50 次请求），在风控与礼貌之间不划算。需要 JD 时再按需补。

---

## 3. 分页与容量（决定 `maxPages`）

实测矩阵（无筛选，`type=2`）：

| 请求 | 结果 |
|---|---|
| `size=1 / 3 / 10 / 20 / 21 / 50` + `page=1` | ✅ 正常，返回对应条数，`count≈911` |
| `size=100` | ❌ `code=1010, message="size最大为50"` |
| `page=2 / 3 / 4`（任意 `size`） | ⚠️ `code=1000` + `positionVO.records=[]`，`count/totalCount` 变 null |
| `page=0` | ⚠️ 返回一页数据但 `count/totalCount` 为 null（等价 page=1） |

**结论**：能稳定拿到的是「**一页、最多 50 条**」。
页面上也确实只有"滚动加载第一页 + 登录遮罩"，没有传统分页器。

> 为什么这条必须写进代码注释：`page=2` 返回的是**成功响应 + 0 条**。
> 如果声明 5 页，主链会把 4 次"成功但空"记成正常结果 ——
> 正好落进 §4.2.4 要防的「今天没有新岗位」静默失败。

---

## 4. 筛选维度的取值域（实测）

### 4.1 城市（`cityIds`）

城市 id **是平台自增主键，不能按行政区划码猜**（北京=35、上海=37、深圳=248、苏州=124、佛山=252…）。
解析方式（已逐个实测）：

```
GET {apiBase}/city/search?name=深圳
→ {"code":1000,"data":[{"id":248,"name":"深圳市","type":2,"parentId":20,...}]}
```

- `name` 支持**不带"市"**（`深圳` → 248，`北京市` 也认）。
- 省级列表：`GET /city/query/list?parentId=0`；某个省下的城市：`parentId=<省 id>`。
- `全国` / `远程` 查不到（返回空数组）——"全国"不是一个城市，是靠**不传 `cityIds`** 实现的。
- **多城市**：`cityIds` 原生接受逗号拼接的多个城市码（如 `"248,247"` 一次筛深圳+广州）。
  适配器的 `city` 支持逗号分隔输入（`深圳,广州`），自动映射并拼码（`splitCityList`）。

适配器内置 48 个已实测城市；补充城市走 DB 覆盖（§7）。

### 4.2 工作经验（`workExp`）与学历（`education`）

```
GET https://backservice.offerxiansheng.com/api/backend-service/enum/education-enum?scene=not_limit
→ [{"name":"不限","type":"0"},{"name":"初中及以下","type":"6"},{"name":"高中","type":"7"},
    {"name":"中专/中技","type":"8"},{"name":"大专","type":"1"},{"name":"本科","type":"2"},
    {"name":"硕士","type":"3"},{"name":"博士","type":"4"}]
```
注意**不是从 0 递增**：6/7/8 是初中/高中/中专。适配器按这个原文声明值域。

`workExp` 实测点数（`count`）：0=不限(912)、1=1年以下(51)、2=1-3年(190)、
3=3-5年(171)、4=5-10年(270)、5=10年以上(115)、**6/7=0（无效档位）**。

### 4.3 职位范围（`type`）

`2` = 外企（页面默认，置顶的是"官方渠道"岗）；`1` = 放宽到合资/民营；
`3` 也能收（等同 2 的行为）；`0` → `code 999`。

---

## 5. 登录态与风控

| 信号 | 实测 |
|---|---|
| 匿名能否搜 | ✅ 能，返回 20 条后页面盖一层「登录账号，查看更多好职位」遮罩 |
| 列表接口匿名 | ✅ 可用（`access-token` 为空串即可） |
| 需要登录的接口 | `code=1022`：`/social-position/favorite*`、`/position-tag/sys-and-user-list`、`/social-position/all-position-count` 之外的部分收藏类接口 |
| 验证码 | 本轮未触发；站点自己带百度统计与腾讯地图，无可见反爬组件 |
| 频控文案 | 未观察到；适配器仍按 `访问过于频繁|操作频繁|请稍后再试|系统繁忙` 兜底识别 |
| **匿名接口频控** | **实测会撞 `code=429 访问行为异常，请稍后再试`**：探针短时间连发十余次匿名请求即触发，冷却几十秒后恢复。→ 适配器把 `429` 判成 `rate-limited`，停手退避，不硬重试 |

**适配器的判墙策略**（`detectBlockInPage`）：

- 结构性信号：验证码容器、限流文案、空白页（卡片 0 且正文 < 80 字）；
- 接口信号：`code=1022` → `login-required`；`code=429` → `rate-limited`（实时探针触发证实，P5）；
- `1010/996/998/999` **刻意不判成墙** —— 那是我们自己的 bug，
  判成墙会被当成"要用户重新登录"，把真问题藏起来；让它以 `PARSE_FAILED` 暴露。

`auth.isLoggedIn` 只看**正向结构性信号**（有没有用户头像），
不看"页面上有没有『登录』两个字" —— 后者在正常页面上也成立，会导致永远判定未登录。

---

## 6. 本轮没做 / 刻意不做的事

> **本轮新增（适配器已落地）**：`city` 支持逗号分隔**多城市**（`cityIds` 逗号拼接，平台原生支持，见 §4.1）；
> 解析时额外捕获 `posCategoryName`（职能分类 → `tags['职能·…']`）与 `address`（`districtName` 为空时回填 `district`），
> 实测字段见 §2.2。

| 项 | 原因 |
|---|---|
| 翻页 | **服务端坏了**（§3），声明 1 页 |
| 发布时间窗筛选 | 平台无此参数 |
| 排序 | 参数能收但结果不变，没有可用取值 |
| 职能（`posIds`）/ 行业（`businessCategoryIdList`） | ✅ 实测生效，本轮以 **实测 seed** 声明为可选维度（职能 16 项 / 行业 13 项，覆盖 IT/医药/金融/销售 等高频类）。完整表（职能=两级树、行业=`getBusList`）较大，走**人工维护 + DB 覆盖**补齐 `config.posInfoList` / `config.businessCategoryList` |
| 企业性质（`companyTypeList`） | 实测生效，但语义与既有 `type`（外企/不限）**重叠**，且全量取值域为接口加载 —— 暂不声明；要加时传**数组** `["外企"]` |
| 详情页 JD | 逐条请求，成本/风控不划算（需要时再按需补） |
| 打招呼 / 投递（`actions.*`） | 要登录态，且大量岗位投递是**跳企业官网 ATS**（`outsideUrl`）。按"不编选择器"的原则 fail-closed |
| 标签专场接口 `/position/all/page-list` | 语义是"某个标签的专场"，不是通用搜索 |
| 指纹伪造 / 代理池 | 项目红线（D-17），不做。环境一致性由平台层统一提供（D-17a），适配器不感知 |

---

## 7. 怎么改（运维视角）

配置在 DB 里覆盖（ADR-19），只需要写要改的键，会与代码默认值**浅合并**：

```bash
node -e "const{DatabaseSync}=require('node:sqlite');\
const db=new DatabaseSync(process.env.DSH_HOME+'/job-hunter/data.db');\
db.prepare(\"INSERT INTO setting(key,scope,scope_ref,value_json,updated_at) \
VALUES('adapter-config','platform','waiqi',?,datetime('now')) \
ON CONFLICT(key,scope,scope_ref) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at\") \
.run(JSON.stringify({cityCodes:{东莞:263,珠海:249},
  posInfoList:[{id:323,name:'算法工程师'}],      // 职能（posIds）取值域，整表替换
  businessCategoryList:[{id:33,name:'IT技术'}]   // 行业（businessCategoryIdList）取值域，整表替换
}))"
```

> ⚠️ `posInfoList` / `businessCategoryList` 走的是**整表替换**（不是浅合并）：
> 传了就完全用你这份，DB 里不用重复内置 seed。

生效时机：**配置在装配时读一次** —— 改完要让插件重新加载（重启 profile 最稳）。
装配日志会打印 `适配器 waiqi 已注册（配置来源：代码默认 | DB 覆盖）`。

平台改版时按这个顺序排查：

1. **先看接口**（列表为空 ≠ 平台没岗位）：`POST .../social-position/foreign/page-list` + `{page:1,size:5}`；
2. 如果 `code` 不是 1000 → 看 §1.1 的 code 表；
3. 如果 `code=1000` 但 `records` 结构变了 → 改 `DEFAULT_WAIQI_CONFIG.fields`（或 DB 覆盖）；
4. 夹具更新：`test/fixtures/waiqi-position-payload.json` 存**原样响应**，
   `waiqi-position-sz.html` 是外壳（卡片 DOM 只用于"等渲染"与"数卡片"）；
5. 跑 `npm test`，`test/platform/waiqi.test.ts` 里的「按源码重建函数」用例会顺手守住
   `page.evaluate` 的自包含约束。

---

## 8. 与另外两个适配器的关系（同一套契约下的不同实现）

| | 51job | 智联 | 神仙外企 |
|---|---|---|---|
| 数据在哪 | 列表页 DOM（+ tracking 载荷） | DOM 为主、内嵌 `__INITIAL_STATE__` 补 | **只有接口 JSON** |
| 取数方式 | `querySelectorAll` | `querySelectorAll` + 读 script | **页面上下文 `fetch`** |
| 翻页 | URL 参数，最多 5 页 | path 段，最多 10 页 | **服务端坏 → 1 页** |
| 薪资 | 明文（`1.3-1.8万`） | 明文（`8000-16000元`） | 大量 null → **"面议"兜底** |
| 核心风险 | 极验 + 频繁访问 | 加筛选即撞登录墙 | **参数写错被静默忽略** |

三者共用同一个 `SiteAdapter` 契约、同一套字段级断言与降级机制 ——
新增平台**不需要**改抓取主链（`domain/crawl.ts` 的 `maxPages`/`health` 逻辑已是通用的）。
