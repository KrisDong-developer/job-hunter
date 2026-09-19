import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
/** 原 router.ts L1106-1109。 */
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1218-1220。 */
export declare function loginStatus(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1222-1229。 */
export declare function loginStart(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `GET|PUT /platforms/:id/adapter-config` —— 适配器配置覆盖（J2 / ADAPTERS.md §4）。
 *
 * 修一个坏掉的选择器，此前**只能直接写 sqlite**（ADAPTERS.md §1 的"实测与源码注释不一致"
 * 那一格）。这一组端点补上的是那条写入路径，并且：
 *   * 读回**三层**（代码默认 / DB 覆盖 / 实际生效）—— 否则"改了没生效"无法自查；
 *   * 写完全**热替换适配器**（J2：不依赖发版、也不要求重启插件）；
 *   * `override: null` = 清除覆盖，回到代码默认（比"写一个空对象"语义明确）。
 *
 * 注意它是**中危**动作（改的是抓取行为的配置），但不像发送那样有对外副作用，
 * 所以走同源校验即可，不需要审批闸门 —— 与 `PATCH /settings` 同级。
 */
export declare function adapterConfig(ctx: RouteContext): Promise<RouteResult | undefined>;
//# sourceMappingURL=platforms.d.ts.map