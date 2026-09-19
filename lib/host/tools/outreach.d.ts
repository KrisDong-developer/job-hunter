/**
 * 触达与消息工具：打招呼话术、发送、收件箱同步、接触阶段探测、消息读取与回复。
 *
 * 危险级分层在这个文件里体现得最清楚：
 *   · 只读 / 只看不发（`greeting_draft`、`contact_stage`、`inbox_list`）→ 低危，不审批；
 *   · 真的对外发东西（`greeting_send`、`message_reply`）→ 高危，必然过闸门 + 用户审批。
 * 工具层**没有**绕过闸门的能力：它只调用 `runtime` 上那几个已经接了 guard 的方法。
 */
import type { ToolDefinition } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
export declare function outreachTools(runtime: HostRuntime): ToolDefinition[];
//# sourceMappingURL=outreach.d.ts.map