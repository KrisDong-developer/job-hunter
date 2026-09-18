import type { DatabaseSync } from 'node:sqlite';
import type { JobDto } from '../../../shared/dto.js';
import { type JobFlagType, type JobState } from '../../../shared/enums.js';
/** 岗位写入/筛选所需的标量字段（活对象已被适配器剥掉，§4.3 P7）。 */
export interface JobUpsertInput {
    platformId: string;
    platformJobId: string;
    title: string;
    companyId: number | null;
    salaryRaw: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryMonths: number | null;
    city: string;
    district: string;
    expReq: string;
    eduReq: string;
    tags: string[];
    sourceUrl: string;
    publishedAt: string | null;
    jdText?: string | null;
}
/**
 * 算分时"用的是哪一版简历"（§4.1）。
 *
 * 单独立一个类型是因为它必须**跟着分数一起写**：只写分数不写版本，
 * 就没法判断旧分数是否过期 —— 而"展示旧分数误导决策"正是 §4.1 点名的那个坑。
 */
export interface MatchStamp {
    resumeId: number | null;
    rev: number;
}
export interface JobQuery {
    state?: JobState;
    platformId?: string;
    /** 多城市：命中任意一个即可（`IN` 查询）。 */
    cities?: string[];
    /** 兼容的单城市旧字段（有 `cities` 时以 `cities` 为准）。 */
    city?: string;
    companyId?: number;
    /** 标题模糊匹配（走 LIKE，仅作粗筛）。 */
    keyword?: string;
    /** 只要月薪下限 ≥ 该值的岗位。 */
    minSalaryAtLeast?: number;
    orderBy?: 'crawled_at' | 'salary_min' | 'title' | 'last_seen_at';
    descending?: boolean;
    /**
     * 屏蔽这些标注类型的岗位：命中任意一个标注的岗位一律不显示（`NOT EXISTS`）。
     * 「一键屏蔽疑似外包/高风险」落在这里 —— 风险标签是已算好的事实，屏蔽是查询层的事。
     */
    excludeFlagTypes?: JobFlagType[];
}
export interface JobRepo {
    /** 幂等写入：按 `(platform_id, platform_job_id)` upsert，重复跑不产生重复数据（§6.1）。 */
    upsert(input: JobUpsertInput, now: string): {
        id: number;
        outcome: 'inserted' | 'updated';
    };
    query(filters?: JobQuery, limit?: number, offset?: number): JobDto[];
    detail(id: number): JobDto | undefined;
    mark(id: number, state: JobState): boolean;
    /** 读 JD 正文（列表页拿不到，P2+ 的详情页才有）。 */
    jdText(id: number): string | null;
    /** 写匹配分与**逐条理由**（§4.5.1：分数必须可解释）。 */
    setMatch(id: number, score: number, reasons: unknown, stamp?: MatchStamp | undefined): void;
    /** 读回匹配理由。 */
    matchReasons(id: number): Array<{
        kind: string;
        text: string;
        weight: number;
    }>;
    count(): number;
    /** 与 `query` 用同一套 WHERE 的计数（分页 total 用）。 */
    countMatching(filters?: JobQuery): number;
    /** 首次见到时间 ≥ 该时刻的岗位数（U0 的「今日新增」）。 */
    countSince(iso: string): number;
    countByState(): Record<string, number>;
    latest(limit?: number): JobDto[];
    /** 出去重后的城市列表（界面多选城市用；空城市不返回）。 */
    listCities(): string[];
}
export declare function createJobRepo(db: DatabaseSync): JobRepo;
//# sourceMappingURL=jobs.d.ts.map