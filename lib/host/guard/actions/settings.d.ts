/**
 * 危险动作实现：**写配置**。
 *
 * 为什么写配置也算危险：§22.2 明确「改 L3/L4 风险开关需审批」，
 * 而 §22.4 更硬：「模型不得修改审批开关本身、不得关闭审计、不得扩大自身权限」。
 *
 * 禁止项在这里**再校验一次**（`rules.ts` 里已经查过一遍）。
 * 两处都查不是冗余：这一处用的是**令牌里的 actor**，
 * 就算有人只改了 `rules.ts` 也绕不过去（防御纵深）。
 */
import type { Store } from '../../store/store.js';
import { type Clock } from '../../util/time.js';
import { type GuardConfig } from '../rules.js';
import { type GuardToken } from '../token.js';
export declare const SETTINGS_WRITE_ACTION = "settings.write";
export interface SettingsWriteDeps {
    store: Store;
    clock?: Clock;
}
/** 涉及发送分层的键（改这些要审批，但用户与模型都可以改 —— 只是模型要过审批）。 */
export declare const LEVEL_KEYS: readonly ["levels"];
/**
 * 写 guard 配置。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌
 */
export declare function writeGuardSettings(deps: SettingsWriteDeps, guardToken: GuardToken, patch: Partial<GuardConfig>): GuardConfig;
//# sourceMappingURL=settings.d.ts.map