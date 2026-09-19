import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function groups(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function sweep(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function group(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function dropGroup(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function split(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=dedup.d.ts.map