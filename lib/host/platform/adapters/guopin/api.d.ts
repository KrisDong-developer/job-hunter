/**
 * 国聘网的**列表接口**（`POST /api/jobs/v1/recom-job`）—— 宿主机侧的纯函数 + 一个页面内取数函数。
 *
 * ## 为什么必须走接口
 *
 * 2026-09-21 探针实测（见 `docs/FILTER-EVIDENCE.md`）：
 *   * 站点的筛选**只存在于这个接口的请求体**里 —— 点「1-3年」→ `search.experience=["113aJGtA"]`，
 *     点「社招」→ `search.nature=["113Fc6wc"]`；页面 URL 不跟着变；
 *   * `api-diff` 实测这些键**真的会筛**：`experience` → total 400→48、`major` → 400→364
 *     （同一份字典里的其它键按测过的形状不生效，所以**没声明**它们）；
 *   * 而老的"URL + DOM"路径连翻页都做不到（`?page=` 被 SPA 忽略，只能页面内连点「下一页」）。
 *
 * 接口记录还比卡片 DOM 更全：JD 原文（`contents`）、**报名截止**（`end_time`，校招硬截止要用）、
 * 区划数组、学历/经验的显示名 —— 所以列表改走接口是"顺带把字段也搞准"。
 *
 * ⚠️ 页面内取数函数会被 `page.evaluate` 序列化后送进浏览器：**必须自包含**（不引用模块作用域）。
 */
import type { RawJob, SearchCriteria } from '../../types.js';
import type { GuopinConfig } from './config.js';
/** 一次列表接口的结论：这一页的记录 + 分页信息（`hasNextPage` 靠它算，不靠点按钮）。 */
export interface GuopinListPage {
    jobs: RawJob[];
    page: number;
    pageSize: number;
    total: number;
}
/**
 * 接口请求体 —— 形状照抄站点自己那一次（2026-09-21 抓包）：
 * `{ search: { page, page_size, keyword, experience:[码], major:[码] }, recom: {...} }`。
 */
export declare function buildGuopinListBody(criteria: SearchCriteria, page: number, pageSize: number): string;
/**
 * 在**页面上下文**里 POST 一次列表接口。
 *
 * 为什么在页面里发而不是 Node 直连：接口要页面的 cookie / 同源身份，而且这样与
 * "先正常导航一次"的既有流程共用同一份浏览器上下文（waiqi / sinojobs 同款做法）。
 * 没有 `fetch`（离线夹具的 jsdom）或请求失败 → 返回 `null`，调用方退回 DOM 路径。
 */
export declare function fetchGuopinListInPage(arg: {
    url: string;
    body: string;
}): Promise<unknown>;
/** 把接口载荷收敛成 `RawJob[]`；形状不对就返回 `null`（调用方退回 DOM）。 */
export declare function guopinListPageOf(payload: unknown, config: GuopinConfig): GuopinListPage | null;
//# sourceMappingURL=api.d.ts.map