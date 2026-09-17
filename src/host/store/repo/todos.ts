import type { DatabaseSync } from 'node:sqlite'
import type { TodoKind, TodoLevel } from '../../../shared/enums.js'
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
  listOpen(limit?: number): TodoRecord[]
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
    listOpen(limit = 50): TodoRecord[] {
      return (selectOpen.all(limit) as Row[]).map(toRecord)
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
