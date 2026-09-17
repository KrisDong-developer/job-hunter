import { asBool, asId, asInt, asJson, asRealOrNull, asText, asTextOrNull } from '../row.js';
/** 画像重算时最多回看的岗位数 —— 避免画像计算退化成全表扫描（§4.1）。 */
const PROFILE_SAMPLE_LIMIT = 2000;
function toRecord(row) {
    return {
        id: asInt(row['id']),
        name: asText(row['name']),
        nameNorm: asText(row['name_norm']),
        aliases: asJson(row['aliases_json'], []),
        industry: asTextOrNull(row['industry']),
        size: asTextOrNull(row['size']),
        nature: asTextOrNull(row['nature']),
        blacklisted: asBool(row['blacklisted']),
        note: asTextOrNull(row['note']),
        createdAt: asText(row['created_at']),
    };
}
export function createCompanyRepo(db) {
    const selectByNorm = db.prepare('SELECT * FROM company WHERE name_norm = ?');
    const selectById = db.prepare('SELECT * FROM company WHERE id = ?');
    const selectAliasCandidates = db.prepare("SELECT * FROM company WHERE aliases_json LIKE '%' || ? || '%'");
    const insert = db.prepare(`INSERT INTO company (name, name_norm, aliases_json, industry, size, nature, created_at)
     VALUES (?, ?, '[]', ?, ?, ?, ?)`);
    const updateMeta = db.prepare(`UPDATE company SET
       name = ?,
       industry = coalesce(?, industry),
       size = coalesce(?, size),
       nature = coalesce(?, nature)
     WHERE id = ?`);
    const selectAliases = db.prepare('SELECT aliases_json FROM company WHERE id = ?');
    const updateAliases = db.prepare('UPDATE company SET aliases_json = ? WHERE id = ?');
    const selectProfile = db.prepare('SELECT * FROM company_profile WHERE company_id = ?');
    const upsertProfile = db.prepare(`INSERT INTO company_profile (company_id, job_count, stack_diversity, geo_spread, onsite_ratio, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET
       job_count = excluded.job_count,
       stack_diversity = excluded.stack_diversity,
       geo_spread = excluded.geo_spread,
       onsite_ratio = excluded.onsite_ratio,
       updated_at = excluded.updated_at`);
    const upsertScores = db.prepare(`INSERT INTO company_profile (company_id, name_keyword_hits, outsourcing_score, fraud_score, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(company_id) DO UPDATE SET
       name_keyword_hits = excluded.name_keyword_hits,
       outsourcing_score = excluded.outsourcing_score,
       fraud_score = excluded.fraud_score,
       updated_at = excluded.updated_at`);
    const selectSample = db.prepare('SELECT tags_json, city, jd_text FROM job WHERE company_id = ? ORDER BY id DESC LIMIT ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM company');
    const toProfile = (row) => ({
        companyId: asInt(row['company_id']),
        jobCount: asInt(row['job_count']),
        stackDiversity: asInt(row['stack_diversity']),
        geoSpread: asInt(row['geo_spread']),
        onsiteRatio: asRealOrNull(row['onsite_ratio']),
        nameKeywordHits: asInt(row['name_keyword_hits']),
        outsourcingScore: asRealOrNull(row['outsourcing_score']),
        fraudScore: asRealOrNull(row['fraud_score']),
        manualLabel: asTextOrNull(row['manual_label']),
        updatedAt: asText(row['updated_at']),
    });
    /** 别名精确命中。先用 LIKE 收窄，再在 JS 里精确比对，避免 LIKE 的模糊误配。 */
    const findByAlias = (alias) => {
        if (alias === '')
            return undefined;
        for (const row of selectAliasCandidates.all(alias)) {
            const record = toRecord(row);
            if (record.aliases.includes(alias))
                return record;
        }
        return undefined;
    };
    return {
        ensure(input, now) {
            const existing = selectByNorm.get(input.nameNorm);
            if (existing !== undefined) {
                const id = asInt(existing['id']);
                updateMeta.run(input.name, input.industry ?? null, input.size ?? null, input.nature ?? null, id);
                return { id, created: false };
            }
            // 别名表命中 → 复用已有实体（§4.10.1 第 2 级）
            const byAlias = findByAlias(input.nameNorm);
            if (byAlias !== undefined) {
                updateMeta.run(input.name, input.industry ?? null, input.size ?? null, input.nature ?? null, byAlias.id);
                return { id: byAlias.id, created: false };
            }
            const result = insert.run(input.name, input.nameNorm, input.industry ?? null, input.size ?? null, input.nature ?? null, now);
            return { id: asId(result.lastInsertRowid), created: true };
        },
        get(id) {
            const row = selectById.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        findByNorm(nameNorm) {
            const row = selectByNorm.get(nameNorm);
            return row === undefined ? undefined : toRecord(row);
        },
        findByAlias,
        addAlias(companyId, alias) {
            const row = selectAliases.get(companyId);
            if (row === undefined)
                return;
            const current = asJson(row['aliases_json'], []);
            if (current.includes(alias))
                return;
            updateAliases.run(JSON.stringify([...current, alias]), companyId);
        },
        getProfile(companyId) {
            const row = selectProfile.get(companyId);
            return row === undefined ? undefined : toProfile(row);
        },
        recomputeProfile(companyId, now) {
            const jobs = selectSample.all(companyId, PROFILE_SAMPLE_LIMIT);
            const tags = new Set();
            const cities = new Set();
            let onsite = 0;
            for (const job of jobs) {
                for (const tag of asJson(job['tags_json'], []))
                    tags.add(tag);
                const city = asText(job['city']);
                if (city !== '')
                    cities.add(city);
                // 驻场/现场通常写在 JD 正文或标签里，是外包形态最强的文本信号
                const text = `${asJson(job['tags_json'], []).join(' ')} ${asText(job['jd_text'])}`;
                if (/驻场|现场|甲方/.test(text))
                    onsite += 1;
            }
            const onsiteRatio = jobs.length === 0 ? null : onsite / jobs.length;
            upsertProfile.run(companyId, jobs.length, tags.size, cities.size, onsiteRatio, now);
            const row = selectProfile.get(companyId);
            if (row === undefined) {
                throw new Error(`company_profile 写入后读不回：companyId=${String(companyId)}`);
            }
            return toProfile(row);
        },
        updateScores(companyId, scores, now) {
            upsertScores.run(companyId, scores.nameKeywordHits, scores.outsourcingScore, scores.fraudScore, now);
            const row = selectProfile.get(companyId);
            if (row === undefined) {
                throw new Error(`company_profile 写入后读不回：companyId=${String(companyId)}`);
            }
            return toProfile(row);
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=companies.js.map