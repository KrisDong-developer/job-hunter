/**
 * 一次性令牌（§4.4.1 机制化强制 / P10）。
 *
 * 问题：如果"危险动作都走 guard"只是编码规范，第一天就会被绕过 ——
 * 只要有人直接调用 `domain.outreach.send()`，闸门就形同虚设。
 *
 * 做法（四层叠加）：
 *   1. **能力不外露**：危险实现放在 `guard/actions/` 里，**不挂在 domain 的公开面上**；
 *   2. **令牌校验**：`guard.run()` 往 `AsyncLocalStorage` 写一次性令牌，
 *      危险实现的首行校验令牌存在、动作匹配、且没被用过，否则抛 `GUARD_BYPASSED`；
 *   3. **类型约束**：危险实现的签名强制要求 `guardToken` 参数，缺参编译不过；
 *   4. **专项测试**：断言"直接调用危险实现会失败"。
 *
 * 效果：绕过 guard 从"可能发生的人为疏忽"变成"必须刻意改写代码才能做到"。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Actor, Danger } from './types.js'
import { DomainError } from '../util/errors.js'

/**
 * 进程内共享的令牌权威。
 *
 * 用**单例**是刻意的：危险实现位于 `guard/actions/`，它需要在首行拿到同一个权威去校验令牌。
 * 把权威从 guard 一路传进每个动作，只会让"忘记传"变成新的绕过方式。
 * 令牌本身是唯一对象、校验还要求它出现在当前 `AsyncLocalStorage` 上下文里，
 * 所以共享权威不会让两个 guard 互相干扰。
 */
export const guardAuthority: GuardAuthority = createGuardAuthority()

export interface GuardToken {
  readonly id: string
  readonly action: string
  readonly actor: Actor
  readonly danger: Danger
  readonly issuedAt: number
  /** 一次性：用过就作废。 */
  used: boolean
}

export interface GuardAuthority {
  /** 签发一个一次性令牌。 */
  issue(input: { action: string; actor: Actor; danger: Danger }): GuardToken
  /** 在令牌的上下文中执行；期间 `current()` 可见。 */
  run<T>(token: GuardToken, fn: () => Promise<T>): Promise<T>
  /** 当前异步上下文里的令牌。 */
  current(): GuardToken | undefined
  /** 危险实现的首行校验。失败抛 `GUARD_DENIED`。 */
  assert(token: GuardToken | undefined, action: string): void
  /** 供诊断：已签发但未结算的令牌数。 */
  liveCount(): number
}

let sequence = 0

export function createGuardAuthority(): GuardAuthority {
  const storage = new AsyncLocalStorage<GuardToken>()
  const live = new Set<GuardToken>()

  return {
    issue(input): GuardToken {
      sequence += 1
      const token: GuardToken = {
        id: `gt-${String(sequence)}-${Math.random().toString(36).slice(2, 10)}`,
        action: input.action,
        actor: input.actor,
        danger: input.danger,
        issuedAt: Date.now(),
        used: false,
      }
      live.add(token)
      return token
    },

    async run<T>(token: GuardToken, fn: () => Promise<T>): Promise<T> {
      try {
        return await storage.run(token, fn)
      } finally {
        live.delete(token)
      }
    },

    current(): GuardToken | undefined {
      return storage.getStore()
    },

    assert(token, action): void {
      const current = storage.getStore()
      if (token === undefined) {
        throw new DomainError('GUARD_DENIED', `危险动作 ${action} 缺少 guard 令牌`, {
          hint: '这个动作只能经 guard.run() 执行 —— 直接调用危险实现会被拒绝。',
          detail: { action, reason: 'missing-token' },
        })
      }
      if (current === undefined || current !== token) {
        throw new DomainError('GUARD_DENIED', `危险动作 ${action} 的 guard 令牌不在当前上下文中`, {
          hint: '令牌是一次性的，且只在 guard.run() 的执行期间有效。',
          detail: { action, reason: 'foreign-token' },
        })
      }
      if (token.action !== action) {
        throw new DomainError('GUARD_DENIED', `guard 令牌与动作不匹配：${token.action} ≠ ${action}`, {
          detail: { action, tokenAction: token.action, reason: 'action-mismatch' },
        })
      }
      if (token.used) {
        throw new DomainError('GUARD_DENIED', `guard 令牌已被使用过（一次性令牌）`, {
          detail: { action, reason: 'token-reused' },
        })
      }
      token.used = true
    },

    liveCount(): number {
      return live.size
    },
  }
}
