import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function dictionary(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * POST /intel/recompute —— 重算标注与匹配分。
 *
 * 两种范围（第五轮，批次 A2 增加的第二种）：
 *   * `latest`（默认，行为不变）：最近 `PAGE_SIZE_MAX` 条岗位 —— 首次建库、
 *     词表大改之后想刷新一遍时用。
 *   * `stale`：**只重算分数已过期的岗位**（有分，但算分时的简历版本与当前启用简历不一致）。
 *     换了一份简历之后，库里成百上千条分数全部作废；没有这个范围，用户只能等下一轮
 *     抓取把它们逐条刷回来（抓取只覆盖"这一轮见到的"），于是"按匹配分排序"会长期
 *     排在一堆旧分上。它每次也最多 `PAGE_SIZE_MAX` 条，并回报**剩余条数**，
 *     界面据此说"还剩 312 条，再点一次继续"，而不是假装一次就修完了。
 */
export declare function recompute(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=intel.d.ts.map