import { type RouteContext } from './kit.js';
import type { RouteResult } from './types.js';
/** 原 router.ts L1106-1109。 */
export declare function list(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1218-1220。 */
export declare function loginStatus(ctx: RouteContext): Promise<RouteResult | undefined>;
/** 原 router.ts L1222-1229。 */
export declare function loginStart(ctx: RouteContext): Promise<RouteResult | undefined>;
/**
 * `POST /platforms/:id/login/check` —— **只检测**登录态，不引导登录。
 *
 * 为什么不是直接复用 `/login/start`：那条会**把登录页留在那儿等用户操作**
 * （轮询最长 5 分钟）。而"我只是想看一眼现在登没登"是完全不同的一件事 ——
 * 顺手开一个等用户输密码的窗口，是把一次读操作变成了一次交互。
 *
 * 检测**失败**（页面打不开 / 适配器抛错）走 200 + `checked: false`，
 * 而不是错误码：那是"这一下没测出来"，界面要能把它与"确定未登录"分开。
 */
export declare function loginCheck(ctx: RouteContext): Promise<RouteResult | undefined>;
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