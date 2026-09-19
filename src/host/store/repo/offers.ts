/**
 * Offer 仓储（§4.H / §11.3）。
 *
 * 三条纪律：
 *   1. **`comp_json` 一律过 `normalizeOfferComp`**（与 `resume.content_json` 同一条）——
 *      它是界面手搓的 JSON，也可能是模型给的 JSON，两者都不可信；
 *   2. **`annual_cash` 只在这里算**：`comp_json` 是唯一真相，标量列是它的投影。
 *      两处各算一次必然漂移，而漂移的表现是"对比表说 A 高、排序把 B 排前面"；
 *   3. 外键全 `SET NULL`（见 `schema.ts` v10）：岗位/公司被清理时 offer 行必须留着 ——
 *      它是用户资产，也是谈过什么的唯一记录。
 */
import type { DatabaseSync } from 'node:sqlite'
import type { OfferState } from '../../../shared/contract/enums/offer.js'
import { annualCashOf, normalizeOfferComp, type OfferComp } from '../../../shared/domain/offer-comp.js'
import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull, type Row } from '../row.js'

export interface OfferRecord {
  id: number
  companyId: number | null
  companyName: string
  jobId: number | null
  applicationId: number | null
  role: string
  comp: OfferComp
  annualCash: number | null
  deadline: string | null
  state: OfferState
  note: string | null
  createdAt: string
  updatedAt: string
}

/** 写入输入。缺省键 = 不改（`update` 时）或取默认（`create` 时）。 */
export interface OfferInput {
  companyId?: number | null
  companyName?: string
  jobId?: number | null
  applicationId?: number | null
  role?: string
  /** 待遇明细。**整份替换**，与 `criteria` / `resume.content` 同一个语义。 */
  comp?: unknown
  deadline?: string | null
  state?: OfferState
  note?: string | null
}

export interface OfferRepo {
  list(filter?: { state?: OfferState; companyId?: number; openOnly?: boolean; limit?: number }): OfferRecord[]
  get(id: number): OfferRecord | undefined
  create(input: OfferInput, now: string): OfferRecord
  update(id: number, patch: OfferInput, now: string): OfferRecord | undefined
  setState(id: number, state: OfferState, now: string): OfferRecord | undefined
  remove(id: number): boolean
  /** 某个岗位拿到的 offer（岗位详情要能回答"这个岗位走到哪一步了"）。 */
  listByJob(jobId: number): OfferRecord[]
  /** 还没决定的 offer 数（U0）。 */
  countOpen(): number
  /** 还没决定、且截止时间早于 `beforeIso` 的（含已经过期的）—— 提醒与倒计时的数据面。 */
  listDueBefore(beforeIso: string): OfferRecord[]
}

function toOffer(row: Row): OfferRecord {
  return {
    id: asInt(row['id']),
    companyId: asIntOrNull(row['company_id']),
    companyName: asText(row['company_name']),
    jobId: asIntOrNull(row['job_id']),
    applicationId: asIntOrNull(row['application_id']),
    role: asText(row['role']),
    comp: normalizeOfferComp(asJson<unknown>(row['comp_json'], {})),
    annualCash: asIntOrNull(row['annual_cash']),
    deadline: asTextOrNull(row['deadline']),
    state: asText(row['state'], 'pending') as OfferState,
    note: asTextOrNull(row['note']),
    createdAt: asText(row['created_at']),
    updatedAt: asText(row['updated_at']),
  }
}

export function createOfferRepo(db: DatabaseSync): OfferRepo {
  const insert = db.prepare(
    `INSERT INTO offer
       (company_id, company_name, job_id, application_id, role, comp_json, annual_cash, deadline, state, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const updateRow = db.prepare(
    `UPDATE offer
        SET company_id = ?, company_name = ?, job_id = ?, application_id = ?, role = ?,
            comp_json = ?, annual_cash = ?, deadline = ?, state = ?, note = ?, updated_at = ?
      WHERE id = ?`,
  )
  const selectById = db.prepare('SELECT * FROM offer WHERE id = ?')
  const selectAll = db.prepare(
    `SELECT * FROM offer
      ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`,
  )
  const selectByState = db.prepare(
    `SELECT * FROM offer
      WHERE state = ?
      ORDER BY coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`,
  )
  const selectOpen = db.prepare(
    `SELECT * FROM offer
      WHERE state = 'pending'
      ORDER BY coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`,
  )
  const selectByCompany = db.prepare(
    `SELECT * FROM offer
      WHERE company_id = ?
      ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`,
  )
  const selectByJob = db.prepare('SELECT * FROM offer WHERE job_id = ? ORDER BY id DESC')
  const countOpenStmt = db.prepare("SELECT count(*) AS n FROM offer WHERE state = 'pending'")
  const selectDueBefore = db.prepare(
    `SELECT * FROM offer
      WHERE state = 'pending' AND deadline IS NOT NULL AND deadline <= ?
      ORDER BY deadline ASC`,
  )
  const deleteRow = db.prepare('DELETE FROM offer WHERE id = ?')

  /** 把输入收敛成"一份完整的行值"，关键是把 `comp` 与 `annual_cash` 的推导绑在一起。 */
  const resolved = (
    input: OfferInput,
    current: OfferRecord | undefined,
    now: string,
  ): {
    companyId: number | null
    companyName: string
    jobId: number | null
    applicationId: number | null
    role: string
    comp: OfferComp
    annualCash: number | null
    deadline: string | null
    state: OfferState
    note: string | null
    createdAt: string
    updatedAt: string
  } => {
    const comp = input.comp === undefined ? (current?.comp ?? {}) : normalizeOfferComp(input.comp)
    return {
      companyId: input.companyId === undefined ? (current?.companyId ?? null) : input.companyId,
      companyName:
        input.companyName === undefined ? (current?.companyName ?? '') : input.companyName.trim().slice(0, 120),
      jobId: input.jobId === undefined ? (current?.jobId ?? null) : input.jobId,
      applicationId: input.applicationId === undefined ? (current?.applicationId ?? null) : input.applicationId,
      role: input.role === undefined ? (current?.role ?? '') : input.role.trim().slice(0, 120),
      comp,
      // 派生列永远跟着 comp 走：用户没给 annualCash 时按 base×月数+年终奖+补贴 推导，
      // 给了就以他给的为准（那是他谈下来的实际情况）
      annualCash: annualCashOf(comp),
      deadline: input.deadline === undefined ? (current?.deadline ?? null) : input.deadline,
      state: input.state ?? current?.state ?? 'pending',
      note: input.note === undefined ? (current?.note ?? null) : input.note,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    }
  }

  return {
    list(filter = {}): OfferRecord[] {
      const limit = filter.limit ?? 100
      const rows = (
        filter.openOnly === true
          ? selectOpen.all(limit)
          : filter.state !== undefined
            ? selectByState.all(filter.state, limit)
            : filter.companyId !== undefined
              ? selectByCompany.all(filter.companyId, limit)
              : selectAll.all(limit)
      ) as Row[]
      return rows.map(toOffer)
    },

    get(id): OfferRecord | undefined {
      const row = selectById.get(id) as Row | undefined
      return row === undefined ? undefined : toOffer(row)
    },

    create(input, now): OfferRecord {
      const value = resolved(input, undefined, now)
      const result = insert.run(
        value.companyId,
        value.companyName,
        value.jobId,
        value.applicationId,
        value.role,
        JSON.stringify(value.comp),
        value.annualCash,
        value.deadline,
        value.state,
        value.note,
        value.createdAt,
        value.updatedAt,
      )
      return toOffer(selectById.get(asId(result.lastInsertRowid)) as Row)
    },

    update(id, patch, now): OfferRecord | undefined {
      const current = this.get(id)
      if (current === undefined) return undefined
      const value = resolved(patch, current, now)
      updateRow.run(
        value.companyId,
        value.companyName,
        value.jobId,
        value.applicationId,
        value.role,
        JSON.stringify(value.comp),
        value.annualCash,
        value.deadline,
        value.state,
        value.note,
        value.updatedAt,
        id,
      )
      return toOffer(selectById.get(id) as Row)
    },

    setState(id, state, now): OfferRecord | undefined {
      return this.update(id, { state }, now)
    },

    remove(id): boolean {
      return Number(deleteRow.run(id).changes) > 0
    },

    listByJob(jobId): OfferRecord[] {
      return (selectByJob.all(jobId) as Row[]).map(toOffer)
    },

    countOpen(): number {
      const row = countOpenStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },

    listDueBefore(beforeIso): OfferRecord[] {
      return (selectDueBefore.all(beforeIso) as Row[]).map(toOffer)
    },
  }
}
