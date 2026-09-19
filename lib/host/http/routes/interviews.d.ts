import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function create(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function conflicts(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function upcoming(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function get(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function patch(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function remove(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function setState(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function review(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function prep(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=interviews.d.ts.map