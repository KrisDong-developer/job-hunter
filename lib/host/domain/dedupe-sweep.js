import { applyDedup, dedupCandidateOf, shouldMerge } from './dedupe.js';
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
 * ## 两趟：先**重判已有分组**，再扫没分组的岗位
 *
 * 第一趟（`reverifyGroups`）：分组是**当时**那批字段判出来的，而字段会变 ——
 * 公司名后来修对了、城市补上了、标题改了。以前这一趟不存在（"已分组的一律不动"），
 * 于是**错合并是单向门**：只能人工一组组拆，而它的可见后果是"某个岗位你永远看不到"
 * （列表按组折叠，只显示代表）。现在改成一个组一个组重判：
 * 组内某个成员如果跟**其它任何一个成员**都不该合并了，就把它拆出去；
 * 拆到不足两条时 `removeMember` 会把整组删掉。
 *
 * 第二趟：没分组的岗位照旧走 `applyDedup`（"并进它该在的组"，含新建组）。
 * **顺序有讲究**：先重判再扫，这样刚被拆出来的岗位能在同一轮里找到它真正该在的组，
 * 而不是等到下一次复核。代价是"挪组"依然不是自动的（成员是显式 id 列表，
 * 悄悄挪动等于改掉用户看过的分组）—— 但"错的先拆掉"已经解决了单向门。
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
    /**
     * 复核**之前**已存在的分组 id。
     *
     * `newGroups` 不能再用"复核后的组数 − 复核前的组数"来算了（第一趟会拆散/删除组，
     * 那个减法会把"拆掉两组、新建一组"算成 −1，数字对不上也没人看得出来）——
     * 改成"复核后有哪些组是新出现的"。
     */
    const groupsBeforeIds = new Set(store.dedupGroup.list(GROUP_SCAN_LIMIT).map((group) => group.id));
    const result = {
        scanned: 0,
        skippedGrouped: 0,
        unmerged: 0,
        dissolved: 0,
        skippedNoCompany: 0,
        merged: 0,
        newGroups: 0,
        candidates: 0,
        groups: 0,
    };
    // 第一趟：重判已有分组（把已经不成立的成员拆出去）
    reverifyGroups(store, result);
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
            if (candidate === undefined) {
                // 公司名读不出来（公司没归并）→ 这一条**根本没查过**。计入，别让它隐形。
                result.skippedNoCompany += 1;
                continue;
            }
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
    result.newGroups = store.dedupGroup
        .list(GROUP_SCAN_LIMIT)
        .filter((group) => !groupsBeforeIds.has(group.id)).length;
    return result;
}
/** 一次最多看多少个分组（分组的量级很小，但别写 `list(Infinity)`）。 */
const GROUP_SCAN_LIMIT = 5000;
/**
 * 第一趟：把**已经不成立**的分组关系拆掉。
 *
 * 判据与合并时**完全同源**（`shouldMerge` → `compareJobs`）：组内某个成员只要还跟
 * 至少一个其它成员该合并，就留着；跟谁都不该合并了，就把它拆出去。
 * `removeMember` 在成员不足两条时会顺手把整组删掉。
 *
 * 两条刻意的保守：
 *   * **判不出来就不动**：岗位没了、或者公司名现在是空的（`dedupCandidateOf` 返回
 *     undefined）都算"没有证据"，不是"判错了" —— 拆掉一个好分组比留着一个错分组更糟；
 *   * 只拆不挪：成员是显式 id 列表，悄悄把它挪进另一个组等于改掉用户看过的分组。
 *     被拆出来的岗位会由第二趟重新扫到，那时它自己会挂到该去的组上。
 */
function reverifyGroups(store, result) {
    for (const group of store.dedupGroup.list(GROUP_SCAN_LIMIT)) {
        const members = group.memberIds
            .map((id) => store.job.detail(id))
            .filter((job) => job !== undefined)
            .map(dedupCandidateOf)
            .filter((item) => item !== undefined);
        /**
         * 只要有一个成员**判不了**（岗位被删了、或者公司名现在是空的），就整组跳过。
         *
         * 为什么不"能判几个算几个"：重判的问句是"这两条还该不该在一起"，
         * 缺一半证据就没法回答。而拿不齐证据却动手拆，会把一个好分组拆散 ——
         * 那比留着一个错分组更糟（错分组至少还能被人工看见）。
         */
        if (members.length < group.memberIds.length || members.length < 2)
            continue;
        /** 组还在不在。`removeMember` 在成员不足两条时会顺手把整组删掉。 */
        let alive = true;
        for (const member of members) {
            const stillMerges = members.some((other) => other.id !== member.id && shouldMerge(member, other).merge);
            if (stillMerges)
                continue;
            // 先计数再动手：整组被删掉时，剩下那些同样不成立的成员也已经"不再成立"了
            result.unmerged += 1;
            if (!alive)
                continue;
            store.dedupGroup.removeMember(group.id, member.id);
            alive = store.dedupGroup.get(group.id) !== undefined;
        }
        if (!alive)
            result.dissolved += 1;
    }
}
//# sourceMappingURL=dedupe-sweep.js.map