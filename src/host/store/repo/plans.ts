import type { DatabaseSync } from 'node:sqlite'
import type { PlanDto, PlanSchedule } from '../../../shared/dto.js'
import { asBool, asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/** 默认定时：工作日 09:30 那一轮，抖动 10 分钟。 */
export const DEFAULT_SCHEDULE: PlanSchedule = {
  enabled: true,
  hour: 9,
  minute: 30,
  weekdays: [1, 2, 3, 4, 5],
  jitterMs: 10 * 60 * 1000,
  missedGraceMs: 6 * 60 * 60 * 1000,
}

export interface PlanUpsertInput {
  name: string
  platforms: string[]
  criteria?: Record<string, string>
  schedule?: Partial<PlanSchedule>
  enabled?: boolean
}

export interface PlanRepo {
  create(input: PlanUpsertInput, now: string): PlanDto
  update(id: number, patch: Partial<PlanUpsertInput>, now: string): PlanDto
  get(id: number): PlanDto | undefined
  list(): PlanDto[]
  remove(id: number): boolean
  /** 定时器算完下一轮之后回写。 */
  setRunTimes(id: number, times: { lastRunAt?: string | null; nextRunAt?: string | null }): void
  count(): number
}

/** 把外部传进来的 schedule 收敛成合法值 —— 定时配置坏掉会静默不跑，必须拦住。 */
export function normalizeSchedule(patch: Partial<PlanSchedule> | undefined, base = DEFAULT_SCHEDULE): PlanSchedule {
  const merged = { ...base, ...(patch ?? {}) }
  const hour = Number.isFinite(merged.hour) ? Math.max(0, Math.min(23, Math.trunc(merged.hour))) : base.hour
  const minute = Number.isFinite(merged.minute) ? Math.max(0, Math.min(59, Math.trunc(merged.minute))) : base.minute
  const weekdays = Array.isArray(merged.weekdays)
    ? [...new Set(merged.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : base.weekdays
  const jitterMs = Number.isFinite(merged.jitterMs) ? Math.max(0, Math.min(60 * 60 * 1000, Math.trunc(merged.jitterMs))) : base.jitterMs
  const missedGraceMs = Number.isFinite(merged.missedGraceMs)
    ? Math.max(0, Math.min(7 * 24 * 60 * 60 * 1000, Math.trunc(merged.missedGraceMs)))
    : base.missedGraceMs
  return { enabled: merged.enabled !== false, hour, minute, weekdays, jitterMs, missedGraceMs }
}

function toDto(row: Row): PlanDto {
  return {
    id: asInt(row['id']),
    name: asText(row['name']),
    platforms: asJson<string[]>(row['platforms_json'], []),
    criteria: asJson<Record<string, string>>(row['criteria_json'], {}),
    schedule: normalizeSchedule(asJson<Partial<PlanSchedule>>(row['schedule_json'], {})),
    enabled: asBool(row['enabled'], true),
    lastRunAt: asTextOrNull(row['last_run_at']),
    nextRunAt: asTextOrNull(row['next_run_at']),
    createdAt: asText(row['created_at']),
  }
}

export function createPlanRepo(db: DatabaseSync): PlanRepo {
  const insert = db.prepare(
    `INSERT INTO plan (name, platforms_json, criteria_json, keywords_json, exclude_json, schedule_json, enabled, created_at)
     VALUES (?, ?, ?, '[]', '[]', ?, ?, ?)`,
  )
  const selectById = db.prepare('SELECT * FROM plan WHERE id = ?')
  const selectAll = db.prepare('SELECT * FROM plan ORDER BY id')
  const updateStmt = db.prepare(
    `UPDATE plan SET name = ?, platforms_json = ?, criteria_json = ?, schedule_json = ?, enabled = ? WHERE id = ?`,
  )
  const deleteStmt = db.prepare('DELETE FROM plan WHERE id = ?')
  const setTimes = db.prepare('UPDATE plan SET last_run_at = coalesce(?, last_run_at), next_run_at = ? WHERE id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM plan')

  const require = (id: number): PlanDto => {
    const row = selectById.get(id) as Row | undefined
    if (row === undefined) throw new Error(`plan ${String(id)} 不存在`)
    return toDto(row)
  }

  return {
    create(input, now): PlanDto {
      const schedule = normalizeSchedule(input.schedule)
      const result = insert.run(
        input.name,
        JSON.stringify(input.platforms),
        JSON.stringify(input.criteria ?? {}),
        JSON.stringify(schedule),
        input.enabled === false ? 0 : 1,
        now,
      )
      return require(asId(result.lastInsertRowid))
    },

    update(id, patch, _now): PlanDto {
      const current = require(id)
      const schedule = normalizeSchedule(patch.schedule, current.schedule)
      updateStmt.run(
        patch.name ?? current.name,
        JSON.stringify(patch.platforms ?? current.platforms),
        JSON.stringify(patch.criteria ?? current.criteria),
        JSON.stringify(schedule),
        (patch.enabled ?? current.enabled) ? 1 : 0,
        id,
      )
      return require(id)
    },

    get(id): PlanDto | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toDto(row)
    },

    list(): PlanDto[] {
      return (selectAll.all() as Row[]).map(toDto)
    },

    remove(id): boolean {
      return asInt(deleteStmt.run(id).changes) > 0
    },

    setRunTimes(id, times): void {
      setTimes.run(times.lastRunAt ?? null, times.nextRunAt ?? null, id)
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
