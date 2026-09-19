/**
 * 简历工具：列表 / 读取 / 新建修改 / 岗位定制 / 导出附件。
 *
 * 分工：查询是**低危**（只读）；保存/定制/导出是**中危** —— 模型发起时会走审批
 * （`needsApproval` 对 model+mid 返回 true）。
 * 更要紧的是 `resume_tailor`：它会把简历正文发给模型，所以那条路径上
 * 用途开关（默认关）+ 隐私闸门 + 防编造检查三样缺一不可。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function resumesTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=resumes.d.ts.map