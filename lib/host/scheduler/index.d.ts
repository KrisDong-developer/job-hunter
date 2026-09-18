/**
 * 自排程器（§4.6 / C3：宿主没有 schedule 服务，全部自实现）。
 *
 * 五条不可让步的语义：
 *   1. **错过不猛跑** —— 启动时发现错过一轮，只生成一条「是否补跑」待办，
 *      等用户点。开机瞬间轰一遍积压是最容易被风控盯上的行为（C9）。
 *   2. **定时器必须可取消** —— 卸载/热重载不能留下幽灵定时器（C15）。
 *   3. **与手动触发共用同一把锁** —— 抓取本身走 `mutex`，「到点了」和「点一下」不会并行。
 *   4. **"没跑"必须带原因**（SR-17/26）—— 只报 `armed: true` 等于什么都没说：
 *      未登录的平台也会 `armed`，然后每天安静地什么都不做。
 *   5. **定时任务不发送任何东西**（D-5）—— 这里只做采集的准备与执行，不碰 guard 的高危动作。
 *
 * ## 触发器（D-19）
 *
 *   * **T1 窗口触发**（首选）：偏好时段内随机选点，窗口内最多一次（SR-1）；
 *   * **T2 在场触发**：打开面板时若 stale/cold 只**提示**，不自动跑（SR-2）；
 *   * **T3 人工触发**：立即运行 / 补跑，永远保留（SR-30 的例外）。
 */
import type { CrawlSummaryDto, FreshnessDto, PlanDto, SchedulerStatusDto, SkipReason } from '../../shared/dto.js';
import type { PlanService } from '../domain/plans.js';
import type { EventBus } from '../http/sse.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
import { currentWindowStart, windowKeyOf, windowLengthMin } from './schedule.js';
import type { TimerPort } from './timer-port.js';
export type RunReason = 'schedule' | 'manual' | 'catch-up';
export interface SchedulerRunInput {
    planId: number;
    platformId: string;
    criteria: Record<string, string>;
    reason: RunReason;
}
export interface SchedulerLogger {
    info(message: string): void;
    warn(message: string): void;
}
/**
 * 一个平台当前能不能跑（SR-16：**每平台独立检查**）。
 *
 * 返回 `null` = 可以跑；返回原因 = 跳过并如实说明。
 * 刻意做成"注入一个判定函数"而不是在调度器里直接读 session/adapter：
 * 调度器不该知道"登录态"是怎么存的，它只该知道"现在能不能跑、不能的话为什么"。
 */
export type PlatformGate = (platformId: string, options?: PlatformGateOptions) => SkipReason | null;
export interface PlatformGateOptions {
    /**
     * 越过「风控暂停」这一关（SR-21 的既有例外）。
     *
     * 只有**补跑**会置它：补跑是用户看到"错过了一轮"之后**显式点**的，
     * 属于人工确认的一种形式；而手动「立即采集」不置 —— 否则用户点一下
     * 就又去打风控了，"风控暂停"就成了一句空话。
     */
    ignoreRiskPause?: boolean;
}
export interface SchedulerDeps {
    store: Store;
    plans: PlanService;
    /** 执行一次抓取。生产接 `runtime.crawl`（真浏览器），测试可换成夹具。 */
    run: (input: SchedulerRunInput) => Promise<CrawlSummaryDto>;
    timer: TimerPort;
    events: EventBus;
    /** 是否允许调度（数据层就绪 且 持有租约）。 */
    canSchedule: () => boolean;
    readOnlyReason: () => string | null;
    leaseStatus: () => SchedulerStatusDto['lease'];
    /** 每平台前置条件（登录态 / 健康 / 风控 / 离线闸门 / 配额）。缺省表示没有额外条件。 */
    platformGate?: PlatformGate;
    clock?: Clock;
    logger?: SchedulerLogger;
}
export interface Scheduler {
    start(): void;
    stop(): void;
    status(): SchedulerStatusDto;
    /** 用户显式触发（手动 / 补跑）。未持租约时拒绝执行。**暂停不影响它**（SR-30）。 */
    runPlan(planId: number, reason: Exclude<RunReason, 'schedule'>): Promise<CrawlSummaryDto>;
    /** 检查一次到期计划（定时器触发点；测试也直接用它）。 */
    tick(): Promise<void>;
    /** B3/SR-30：全局一键暂停（**只停定时**）。 */
    setPaused(paused: boolean, reason?: string): void;
    /** SR-21：人工确认恢复风控暂停。人工确认是唯一的恢复路径。 */
    resumeRisk(planId: number): void;
}
/**
 * SR-20：退避曲线。15m → 1h → 4h，之后封顶 4h（同一天不再更密地试）。
 *
 * 输入必须是**某一层自己的**连续失败次数：平台冷却传 `platform.fail_streak`，
 * 方案退避传 `plan.fail_streak`。两者是不同的账，混用会让一层的失败替另一层受罚。
 */
export declare function backoffMsFor(failStreak: number): number;
/** 跳过原因 → 人话（SR-17：界面显示人话，不显示枚举键）。 */
export declare const SKIP_REASON_LABEL: Record<SkipReason, string>;
/** SR-8：新鲜度阈值。随计划频率变：每天跑一次的计划 18 小时就算旧了。 */
export declare function freshThresholdsFor(plan: PlanDto): {
    freshHours: number;
    coldHours: number;
};
/** SR-8：算新鲜度。**从未成功过 = cold**（"没数据"绝不等于"是新鲜的"）。 */
export declare function freshnessOf(plan: PlanDto, now: Date): FreshnessDto;
/** 一个平台这一次的结论。`reason === null` 表示它可以跑（SR-18）。 */
export interface PlatformDecision {
    platformId: string;
    reason: SkipReason | null;
    message: string | null;
}
export declare function createScheduler(deps: SchedulerDeps): Scheduler;
export { currentWindowStart, windowKeyOf, windowLengthMin };
//# sourceMappingURL=index.d.ts.map