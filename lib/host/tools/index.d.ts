import type { PluginContext } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
import type { ToolRegistration, ToolRegistrationReport } from './types.js';
export { TOOL_BATCH_MAX } from './kit.js';
export type { ToolRegistration, ToolRegistrationReport };
/**
 * 注册全部工具。
 *
 * 为什么返回一份 report：实测踩过 —— 宿主自带 `job_list`，我们的同名工具注册失败，
 * 而失败被 `catch` 吞成了日志里的一行，界面上什么都没说。
 * 「工具静默少了一个」是模型能力缺失里最难查的一类问题，所以这里把它变成可见状态。
 */
export declare function registerJobHunterTools(ctx: PluginContext, runtime: HostRuntime): ToolRegistration;
//# sourceMappingURL=index.d.ts.map