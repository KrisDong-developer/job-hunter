import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
/** 原 router.ts L1068-1084。 */
export declare function lease(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1086-1094。 */
export declare function pause(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1096-1099。 */
export declare function reasons(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1101-1104。 */
export declare function schedulerStatus(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=schedule.d.ts.map