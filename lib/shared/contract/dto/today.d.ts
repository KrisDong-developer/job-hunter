import type { AdapterHealthDto, CrawlRunDto } from './crawl.js';
import type { OfferDeadlineDto } from './offer.js';
/**
 * today 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
/** 一条待办。 */
export interface TodoDto {
    id: number;
    kind: string;
    level: string;
    title: string;
    ref: string | null;
    detail: unknown;
    createdAt: string;
}
/**
 * U0 今日（`GET /today`）—— 首屏要回答「今天干什么」。
 *
 * 只放**现在真有数据**的东西。待跟进 / 面试 / 额度要等 P7 与 guard（P5），
 * 这里不放假字段 —— 界面上显示一个恒为 0 的「待跟进」比不显示更糟。
 */
export interface TodayDto {
    generatedAt: string;
    dataReady: boolean;
    dataError: string | null;
    /** 岗位总数与按处置态分布。 */
    jobCount: number;
    byState: Record<string, number>;
    /** 最近 24 小时首次见到的岗位数。 */
    newJobs24h: number;
    /** 未关闭的待办（**只带最严重的前若干条**，见 `buildToday` 的 `todoLimit`）。 */
    todos: TodoDto[];
    /**
     * 未关闭待办的总数。
     *
     * 与 `todos.length` 分开：列表是有上限的，而首屏那个数字回答的是
     * "我还有几件事没处理"—— 拿列表长度当总数会在超过上限时少报（20 条上限下报 20）。
     */
    openTodoCount: number;
    /** 被字段断言拦下、等着重放的记录数。 */
    pendingRepair: number;
    /**
     * 还没决定的 offer 数（H1/H3）。
     *
     * 为什么要进首屏：offer 截止日期与"再等等别家"的博弈是真实的决策压力（§3.8），
     * 而它**有时间窗**——错过就等于自动放弃。
     */
    offerOpenCount: number;
    /** 临近截止的 offer（按截止时间升序，只含还没决定的）。 */
    offersDueSoon: OfferDeadlineDto[];
    adapters: AdapterHealthDto[];
    lastCrawl: CrawlRunDto | null;
    /** P5：离线模式（见 `HealthDto.offline`）。 */
    offline: boolean;
}
/** 一个动作今天的额度读数。 */
export interface GuardUsageEntryDto {
    action: string;
    bucket: 'greeting' | 'application' | 'reply';
    /** 今天已经成功做了几次（计数来源是审计表）。 */
    used: number;
    /** 用户设的每日额度（`guard.dailyLimits`）。 */
    budget: number;
    /** 平台侧上限（平台事实）；`null` = 这个动作在该平台没有已知上限。 */
    platformCap: number | null;
    /** 真正生效的上限 = `min(budget, platformCap)`。 */
    limit: number;
    /**
     * 被哪一层限住。`'platform'` 时改自己的额度**没有用** ——
     * 这一格存在的意义就是避免用户白改一场（见 `checkQuota` 的拒绝文案）。
     */
    limitedBy: 'budget' | 'platform';
    /** 今天还能做几次（不会小于 0）。 */
    remaining: number;
}
/** `GET /guard/usage`：额度是**按平台**算的，所以按平台分组。 */
export interface GuardUsageDto {
    /** 计数起点（今天的 UTC 00:00，与 `checkQuota` 同一口径）。 */
    since: string;
    platforms: Array<{
        platformId: string;
        displayName: string;
        actions: GuardUsageEntryDto[];
    }>;
    note: string;
}
/** `confirm-action` 待办交回的意图：宿主不重放正文，只给"该回哪个上下文重新发起"。 */
export interface ConfirmActionIntentDto {
    action: string;
    actor: string;
    target: Record<string, number | string>;
}
//# sourceMappingURL=today.d.ts.map