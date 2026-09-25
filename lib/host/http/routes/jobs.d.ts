import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function facets(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function batchMark(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function views(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function exportList(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function detail(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * 记一次**已读**（用户打开了详情）。
 *
 * 与 `/mark` 分开是刻意的：`/mark` 是**用户的决定**（收藏/忽略/归档），
 * 这条是**事实**（我看了）。混用一个端点的话，"打开详情"迟早会变成"改处置态" ——
 * 那正是"浏览了还显示新"与"不小心改掉收藏"两种毛病共用的病根。
 *
 * 幂等：重复调用安全（`read_at` 只写第一次）。读不到岗位是 404，不静默成功。
 */
export declare function read(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function mark(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=jobs.d.ts.map