import { type Clock } from '../util/time.js';
import type { Store } from '../store/store.js';
import type { SessionService } from '../platform/session.js';
import type { ApprovalPort, ApprovalRequest } from './approval.js';
import { type GuardConfig, type RuleVerdict } from './rules.js';
import { type GuardAuthority, type GuardToken } from './token.js';
import type { GuardInput } from './types.js';
/**
 * 「这一步需要用户确认，但还没问」。
 *
 * **不是拒绝** —— 所以它不写 `denied` 审计、不建待办。
 * 界面收到它 → 把 `confirmText` 显示给用户 → 用户点确认 → 带 `guiConfirmed: true` 重发。
 */
export declare class ConfirmRequiredError extends Error {
    readonly request: ApprovalRequest;
    readonly code = "NEEDS_CONFIRM";
    constructor(request: ApprovalRequest);
    /** 给人看的确认文案（§4.4.2 要求含发起者/平台/目标/内容全文/简历版本）。 */
    text(): string;
}
/** 危险动作是否要问用户。
 *
 * 读法说明：§4.4 写的是「`danger==='high'` 或 `actor==='model'`」，
 * 但字面照做会让 `job_list` 这种只读工具也要审批 —— 与 §4.8 的 `job_search`（低危、不审批）
 * 例子直接矛盾。按 §22.4「**危险工具**必须经用户审批」的口径收敛为：
 *   * 高危 → 一律审批（不论谁发起）；
 *   * 模型发起的中危 → 也审批（模型越权做中危动作正是 D-14 的风险）；
 *   * 低危 → 不打扰用户。
 */
export declare function needsApproval(input: GuardInput, config: GuardConfig): boolean;
export interface GuardDeps {
    store: Store;
    session?: SessionService | undefined;
    approval: ApprovalPort;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export interface Guard {
    /** 唯一执行入口。`fn` 收到一次性令牌，危险实现必须校验它。 */
    run<T>(input: GuardInput, fn: (token: GuardToken) => Promise<T>): Promise<T>;
    /** 只做检查、不执行、不写审计 —— 给"这事儿能不能做"的预览。 */
    preview(input: GuardInput): GuardPreview;
    config(): GuardConfig;
    authority(): GuardAuthority;
}
export interface GuardPreview {
    ok: boolean;
    verdict: RuleVerdict;
    needsApproval: boolean;
    /** 需要审批时的确认文案（`renderApproval` 的结果），供界面直接展示。 */
    confirmText?: string;
}
export declare function createGuard(deps: GuardDeps): Guard;
export type { GuardToken };
export { needsApproval as shouldApprove };
//# sourceMappingURL=index.d.ts.map