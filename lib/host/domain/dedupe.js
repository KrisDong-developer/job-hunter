import { compareJobs, jobDedupeKey } from '../util/dedupe.js';
/** 从 `JobDto` 取去重需要的字段（缺公司名就返回 undefined，表示不参与判断）。 */
export function dedupCandidateOf(job) {
    if (job.companyName === null || job.companyName.trim() === '')
        return undefined;
    return {
        id: job.id,
        platformId: job.platformId,
        companyName: job.companyName,
        title: job.title,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        city: job.city,
    };
}
/**
 * 判断两个岗位是否应当合并（纯函数，便于离线断言）。
 *
 * 抽出来是因为「不同平台」这一条属于**策略**，而键比较属于**算法**：
 * `compareJobs` 不知道平台的存在，这里补上。
 */
export function shouldMerge(left, right) {
    if (left.id === right.id)
        return { merge: false, basis: '同一个岗位', score: 0, candidate: false };
    if (left.platformId === right.platformId) {
        return {
            merge: false,
            basis: '同平台内不做去重（幂等已由平台内唯一键保证）',
            score: 0,
            candidate: false,
        };
    }
    return compareJobs(jobDedupeKey({
        companyName: left.companyName,
        title: left.title,
        salaryMin: left.salaryMin,
        salaryMax: left.salaryMax,
        city: left.city,
    }), jobDedupeKey({
        companyName: right.companyName,
        title: right.title,
        salaryMin: right.salaryMin,
        salaryMax: right.salaryMax,
        city: right.city,
    }));
}
/**
 * 对一个岗位跑一次去重判定：命中就并入已有分组或新建分组。
 *
 * **不抛错**：去重失败绝不能让它影响刚抓到的数据 —— 岗位已经在库里了，
 * 少一个分组只是"少一点便利"，而抛错会让整轮抓取显示成失败。
 */
export function applyDedup(deps, job, now) {
    const candidates = deps.candidatesFor(job);
    /** 拿不准的那个（相似度最高的一个）——只在**没有**可合并对象时才值得一提。 */
    let doubtful = null;
    for (const candidate of candidates) {
        const verdict = shouldMerge(job, candidate);
        if (!verdict.merge) {
            if (verdict.candidate && (doubtful === null || verdict.score > doubtful.score)) {
                doubtful = { candidate, basis: verdict.basis, score: verdict.score };
            }
            continue;
        }
        const existing = deps.dedupGroup.findByJob(candidate.id);
        if (existing === undefined) {
            const groupId = deps.dedupGroup.create({
                primaryJobId: candidate.id,
                memberIds: [candidate.id, job.id],
                basis: verdict.basis,
                score: verdict.score,
            }, now);
            return { jobId: job.id, groupId, withJobId: candidate.id, basis: verdict.basis, candidate: false };
        }
        deps.dedupGroup.addMember(existing.id, job.id);
        return {
            jobId: job.id,
            groupId: existing.id,
            withJobId: candidate.id,
            basis: verdict.basis,
            candidate: false,
        };
    }
    // 没合并，但有一个"拿不准"的：如实报出来（不合并是对的，但用户得知道有这么一回事）
    if (doubtful !== null) {
        return {
            jobId: job.id,
            groupId: null,
            withJobId: doubtful.candidate.id,
            basis: doubtful.basis,
            candidate: true,
        };
    }
    return {
        jobId: job.id,
        groupId: null,
        withJobId: null,
        basis: '没有找到可合并的跨平台重复岗位',
        candidate: false,
    };
}
//# sourceMappingURL=dedupe.js.map