/**
 * U0 今日聚合（§5.4：首屏要回答「今天干什么」）。
 *
 * 只聚合**现在真有数据**的东西。待跟进 / 面试 / 额度分别属于 P7 与 P5（guard），
 * 这里刻意不返回恒为 0 的占位字段 —— 界面上显示一个假的「0 个面试」比不显示更误导。
 */
import type { TodayDto } from '../../shared/dto.js'
import type { Store } from '../store/store.js'
import { readAdapterHealth } from '../platform/health.js'
import type { AdapterRegistry } from '../platform/registry.js'
import { isOfflineMode } from '../util/offline.js'
import { systemClock, type Clock } from '../util/time.js'

/** 「今日新增」的窗口。 */
const NEW_JOB_WINDOW_MS = 24 * 60 * 60 * 1000

export interface TodayDeps {
  store: Store
  registry: AdapterRegistry
  clock?: Clock
  /** 未关闭待办最多返回多少条。 */
  todoLimit?: number
}

export function buildToday(deps: TodayDeps): TodayDto {
  const clock = deps.clock ?? systemClock
  const store = deps.store
  const now = clock()

  const since = new Date(new Date(now).getTime() - NEW_JOB_WINDOW_MS).toISOString()

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
    pendingRepair: store.repair.countPending(),
    adapters: deps.registry.list().map((adapter) => {
      const snapshot = readAdapterHealth(store, adapter.id)
      return {
        platformId: adapter.id,
        health: snapshot.health,
        failStreak: snapshot.failStreak,
        lastOkAt: snapshot.lastOkAt,
        fields: snapshot.fields,
        reason: snapshot.reason,
      }
    }),
    lastCrawl: store.crawlRun.latest() ?? null,
  }
}

/** 数据层没就绪时的 U0：如实说明原因，而不是给一片空白。 */
export function buildTodayUnavailable(reason: string, now: string): TodayDto {
  return {
    generatedAt: now,
    dataReady: false,
    dataError: reason,
    offline: isOfflineMode(),
    jobCount: 0,
    byState: {},
    newJobs24h: 0,
    todos: [],
    pendingRepair: 0,
    adapters: [],
    lastCrawl: null,
  }
}
