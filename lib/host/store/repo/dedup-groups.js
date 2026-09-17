import { asId, asInt, asJson, asReal, asText } from '../row.js';
function toRecord(row) {
    const primary = row['primary_job_id'];
    return {
        id: asInt(row['id']),
        primaryJobId: primary === null || primary === undefined ? null : asInt(primary),
        memberIds: asJson(row['member_ids_json'], []),
        basis: asText(row['basis']),
        score: asReal(row['score']),
        createdAt: asText(row['created_at']),
    };
}
export function createDedupGroupRepo(db) {
    const insert = db.prepare('INSERT INTO dedup_group (primary_job_id, member_ids_json, basis, score, created_at) VALUES (?, ?, ?, ?, ?)');
    const selectById = db.prepare('SELECT * FROM dedup_group WHERE id = ?');
    const selectCandidates = db.prepare("SELECT * FROM dedup_group WHERE member_ids_json LIKE '%' || ? || '%'");
    const selectAll = db.prepare('SELECT * FROM dedup_group ORDER BY id DESC LIMIT ?');
    const updateMembers = db.prepare('UPDATE dedup_group SET member_ids_json = ? WHERE id = ?');
    const setJobGroup = db.prepare('UPDATE job SET dedup_group_id = ? WHERE id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM dedup_group');
    return {
        create(input, now) {
            const members = [...new Set(input.memberIds)].sort((a, b) => a - b);
            const result = insert.run(input.primaryJobId, JSON.stringify(members), input.basis, input.score, now);
            const groupId = asId(result.lastInsertRowid);
            for (const jobId of members)
                setJobGroup.run(groupId, jobId);
            return groupId;
        },
        addMember(groupId, jobId) {
            const group = selectById.get(groupId);
            if (group === undefined)
                return;
            const record = toRecord(group);
            if (record.memberIds.includes(jobId))
                return;
            const members = [...record.memberIds, jobId].sort((a, b) => a - b);
            updateMembers.run(JSON.stringify(members), groupId);
            setJobGroup.run(groupId, jobId);
        },
        get(id) {
            const row = selectById.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        findByJob(jobId) {
            // 先用 LIKE 收窄，再在 JS 里精确判断 —— 避免 "12" 命中 "123"
            for (const row of selectCandidates.all(String(jobId))) {
                const record = toRecord(row);
                if (record.memberIds.includes(jobId))
                    return record;
            }
            return undefined;
        },
        list(limit) {
            return selectAll.all(limit).map(toRecord);
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=dedup-groups.js.map