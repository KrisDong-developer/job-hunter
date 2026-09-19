/**
 * 审批（§4.4.2）—— **fail-closed 是这里的全部重点**。
 *
 * | 情形 | 结果 |
 * |---|---|
 * | 用户点了同意 | 继续执行 |
 * | 用户点了拒绝 | 失败，**不自动重试**（§22.4） |
 * | 超时（默认 5 分钟） | **拒绝**，不挂起、不无限等 |
 * | 没有审批界面（headless / CLI） | **直接拒绝**，并给出可读原因 |
 * | 审批通道抛错 | **拒绝** |
 *
 * 一句话：**除了明确同意，其余一切路径都是拒绝。**
 * 默认放行是不可接受的，"无人时危险动作永久阻塞"也不可接受。
 */
import type { Actor } from '../../shared/contract/enums/guard.js';
import type { Danger } from './types.js';
export interface ApprovalRequest {
    action: string;
    actor: Actor;
    danger: Danger;
    title: string;
    /**
     * 审批文案。**必须**含：发起者、平台、目标、内容全文、使用的简历版本（§4.4.2）。
     * 这里是给人看的，不是给机器看的 —— 用户要能在不点开别处的情况下做决定。
     */
    lines: string[];
    /** 正文全文（仅用于展示与审批留痕，**不入审计表**）。 */
    content: string | null;
}
export type ApprovalVia = 'user' | 'timeout' | 'unavailable' | 'error';
/**
 * 询问实现能给出的回答。
 *
 * **为什么要能区分 `false` 和 `'unavailable'`**：这是真实模型跑 headless 时它自己提出来的问题 ——
 * 它只看到"用户未批准"，读不出「用户主动驳回」还是「这个环境根本没有审批界面」。
 * 而对用户来说这是两件完全不同的事：
 *   - 用户驳回 → 不重试、不建待办（他刚刚才做过决定）；
 *   - 没有审批界面 → fail-closed，并且要**建一条待办**（见 `guard/index.ts`），
 *     否则一次危险的批处理会静默消失。
 * 所以询问方必须能把"没能问到"如实回传，而不是压成 `false`。
 */
export type ApprovalAnswer = boolean | 'unavailable' | 'cancelled' | 'timeout' | 'error';
export interface ApprovalDecision {
    approved: boolean;
    via: ApprovalVia;
    reason?: string;
    /** 审批人标识，写进审计。 */
    by?: string;
}
export interface ApprovalPort {
    /** 当前环境有没有审批界面。没有的话高危动作一律拒绝。 */
    available(): boolean;
    ask(request: ApprovalRequest): Promise<ApprovalDecision>;
    timeoutMs(): number;
}
export interface ApprovalPortOptions {
    /**
     * 真正的询问实现（生产接 `ctx.approval.request`）。
     *
     * `true` = 用户同意；`false` = 用户**明确拒绝**；
     * 字符串 = "没能问到"（没有界面 / 被取消 / 通道出错）—— 见 `ApprovalAnswer` 的说明。
     * **不传就等于没有审批界面**。
     */
    ask?: (request: ApprovalRequest, signal: AbortSignal) => Promise<ApprovalAnswer>;
    /**
     * 覆盖「当前环境有没有审批界面」的判断。
     *
     * 为什么需要它：宿主可能挂着 `approval` 服务，但这次调用**不在一次模型工具调用里**
     * （比如定时任务发起的动作）—— 那种情况下弹不出审批，应当如实报告
     * `unavailable`（"没界面"）而不是 `user`（"用户拒绝了"）。两者对用户是不同的事。
     */
    available?: () => boolean;
    timeoutMs?: number;
}
/** 默认超时 5 分钟（§4.4.2）。 */
export declare const APPROVAL_TIMEOUT_MS: number;
export declare function createApprovalPort(options?: ApprovalPortOptions): ApprovalPort;
/** 把询问方的回答翻译成决策。**只有 `true` 是放行。** */
export declare function toDecision(answer: ApprovalAnswer, timeoutMs?: number): ApprovalDecision;
/** 把审批请求渲染成一段纯文本（也用于测试断言文案是否含必需信息）。 */
export declare function renderApproval(request: ApprovalRequest): string;
//# sourceMappingURL=approval.d.ts.map