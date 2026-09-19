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
/** `GET /questions` —— 错题列表（按被问次数排）。 */
export declare function questionsList(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `POST /interviews/:id/questions` —— 记一道面试题。
 *
 * 挂在面试下（而不是 `POST /questions`）：一道题总是**在某场面试里被问到的**，
 * 这样公司维度能自动补上，而"哪家问过什么"是错题本的第二个用法。
 * 同一个「问题 + 主题」再记一次是**累加次数**，所以这个入口可以反复调。
 */
export declare function questionsAdd(ctx: RouteContext): Promise<RouteResult | undefined>;
/** `PATCH /questions/:id` —— 改答案 / 改主题（`times` 是事实，改不了）。 */
export declare function questionsPatch(ctx: RouteContext): Promise<RouteResult | undefined>;
/** `DELETE /questions/:id`。 */
export declare function questionsRemove(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=interviews.d.ts.map