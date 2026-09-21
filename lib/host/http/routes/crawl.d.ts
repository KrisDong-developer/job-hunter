import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function status(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function runs(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function run(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function once(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function dimensions(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * 把方案条件翻成"每个平台**实际会发出的请求**"。**不发任何请求**：走的是采集主链
 * 用来拼 URL / body 的同一批纯函数（`platform/preview.ts`）。
 *
 * 为什么值得一条接口：界面上写的条件、校验放行的条件、真正发出去的请求是三件事，
 * 而它们分叉时用户什么都看不到 —— "筛了没结果"与"根本没筛"长得一模一样。
 * 这条接口把那第三件事变成可读的数据，方案表单在保存前就能显示
 * "这个条件落到哪个参数上、哪个条件根本没有平台会用"。
 *
 * 低危：只读注册表、不写库、不开浏览器。
 */
export declare function previewCriteria(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=crawl.d.ts.map