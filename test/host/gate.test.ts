/**
 * 每平台前置条件（SR-16）与两个读数（SR-20 冷却 / SR-3 配额）的**直接**单测。
 *
 * ## 为什么这个文件存在
 *
 * 门此前住在 `runtime.ts` 的闭包里，测试只能**复刻**一份
 * （`test/scheduler/city-gate.test.ts` 里那句"复刻 runtime 门的城市档"）。
 * 复刻件测不出"真件改了"，而漂移的表现是「矩阵写着可以、到点却被挡住」——
 * 用户永远看不到的那种不一致。所以这里断言**真实现**，并连判定顺序一起钉住。
 *
 * 全部离线：不碰真实招聘站（门是纯判定，不发任何请求）。
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { DAILY_CRAWL_LIMIT } from '../../src/shared/config/crawl.js'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job.js'
import { createGuopinAdapter } from '../../src/host/platform/adapters/guopin.js'
import { createAdapterRegistry, type AdapterRegistry } from '../../src/host/platform/registry.js'
import { clearPlatformRiskPause, setPlatformRiskPause } from '../../src/host/platform/risk-pause.js'
import { cooldownUntilOf, crawlQuotaOf, createPlatformGate } from '../../src/host/runtime/gate.js'
import type { Store } from '../../src/host/store/store.js'
import { NO_NETWORK_ENV } from '../../src/host/util/offline.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

/** 固定时钟：所有"今天/到点"的断言都相对它算，不用真实时间。 */
const NOW = '2026-09-19T02:00:00.000Z'

/**
 * 离线闸门排在判定顺序的**第一位**，所以外部环境里带着 `DSH_JOB_HUNTER_NO_NETWORK`
 * 会让本文件除"顺序"那条以外的期望全部变成 `offline_gate`。
 * 测试不能依赖调用方的环境：默认显式处于非离线，只有需要验离线那一档时才临时打开。
 */
let savedNoNetwork: string | undefined
before(() => {
  savedNoNetwork = process.env[NO_NETWORK_ENV]
  delete process.env[NO_NETWORK_ENV]
})
after(() => {
  if (savedNoNetwork !== undefined) process.env[NO_NETWORK_ENV] = savedNoNetwork
})

/** 在离线模式下跑一段；无论成败都恢复环境变量（同 test/host/offline.test.ts 的做法）。 */
function offline<T>(fn: () => T): T {
  const before = process.env[NO_NETWORK_ENV]
  process.env[NO_NETWORK_ENV] = '1'
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env[NO_NETWORK_ENV]
    else process.env[NO_NETWORK_ENV] = before
  }
}

/** 一个"什么前置条件都不满足"的干净现场：库 + 注册了两个平台的门 + 固定时钟。 */
function harness(): { store: Store; registry: AdapterRegistry; close: () => void } {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  const registry = createAdapterRegistry()
  registry.register(createFiftyOneAdapter())
  // 国聘的城市表是**空的且封闭**（带城市一律拒绝）—— 城市档的第二个样本
  registry.register(createGuopinAdapter())
  // 与装配点一样：平台实体随适配器注册一起登记（account_state 有指向 platform 的外键）
  for (const adapter of registry.list()) {
    store.platform.ensure({ id: adapter.id, displayName: adapter.displayName }, NOW)
  }
  return {
    store,
    registry,
    close: () => {
      store.close()
      cleanup(dir)
    },
  }
}

/** 门：把 store 接成"当前那一份"，与装配点里的接法一致。 */
function gateOf(registry: AdapterRegistry, storeOf: () => Store | undefined) {
  return createPlatformGate({ storeOf, registry, clock: () => NOW })
}

test('数据层未就绪 → lease_lost（不是 adapter_broken）', () => {
  const { registry, close } = harness()
  try {
    // 数据层没就绪时"平台还没登记"，但那不是"适配器坏了" —— 后者会误导用户去修适配器
    assert.equal(gateOf(registry, () => undefined)('51job'), 'lease_lost')
  } finally {
    close()
  }
})

test('干净的现场 → null（可以跑）', () => {
  const { store, registry, close } = harness()
  try {
    assert.equal(gateOf(registry, () => store)('51job'), null)
  } finally {
    close()
  }
})

test('没注册过的平台 → adapter_broken', () => {
  const { store, registry, close } = harness()
  try {
    assert.equal(gateOf(registry, () => store)('zhipin'), 'adapter_broken')
  } finally {
    close()
  }
})

test('城市档：平台不认识的城市 → city_unsupported；认识 / 没配城市 → 放行', () => {
  const { store, registry, close } = harness()
  try {
    const gate = gateOf(registry, () => store)
    assert.equal(gate('51job', { city: '深圳' }), null, '51job 的码表里有深圳')
    assert.equal(gate('51job', { city: '拉萨' }), 'city_unsupported', '码表外的城市必败，门前就拦')
    assert.equal(gate('51job', {}), null, '方案没配城市 = 不判')
    assert.equal(gate('51job', { city: '' }), null, '空串 = 方案没配城市')
    // 空表 + closed:true 的含义是"一个城市都不给"，与"自由文本"不是一回事
    assert.equal(gate('guopin', { city: '深圳' }), 'city_unsupported')
    assert.equal(gate('guopin', {}), null)
  } finally {
    close()
  }
})

test('健康 broken → adapter_broken', () => {
  const { store, registry, close } = harness()
  try {
    store.platform.setHealth('51job', 'broken', '卡片选择器整页未命中', NOW)
    assert.equal(gateOf(registry, () => store)('51job'), 'adapter_broken')
  } finally {
    close()
  }
})

test('登录态：从没检查过不算未登录（那是个死锁），被登录墙挡过才算', () => {
  const { store, registry, close } = harness()
  try {
    const gate = gateOf(registry, () => store)
    // 全新安装：account_state 是空的
    assert.equal(gate('51job'), null, '没查过 ≠ 没登录（否则定时任务永远不跑）')

    store.account.upsert(
      { platformId: '51job', loggedIn: false, hiddenFromCurrentEmployer: null, hint: '被登录墙挡住' },
      NOW,
    )
    assert.equal(gate('51job'), 'not_logged_in')

    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: null, hint: null },
      NOW,
    )
    assert.equal(gate('51job'), null)
  } finally {
    close()
  }
})

test('冷却：未到点 → backoff；到点 / 脏值 → 放行（不猜）', () => {
  const { store, registry, close } = harness()
  try {
    const gate = gateOf(registry, () => store)
    const write = (value: unknown): void => {
      store.setting.set('cooldown-until', 'platform', '51job', value, NOW)
    }

    write({ until: '2026-09-19T03:00:00.000Z' })
    assert.equal(gate('51job'), 'backoff')
    assert.equal(cooldownUntilOf(store, '51job'), '2026-09-19T03:00:00.000Z', '矩阵读的就是这一格')

    write({ until: '2026-09-19T01:00:00.000Z' })
    assert.equal(gate('51job'), null, '到点即放行')

    // 脏值一律当"没在冷却"，而不是抛出或当成永久冷却
    write(true)
    assert.equal(cooldownUntilOf(store, '51job'), null)
    write({ until: '不是时间' })
    assert.equal(cooldownUntilOf(store, '51job'), null)
    assert.equal(gate('51job'), null)
  } finally {
    close()
  }
})

test('每日配额：自动触发的算，手动的不算，昨天的也不算（SR-3 的例外）', () => {
  const { store, registry, close } = harness()
  try {
    const gate = gateOf(registry, () => store)
    const run = (reason: string, at: string): void => {
      store.crawlRun.start({ platformId: '51job', reason }, at)
    }

    for (let index = 0; index < DAILY_CRAWL_LIMIT - 1; index += 1) run('schedule', NOW)
    assert.deepEqual(crawlQuotaOf(store, '51job', () => NOW), { used: DAILY_CRAWL_LIMIT - 1, limit: DAILY_CRAWL_LIMIT })
    assert.equal(gate('51job'), null, '还差一轮才到上限')

    run('manual', NOW)
    assert.equal(gate('51job'), null, '手动是人在操作，不占自动配额')

    run('schedule', NOW)
    assert.equal(gate('51job'), 'quota_reached')
    assert.deepEqual(
      crawlQuotaOf(store, '51job', () => NOW),
      { used: DAILY_CRAWL_LIMIT, limit: DAILY_CRAWL_LIMIT },
      '手动那一轮不在计数里',
    )

    // 昨天跑满不影响今天
    assert.deepEqual(crawlQuotaOf(store, '51job', () => '2026-09-20T02:00:00.000Z'), { used: 0, limit: DAILY_CRAWL_LIMIT })
    assert.equal(crawlQuotaOf(store, 'zhipin', () => NOW).used, 0, '按平台各算各的')
  } finally {
    close()
  }
})

test('风控暂停 → risk_paused；补跑的既有例外能越过它', () => {
  const { store, registry, close } = harness()
  try {
    const gate = gateOf(registry, () => store)
    setPlatformRiskPause(store, '51job', '测试：命中验证码', NOW)
    assert.equal(gate('51job'), 'risk_paused')
    assert.equal(gate('51job', { ignoreRiskPause: true }), null, '补跑是用户显式点的，按既有例外放行')
    assert.equal(gate('zhaopin'), 'adapter_broken', '只暂停了一个平台，别的不该跟着变')

    clearPlatformRiskPause(store, '51job')
    assert.equal(gate('51job'), null)
  } finally {
    close()
  }
})

test('判定顺序：离线 > 风控暂停 > 适配器健康', () => {
  const { store, registry, close } = harness()
  try {
    const gate = gateOf(registry, () => store)
    store.platform.setHealth('51job', 'broken', '解析失败', NOW)
    setPlatformRiskPause(store, '51job', '命中验证码', NOW)

    // 三者同时成立时，报的必须是"最根本、最不可能自愈"的那一个
    offline(() => {
      assert.equal(gate('51job'), 'offline_gate')
    })
    assert.equal(gate('51job'), 'risk_paused', '风控暂停先于健康（保持迁移前的可见行为）')

    clearPlatformRiskPause(store, '51job')
    assert.equal(gate('51job'), 'adapter_broken')
  } finally {
    close()
  }
})
