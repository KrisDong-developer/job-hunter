import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/constants.js';
import { JOB_STATES } from '../../../shared/enums.js';
import { asId, asInt, asIntOrNull, asJson, asRealOrNull, asText, asTextOrNull } from '../row.js';
const SELECT_BASE = `
SELECT j.*, c.name AS company_name
FROM job j
LEFT JOIN company c ON c.id = j.company_id`;
/** 排序列白名单 —— 绝不把入参拼进 SQL。 */
const ORDER_COLUMNS = {
    crawled_at: 'j.crawled_at',
    salary_min: 'j.salary_min',
    title: 'j.title',
    last_seen_at: 'j.last_seen_at',
};
function toDto(row) {
    return {
        id: asInt(row['id']),
        platformId: asText(row['platform_id']),
        platformJobId: asText(row['platform_job_id']),
        title: asText(row['title']),
        companyId: asIntOrNull(row['company_id']),
        companyName: asTextOrNull(row['company_name']),
        salaryRaw: asText(row['salary_raw']),
        salaryMin: asIntOrNull(row['salary_min']),
        salaryMax: asIntOrNull(row['salary_max']),
        salaryMonths: asIntOrNull(row['salary_months']),
        city: asText(row['city']),
        district: asText(row['district']),
        expReq: asText(row['exp_req']),
        eduReq: asText(row['edu_req']),
        tags: asJson(row['tags_json'], []),
        sourceUrl: asText(row['source_url']),
        publishedAt: asTextOrNull(row['published_at']),
        firstSeenAt: asText(row['first_seen_at']),
        lastSeenAt: asText(row['last_seen_at']),
        state: asText(row['state'], 'new'),
        matchScore: asRealOrNull(row['match_score']),
        // §4.1：分数是**简历版本的函数**。记下算分时用的是哪一版、哪个 rev，
        // 这样简历一改就能判定"这个分过期了"，而不是继续拿旧分误导决策。
        scoreRev: asInt(row['score_rev'], 0),
        scoreResumeId: asIntOrNull(row['score_resume_id']),
        // 真正的过期判定需要"当前版本"，那是领域层的事（这里先给 false）
        scoreStale: false,
        // 标注类型由领域层批量补齐（一次 IN 查询，避免列表页 N+1）
        flagTypes: [],
    };
}
export function createJobRepo(db) {
    const cache = new Map();
    const prepare = (sql) => {
        const hit = cache.get(sql);
        if (hit !== undefined)
            return hit;
        const statement = db.prepare(sql);
        cache.set(sql, statement);
        return statement;
    };
    const selectIdByKey = db.prepare('SELECT id FROM job WHERE platform_id = ? AND platform_job_id = ?');
    const insert = db.prepare(`INSERT INTO job (
       platform_id, platform_job_id, title, company_id, salary_raw, salary_min, salary_max, salary_months,
       city, district, exp_req, edu_req, tags_json, jd_text, published_at,
       first_seen_at, last_seen_at, crawled_at, source_url, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`);
    // 注意：**不覆盖** state / first_seen_at —— 前者是用户的处置态，后者是“首次见到”的事实。
    const update = db.prepare(`UPDATE job SET
       title = ?, company_id = ?, salary_raw = ?, salary_min = ?, salary_max = ?, salary_months = ?,
       city = ?, district = ?, exp_req = ?, edu_req = ?, tags_json = ?,
       jd_text = coalesce(?, jd_text), published_at = coalesce(?, published_at),
       last_seen_at = ?, crawled_at = ?, source_url = ?
     WHERE id = ?`);
    const selectById = db.prepare(`${SELECT_BASE} WHERE j.id = ?`);
    const markStmt = db.prepare('UPDATE job SET state = ? WHERE id = ?');
    const jdTextStmt = db.prepare('SELECT jd_text FROM job WHERE id = ?');
    const setMatchStmt = db.prepare('UPDATE job SET match_score = ?, match_reasons_json = ?, score_rev = ?, score_resume_id = ? WHERE id = ?');
    const reasonsStmt = db.prepare('SELECT match_reasons_json FROM job WHERE id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM job');
    const countSinceStmt = db.prepare('SELECT count(*) AS n FROM job WHERE first_seen_at >= ?');
    const countByStateStmt = db.prepare('SELECT state, count(*) AS n FROM job GROUP BY state');
    const buildWhere = (filters) => {
        const where = [];
        const params = [];
        if (filters.state !== undefined) {
            where.push('j.state = ?');
            params.push(filters.state);
        }
        if (filters.platformId !== undefined) {
            where.push('j.platform_id = ?');
            params.push(filters.platformId);
        }
        if (filters.city !== undefined && filters.city !== '') {
            where.push('j.city = ?');
            params.push(filters.city);
        }
        if (filters.companyId !== undefined) {
            where.push('j.company_id = ?');
            params.push(filters.companyId);
        }
        if (filters.keyword !== undefined && filters.keyword !== '') {
            where.push('j.title LIKE ?');
            params.push(`%${filters.keyword}%`);
        }
        if (filters.minSalaryAtLeast !== undefined) {
            where.push('j.salary_min >= ?');
            params.push(filters.minSalaryAtLeast);
        }
        return { clause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
    };
    const query = (filters = {}, limit = PAGE_SIZE_DEFAULT, offset = 0) => {
        const { clause, params } = buildWhere(filters);
        const orderColumn = ORDER_COLUMNS[filters.orderBy ?? 'crawled_at'];
        const direction = filters.descending === false ? 'ASC' : 'DESC';
        const safeLimit = Math.max(1, Math.min(Math.trunc(limit), PAGE_SIZE_MAX));
        const safeOffset = Math.max(0, Math.trunc(offset));
        // 强制 LIMIT：禁止无界查询进热路径（§4.1）。NULL 排在最后，避免“面议”占据榜首。
        const sql = `${SELECT_BASE}
      ${clause}
      ORDER BY ${orderColumn} IS NULL, ${orderColumn} ${direction}, j.id DESC
      LIMIT ? OFFSET ?`;
        return prepare(sql).all(...params, safeLimit, safeOffset).map(toDto);
    };
    const countMatching = (filters = {}) => {
        const { clause, params } = buildWhere(filters);
        const row = prepare(`SELECT count(*) AS n FROM job j ${clause}`).get(...params);
        return asInt(row?.['n']);
    };
    return {
        upsert(input, now) {
            const tagsJson = JSON.stringify(input.tags);
            const existing = selectIdByKey.get(input.platformId, input.platformJobId);
            if (existing !== undefined) {
                const id = asInt(existing['id']);
                update.run(input.title, input.companyId, input.salaryRaw, input.salaryMin, input.salaryMax, input.salaryMonths, input.city, input.district, input.expReq, input.eduReq, tagsJson, input.jdText ?? null, input.publishedAt, now, now, input.sourceUrl, id);
                return { id, outcome: 'updated' };
            }
            const result = insert.run(input.platformId, input.platformJobId, input.title, input.companyId, input.salaryRaw, input.salaryMin, input.salaryMax, input.salaryMonths, input.city, input.district, input.expReq, input.eduReq, tagsJson, input.jdText ?? null, input.publishedAt, now, now, now, input.sourceUrl);
            return { id: asId(result.lastInsertRowid), outcome: 'inserted' };
        },
        query,
        detail(id) {
            const row = selectById.get(id);
            return row === undefined ? undefined : toDto(row);
        },
        mark(id, state) {
            if (!JOB_STATES.includes(state))
                return false;
            const result = markStmt.run(state, id);
            return asInt(result.changes) > 0;
        },
        jdText(id) {
            const row = jdTextStmt.get(id);
            return row === undefined ? null : asTextOrNull(row['jd_text']);
        },
        setMatch(id, score, reasons, stamp) {
            setMatchStmt.run(score, JSON.stringify(reasons ?? []), stamp?.rev ?? 0, stamp?.resumeId ?? null, id);
        },
        matchReasons(id) {
            const row = reasonsStmt.get(id);
            if (row === undefined)
                return [];
            const parsed = asJson(row['match_reasons_json'], []);
            return parsed.flatMap((item) => {
                if (item === null || typeof item !== 'object')
                    return [];
                const record = item;
                return [
                    {
                        kind: typeof record['kind'] === 'string' ? record['kind'] : 'unknown',
                        text: typeof record['text'] === 'string' ? record['text'] : '',
                        weight: typeof record['weight'] === 'number' ? record['weight'] : 0,
                    },
                ];
            });
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
        countSince(iso) {
            const row = countSinceStmt.get(iso);
            return asInt(row?.['n']);
        },
        countMatching(filters = {}) {
            return countMatching(filters);
        },
        countByState() {
            const out = {};
            for (const row of countByStateStmt.all()) {
                out[asText(row['state'])] = asInt(row['n']);
            }
            return out;
        },
        latest(limit = PAGE_SIZE_DEFAULT) {
            return query({}, limit, 0);
        },
    };
}
//# sourceMappingURL=jobs.js.map