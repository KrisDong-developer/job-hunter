/**
 * guard —— **唯一安全闸门**（§4.4 / ADR-8 / ADR-14）。
 *
 * 为什么必须集中（P2）：GUI 与模型工具如果各自校验，必然出现"GUI 拦住了、对话里绕过去了"。
 *
 * 执行顺序：
 *   `runRuleChain`（禁止项 → 开关 → 隐身 → 批量 → 额度 → 冷却）
 *   → 审批（高危，或模型发起的中危）
 *   → 签发一次性令牌 → 执行 → 审计
 */
import { DomainError, messageOf } from '../util/errors.js';
import { systemClock } from '../util/time.js';
import { summarize } from '../store/repo/audit.js';
import { renderApproval } from './approval.js';
import { runRuleChain, readGuardConfig, toDomainError } from './rules.js';
import { guardAuthority } from './token.js';
/**
 * 「这一步需要用户确认，但还没问」。
 *
 * **不是拒绝** —— 所以它不写 `denied` 审计、不建待办。
 * 界面收到它 → 把 `confirmText` 显示给用户 → 用户点确认 → 带 `guiConfirmed: true` 重发。
 */
export class ConfirmRequiredError extends Error {
    request;
    code = 'NEEDS_CONFIRM';
    constructor(request) {
        super(`「${request.action}」需要用户确认后才能执行`);
        this.request = request;
        this.name = 'ConfirmRequiredError';
    }
    /** 给人看的确认文案（§4.4.2 要求含发起者/平台/目标/内容全文/简历版本）。 */
    text() {
        return renderApproval(this.request);
    }
}
const ACTOR_LABEL = {
    gui: '界面上的你',
    model: '模型（对话里发起）',
    schedule: '定时任务',
    user: '用户',
};
/** 危险动作是否要问用户。
 *
 * 读法说明：§4.4 写的是「`danger==='high'` 或 `actor==='model'`」，
 * 但字面照做会让 `job_list` 这种只读工具也要审批 —— 与 §4.8 的 `job_search`（低危、不审批）
 * 例子直接矛盾。按 §22.4「**危险工具**必须经用户审批」的口径收敛为：
 *   * 高危 → 一律审批（不论谁发起）；
 *   * 模型发起的中危 → 也审批（模型越权做中危动作正是 D-14 的风险）；
 *   * 低危 → 不打扰用户。
 */
export function needsApproval(input, config) {
    if (!config.requireApproval)
        return false;
    if (input.danger === 'high')
        return true;
    return input.actor === 'model' && input.danger === 'mid';
}
export function createGuard(deps) {
    const clock = deps.clock ?? systemClock;
    const authority = guardAuthority;
    const buildRequest = (input) => {
        const payload = input.payload ?? {};
        const text = typeof payload['text'] === 'string' ? payload['text'] : null;
        const lines = [
            `发起者：${ACTOR_LABEL[input.actor]}`,
            `动作：${input.action}（危险级 ${input.danger}）`,
            `平台：${input.target?.platformId ?? '—'}`,
            `目标岗位：${input.target?.jobId === undefined ? '—' : `#${String(input.target.jobId)}`}`,
            `目标公司：${input.target?.companyId === undefined ? '—' : `#${String(input.target.companyId)}`}`,
            `使用简历版本：${typeof payload['resumeVersion'] === 'string' ? payload['resumeVersion'] : '不适用'}`,
        ];
        if (input.action === 'settings.write' && payload['patch'] !== undefined) {
            lines.push(`要修改的配置：${JSON.stringify(payload['patch'])}`);
        }
        lines.push(`超时：${String(Math.round(deps.approval.timeoutMs() / 1000))} 秒后自动按拒绝处理`);
        return {
            action: input.action,
            actor: input.actor,
            danger: input.danger,
            title: input.action,
            lines,
            content: text,
        };
    };
    const writeAudit = (input, result, reason, approval, durationMs) => {
        const config = readGuardConfig(deps.store);
        if (!config.auditEnabled) {
            deps.logger?.warn(`[guard] 审计已被用户关闭，本次 ${input.action} 未留痕`);
            return;
        }
        try {
            deps.store.audit.write({
                actor: input.actor,
                action: input.action,
                target: {
                    ...(input.target?.platformId === undefined ? {} : { platformId: input.target.platformId }),
                    ...(input.target?.jobId === undefined ? {} : { jobId: input.target.jobId }),
                    ...(input.target?.companyId === undefined ? {} : { companyId: input.target.companyId }),
                },
                // 只存摘要与长度：涉敏正文不入审计表（§4.1）
                detail: summarize(input.payload ?? {}),
                result,
                reason,
                approval: approval === null
                    ? null
                    : { via: approval.via, approved: approval.approved, by: approval.by ?? null, reason: approval.reason ?? null },
                durationMs,
            }, clock());
        }
        catch (error) {
            // 审计写失败不能反过来让业务动作失败（但必须喊出来）
            deps.logger?.warn(`[guard] 审计写入失败：${messageOf(error)}`);
        }
    };
    return {
        async run(input, fn) {
            const startedAt = Date.now();
            const config = readGuardConfig(deps.store);
            // 自封"已确认"是越权：只有界面上的操作能带这个标记。
            // **放在最前面**：这是一次绕过尝试，不该被后面某条规则挡住而看起来像"隐身没过"（§22.4 禁止项）。
            if (input.guiConfirmed === true && input.actor !== 'gui') {
                const reason = `非界面来源（actor=${input.actor}）不得自带"已确认"标记`;
                writeAudit(input, 'denied', reason, null, Date.now() - startedAt);
                throw new DomainError('GUARD_DENIED', reason, {
                    hint: '模型发起的危险动作必须走审批，不能自我确认。',
                    detail: { action: input.action, reason: 'approval' },
                });
            }
            // ── 检查链 ────────────────────────────────────────────────────
            const verdict = runRuleChain({ store: deps.store, session: deps.session, clock }, input);
            if (!verdict.ok) {
                writeAudit(input, 'denied', verdict.message ?? '被规则拒绝', null, Date.now() - startedAt);
                throw toDomainError(verdict);
            }
            // ── 审批 ──────────────────────────────────────────────────────
            let approval = null;
            if (needsApproval(input, config)) {
                if (input.actor === 'gui') {
                    if (input.guiConfirmed !== true) {
                        // 还没问过：把确认文案交回界面，不执行、也不记成"被拒绝"
                        throw new ConfirmRequiredError(buildRequest(input));
                    }
                    approval = {
                        approved: true,
                        via: 'user',
                        by: 'gui-confirm',
                        reason: '用户在界面上二次确认',
                    };
                }
                else {
                    approval = await deps.approval.ask(buildRequest(input));
                }
                if (approval !== null && !approval.approved) {
                    const reasonText = approval.reason ?? '用户未批准';
                    writeAudit(input, 'denied', reasonText, approval, Date.now() - startedAt);
                    // 超时/无界面 → 转成"待确认动作"待办，不静默丢弃（§4.4.2）
                    if (approval.via === 'timeout' || approval.via === 'unavailable') {
                        try {
                            deps.store.todo.createOnce({
                                kind: 'confirm-action',
                                level: 'warn',
                                title: `有一个动作等你确认：${input.action}`,
                                ref: input.target?.jobId === undefined ? null : String(input.target.jobId),
                                detail: {
                                    action: input.action,
                                    actor: input.actor,
                                    target: input.target ?? {},
                                    reason: reasonText,
                                    hint: '下次打开面板可以一键执行。',
                                },
                            }, clock());
                        }
                        catch (error) {
                            deps.logger?.warn(`[guard] 写"待确认动作"待办失败：${messageOf(error)}`);
                        }
                    }
                    throw new DomainError('GUARD_DENIED', `「${input.action}」未获批准：${reasonText}`, {
                        hint: approval.via === 'unavailable'
                            ? '当前环境没有审批界面（headless / CLI），高危动作一律拒绝。请在有界面的实例里操作。'
                            : approval.via === 'timeout'
                                ? '审批超时已按拒绝处理；这次动作已记入待办，你可以稍后手动执行。'
                                : '用户拒绝了这次动作，不会自动重试。',
                        detail: { action: input.action, via: approval.via, reason: 'approval' },
                    });
                }
            }
            // ── 执行（令牌只在此上下文可见）───────────────────────────────
            const token = authority.issue({ action: input.action, actor: input.actor, danger: input.danger });
            try {
                const value = await authority.run(token, () => fn(token));
                writeAudit(input, 'ok', null, approval, Date.now() - startedAt);
                return value;
            }
            catch (error) {
                writeAudit(input, 'error', messageOf(error), approval, Date.now() - startedAt);
                throw error;
            }
        },
        preview(input) {
            const verdict = runRuleChain({ store: deps.store, session: deps.session, clock }, input);
            const ask = verdict.ok && needsApproval(input, readGuardConfig(deps.store));
            return {
                ok: verdict.ok,
                verdict,
                needsApproval: ask,
                ...(ask ? { confirmText: renderApproval(buildRequest(input)) } : {}),
            };
        },
        config() {
            return readGuardConfig(deps.store);
        },
        authority() {
            return authority;
        },
    };
}
export { needsApproval as shouldApprove };
//# sourceMappingURL=index.js.map