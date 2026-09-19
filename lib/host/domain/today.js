import { readAdapterHealth } from '../platform/health.js';
import { isOfflineMode } from '../util/offline.js';
import { systemClock } from '../util/time.js';
/** 「今日新增」的窗口。 */
const NEW_JOB_WINDOW_MS = 24 * 60 * 60 * 1000;
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
        adapters: [],
        lastCrawl: null,
    };
}
//# sourceMappingURL=today.js.map