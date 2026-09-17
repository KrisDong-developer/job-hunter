/**
 * 自排程器（§4.6 / C3：宿主没有 schedule 服务，全部自实现）。
 *
 * 三条不可让步的语义：
 *   1. **错过不猛跑** —— 启动时发现错过一轮，只生成一条「是否补跑」待办，
 *      等用户点。开机瞬间轰一遍积压是最容易被风控盯上的行为（C9）。
 *   2. **定时器必须可取消** —— 卸载/热重载不能留下幽灵定时器（C15）。
 *   3. **与手动触发共用同一把锁** —— 抓取本身走 `mutex`，「到点了」和「点一下」不会并行。
 */
import type { CrawlSummaryDto, SchedulerStatusDto } from '../../shared/dto.js';
import type { PlanService } from '../domain/plans.js';
import type { EventBus } from '../http/sse.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
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
    clock?: Clock;
    random?: () => number;
    logger?: SchedulerLogger;
}
export interface Scheduler {
    start(): void;
    stop(): void;
    status(): SchedulerStatusDto;
    /** 用户显式触发（手动 / 补跑）。未持租约时拒绝执行。 */
    runPlan(planId: number, reason: Exclude<RunReason, 'schedule'>): Promise<CrawlSummaryDto>;
    /** 检查一次到期计划（定时器触发点；测试也直接用它）。 */
    tick(): Promise<void>;
}
export declare function createScheduler(deps: SchedulerDeps): Scheduler;
//# sourceMappingURL=index.d.ts.map