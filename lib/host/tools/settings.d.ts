/**
 * 配置工具：读/写插件配置（模型用途开关、发送分层）。
 *
 * ⚠️ 这个工具的**禁止项**比允许项更重要（§22.4）：审计开关、审批开关、额度与冷却期
 * 模型一律不能改。真正拦住的不是这里 —— 是 `runtime.updateSettings` 背后的 guard；
 * 这里只是把"能改什么、不能改什么"如实念给模型听（配置里本来就有这两份清单）。
 */
import type { ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function settingsTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=settings.d.ts.map