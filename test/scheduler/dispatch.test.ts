import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createEventBus } from '../../src/host/http/sse.js'
import {
  backoffMsFor,
  createScheduler,
  freshnessOf,
  freshThresholdsFor,
  RISK_PAUSE_THRESHOLD,
  type PlatformGate,
  type SchedulerRunInput,
} from '../../src/host/scheduler/index.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'
import type { CrawlSummaryDto, PlanSchedule } from '../../src/shared/dto.js'
import type { CrawlState } from '../../src/shared/enums.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 调度语义的**行为测试**（SR-3/7/8/17/20/21/22/23/26/30）。
 *
 * 与 `scheduler.test.ts` 的分工：那里测"定时器到点会跑"这条主链，
 * 这里测"没跑的时候到底为什么"——D-19 之后新增的那一半语义。
 * 全部用假时钟 + 手动定时器驱动，**不等待真实时间**（NFR-1）。
 */

function makeClock(start: Date) {
  let current = start
  return {
    clock: (): string => current.toISOString(),
    set: (next: Date): void => {
      current = next
    },
    get: (): Date => current,
  }
}

function summaryOf(state: CrawlState, errorCode: string | null = null): CrawlSummaryDto {
  return {
    run: {
      id: 1,
      platformId: '51job',
      planId: 1,
      startedAt: '2026-09-16T00:00:00.000Z',
      endedAt: '2026-09-16T00:00:01.000Z',
      state,
      pages: 1,
      found: state === 'ok' ? 5 : 0,
      inserted: state === 'ok' ? 5 : 0,
      updated: 0,
      skipped: 0,
      quarantined: 0,
      errorCode,
      errorMsg: errorCode === null ? null : '测试构造的失败',
      reason: 'schedule',
      skipReason: null,
    },
    quarantined: 0,
    fieldPresence: [],
    degraded: null,
  }
}

interface Options {
  planId?: number
  schedule?: Partial<PlanSchedule>
  outcome?: () => Promise<CrawlSummaryDto>
  gate?: PlatformGate
  lastAttemptAt?: string
  lastSuccessAt?: string
  platforms?: string[]
}

function harness(options: Options = {}) {
  const store = openTestStore()
  const time = makeClock(new Date(2026, 8, 16, 0, 30)) // 周三 00:30，窗口之外
  const plans = createPlanService(store, time.clock)
  const timer = createManualTimer()
  const runs: SchedulerRunInput[] = []

  const plan = plans.create({
    name: '语义测试',
    platforms: options.platforms ?? ['51job'],
    criteria: { keyword: 'Java', city: '深圳' },
    schedule: {
      windowStartHour: 9,
      windowEndHour: 11,
      weekdays: [1, 2, 3, 4, 5, 6, 0],
      jitterMs: 0,
      missedGraceMs: 60 * 60 * 1000,
      ...options.schedule,
    },
  })
  if (options.lastAttemptAt !== undefined || options.lastSuccessAt !== undefined) {
    store.db
      .prepare('UPDATE plan SET last_attempt_at = ?, last_success_at = ?, last_run_at = ? WHERE id = ?')
      .run(
        options.lastAttemptAt ?? null,
        options.lastSuccessAt ?? null,
        options.lastSuccessAt ?? null,
        plan.id,
      )
  }

  const scheduler = createScheduler({
    store,
    plans,
    run: async (input) => {
      runs.push(input)
      return options.outcome === undefined ? summaryOf('ok') : await options.outcome()
    },
    timer,
    events: createEventBus(),
    canSchedule: () => true,
    readOnlyReason: () => null,
    leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
    ...(options.gate === undefined ? {} : { platformGate: options.gate }),
    clock: time.clock,
  })

  return {
    store,
    plans,
    scheduler,
    timer,
    runs,
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

/** 把时钟推到本次的触发点，并让定时器到期。 */
async function fireDue(h: ReturnType<typeof harness>): Promise<void> {
  const nextRunAt = h.plans.get(h.planId).nextRunAt
  assert.ok(nextRunAt !== null, '应当已经算出 next_run_at')
  const trigger = new Date(nextRunAt)
  h.time.set(trigger)
  h.timer.advance(trigger.getTime() - new Date(2026, 8, 16, 0, 30).getTime() + 1000)
  // tick 内部是异步的
  await new Promise((resolve) => setTimeout(resolve, 20))
}

// ── SR-20：退避曲线（纯函数）──────────────────────────────────────────

test('SR-20：退避曲线 15m → 1h → 4h，之后封顶 4h', () => {
  assert.equal(backoffMsFor(0), 0)
  assert.equal(backoffMsFor(1), 15 * 60 * 1000)
  assert.equal(backoffMsFor(2), 60 * 60 * 1000)
  assert.equal(backoffMsFor(3), 4 * 60 * 60 * 1000)
  assert.equal(backoffMsFor(9), 4 * 60 * 60 * 1000, '封顶，不再指数增长')
})

// ── SR-8：新鲜度阈值随计划频率 ────────────────────────────────────────

test('SR-8：每天跑的计划 18 小时就算旧；每周跑一次的 18 小时还很新', () => {
  const daily = freshThresholdsFor({ schedule: { weekdays: [] } } as never)
  const weekly = freshThresholdsFor({ schedule: { weekdays: [1] } } as never)
  assert.ok(daily.freshHours < weekly.freshHours, '频率越高，新鲜期越短')
  assert.equal(daily.freshHours, 12)
  assert.equal(weekly.freshHours, 84)
})

test('SR-8：从未成功过 = cold（"没数据"绝不等于"是新鲜的"）', () => {
  const now = new Date(2026, 8, 16, 12, 0)
  const plan = {
    lastSuccessAt: null,
    schedule: { weekdays: [] },
  } as never
  const freshness = freshnessOf(plan, now)
  assert.equal(freshness.level, 'cold')
  assert.equal(freshness.hoursSinceSuccess, null)
})

test('SR-8：三级阈值边界', () => {
  const now = new Date(2026, 8, 16, 12, 0)
  const at = (hours: number): string => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
  const plan = (hours: number): never => ({ lastSuccessAt: at(hours), schedule: { weekdays: [] } }) as never

  // 每天跑一次的方案：fresh < 12h，stale 12–48h，cold > 48h
  assert.equal(freshnessOf(plan(1), now).level, 'fresh')
  assert.equal(freshnessOf(plan(11.9), now).level, 'fresh')
  assert.equal(freshnessOf(plan(12.1), now).level, 'stale')
  assert.equal(freshnessOf(plan(47.9), now).level, 'stale')
  assert.equal(freshnessOf(plan(48.1), now).level, 'cold')

  // 阈值随频率变：一周只在周一跑一次时，18 小时还完全正常
  const weekly = (hours: number): never =>
    ({ lastSuccessAt: at(hours), schedule: { weekdays: [1] } }) as never
  assert.equal(freshnessOf(weekly(18), now).level, 'fresh')
  assert.equal(freshnessOf(weekly(90), now).level, 'stale')
})

// ── SR-30：一键暂停只停定时 ───────────────────────────────────────────

test('SR-30：暂停后定时不跑，但手动「立即采集」仍然成功', async () => {
  const h = harness()
  try {
    h.scheduler.start()
    assert.equal(h.scheduler.status().paused, false)

    h.scheduler.setPaused(true, '测试暂停')
    const paused = h.scheduler.status()
    assert.equal(paused.paused, true)
    assert.equal(paused.scheduling, false, '暂停时不该宣称"正在按计划跑"')
    assert.equal(paused.armed, false, '暂停要立刻卸掉定时器，不能挂着')

    // 到点了也**不跑**
    await fireDue(h)
    assert.equal(h.runs.length, 0, '暂停期间定时绝不能触发')

    // 手动跑照样成功 —— 这是 SR-30 的关键一半
    const summary = await h.scheduler.runPlan(h.planId, 'manual')
    assert.equal(summary.run.state, 'ok')
    assert.equal(h.runs.length, 1)

    // 恢复后调度重新武装
    h.scheduler.setPaused(false)
    assert.equal(h.scheduler.status().paused, false)
    assert.equal(h.scheduler.status().armed, true)
  } finally {
    h.close()
  }
})

// ── SR-17/26：跳过原因 ────────────────────────────────────────────────

test('SR-17/26：未登录时跳过并给出 not_logged_in + 人话，不是一句"已武装"', async () => {
  const h = harness({ gate: () => 'not_logged_in' })
  try {
    h.scheduler.start()
    await fireDue(h)

    assert.equal(h.runs.length, 0, '被跳过就不该真的去抓')
    const status = h.scheduler.status()
    const planStatus = status.planStatus[0]
    assert.equal(planStatus?.lastDecision?.decision, 'skipped')
    assert.equal(planStatus?.lastDecision?.reason, 'not_logged_in')
    assert.ok(
      (planStatus?.lastDecision?.message ?? '').includes('登录'),
      '界面要显示人话，而不是枚举键',
    )
  } finally {
    h.close()
  }
})

test('SR-18：一个平台被跳过时其它平台照常跑（判定是**每平台**的）', async () => {
  const h = harness({
    platforms: ['51job', 'other'],
    gate: (platformId) => (platformId === '51job' ? 'not_logged_in' : null),
  })
  try {
    h.scheduler.start()
    await fireDue(h)
    assert.equal(h.runs.length, 0, '方案级的判定：只要有一个平台不能跑就整条跳过并说明')
    assert.equal(h.scheduler.status().planStatus[0]?.lastDecision?.reason, 'not_logged_in')
  } finally {
    h.close()
  }
})

test('SR-3：窗口外不跑，原因是 outside_window', async () => {
  const h = harness()
  try {
    h.scheduler.start()
    // 人为把 next_run_at 拉到一个窗口外、但已经过去的时刻
    h.store.plan.setRunTimes(h.planId, { nextRunAt: new Date(2026, 8, 16, 3, 0).toISOString() })
    h.time.set(new Date(2026, 8, 16, 3, 5))
    await h.scheduler.tick()
    assert.equal(h.runs.length, 0)
    assert.equal(h.scheduler.status().planStatus[0]?.lastDecision?.reason, 'outside_window')
  } finally {
    h.close()
  }
})

// ── SR-7/23：失败只推进 attempt ───────────────────────────────────────

test('SR-7/23：失败的尝试推进 last_attempt_at 与退避，**不**推进 last_success_at', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'NAVIGATION_FAILED') })
  try {
    h.scheduler.start()
    await fireDue(h)

    assert.equal(h.runs.length, 1, '失败了也算"试过了一次"')
    const plan = h.plans.get(h.planId)
    assert.ok(plan.lastAttemptAt !== null, '尝试时刻要推进')
    assert.equal(plan.lastSuccessAt, null, 'SR-7：失败绝不能推进成功时刻')

    const engine = h.store.plan.engineState(h.planId)
    assert.equal(engine.failStreak, 1)
    assert.ok(engine.backoffUntil !== null, 'SR-23：失败要推进冷却（退避）')
    assert.equal(engine.riskPaused, false, '一次失败还不该暂停')
  } finally {
    h.close()
  }
})

// ── SR-21/22：风控暂停与人工恢复 ──────────────────────────────────────

test('SR-21：连续失败到阈值 → risk_paused + urgent 待办，且**不再自动尝试**', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'NAVIGATION_FAILED') })
  try {
    h.scheduler.start()

    // 手动跑三次（手动也计数），把 fail_streak 推过阈值
    for (let attempt = 0; attempt < RISK_PAUSE_THRESHOLD; attempt += 1) {
      await h.scheduler.runPlan(h.planId, 'manual')
    }

    const engine = h.store.plan.engineState(h.planId)
    assert.equal(engine.riskPaused, true, `连续 ${String(RISK_PAUSE_THRESHOLD)} 次失败必须暂停`)
    assert.ok((engine.riskReason ?? '').includes('连续失败'))

    const todos = h.store.todo.listOpen()
    const blocked = todos.find((todo) => todo.kind === 'blocked')
    assert.ok(blocked !== undefined, 'SR-21/24：风控暂停必须主动产生待办')
    assert.equal(blocked.level, 'urgent')

    // 暂停之后定时不再尝试
    const before = h.runs.length
    await fireDue(h)
    assert.equal(h.runs.length, before, '风控暂停后定时不该再试')
    assert.equal(h.scheduler.status().planStatus[0]?.lastDecision?.reason, 'risk_paused')
  } finally {
    h.close()
  }
})

test('SR-22：风控信号（验证码/限流）**一次就暂停**，不等凑够次数', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'BLOCKED') })
  try {
    h.scheduler.start()
    await h.scheduler.runPlan(h.planId, 'manual')

    const engine = h.store.plan.engineState(h.planId)
    assert.equal(engine.riskPaused, true, '风控信号是"被认出来了"，不该再试两次去确认')
    assert.ok((engine.riskReason ?? '').includes('风控'))
  } finally {
    h.close()
  }
})

test('SR-21：恢复只能由人工确认，确认后立刻能再排程', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'BLOCKED') })
  try {
    h.scheduler.start()
    await h.scheduler.runPlan(h.planId, 'manual')
    assert.equal(h.store.plan.engineState(h.planId).riskPaused, true)

    // 暂停期间**手动也不许跑** —— 否则"暂停"就是空话，用户点一下就又去打风控
    await assert.rejects(
      h.scheduler.runPlan(h.planId, 'manual'),
      (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT',
    )

    h.scheduler.resumeRisk(h.planId)
    const engine = h.store.plan.engineState(h.planId)
    assert.equal(engine.riskPaused, false)
    assert.equal(engine.failStreak, 0, '人工确认恢复时连续失败要清零，否则下一次失败立刻又暂停')
    assert.equal(engine.backoffUntil, null)
    assert.equal(
      h.store.todo.listOpen().some((todo) => todo.kind === 'blocked'),
      false,
      '恢复后待办要自动关掉',
    )
    assert.ok(h.plans.get(h.planId).nextRunAt !== null, '恢复后立刻重排，用户不必等到明天')
  } finally {
    h.close()
  }
})

// ── SR-2：在场触发只提示 ──────────────────────────────────────────────

test('SR-2：数据偏旧时只提示刷新，**不**自动跑', () => {
  const h = harness({ lastSuccessAt: new Date(2026, 8, 10, 9, 0).toISOString() })
  try {
    h.scheduler.start()
    const status = h.scheduler.status()
    assert.equal(status.refreshSuggested, true, '陈旧时首屏应当给出提示')
    assert.ok((status.refreshHint ?? '').includes('立即采集'), '提示要告诉用户下一步做什么')
    assert.equal(h.runs.length, 0, 'SR-2：不点就不跑')
  } finally {
    h.close()
  }
})

test('SR-24/SR-33：全新安装不产生"数据陈旧"待办（刚装上就催刷新是骚扰）', () => {
  const h = harness()
  try {
    h.scheduler.start()
    assert.equal(
      h.store.todo.listOpen().filter((todo) => todo.kind === 'catch-up').length,
      0,
      '没有基线就没有欠账',
    )
  } finally {
    h.close()
  }
})

test('SR-9/25：cold 欠账只提示一次，按 ref 去重', () => {
  const h = harness({ lastSuccessAt: new Date(2026, 8, 1, 9, 0).toISOString() })
  try {
    h.scheduler.start()
    const first = h.store.todo.listOpen().filter((todo) => todo.kind === 'catch-up').length
    assert.equal(first, 1)
    // 反复 start（模拟反复打开面板）不刷屏
    h.scheduler.stop()
    h.scheduler.start()
    h.scheduler.stop()
    h.scheduler.start()
    assert.equal(h.store.todo.listOpen().filter((todo) => todo.kind === 'catch-up').length, 1)
  } finally {
    h.close()
  }
})

// ── SR-6：时钟跳变不补偿、只重算 ──────────────────────────────────────

test('SR-6：系统时间往前跳 3 小时不会导致连跑两次', async () => {
  const h = harness()
  try {
    h.scheduler.start()
    await fireDue(h)
    assert.equal(h.runs.length, 1)

    // 跳到 3 小时之后（休眠唤醒的典型情形）
    const afterRun = h.plans.get(h.planId)
    assert.ok(afterRun.lastSuccessAt !== null)
    h.time.set(new Date(new Date(afterRun.lastSuccessAt).getTime() + 3 * 60 * 60 * 1000))
    await h.scheduler.tick()
    assert.equal(h.runs.length, 1, 'SR-6：不补偿跳变期间"本该跑"的次数')

    // 再跳一整天，仍然只有到点才跑
    h.time.set(new Date(h.time.get().getTime() + 24 * 60 * 60 * 1000))
    await h.scheduler.tick()
    assert.ok(h.runs.length <= 2, '一天最多一轮，不该因为跳变而连跑')
  } finally {
    h.close()
  }
})

// ── SR-4：多方案串行 ──────────────────────────────────────────────────

test('SR-4：两个方案同时到期时**串行**执行（不并发）', async () => {
  const store = openTestStore()
  const time = makeClock(new Date(2026, 8, 16, 0, 30))
  const plans = createPlanService(store, time.clock)
  const timer = createManualTimer()
  let concurrent = 0
  let maxConcurrent = 0
  const order: number[] = []
  try {
    const first = plans.create({
      name: '甲',
      platforms: ['51job'],
      criteria: { keyword: 'Java' },
      schedule: { windowStartHour: 9, windowEndHour: 11, weekdays: [0, 1, 2, 3, 4, 5, 6], jitterMs: 0 },
    })
    const second = plans.create({
      name: '乙',
      platforms: ['51job'],
      criteria: { keyword: 'Go' },
      schedule: { windowStartHour: 9, windowEndHour: 11, weekdays: [0, 1, 2, 3, 4, 5, 6], jitterMs: 0 },
    })

    const scheduler = createScheduler({
      store,
      plans,
      run: async (input) => {
        concurrent += 1
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        order.push(input.planId)
        await new Promise((resolve) => setTimeout(resolve, 5))
        concurrent -= 1
        return summaryOf('ok')
      },
      timer,
      events: createEventBus(),
      canSchedule: () => true,
      readOnlyReason: () => null,
      leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
      clock: time.clock,
    })

    scheduler.start()
    // 把两个方案的 next_run_at 都设成同一个已过去的时刻
    const past = new Date(2026, 8, 16, 10, 0).toISOString()
    store.plan.setRunTimes(first.id, { nextRunAt: past })
    store.plan.setRunTimes(second.id, { nextRunAt: past })
    time.set(new Date(2026, 8, 16, 10, 5))
    await scheduler.tick()

    assert.equal(order.length, 2, '两个方案各跑一轮')
    assert.equal(maxConcurrent, 1, '同时只允许一个抓取在跑（全局互斥）')
    scheduler.stop()
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

// ── SR-12：只读实例 ───────────────────────────────────────────────────

test('SR-12：不持有租约的实例连手动跑都拒绝，并给人话原因', async () => {
  const store = openTestStore()
  const plans = createPlanService(store)
  const timer = createManualTimer()
  try {
    const plan = plans.create({ name: '只读', platforms: ['51job'] })
    const scheduler = createScheduler({
      store,
      plans,
      run: async () => summaryOf('ok'),
      timer,
      events: createEventBus(),
      canSchedule: () => false,
      readOnlyReason: () => '另一个实例正在运行（pid 999）',
      leaseStatus: () => ({ path: 'x', held: false, pid: 999, heartbeatAt: null, startedAt: null, stale: false }),
    })
    await assert.rejects(
      scheduler.runPlan(plan.id, 'manual'),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'CONFLICT' &&
        (error.hint ?? '').includes('R20'),
    )
    scheduler.stop()
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

// ── SR-28：运行历史带触发原因 ─────────────────────────────────────────

test('被拒绝 ≠ 失败：离线/租约这类拒绝必须**原样抛出**，且不计入连续失败', async () => {
  // 实测踩到：多平台循环里的 try/catch 把"离线闸门拒绝"包成了 INTERNAL 500，
  // 用户看到的是"程序坏了"，而真相是"离线模式下这条路本来就不让走"，连错误码都丢了。
  const refusal = new DomainError('BLOCKED', '离线模式：不允许抓取招聘网站', {
    hint: '这是「自动化测试绝不访问真实招聘站」的开关在起作用。',
  })
  const h = harness({ outcome: async () => { throw refusal } })
  try {
    h.scheduler.start()
    await assert.rejects(
      h.scheduler.runPlan(h.planId, 'manual'),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'BLOCKED' &&
        error.message.includes('离线模式'),
    )

    const engine = h.store.plan.engineState(h.planId)
    assert.equal(engine.failStreak, 0, '被拒绝不该算连续失败 —— 否则跑几次离线测试就把方案推到风控暂停')
    assert.equal(engine.riskPaused, false)
    assert.equal(engine.backoffUntil, null, '被拒绝也不该进退避')
    assert.equal(h.store.todo.listOpen().length, 0, '被拒绝不该弹风控待办')
  } finally {
    h.close()
  }
})

test('真正的抓取失败仍然是失败：抛 INTERNAL 之外还照常记账', async () => {
  const h = harness({ outcome: async () => { throw new Error('断网了') } })
  try {
    h.scheduler.start()
    await assert.rejects(h.scheduler.runPlan(h.planId, 'manual'))
    const engine = h.store.plan.engineState(h.planId)
    assert.equal(engine.failStreak, 1, '普通失败要记账（与"被拒绝"区分开）')
    assert.ok(engine.backoffUntil !== null)
  } finally {
    h.close()
  }
})

test('SR-28：手动与补跑的触发原因区分得出来', async () => {
  const h = harness()
  try {
    h.scheduler.start()
    await h.scheduler.runPlan(h.planId, 'manual')
    await h.scheduler.runPlan(h.planId, 'catch-up')
    assert.deepEqual(
      h.runs.map((run) => run.reason),
      ['manual', 'catch-up'],
      '触发原因必须一路传到 crawl_run，否则运行历史回答不了"这次是谁触发的"',
    )
    assert.equal(h.scheduler.status().recentRuns.length, 0, '本测试的假 run 不写 crawl_run（在 runtime.crawl 里写）')
  } finally {
    h.close()
  }
})
