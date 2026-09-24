import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
/**
 * POST /companies/:id/enrich —— 工商补全（按需一次性，照 `POST /crawl/run` 的形态）。
 *
 * body 可带 `pickUrl`（多候选时用户点选的那条，来自上一次 `pick-one` 的返回）。
 * 成功三种形态：done（已入库）/ pick-one（要人工点选）/ unmatched（工商库查无此主体，
 * 也是留痕）。撞墙（登录墙/验证码）与每日超额（20 家，写死）抛 DomainError，
 * 由统一错误协议翻给界面。
 */
export declare function enrich(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function review(ctx: RouteContext): Promise<RouteResult | undefined>;
export declare function detail(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=companies.d.ts.map