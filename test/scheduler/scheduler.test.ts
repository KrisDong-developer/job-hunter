import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createScheduler, type SchedulerRunInput } from '../../src/host/scheduler/index.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'
import { createEventBus } from '../../src/host/http/sse.js'
import type { CrawlSummaryDto, PlanSchedule } from '../../src/shared/dto.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

/** 可控时钟：本地时间分量构造，任何时区都成立。 */
function makeClock(start: Date) {
  let current = start
  return {
    clock: () => current.toISOString(),
    set: (next: Date) => {
      current = next
    },
    get: () => current,
  }
}

function fakeSummary(): CrawlSummaryDto {
  return {
    run: {
      id: 1,
      platformId: '51job',
      planId: 1,
      startedAt: '2026-09-16T00:00:00.000Z',
      endedAt: '2026-09-16T00:00:01.000Z',
      state: 'ok',
      pages: 1,
      found: 3,
      inserted: 3,
      updated: 0,
      skipped: 0,
      quarantined: 0,
      errorCode: null,
      errorMsg: null,
    },
    quarantined: 0,
    fieldPresence: [],
    degraded: null,
  }
}

interface HarnessOptions {
  readOnly?: boolean
  lastRunAt?: string
  schedule?: Partial<PlanSchedule>
  now?: Date
}

function harness(options: HarnessOptions = {}) {
  const store = openTestStore()
  const time = makeClock(options.now ?? new Date(2026, 8, 16, 8, 0))
  const plans = createPlanService(store, time.clock)
  const timer = createManualTimer()
  const events = createEventBus()
  const runs: SchedulerRunInput[] = []

  const plan = plans.create({
    name: '测试方案',
    platforms: ['51job'],
    criteria: { keyword: 'Java', city: '深圳' },
    schedule: { hour: 9, minute: 0, weekdays: [], jitterMs: 0, missedGraceMs: 60 * 60 * 1000, ...options.schedule },
  })
  if (options.lastRunAt !== undefined) {
    store.plan.setRunTimes(plan.id, { lastRunAt: options.lastRunAt })
  }

  const readOnly = options.readOnly === true
  const scheduler = createScheduler({
    store,
    plans,
    run: async (input) => {
      runs.push(input)
      return fakeSummary()
    },
    timer,
    events,
    canSchedule: () => !readOnly,
    readOnlyReason: () => (readOnly ? '另一个实例正在运行（pid 999）' : null),
    leaseStatus: () => ({
      path: 'lease.json',
      held: !readOnly,
      pid: readOnly ? 999 : process.pid,
      heartbeatAt: time.clock(),
      startedAt: time.clock(),
      stale: false,
    }),
    clock: time.clock,
    random: () => 0,
  })

  return {
    store,
    plans,
    timer,
    events,
    runs,
    scheduler,
    time,
    planId: plan.id,
    close: () => {
      scheduler.stop()
      const dir = store.dataDir
      store.close()
      cleanup(dir)
    },
  }
}

test('start：算出 next_run_at 并武装定时器', () => {
  const h = harness()
  try {
    h.scheduler.start()
    const plan = h.plans.get(h.planId)
    assert.ok(plan.nextRunAt !== null)
    const next = new Date(plan.nextRunAt)
    assert.equal(next.getHours(), 9, '应当落在配置的 9 点')
    assert.equal(next.getDate(), 16, '8 点时启动，触发点是今天 9 点')

    const status = h.scheduler.status()
    assert.equal(status.scheduling, true)
    assert.equal(status.armed, true)
    assert.equal(h.timer.pending(), 1, '同一时刻只挂一个定时器')
  } finally {
    h.close()
  }
})

test('到点自动跑：推进定时器就真的执行了（P3 出口标准）', async () => {
  const h = harness()
  try {
    h.scheduler.start()
    assert.equal(h.runs.length, 0)

    // 时钟走到 9:00，并让定时器到期
    h.time.set(new Date(2026, 8, 16, 9, 0))
    h.timer.advance(60 * 60 * 1000)
    // tick 是异步的，等它落地
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.equal(h.runs.length, 1)
    assert.equal(h.runs[0]?.planId, h.planId)
    assert.equal(h.runs[0]?.platformId, '51job')
    assert.equal(h.runs[0]?.reason, 'schedule')

    const plan = h.plans.get(h.planId)
    assert.ok(plan.lastRunAt !== null, '跑完要记 last_run_at')
    assert.ok(
      new Date(plan.nextRunAt ?? 0).getTime() > new Date(plan.lastRunAt ?? 0).getTime(),
      'next_run_at 必须被推到未来，否则定时器会自旋',
    )
  } finally {
    h.close()
  }
})

test('错过的轮次只生成补跑待办，**绝不自动跑**（C9）', () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const h = harness({
    now,
    schedule: { hour: 7, minute: 0, missedGraceMs: 60 * 60 * 1000 },
    lastRunAt: new Date(2026, 8, 15, 7, 0).toISOString(),
  })
  try {
    h.scheduler.start()

    assert.equal(h.runs.length, 0, '启动时不能自动猛跑积压')
    const todos = h.store.todo.listOpen()
    assert.equal(todos.length, 1)
    assert.equal(todos[0]?.kind, 'catch-up')
    assert.equal(todos[0]?.level, 'warn')
    assert.equal(todos[0]?.ref, String(h.planId))

    // 重复 start 不会刷出一堆待办
    h.scheduler.stop()
    h.scheduler.start()
    assert.equal(h.store.todo.listOpen().length, 1)
  } finally {
    h.close()
  }
})

test('没跳过的方案不会误报补跑', () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const h = harness({
    now,
    schedule: { hour: 7, minute: 0, missedGraceMs: 60 * 60 * 1000 },
    lastRunAt: new Date(2026, 8, 16, 7, 5).toISOString(),
  })
  try {
    h.scheduler.start()
    assert.deepEqual(h.store.todo.listOpen(), [])
    assert.equal(h.runs.length, 0)
  } finally {
    h.close()
  }
})

test('runPlan 手动跑一次并把补跑待办关掉', async () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const h = harness({
    now,
    schedule: { hour: 7, minute: 0, missedGraceMs: 60 * 60 * 1000 },
    lastRunAt: new Date(2026, 8, 15, 7, 0).toISOString(),
  })
  try {
    h.scheduler.start()
    assert.equal(h.store.todo.listOpen().length, 1)

    const summary = await h.scheduler.runPlan(h.planId, 'catch-up')
    assert.equal(summary.run.state, 'ok')
    assert.equal(h.runs.length, 1)
    assert.equal(h.runs[0]?.reason, 'catch-up')
    assert.equal(h.store.todo.listOpen().length, 0, '补跑完待办要关掉')
    assert.ok(h.plans.get(h.planId).lastRunAt !== null)
  } finally {
    h.close()
  }
})

test('只读实例（没拿到租约）：不武装、不许手动跑（R20）', async () => {
  const h = harness({ readOnly: true })
  try {
    h.scheduler.start()
    const status = h.scheduler.status()
    assert.equal(status.readOnly, true)
    assert.equal(status.scheduling, false)
    assert.equal(status.armed, false)
    assert.equal(h.timer.pending(), 0, '只读实例不该挂定时器')

    await assert.rejects(
      h.scheduler.runPlan(h.planId, 'manual'),
      (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT',
    )
    assert.equal(h.runs.length, 0)
  } finally {
    h.close()
  }
})

test('只读实例拿到租约后能接管调度（不必重启）', () => {
  const store = openTestStore()
  const timer = createManualTimer()
  const plans = createPlanService(store)
  let readOnly = true
  try {
    plans.create({
      name: '接管测试',
      platforms: ['51job'],
      schedule: { hour: 9, minute: 0, weekdays: [], jitterMs: 0, missedGraceMs: 0 },
    })
    const scheduler = createScheduler({
      store,
      plans,
      run: async () => fakeSummary(),
      timer,
      events: createEventBus(),
      canSchedule: () => !readOnly,
      readOnlyReason: () => (readOnly ? '另一个实例正在运行（pid 999）' : null),
      leaseStatus: () => ({ path: 'x', held: !readOnly, pid: readOnly ? 999 : 1, heartbeatAt: null, startedAt: null, stale: false }),
      clock: () => new Date(2026, 8, 16, 8, 0).toISOString(),
      random: () => 0,
    })

    scheduler.start()
    assert.equal(timer.pending(), 0, '只读时不武装')
    assert.equal(scheduler.status().scheduling, false)

    // 上一个实例被强杀、心跳过期 → 我们接管
    readOnly = false
    scheduler.start()
    assert.equal(scheduler.status().scheduling, true)
    assert.equal(scheduler.status().armed, true)
    assert.equal(timer.pending(), 1)
    scheduler.stop()
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('stop 取消定时器，不留幽灵定时器（C15）', () => {
  const h = harness()
  try {
    h.scheduler.start()
    assert.equal(h.timer.pending(), 1)
    h.scheduler.stop()
    assert.equal(h.timer.pending(), 0)
    assert.equal(h.scheduler.status().armed, false)
  } finally {
    h.close()
  }
})

test('没有启用的方案 → 不武装定时器', () => {
  const h = harness()
  try {
    h.plans.update(h.planId, { enabled: false })
    h.scheduler.start()
    assert.equal(h.timer.pending(), 0)
    assert.equal(h.scheduler.status().armed, false)
    assert.equal(h.plans.get(h.planId).nextRunAt, null)
  } finally {
    h.close()
  }
})

test('到点时抓取抛错：不让定时器链断掉，错误被记录', async () => {
  const store = openTestStore()
  const time = makeClock(new Date(2026, 8, 16, 8, 0))
  const plans = createPlanService(store, time.clock)
  const timer = createManualTimer()
  const warnings: string[] = []
  let attempts = 0
  try {
    const plan = plans.create({
      name: '会失败的方案',
      platforms: ['51job'],
      schedule: { hour: 9, minute: 0, weekdays: [], jitterMs: 0, missedGraceMs: 0 },
    })
    const scheduler = createScheduler({
      store,
      plans,
      run: async () => {
        attempts += 1
        throw new Error('断网了')
      },
      timer,
      events: createEventBus(),
      canSchedule: () => true,
      readOnlyReason: () => null,
      leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
      clock: time.clock,
      random: () => 0,
      logger: { info: () => undefined, warn: (message) => warnings.push(message) },
    })

    scheduler.start()
    time.set(new Date(2026, 8, 16, 9, 0))
    timer.advance(60 * 60 * 1000)
    await new Promise((resolve) => setTimeout(resolve, 10))

    assert.equal(attempts, 1)
    assert.ok(warnings.some((message) => message.includes('断网了')))
    // 失败也要重新武装，否则一次网络抖动就永久停摆
    assert.ok(timer.pending() >= 1)
    assert.ok(plans.get(plan.id).nextRunAt !== null)
    scheduler.stop()
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
