import type { DatabaseSync } from 'node:sqlite'
import { asId, asInt, asJson, asReal, asText, type Row } from '../row.js'

/**
 * 跨平台去重分组（§7 `dedup_group` / §4.10.1）。
 *
 * 铁律：
 *   1. **不确定时宁可不合并** —— 把两家公司/两个岗位混在一起，投递记录与状态机会全乱，
 *      而且用户很难发现；
 *   2. **去重必须可逆** —— 成员是显式 id 列表，人工能拆开；
 *   3. **每次合并记录依据** —— `basis` 存的是可读的判断链，不是分数。
 */
export interface DedupGroupRecord {
  id: number
  primaryJobId: number | null
  memberIds: number[]
  basis: string
  score: number
  createdAt: string
}

export interface DedupGroupRepo {
  create(input: { primaryJobId: number; memberIds: number[]; basis: string; score: number }, now: string): number
  /** 把一个岗位加进已有分组（会同步更新该岗位的 `dedup_group_id`）。 */
  addMember(groupId: number, jobId: number): void
  get(id: number): DedupGroupRecord | undefined
  /** 查某个岗位所在的分组。 */
  findByJob(jobId: number): DedupGroupRecord | undefined
  list(limit: number): DedupGroupRecord[]
  count(): number
  /**
   * 把一个岗位从分组里拆出去（§4.10.1 铁律 2：去重必须可逆）。
   *
   * 拆完后若组里只剩一个成员，整个分组失去意义 —— 会被删除并清掉剩余成员的关联。
   */
  removeMember(groupId: number, jobId: number): void
  /** 删除整组，并清掉所有成员的分组关联（让它们各自独立）。 */
  deleteGroup(groupId: number): void
}

function toRecord(row: Row): DedupGroupRecord {
  const primary = row['primary_job_id']
  return {
    id: asInt(row['id']),
    primaryJobId: primary === null || primary === undefined ? null : asInt(primary),
    memberIds: asJson<number[]>(row['member_ids_json'], []),
    basis: asText(row['basis']),
    score: asReal(row['score']),
    createdAt: asText(row['created_at']),
  }
}

export function createDedupGroupRepo(db: DatabaseSync): DedupGroupRepo {
  const insert = db.prepare(
    'INSERT INTO dedup_group (primary_job_id, member_ids_json, basis, score, created_at) VALUES (?, ?, ?, ?, ?)',
  )
  const selectById = db.prepare('SELECT * FROM dedup_group WHERE id = ?')
  const selectCandidates = db.prepare("SELECT * FROM dedup_group WHERE member_ids_json LIKE '%' || ? || '%'")
  const selectAll = db.prepare('SELECT * FROM dedup_group ORDER BY id DESC LIMIT ?')
  const updateMembers = db.prepare('UPDATE dedup_group SET member_ids_json = ? WHERE id = ?')
  const setJobGroup = db.prepare('UPDATE job SET dedup_group_id = ? WHERE id = ?')
  const setJobGroupNull = db.prepare('UPDATE job SET dedup_group_id = NULL WHERE id = ?')
  const deleteById = db.prepare('DELETE FROM dedup_group WHERE id = ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM dedup_group')

  return {
    create(input, now): number {
      const members = [...new Set(input.memberIds)].sort((a, b) => a - b)
      const result = insert.run(input.primaryJobId, JSON.stringify(members), input.basis, input.score, now)
      const groupId = asId(result.lastInsertRowid)
      for (const jobId of members) setJobGroup.run(groupId, jobId)
      return groupId
    },

    addMember(groupId, jobId): void {
      const group = selectById.get(groupId) as Row | undefined
      if (group === undefined) return
      const record = toRecord(group)
      if (record.memberIds.includes(jobId)) return
      const members = [...record.memberIds, jobId].sort((a, b) => a - b)
      updateMembers.run(JSON.stringify(members), groupId)
      setJobGroup.run(groupId, jobId)
    },

    get(id): DedupGroupRecord | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    findByJob(jobId): DedupGroupRecord | undefined {
      // 先用 LIKE 收窄，再在 JS 里精确判断 —— 避免 "12" 命中 "123"
      for (const row of selectCandidates.all(String(jobId)) as Row[]) {
        const record = toRecord(row)
        if (record.memberIds.includes(jobId)) return record
      }
      return undefined
    },

    list(limit): DedupGroupRecord[] {
      return (selectAll.all(limit) as Row[]).map(toRecord)
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },

    removeMember(groupId, jobId): void {
      const group = selectById.get(groupId) as Row | undefined
      if (group === undefined) return
      const record = toRecord(group)
      if (!record.memberIds.includes(jobId)) return
      const members = record.memberIds.filter((id) => id !== jobId)
      // 被拆出的岗位先脱离分组
      setJobGroupNull.run(jobId)
      if (members.length <= 1) {
        // 只剩一个成员的组没有合并意义：整组删除并清掉剩余成员的关联
        for (const id of members) setJobGroupNull.run(id)
        deleteById.run(groupId)
        return
      }
      updateMembers.run(JSON.stringify(members), groupId)
    },

    deleteGroup(groupId): void {
      const group = selectById.get(groupId) as Row | undefined
      if (group === undefined) return
      for (const id of toRecord(group).memberIds) setJobGroupNull.run(id)
      deleteById.run(groupId)
    },
  }
}
