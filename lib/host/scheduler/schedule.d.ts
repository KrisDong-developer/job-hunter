/**
 * 排程计算 —— **纯函数**，不碰时钟也不碰定时器，方便把边界算清楚。
 *
 * 时间语义：`hour`/`minute` 是**本地时间**。用户说「工作日九点半跑」指的就是他所在时区的九点半。
 */
import type { PlanSchedule } from '../../shared/dto.js';
/** `from` 之后的下一个触发时刻；`jitter` 直接加到结果上。 */
export declare function nextRunAt(schedule: PlanSchedule, from: Date, jitterMs?: number): Date;
/** `now` 之前最近的那个理论触发时刻（可能就在今天）。 */
export declare function previousRunAt(schedule: PlanSchedule, now: Date): Date | null;
export interface MissedRunVerdict {
    missed: boolean;
    /** 被错过的那个理论触发时刻。 */
    expectedAt: Date | null;
}
/**
 * 启动时判断「这一轮是不是被错过了」（C9 / §4.6）。
 *
 * 两条都要成立才算错过：
 *   1. 距上次运行已经超过 `missedGraceMs`；
 *   2. 期间**确实有一个**理论触发点。
 *
 * 第 2 条很关键：新装的方案 `last_run_at` 是空的，如果只按第 1 条判断，
 * 每次开机都会弹一个「要不要补跑」—— 那是骚扰，不是提醒。
 * 从没跑过的方案就等下一个触发点，不补跑。
 */
export declare function missedRun(schedule: PlanSchedule, lastRunAt: string | null, now: Date): MissedRunVerdict;
/** 抖动：把准点整点打散，避免每天同一秒打同一个接口。 */
export declare function jitterFor(schedule: PlanSchedule, random?: () => number): number;
//# sourceMappingURL=schedule.d.ts.map