/**
 * 健康与运行态只读端点。
 *
 * 这个模块只管三个端点：
 * - `GET /health` —— 宿主自检结果与数据文件路径；
 * - `GET /today` —— U0 首屏聚合（数据层未就绪也返回 200）；
 * - `GET /events` —— SSE 事件流，交给传输层挂流。
 */
import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
export declare function health(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function today(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function events(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=health.d.ts.map