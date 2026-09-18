import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/constants.js';
import { JOB_STATES } from '../../../shared/enums.js';
import { asId, asInt, asIntOrNull, asJson, asRealOrNull, asText, asTextOrNull } from '../row.js';
/* 平台名在服务端 JOIN 出来，而不是让界面自己拿 platformId 去查一遍：
   岗位详情的内嵌栏被岗位库 / 流水线 / 消息 / 面试四个屏共用，
   放在客户端就意味着每个屏都要各自拉一次平台列表，还会各自漂。
   这与 `company_name` 的做法保持一致。 */
const SELECT_BASE = `
SELECT j.*, c.name AS company_name, p.display_name AS platform_name
FROM job j
LEFT JOIN company c ON c.id = j.company_id
LEFT JOIN platform p ON p.id = j.platform_id`;
/** 排序列白名单 —— 绝不把入参拼进 SQL。 */
const ORDER_COLUMNS = {
    crawled_at: 'j.crawled_at',
    salary_min: 'j.salary_min',
    title: 'j.title',
    last_seen_at: 'j.last_seen_at',
    first_seen_at: 'j.first_seen_at',
};
function toDto(row) {
    return {
        id: asInt(row['id']),
        platformId: asText(row['platform_id']),
        // 平台表里可能还没登记这一行（历史数据 / 平台被卸载）→ 留 null，界面退回显示 id
        platformName: asTextOrNull(row['platform_name']),
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
        // 跨平台去重分组（批次 4）：列表据此**按组折叠**，同一条岗位在多个平台各抓一条时只占一行
        dedupGroupId: asIntOrNull(row['dedup_group_id']),
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
        if (filters.cities !== undefined && filters.cities.length > 0) {
            where.push(`j.city IN (${filters.cities.map(() => '?').join(',')})`);
            params.push(...filters.cities);
        }
        if (filters.excludeFlagTypes !== undefined && filters.excludeFlagTypes.length > 0) {
            // 标注存在独立表：屏蔽 = 该岗位**不存在**命中所选标注类型的记录。
            // NOT EXISTS 比 LEFT JOIN + NULL 判断更直白，也不会因重复标注把行翻倍。
            where.push(`NOT EXISTS (SELECT 1 FROM job_flag f WHERE f.job_id = j.id AND f.flag_type IN (${filters.excludeFlagTypes.map(() => '?').join(',')}))`);
            params.push(...filters.excludeFlagTypes);
        }
        if (filters.companyId !== undefined) {
            where.push('j.company_id = ?');
            params.push(filters.companyId);
        }
        if (filters.expReqs !== undefined && filters.expReqs.length > 0) {
            where.push(`j.exp_req IN (${filters.expReqs.map(() => '?').join(',')})`);
            params.push(...filters.expReqs);
        }
        if (filters.eduReqs !== undefined && filters.eduReqs.length > 0) {
            where.push(`j.edu_req IN (${filters.eduReqs.map(() => '?').join(',')})`);
            params.push(...filters.eduReqs);
        }
        if (filters.keyword !== undefined && filters.keyword !== '') {
            where.push('j.title LIKE ?');
            params.push(`%${filters.keyword}%`);
        }
        if (filters.minSalaryAtLeast !== undefined) {
            where.push('j.salary_min >= ?');
            params.push(filters.minSalaryAtLeast);
        }
        if (filters.firstSeenSince !== undefined && filters.firstSeenSince !== '') {
            where.push('j.first_seen_at >= ?');
            params.push(filters.firstSeenSince);
        }
        if (filters.groupDuplicates === true) {
            // 每组只留**最小 id**（`primary_job_id` 未必是最小的，而"最小的那个"是稳定且
            // 与插入顺序一致的；用 primary 会让同一组在不同查询里换代表）。
            // 没有分组的岗位（`dedup_group_id IS NULL`）各自独立，直接放行。
            //
            // 用相关子查询而不是 `GROUP BY`：`GROUP BY` 之后 `SELECT j.*` 拿到的行是
            // SQLite 的"组内任一行"，非确定 —— 折叠出来的代表会随索引变化而变。
            where.push(`(j.dedup_group_id IS NULL OR j.id = (
           SELECT MIN(g.id) FROM job g WHERE g.dedup_group_id = j.dedup_group_id
         ))`);
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
        listCities() {
            // COLLATE NOCASE 去重大小写（深圳/深圳 之类），并按常用城市字面排序看起来才像列表
            const rows = db
                .prepare(`SELECT DISTINCT city FROM job WHERE city <> '' ORDER BY city COLLATE NOCASE`)
                .all();
            return rows.map((row) => asText(row['city']));
        },
        /* 经验/学历与城市同一套做法：取值来自库里的真实数据，不预置一套平台无关的枚举。
           预置枚举会在筛选器里列出**库里根本没有的选项**（点了得到 0 条），
           而各平台的原始写法（"3-5年" / "经验不限"）本来就不统一。 */
        listExpReqs() {
            const rows = db
                .prepare(`SELECT DISTINCT exp_req FROM job WHERE exp_req <> '' ORDER BY exp_req COLLATE NOCASE`)
                .all();
            return rows.map((row) => asText(row['exp_req']));
        },
        listEduReqs() {
            const rows = db
                .prepare(`SELECT DISTINCT edu_req FROM job WHERE edu_req <> '' ORDER BY edu_req COLLATE NOCASE`)
                .all();
            return rows.map((row) => asText(row['edu_req']));
        },
    };
}
//# sourceMappingURL=jobs.js.map