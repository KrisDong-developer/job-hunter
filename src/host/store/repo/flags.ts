import type { DatabaseSync } from 'node:sqlite'
import { JOB_FLAG_TYPES, type JobFlagType } from '../../../shared/enums.js'
import { asInt, asJson, asReal, asText, type Row } from '../row.js'

export { JOB_FLAG_TYPES }
export type { JobFlagType }

/** 一条标注。`evidence` 是**可读依据**的数组 —— 没有依据的结论不允许落库。 */
export interface JobFlagRecord {
  jobId: number
  flagType: JobFlagType
  score: number
  evidence: string[]
  computedAt: string
}

export interface JobFlagInput {
  type: JobFlagType
  score: number
  evidence: string[]
}

export interface FlagRepo {
  /** 重算语义：先清掉该岗位的旧标注再写新的（幂等，重复跑不会累积垃圾）。 */
  replace(jobId: number, flags: readonly JobFlagInput[], now: string): void
  listByJob(jobId: number): JobFlagRecord[]
  /** 按类型列出标注（带分数与依据），用于 U1 的风险视图。 */
  listByType(type: JobFlagType, limit: number): JobFlagRecord[]
  /**
   * 批量取「岗位 → 命中的标注类型」。
   * 列表页要显示风险徽章，逐条查会变成 N+1，所以这里一次问完。
   */
  listTypesForJobs(jobIds: readonly number[]): Map<number, JobFlagType[]>
  countByType(): Record<string, number>
  count(): number
}

function toRecord(row: Row): JobFlagRecord {
  return {
    jobId: asInt(row['job_id']),
    flagType: asText(row['flag_type']) as JobFlagType,
    score: asReal(row['score']),
    // 依据一律是给人看的字符串；万一库里有非字符串（历史数据/手改），丢弃而不是原样透出
    evidence: asJson<unknown[]>(row['evidence_json'], []).filter(
      (item): item is string => typeof item === 'string',
    ),
    computedAt: asText(row['computed_at']),
  }
}

export function createFlagRepo(db: DatabaseSync): FlagRepo {
  const deleteForJob = db.prepare('DELETE FROM job_flag WHERE job_id = ?')
  const insert = db.prepare(
    'INSERT INTO job_flag (job_id, flag_type, score, evidence_json, computed_at) VALUES (?, ?, ?, ?, ?)',
  )
  const selectByJob = db.prepare('SELECT * FROM job_flag WHERE job_id = ? ORDER BY flag_type')
  const selectByType = db.prepare(
    'SELECT * FROM job_flag WHERE flag_type = ? ORDER BY score DESC, job_id LIMIT ?',
  )
  const countByTypeStmt = db.prepare('SELECT flag_type, count(*) AS n FROM job_flag GROUP BY flag_type')
  const countStmt = db.prepare('SELECT count(*) AS n FROM job_flag')

  return {
    replace(jobId, flags, now): void {
      deleteForJob.run(jobId)
      for (const flag of flags) {
        insert.run(jobId, flag.type, flag.score, JSON.stringify(flag.evidence), now)
      }
    },

    listByJob(jobId): JobFlagRecord[] {
      return (selectByJob.all(jobId) as Row[]).map(toRecord)
    },

    listByType(type, limit): JobFlagRecord[] {
      return (selectByType.all(type, limit) as Row[]).map(toRecord)
    },

    listTypesForJobs(jobIds): Map<number, JobFlagType[]> {
      const out = new Map<number, JobFlagType[]>()
      if (jobIds.length === 0) return out
      // 参数个数动态，所以这里现拼一次 SQL；值一律走占位符
      const placeholders = jobIds.map(() => '?').join(',')
      const rows = db
        .prepare(`SELECT job_id, flag_type FROM job_flag WHERE job_id IN (${placeholders})`)
        .all(...jobIds) as Row[]
      for (const row of rows) {
        const jobId = asInt(row['job_id'])
        const type = asText(row['flag_type']) as JobFlagType
        const list = out.get(jobId)
        if (list === undefined) out.set(jobId, [type])
        else list.push(type)
      }
      return out
    },

    countByType(): Record<string, number> {
      const out: Record<string, number> = {}
      for (const row of countByTypeStmt.all() as Row[]) out[asText(row['flag_type'])] = asInt(row['n'])
      return out
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
