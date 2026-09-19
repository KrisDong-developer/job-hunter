import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createEventBus } from '../../src/host/http/sse.js'
import { recordRunFailure, recordRunSuccess } from '../../src/host/platform/health.js'
import { readPlatformRiskPause } from '../../src/host/platform/risk-pause.js'
import {
  backoffMsFor,
  budgetExhausted,
  createScheduler,
  freshnessOf,
  freshThresholdsFor,
  startRoundBudget,
  type PlatformGate,
  type SchedulerRunInput,
} from '../../src/host/scheduler/index.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'
import { ADAPTER_FAIL_THRESHOLD, ROUND_BUDGET_MS } from '../../src/shared/config/crawl.js'
import type { CrawlSummaryDto } from '../../src/shared/contract/dto/crawl.js'
import type { PlanSchedule } from '../../src/shared/contract/dto/plan.js'
import type { CrawlState } from '../../src/shared/contract/enums/crawl.js'
import type { CrawlFailureCode } from '../../src/shared/contract/enums/error.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 调度语义的**行为测试**（SR-3/7/8/17/18/20/21/22/23/26/30）。
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

function summaryOf(state: CrawlState, errorCode: CrawlFailureCode | null = null): CrawlSummaryDto {
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
  outcome?: (platformId: string) => Promise<CrawlSummaryDto>
  gate?: PlatformGate
  lastAttemptAt?: string
  lastSuccessAt?: string
  platforms?: string[]
  /** 每平台覆盖项（批次 3）：用来验证"停用的平台真的不跑"。 */
  platformOverrides?: Record<string, { enabled?: boolean; maxPages?: number | null }>
  /**
   * 自定义时钟（SR-46）：默认从固定的 00:30 起。
   *
   * 需要它是因为"单轮预算"是一段**真实流逝的时间** —— 用固定时钟无法制造
   * "第一个平台跑完之后预算用尽"这个时刻，而那正是要被钉住的行为。
   */
  time?: ReturnType<typeof makeClock>
}

/**
 * 测试用的**平台门**替身，镜像调度器对 `PlatformGate` 契约的实际依赖。
 *
 * 只做两件真实世界里最重要的事：平台被风控暂停就拦住、适配器坏了就拦住。
 * 其余前置条件（登录态/配额/离线闸门）不在这个测试关心范围内 ——
 * 需要时由用例自己传 `gate` 覆盖（如 SR-17/18 那样）。
 */
function defaultGate(store: ReturnType<typeof openTestStore>): PlatformGate {
  return (platformId, options) => {
    if (options?.ignoreRiskPause !== true && readPlatformRiskPause(store, platformId).paused) {
      return 'risk_paused'
    }
    if ((store.platform.get(platformId)?.health ?? 'healthy') === 'broken') return 'adapter_broken'
    return null
  }
}

function harness(options: Options = {}) {
  const store = openTestStore()
  const time = options.time ?? makeClock(new Date(2026, 8, 16, 0, 30)) // 周三 00:30，窗口之外
  const plans = createPlanService(store, time.clock)
  const timer = createManualTimer()
  const runs: SchedulerRunInput[] = []

  const plan = plans.create({
    name: '语义测试',
    platforms: options.platforms ?? ['51job'],
    ...(options.platformOverrides === undefined
      ? {}
      : { platformOverrides: options.platformOverrides }),
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
  // 生产里 `runtime` 启动时会把注册表里的每个平台 `ensure` 进 platform 表；
  // 测试里没有注册表，就按方案用到的平台补上 —— 否则平台级的账
  // （`fail_streak` / `health`）无处可落，SR-20/21/22 的断言会变成空转。
  for (const platformId of options.platforms ?? ['51job']) {
    store.platform.ensure({ id: platformId, displayName: platformId }, time.clock())
  }

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
    /**
     * 抓取替身。
     *
     * 它**同时承担记账职责** —— 与生产里 `crawl.ts` 的 `recordRunFailure` /
     * `recordRunSuccess` 一致。不这么做的话，`platform.fail_streak` 永远是 0，
     * 而调度器现在正是按"平台自己的账"来定冷却档次与风控的（SR-20/21/22）。
     */
    run: async (input) => {
      runs.push(input)
      const summary = options.outcome === undefined ? summaryOf('ok') : await options.outcome(input.platformId)
      if (summary.run.state === 'failed') {
        recordRunFailure(store, input.platformId, summary.run.errorCode ?? 'UNKNOWN', '测试构造的失败', {
          threshold: ADAPTER_FAIL_THRESHOLD,
          now: time.clock(),
        })
      } else {
        recordRunSuccess(store, input.platformId, time.clock())
      }
      return summary
    },
    timer,
    events: createEventBus(),
    canSchedule: () => true,
    readOnlyReason: () => null,
    leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
    platformGate: options.gate ?? defaultGate(store),
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

test('SR-18：一个平台被挡住时其它平台照常跑（判定是**每平台**的）', async () => {
  const h = harness({
    platforms: ['51job', 'other'],
    gate: (platformId) => (platformId === '51job' ? 'not_logged_in' : null),
  })
  try {
    h.scheduler.start()
    await fireDue(h)
    assert.deepEqual(
      h.runs.map((run) => run.platformId),
      ['other'],
      '被挡住的平台不跑，同一方案里的其它平台照常跑 —— 不再连坐整条方案',
    )
    const planStatus = h.scheduler.status().planStatus[0]
    assert.equal(planStatus?.lastDecision?.decision, 'ran', '还有平台能跑，方案就不算被跳过')
    const byPlatform = new Map(
      (planStatus?.platformDecisions ?? []).map((item) => [item.platformId, item.decision]),
    )
    assert.equal(byPlatform.get('51job')?.reason, 'not_logged_in', '被挡住的平台要如实说明原因')
    assert.equal(byPlatform.get('other')?.decision, 'ran')
  } finally {
    h.close()
  }
})

test('批次 3：被停用的平台**真的不跑**（不是"定时不跑、手动照跑"）', async () => {
  const h = harness({
    platforms: ['51job', 'other'],
    platformOverrides: { other: { enabled: false } },
  })
  try {
    h.scheduler.start()
    await fireDue(h)
    assert.deepEqual(h.runs.map((run) => run.platformId), ['51job'], '停用的平台不该被跑')

    const planStatus = h.scheduler.status().planStatus[0]
    assert.deepEqual(
      planStatus?.platformDecisions.map((item) => item.platformId),
      ['51job'],
      '停用的平台连"判定"都不该出现 —— 它没有"为什么没跑"可言（是用户让它别跑的）',
    )

    // 手动跑同样不跑它：否则"停用"就成了一句空话
    h.runs.length = 0
    await h.scheduler.runPlan(h.planId, 'manual')
    assert.deepEqual(h.runs.map((run) => run.platformId), ['51job'], '手动也不能把它偷偷跑起来')
  } finally {
    h.close()
  }
})

test('批次 3：每平台的页数覆盖进到**该平台**的抓取条件里，不污染别的平台', async () => {
  const h = harness({
    platforms: ['51job', 'other'],
    platformOverrides: { other: { maxPages: 2 } },
  })
  try {
    h.scheduler.start()
    await fireDue(h)
    const byPlatform = new Map(h.runs.map((run) => [run.platformId, run.criteria]))
    assert.equal(byPlatform.get('other')?.['maxPages'], '2', '该平台的覆盖要生效')
    assert.equal(
      byPlatform.get('51job')?.['maxPages'],
      undefined,
      '另一个平台不该被带上别人的覆盖 —— 这正是"每平台覆盖"与"方案级"的区别',
    )
  } finally {
    h.close()
  }
})

test('批次 5：最久没成功过的平台先跑（否则窗口有限时尾部平台永远轮不到）', async () => {
  const h = harness({ platforms: ['51job', 'other'] })
  try {
    // 让 51job"刚刚成功过"，而 'other' 从没成功过 → 'other' 应当排到前面。
    // 固定按数组顺序跑的话，数组靠后的平台在窗口/预算有限时会**系统性**跑不到，
    // 而用户在数据里只会看到"这个平台没跑过"，看不出是顺序造成的。
    h.store.platform.recordSuccess('51job', '2026-09-16T00:00:00.000Z')
    h.scheduler.start()
    await fireDue(h)
    assert.deepEqual(h.runs.map((run) => run.platformId), ['other', '51job'])
  } finally {
    h.close()
  }
})

test('批次 5：都没成功过时保持方案里的原顺序（排序不改变可预期的行为）', async () => {
  const h = harness({ platforms: ['51job', 'other'] })
  try {
    h.scheduler.start()
    await fireDue(h)
    assert.deepEqual(
      h.runs.map((run) => run.platformId),
      ['51job', 'other'],
      '并列时 `sort` 稳定 —— 用户改了平台顺序仍能预期第一轮怎么跑',
    )
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

// ── SR-46：单轮预算与到点中止 ─────────────────────────────────────────

test('SR-46：预算边界 —— 到点那一刻算用尽（不差一个毫秒）', () => {
  const budget = startRoundBudget(1000, 60_000)
  assert.equal(budget.deadlineAtMs, 61_000)
  assert.equal(budgetExhausted(budget, 60_999), false)
  assert.equal(budgetExhausted(budget, 61_000), true, '到点即用尽 —— 不能"再挤一个平台"')
  assert.equal(budgetExhausted(budget, 61_001), true)
  // 0 预算 = 立刻到点
  assert.equal(budgetExhausted(startRoundBudget(1000, 0), 1000), true)
})

test('SR-46：预算用尽后剩下的平台**不跑**，且如实报 round_budget（不是"跑过了"）', async () => {
  const time = makeClock(new Date(2026, 8, 16, 0, 30))
  const h = harness({
    platforms: ['51job', 'other', 'third'],
    time,
    outcome: async (platformId) => {
      // 第一个平台跑完之后，时间直接跨过本轮预算 —— 这正是"跑着跑着到点了"
      if (platformId === '51job') time.set(new Date(time.get().getTime() + ROUND_BUDGET_MS + 60_000))
      return summaryOf('ok')
    },
  })
  try {
    h.scheduler.start()
    await fireDue(h)

    assert.deepEqual(
      h.runs.map((run) => run.platformId),
      ['51job'],
      '到点之后一个平台都不该再开始 —— 预算的意义就在这里',
    )

    const planStatus = h.scheduler.status().planStatus[0]
    assert.equal(planStatus?.lastDecision?.decision, 'ran', '方案整体跑过了，不是"被跳过"')
    const byPlatform = new Map(
      (planStatus?.platformDecisions ?? []).map((item) => [item.platformId, item.decision]),
    )
    assert.equal(byPlatform.get('51job')?.decision, 'ran')
    for (const id of ['other', 'third']) {
      const decision = byPlatform.get(id)
      assert.equal(decision?.decision, 'skipped', `${id} 没跑，就必须显示成 skipped`)
      assert.equal(decision?.reason, 'round_budget', `${id} 的原因是**本轮**预算，不是它自己有问题`)
      assert.ok((decision?.message ?? '').includes('时限'), '界面要给人话，不是枚举键')
    }
  } finally {
    h.close()
  }
})

test('SR-46：没到点时所有平台照常跑（预算不能剪掉正常的一轮）', async () => {
  const h = harness({ platforms: ['51job', 'other', 'third'] })
  try {
    h.scheduler.start()
    await fireDue(h)
    assert.deepEqual(
      h.runs.map((run) => run.platformId),
      ['51job', 'other', 'third'],
      '预算是保险丝，不是节流阀 —— 正常一轮必须跑完',
    )
    const decisions = h.scheduler.status().planStatus[0]?.platformDecisions ?? []
    assert.equal(
      decisions.some((item) => item.decision?.reason === 'round_budget'),
      false,
      '没有任何平台该被误伤',
    )
  } finally {
    h.close()
  }
})

test('SR-46：每个平台拿到的是**同一个**绝对到点时刻', async () => {
  const h = harness({ platforms: ['51job', 'other'] })
  try {
    h.scheduler.start()
    const nextRunAt = h.plans.get(h.planId).nextRunAt
    assert.ok(nextRunAt !== null)
    await fireDue(h)

    const expected = new Date(new Date(nextRunAt).getTime() + ROUND_BUDGET_MS).toISOString()
    assert.deepEqual(
      h.runs.map((run) => run.deadlineAt),
      [expected, expected],
      '传的是绝对时刻且全轮一致 —— 传"剩余量"的话第二个平台会重新拿到一份预算，等于没有预算',
    )
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

// ── SR-21/22：风控暂停（平台级）与人工恢复 ────────────────────────────

test('SR-21：连续失败达阈值 → **平台**失效 + urgent 待办，且不再自动尝试', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'NAVIGATION_FAILED') })
  try {
    h.scheduler.start()

    // 手动跑三次（手动也计数），把**平台自己的** fail_streak 推过阈值
    for (let attempt = 0; attempt < ADAPTER_FAIL_THRESHOLD; attempt += 1) {
      await h.scheduler.runPlan(h.planId, 'manual')
    }

    // 「连续失败」的落点是**平台级**的：`crawl.ts` 已经把它记成 health=broken。
    // 调度器不再在方案级叠一份 `risk_paused` —— 那会对同一个事件产生两条 urgent
    // 待办、两个重叠的跳过状态。风控暂停只留给风控信号（见下一条）。
    const platform = h.store.platform.get('51job')
    assert.equal(platform?.failStreak, ADAPTER_FAIL_THRESHOLD, '连续失败记在**平台**的账上')
    assert.equal(platform?.health, 'broken', `连续 ${String(ADAPTER_FAIL_THRESHOLD)} 次失败 → 平台失效`)

    const broken = h.store.todo.listOpen().find((todo) => todo.kind === 'adapter-broken')
    assert.ok(broken !== undefined, 'SR-21/24：失效必须主动产生待办')
    assert.equal(broken.level, 'urgent')

    // 平台失效后定时不再尝试（门会以 adapter_broken 拦住）
    const before = h.runs.length
    await fireDue(h)
    assert.equal(h.runs.length, before, '平台失效后定时不该再试')
    assert.equal(h.scheduler.status().planStatus[0]?.lastDecision?.reason, 'adapter_broken')
  } finally {
    h.close()
  }
})

test('SR-22：风控信号（验证码/限流）**一次就暂停**，且暂停落在**平台**上', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'BLOCKED') })
  try {
    h.scheduler.start()
    await h.scheduler.runPlan(h.planId, 'manual')

    const pause = readPlatformRiskPause(h.store, '51job')
    assert.equal(pause.paused, true, '风控信号是"被认出来了"，不该再试两次去确认')
    assert.ok((pause.reason ?? '').includes('风控'))
    // 方案级是**派生**的：该方案下所有平台都被暂停才为真
    assert.equal(h.scheduler.status().planStatus[0]?.riskPaused, true)

    // 暂停之后定时不再尝试
    const before = h.runs.length
    await fireDue(h)
    assert.equal(h.runs.length, before, '风控暂停后定时不该再试')
    assert.equal(h.scheduler.status().planStatus[0]?.lastDecision?.reason, 'risk_paused')
  } finally {
    h.close()
  }
})

test('SR-22：甲平台命中风控、乙平台成功时，风控信号不被"最后一个成功的平台"吞掉', async () => {
  const h = harness({
    platforms: ['risky', 'healthy'],
    gate: () => null,
    outcome: async (platformId) =>
      platformId === 'risky' ? summaryOf('failed', 'BLOCKED') : summaryOf('ok'),
  })
  try {
    h.scheduler.start()
    await fireDue(h)

    assert.deepEqual(h.runs.map((run) => run.platformId), ['risky', 'healthy'])
    // 旧实现取的是循环里"最后一个成功平台"的 errorCode，于是 BLOCKED 被丢掉、只退避了事
    assert.equal(
      readPlatformRiskPause(h.store, 'risky').paused,
      true,
      '风控信号必须落在**命中它的那个平台**上',
    )
    assert.equal(
      readPlatformRiskPause(h.store, 'healthy').paused,
      false,
      '另一个平台不该跟着被暂停（SR-18）',
    )
    // 有平台成功 → 这一轮算成功；否则界面会把刚抓到数据的方案报成"数据陈旧"
    assert.ok(h.plans.get(h.planId).lastSuccessAt !== null, '有平台成功就该推进 last_success_at')
    assert.equal(
      h.scheduler.status().planStatus[0]?.riskPaused,
      false,
      '只暂停了一个平台，方案级派生值不该为真',
    )
  } finally {
    h.close()
  }
})

test('SR-21：恢复只能由人工确认，确认后立刻能再排程', async () => {
  const h = harness({ outcome: async () => summaryOf('failed', 'BLOCKED') })
  try {
    h.scheduler.start()
    await h.scheduler.runPlan(h.planId, 'manual')
    assert.equal(readPlatformRiskPause(h.store, '51job').paused, true)

    // 暂停期间**手动也不许跑** —— 否则"暂停"就是空话，用户点一下就又去打风控
    await assert.rejects(
      h.scheduler.runPlan(h.planId, 'manual'),
      (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT',
    )

    h.scheduler.resumeRisk(h.planId)
    assert.equal(readPlatformRiskPause(h.store, '51job').paused, false, '恢复要**按平台**清')
    assert.equal(
      h.store.platform.get('51job')?.health,
      'healthy',
      '不清平台健康态的话，门会立刻再关上、恢复看起来像没生效',
    )
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
