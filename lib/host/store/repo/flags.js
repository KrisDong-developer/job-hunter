import { JOB_FLAG_TYPES } from '../../../shared/enums.js';
import { asInt, asJson, asReal, asText } from '../row.js';
export { JOB_FLAG_TYPES };
function toRecord(row) {
    return {
        jobId: asInt(row['job_id']),
        flagType: asText(row['flag_type']),
        score: asReal(row['score']),
        // 依据一律是给人看的字符串；万一库里有非字符串（历史数据/手改），丢弃而不是原样透出
        evidence: asJson(row['evidence_json'], []).filter((item) => typeof item === 'string'),
        computedAt: asText(row['computed_at']),
    };
}
export function createFlagRepo(db) {
    const deleteForJob = db.prepare('DELETE FROM job_flag WHERE job_id = ?');
    const insert = db.prepare('INSERT INTO job_flag (job_id, flag_type, score, evidence_json, computed_at) VALUES (?, ?, ?, ?, ?)');
    const selectByJob = db.prepare('SELECT * FROM job_flag WHERE job_id = ? ORDER BY flag_type');
    const selectByType = db.prepare('SELECT * FROM job_flag WHERE flag_type = ? ORDER BY score DESC, job_id LIMIT ?');
    const countByTypeStmt = db.prepare('SELECT flag_type, count(*) AS n FROM job_flag GROUP BY flag_type');
    const countStmt = db.prepare('SELECT count(*) AS n FROM job_flag');
    return {
        replace(jobId, flags, now) {
            deleteForJob.run(jobId);
            for (const flag of flags) {
                insert.run(jobId, flag.type, flag.score, JSON.stringify(flag.evidence), now);
            }
        },
        listByJob(jobId) {
            return selectByJob.all(jobId).map(toRecord);
        },
        listByType(type, limit) {
            return selectByType.all(type, limit).map(toRecord);
        },
        listTypesForJobs(jobIds) {
            const out = new Map();
            if (jobIds.length === 0)
                return out;
            // 参数个数动态，所以这里现拼一次 SQL；值一律走占位符
            const placeholders = jobIds.map(() => '?').join(',');
            const rows = db
                .prepare(`SELECT job_id, flag_type FROM job_flag WHERE job_id IN (${placeholders})`)
                .all(...jobIds);
            for (const row of rows) {
                const jobId = asInt(row['job_id']);
                const type = asText(row['flag_type']);
                const list = out.get(jobId);
                if (list === undefined)
                    out.set(jobId, [type]);
                else
                    list.push(type);
            }
            return out;
        },
        countByType() {
            const out = {};
            for (const row of countByTypeStmt.all())
                out[asText(row['flag_type'])] = asInt(row['n']);
            return out;
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=flags.js.map