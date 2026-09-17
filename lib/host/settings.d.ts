/**
 * 插件配置门面（§22.2 `job_settings` / §15）。
 *
 * 界面上改配置、模型工具改配置、审计三者必须**同一套写入路径** ——
 * 否则"模型改了一个开关但界面上看不到"这种事故迟早发生。
 *
 * 写 guard 配置必须持有 guard 令牌（`guardToken` 参数强制），
 * 所以 `settings.write` 这个动作也要过闸门：中危 + 界面发起 → 不打扰用户；
 * 中危 + 模型发起 → 走审批（模型扩大自身权限正是 D-14 要防的事）。
 */
import type { AiConfig, AiConfigPatch, AiPurpose } from './ai/purposes.js';
import type { SettingsWriteDeps } from './guard/actions/settings.js';
import type { GuardToken } from './guard/token.js';
import { type GuardConfig } from './guard/rules.js';
import type { Store } from './store/store.js';
export interface SettingsSnapshot {
    ai: AiConfig;
    guard: GuardConfig;
    /** 供界面展示"这些开关现在是什么状态"的派生信息。 */
    derived: {
        /** 每个用途是否真的可用（总开关 + 用途开关）。 */
        purposes: Array<{
            purpose: AiPurpose;
            label: string;
            enabled: boolean;
        }>;
        /** 模型能改哪些、不能改哪些，直接告诉用户。 */
        modelEditable: string[];
        modelForbidden: string[];
    };
}
export interface SettingsPatch {
    ai?: AiConfigPatch;
    guard?: Partial<GuardConfig>;
}
export interface SettingsService {
    snapshot(): SettingsSnapshot;
    /** 写配置。`guardToken` 由 `guard.run('settings.write')` 签发。 */
    update(patch: SettingsPatch, guardToken: GuardToken): SettingsSnapshot;
}
export interface SettingsDeps extends SettingsWriteDeps {
    ai: {
        config(): AiConfig;
        setConfig(patch: AiConfigPatch): AiConfig;
    };
    clock?: () => string;
}
/** 模型**不能**改的键（与 `guard/rules.ts` 的 `FORBIDDEN_FOR_MODEL` 同源）。 */
export declare const MODEL_FORBIDDEN_KEYS: readonly ["requireApproval", "auditEnabled", "batchLimit", "dailyLimits", "cooldownMinutes"];
/** 模型能改的键：只影响"读什么、用什么"，不影响闸门本身。 */
export declare const MODEL_EDITABLE_KEYS: readonly ["ai", "levels"];
export declare function createSettingsService(deps: SettingsDeps): SettingsService;
/** 把用户能看懂的一行摘要给审批文案用。 */
export declare function describeSettingsPatch(patch: SettingsPatch): string;
/** 供 `store` 参数的类型标注复用。 */
export type { Store };
//# sourceMappingURL=settings.d.ts.map