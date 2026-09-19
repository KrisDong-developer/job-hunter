import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function create(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function get(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function advance(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function assessmentsList(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function assessmentCreate(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function assessmentState(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tripartiteList(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tripartiteCreate(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function tripartiteState(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function talksGet(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function talksPost(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function deadlines(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=campus.d.ts.map