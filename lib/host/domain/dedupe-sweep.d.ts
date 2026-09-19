/**
 * 全库去重复核（批次 4）。
 *
 * ## 为什么需要"独立触发"
 *
 * 去重以前**只在抓取的后处理里**发生（`crawl.ts` 的 `postProcess.dedup`）。于是有两件事
 * 用户做不到：
 *
 *   * **补做**：刚打开了去重开关（或者刚把某个平台加进方案），库里已有的重复不会被合并
 *     —— 只有"再抓一轮"才会碰到它们，而那一轮本来可能一条新岗位都没有；
 *   * **重判**：去重规则改过（例如 R25 修掉"薪资未锚定不当门槛"之后），
 *     老数据里那些**本该合并却漏了**的仍然散着 —— 没有任何入口能重跑一遍。
 *
 * ## 它和抓取里那一半的关系
 *
 * **同一份判断**：共用 `applyDedup`（`domain/dedupe.ts`）与同一个候选构造器
 * （`dedupDepsOf`）。差别只在**输入集合**：抓取只看这一轮写进去的岗位，
 * 复核看全库。判断逻辑有第二份实现才是最坏的情况 —— 那意味着"抓取时合并、
 * 复核时不合并"这类自相矛盾的行为。
 *
 * ## 保守规则一条都不放松
 *
 * 复核**不改变**任何门槛（跨平台、公司/城市硬相等、薪资只在两边都锚定时才比、
 * 标题相似度 ≥0.9）。它只是把同一把尺子拿到整个库上再量一遍：
 * 宁可不合并 —— 合并之后投递记录会串，而且用户很难发现。
 */
import type { DedupSweepResultDto } from '../../shared/contract/dto/dedup.js';
import type { Store } from '../store/store.js';
import { type DedupDeps } from './dedupe.js';
/**
 * 去重依赖：候选 = **同一家公司的其它岗位**（跨平台由 `shouldMerge` 过滤）。
 *
 * 抽成共享工厂是因为它有**两个调用方**（抓取后处理、全库复核）。各写一份的话，
 * 迟早一份按公司取候选、另一份按城市取 —— 而那种差异不会报错，只会少合并。
 */
export declare function dedupDepsOf(store: Store): DedupDeps;
/**
 * 复核的计数结果。
 *
 * 六个计数字段的权威定义在 `shared/contract/dto/dedup.ts`（响应里还多一份 `items`），
 * 这里只是**去掉界面那一项**的投影 —— 曾经仓库里有两处同名同字段的接口。
 */
export type DedupSweepResult = Omit<DedupSweepResultDto, 'items'>;
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