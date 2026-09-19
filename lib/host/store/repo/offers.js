import { annualCashOf, normalizeOfferComp } from '../../../shared/domain/offer-comp.js';
import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull } from '../row.js';
function toOffer(row) {
    return {
        id: asInt(row['id']),
        companyId: asIntOrNull(row['company_id']),
        companyName: asText(row['company_name']),
        jobId: asIntOrNull(row['job_id']),
        applicationId: asIntOrNull(row['application_id']),
        role: asText(row['role']),
        comp: normalizeOfferComp(asJson(row['comp_json'], {})),
        annualCash: asIntOrNull(row['annual_cash']),
        deadline: asTextOrNull(row['deadline']),
        state: asText(row['state'], 'pending'),
        note: asTextOrNull(row['note']),
        createdAt: asText(row['created_at']),
        updatedAt: asText(row['updated_at']),
    };
}
export function createOfferRepo(db) {
    const insert = db.prepare(`INSERT INTO offer
       (company_id, company_name, job_id, application_id, role, comp_json, annual_cash, deadline, state, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const updateRow = db.prepare(`UPDATE offer
        SET company_id = ?, company_name = ?, job_id = ?, application_id = ?, role = ?,
            comp_json = ?, annual_cash = ?, deadline = ?, state = ?, note = ?, updated_at = ?
      WHERE id = ?`);
    const selectById = db.prepare('SELECT * FROM offer WHERE id = ?');
    const selectAll = db.prepare(`SELECT * FROM offer
      ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`);
    const selectByState = db.prepare(`SELECT * FROM offer
      WHERE state = ?
      ORDER BY coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`);
    const selectOpen = db.prepare(`SELECT * FROM offer
      WHERE state = 'pending'
      ORDER BY coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`);
    const selectByCompany = db.prepare(`SELECT * FROM offer
      WHERE company_id = ?
      ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, coalesce(deadline, '9999') ASC, id DESC
      LIMIT ?`);
    const selectByJob = db.prepare('SELECT * FROM offer WHERE job_id = ? ORDER BY id DESC');
    const countOpenStmt = db.prepare("SELECT count(*) AS n FROM offer WHERE state = 'pending'");
    const selectDueBefore = db.prepare(`SELECT * FROM offer
      WHERE state = 'pending' AND deadline IS NOT NULL AND deadline <= ?
      ORDER BY deadline ASC`);
    const deleteRow = db.prepare('DELETE FROM offer WHERE id = ?');
    /** 把输入收敛成"一份完整的行值"，关键是把 `comp` 与 `annual_cash` 的推导绑在一起。 */
    const resolved = (input, current, now) => {
        const comp = input.comp === undefined ? (current?.comp ?? {}) : normalizeOfferComp(input.comp);
        return {
            companyId: input.companyId === undefined ? (current?.companyId ?? null) : input.companyId,
            companyName: input.companyName === undefined ? (current?.companyName ?? '') : input.companyName.trim().slice(0, 120),
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
        };
    };
    return {
        list(filter = {}) {
            const limit = filter.limit ?? 100;
            const rows = (filter.openOnly === true
                ? selectOpen.all(limit)
                : filter.state !== undefined
                    ? selectByState.all(filter.state, limit)
                    : filter.companyId !== undefined
                        ? selectByCompany.all(filter.companyId, limit)
                        : selectAll.all(limit));
            return rows.map(toOffer);
        },
        get(id) {
            const row = selectById.get(id);
            return row === undefined ? undefined : toOffer(row);
        },
        create(input, now) {
            const value = resolved(input, undefined, now);
            const result = insert.run(value.companyId, value.companyName, value.jobId, value.applicationId, value.role, JSON.stringify(value.comp), value.annualCash, value.deadline, value.state, value.note, value.createdAt, value.updatedAt);
            return toOffer(selectById.get(asId(result.lastInsertRowid)));
        },
        update(id, patch, now) {
            const current = this.get(id);
            if (current === undefined)
                return undefined;
            const value = resolved(patch, current, now);
            updateRow.run(value.companyId, value.companyName, value.jobId, value.applicationId, value.role, JSON.stringify(value.comp), value.annualCash, value.deadline, value.state, value.note, value.updatedAt, id);
            return toOffer(selectById.get(id));
        },
        setState(id, state, now) {
            return this.update(id, { state }, now);
        },
        remove(id) {
            return Number(deleteRow.run(id).changes) > 0;
        },
        listByJob(jobId) {
            return selectByJob.all(jobId).map(toOffer);
        },
        countOpen() {
            const row = countOpenStmt.get();
            return asInt(row?.['n']);
        },
        listDueBefore(beforeIso) {
            return selectDueBefore.all(beforeIso).map(toOffer);
        },
    };
}
//# sourceMappingURL=offers.js.map