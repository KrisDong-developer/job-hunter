import type { DatabaseSync } from 'node:sqlite'
import { asBool, asInt, asReal, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 黑话 / 信号词表（§4.10.3）。
 *
 * **纯规则，不走 LLM**：命中即产出解释与权重。词表存在 DB 里，
 * 用户可以在界面上加自己的词 —— 这比让模型去"理解" JD 里的话术可靠得多，
 * 也便宜得多（P6 可解释优于聪明）。
 */
export type DictionaryKind = 'jargon' | 'outsourcing' | 'fraud' | 'zombie' | 'salary'

export const DICTIONARY_KINDS: readonly DictionaryKind[] = [
  'jargon',
  'outsourcing',
  'fraud',
  'zombie',
  'salary',
]

export interface DictionaryEntry {
  id: number
  kind: DictionaryKind
  scope: string
  term: string
  meaning: string | null
  weight: number
  enabled: boolean
}

export interface DictionarySeedEntry {
  kind: DictionaryKind
  scope?: string
  term: string
  meaning?: string
  weight?: number
}

export interface DictionaryRepo {
  /** 幂等播种内置词表；返回新增条数（已存在的词不动，用户改过的权重不会被覆盖）。 */
  ensureSeed(entries: readonly DictionarySeedEntry[]): number
  list(kind?: DictionaryKind): DictionaryEntry[]
  upsert(input: DictionarySeedEntry & { enabled?: boolean }): void
  setEnabled(id: number, enabled: boolean): void
  count(): number
}

function toEntry(row: Row): DictionaryEntry {
  return {
    id: asInt(row['id']),
    kind: asText(row['kind']) as DictionaryKind,
    scope: asText(row['scope'], 'global'),
    term: asText(row['term']),
    meaning: asTextOrNull(row['meaning']),
    weight: asReal(row['weight'], 1),
    enabled: asBool(row['enabled'], true),
  }
}

export function createDictionaryRepo(db: DatabaseSync): DictionaryRepo {
  const insertIgnore = db.prepare(
    `INSERT INTO dictionary (kind, scope, term, meaning, weight, enabled)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(kind, scope, term) DO NOTHING`,
  )
  const upsertStmt = db.prepare(
    `INSERT INTO dictionary (kind, scope, term, meaning, weight, enabled)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, scope, term) DO UPDATE SET
       meaning = excluded.meaning, weight = excluded.weight, enabled = excluded.enabled`,
  )
  const selectAll = db.prepare('SELECT * FROM dictionary WHERE enabled = 1 ORDER BY kind, term')
  const selectKind = db.prepare('SELECT * FROM dictionary WHERE enabled = 1 AND kind = ? ORDER BY term')
  const setEnabledStmt = db.prepare('UPDATE dictionary SET enabled = ? WHERE id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM dictionary')

  return {
    ensureSeed(entries): number {
      let added = 0
      for (const entry of entries) {
        const result = insertIgnore.run(
          entry.kind,
          entry.scope ?? 'global',
          entry.term,
          entry.meaning ?? null,
          entry.weight ?? 1,
        )
        added += asInt(result.changes) > 0 ? 1 : 0
      }
      return added
    },

    list(kind?): DictionaryEntry[] {
      const rows = kind === undefined ? (selectAll.all() as Row[]) : (selectKind.all(kind) as Row[])
      return rows.map(toEntry)
    },

    upsert(input): void {
      upsertStmt.run(
        input.kind,
        input.scope ?? 'global',
        input.term,
        input.meaning ?? null,
        input.weight ?? 1,
        input.enabled === false ? 0 : 1,
      )
    },

    setEnabled(id, enabled): void {
      setEnabledStmt.run(enabled ? 1 : 0, id)
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
