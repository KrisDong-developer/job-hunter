/**
 * dsh-job-hunter 的宿主半（cordis 插件入口）。
 *
 * **硬规则（§4.9）**：`apply()` 必须立即返回 —— 开库、迁移、自检、浏览器启动一律异步，
 * 否则会拖慢整个宿主启动，属于「插件拖垮宿主」的典型问题。
 * 这里的所有重活都在 `runtime.ready()`（setImmediate 之后才跑）里。
 *
 * ## 为什么 `inject` 里没有 `webServer`（P5 改的，改了两次才对）
 *
 * 最初的写法是 `export const inject = ['webServer']`，理由是"本插件是 web bundle，
 * 路由是它与 GUI 的唯一通道，缺了就该等待而不是带病运行"。
 * 这个判断在 **headless / CLI profile 上是错的**：那里根本没有 `webServer`，
 * 于是插件永久 `pending`，cordis 判定 `1 entry did not activate`，
 * **整个 profile 启动失败** —— 而我们的模型工具在那种环境下恰恰完全可用（只是没有 GUI 路由）。
 *
 * 所以改成：
 *   - 插件本体**不挂起**（`inject` 为空）；
 *   - `webServer` 用 `ctx.inject(['webServer'], …)` **反应式**注册路由 ——
 *     它在就注册、晚到也补上、没有就只是没有 GUI。
 *
 * 这不是"降低要求"，而是把依赖的**真实必要性**说清楚：
 * 主力能力（模型工具 + 数据层）不依赖 webServer，只有 GUI 这一个入口依赖它。
 */
import { PLUGIN_ID } from '../shared/config/plugin.js';
import { serviceOf } from '../shared/contract/dsh.js';
import { registerHttpRoutes } from './http.js';
import { createHostRuntime } from './runtime.js';
import { registerJobHunterTools } from './tools/index.js';
/** cordis 插件名。 */
export const name = PLUGIN_ID;
/**
 * **不声明硬依赖**。
 *
 * 声明了 `webServer` 会让 headless profile 起不来（见文件头）。
 * 真正需要的三个服务（`tools` / `llm` / `approval`）全是可选的：
 * 缺 `tools` 就没有模型工具，缺 `llm` 就走规则降级，缺 `approval` 就高危一律拒绝。
 * 三种情况都**不该**让插件挂不上。
 */
export const inject = [];
/** 逆序清理，且**任何单个清理失败都不得阻断**其余清理与卸载。 */
function disposeAll(disposers) {
    for (const dispose of disposers.splice(0).reverse()) {
        try {
            dispose();
        }
        catch {
            /* 清理失败已记录在调用方，这里不向上抛，避免卸载链断掉 */
        }
    }
}
export function apply(ctx) {
    // 全是可选依赖：缺失时退到降级路径，而不是让插件挂不上
    const timer = ctx.get('timer');
    const llm = ctx.get('llm');
    const defaultModel = ctx.get('agentDefaultModel');
    const approval = serviceOf(ctx, 'approval');
    const tools = serviceOf(ctx, 'tools');
    const logger = ctx.logger === undefined
        ? undefined
        : {
            info: (message) => ctx.logger?.info(message),
            warn: (message) => ctx.logger?.warn(message),
        };
    const runtime = createHostRuntime({
        ...(timer === undefined
            ? {}
            : {
                timer: timer,
            }),
        ...(llm === undefined ? {} : { llm }),
        ...(defaultModel === undefined ? {} : { defaultModel }),
        ...(approval === undefined ? {} : { approval }),
        ...(logger === undefined ? {} : { logger }),
    });
    // 故意不 await：apply 立即返回，数据层在 setImmediate 之后自己就绪（§4.9）。
    // 失败也不 reject —— 失败原因由 runtime.failure() 经 /health 暴露给用户。
    void runtime.ready();
    const disposers = [];
    // ctx.effect 的回调立即执行、其返回值即清理函数 → 停止/热重载时路由与数据层自动收尾。
    // 这同时满足 C15 的幂等要求：dispose → apply 反复发生也不会重复注册
    //（同名 (kind, path) 重复注册会被 webServer 直接抛错，属于故意暴露的失败）。
    ctx.effect(() => {
        try {
            // ① 模型工具：与数据层无关，**没有 webServer 也要注册**
            const registration = registerJobHunterTools(ctx, runtime);
            runtime.setToolReport(registration.report);
            disposers.push(registration.dispose);
            // ② GUI 路由：webServer 是**可选**依赖（headless / CLI profile 里没有）
            const registerRoutes = (scope) => {
                disposers.push(registerHttpRoutes(scope, runtime));
                ctx.logger?.info(`[${PLUGIN_ID}] GUI 路由已挂到 /job-hunter（webServer 就绪）`);
            };
            if (typeof ctx.inject === 'function') {
                // 反应式：现在就绪就现在注册，晚到就补上，永远没有就只是没有 GUI
                ctx.inject(['webServer'], registerRoutes);
            }
            else {
                // 老宿主没有 ctx.inject：试一次，拿不到就如实说明
                registerRoutes(ctx);
            }
            if (serviceOf(ctx, 'webServer') === undefined && typeof ctx.inject !== 'function') {
                ctx.logger?.warn(`[${PLUGIN_ID}] webServer 缺失，GUI 路由未注册；模型工具仍可用`);
            }
        }
        catch (error) {
            disposeAll(disposers);
            runtime.close();
            throw error;
        }
        ctx.logger?.info(`[${PLUGIN_ID}] 宿主半已挂载（数据层异步就绪中；` +
            `工具 ${tools === undefined ? '不可用' : '可用'}／` +
            `模型 ${llm === undefined ? '未挂载→降级' : '可用'}／` +
            `审批 ${approval === undefined ? '无→高危一律拒绝' : '可用'}）`);
        return () => {
            disposeAll(disposers);
            runtime.close();
        };
    }, `${PLUGIN_ID}: host runtime`);
}
//# sourceMappingURL=index.js.map