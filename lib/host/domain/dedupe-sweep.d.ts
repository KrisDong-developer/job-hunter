import type { Store } from '../store/store.js';
import { type DedupDeps } from './dedupe.js';
/**
 * 去重依赖：候选 = **同一家公司的其它岗位**（跨平台由 `shouldMerge` 过滤）。
 *
 * 抽成共享工厂是因为它有**两个调用方**（抓取后处理、全库复核）。各写一份的话，
 * 迟早一份按公司取候选、另一份按城市取 —— 而那种差异不会报错，只会少合并。
 */
export declare function dedupDepsOf(store: Store): DedupDeps;
export interface DedupSweepResult {
    /** 真的送去判定的岗位数（跳过已分组、没公司名的）。 */
    scanned: number;
    /** 已经**在某个分组里**、这一轮没再判的岗位数。 */
    skippedGrouped: number;
    /** 这一轮**进入分组**的岗位数（新建组时两条都算 —— 它们确实都被合并了）。 */
    merged: number;
    /** 新建的分组数。 */
    newGroups: number;
    /** 疑似重复但**未自动合并**的数量（要人工看一眼）。 */
    candidates: number;
    /** 复核之后库里一共有多少个分组。 */
    groups: number;
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
export declare function sweepDedup(store: Store, now: string, options?: {
    pageSize?: number;
}): DedupSweepResult;
//# sourceMappingURL=dedupe-sweep.d.ts.map