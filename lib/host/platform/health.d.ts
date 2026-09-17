import type { FieldHealthDto } from '../../shared/dto.js';
import type { CoreField, HealthState } from '../../shared/enums.js';
import type { Store } from '../store/store.js';
import { type FieldPresence } from './validate.js';
export interface FieldMissOutcome {
    field: CoreField;
    consecutiveMiss: number;
    /** 本次是否因为该字段而触发降级。 */
    triggered: boolean;
}
export interface RunHealthOutcome {
    platformId: string;
    degraded: boolean;
    /** 本次**新发生**的降级（用于告警去重与日志）。 */
    newlyDegraded: boolean;
    recovered: boolean;
    reasons: string[];
    fields: FieldMissOutcome[];
}
export interface ApplyFieldPresenceOptions {
    threshold?: number;
    now: string;
}
/** 读某个平台的健康快照（给 /health 与诊断用）。 */
export declare function readAdapterHealth(store: Store, platformId: string): {
    health: HealthState;
    failStreak: number;
    lastOkAt: string | null;
    reason: string | null;
    fields: FieldHealthDto[];
};
/**
 * 把一轮的字段命中情况落库，并在必要时降级 + 告警。
 *
 * 恢复规则：**降级后只要有一轮全部字段都命中**（即解析恢复），就回到 healthy 并关掉待办。
 * 这是「修复并自检通过 → 健康」的落地形态 —— 解析成功本身就是最直接的自检。
 */
export declare function applyFieldPresence(store: Store, platformId: string, presence: readonly FieldPresence[], options: ApplyFieldPresenceOptions): RunHealthOutcome;
/**
 * 运行级失败（异常 / 风控命中 / 登录态失效）。
 * 连续失败达阈值 → `broken`，并产生一条待办。
 */
export declare function recordRunFailure(store: Store, platformId: string, errorCode: string, message: string, options: {
    threshold: number;
    now: string;
}): {
    failStreak: number;
    broken: boolean;
};
/**
 * 运行级成功：清零 fail_streak。
 *
 * 注意**不在这里改健康态** —— 把 degraded/broken 拉回 healthy 的唯一依据是
 * `applyFieldPresence` 判定「解析真的恢复了」。否则「解析恢复」这件事会被
 * 一次普通 run 抢先抹掉，恢复路径与待办关闭就永远不会发生。
 */
export declare function recordRunSuccess(store: Store, platformId: string, now: string): void;
//# sourceMappingURL=health.d.ts.map