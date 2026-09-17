import type { DatabaseSync } from 'node:sqlite'
import type { CoreField } from '../../../shared/enums.js'
import { asInt, asText, asTextOrNull, type Row } from '../row.js'

/** 一个核心字段的健康计数（§4.2.4）。 */
export interface FieldHealthRecord {
  field: CoreField
  consecutiveMiss: number
  missTotal: number
  hitTotal: number
  lastMissAt: string | null
  lastHitAt: string | null
}

export interface FieldHealthRepo {
  list(platformId: string): FieldHealthRecord[]
  /** 本轮该字段有命中：连续缺失清零。 */
  recordHit(platformId: string, field: CoreField, now: string): void
  /** 本轮该字段整页都没解析出来：连续缺失 +1。@returns 新的连续缺失次数 */
  recordMiss(platformId: string, field: CoreField, now: string): number
  /** 修好选择器并重放成功后调用：把该平台所有字段计数清零。 */
  reset(platformId: string): void
}

export function createFieldHealthRepo(db: DatabaseSync): FieldHealthRepo {
  const selectAll = db.prepare(
    'SELECT field, consecutive_miss, miss_total, hit_total, last_miss_at, last_hit_at FROM adapter_field_health WHERE platform_id = ? ORDER BY field',
  )
  const upsertHit = db.prepare(
    `INSERT INTO adapter_field_health (platform_id, field, consecutive_miss, miss_total, hit_total, last_hit_at)
     VALUES (?, ?, 0, 0, 1, ?)
     ON CONFLICT(platform_id, field) DO UPDATE SET
       consecutive_miss = 0,
       hit_total = hit_total + 1,
       last_hit_at = excluded.last_hit_at`,
  )
  const upsertMiss = db.prepare(
    `INSERT INTO adapter_field_health (platform_id, field, consecutive_miss, miss_total, hit_total, last_miss_at)
     VALUES (?, ?, 1, 1, 0, ?)
     ON CONFLICT(platform_id, field) DO UPDATE SET
       consecutive_miss = consecutive_miss + 1,
       miss_total = miss_total + 1,
       last_miss_at = excluded.last_miss_at`,
  )
  const selectMiss = db.prepare(
    'SELECT consecutive_miss FROM adapter_field_health WHERE platform_id = ? AND field = ?',
  )
  const resetStmt = db.prepare(
    'UPDATE adapter_field_health SET consecutive_miss = 0 WHERE platform_id = ?',
  )

  const toRecord = (row: Row): FieldHealthRecord => ({
    field: asText(row['field']) as CoreField,
    consecutiveMiss: asInt(row['consecutive_miss']),
    missTotal: asInt(row['miss_total']),
    hitTotal: asInt(row['hit_total']),
    lastMissAt: asTextOrNull(row['last_miss_at']),
    lastHitAt: asTextOrNull(row['last_hit_at']),
  })

  return {
    list(platformId): FieldHealthRecord[] {
      return (selectAll.all(platformId) as Row[]).map(toRecord)
    },
    recordHit(platformId, field, now): void {
      upsertHit.run(platformId, field, now)
    },
    recordMiss(platformId, field, now): number {
      upsertMiss.run(platformId, field, now)
      const row = selectMiss.get(platformId, field) as Row | undefined
      return asInt(row?.['consecutive_miss'])
    },
    reset(platformId): void {
      resetStmt.run(platformId)
    },
  }
}
