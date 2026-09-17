import { DomainError } from '../util/errors.js';
import { systemClock } from '../util/time.js';
export const DEFAULT_GUARD_CONFIG = {
    levels: { l3Greeting: true, l4Application: false, l4Reply: false },
    dailyLimits: { greeting: 20, application: 10, reply: 30 },
    cooldownMinutes: 24 * 60,
    batchLimit: 5,
    requireApproval: true,
    auditEnabled: true,
};
/** 模型的**禁止项**：这些键碰都不能碰（§22.4）。 */
export const FORBIDDEN_FOR_MODEL = [
    'requireApproval',
    'auditEnabled',
    'batchLimit',
    'dailyLimits',
    'cooldownMinutes',
];
/** 动作 → 功能开关的映射。没有映射的动作不受开关约束。 */
const ACTION_SWITCH = {
    'greeting.send': 'l3Greeting',
    'application.send': 'l4Application',
    'message.reply': 'l4Reply',
};
/** 动作 → 额度桶。 */
const ACTION_QUOTA = {
    'greeting.send': 'greeting',
    'application.send': 'application',
    'message.reply': 'reply',
};
const OK = { ok: true };
function deny(reason, message, hint) {
    return { ok: false, reason, message, ...(hint === undefined ? {} : { hint }) };
}
export function readGuardConfig(store) {
    const stored = store.setting.get('guard-config', 'global', '');
    if (stored === undefined)
        return DEFAULT_GUARD_CONFIG;
    return {
        levels: { ...DEFAULT_GUARD_CONFIG.levels, ...(stored.levels ?? {}) },
        dailyLimits: { ...DEFAULT_GUARD_CONFIG.dailyLimits, ...(stored.dailyLimits ?? {}) },
        cooldownMinutes: typeof stored.cooldownMinutes === 'number' ? stored.cooldownMinutes : DEFAULT_GUARD_CONFIG.cooldownMinutes,
        batchLimit: typeof stored.batchLimit === 'number' ? stored.batchLimit : DEFAULT_GUARD_CONFIG.batchLimit,
        requireApproval: stored.requireApproval !== false,
        auditEnabled: stored.auditEnabled !== false,
    };
}
export function writeGuardConfig(store, patch, now) {
    const current = readGuardConfig(store);
    const next = {
        levels: { ...current.levels, ...(patch.levels ?? {}) },
        dailyLimits: { ...current.dailyLimits, ...(patch.dailyLimits ?? {}) },
        cooldownMinutes: patch.cooldownMinutes ?? current.cooldownMinutes,
        batchLimit: patch.batchLimit ?? current.batchLimit,
        requireApproval: patch.requireApproval ?? current.requireApproval,
        auditEnabled: patch.auditEnabled ?? current.auditEnabled,
    };
    store.setting.set('guard-config', 'global', '', next, now);
    return next;
}
/** 第 1 项：功能开关（D-3 发送分层）。 */
export function checkSwitch(store, input) {
    const key = ACTION_SWITCH[input.action];
    if (key === undefined)
        return OK;
    const config = readGuardConfig(store);
    if (config.levels[key])
        return OK;
    return deny('switch', `动作「${input.action}」对应的发送分层未开启（${key}）`, '到设置里打开对应的发送分层；这是用户自己的风险开关，模型不得代为开启。');
}
/** 第 2 项：隐身检查（D4）。高危动作前**强制**校验。 */
export function checkStealth(ctx, input) {
    if (input.danger !== 'high')
        return OK;
    const platformId = input.target?.platformId;
    if (platformId === undefined) {
        return deny('stealth', '高危动作缺少平台信息，无法做隐身检查');
    }
    const state = ctx.session?.status(platformId);
    if (state === undefined) {
        return deny('stealth', `读不到 ${platformId} 的隐身状态，按保守处理拒绝`, '先在平台页确认登录与隐身设置。');
    }
    if (state.hiddenFromCurrentEmployer === true)
        return OK;
    return deny('stealth', `未确认对当前雇主隐藏（${platformId}）`, '在平台设置里开启「对当前公司隐藏」，并完成一次隐身检查后再试。');
}
/** 第 3 项：批量上限（§22.4）。 */
export function checkBatch(store, input) {
    if (input.actor !== 'model')
        return OK;
    const config = readGuardConfig(store);
    const payload = input.payload ?? {};
    const jobIds = Array.isArray(payload['jobIds']) ? payload['jobIds'] : undefined;
    const count = jobIds === undefined ? (typeof payload['count'] === 'number' ? payload['count'] : 1) : jobIds.length;
    if (count <= config.batchLimit)
        return OK;
    return deny('batch', `模型单次调用涉及 ${String(count)} 个岗位，超过上限 ${String(config.batchLimit)}`, `请分批，每批不超过 ${String(config.batchLimit)} 个（§22.4：超出必须分批并逐批审批）。`);
}
/** 第 4 项：每日额度（D7）。计数直接读审计表 —— 它就是"今天做了什么"的事实来源。 */
export function checkQuota(ctx, input) {
    const bucket = ACTION_QUOTA[input.action];
    if (bucket === undefined)
        return OK;
    const platformId = input.target?.platformId;
    if (platformId === undefined)
        return OK;
    const config = readGuardConfig(ctx.store);
    const limit = config.dailyLimits[bucket];
    const clock = ctx.clock ?? systemClock;
    const since = `${clock().slice(0, 10)}T00:00:00.000Z`;
    const used = ctx.store.audit.countByAction(input.action, since, true, platformId);
    if (used < limit)
        return OK;
    return deny('quota', `${platformId} 今天的${input.action}已达上限（${String(used)}/${String(limit)}）`, '明天再试，或到设置里调整每日额度。');
}
/** 第 5 项：冷却期（D10）。同公司重复投递要间隔。 */
export function checkCooldown(ctx, input) {
    if (input.action !== 'application.send' && input.action !== 'greeting.send')
        return OK;
    const companyId = input.target?.companyId;
    if (companyId === undefined)
        return OK;
    const config = readGuardConfig(ctx.store);
    if (config.cooldownMinutes <= 0)
        return OK;
    const clock = ctx.clock ?? systemClock;
    const cutoff = new Date(new Date(clock()).getTime() - config.cooldownMinutes * 60 * 1000).toISOString();
    const recent = ctx.store.audit
        .list(200, { action: input.action })
        .filter((record) => record.result === 'ok' && record.at >= cutoff)
        .filter((record) => record.target['companyId'] === companyId);
    const last = recent[0];
    if (last === undefined)
        return OK;
    return deny('cooldown', `同一公司（#${String(companyId)}）在冷却期内已经操作过（上次 ${last.at}）`, `冷却期 ${String(config.cooldownMinutes)} 分钟。这是防误投与防风控的保护，不建议绕过。`);
}
/**
 * 禁止项（§22.4）：模型不得修改审批开关、不得关闭审计、不得扩大自身权限。
 * 这三条在 guard 内**硬编码**校验 —— 不读配置、不给开关。
 */
export function checkForbidden(_ctx, input) {
    if (input.actor !== 'model')
        return OK;
    const patch = input.payload?.['patch'];
    if (input.action !== 'settings.write' || patch === null || typeof patch !== 'object')
        return OK;
    const keys = Object.keys(patch);
    const touched = keys.filter((key) => FORBIDDEN_FOR_MODEL.includes(key));
    if (touched.length === 0)
        return OK;
    return deny('forbidden', `模型不得修改这些配置：${touched.join('、')}`, '审批开关、审计开关、批量上限、额度与冷却期只能由用户在界面上改（§22.4 禁止项）。');
}
/** 走完整条链（审批在 `guard/index.ts` 里做，因为它需要用户交互）。 */
export function runRuleChain(ctx, input) {
    const checks = [
        () => checkForbidden(ctx, input),
        () => checkSwitch(ctx.store, input),
        () => checkStealth(ctx, input),
        () => checkBatch(ctx.store, input),
        () => checkQuota(ctx, input),
        () => checkCooldown(ctx, input),
    ];
    for (const check of checks) {
        const verdict = check();
        if (!verdict.ok)
            return verdict;
    }
    return OK;
}
/** 把规则拒绝翻译成领域错误。 */
export function toDomainError(verdict) {
    return new DomainError('GUARD_DENIED', verdict.message ?? '被安全闸门拒绝', {
        ...(verdict.hint === undefined ? {} : { hint: verdict.hint }),
        ...(verdict.reason === undefined ? {} : { detail: { reason: verdict.reason } }),
    });
}
//# sourceMappingURL=rules.js.map