import type { Disposer, PluginContext, ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
/** 工具单次返回的岗位条数上限：模型上下文不该被一张长列表挤满（§22.5）。 */
export declare const TOOL_LIST_MAX = 20;
/** 批量类工具（模型发起）的岗位数上限，与 §22.4「≤5」一致。 */
export declare const TOOL_BATCH_MAX = 5;
declare function buildTools(runtime: HostRuntime): ToolDefinition[];
/** 一次注册的结果。**失败必须能被看到**，不能只写进日志就完事。 */
export interface ToolRegistrationReport {
    registered: string[];
    failed: Array<{
        name: string;
        reason: string;
    }>;
    /** 注册前就已经被别的插件占用的名字（我们没去抢）。 */
    conflicts: string[];
}
export interface ToolRegistration {
    report: ToolRegistrationReport;
    dispose: Disposer;
}
/**
 * 注册全部工具。
 *
 * 为什么返回一份 report：实测踩过 —— 宿主自带 `job_list`，我们的同名工具注册失败，
 * 而失败被 `catch` 吞成了日志里的一行，界面上什么都没说。
 * 「工具静默少了一个」是模型能力缺失里最难查的一类问题，所以这里把它变成可见状态。
 */
export declare function registerJobHunterTools(ctx: PluginContext, runtime: HostRuntime): ToolRegistration;
export { buildTools };
//# sourceMappingURL=index.d.ts.map