import { applyDedup, dedupCandidateOf } from './dedupe.js';
/**
 * 去重依赖：候选 = **同一家公司的其它岗位**（跨平台由 `shouldMerge` 过滤）。
 *
 * 抽成共享工厂是因为它有**两个调用方**（抓取后处理、全库复核）。各写一份的话，
 * 迟早一份按公司取候选、另一份按城市取 —— 而那种差异不会报错，只会少合并。
 */
export function dedupDepsOf(store) {
    return {
        dedupGroup: store.dedupGroup,
        candidatesFor: (self) => {
            if (self.companyId === null)
                return [];
            return store.job
                .query({ companyId: self.companyId })
                .map(dedupCandidateOf)
                .filter((item) => item !== undefined)
                .filter((item) => item.id !== self.id && item.platformId !== self.platformId);
        },
    };
}
/**
 * 跑一遍全库复核。
 *
 * ## 为什么跳过"已经在分组里"的岗位
 *
 * `applyDedup` 的语义是"把这个岗位并进它该在的组"。对一个**已经有组**的岗位再跑一次，
 * 它要么找到同一个组（白跑），要么因为库里出现了新的重复而想把自己挪到别的组 ——
 * 而"挪组"不是这套模型支持的（成员是显式 id 列表，挪动等于悄悄改掉用户看过的分组）。
 * 所以：**已分组的不动**；新岗位会通过"候选有组 → 并进那个组"正确挂上去。
 *
 * ## 为什么分页
 *
 * `DatabaseSync` 是同步 API，一次把全库读进内存会把宿主卡住（§4.1 / R3）。
 *
 * @param limit 一次取多少条（默认 200，与写批次同量级）
 */
export function sweepDedup(store, now, options = {}) {
    const pageSize = Math.max(1, Math.trunc(options.pageSize ?? 200));
    const deps = dedupDepsOf(store);
    const total = store.job.countMatching({});
    const groupsBefore = store.dedupGroup.count();
    const result = {
        scanned: 0,
        skippedGrouped: 0,
        merged: 0,
        newGroups: 0,
        candidates: 0,
        groups: 0,
    };
    for (let offset = 0; offset < total; offset += pageSize) {
        const page = store.job.query({}, pageSize, offset);
        if (page.length === 0)
            break;
        for (const job of page) {
            if (job.dedupGroupId !== null) {
                result.skippedGrouped += 1;
                continue;
            }
            const candidate = dedupCandidateOf(job);
            if (candidate === undefined)
                continue;
            result.scanned += 1;
            const outcome = applyDedup(deps, candidate, now);
            if (outcome.groupId !== null)
                result.merged += 1;
            else if (outcome.candidate)
                result.candidates += 1;
        }
    }
    result.groups = store.dedupGroup.count();
    // 新建了几个组：**数出来**比在循环里猜可靠（`applyDedup` 只会告诉你"进了哪个组"）
    result.newGroups = result.groups - groupsBefore;
    return result;
}
//# sourceMappingURL=dedupe-sweep.js.map