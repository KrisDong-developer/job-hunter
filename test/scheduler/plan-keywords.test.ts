import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createEventBus } from '../../src/host/http/sse.js'
import { platformFacts } from '../../src/host/platform/platform-facts.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createScheduler } from '../../src/host/scheduler/index.js'
import type { CrawlSummaryDto } from '../../src/shared/contract/dto/crawl.js'
import { ROUND_BUDGET_MS } from '../../src/shared/config/crawl.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'
import type { SiteAdapter } from '../../src/host/platform/types.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 调度器的关键词展开（多关键词逐个采集）。
 *
 * 三条不变量：
 *   1. **词间串行、按序**：第 1 个关键词的全部平台抓完 → 第 2 个（记录 launch 顺序）；
 *   2. **每词一条独立抓取**：criteria.keyword 逐词注入（老形态/空形态也各跑一趟）；
 *   3. **预算耗尽截断点在词边界**：没轮到的关键词整段留到下一轮（round_budget）。
 */

function stubAdapter(id: string): SiteAdapter {
  return {
    id,
    displayName: id,
    ...platformFacts(id),
    capabilities: {
      searchWithoutLogin: true,
      supportsAttachment: false,
      supportsReadReceipt: false,
      supportsInbox: false,
      supportsGreeting: false,
      fieldCompleteness: 'low',
      antiBot: 'low',
    },
    requiredFields: ['title'],
    criteriaDimensions: [{ key: 'keyword', label: '关键词', values: [], hint: '' }],
    maxPages: 1,
    defaultMaxPages: 1,
    criteria: { buildSearchUrl: () => `https://example.com/${id}` },
    crawl: {
      gotoSearch: async () => undefined,
      readListPage: async () => [],
      hasNextPage: async () => false,
    },
    guard: { detectBlock: async () => null },
  }
}

function setup(keywords: string[], criteria?: Record<string, string>) {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(stubAdapter('a'))
  const timer = createManualTimer()
  let now = new Date(2026, 8, 16, 8, 0)
  const clock = (): string => now.toISOString()
  const plans = createPlanService(store, clock, registry)
  const plan = plans.create({
    name: '多关键词',
    platforms: ['a'],
    ...(keywords.length > 0 ? { keywords } : {}),
    // 桩适配器只声明了 keyword 维度 —— 条件里不能带别的键
    ...(criteria === undefined || criteria['keyword'] === undefined
      ? {}
      : { criteria: { keyword: criteria['keyword'] } }),
    schedule: { windowStartHour: 0, windowEndHour: 24, weekdays: [], jitterMs: 0, missedGraceMs: 0 },
  })
  return { store, plan, plans, timer, clock, advance: (next: Date): void => { now = next } }
}

function schedulerOf(
  ctx: ReturnType<typeof setup>,
  runs: Array<{ platformId: string; keyword?: string }>,
  logs: string[],
  options: { exhaustedAfterRuns?: number } = {},
) {
  let callCount = 0
  return createScheduler({
    store: ctx.store,
    plans: ctx.plans,
    run: async (input) => {
      callCount += 1
      runs.push({ platformId: input.platformId, keyword: input.criteria['keyword'] })
      if (options.exhaustedAfterRuns !== undefined && callCount >= options.exhaustedAfterRuns) {
        // 模拟"预算到点"：把时钟推到本轮终点之后（绝对时刻判定的语义）
        ctx.advance(new Date(new Date(ctx.clock()).getTime() + ROUND_BUDGET_MS + 1000))
      }
      return { run: { id: callCount, state: 'ok' } } as unknown as CrawlSummaryDto
    },
    timer: ctx.timer,
    events: createEventBus(),
    canSchedule: () => true,
    readOnlyReason: () => null,
    leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
    clock: ctx.clock,
    logger: { info: (message) => logs.push(message), warn: (message) => logs.push(message) },
  })
}

test('逐个采集：第 1 个关键词抓完 → 第 2 个，每词独立一趟且 keyword 正确注入', async () => {
  const ctx = setup(['Java', 'Go', '前端'])
  const runs: Array<{ platformId: string; keyword?: string }> = []
  const scheduler = schedulerOf(ctx, runs, [])
  try {
    scheduler.start()
    ctx.advance(new Date(ctx.plans.get(ctx.plan.id).nextRunAt ?? 0))
    const summary = await scheduler.runPlan(ctx.plan.id, 'manual')
    assert.equal(summary.run.state, 'ok')
    assert.deepEqual(
      runs.map((run) => run.keyword),
      ['Java', 'Go', '前端'],
      '三趟、按方案里的顺序、逐词注入',
    )
    assert.ok(runs.every((run) => run.platformId === 'a'))
  } finally {
    scheduler.stop()
    const dir = ctx.store.dataDir
    ctx.store.close()
    cleanup(dir)
  }
})

test('老形态（criteria.keyword 单值）→ 一趟，行为不变', async () => {
  const ctx = setup([], { keyword: 'Java' })
  const runs: Array<{ platformId: string; keyword?: string }> = []
  const scheduler = schedulerOf(ctx, runs, [])
  try {
    scheduler.start()
    ctx.advance(new Date(ctx.plans.get(ctx.plan.id).nextRunAt ?? 0))
    await scheduler.runPlan(ctx.plan.id, 'manual')
    assert.deepEqual(runs.map((run) => run.keyword), ['Java'])
  } finally {
    scheduler.stop()
    const dir = ctx.store.dataDir
    ctx.store.close()
    cleanup(dir)
  }
})

test('预算耗尽：截断在词边界 —— 没轮到的关键词整段留到下一轮', async () => {
  const ctx = setup(['Java', 'Go', '前端'])
  const runs: Array<{ platformId: string; keyword?: string }> = []
  const logs: string[] = []
  // 第 1 个关键词跑完后预算"到点"：第 2/3 个关键词不该开始
  const scheduler = schedulerOf(ctx, runs, logs, { exhaustedAfterRuns: 1 })
  try {
    scheduler.start()
    ctx.advance(new Date(ctx.plans.get(ctx.plan.id).nextRunAt ?? 0))
    const summary = await scheduler.runPlan(ctx.plan.id, 'manual')
    assert.deepEqual(runs.map((run) => run.keyword), ['Java'], '只有第 1 个关键词真正跑了')
    // 已有一趟成功 → 返回成功的 summary（不是错误）
    assert.equal(summary.run.state, 'ok')
    // 词间耗尽：平台**跑过**，逐平台判定如实记 ran（不能记成"没跑"）；
    // 没轮到的关键词是方案级事实 → 日志说清楚
    const status = scheduler.status()
    const planStatus = status.planStatus.find((item) => item.planId === ctx.plan.id)
    const decision = planStatus?.platformDecisions.find((item) => item.platformId === 'a')?.decision
    assert.equal(decision?.decision, 'ran', '平台跑过第 1 个关键词，判定必须是 ran')
    assert.ok(
      logs.some((line) => line.includes('关键词') && line.includes('Go') && line.includes('前端')),
      '没轮到的关键词要留痕（日志）',
    )
  } finally {
    scheduler.stop()
    const dir = ctx.store.dataDir
    ctx.store.close()
    cleanup(dir)
  }
})
