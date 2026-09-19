import { JOB_STATES } from '../../shared/contract/enums/job.js';
import { DomainError } from '../util/errors.js';
export function createJobService(store, options = {}) {
    /**
     * 当前启用简历的标识。**每次都现算**而不是缓存 —— 缓存一份就可能与数据库不一致，
     * 而"分数是否过期"判断错了，用户看到的就是一个自信的错数字（§4.1）。
     */
    const stampOf = () => options.scoreStamp?.();
    /** 标注类型 + 分数过期判定一起补上。 */
    const decorate = (items) => {
        if (items.length === 0)
            return items;
        const byJob = store.flag.listTypesForJobs(items.map((item) => item.id));
        const stamp = stampOf();
        return items.map((item) => ({
            ...item,
            flagTypes: byJob.get(item.id) ?? [],
            scoreStale: stamp !== undefined &&
                item.matchScore !== null &&
                (item.scoreRev !== stamp.rev || item.scoreResumeId !== stamp.resumeId),
        }));
    };
    const jobWithFlags = (id) => {
        const job = store.job.detail(id);
        if (job === undefined) {
            throw new DomainError('NOT_FOUND', `岗位不存在：${String(id)}`, { detail: { id } });
        }
        return decorate([job])[0] ?? job;
    };
    const companyProfileOf = (companyId) => {
        if (companyId === null)
            return null;
        const company = store.company.get(companyId);
        if (company === undefined)
            return null;
        const profile = store.company.getProfile(companyId);
        return {
            id: company.id,
            name: company.name,
            nameNorm: company.nameNorm,
            industry: company.industry,
            size: company.size,
            nature: company.nature,
            jobCount: profile?.jobCount ?? 0,
            geoSpread: profile?.geoSpread ?? 0,
            stackDiversity: profile?.stackDiversity ?? 0,
            onsiteRatio: profile?.onsiteRatio ?? null,
            nameKeywordHits: profile?.nameKeywordHits ?? 0,
            outsourcingScore: profile?.outsourcingScore ?? null,
            fraudScore: profile?.fraudScore ?? null,
            manualLabel: profile?.manualLabel ?? null,
            blacklisted: company.blacklisted,
        };
    };
    return {
        query(filters, limit, offset) {
            return decorate(store.job.query(filters ?? {}, limit, offset));
        },
        detail: jobWithFlags,
        detailFull(id) {
            const job = jobWithFlags(id);
            const flags = store.flag.listByJob(id).map((record) => ({
                flagType: record.flagType,
                score: record.score,
                evidence: record.evidence,
                computedAt: record.computedAt,
            }));
            const reasons = store.job.matchReasons(id);
            // 存的是 `string | null`，但空串与"没抓到"在界面上是同一件事 —— 统一收敛成 null，
            // 免得界面要同时判 `null` 与 `''` 两种空。
            const rawJd = store.job.jdText(id);
            const jdText = rawJd === null || rawJd.trim() === '' ? null : rawJd;
            return { job, jdText, flags, matchReasons: reasons, company: companyProfileOf(job.companyId) };
        },
        mark(id, state) {
            if (!JOB_STATES.includes(state)) {
                throw new DomainError('INVALID_INPUT', `非法岗位状态：${String(state)}`, {
                    hint: `合法取值：${JOB_STATES.join(' / ')}`,
                });
            }
            const changed = store.job.mark(id, state);
            if (!changed) {
                throw new DomainError('NOT_FOUND', `岗位不存在：${String(id)}`, { detail: { id } });
            }
            return jobWithFlags(id);
        },
        latest(limit) {
            return decorate(store.job.latest(limit));
        },
        count() {
            return store.job.count();
        },
        countMatching(filters) {
            return store.job.countMatching(filters ?? {});
        },
        countByState() {
            return store.job.countByState();
        },
        facets() {
            return {
                cities: store.job.listCities(),
                expReqs: store.job.listExpReqs(),
                eduReqs: store.job.listEduReqs(),
            };
        },
        upsert(input, now) {
            return store.job.upsert(input, now);
        },
    };
}
//# sourceMappingURL=jobs.js.map