import { AI_PURPOSE_LABEL, normalizeAiConfig } from './ai/purposes.js';
import { writeGuardSettings } from './guard/actions/settings.js';
import { readGuardConfig } from './guard/rules.js';
/** 模型**不能**改的键（与 `guard/rules.ts` 的 `FORBIDDEN_FOR_MODEL` 同源）。 */
export const MODEL_FORBIDDEN_KEYS = [
    'requireApproval',
    'auditEnabled',
    'batchLimit',
    'dailyLimits',
    'cooldownMinutes',
];
/** 模型能改的键：只影响"读什么、用什么"，不影响闸门本身。 */
export const MODEL_EDITABLE_KEYS = ['ai', 'levels'];
export function createSettingsService(deps) {
    const snapshot = () => {
        const ai = normalizeAiConfig(deps.ai.config());
        const guard = readGuardConfig(deps.store);
        return {
            ai,
            guard,
            derived: {
                purposes: Object.keys(AI_PURPOSE_LABEL).map((purpose) => ({
                    purpose,
                    label: AI_PURPOSE_LABEL[purpose],
                    enabled: ai.enabled && ai.purposes[purpose] !== false,
                })),
                modelEditable: [...MODEL_EDITABLE_KEYS],
                modelForbidden: [...MODEL_FORBIDDEN_KEYS],
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
    return parts.length === 0 ? '（没有实际改动）' : parts.join('；');
}
//# sourceMappingURL=settings.js.map