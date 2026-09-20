import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCompanyService } from '../../src/host/domain/companies.js'
import { runCrawl } from '../../src/host/domain/crawl.js'
import { createJobService } from '../../src/host/domain/jobs.js'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createEventBus } from '../../src/host/http/sse.js'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job/index.js'
import { DEFAULT_FIFTYONE_CONFIG } from '../../src/host/platform/adapters/fiftyone-job/config.js'
import { createPlatformLocks } from '../../src/host/platform/locks.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createScheduler } from '../../src/host/scheduler/index.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'
import { fixturePageSource } from '../support/jsdom-page.js'
import { cleanup, fixtureHtmlPath, openTestStore } from '../support/store.js'

const SEARCH_URL = 'https://we.51job.com/pc/search?keyword=Java&jobArea=040000'

/**
 * P3 出口标准的**整链**验证：定时器到点 → 调度器 → 真实 runCrawl → 入库。
 *
 * 这里只把「页面来源」换成离线夹具（自动化测试不许碰真实招聘网站，§14 红线），
 * 其余全是生产代码路径：真 store、真适配器、真互斥、真 crawl_run、真计划书。
 */
test('到点自动跑并入库：定时器 → 调度器 → runCrawl → 岗位落库（P3 出口标准）', async () => {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(createFiftyOneAdapter({ config: DEFAULT_FIFTYONE_CONFIG }))
  const locks = createPlatformLocks()
  const events = createEventBus()
  const timer = createManualTimer()

  // 可控时钟，本地时间分量构造
  let now = new Date(2026, 8, 16, 8, 0)
  const clock = (): string => now.toISOString()

  const jobs = createJobService(store)
  const companies = createCompanyService(store)
  const plans = createPlanService(store, clock, registry)

  const plan = plans.create({
    name: '深圳 Java',
    platforms: ['51job'],
    criteria: { keyword: 'Java', city: '深圳' },
    // 窗口 08:00–10:00：9:00 到点时确实**在窗口内**（用例要的是"到点就真的跑"）
    schedule: { windowStartHour: 8, windowEndHour: 10, weekdays: [], jitterMs: 0, missedGraceMs: 0 },
  })

  const scheduler = createScheduler({
    store,
    plans,
    run: async (input) =>
      await runCrawl(
        {
          store,
          registry,
          locks,
          pageSource: fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL }),
          jobs,
          companies,
          clock,
        },
        { platformId: input.platformId, criteria: input.criteria, planId: input.planId },
      ),
    timer,
    events,
    canSchedule: () => true,
    readOnlyReason: () => null,
    leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
    clock,
  })

  try {
    const seen: string[] = []
    events.subscribe((event) => seen.push(event.type))

    scheduler.start()
    assert.equal(store.job.count(), 0, '启动时不该有数据')
    assert.equal(timer.pending(), 1, '定时器已武装')

    // 时间走到**真实的触发点**（窗口内随机选点，所以不能假设是 9:00 整）
    const trigger = new Date(plans.get(plan.id).nextRunAt ?? 0)
    assert.ok(trigger.getTime() > now.getTime(), '触发点必须在未来')
    assert.ok(trigger.getHours() >= 8 && trigger.getHours() < 10, `触发点 ${trigger.toISOString()} 要落在 8–10 点窗口内`)
    now = trigger
    timer.advance(trigger.getTime() - new Date(2026, 8, 16, 8, 0).getTime())
    // tick 内部是异步的（runCrawl 有 await），等它落地
    for (let attempt = 0; attempt < 50 && store.job.count() === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // ① 真的跑了并且入了库
    assert.equal(store.job.count(), 20, '定时到点应当自动抓取并入库')
    assert.equal(store.company.count() > 0, true)

    // ② 留下 crawl_run，且挂在方案上
    const run = store.crawlRun.latest('51job')
    assert.ok(run !== undefined)
    assert.equal(run.state, 'ok')
    assert.equal(run.inserted, 20)
    assert.equal(run.planId, plan.id)

    // ③ 方案的运行时间被回写，下一轮被推到未来
    const after = plans.get(plan.id)
    assert.ok(after.lastRunAt !== null)
    assert.ok(new Date(after.nextRunAt ?? 0).getTime() > new Date(after.lastRunAt ?? '').getTime())

    // ④ 事件流按 ADR-24 只作提示，但确实发出去了。
    //    注意这里断言的是调度器自己发的事件 —— `crawl.*` 由 runtime.crawl 发布，
    //    本测试直接调 runCrawl 是为了绕开真浏览器，所以看不到那两条。
    assert.ok(seen.includes('schedule.armed'))
    assert.ok(seen.includes('plan.started'))
    assert.ok(seen.includes('plan.finished'))
  } finally {
    scheduler.stop()
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('错过一轮：只生成补跑待办；用户点补跑后同样入库（C9）', async () => {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(createFiftyOneAdapter({ config: DEFAULT_FIFTYONE_CONFIG }))
  const locks = createPlatformLocks()
  const timer = createManualTimer()

  // 现在是 16 日 8:00，方案本该 15 日 7:00 跑
  let now = new Date(2026, 8, 16, 8, 0)
  const clock = (): string => now.toISOString()

  const jobs = createJobService(store)
  const companies = createCompanyService(store)
  const plans = createPlanService(store, clock, registry)

  const plan = plans.create({
    name: '错过测试',
    platforms: ['51job'],
    criteria: { keyword: 'Java', city: '深圳' },
    schedule: { windowStartHour: 7, windowEndHour: 8, weekdays: [], jitterMs: 0, missedGraceMs: 60 * 60 * 1000 },
  })
  store.plan.setRunTimes(plan.id, { lastRunAt: new Date(2026, 8, 15, 7, 0).toISOString() })

  const scheduler = createScheduler({
    store,
    plans,
    run: async (input) =>
      await runCrawl(
        {
          store,
          registry,
          locks,
          pageSource: fixturePageSource({ htmlPath: fixtureHtmlPath(), url: SEARCH_URL }),
          jobs,
          companies,
          clock,
        },
        { platformId: input.platformId, criteria: input.criteria, planId: input.planId },
      ),
    timer,
    events: createEventBus(),
    canSchedule: () => true,
    readOnlyReason: () => null,
    leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
    clock,
  })

  try {
    scheduler.start()

    // ① 启动时**不自动跑**
    assert.equal(store.job.count(), 0, '错过的轮次不能自动猛跑')

    // ② 但有一条待办
    const todos = store.todo.listOpen()
    assert.equal(todos.length, 1)
    assert.equal(todos[0]?.kind, 'catch-up')

    // ③ 用户点补跑 → 真的跑并入库，待办关掉
    const summary = await scheduler.runPlan(plan.id, 'catch-up')
    assert.equal(summary.run.state, 'ok')
    assert.equal(store.job.count(), 20)
    assert.equal(store.todo.listOpen().length, 0)
  } finally {
    scheduler.stop()
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
