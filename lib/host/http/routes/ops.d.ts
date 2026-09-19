import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function systemReveal(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function llmCalls(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function audit(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `GET /guard/usage` —— D7 的额度读数（U0「额度余量」的数据面）。
 *
 * 在它之前，额度**只在被拒的那一刻**才说出来（`checkQuota` 的 deny 文案）：
 * 用户会去设置里把每日额度调大，却发现还是被拒 —— 因为限住他的是**平台侧上限**。
 * 所以每一格都带 `platformCap` 与 `limitedBy`，让"该改哪里"是读得出来的。
 *
 * 与抓取配额（`/platforms` 的 `governance.todayRuns`）**不是一回事**：
 * 那个数的是"自动跑了几轮采集"，这个数的是"发了几条招呼 / 投了几份 / 回了几条"。
 */
export declare function guardUsage(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts 的 `GET /settings`。 */
export declare function settingsGet(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function settingsPatch(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=ops.d.ts.map