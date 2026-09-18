import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { createEventBus } from '../../src/host/http/sse.js'
import { platformFacts } from '../../src/host/platform/platform-facts.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createScheduler, type PlatformGateOptions } from '../../src/host/scheduler/index.js'
import type { CrawlSummaryDto } from '../../src/shared/dto.js'
import { createManualTimer } from '../../src/host/scheduler/timer-port.js'
import type { SiteAdapter } from '../../src/host/platform/types.js'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 城市档（city_unsupported）的**接线**：调度器把方案的城市交给门，
 * 门说"不认识" → 该平台带原因跳过、不派抓取。
 *
 * 门的判定本体（registry + citySupportOf）在 runtime 那侧，离线测不到；
 * 这里钉的是调度器侧的三件事：city 传到了门上、skip 原因进了判定记录、
 * 没派 run。
 */

function cityAdapter(id: string, cities: string[]): SiteAdapter {
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
    criteriaDimensions: [
      { key: 'keyword', label: '关键词', values: [], hint: '' },
      {
        key: 'city',
        label: '城市',
        values: cities.map((city) => ({ value: city, label: city })),
        hint: '',
      },
    ],
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

test('decide：方案城市传到门上；不支持的平台带 city_unsupported 跳过、不派抓取', async () => {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(cityAdapter('a', ['深圳']))
  registry.register(cityAdapter('b', ['北京']))
  const timer = createManualTimer()

  // 可变钟：跟随测试推进（冻结钟会让"到点"永远不成立）
  let now = new Date(2026, 8, 16, 8, 0)
  const clock = (): string => now.toISOString()

  const plans = createPlanService(store, clock, registry)
  const plan = plans.create({
    name: '城市混合',
    platforms: ['a', 'b'],
    criteria: { city: '深圳' },
    schedule: { windowStartHour: 0, windowEndHour: 24, weekdays: [], jitterMs: 0, missedGraceMs: 0 },
  })

  /** 门收到的 options（生产在 runtime 侧；这里记录调度器传了什么）。 */
  const gateCalls: Array<{ platformId: string; city: string | undefined }> = []
  let ranCount = 0

  const scheduler = createScheduler({
    store,
    plans,
    run: async () => {
      ranCount += 1
      return { run: { id: 1 } } as unknown as CrawlSummaryDto
    },
    timer,
    events: createEventBus(),
    canSchedule: () => true,
    readOnlyReason: () => null,
    leaseStatus: () => ({ path: 'x', held: true, pid: 1, heartbeatAt: null, startedAt: null, stale: false }),
    clock,
    platformGate: (platformId: string, options?: PlatformGateOptions) => {
      gateCalls.push({ platformId, city: options?.city })
      // 复刻 runtime 门的城市档：不认识方案城市 → city_unsupported
      if (options?.city !== undefined && options.city !== '' && platformId === 'b') {
        return 'city_unsupported'
      }
      return null
    },
  })

  try {
    scheduler.start()
    // 推进到触发点（窗口内随机选点，必然在未来）
    now = new Date(plans.get(plan.id).nextRunAt ?? 0)
    await scheduler.tick()

    // ① 两个平台的门调用都带上了方案城市
    const callA = gateCalls.find((call) => call.platformId === 'a')
    const callB = gateCalls.find((call) => call.platformId === 'b')
    assert.ok(callA !== undefined && callB !== undefined, '两个平台都要过门')
    assert.equal(callA.city, '深圳', '方案的 city 必须传到门上')
    assert.equal(callB.city, '深圳')

    // ② 只派了支持城市的那个平台
    assert.equal(ranCount, 1, '不支持城市的平台不派抓取（这就是本补丁的全部意义）')

    // ③ 判定记录里 b 是 city_unsupported（界面据此显示"为什么没跑"）
    const status = scheduler.status()
    const planStatus = status.planStatus.find((item) => item.planId === plan.id)
    const decision = planStatus?.platformDecisions.find((item) => item.platformId === 'b')?.decision
    assert.equal(decision?.reason, 'city_unsupported')
  } finally {
    scheduler.stop()
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
