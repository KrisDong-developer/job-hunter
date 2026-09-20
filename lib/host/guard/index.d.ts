import { type Clock } from '../util/time.js';
import type { Store } from '../store/store.js';
import type { PlatformLocks } from '../platform/locks.js';
import { type BurstGuardLike } from '../platform/pacing.js';
import type { SessionService } from '../platform/session.js';
import type { ApprovalPort, ApprovalRequest } from './approval.js';
import { type GuardConfig, type RuleVerdict } from './rules.js';
import { type GuardAuthority, type GuardToken } from './token.js';
import type { GuardInput } from './types.js';
/**
 * 「这一步需要用户确认，但还没问」的安全闸门错误。
 *
 * 由 guard 在审批环节抛出的信号：危险动作（或模型发起的操作）按 §4.4 必须先
 * 征求用户确认，本错误表示**确认尚未发生**，动作也未执行。
 *
 * **不是拒绝** —— 所以它不写 `denied` 审计、不建待办，与真正的拦截（`GUARD_DENIED`）
 * 语义不同。界面收到它 → 用 `text()` 把确认文案显示给用户 → 用户点确认 →
 * 带 `guiConfirmed: true` 重发同一请求，guard 才会放行并签发令牌。
 *
 * - `code`：固定为 `NEEDS_CONFIRM`，供上层按错误码分支。
 * - `request`：待确认的审批请求（`ApprovalRequest`），包含发起者/平台/目标/内容全文/简历版本。
 * - `text()`：渲染给人看的确认文案（§4.4.2 要求的内容）。
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
    /**
     * 按平台互斥锁（与采集**共用同一把**）。
     *
     * 为什么动作链也要拿它：`platform/pacing.ts` 的突发惩罚窗口成立的前提是
     * "同一平台串行"（那里注释写着"同平台串行由 platform/locks.ts 保证"）——
     * 而在这之前，采集拿锁、动作不拿，于是"采集刚打完 3 个页面、动作立刻又发一条"
     * 这种事完全不受窗口约束。同一个站点的两种流量必须是同一条节奏。
     */
    locks?: PlatformLocks;
    /**
     * 取某个平台的突发惩罚守卫（与采集**共用同一份实例**，跨轮次连续）。
     * 见 `crawl.ts` 的 `createBurstGuard` 与 `runtime.ts` 的按平台记忆。
     */
    burstOf?: (platformId: string) => BurstGuardLike | undefined;
    /** 等待函数（测试注入用；默认真实 setTimeout）。 */
    sleep?: (ms: number) => Promise<void>;
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