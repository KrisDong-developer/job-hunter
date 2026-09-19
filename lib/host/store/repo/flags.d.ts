import type { DatabaseSync } from 'node:sqlite';
import { JOB_FLAG_TYPES, type JobFlagType } from '../../../shared/contract/enums/job.js';
export { JOB_FLAG_TYPES };
export type { JobFlagType };
/** 一条标注。`evidence` 是**可读依据**的数组 —— 没有依据的结论不允许落库。 */
export interface JobFlagRecord {
    jobId: number;
    flagType: JobFlagType;
    score: number;
    evidence: string[];
    computedAt: string;
}
export interface JobFlagInput {
    type: JobFlagType;
    score: number;
    evidence: string[];
}
export interface FlagRepo {
    /** 重算语义：先清掉该岗位的旧标注再写新的（幂等，重复跑不会累积垃圾）。 */
    replace(jobId: number, flags: readonly JobFlagInput[], now: string): void;
    listByJob(jobId: number): JobFlagRecord[];
    /** 按类型列出标注（带分数与依据），用于 U1 的风险视图。 */
    listByType(type: JobFlagType, limit: number): JobFlagRecord[];
    /**
     * 批量取「岗位 → 命中的标注类型」。
     * 列表页要显示风险徽章，逐条查会变成 N+1，所以这里一次问完。
     */
    listTypesForJobs(jobIds: readonly number[]): Map<number, JobFlagType[]>;
    countByType(): Record<string, number>;
    count(): number;
}
export declare function createFlagRepo(db: DatabaseSync): FlagRepo;
//# sourceMappingURL=flags.d.ts.map