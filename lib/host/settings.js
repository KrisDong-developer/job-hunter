import { AI_PURPOSE_DEFAULT_ENABLED, AI_PURPOSE_LABEL, normalizeAiConfig } from './ai/purposes.js';
import { writeGuardSettings } from './guard/actions/settings.js';
import { DEFAULT_GUARD_CONFIG, readGuardConfig } from './guard/rules.js';
/** 模型**不能**改的键（与 `guard/rules.ts` 的 `FORBIDDEN_FOR_MODEL` 同源）。 */
export const MODEL_FORBIDDEN_KEYS = [
    'requireApproval',
    'auditEnabled',
    'batchLimit',
    'dailyLimits',
    'cooldownMinutes',
    'sendWindow',
    'dayOffProbability',
];
/** 模型能改的键：只影响"读什么、用什么"，不影响闸门本身。 */
export const MODEL_EDITABLE_KEYS = ['ai', 'levels', 'browser'];
export function createSettingsService(deps) {
    const snapshot = () => {
        const ai = normalizeAiConfig(deps.ai.config());
        const guard = readGuardConfig(deps.store);
        return {
            ai,
            guard,
            browser: deps.browser.read(),
            crawl: deps.crawl.read(),
            derived: {
                purposes: Object.keys(AI_PURPOSE_LABEL).map((purpose) => ({
                    purpose,
                    label: AI_PURPOSE_LABEL[purpose],
                    enabled: ai.enabled && ai.purposes[purpose] !== false,
                })),
                modelEditable: [...MODEL_EDITABLE_KEYS],
                modelForbidden: [...MODEL_FORBIDDEN_KEYS],
                defaults: {
                    purposes: { ...AI_PURPOSE_DEFAULT_ENABLED },
                    guard: {
                        dailyLimits: { ...DEFAULT_GUARD_CONFIG.dailyLimits },
                        cooldownMinutes: DEFAULT_GUARD_CONFIG.cooldownMinutes,
                        batchLimit: DEFAULT_GUARD_CONFIG.batchLimit,
                        sendWindow: DEFAULT_GUARD_CONFIG.sendWindow,
                        dayOffProbability: DEFAULT_GUARD_CONFIG.dayOffProbability,
                    },
                },
            },
        };
    };
    return {
        snapshot,
        update(patch, guardToken) {
            // guard 配置的写入必须过令牌校验（`writeGuardSettings` 首行 assert）
            if (patch.guard !== undefined && Object.keys(patch.guard).length > 0) {
                writeGuardSettings({ store: deps.store, ...(deps.clock === undefined ? {} : { clock: deps.clock }) }, guardToken, patch.guard);
            }
            if (patch.ai !== undefined && Object.keys(patch.ai).length > 0) {
                deps.ai.setConfig(patch.ai);
            }
            // 浏览器设置**不过** guard 令牌：它是资源设置，不是闸门。
            if (patch.browser !== undefined && Object.keys(patch.browser).length > 0) {
                deps.browser.write(patch.browser);
            }
            // 采集预算同理（资源/节奏设置）；且模型不可改 —— 见 crawl-config.ts 的说明。
            if (patch.crawl !== undefined && Object.keys(patch.crawl).length > 0) {
                deps.crawl.write(patch.crawl);
            }
            return snapshot();
        },
    };
}
/** 把用户能看懂的一行摘要给审批文案用。 */
export function describeSettingsPatch(patch) {
    const parts = [];
    if (patch.ai !== undefined) {
        if (patch.ai.enabled !== undefined)
            parts.push(`模型总开关 → ${patch.ai.enabled ? '开' : '关'}`);
        for (const [purpose, value] of Object.entries(patch.ai.purposes ?? {})) {
            const label = AI_PURPOSE_LABEL[purpose] ?? purpose;
            parts.push(`${label} → ${value === true ? '开' : '关'}`);
        }
    }
    if (patch.guard !== undefined) {
        if (patch.guard.levels !== undefined) {
            const levels = patch.guard.levels;
            if (levels.l3Greeting !== undefined)
                parts.push(`L3 打招呼 → ${levels.l3Greeting ? '开' : '关'}`);
            if (levels.l4Application !== undefined)
                parts.push(`L4 投递 → ${levels.l4Application ? '开' : '关'}`);
            if (levels.l4Reply !== undefined)
                parts.push(`L4 回复 → ${levels.l4Reply ? '开' : '关'}`);
        }
        for (const key of MODEL_FORBIDDEN_KEYS) {
            if (patch.guard[key] !== undefined)
                parts.push(`${key} → ${JSON.stringify(patch.guard[key])}`);
        }
    }
    if (patch.browser?.idleCloseMinutes !== undefined) {
        const minutes = patch.browser.idleCloseMinutes;
        parts.push(minutes <= 0 ? '浏览器空闲后不自动关闭' : `浏览器空闲 ${String(minutes)} 分钟后关闭`);
    }
    if (patch.browser?.closeAfterRun !== undefined) {
        parts.push(patch.browser.closeAfterRun
            ? '每轮采集结束后关闭采集浏览器'
            : '每轮采集结束后不关闭采集浏览器（改由空闲时长决定）');
    }
    if (patch.crawl?.roundBudgetMinutes !== undefined) {
        parts.push(`单轮采集预算 → ${String(patch.crawl.roundBudgetMinutes)} 分钟`);
    }
    return parts.length === 0 ? '（没有实际改动）' : parts.join('；');
}
//# sourceMappingURL=settings.js.map