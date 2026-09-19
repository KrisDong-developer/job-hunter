/**
 * 投递与面试工具：真的投出去、记一笔投递、推进阶段、面试日程、面试准备包、面试错题本。
 *
 * 危险级：`application_deliver` / `application_send` 是**高危**（会真的对外发东西），
 * `application_update` / `interview_manage` / `interview_questions`（写操作）是**中危**（模型发起时审批），
 * `interview_prep` / `interview_questions`（查询）是只读。分级不是我们这个文件说了算 —— 由 `runtime` 上那层 guard 判。
 */
import type { ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function applicationsTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=applications.d.ts.map