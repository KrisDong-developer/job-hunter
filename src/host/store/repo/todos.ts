import type { DatabaseSync } from 'node:sqlite'
import type { TodoKind, TodoLevel } from '../../../shared/contract/enums/today.js'
import { asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/** 一条待办。 */
export interface TodoRecord {
  id: number
  kind: TodoKind
  level: TodoLevel
  title: string
  ref: string | null
  detail: unknown
  dueAt: string | null
  state: string
  createdAt: string
}

export interface CreateTodoInput {
  kind: TodoKind
  level?: TodoLevel
  title: string
  ref?: string | null
  detail?: unknown
  dueAt?: string | null
}

export interface TodoRepo {
  create(input: CreateTodoInput, now: string): number
  /**
   * 幂等创建：同 `kind + ref` 已有未关闭待办时不再新建。
   * 降级告警每轮都会触发，必须靠这个去重，否则待办会被刷屏。
   * @returns 新建的 id；已存在时返回 null
   */
  createOnce(input: CreateTodoInput, now: string): number | null
  listOpen(
    filters?: number | { kind?: TodoKind; level?: TodoLevel; limit?: number },
  ): TodoRecord[]
  /** 读单条待办（含 detail），供"待确认动作一键执行/恢复"用。 */
  get(id: number): TodoRecord | undefined
  countOpen(): number
  /** 用户点「知道了／忽略」。 */
  close(id: number, now: string): boolean
  closeByRef(kind: TodoKind, ref: string, now: string): number
}

export function createTodoRepo(db: DatabaseSync): TodoRepo {
  const insert = db.prepare(
    `INSERT INTO todo (kind, level, title, ref, detail_json, due_at, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
  )
  const findOpen = db.prepare(
    "SELECT id FROM todo WHERE kind = ? AND ifnull(ref, '') = ifnull(?, '') AND state = 'open' LIMIT 1",
  )
  const selectOpen = db.prepare(
    "SELECT id, kind, level, title, ref, detail_json, due_at, state, created_at FROM todo WHERE state = 'open' ORDER BY CASE level WHEN 'urgent' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT ?",
  )
  const selectById = db.prepare('SELECT * FROM todo WHERE id = ?')
  const listOpenFiltered = db.prepare(
    "SELECT id, kind, level, title, ref, detail_json, due_at, state, created_at FROM todo WHERE state = 'open'" +
      ' AND kind = ? AND level = ?' +
      " ORDER BY CASE level WHEN 'urgent' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT ?",
  )
  const listOpenKind = db.prepare(
    "SELECT id, kind, level, title, ref, detail_json, due_at, state, created_at FROM todo WHERE state = 'open'" +
      ' AND kind = ?' +
      " ORDER BY CASE level WHEN 'urgent' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT ?",
  )
  const listOpenLevel = db.prepare(
    "SELECT id, kind, level, title, ref, detail_json, due_at, state, created_at FROM todo WHERE state = 'open'" +
      ' AND level = ?' +
      " ORDER BY CASE level WHEN 'urgent' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT ?",
  )
  const countOpenStmt = db.prepare("SELECT count(*) AS n FROM todo WHERE state = 'open'")
  const closeByIdStmt = db.prepare("UPDATE todo SET state = 'closed', read_at = ? WHERE id = ? AND state = 'open'")
  const closeStmt = db.prepare(
    "UPDATE todo SET state = 'closed' WHERE kind = ? AND ifnull(ref, '') = ifnull(?, '') AND state = 'open'",
  )

  const toRecord = (row: Row): TodoRecord => ({
    id: asInt(row['id']),
    kind: asText(row['kind']) as TodoKind,
    level: asText(row['level'], 'info') as TodoLevel,
    title: asText(row['title']),
    ref: asTextOrNull(row['ref']),
    detail: asJson<unknown>(row['detail_json'], null),
    dueAt: asTextOrNull(row['due_at']),
    state: asText(row['state'], 'open'),
    createdAt: asText(row['created_at']),
  })

  const create = (input: CreateTodoInput, now: string): number => {
    const result = insert.run(
      input.kind,
      input.level ?? 'info',
      input.title,
      input.ref ?? null,
      JSON.stringify(input.detail ?? {}),
      input.dueAt ?? null,
      now,
    )
    return asId(result.lastInsertRowid)
  }

  return {
    create,
    createOnce(input, now): number | null {
      const existing = findOpen.get(input.kind, input.ref ?? '') as Row | undefined
      if (existing !== undefined) return null
      return create(input, now)
    },
    listOpen(filters): TodoRecord[] {
      if (typeof filters === 'number') {
        return (selectOpen.all(filters) as Row[]).map(toRecord)
      }
      const options = filters ?? {}
      const limit = options.limit ?? 50
      if (options.kind !== undefined && options.level !== undefined) {
        return (listOpenFiltered.all(options.kind, options.level, limit) as Row[]).map(toRecord)
      }
      if (options.kind !== undefined) {
        return (listOpenKind.all(options.kind, limit) as Row[]).map(toRecord)
      }
      if (options.level !== undefined) {
        return (listOpenLevel.all(options.level, limit) as Row[]).map(toRecord)
      }
      return (selectOpen.all(limit) as Row[]).map(toRecord)
    },
    get(id): TodoRecord | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },
    countOpen(): number {
      const row = countOpenStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
    close(id, now): boolean {
      return asInt(closeByIdStmt.run(now, id).changes) > 0
    },
    closeByRef(kind, ref, _now): number {
      const result = closeStmt.run(kind, ref)
      return asInt(result.changes)
    },
  }
}
