/**
 * 量级基线告警（批次 5）。
 *
 * ## 它补的是哪一类洞
 *
 * 逐字段健康（`adapter_field_health`）只能发现**整页解析不出某个字段**，
 * 以及已有的 `NO_RECORDS`（整轮 0 条）。这两条都盖不住**另一种更隐蔽的坏法**：
 *
 *   选择器仍然匹配、每个字段都解析得出、`quarantined=0`、`state='ok'` ——
 *   但条目数掉了一个数量级（懒加载回归、翻页静默失效、卡片容器换了一半）。
 *
 * 那种轮次在数据里长得**和正常轮次一模一样**，只是 `found` 从 20 变成 2。
 * 用户看到的是"今天没什么岗位"；逐字段健康全绿；界面显示"采集完成"。
 * 这是**从数据里查不出来**的一类失败，所以必须跟历史比才有意义。
 *
 * ## 为什么是中位数，不是均值
 *
 * 一轮抓到 200 条（比如某天平台放量）会把均值抬得很高，之后几个"正常"的 20 条
 * 都会被判成骤降。中位数对长尾免疫，它回答的是"这个平台**通常**给多少"。
 *
 * ## 三个常数的由来
 *
 *   * `YIELD_MIN_SAMPLES = 5`：少于 5 轮，中位数没有意义（一个异常值就能左右它）；
 *   * `YIELD_MIN_BASELINE = 5`：基线本身就很小的时候，"2 → 0"与"20 → 2"
 *     在比例上没有区别，都是噪音 —— 样本量太小就别下结论；
 *   * `YIELD_DROP_RATIO = 0.3`：掉到不足三成才告警。松是有意的：
 *     这条告警的价值在于**不漏**（漏了用户会以为没岗位），代价是偶尔误报。
 */
import type { Store } from '../store/store.js';
/** 取最近多少轮做基线。30 轮足够稳，也不会被半年前的老数据绑架。 */
export declare const YIELD_HISTORY_LIMIT = 30;
/** 少于这么多轮就不下结论。 */
export declare const YIELD_MIN_SAMPLES = 5;
/** 基线本身小于这个数就不下结论（比例在小编量上没有意义）。 */
export declare const YIELD_MIN_BASELINE = 5;
/** 低于基线的这个比例即告警。 */
export declare const YIELD_DROP_RATIO = 0.3;
export type YieldLevel = 'insufficient' | 'ok' | 'dropped';
export interface YieldBase {
    /** 历史中位数。`null` = 样本不足。 */
    baseline: number | null;
    samples: number;
}
export interface YieldSnapshot extends YieldBase {
    /** 最近一轮的 `found`（没有历史时也是 `null`）。 */
    lastFound: number | null;
    level: YieldLevel;
}
export interface YieldAssessment {
    level: YieldLevel;
    /** 人话原因，直接进待办与界面。`ok` / `insufficient` 时为 null。 */
    reason: string | null;
}
/** 中位数（不改动入参）。空数组返回 `null` —— 没有中位数可言，不假装是 0。 */
export declare function medianOf(values: readonly number[]): number | null;
/** 从若干轮 `found` 算基线。样本不足时 `baseline` 为 `null`（而不是猜一个 0）。 */
export declare function baselineFrom(found: readonly number[]): YieldBase;
/**
 * 判定一轮的量级。
 *
 * **0 条也算掉量**：它带着"平时是 20 条"这个上下文，而那正是用户需要的
 * （`crawl.ts` 的 `NO_RECORDS` 说的是"这轮解析出 0 条"，那是**另一件事** ——
 * 它进的是运行记录，不是告警，两者回答的问题不同，不重复）。
 */
export declare function assessYield(base: YieldBase, current: number): YieldAssessment;
/** 读某平台近期的量级快照（给 `/platforms` 与诊断用，不发请求、不改状态）。 */
export declare function readYieldSnapshot(store: Store, platformId: string): YieldSnapshot;
/**
 * 把一轮的量级落成告警 / 关闭过期的告警。
 *
 * 恢复即关闭 —— 与逐字段健康的恢复规则一致：告警挂着不清，用户很快就会
 * 学会无视它，那比没有告警更糟。
 *
 * @param excludeRunId 本轮自己的 run id。**必须排除**：它刚被 `finish` 写进库，
 *   把"掉量的那一轮"算进基线会自己拉低标准（掉得越多越不告警）。
 */
export declare function applyYieldBaseline(store: Store, platformId: string, current: number, now: string, excludeRunId?: number): YieldSnapshot;
/** 待办正文用的人话（`applyYieldBaseline` 里已经拼好，这里给界面复用同一句）。 */
export declare function yieldReasonOf(snapshot: YieldSnapshot): string | null;
//# sourceMappingURL=yield-baseline.d.ts.map