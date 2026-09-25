import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '../../../shared/config/limits.js';
import { JOB_STATES } from '../../../shared/contract/enums/job.js';
import { APPLICATION_STAGES, CONTACT_STAGES } from '../../../shared/contract/enums/pipeline.js';
import { asId, asInt, asIntOrNull, asJson, asRealOrNull, asText, asTextOrNull } from '../row.js';
/* 平台名在服务端 JOIN 出来，而不是让界面自己拿 platformId 去查一遍：
   岗位详情的内嵌栏被岗位库 / 流水线 / 消息 / 面试四个屏共用，
   放在客户端就意味着每个屏都要各自拉一次平台列表，还会各自漂。
   这与 `company_name` 的做法保持一致。

   接触态与投递阶段也是**相关子查询**取各自最近一条，而不是 LEFT JOIN：
   一个岗位可能打过多次招呼、投过多次简历，JOIN 会把列表行翻倍。
   两条走 `idx_greeting_job` / `idx_application_job`。 */
const SELECT_BASE = `
SELECT j.*, c.name AS company_name, p.display_name AS platform_name,
  (SELECT g.stage FROM greeting g WHERE g.job_id = j.id ORDER BY g.sent_at DESC LIMIT 1) AS contact_stage,
  (SELECT a.stage FROM application a WHERE a.job_id = j.id ORDER BY a.sent_at DESC LIMIT 1) AS application_stage
FROM job j
LEFT JOIN company c ON c.id = j.company_id
LEFT JOIN platform p ON p.id = j.platform_id`;
/**
 * 排序列白名单 —— 绝不把入参拼进 SQL。
 *
 * 存的是**裸列名**（不带表别名）：同一份映射要服务两个地方 ——
 * 外层 `ORDER BY j.<col>` 与折叠时"组内选代表"的子查询 `g.<col>`（见 `buildWhere`）。
 * 写成 `j.crawled_at` 这种带别名的表达式时，子查询里就得手工替换别名 ——
 * 那种字符串拼来拼去正是"某天改了排序键、折叠代表没跟着改"的温床。
 */
const ORDER_COLUMN_NAMES = {
    crawled_at: 'crawled_at',
    match_score: 'match_score',
    salary_min: 'salary_min',
    title: 'title',
    last_seen_at: 'last_seen_at',
    first_seen_at: 'first_seen_at',
};
/**
 * 状态列的读回：库里是 TEXT，出现未知取值（手工改库、老版本写入）时**当作没有记录**，
 * 而不是把它当成一个合法状态往外传 —— 界面拿它去查文案表会得到 `undefined`。
 */
function asEnumOrNull(value, allowed) {
    const text = asTextOrNull(value);
    if (text === null)
        return null;
    return allowed.includes(text) ? text : null;
}
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
        readAt: asTextOrNull(row['read_at']),
        // 抓取入库时间（列表默认排序用的就是它，界面要把它显示出来）
        crawledAt: asText(row['crawled_at']),
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
        // 行内「打招呼 / 投递」的只读态：发过的不能再点（投递不可逆，重复发撤不回来）
        contactStage: asEnumOrNull(row['contact_stage'], CONTACT_STAGES) ?? 'none',
        applicationStage: asEnumOrNull(row['application_stage'], APPLICATION_STAGES),
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
    /**
     * ⚠️ **不覆盖** state / first_seen_at —— 前者是用户的处置态，后者是"首次见到"的事实。
     *
     * 2026-09-21 修：**空值也不许覆盖已有的好值**。
     *
     * 成因：这是覆盖式更新，`crawl.ts` 把这一轮解析出的字段直接写进来（`?? ''` 兜底）。
     * 于是某轮平台把城市/经验/学历掩码成空、或者薪资变成"面议"（`salary_min = null`），
     * 上一轮拿到的好值就被**静默写掉了** —— 列表看着还在那儿，字段却空了，
     * 而且没有任何一条日志会说这件事。
     *
     * 语义定成"**新值为空 = 这一轮没解析出来，保留旧值**"：
     *   * 文本字段用 `coalesce(nullif(?, ''), 旧值)`；
     *   * 可空数字用 `coalesce(?, 旧值)`（null 表示"这一轮没锚定"）；
     *   * `tags_json` 的"空"是 `[]`（不是空串），所以要 `CASE`；
     *   * `title` / `source_url` 仍然直接覆盖 —— 它们是必填字段（空值早被字段断言拦下），
     *     而且标题本来就会更新。
     *
     * 代价说清楚：平台**真的**把薪资从"2万"改成"面议"时，我们会留着旧数字。
     * 这与项目一贯的取舍一致 —— 宁可留一个旧值（用户看得见、能改），
     * 也不要静默清空（用户看不见，还以为这条岗位没写薪资）。
     */
    const update = db.prepare(`UPDATE job SET
       title = ?,
       company_id = coalesce(?, company_id),
       salary_raw = coalesce(nullif(?, ''), salary_raw),
       salary_min = coalesce(?, salary_min),
       salary_max = coalesce(?, salary_max),
       salary_months = coalesce(?, salary_months),
       city = coalesce(nullif(?, ''), city),
       district = coalesce(nullif(?, ''), district),
       exp_req = coalesce(nullif(?, ''), exp_req),
       edu_req = coalesce(nullif(?, ''), edu_req),
       tags_json = CASE WHEN ? = '[]' THEN tags_json ELSE ? END,
       jd_text = coalesce(?, jd_text), published_at = coalesce(?, published_at),
       last_seen_at = ?, crawled_at = ?, source_url = ?
     WHERE id = ?`);
    const selectById = db.prepare(`${SELECT_BASE} WHERE j.id = ?`);
    const markStmt = db.prepare('UPDATE job SET state = ? WHERE id = ?');
    /**
     * 只刷新"见到"这一列。⚠️ 必须**只**动 `last_seen_at`：
     * `crawled_at` / `first_seen_at` / 各字段都不能碰 —— "我见到它了"与"我把字段写下来了"
     * 是两件事，把它们一起改就等于又回到了恒等式（见 `touch` 的接口说明）。
     */
    const touchStmt = db.prepare('UPDATE job SET last_seen_at = ? WHERE platform_id = ? AND platform_job_id = ?');
    /**
     * 已读：`read_at` 幂等（COALESCE 保住第一次的时间），`state` 只推 `new → seen`。
     * 一条语句写完，避免"读了但状态没推"这种半截状态。
     *
     * ⚠️ `WHERE` 里必须带 `read_at IS NULL OR state = 'new'`：SQLite 的 `changes` 对
     * "匹配到行但值没变"也算 1，光靠 `id = ?` 就分不出"第一次读"和"又读了一遍"。
     * 调用方（域服务）正是靠这个返回值区分"没变化"与"这条根本不存在"（后者要 404）。
     */
    const markReadStmt = db.prepare(`UPDATE job SET read_at = coalesce(read_at, ?), state = CASE WHEN state = 'new' THEN 'seen' ELSE state END
     WHERE id = ? AND (read_at IS NULL OR state = 'new')`);
    const jdTextStmt = db.prepare('SELECT jd_text FROM job WHERE id = ?');
    const setJdTextStmt = db.prepare('UPDATE job SET jd_text = ? WHERE id = ?');
    /* 缺 JD 的岗位（详情补抓的目标池）。按 last_seen_at 倒序：
       本轮新增天然在最前（它们 last_seen 刚刷新），存量缺口随后逐轮补齐；
       已从搜索结果里消失的死岗位 last_seen 冻结、自然沉底，不会一直占名额。
       LIMIT 传 -1 = 不设限（SQLite 语义），对齐"全量补齐"的新口径。 */
    const missingJdIdsStmt = db.prepare(`SELECT id FROM job WHERE platform_id = ? AND (jd_text IS NULL OR jd_text = '')
     ORDER BY last_seen_at DESC LIMIT ?`);
    const setMatchStmt = db.prepare('UPDATE job SET match_score = ?, match_reasons_json = ?, score_rev = ?, score_resume_id = ? WHERE id = ?');
    const reasonsStmt = db.prepare('SELECT match_reasons_json FROM job WHERE id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM job');
    const countSinceStmt = db.prepare('SELECT count(*) AS n FROM job WHERE first_seen_at >= ?');
    const countByStateStmt = db.prepare('SELECT state, count(*) AS n FROM job GROUP BY state');
    /* 分数过期的岗位（第五轮，批次 A2）。两条语句共用同一段 WHERE ——
       与领域层的 `scoreStale` 判定逐字对齐（`score_resume_id` 用 `IS NOT`：
       它是可空的，"两个都是 NULL"必须算相等，`<>` 在这种情况下会漏判成过期）。
       取 id 时按 `id DESC`：与列表默认排序（抓取时间倒序）同向，
       于是"点一次重算"先修的是用户正在看的那一批，而不是库尾的历史数据。 */
    const STALE_SCORE_WHERE = `match_score IS NOT NULL AND (score_rev <> ? OR score_resume_id IS NOT ?)`;
    const staleScoreIdsStmt = db.prepare(`SELECT id FROM job WHERE ${STALE_SCORE_WHERE} ORDER BY id DESC LIMIT ?`);
    const countStaleScoresStmt = db.prepare(`SELECT count(*) AS n FROM job WHERE ${STALE_SCORE_WHERE}`);
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
        if (filters.ids !== undefined && filters.ids.length > 0) {
            where.push(`j.id IN (${filters.ids.map(() => '?').join(',')})`);
            params.push(...filters.ids);
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
        if (filters.minMatchScore !== undefined) {
            // `>=` 天然排除 NULL（未打分）—— 这是有意的，见 `JobQuery.minMatchScore` 的注释。
            where.push('j.match_score >= ?');
            params.push(filters.minMatchScore);
        }
        if (filters.excludeBlacklistedCompanies === true) {
            // 只有被显式要求时才排除已拉黑公司。
            //
            // 写成 NOT EXISTS 子查询而不是 `c.blacklisted = 0`（`c` 是 SELECT_BASE 里的 JOIN 别名），
            // 有两个具体原因：
            //   ① `countMatching` 的 FROM 只有 `job j`，**没有**那个 JOIN —— 引用 `c` 会直接报
            //      "no such column"，而列表与计数必须是同一套条件（这是本项目反复强调的纪律）；
            //   ② `company_id` 为 NULL 的岗位（平台没给公司名）走 LEFT JOIN 得到 NULL，
            //      而 `NULL = 0` 是 NULL（假），那些岗位会被一起误杀 —— 它们根本没有公司可拉黑。
            // NOT EXISTS 同时解决这两点：没有关联公司时子查询为空 → 条件成立 → 放行。
            where.push(`NOT EXISTS (SELECT 1 FROM company x WHERE x.id = j.company_id AND x.blacklisted = 1)`);
        }
        if (filters.firstSeenSince !== undefined && filters.firstSeenSince !== '') {
            where.push('j.first_seen_at >= ?');
            params.push(filters.firstSeenSince);
        }
        if (filters.groupDuplicates === true) {
            // 每组只留**一个代表**，而"谁当代表"必须跟着**当前的排序键**走
            // （第五轮，批次 A3 改的就是这一点）。
            //
            // 上一版固定留"组内最小 id"，理由是稳定；但它的代价是：用户把排序切成
            // "按匹配分"，组里分最高的那条却仍然不显示 —— 排序看起来没生效。
            // 现在子查询用**与外层 ORDER BY 逐字相同**的排序（同一个 IS NULL 前置、
            // 同一个方向、同一个 id 兜底），于是"代表"恰好就是这一组在列表里会排最前的那条。
            //
            // 用相关子查询而不是 `GROUP BY`：`GROUP BY` 之后 `SELECT j.*` 拿到的是
            // SQLite 的"组内任一行"，非确定 —— 折叠出来的代表会随索引变化而变。
            // 没有分组的岗位（`dedup_group_id IS NULL`）各自独立，直接放行。
            const column = `g.${ORDER_COLUMN_NAMES[filters.orderBy ?? 'crawled_at']}`;
            const direction = filters.descending === false ? 'ASC' : 'DESC';
            where.push(`(j.dedup_group_id IS NULL OR j.id = (
           SELECT g.id FROM job g WHERE g.dedup_group_id = j.dedup_group_id
           ORDER BY ${column} IS NULL, ${column} ${direction}, g.id DESC
           LIMIT 1
         ))`);
        }
        return { clause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
    };
    const query = (filters = {}, limit = PAGE_SIZE_DEFAULT, offset = 0) => {
        const { clause, params } = buildWhere(filters);
        const orderColumn = `j.${ORDER_COLUMN_NAMES[filters.orderBy ?? 'crawled_at']}`;
        const direction = filters.descending === false ? 'ASC' : 'DESC';
        const safeLimit = Math.max(1, Math.min(Math.trunc(limit), PAGE_SIZE_MAX));
        const safeOffset = Math.max(0, Math.trunc(offset));
        // 强制 LIMIT：禁止无界查询进热路径（§4.1）。NULL 排在最后，避免“面议”占据榜首
        // （未打分的岗位同理：不该因为"没有分数"而排在有分数的前面）。
        // 这条 ORDER BY 与 `buildWhere` 里选折叠代表的那条是**同一套排序**，改一处必改另一处。
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
                update.run(input.title, input.companyId, input.salaryRaw, input.salaryMin, input.salaryMax, input.salaryMonths, input.city, input.district, input.expReq, input.eduReq, tagsJson, 
                // `tags_json` 的 CASE 要两个占位（一个判空、一个写值），值相同
                tagsJson, input.jdText ?? null, input.publishedAt, now, now, input.sourceUrl, id);
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
        touch(platformId, platformJobId, now) {
            if (platformJobId.trim() === '')
                return false;
            const result = touchStmt.run(now, platformId, platformJobId);
            return Number(result.changes) > 0;
        },
        markRead(id, now) {
            const result = markReadStmt.run(now, id);
            return Number(result.changes) > 0;
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
        setJdText(id, text) {
            const trimmed = text.trim();
            if (trimmed === '')
                return false;
            const result = setJdTextStmt.run(trimmed, id);
            return asInt(result.changes) > 0;
        },
        missingJdIds(platformId, limit) {
            const rows = missingJdIdsStmt.all(platformId, limit ?? -1);
            return rows.map((row) => asInt(row['id']));
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
        listStaleScoreIds(stamp, limit) {
            const safeLimit = Math.max(1, Math.min(Math.trunc(limit), PAGE_SIZE_MAX));
            return staleScoreIdsStmt.all(stamp.rev, stamp.resumeId, safeLimit).map((row) => asInt(row['id']));
        },
        countStaleScores(stamp) {
            const row = countStaleScoresStmt.get(stamp.rev, stamp.resumeId);
            return asInt(row?.['n']);
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