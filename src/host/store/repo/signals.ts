import type { DatabaseSync } from 'node:sqlite'
import { asId, asInt, asJson, asReal, asText, type Row } from '../row.js'

/**
 * 公司信号（§7 `company_signal`）。
 *
 * 识别引擎的每一条判断都要在这里留痕：类型 + 依据 + 权重。
 * 它同时承担一个额外职责：**公司合并的可逆凭据** ——
 * `type='name-merge'` 的信号记下「谁并到了谁、依据是什么」，
 * 人工拆开时照着它反向操作即可（§4.10.1 铁律 2：去重必须可逆）。
 */
export interface CompanySignalRecord {
  id: number
  companyId: number
  type: string
  evidence: unknown
  weight: number
  source: string
  createdAt: string
}

export interface CompanySignalInput {
  companyId: number
  type: string
  evidence: unknown
  weight?: number
  source?: string
}

export interface SignalRepo {
  add(input: CompanySignalInput, now: string): number
  /** 幂等写入：同一 (company, type) 已有同源信号时不再追加（重算不会刷屏）。 */
  addOnce(input: CompanySignalInput, now: string): number | null
  listByCompany(companyId: number, limit?: number): CompanySignalRecord[]
  listByType(type: string, limit: number): CompanySignalRecord[]
  /** 按来源清空（重算前先清掉上次的规则信号）。 */
  clearBySource(companyId: number, source: string): number
  countByType(): Record<string, number>
  count(): number
}

function toRecord(row: Row): CompanySignalRecord {
  return {
    id: asInt(row['id']),
    companyId: asInt(row['company_id']),
    type: asText(row['type']),
    evidence: asJson<unknown>(row['evidence_json'], null),
    weight: asReal(row['weight']),
    source: asText(row['source'], 'rule'),
    createdAt: asText(row['created_at']),
  }
}

export function createSignalRepo(db: DatabaseSync): SignalRepo {
  const insert = db.prepare(
    'INSERT INTO company_signal (company_id, type, evidence_json, weight, source, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const findSame = db.prepare(
    'SELECT id FROM company_signal WHERE company_id = ? AND type = ? AND source = ? AND evidence_json = ? LIMIT 1',
  )
  const selectByCompany = db.prepare(
    'SELECT * FROM company_signal WHERE company_id = ? ORDER BY weight DESC, id LIMIT ?',
  )
  const selectByType = db.prepare(
    'SELECT * FROM company_signal WHERE type = ? ORDER BY weight DESC, id LIMIT ?',
  )
  const clearSource = db.prepare('DELETE FROM company_signal WHERE company_id = ? AND source = ?')
  const countTypeStmt = db.prepare('SELECT type, count(*) AS n FROM company_signal GROUP BY type')
  const countStmt = db.prepare('SELECT count(*) AS n FROM company_signal')

  const write = (input: CompanySignalInput, now: string): number => {
    const evidenceJson = JSON.stringify(input.evidence ?? null)
    const result = insert.run(
      input.companyId,
      input.type,
      evidenceJson,
      input.weight ?? 0,
      input.source ?? 'rule',
      now,
    )
    return asId(result.lastInsertRowid)
  }

  return {
    add(input, now): number {
      return write(input, now)
    },

    addOnce(input, now): number | null {
      const existing = findSame.get(
        input.companyId,
        input.type,
        input.source ?? 'rule',
        JSON.stringify(input.evidence ?? null),
      ) as Row | undefined
      if (existing !== undefined) return null
      return write(input, now)
    },

    listByCompany(companyId, limit = 100): CompanySignalRecord[] {
      return (selectByCompany.all(companyId, limit) as Row[]).map(toRecord)
    },

    listByType(type, limit): CompanySignalRecord[] {
      return (selectByType.all(type, limit) as Row[]).map(toRecord)
    },

    clearBySource(companyId, source): number {
      return asInt(clearSource.run(companyId, source).changes)
    },

    countByType(): Record<string, number> {
      const out: Record<string, number> = {}
      for (const row of countTypeStmt.all() as Row[]) out[asText(row['type'])] = asInt(row['n'])
      return out
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
