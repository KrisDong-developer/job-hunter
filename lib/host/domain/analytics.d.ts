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
import type { AttributionDto, FunnelDto, SalaryBandDto } from '../../shared/dto.js';
import { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL } from '../../shared/enums.js';
import type { ApplicationStage } from '../../shared/enums.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
/** 低于这个样本量就不下结论。 */
export declare const MIN_SAMPLE = 5;
export interface AnalyticsService {
    funnel(): FunnelDto;
    attribution(): AttributionDto;
    salaryBand(options?: {
        city?: string;
        keyword?: string;
    }): SalaryBandDto;
}
export interface AnalyticsDeps {
    store: Store;
    clock?: Clock;
}
export declare function createAnalyticsService(deps: AnalyticsDeps): AnalyticsService;
export { APPLICATION_STAGE_LABEL, CONTACT_STAGE_LABEL };
export type { ApplicationStage };
//# sourceMappingURL=analytics.d.ts.map