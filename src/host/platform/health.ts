/**
 * 适配器健康与降级告警（§4.2.3 状态机 + §4.2.4 逐字段计数）。
 *
 *   healthy ──某字段连续缺失达阈值──→ degraded ──仍失败──→ broken
 *      ↑                                                        │
 *      └──────────── 修复后一轮全部命中（等价于自检通过）────────┘
 *
 * 两条语义要守住：
 *   * **降级即暂停写入**：该平台只保留读取与人工修复入口，不再往主表写；
 *   * **告警必须主动**：降级要产生待办（`createOnce` 去重，避免每轮刷屏）。
 */
import { CORE_FIELD_MISS_THRESHOLD } from '../../shared/constants.js'
import type { FieldHealthDto } from '../../shared/dto.js'
import type { CoreField, HealthState } from '../../shared/enums.js'
import type { Store } from '../store/store.js'
import { isFieldMiss, type FieldPresence } from './validate.js'

export interface FieldMissOutcome {
  field: CoreField
  consecutiveMiss: number
  /** 本次是否因为该字段而触发降级。 */
  triggered: boolean
}

export interface RunHealthOutcome {
  platformId: string
  degraded: boolean
  /** 本次**新发生**的降级（用于告警去重与日志）。 */
  newlyDegraded: boolean
  recovered: boolean
  reasons: string[]
  fields: FieldMissOutcome[]
}

export interface ApplyFieldPresenceOptions {
  threshold?: number
  now: string
}

/** 读某个平台的健康快照（给 /health 与诊断用）。 */
export function readAdapterHealth(store: Store, platformId: string): {
  health: HealthState
  failStreak: number
  lastOkAt: string | null
  reason: string | null
  fields: FieldHealthDto[]
} {
  const platform = store.platform.get(platformId)
  const fields: FieldHealthDto[] = store.fieldHealth.list(platformId).map((record) => ({
    field: record.field,
    consecutiveMiss: record.consecutiveMiss,
    missTotal: record.missTotal,
    hitTotal: record.hitTotal,
    lastMissAt: record.lastMissAt,
    lastHitAt: record.lastHitAt,
  }))
  return {
    health: platform?.health ?? 'healthy',
    failStreak: platform?.failStreak ?? 0,
    lastOkAt: platform?.lastOkAt ?? null,
    reason: platform?.healthReason ?? null,
    fields,
  }
}

/**
 * 把一轮的字段命中情况落库，并在必要时降级 + 告警。
 *
 * 恢复规则：**降级后只要有一轮全部字段都命中**（即解析恢复），就回到 healthy 并关掉待办。
 * 这是「修复并自检通过 → 健康」的落地形态 —— 解析成功本身就是最直接的自检。
 */
export function applyFieldPresence(
  store: Store,
  platformId: string,
  presence: readonly FieldPresence[],
  options: ApplyFieldPresenceOptions,
): RunHealthOutcome {
  const threshold = options.threshold ?? CORE_FIELD_MISS_THRESHOLD
  const reasons: string[] = []
  const fields: FieldMissOutcome[] = []

  for (const entry of presence) {
    if (isFieldMiss(entry)) {
      const consecutive = store.fieldHealth.recordMiss(platformId, entry.field, options.now)
      const triggered = consecutive >= threshold
      if (triggered) {
        reasons.push(`字段 ${entry.field} 连续 ${consecutive} 轮整页缺失（阈值 ${threshold}）`)
      }
      fields.push({ field: entry.field, consecutiveMiss: consecutive, triggered })
    } else if (entry.present > 0) {
      store.fieldHealth.recordHit(platformId, entry.field, options.now)
      fields.push({ field: entry.field, consecutiveMiss: 0, triggered: false })
    } else {
      fields.push({ field: entry.field, consecutiveMiss: 0, triggered: false })
    }
  }

  const before = store.platform.get(platformId)?.health ?? 'healthy'
  const degradedNow = reasons.length > 0

  if (degradedNow) {
    const reasonText = reasons.join('；')
    store.platform.setHealth(platformId, 'degraded', reasonText, options.now)
    store.todo.createOnce(
      {
        kind: 'adapter-degraded',
        level: 'urgent',
        title: `${platformId} 适配器降级：核心字段连续缺失`,
        ref: platformId,
        detail: { reasons, fields },
      },
      options.now,
    )
    return {
      platformId,
      degraded: true,
      newlyDegraded: before !== 'degraded' && before !== 'broken',
      recovered: false,
      reasons,
      fields,
    }
  }

  // 本轮有记录且没有整页缺失 → 视为解析恢复
  const hadRecords = presence.some((entry) => entry.records > 0)
  const recovered = hadRecords && (before === 'degraded' || before === 'broken')
  if (recovered) {
    store.fieldHealth.reset(platformId)
    store.platform.setHealth(platformId, 'healthy', null, options.now)
    store.todo.closeByRef('adapter-degraded', platformId, options.now)
    store.todo.closeByRef('adapter-broken', platformId, options.now)
    store.todo.closeByRef('login-required', platformId, options.now)
  }

  return { platformId, degraded: false, newlyDegraded: false, recovered, reasons, fields }
}

/**
 * 运行级失败（异常 / 风控命中 / 登录态失效）。
 * 连续失败达阈值 → `broken`，并产生一条待办。
 */
export function recordRunFailure(
  store: Store,
  platformId: string,
  errorCode: string,
  message: string,
  options: { threshold: number; now: string },
): { failStreak: number; broken: boolean } {
  const failStreak = store.platform.recordFailure(platformId, options.now)
  const broken = failStreak >= options.threshold
  const isLogin = errorCode === 'NOT_LOGGED_IN'
  const kind = isLogin ? 'login-required' : broken ? 'adapter-broken' : null

  if (kind !== null) {
    store.platform.setHealth(platformId, 'broken', message, options.now)
    store.todo.createOnce(
      {
        kind,
        level: 'urgent',
        title: isLogin ? `${platformId} 需要重新登录` : `${platformId} 适配器失效`,
        ref: platformId,
        detail: { errorCode, message, failStreak },
      },
      options.now,
    )
  }

  return { failStreak, broken }
}

/**
 * 运行级成功：清零 fail_streak。
 *
 * 注意**不在这里改健康态** —— 把 degraded/broken 拉回 healthy 的唯一依据是
 * `applyFieldPresence` 判定「解析真的恢复了」。否则「解析恢复」这件事会被
 * 一次普通 run 抢先抹掉，恢复路径与待办关闭就永远不会发生。
 */
export function recordRunSuccess(store: Store, platformId: string, now: string): void {
  store.platform.recordSuccess(platformId, now)
}
