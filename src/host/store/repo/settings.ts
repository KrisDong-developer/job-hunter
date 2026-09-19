import type { DatabaseSync } from 'node:sqlite'
import type { SettingScope } from '../../../shared/contract/enums/plan.js'
import { asJson, asText, type Row } from '../row.js'

/**
 * 配置仓储（ADR-19 / D-18：**DB 为权威**，支持导入导出，明确不支持远程加载）。
 *
 * 适配器的选择器就存在这里：`scope='platform'` / `scope_ref='<platform_id>'` / `key='selectors'`。
 * 代码里带的是一份默认值，DB 里的覆盖优先 —— 选择器坏了自己在 UI 改，不用等发版（J2）。
 */
export interface SettingRecord {
  key: string
  scope: SettingScope
  scopeRef: string
  value: unknown
  updatedAt: string
}

export interface SettingRepo {
  get<T>(key: string, scope: SettingScope, scopeRef?: string): T | undefined
  set(key: string, scope: SettingScope, scopeRef: string, value: unknown, now: string): void
  remove(key: string, scope: SettingScope, scopeRef: string): void
  listByScope(scope: SettingScope, scopeRef: string): SettingRecord[]
}

export function createSettingRepo(db: DatabaseSync): SettingRepo {
  const selectOne = db.prepare(
    'SELECT key, scope, scope_ref, value_json, updated_at FROM setting WHERE key = ? AND scope = ? AND scope_ref = ?',
  )
  const selectScope = db.prepare(
    'SELECT key, scope, scope_ref, value_json, updated_at FROM setting WHERE scope = ? AND scope_ref = ? ORDER BY key',
  )
  const upsert = db.prepare(
    `INSERT INTO setting (key, scope, scope_ref, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key, scope, scope_ref) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  )
  const del = db.prepare('DELETE FROM setting WHERE key = ? AND scope = ? AND scope_ref = ?')

  const toRecord = (row: Row): SettingRecord => ({
    key: asText(row['key']),
    scope: asText(row['scope']) as SettingScope,
    scopeRef: asText(row['scope_ref']),
    value: asJson<unknown>(row['value_json'], null),
    updatedAt: asText(row['updated_at']),
  })

  return {
    get<T>(key: string, scope: SettingScope, scopeRef = ''): T | undefined {
      const row = selectOne.get(key, scope, scopeRef) as Row | undefined
      if (row === undefined) return undefined
      return asJson<T | undefined>(row['value_json'], undefined)
    },
    set(key, scope, scopeRef, value, now): void {
      upsert.run(key, scope, scopeRef, JSON.stringify(value ?? null), now)
    },
    remove(key, scope, scopeRef): void {
      del.run(key, scope, scopeRef)
    },
    listByScope(scope, scopeRef): SettingRecord[] {
      return (selectScope.all(scope, scopeRef) as Row[]).map(toRecord)
    },
  }
}
