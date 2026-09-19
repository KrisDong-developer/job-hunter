/**
 * 看板与归因（§4.3 `analytics` / §13 U8 / E7）。
 *
 * ## 一条贯穿始终的原则：**样本量小的时候不要给百分比**
 *
 * 投了 3 个岗位，"内推渠道回复率 100%" 和 "平台渠道回复率 0%" 都是噪声。
 * 这种数字看起来很有说服力，会让用户据此做错决策 —— 比不给数字更糟。
 * 所以每个结果都带 `sampleSize`，低于阈值时用 `note` 明确说"样本太少，别当真"。
 *
 * ## 归因看的是**投递**而不是岗位
 *
 * "哪版简历/哪个渠道转化好"必须以**每一次投递**为单位：
 * 同一个岗位可能投了两次、用了不同简历；按岗位聚合会把它们糊在一起。
 */
import type { AnalyticsFilter, AttributionDto, FunnelDto, ResumeCompareDto, SalaryBandDto, SalaryBaselineDto, SalaryBasis, SalaryBoxChartDto, SalaryBoxDto } from '../../shared/dto.js';
import { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL } from '../../shared/enums.js';
import type { ApplicationStage } from '../../shared/enums.js';
import type { Store } from '../store/store.js';
/** 低于这个样本量就不下结论。 */
export declare const MIN_SAMPLE = 5;
export interface AnalyticsService {
    /**
     * 漏斗。`filter` 里的时间窗对两个总体都成立；
     * **`resumeId` / `direction` 只作用于投递段** —— 打招呼那几张表没有 `resume_id` 这一列，
     * 对接触段套用它们会把数字静默清零（详见 `AnalyticsFilter` 的注释）。
     */
    funnel(filter?: AnalyticsFilter): FunnelDto;
    attribution(filter?: AnalyticsFilter): AttributionDto;
    salaryBand(options?: {
        city?: string;
        keyword?: string;
        from?: string;
        to?: string;
    }): SalaryBandDto;
    /** F1：薪资箱线图（P25–P75 高亮）+ 口径切换。 */
    salaryBox(options?: {
        city?: string;
        keyword?: string;
        basis?: SalaryBasis;
    }): SalaryBoxChartDto;
    /** F2：本地基准对比 —— 用**自己抓到的岗位库**当基准，不联网、不编行业数据。 */
    salaryBaseline(filter?: AnalyticsFilter): SalaryBaselineDto;
    /** F3：简历版本 A/B 对比（每格带样本量，不做显著性）。 */
    resumeCompare(filter?: AnalyticsFilter): ResumeCompareDto;
}
export interface AnalyticsDeps {
    store: Store;
}
export declare function createAnalyticsService(deps: AnalyticsDeps): AnalyticsService;
/** F1：一个口径下的箱体（含"箱里装了多少条"）。 */
export declare function salaryBoxOf(jobs: ReadonlyArray<{
    salaryMin: number | null;
    salaryMax: number | null;
    salaryMonths: number | null;
}>, basis: SalaryBasis): SalaryBoxDto;
export { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL };
export type { ApplicationStage };
//# sourceMappingURL=analytics.d.ts.map