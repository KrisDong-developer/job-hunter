import type { PluginContext } from '../shared/contract/dsh.js';
/** cordis 插件名。 */
export declare const name = "dsh-job-hunter";
/**
 * **不声明硬依赖**。
 *
 * 声明了 `webServer` 会让 headless profile 起不来（见文件头）。
 * 真正需要的三个服务（`tools` / `llm` / `approval`）全是可选的：
 * 缺 `tools` 就没有模型工具，缺 `llm` 就走规则降级，缺 `approval` 就高危一律拒绝。
 * 三种情况都**不该**让插件挂不上。
 */
export declare const inject: string[];
export declare function apply(ctx: PluginContext): void;
//# sourceMappingURL=index.d.ts.map