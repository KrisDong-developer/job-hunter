/**
 * 跨平台岗位去重（§4.10.1 / SR-44）。
 *
 * ## 为什么单独一层，而不塞进 `crawl.ts`
 *
 * 抓取那一轮已经很长了（导航 → 风控 → 解析 → 字段断言 → 归一化 → 写库 → 打分）。
 * 去重是**可关的**（SR-44），塞进去会让"关掉去重"变成在抓取主链上插一个 `if`，
 * 而这一层真正的价值在于它的**保守规则**能被单独测：宁可保留两个岗位，
 * 也不要把两个真岗位合成一个 —— 合并之后投递记录会串，而且用户很难发现。
 *
 * ## 保守到什么程度
 *
 * * 只在**不同平台**之间做（同平台的幂等已经由 `UNIQUE(platform_id, platform_job_id)` 保证）；
 * * 公司归一化名、城市、薪资档**必须完全相同**（`compareJobs` 的前三条硬条件）；
 * * 标题相似度只作**确认**（阈值 0.9），不作主要依据；
 * * 判不出来就**不合并**，留给人看。
 */
import type { DedupGroupRepo } from '../store/repo/dedup-groups.js';
import type { JobDto } from '../../shared/dto.js';
import { type JobDedupeVerdict } from '../util/dedupe.js';
export interface DedupCandidate {
    id: number;
    platformId: string;
    /**
     * 公司 id（`null` = 还没归到公司实体上）。
     *
     * 候选是按公司取的（同一家公司的岗位才比），所以它必须在这里 ——
     * 少了它，候选构造器只能回头去查一次库，而那正是"两个调用方各写一份"的开始。
     */
    companyId: number | null;
    companyName: string;
    title: string;
    salaryMin: number | null;
    salaryMax: number | null;
    city: string;
}
export interface DedupOutcome {
    jobId: number;
    /** 与之合并的组 id；没合并时为 null。 */
    groupId: number | null;
    /** 与之合并（或疑似重复）的那个岗位；都没有时为 null。 */
    withJobId: number | null;
    /** 判断依据（人话），无论合没合都给 —— 没合也要能解释"为什么没合"。 */
    basis: string;
    /**
     * **疑似重复但未自动合并**（硬门槛全过、只有标题差一点）。
     *
     * 与 `merge: false` 的区别：后者是"确认不是同一个"，这里是"我拿不准，请你看一眼"。
     * 两者都**不合并**，但只有前者可以安心忽略。
     */
    candidate: boolean;
}
/** 从 `JobDto` 取去重需要的字段（缺公司名就返回 undefined，表示不参与判断）。 */
export declare function dedupCandidateOf(job: JobDto): DedupCandidate | undefined;
/**
 * 判断两个岗位是否应当合并（纯函数，便于离线断言）。
 *
 * 抽出来是因为「不同平台」这一条属于**策略**，而键比较属于**算法**：
 * `compareJobs` 不知道平台的存在，这里补上。
 */
export declare function shouldMerge(left: DedupCandidate, right: DedupCandidate): JobDedupeVerdict;
export interface DedupDeps {
    dedupGroup: DedupGroupRepo;
    /** 找候选：同一家公司的其它岗位（由调用方提供，避免这一层依赖仓储细节）。 */
    candidatesFor(job: DedupCandidate): DedupCandidate[];
}
/**
 * 对一个岗位跑一次去重判定：命中就并入已有分组或新建分组。
 *
 * **不抛错**：去重失败绝不能让它影响刚抓到的数据 —— 岗位已经在库里了，
 * 少一个分组只是"少一点便利"，而抛错会让整轮抓取显示成失败。
 */
export declare function applyDedup(deps: DedupDeps, job: DedupCandidate, now: string): DedupOutcome;
//# sourceMappingURL=dedupe.d.ts.map