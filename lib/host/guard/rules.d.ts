/**
 * 闸门规则（§4.4 检查链）。
 *
 * 顺序（任一不过即拒绝）：**开关 → 隐身 → 批量 → 额度 → 冷却 → 审批** → 执行 → 审计。
 *
 * 与 §4.4 表格的一处次序差异：把**批量上限**提到审批之前。
 * 表格里它在审批之后，但那样用户会先被问"要不要发这 12 个岗位"、批准完再被告知"超了 5 个上限"——
 * 两个分支都是拒绝，结果不变，只是不该白问一次。这里提前，语义不变。
 */
import type { Store } from '../store/store.js';
import type { SessionService } from '../platform/session.js';
import { DomainError } from '../util/errors.js';
import { type Clock } from '../util/time.js';
import type { GuardDeniedReason, GuardInput } from './types.js';
export interface GuardConfig {
    /** 发送分层（D-3）：L3 打招呼 / L4 投递 / L4 回复。 */
    levels: {
        l3Greeting: boolean;
        l4Application: boolean;
        l4Reply: boolean;
    };
    /** 每平台每日额度（D7）。模型调用同样计数。 */
    dailyLimits: {
        greeting: number;
        application: number;
        reply: number;
    };
    /** 同一公司重复投递的间隔（分钟，D10）。 */
    cooldownMinutes: number;
    /** 模型单次调用涉及的岗位数上限（§22.4）。 */
    batchLimit: number;
    /** 高危动作是否必须审批。**模型不得修改这一项**（§22.4 禁止项）。 */
    requireApproval: boolean;
    /** 审计开关。**模型不得关闭**（§22.4 禁止项）。 */
    auditEnabled: boolean;
}
export declare const DEFAULT_GUARD_CONFIG: GuardConfig;
/** 模型的**禁止项**：这些键碰都不能碰（§22.4）。 */
export declare const FORBIDDEN_FOR_MODEL: readonly ["requireApproval", "auditEnabled", "batchLimit", "dailyLimits", "cooldownMinutes"];
export interface RuleVerdict {
    ok: boolean;
    reason?: GuardDeniedReason;
    message?: string;
    hint?: string;
}
export declare function readGuardConfig(store: Store): GuardConfig;
export declare function writeGuardConfig(store: Store, patch: Partial<GuardConfig>, now: string): GuardConfig;
export interface RuleContext {
    store: Store;
    session?: SessionService | undefined;
    clock?: Clock;
}
/** 第 1 项：功能开关（D-3 发送分层）。 */
export declare function checkSwitch(store: Store, input: GuardInput): RuleVerdict;
/** 第 2 项：隐身检查（D4）。高危动作前**强制**校验。 */
export declare function checkStealth(ctx: RuleContext, input: GuardInput): RuleVerdict;
/** 第 3 项：批量上限（§22.4）。 */
export declare function checkBatch(store: Store, input: GuardInput): RuleVerdict;
/** 第 4 项：每日额度（D7）。计数直接读审计表 —— 它就是"今天做了什么"的事实来源。 */
export declare function checkQuota(ctx: RuleContext, input: GuardInput): RuleVerdict;
/** 第 5 项：冷却期（D10）。同公司重复投递要间隔。 */
export declare function checkCooldown(ctx: RuleContext, input: GuardInput): RuleVerdict;
/**
 * 禁止项（§22.4）：模型不得修改审批开关、不得关闭审计、不得扩大自身权限。
 * 这三条在 guard 内**硬编码**校验 —— 不读配置、不给开关。
 */
export declare function checkForbidden(_ctx: RuleContext, input: GuardInput): RuleVerdict;
/** 走完整条链（审批在 `guard/index.ts` 里做，因为它需要用户交互）。 */
export declare function runRuleChain(ctx: RuleContext, input: GuardInput): RuleVerdict;
/** 把规则拒绝翻译成领域错误。 */
export declare function toDomainError(verdict: RuleVerdict): DomainError;
//# sourceMappingURL=rules.d.ts.map