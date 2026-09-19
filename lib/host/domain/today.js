import { readAdapterHealth } from '../platform/health.js';
import { isOfflineMode } from '../util/offline.js';
import { systemClock } from '../util/time.js';
/** 「今日新增」的窗口。 */
const NEW_JOB_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * 首屏展示 offer 截止倒计时的窗口（天）。
 *
 * 取 7 天：再远的事放进首屏只会变成噪音，而"一周内要答复"是真实的决策压力
 * （H3：offer 截止与"再等等别家"的博弈）。**已过期的也会出现**（`upcoming` 含过去），
 * 那是最需要立刻看到的一种。
 */
const OFFER_DUE_WINDOW_DAYS = 7;
export function buildToday(deps) {
    const clock = deps.clock ?? systemClock;
    const store = deps.store;
    const now = clock();
    const since = new Date(new Date(now).getTime() - NEW_JOB_WINDOW_MS).toISOString();
    return {
        generatedAt: now,
        dataReady: true,
        dataError: null,
        offline: isOfflineMode(),
        jobCount: store.job.count(),
        byState: store.job.countByState(),
        newJobs24h: store.job.countSince(since),
        todos: store.todo.listOpen(deps.todoLimit ?? 20).map((todo) => ({
            id: todo.id,
            kind: todo.kind,
            level: todo.level,
            title: todo.title,
            ref: todo.ref,
            detail: todo.detail,
            createdAt: todo.createdAt,
        })),
        openTodoCount: store.todo.countOpen(),
        pendingRepair: store.repair.countPending(),
        offerOpenCount: deps.offers?.openCount() ?? 0,
        offersDueSoon: deps.offers?.upcoming(OFFER_DUE_WINDOW_DAYS) ?? [],
        adapters: deps.registry.list().map((adapter) => {
            const snapshot = readAdapterHealth(store, adapter.id);
            return {
                platformId: adapter.id,
                health: snapshot.health,
                failStreak: snapshot.failStreak,
                lastOkAt: snapshot.lastOkAt,
                fields: snapshot.fields,
                reason: snapshot.reason,
            };
        }),
        lastCrawl: store.crawlRun.latest() ?? null,
    };
}
/** 数据层没就绪时的 U0：如实说明原因，而不是给一片空白。 */
export function buildTodayUnavailable(reason, now) {
    return {
        generatedAt: now,
        dataReady: false,
        dataError: reason,
        offline: isOfflineMode(),
        jobCount: 0,
        byState: {},
        newJobs24h: 0,
        todos: [],
        openTodoCount: 0,
        pendingRepair: 0,
        offerOpenCount: 0,
        offersDueSoon: [],
        adapters: [],
        lastCrawl: null,
    };
}
//# sourceMappingURL=today.js.map