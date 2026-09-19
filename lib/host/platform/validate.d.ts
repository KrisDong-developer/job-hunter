/**
 * 字段级断言与脏数据隔离（§4.2.4）。
 *
 * 要解决的问题：运行级失败计数只能发现「整页抓不到」，发现不了
 * **页面打开正常、但部分字段解析失败** —— 后者不报错，只是悄悄把脏数据写进库，
 * 污染匹配打分与归因统计，事后极难分辨。
 *
 * 两道闸门：
 *   1. **逐条**：缺任一必需字段 → 该条**不写主表**，进 `pending_repair`；
 *   2. **逐轮**：某个字段整轮 0 命中 → 该字段的连续缺失 +1，达阈值即适配器降级。
 */
import type { CoreField } from '../../shared/contract/enums/crawl.js';
import type { RawJob } from './types.js';
/** 某个核心字段在本轮的命中统计。 */
export interface FieldPresence {
    field: CoreField;
    /** 本轮解析出的记录数。 */
    records: number;
    /** 其中该字段有值的记录数。 */
    present: number;
}
/** 被闸门拦下的一条记录。 */
export interface RejectedRecord {
    raw: RawJob;
    missing: CoreField[];
}
export interface PartitionResult {
    /** 可以写主表的记录。 */
    accepted: RawJob[];
    /** 进 `pending_repair` 的记录。 */
    rejected: RejectedRecord[];
    /** 本轮各核心字段的命中情况。 */
    presence: FieldPresence[];
}
/** 取一条记录上某个核心字段的值。 */
export declare function coreFieldValue(raw: RawJob, field: CoreField): string;
/**
 * 逐条断言 + 逐轮命中统计。
 *
 * `present` 的判定是「非空字符串」——注意 `salary_raw` 为「面议」是**合法值**，
 * 空串才是缺失；这条区分很重要，否则所有面议岗位都会被误判成脏数据。
 */
export declare function partitionByRequiredFields(records: readonly RawJob[], required: readonly CoreField[]): PartitionResult;
/**
 * 本轮某字段是否算「整轮缺失」。
 * 只有**解析出了记录**却一条都没命中时才计缺失 —— 0 条记录是「整页失败」，
 * 由运行级失败计数负责，不该污染字段级计数。
 */
export declare function isFieldMiss(presence: FieldPresence): boolean;
//# sourceMappingURL=validate.d.ts.map