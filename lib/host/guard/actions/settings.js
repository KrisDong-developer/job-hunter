import { DomainError } from '../../util/errors.js';
import { systemClock } from '../../util/time.js';
import { FORBIDDEN_FOR_MODEL, writeGuardConfig } from '../rules.js';
import { guardAuthority } from '../token.js';
export const SETTINGS_WRITE_ACTION = 'settings.write';
/** 涉及发送分层的键（改这些要审批，但用户与模型都可以改 —— 只是模型要过审批）。 */
export const LEVEL_KEYS = ['levels'];
/**
 * 写 guard 配置。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌
 */
export function writeGuardSettings(deps, guardToken, patch) {
    guardAuthority.assert(guardToken, SETTINGS_WRITE_ACTION);
    const keys = Object.keys(patch);
    const forbidden = keys.filter((key) => FORBIDDEN_FOR_MODEL.includes(key));
    if (forbidden.length > 0 && guardToken.actor === 'model') {
        throw new DomainError('GUARD_DENIED', `模型不得修改这些配置：${forbidden.join('、')}`, {
            hint: '审批开关、审计开关、批量上限、额度与冷却期只能由用户在界面上修改（§22.4 禁止项）。',
            detail: { reason: 'forbidden', keys: forbidden.join(',') },
        });
    }
    const clock = deps.clock ?? systemClock;
    return writeGuardConfig(deps.store, patch, clock());
}
//# sourceMappingURL=settings.js.map