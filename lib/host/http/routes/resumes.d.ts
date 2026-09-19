import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function create(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function get(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function patch(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function remove(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function duplicate(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function setDefault(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function preview(ctx: RouteContext): Promise<RouteResult | undefined>;
/** `export` 是保留字、不能当函数名 —— 所以导出名是 `exportResume`，路由表里也写这个名字。 */
export declare function exportResume(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function files(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tailor(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tailoringsList(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tailoringsAdopt(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=resumes.d.ts.map