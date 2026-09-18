/**
 * 平台级风控暂停（SR-21/22）。
 *
 * ## 为什么必须是**平台级**而不是方案级
 *
 * 验证码、登录墙、限流、平台配额，全是「平台账号 ↔ 平台」之间的事，
 * 与"哪个方案去抓它"无关。挂在方案上会同时造成两个方向的错误：
 *
 *   * **连坐**：猎聘弹了滑块，把同一方案里健康的 51job / 智联一起停掉；
 *   * **漏拦**：反过来，猎聘被暂停之后，**另一个方案**去碰它却不会被拦住。
 *
 * 两个方向在多平台之前都看不出来（一个方案往往只有一个平台），
 * 平台数上来之后就成了日常。
 *
 * ## 为什么存 `setting` 而不是加列
 *
 * 与 `cooldown-until` 同一套路数：这是**短命**的运行时状态（几小时到一天），
 * 不值得为它做一次 schema 迁移。
 *
 * 读它的是 `runtime.platformGate`（每平台前置条件的唯一入口），
 * 调度器只负责写与清 —— 判定与状态写入不分散在两个地方。
 */
import type { Store } from '../store/store.js'

export const RISK_PAUSE_KEY = 'risk-paused'
export const RISK_PAUSE_SCOPE = 'platform' as const

export interface PlatformRiskPause {
  paused: boolean
  reason: string | null
  /** 暂停时刻（ISO）。裸 `true` 兼容值没有这个信息。 */
  at: string | null
}

/**
 * 读某个平台的风控暂停状态。
 *
 * 裸 `true` 也认，理由与全局暂停开关一样：兼容手工写过这个键的库 ——
 * 不认的话"看起来暂停了、实际没暂停"，比不兼容更糟。
 */
export function readPlatformRiskPause(store: Store, platformId: string): PlatformRiskPause {
  const stored = store.setting.get<unknown>(RISK_PAUSE_KEY, RISK_PAUSE_SCOPE, platformId)
  if (stored === true) return { paused: true, reason: null, at: null }
  if (stored !== null && typeof stored === 'object') {
    const record = stored as { reason?: unknown; at?: unknown }
    return {
      paused: true,
      reason: typeof record.reason === 'string' && record.reason !== '' ? record.reason : null,
      at: typeof record.at === 'string' ? record.at : null,
    }
  }
  return { paused: false, reason: null, at: null }
}

export function setPlatformRiskPause(
  store: Store,
  platformId: string,
  reason: string,
  now: string,
): void {
  store.setting.set(RISK_PAUSE_KEY, RISK_PAUSE_SCOPE, platformId, { reason, at: now }, now)
}

export function clearPlatformRiskPause(store: Store, platformId: string): void {
  store.setting.remove(RISK_PAUSE_KEY, RISK_PAUSE_SCOPE, platformId)
}

/**
 * 方案级 `riskPaused` 的派生口径：**该方案下所有平台都被风控暂停**。
 *
 * 语义上它回答的仍是"这个方案现在能不能自动跑"，但不再是独立的一份状态 ——
 * 独立存储一定会跟平台级的真值漂移（一个方案有 5 个平台，5 个状态）。
 * 0 个平台时返回 false：没有平台的方案由 `plan_disabled` / 校验去管，不归这里。
 */
export function allPlatformsRiskPaused(store: Store, platformIds: readonly string[]): boolean {
  return platformIds.length > 0 && platformIds.every((id) => readPlatformRiskPause(store, id).paused)
}
