import { normalizeResumeContent } from '../../../shared/resume.js';
import { asId, asInt, asJson, asText, asTextOrNull } from '../row.js';
function toRecord(row) {
    const via = asText(row['via'], 'rule');
    return {
        id: asInt(row['id']),
        resumeId: asInt(row['resume_id']),
        jobId: row['job_id'] === null || row['job_id'] === undefined ? null : asInt(row['job_id']),
        content: normalizeResumeContent(asJson(row['content_json'], {})),
        via: via === 'llm' ? 'llm' : 'rule',
        notes: asJson(row['notes_json'], []),
        adopted: asInt(row['adopted'], 0) !== 0,
        outcome: asTextOrNull(row['outcome']),
        createdAt: asText(row['created_at']),
    };
}
export function createTailoringRepo(db) {
    const insert = db.prepare(`INSERT INTO tailoring (resume_id, job_id, content_json, via, notes_json, adopted, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`);
    const selectOne = db.prepare('SELECT * FROM tailoring WHERE id = ?');
    const selectByResume = db.prepare('SELECT * FROM tailoring WHERE resume_id = ? ORDER BY id DESC LIMIT ?');
    const selectByJob = db.prepare('SELECT * FROM tailoring WHERE job_id = ? ORDER BY id DESC LIMIT ?');
    const selectAll = db.prepare('SELECT * FROM tailoring ORDER BY id DESC LIMIT ?');
    const adoptStmt = db.prepare('UPDATE tailoring SET adopted = ? WHERE id = ?');
    const outcomeStmt = db.prepare('UPDATE tailoring SET outcome = ? WHERE id = ?');
    const deleteByResume = db.prepare('DELETE FROM tailoring WHERE resume_id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM tailoring WHERE resume_id = ?');
    return {
        create(input, now) {
            const result = insert.run(input.resumeId, input.jobId, JSON.stringify(input.content), input.via, JSON.stringify(input.notes ?? []), now);
            const row = selectOne.get(asId(result.lastInsertRowid));
            return toRecord(row);
        },
        get(id) {
            const row = selectOne.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        list({ resumeId, jobId, limit = 50 }) {
            const rows = (resumeId !== undefined
                ? selectByResume.all(resumeId, limit)
                : jobId !== undefined
                    ? selectByJob.all(jobId, limit)
                    : selectAll.all(limit));
            return rows.map(toRecord);
        },
        adopt(id, adopted) {
            if (adoptStmt.run(adopted ? 1 : 0, id).changes === 0)
                return undefined;
            const row = selectOne.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        setOutcome(id, outcome) {
            outcomeStmt.run(outcome, id);
        },
        removeByResume(resumeId) {
            return Number(deleteByResume.run(resumeId).changes);
        },
        countFor(resumeId) {
            const row = countStmt.get(resumeId);
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=tailorings.js.map