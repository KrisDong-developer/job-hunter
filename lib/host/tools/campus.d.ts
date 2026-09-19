/**
 * 校招工具：网申记录 / 批次窗口 / 笔试测评 / 三方协议 / 宣讲会 / 硬截止清单。
 *
 * 校招与其它支线不同的地方：这里有**不可逆节点**（笔试错过即终态、三方签署不可撤），
 * 所以工具面把它们单独暴露出来 —— 硬截止必须能被模型主动查到并提醒，
 * 而不是等用户在界面上发现。
 */
import type { ToolDefinition } from '../../shared/contract/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function campusTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=campus.d.ts.map