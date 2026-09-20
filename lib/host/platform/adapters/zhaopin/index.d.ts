/**
 * 智联招聘（zhaopin.com）适配器 —— 列表页采集。
 *
 * ## 先纠正一个会让人白写一遍的坑：`/jobs?jl=` **不是**搜索页
 *
 * 实测（2026-09，直接抓取线上）有两个长得像搜索页的路由，**DOM 完全不同**：
 *
 * | 路由 | 卡片选择器 | 薪资 | 翻页 |
 * |---|---|---|---|
 * | `https://www.zhaopin.com/jobs?jl=765&kw=Java` | `.job-card` | **被掩码成 `**-**元`**（未登录） | 无，第 20 条后是 `.job-list-login-gate` |
 * | `https://www.zhaopin.com/sou/jl765` | `.joblist-box__item` | **明文**（`8000-16000元` / `1.5-2.5万·20薪`） | 有真实分页，未登录可翻到深页 |
 *
 * 两者都有 `__INITIAL_STATE__`、都能出 20 条，所以"抓到了数据"并不能证明抓对了页面。
 * 本适配器**以 `/sou/jl<code>` 为搜索入口**（有分页、薪资明文）—— **但不假设一定能落到它**：
 *
 * ## ⚠️ AB 分流：`/sou/` 自己也会被丢到 `/jobs` 老路由（2026-09-18 新实测）
 *
 * 同一地址 `/sou/jl765?kw=Java` 连打两次，一次落到 jobinfo 明文页（→ `/sou/jl765/kw<token>/p1`、
 * 薪资 `1-1.1万`），一次被服务端分流到旧 `/jobs` 掩码页（`.job-card`、薪资 `**-**元`）。
 * 所以「只认 `/sou/`」**不够** —— 分流去的那半，DOM 卡片与薪资都变了套。
 * 应对（本适配器的两处兜底，详见下方「AB 分流兜底」节）：
 *   - `detectBlockInPage`：只要 `__INITIAL_STATE__.positionList` 有真数据，就不判登录墙；
 *   - `extractJobsInPage`：DOM 卡片为 0 但载荷有真值时，凭载荷补开出数（薪资取明文 `salary60`）。
 * 总之 **`positionList` 载荷才是唯一权威数据源**，DOM 只负责"页面实际展示了什么"这一层证据。
 *
 * ## 数据来源：DOM 为主，内嵌载荷补时间与公司信息
 *
 * `/sou/` 的卡片 DOM 已经带齐了核心字段（标题/薪资/城市·区·街道/公司/经验/学历），
 * 所以 DOM 是主路径 —— 它也是"页面实际展示了什么"的直接证据。
 * `__INITIAL_STATE__.positionList` 与卡片**渲染顺序一致**（都 20 条、逐条对得上），
 * 用它补 DOM 上没有的 `publishTime`、`industryName`、`companySize` 与岗位 id。
 * 载荷缺失时降级为纯 DOM，并留下 note —— 不静默。
 *
 * ## robots 取舍（用户已确认）
 *
 * `robots.txt` 含 `Disallow: /*?*`，即**禁掉所有带 query 的 URL**。
 * 而站点自己的分页链接是无 query 的 path 形式 `/sou/jl765/kw<token>/p2`（或 `/sou/jl765/p2`）。
 * 所以本适配器的取词策略是：
 *   - **只在第 1 页**用 `?kw=<明文>` 取词（这是唯一能按关键词进来的方式）；
 *   - **第 2 页起优先用站点自己给出的无 query path 链接**（从分页区真实 href 里读），
 *     拿不到才退回 query 形式。
 * 这样合规面最大，同时保留关键词搜索。
 *
 * ⚠️ 顺带记下两条实测事实，避免后来者踩：
 *   1. path 里的 `kw` **只接受站点自己发的 token**：`/sou/jl765/kwJava/p1` 会返回
 *      0 条 + `noJobTip`（"登录之后再搜索"）。**绝不要自己造 token。**
 *   2. path 的 `/p<N>` 会**覆盖** query 的 `p`，两种形式不要混用。
 *
 * ## 本目录分工
 *
 * * `index.ts` —— 只导出 `createZhaopinAdapter` 与 `ZhaopinAdapterOptions`；含适配器编排、
 *   `detectBlockOf` / `assertActionPage`（判墙的**唯一实现**，采集与动作链共用）与 `dimensions`。
 * * `config.ts` —— 选择器 / URL 参数 / 值域 / 城市码 / 判墙信号 + 默认配置与 `mergeZhaopinConfig`。
 * * `urls.ts` —— 搜索 URL 与会话列表接口地址的**宿主机侧**构造（不碰 `document`）。
 * * `api.ts` —— 会话列表接口：页面内 fetch 通道 + 响应收敛 + 会话行 → 收件箱/接触态。
 * * `actions.ts` —— 动作链（readInbox / detectStage / sendResume）及它们共用的 `waitFor`/`fetchTalkRows`。
 * * `page/*.ts` —— `page.evaluate` 送进浏览器的**自包含**解析函数（列表 / 详情 / 投递 / 判墙），
 *   每个文件头部都重申"不得引用模块级值"这条硬约束。
 */
import type { SiteAdapter } from '../../types.js';
import type { ZhaopinConfig } from './config.js';
export interface ZhaopinAdapterOptions {
    config?: ZhaopinConfig;
    /** 抓取请求之间的随机延时区间（§P5 保守优先）。 */
    delayRangeMs?: [number, number];
    /** 等列表渲染出来的上限（ms）。 */
    waitForListMs?: number;
}
/** 构造智联招聘适配器。 */
export declare function createZhaopinAdapter(options?: ZhaopinAdapterOptions): SiteAdapter;
//# sourceMappingURL=index.d.ts.map