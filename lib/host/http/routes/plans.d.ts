import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function create(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function validateDraft(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function validate(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function patch(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function remove(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function run(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function resume(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=plans.d.ts.map