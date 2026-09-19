import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
/**
 * 投递简历（高危，两段式确认）。
 *
 * ⚠️ 与 `POST /applications`（记一笔投递）**不是一回事**：这条会真的用适配器把简历发出去。
 */
export declare function deliver(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * 批量投递（L4，两段式：先预览再带 `confirm` 发送）。
 *
 * 与 `/greeting/send-batch` 同构，但**载荷更薄**：打招呼每条都能改正文，所以那边收 `items`；
 * 投递是整批共用一份简历（`resumeFileId`），所以这里收 `jobIds`。
 */
export declare function deliverBatch(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function create(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function get(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function advance(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function board(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function jobHistory(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function followups(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function followupsResolve(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=applications.d.ts.map