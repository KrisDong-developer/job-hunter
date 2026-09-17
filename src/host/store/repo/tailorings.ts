import type { DatabaseSync } from 'node:sqlite'
import type { ResumeContent } from '../../../shared/resume.js'
import { normalizeResumeContent } from '../../../shared/resume.js'
import { asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 简历定制仓储（§11.3 `ResumeTailoring`）。
 *
 * 为什么每次定制都要落库而不是"生成完直接覆盖简历"：
 *   * §3.2 的结论是**不要每岗定制**，所以定制是"建议 + 显式采用"的形态；
 *     覆盖式生成会让用户失去"哪一版投了哪个岗位"的对应关系；
 *   * `adopted` + `outcome` 是 P7 归因（"哪版简历转化好"）的原始数据。
 *
 * `content_json` 同样是不可信输入（模型返回）→ 入库前一律规范化。
 */
export interface TailoringRecord {
  id: number
  resumeId: number
  jobId: number | null
  content: ResumeContent
  via: 'llm' | 'rule'
  notes: string[]
  adopted: boolean
  outcome: string | null
  createdAt: string
}

export interface TailoringInput {
  resumeId: number
  jobId: number | null
  content: ResumeContent
  via: 'llm' | 'rule'
  notes?: string[]
}

export interface TailoringRepo {
  create(input: TailoringInput, now: string): TailoringRecord
  get(id: number): TailoringRecord | undefined
  list(options: { resumeId?: number; jobId?: number; limit?: number }): TailoringRecord[]
  adopt(id: number, adopted: boolean): TailoringRecord | undefined
  setOutcome(id: number, outcome: string | null): void
  removeByResume(resumeId: number): number
  countFor(resumeId: number): number
}

function toRecord(row: Row): TailoringRecord {
  const via = asText(row['via'], 'rule')
  return {
    id: asInt(row['id']),
    resumeId: asInt(row['resume_id']),
    jobId: row['job_id'] === null || row['job_id'] === undefined ? null : asInt(row['job_id']),
    content: normalizeResumeContent(asJson<unknown>(row['content_json'], {})),
    via: via === 'llm' ? 'llm' : 'rule',
    notes: asJson<string[]>(row['notes_json'], []),
    adopted: asInt(row['adopted'], 0) !== 0,
    outcome: asTextOrNull(row['outcome']),
    createdAt: asText(row['created_at']),
  }
}

export function createTailoringRepo(db: DatabaseSync): TailoringRepo {
  const insert = db.prepare(
    `INSERT INTO tailoring (resume_id, job_id, content_json, via, notes_json, adopted, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
  )
  const selectOne = db.prepare('SELECT * FROM tailoring WHERE id = ?')
  const selectByResume = db.prepare('SELECT * FROM tailoring WHERE resume_id = ? ORDER BY id DESC LIMIT ?')
  const selectByJob = db.prepare('SELECT * FROM tailoring WHERE job_id = ? ORDER BY id DESC LIMIT ?')
  const selectAll = db.prepare('SELECT * FROM tailoring ORDER BY id DESC LIMIT ?')
  const adoptStmt = db.prepare('UPDATE tailoring SET adopted = ? WHERE id = ?')
  const outcomeStmt = db.prepare('UPDATE tailoring SET outcome = ? WHERE id = ?')
  const deleteByResume = db.prepare('DELETE FROM tailoring WHERE resume_id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM tailoring WHERE resume_id = ?')

  return {
    create(input, now): TailoringRecord {
      const result = insert.run(
        input.resumeId,
        input.jobId,
        JSON.stringify(input.content),
        input.via,
        JSON.stringify(input.notes ?? []),
        now,
      )
      const row = selectOne.get(asId(result.lastInsertRowid)) as Row
      return toRecord(row)
    },

    get(id): TailoringRecord | undefined {
      const row = selectOne.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    list({ resumeId, jobId, limit = 50 }): TailoringRecord[] {
      const rows = (
        resumeId !== undefined
          ? selectByResume.all(resumeId, limit)
          : jobId !== undefined
            ? selectByJob.all(jobId, limit)
            : selectAll.all(limit)
      ) as Row[]
      return rows.map(toRecord)
    },

    adopt(id, adopted): TailoringRecord | undefined {
      if (adoptStmt.run(adopted ? 1 : 0, id).changes === 0) return undefined
      const row = selectOne.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    setOutcome(id, outcome): void {
      outcomeStmt.run(outcome, id)
    },

    removeByResume(resumeId): number {
      return Number(deleteByResume.run(resumeId).changes)
    },

    countFor(resumeId): number {
      const row = countStmt.get(resumeId) as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
