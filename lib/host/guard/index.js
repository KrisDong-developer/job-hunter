/**
 * guard —— **唯一安全闸门**（§4.4 / ADR-8 / ADR-14）。
 *
 * 为什么必须集中（P2）：GUI 与模型工具如果各自校验，必然出现"GUI 拦住了、对话里绕过去了"。
 *
 * 执行顺序：
 *   `runRuleChain`（禁止项 → 开关 → 隐身 → 批量 → 额度 → 冷却）
 *   → 审批（高危，或模型发起的中危）
 *   → 签发一次性令牌
 *   → **平台锁 + 拟人节流**（动浏览器的事一律串行，见 `withPlatformPacing`）
 *   → 执行
 *   → 审计（适配器自报的风控证据在这里翻成平台级暂停，见 `blockDenial`）
 */
import { REQUEST_DELAY_MAX_MS, REQUEST_DELAY_MIN_MS } from '../../shared/config/crawl.js';
import { DomainError, messageOf } from '../util/errors.js';
import { systemClock } from '../util/time.js';
import { summarize } from '../store/repo/audit.js';
import { humanDelayMs } from '../platform/pacing.js';
import { setPlatformRiskPause } from '../platform/risk-pause.js';
import { blockFailureCode, blockLabel, blockedKindOf } from '../platform/types.js';
import { renderApproval } from './approval.js';
import { runRuleChain, readGuardConfig, toDomainError } from './rules.js';
import { guardAuthority } from './token.js';
import { ACTOR_LABEL } from '../../shared/contract/enums/guard.js';
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
    const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => { setTimeout(resolve, ms); }));
    /**
     * 动作链的**节流与串行**（G2）：凡是会打开浏览器页面的动作，在这一层统一
     * 先让路、再等一个拟人间隔，然后才轮到适配器去导航。
     *
     * 为什么放在闸门里而不是各动作实现里：
     *   * 它是**跨动作一致**的约束（额度、冷却也在这一层），散到 5 个动作文件里必然漂移；
     *   * 闸门是"唯一入口"这件事本来就该包含"唯一节流点"；
     *   * 拿锁的顺序必须与采集一致，否则 `pacing.ts` 的窗口假设不成立。
     *
     * 顺序：拿平台锁 → 等突发惩罚 + 基础拟人间隔 → 执行 → 记账（无论成败）。
     * 记账放在 `finally`：动作失败也真的发过请求，不记会让下一次的空窗判断偏乐观。
     */
    const withPlatformPacing = async (platformId, fn) => {
        if (platformId === undefined)
            return await fn();
        const work = async () => {
            const burst = deps.burstOf?.(platformId);
            const penaltyMs = burst?.penaltyMs() ?? 0;
            await sleep(humanDelayMs([REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS]) + penaltyMs);
            try {
                return await fn();
            }
            finally {
                burst?.mark();
            }
        };
        if (deps.locks === undefined)
            return await work();
        const result = await deps.locks.tryRun(platformId, work);
        if (result === null) {
            throw new DomainError('CONFLICT', `${platformId} 正在采集，这次动作已让路（未执行）`, {
                hint: '同一平台的请求必须串行 —— 采集与发送同时打一个站点，是频控最容易抓到的形态。' +
                    '等这一轮采集结束再试（通常几分钟内）。',
                detail: { platformId, reason: 'platform-busy' },
            });
        }
        return result;
    };
    /**
     * 把"适配器说它看到风控了"翻译成：**平台级暂停 + 用户看得懂的错误**。
     *
     * 与采集链的分工：采集那边由 `scheduler` 写暂停（它持有方案上下文）；
     * 动作链由 GUI/模型发起、不经过调度器，所以暂停必须在这里写 ——
     * 否则"动作撞上验证码"这件事只会在一次失败的点击里消失。
     */
    const blockDenial = (platformId, action, error) => {
        const kind = blockedKindOf(error);
        if (kind === null)
            throw error;
        setPlatformRiskPause(deps.store, platformId, `动作「${action}」命中风控：${blockLabel(kind)}`, clock());
        deps.logger?.warn(`[guard] ${platformId} 动作「${action}」命中风控（${kind}）—— 已暂停该平台`);
        return new DomainError(kind === 'quota-exhausted' ? 'QUOTA_EXCEEDED' : kind === 'login-required' ? 'NOT_LOGGED_IN' : 'BLOCKED', `${platformId} 命中风控（${blockLabel(kind)}）—— 这次动作**没有完成**，该平台已暂停`, {
            hint: kind === 'login-required'
                ? '登录态已失效。重新登录后再解除平台暂停。'
                : kind === 'quota-exhausted'
                    ? '平台侧今日额度已用完 —— 退避重试没有意义，今天对这个平台停手。'
                    : '去平台上确认一下（可能要过验证码、可能要隔一会儿）。确认后手动恢复该平台的调度。',
            detail: { platformId, action, block: kind, crawlCode: blockFailureCode(kind) },
        });
    };
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
        // 平台自己还会做的额外动作（平台事实，见 `platform-facts.ts` 的 `applicationSideEffect`）：
        // 智联的投递会**顺带替你发一句招呼语** —— 用户按下"确认"之前必须知道这件事。
        if (typeof payload['sideEffect'] === 'string' && payload['sideEffect'] !== '') {
            lines.push(`同时会发生：${payload['sideEffect']}`);
        }
        /**
         * 同一岗位的另一个平台副本已经投过了（跨平台去重分组判出来的）。
         *
         * 放在**审批文案**里而不是只放在批量预览里：模型走的单条投递路径没有预览，
         * 用户就是在这一屏上按下"同意"的 —— 提醒不在这里出现，就等于在最需要它的那条路径上消失。
         * 文案自带"分组可能判错"，因为它确实是启发式判断，不能当成事实。
         */
        if (typeof payload['duplicateApplicationWarning'] === 'string' && payload['duplicateApplicationWarning'] !== '') {
            lines.push(`⚠️ ${payload['duplicateApplicationWarning']}`);
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
            const platformId = input.target?.platformId;
            try {
                // 节流 + 同平台串行都发生在 `fn` 之前 —— 而 `fn` 里才会去 acquire 页面、导航。
                const value = await authority.run(token, () => withPlatformPacing(platformId, () => fn(token)));
                writeAudit(input, 'ok', null, approval, Date.now() - startedAt);
                return value;
            }
            catch (error) {
                writeAudit(input, 'error', messageOf(error), approval, Date.now() - startedAt);
                // 适配器直接看到的平台风控（DOM 判墙或接口返回码）→ 平台级暂停 + 可操作建议。
                // 放在审计之后：审计要留的是**原始**失败，而不是我们翻译后的文案。
                if (platformId !== undefined && blockedKindOf(error) !== null) {
                    throw blockDenial(platformId, input.action, error);
                }
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