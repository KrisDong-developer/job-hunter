import type { CrawlSummaryDto } from '../../shared/contract/dto/crawl.js';
import type { FreshnessDto } from '../../shared/contract/dto/job.js';
import type { PlanDto, SchedulerStatusDto } from '../../shared/contract/dto/plan.js';
import type { SkipReason } from '../../shared/contract/enums/plan.js';
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
    /**
     * SR-46：这一轮的**绝对**到点时刻（ISO）。
     *
     * 由调度器给（本轮开始时刻 + `ROUND_BUDGET_MS`），抓取侧据此在页与页之间收手。
     * 传**绝对时刻**而不是"还剩几分钟"：抓取中途可能耗掉任意长的时间，
     * 只有绝对时刻才保证"同一轮里每个平台看到的是同一个终点"。
     */
    deadlineAt?: string;
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
    /**
     * 方案配的城市（SR-16 的城市档）：调度器把**本方案**的 city 传进来，
     * 门据此判"这个平台认不认识它"。不传或空串 = 方案没配城市，不判。
     */
    city?: string;
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
    /**
     * 单轮预算（毫秒）。缺省用 `ROUND_BUDGET_MS`（20 分钟）。
     * 注入的是**读取函数**而不是数值：设置在 store 里、随时可改，
     * 每次开轮读一次 → 改完立刻生效，不用重启插件（与浏览器空闲设置同一模式）。
     */
    roundBudgetMs?: () => number;
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
/**
 * 单轮预算（SR-46）：一个方案的一次运行最多占用多久。
 *
 * 为什么需要它：多平台之后"一轮"会依次跑 N 个平台，而**平台总数是用户配的**。
 * 没有预算时，一轮的时长无上界 —— 一个卡住的页面就能把整轮（以及紧随其后的
 * 其它方案）拖住，`running` 一直为真，界面上永远显示"正在采集"。
 *
 * 两处收手（**不是同一件事，别合并**）：
 *   * 平台之间（下层机制）→ 还没开始的平台直接不开始，如实报 `round_budget`；
 *   * 平台之内（本模块只管把 `deadlineAt` 传下去）→ 抓取侧在页与页之间停，
 *     已解析到的记录照常入库。
 */
export interface RoundBudget {
    startedAtMs: number;
    deadlineAtMs: number;
}
/** 开一轮预算。`budgetMs` 只给测试与将来做可配时用 —— 缺省就是那个常量。 */
export declare function startRoundBudget(startedAtMs: number, budgetMs?: number): RoundBudget;
/** 到点了吗。**只在平台之间问** —— 平台内部由抓取侧自己问同一个终点。 */
export declare function budgetExhausted(budget: RoundBudget, nowMs: number): boolean;
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