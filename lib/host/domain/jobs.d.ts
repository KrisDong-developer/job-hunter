/**
 * jobs 领域服务（§4.3）。
 *
 * 入口层（http / tools）只做协议转换，一切筛选、分页、状态流转都在这里。
 * 返回的一律是标量 JSON DTO（§4.3 P7）。
 *
 * P4 起 `query` / `detail` 会带上**标注类型**与**匹配分**，
 * `detailFull` 还会带出完整依据 —— 界面上任何一个分数与徽章都要能回答「凭什么」。
 */
import type { JobDetailDto, JobDto, JobFacetsDto } from '../../shared/contract/dto/job.js';
import { type JobFlagType, type JobState } from '../../shared/contract/enums/job.js';
import type { JobQuery, JobUpsertInput } from '../store/repo/jobs.js';
import type { Store } from '../store/store.js';
export interface JobServiceOptions {
    /**
     * 当前启用简历的 `{resumeId, rev}`。
     *
     * 由装配点注入而不是让 jobs 去依赖 resume 服务：匹配分与简历确实是耦合的，
     * 但耦合点应该只有一个函数，而不是让两个领域服务互相 import。
     */
    scoreStamp?: () => {
        resumeId: number | null;
        rev: number;
    };
}
export interface JobService {
    query(filters?: JobQuery, limit?: number, offset?: number): JobDto[];
    detail(id: number): JobDto;
    /** 详情 + 标注依据 + 匹配理由 + 公司画像（P4）。 */
    detailFull(id: number): JobDetailDto;
    /** 收藏 / 忽略 / 归档。 */
    mark(id: number, state: JobState): JobDto;
    latest(limit?: number): JobDto[];
    count(): number;
    /** 与 `query` 同一套筛选条件的计数（分页 total）。 */
    countMatching(filters?: JobQuery): number;
    countByState(): Record<string, number>;
    /** 筛选器的取值集：城市 / 经验 / 学历（界面渲染多选 chips 用）。 */
    facets(): JobFacetsDto;
    /** 供采集层写入；重复跑按 `(platform, platformJobId)` 幂等。 */
    upsert(input: JobUpsertInput, now: string): {
        id: number;
        outcome: 'inserted' | 'updated';
    };
}
export declare function createJobService(store: Store, options?: JobServiceOptions): JobService;
/** 标注类型的可读名（UI 与工具共用）。 */
export type { JobFlagType };
//# sourceMappingURL=jobs.d.ts.map