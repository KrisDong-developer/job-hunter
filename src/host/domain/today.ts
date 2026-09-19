/**
 * U0 今日聚合（§5.4：首屏要回答「今天干什么」）。
 *
 * 只聚合**现在真有数据**的东西。待跟进 / 面试 / 额度分别属于 P7 与 P5（guard），
 * 这里刻意不返回恒为 0 的占位字段 —— 界面上显示一个假的「0 个面试」比不显示更误导。
 */
import type { TodayDto } from '../../shared/dto.js'
import type { Store } from '../store/store.js'
import type { OfferService } from './offers.js'
import { readAdapterHealth } from '../platform/health.js'
import type { AdapterRegistry } from '../platform/registry.js'
import { isOfflineMode } from '../util/offline.js'
import { systemClock, type Clock } from '../util/time.js'

/** 「今日新增」的窗口。 */
const NEW_JOB_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * 首屏展示 offer 截止倒计时的窗口（天）。
 *
 * 取 7 天：再远的事放进首屏只会变成噪音，而"一周内要答复"是真实的决策压力
 * （H3：offer 截止与"再等等别家"的博弈）。**已过期的也会出现**（`upcoming` 含过去），
 * 那是最需要立刻看到的一种。
 */
const OFFER_DUE_WINDOW_DAYS = 7

export interface TodayDeps {
  store: Store
  registry: AdapterRegistry
  clock?: Clock
  /** 未关闭待办最多返回多少条。 */
  todoLimit?: number
  /**
   * Offer 服务（可选）。
   *
   * 为什么用 `Pick` 而不是整个 `OfferService`：首屏只要两个读数，
   * 而"首屏依赖了哪些能力"应当一眼看得出来 —— 传整个服务会让这里慢慢长成第二个聚合层。
   */
  offers?: Pick<OfferService, 'openCount' | 'upcoming'>
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
    openTodoCount: store.todo.countOpen(),
    pendingRepair: store.repair.countPending(),
    offerOpenCount: deps.offers?.openCount() ?? 0,
    offersDueSoon: deps.offers?.upcoming(OFFER_DUE_WINDOW_DAYS) ?? [],
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
    openTodoCount: 0,
    pendingRepair: 0,
    offerOpenCount: 0,
    offersDueSoon: [],
    adapters: [],
    lastCrawl: null,
  }
}
