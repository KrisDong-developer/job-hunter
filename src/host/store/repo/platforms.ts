import type { DatabaseSync } from 'node:sqlite'
import type { HealthState } from '../../../shared/contract/enums/crawl.js'
import { asBool, asInt, asIntOrNull, asJson, asText, asTextOrNull, type Row } from '../row.js'

/** 一个平台的运行记录。 */
export interface PlatformRecord {
  id: string
  displayName: string
  enabled: boolean
  capabilities: unknown
  health: HealthState
  healthReason: string | null
  failStreak: number
  lastOkAt: string | null
  createdAt: string
}

export interface EnsurePlatformInput {
  id: string
  displayName: string
  capabilities?: unknown
}

export interface PlatformRepo {
  /** 幂等登记平台；已存在时只补 display_name / capabilities，**不覆盖 enabled 与健康态**。 */
  ensure(input: EnsurePlatformInput, now: string): void
  get(id: string): PlatformRecord | undefined
  list(): PlatformRecord[]
  setHealth(id: string, health: HealthState, reason: string | null, now: string): void
  /** 一次成功：清零 fail_streak、记 last_ok_at、健康态回 healthy。 */
  recordSuccess(id: string, now: string): void
  /** 一次失败：fail_streak +1，返回新的连续失败次数。 */
  recordFailure(id: string, now: string): number
}

export function createPlatformRepo(db: DatabaseSync): PlatformRepo {
  const insert = db.prepare(
    `INSERT INTO platform (id, display_name, capabilities_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, capabilities_json = excluded.capabilities_json`,
  )
  const selectOne = db.prepare('SELECT * FROM platform WHERE id = ?')
  const selectAll = db.prepare('SELECT * FROM platform ORDER BY id')
  const updateHealth = db.prepare('UPDATE platform SET health_state = ?, health_reason = ? WHERE id = ?')
  // 只清失败计数与记 last_ok_at。**健康态不在这里翻** ——
  // 从 degraded/broken 回到 healthy 的唯一依据是「解析真的恢复了」（见 platform/health.ts）。
  // 早先这里顺手把 health_state 置成 healthy，结果降级状态被一次 run 抹掉，
  // 恢复待办永远关不掉。
  const updateSuccess = db.prepare(
    'UPDATE platform SET fail_streak = 0, last_ok_at = ? WHERE id = ?',
  )
  const updateFailure = db.prepare('UPDATE platform SET fail_streak = fail_streak + 1 WHERE id = ?')
  const selectStreak = db.prepare('SELECT fail_streak FROM platform WHERE id = ?')

  const toRecord = (row: Row): PlatformRecord => ({
    id: asText(row['id']),
    displayName: asText(row['display_name']),
    enabled: asBool(row['enabled'], true),
    capabilities: asJson<unknown>(row['capabilities_json'], {}),
    health: asText(row['health_state'], 'healthy') as HealthState,
    healthReason: asTextOrNull(row['health_reason']),
    failStreak: asInt(row['fail_streak']),
    lastOkAt: asTextOrNull(row['last_ok_at']),
    createdAt: asText(row['created_at']),
  })

  return {
    ensure(input, now): void {
      insert.run(input.id, input.displayName, JSON.stringify(input.capabilities ?? {}), now)
    },
    get(id): PlatformRecord | undefined {
      const row = selectOne.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },
    list(): PlatformRecord[] {
      return (selectAll.all() as Row[]).map(toRecord)
    },
    setHealth(id, health, reason, _now): void {
      updateHealth.run(health, reason, id)
    },
    recordSuccess(id, now): void {
      updateSuccess.run(now, id)
    },
    recordFailure(id): number {
      updateFailure.run(id)
      const row = selectStreak.get(id) as Row | undefined
      return asIntOrNull(row?.['fail_streak']) ?? 0
    },
  }
}
