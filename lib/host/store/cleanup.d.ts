import type { CleanupPlanDto, CleanupResultDto, RetentionPolicy, StorageUsageDto } from '../../shared/dto.js';
import { type Clock } from '../util/time.js';
import type { Store } from './store.js';
export type RetentionDaysKey = Exclude<keyof RetentionPolicy, 'autoCleanEnabled'>;
/**
 * 把任意输入收敛成合法策略。
 *
 * 坏值一律退回默认而不是抛错：这是配置，不是业务输入 ——
 * 界面传错一个字段不该让整块清理功能直接不可用。
 * `0` 是**合法值**（= 永久保留），所以不能把 0 当成"没填"。
 */
export declare function normalizeRetentionPolicy(input: unknown): RetentionPolicy;
export declare function readRetentionPolicy(store: Store): RetentionPolicy;
export declare function writeRetentionPolicy(store: Store, patch: Partial<RetentionPolicy>, now: string): RetentionPolicy;
export declare function storageUsageOf(store: Store, dataDir: string, clock?: Clock): StorageUsageDto;
/** 预览：**只读、无副作用**。同一时刻反复调用结果一致。 */
export declare function cleanupPlanOf(store: Store, clock?: Clock): CleanupPlanDto;
export interface CleanupRunOptions {
    /**
     * 只清这几类（缺省 = 预览里 `willRun` 的全部）。
     *
     * 存在的理由：界面上每一项旁边都有勾选，用户可能只想清"JD 原文"而不动审计。
     */
    only?: readonly string[];
}
/**
 * 执行清理。
 *
 * ⚠️ **调用方必须先持有租约**（只读实例不许写库）—— 这条不在本函数里断言，
 * 因为它需要 lease 对象；路由层统一校验（与 `crawl` / `startLogin` 同一条纪律）。
 */
export declare function runCleanupOf(store: Store, options?: CleanupRunOptions, clock?: Clock): CleanupResultDto;
/**
 * 启动时的**定时清理**（§18.3 P1），默认关闭（见 `RETENTION_AUTO_CLEAN_DEFAULT`）。
 *
 * 为什么放在启动而不是心跳里：VACUUM 可能阻塞几百毫秒到几秒，
 * 而心跳是几十秒一次的轻活（同步硬截止待办）—— 往里塞一个可能几秒的写操作，
 * 迟早会把某次心跳拖出问题。启动时只跑一次，代价可预期。
 */
export declare function maybeAutoClean(store: Store, clock?: Clock): CleanupResultDto | null;
//# sourceMappingURL=cleanup.d.ts.map