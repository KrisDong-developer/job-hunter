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
import type { Store } from '../../store/store.js'
import { DomainError } from '../../util/errors.js'
import { systemClock, type Clock } from '../../util/time.js'
import { FORBIDDEN_FOR_MODEL, writeGuardConfig, type GuardConfig } from '../rules.js'
import { guardAuthority, type GuardToken } from '../token.js'

export const SETTINGS_WRITE_ACTION = 'settings.write'

export interface SettingsWriteDeps {
  store: Store
  clock?: Clock
}

/** 涉及发送分层的键（改这些要审批，但用户与模型都可以改 —— 只是模型要过审批）。 */
export const LEVEL_KEYS = ['levels'] as const

/**
 * 写 guard 配置。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌
 */
export function writeGuardSettings(
  deps: SettingsWriteDeps,
  guardToken: GuardToken,
  patch: Partial<GuardConfig>,
): GuardConfig {
  guardAuthority.assert(guardToken, SETTINGS_WRITE_ACTION)

  const keys = Object.keys(patch)
  const forbidden = keys.filter((key) => (FORBIDDEN_FOR_MODEL as readonly string[]).includes(key))
  if (forbidden.length > 0 && guardToken.actor === 'model') {
    throw new DomainError('GUARD_DENIED', `模型不得修改这些配置：${forbidden.join('、')}`, {
      hint: '审批开关、审计开关、批量上限、额度与冷却期只能由用户在界面上修改（§22.4 禁止项）。',
      detail: { reason: 'forbidden', keys: forbidden.join(',') },
    })
  }

  const clock = deps.clock ?? systemClock
  return writeGuardConfig(deps.store, patch, clock())
}
