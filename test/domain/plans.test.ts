import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { criteriaDimensionsFor } from '../../src/host/domain/plan-config.js'
import { DEFAULT_SCHEDULE, normalizeSchedule } from '../../src/host/store/repo/plans.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job.js'
import { createGuopinAdapter } from '../../src/host/platform/adapters/guopin.js'
import { createHiredChinaAdapter } from '../../src/host/platform/adapters/hiredchina.js'
import { createIndeedAdapter } from '../../src/host/platform/adapters/indeed.js'
import { createLagouAdapter } from '../../src/host/platform/adapters/lagou.js'
import { createWaiqiAdapter } from '../../src/host/platform/adapters/waiqi-job.js'
import { createZhipinAdapter } from '../../src/host/platform/adapters/zhipin.js'
import type { SiteAdapter } from '../../src/host/platform/types.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

test('定时配置会被收敛到合法范围（坏配置＝静默不跑，必须拦住）', () => {
  const normalized = normalizeSchedule({
    windowStartHour: 99,
    windowEndHour: -3,
    weekdays: [1, 1, 7, 3.5, 5],
    jitterMs: -1,
    missedGraceMs: 99 * 24 * 60 * 60 * 1000,
  })
  assert.equal(normalized.windowStartHour, 23)
  assert.equal(normalized.windowEndHour, 0)
  assert.deepEqual(normalized.weekdays, [1, 5], '去重、去非法、排序')
  assert.equal(normalized.jitterMs, 0)
  assert.equal(normalized.missedGraceMs, 7 * 24 * 60 * 60 * 1000)
})

test('零长度窗口会被纠正成一小时 —— 否则就是"永远不跑"而用户不会知道', () => {
  const normalized = normalizeSchedule({ windowStartHour: 9, windowStartMinute: 0, windowEndHour: 9, windowEndMinute: 0 })
  assert.equal(normalized.windowEndHour, 10)
  assert.equal(normalized.windowEndMinute, 0)
})

test('旧形状（只有 hour/minute）被翻译成等价的 1 小时窗口，不静默改用户的行为', () => {
  // 这是升级路径上的关键一条：直接丢掉 hour，用户从 7 点跑到 9 点，而他不会发现
  const normalized = normalizeSchedule({ hour: 7, minute: 15 })
  assert.equal(normalized.windowStartHour, 7)
  assert.equal(normalized.windowStartMinute, 15)
  assert.equal(normalized.windowEndHour, 8)
  assert.equal(normalized.windowEndMinute, 15)
})

test('缺省时用默认值补齐', () => {
  const normalized = normalizeSchedule(undefined)
  assert.deepEqual(normalized, DEFAULT_SCHEDULE)
  const partial = normalizeSchedule({ windowStartHour: 6 })
  assert.equal(partial.windowStartHour, 6)
  assert.equal(partial.windowEndHour, DEFAULT_SCHEDULE.windowEndHour)
  assert.deepEqual(partial.weekdays, DEFAULT_SCHEDULE.weekdays)
  // SR-32：配置里**没有**单点时刻这两个字段
  assert.equal('hour' in normalized, false)
  assert.equal('minute' in normalized, false)
})

test('方案 CRUD', () => {
  const store = openTestStore()
  try {
    const plans = createPlanService(store, () => '2026-09-16T01:00:00.000Z')

    const created = plans.create({
      name: '深圳 Java',
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳' },
      schedule: { windowStartHour: 9, windowEndHour: 11 },
    })
    assert.equal(created.name, '深圳 Java')
    assert.deepEqual(created.platforms, ['51job'])
    assert.equal(created.schedule.windowStartHour, 9)
    assert.equal(created.enabled, true)
    assert.equal(created.timezone.length > 0, true, 'SR-5：写入时记下时区快照')
    assert.deepEqual(created.postProcess, { score: true, flag: true, dedup: true }, 'SR-44：默认全开')

    const updated = plans.update(created.id, { name: '改名了', enabled: false })
    assert.equal(updated.name, '改名了')
    assert.equal(updated.enabled, false)
    assert.deepEqual(updated.criteria, { keyword: 'Java', city: '深圳' }, '没给的字段要保留')
    assert.equal(updated.schedule.windowStartHour, 9, '定时配置也要保留')

    assert.equal(plans.list().length, 1)
    assert.equal(plans.remove(created.id), true)
    assert.equal(plans.list().length, 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('非法输入要报错而不是写进去', () => {
  const store = openTestStore()
  try {
    const plans = createPlanService(store)
    assert.throws(
      () => plans.create({ name: '  ', platforms: ['51job'] }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
    assert.throws(
      () => plans.create({ name: '没有平台', platforms: [] }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
    assert.throws(
      () => plans.get(999),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
    assert.equal(store.plan.count(), 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('ensureDefault 只在完全没有方案时建一条', () => {
  const store = openTestStore()
  try {
    const plans = createPlanService(store, () => '2026-09-16T01:00:00.000Z')
    const first = plans.ensureDefault()
    assert.ok(first !== null)
    assert.deepEqual(first.platforms, ['51job'])
    assert.equal(first.criteria['city'], '深圳')

    const second = plans.ensureDefault()
    assert.equal(second, null, '已有方案就不再建')
    assert.equal(store.plan.count(), 1)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

// ── SR-39/41/42/43/45：配置面校验（三条入口共用同一份）───────────────

function withRegistry(options: { waiqi?: boolean } = {}) {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(createFiftyOneAdapter())
  // 神仙外企：用来验证"平台特有维度"的完整链路（声明 → 校验 → 进 platform 命名空间 → 适配器读得到）。
  if (options.waiqi === true) registry.register(createWaiqiAdapter())
  return { store, registry, plans: createPlanService(store, undefined, registry) }
}

test('SR-41/42：平台特有维度（工作经验/学历/职位范围）走 `platform` 命名空间，不污染 extra', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    // 神仙外企声明了这三个维度，域内取值必须通过。
    const plan = plans.create({
      name: '外企 · 本科 · 3-5 年',
      platforms: ['waiqi'],
      criteria: { keyword: 'Java', city: '深圳', workExp: '3', education: '2', type: '1' },
    })
    assert.equal(plan.criteria['workExp'], '3')
    assert.equal(plan.criteria['education'], '2')
    assert.equal(plan.criteria['type'], '1')

    // 域外的值照旧被拒（声明了取值域就只接受域内的值）。
    assert.throws(
      () => plans.create({ name: '怪经验', platforms: ['waiqi'], criteria: { workExp: '99' } }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )

    // 51job 没声明 `workExp` → 显式报错，而不是静默当成自由参数拼进 URL。
    assert.throws(
      () => plans.create({ name: '51job 塞外企条件', platforms: ['51job'], criteria: { workExp: '3' } }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('SR-39：选到未注册的平台要报可读错，不空跑', () => {
  const { store, plans } = withRegistry()
  try {
    assert.throws(
      () => plans.create({ name: '不存在的平台', platforms: ['boss'], criteria: { keyword: 'Java' } }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('boss') &&
        (error.hint ?? '').includes('51job'),
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('SR-42：未知筛选键**显式报错**，不静默丢掉', () => {
  const { store, plans } = withRegistry()
  try {
    assert.throws(
      () => plans.create({ name: '怪条件', platforms: ['51job'], criteria: { salary: '20K' } }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('salary'),
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('SR-41：取值域外的值被拒绝，域内的通过', () => {
  const { store, plans } = withRegistry()
  try {
    assert.throws(
      () => plans.create({ name: '怪排序', platforms: ['51job'], criteria: { sort: '9' } }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
    // 排序取值域实测（2026-09）：51job 无「2」这个取值，改用「3」= 薪资优先（合法值）。
    const ok = plans.create({
      name: '正常',
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳', sort: '3', postedWithinDays: '3', maxPages: '2' },
    })
    assert.equal(ok.criteria['sort'], '3')
    assert.equal(ok.criteria['maxPages'], '2')

    // SR-40/41：页数上限受适配器声明约束
    assert.throws(
      () => plans.create({ name: '页数越界', platforms: ['51job'], criteria: { maxPages: '99' } }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('SR-43：重复方案**提示但不合并**，两个方案都能存下来', () => {
  const { store, plans } = withRegistry()
  try {
    plans.create({ name: '甲', platforms: ['51job'], criteria: { keyword: 'Java', city: '深圳' } })
    const checked = plans.validate({
      name: '乙',
      platforms: ['51job'],
      criteria: { city: '深圳', keyword: 'Java' }, // 键顺序不同，仍应识别为重复
    })
    assert.equal(checked.duplicates.length, 1)
    assert.equal(checked.duplicates[0]?.name, '甲')

    const created = plans.create({ name: '乙', platforms: ['51job'], criteria: { keyword: 'Java', city: '深圳' } })
    assert.ok(created.id > 0)
    assert.equal(plans.list().length, 2, '只提示，绝不自动合并')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('SR-41：不支持声明的维度返回 supported=false 并说明原因（界面禁用而非隐藏）', () => {
  const { store, plans } = withRegistry()
  try {
    const dimensions = plans.dimensions(['51job'])
    const declared = dimensions.find((item) => item.key === 'keyword')
    assert.equal(declared?.supported, true)
    // 未选平台 → 所有维度都不支持，且给得出原因
    const none = plans.dimensions([])
    assert.equal(none.every((item) => !item.supported), true)
    assert.equal(none[0]?.disabledReason !== null, true)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

// ── 多平台提示（notice）：只提示、不阻断 ────────────────────────────────
//
// 它们针对的是同一类失败：**平台安静地返回 0 条**。从数据里查不出来
// （0 条与 0 条长得一样），报错又太严（用户没法同时选能力不同的平台），
// 所以只能"提示但不阻断"——而提示必须真的出现，否则等于没有。

/** 注册一批**真实**适配器（用工厂，不用假对象）。 */
function withPlatforms(...factories: Array<() => SiteAdapter>) {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  for (const factory of factories) registry.register(factory())
  return { store, registry, plans: createPlanService(store, undefined, registry) }
}

function citiesOf(adapter: SiteAdapter): string[] {
  const dimension = adapter.criteriaDimensions.find((item) => item.key === 'city')
  return dimension?.values.map((item) => item.value) ?? []
}

test('提示：选到还没校准/已停用的平台时要说清楚，而不是让你白跑一轮', () => {
  const platforms = ['51job', 'lagou', 'indeed']
  const { store, plans } = withPlatforms(createFiftyOneAdapter, createLagouAdapter, createIndeedAdapter)
  try {
    const checked = plans.validate({
      name: '多平台',
      platforms,
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.ok(
      checked.notices.some((note) => note.includes('lagou') && note.includes('实验')),
      `应当提示 lagou 是实验性平台：${checked.notices.join(' | ')}`,
    )
    assert.ok(
      checked.notices.some((note) => note.includes('indeed') && note.includes('停用')),
      `应当提示 indeed 已停用：${checked.notices.join(' | ')}`,
    )
    // **提示 ≠ 拒绝**：方案照样建得出来
    assert.ok(plans.create({ name: '多平台', platforms, criteria: { keyword: 'Java', city: '深圳' } }).id > 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('提示：城市不被某个选中平台支持时要说清楚', () => {
  const oneCities = citiesOf(createFiftyOneAdapter())
  const waiqiCities = citiesOf(createWaiqiAdapter())
  // 找"一边支持、另一边不支持"的城市 —— 这正是不一致会伤人的场景。
  // 两个方向都试，免得把用例绑死在某一版城市表上。
  const cityInOneOnly = oneCities.find((city) => !waiqiCities.includes(city))
  const cityInWaiqiOnly = waiqiCities.find((city) => !oneCities.includes(city))
  const city = cityInOneOnly ?? cityInWaiqiOnly
  assert.ok(city !== undefined, '两个平台的城市表完全互相覆盖 —— 这条用例失去了测试对象，请换一对平台')
  const platforms = cityInOneOnly === undefined ? ['waiqi', '51job'] : ['51job', 'waiqi']
  const missingId = cityInOneOnly === undefined ? '51job' : 'waiqi'

  const { store, plans } = withPlatforms(createFiftyOneAdapter, createWaiqiAdapter)
  try {
    const checked = plans.validate({ name: '城市不一致', platforms, criteria: { keyword: 'Java', city } })
    assert.ok(
      checked.notices.some((note) => note.includes(city) && note.includes(missingId)),
      `应当提示「${missingId} 不认识 ${city}」：${checked.notices.join(' | ')}`,
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('提示：抓取页数被平台上限截断时要说清楚（不能让你以为抓了 5 页）', () => {
  // 51job 排在前 → 校验按它的上限放行；而 waiqi 只有 1 页（服务端翻页坏，是平台事实）
  const { store, plans } = withPlatforms(createFiftyOneAdapter, createWaiqiAdapter)
  try {
    const checked = plans.validate({
      name: '深度不一致',
      platforms: ['51job', 'waiqi'],
      criteria: { keyword: 'Java', city: '深圳', maxPages: '5' },
    })
    assert.ok(
      checked.notices.some((note) => note.includes('waiqi') && note.includes('页')),
      `应当提示 waiqi 的深度被截断：${checked.notices.join(' | ')}`,
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('批次 3：取值域按**已选平台的并集**判 —— 只要有平台接受就放行，一个都不接受才拦', () => {
  // 这条修的是两个真实缺陷（同一个成因：取值域只看了**第一个**平台，且把"空表"
  // 一律当成自由文本）：
  //   1. guopin / hiredchina 的城市表是空的，而空表的含义是"带城市一律拒绝"。
  //      旧行为下它们**不报错也不提示** —— 用户存得下，然后每次抓取那个平台整轮失败；
  //   2. 51job + zhipin 时，zhipin 支持的「东莞」既选不到也**存不进**（被 51job 的表拦下）。
  const { store, plans } = withPlatforms(createFiftyOneAdapter, createZhipinAdapter, createGuopinAdapter)
  try {
    // ① 并集里的取值：zhipin 有、51job 没有 —— 必须放行
    const merged = plans.validate({
      name: '并集取值',
      platforms: ['51job', 'zhipin'],
      criteria: { keyword: 'Java', city: '东莞' },
    })
    assert.equal(merged.criteria['city'], '东莞', 'zhipin 支持的取值不该被 51job 的表拦下')

    // ② 有平台接受、另一个不接受 → **放行 + 提示**（提示要说清是谁不接受）
    const partial = plans.validate({
      name: '部分平台不支持',
      platforms: ['51job', 'zhipin'],
      criteria: { keyword: 'Java', city: '厦门' }, // 厦门：zhipin 有、51job 没有
    })
    assert.equal(partial.criteria['city'], '厦门')
    assert.ok(
      partial.notices.some((note) => note.includes('51job') && note.includes('厦门') && note.includes('zhipin')),
      `应当提示 51job 不接受厦门、并指出 zhipin 支持它：${partial.notices.join(' | ')}`,
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('批次 3：城市表为空的平台带城市 → 硬拒（空表 ≠ 自由文本，是"一个都别给"）', () => {
  // guopin / hiredchina 的城市表是**空**的，而空表的含义是"带城市一律拒绝"。
  // 旧行为下它们既不报错也不提示 —— 用户存得下，然后每次抓取那个平台整轮失败
  // （而用户会以为"国聘今天没有岗位"）。这种"一定跑不出结果"的配置必须当场拦住。
  const { store, plans } = withPlatforms(createGuopinAdapter, createHiredChinaAdapter)
  try {
    for (const platformId of ['guopin', 'hiredchina']) {
      assert.throws(
        () =>
          plans.validate({
            name: `空城市码-${platformId}`,
            platforms: [platformId],
            criteria: { keyword: 'Java', city: '深圳' },
          }),
        (error: unknown) => {
          assert.ok(error instanceof DomainError && error.code === 'INVALID_INPUT')
          assert.ok(
            (error.hint ?? '').includes('取值表'),
            `空表要给出"它没有城市码"这个真正的原因：${error.hint ?? ''}`,
          )
          return true
        },
        `${platformId} 带城市必须被拦下`,
      )
      // 不带城市照样能存 —— 拦的是"一定跑不出结果"，不是这个平台本身
      assert.ok(
        plans.create({
          name: `无城市-${platformId}`,
          platforms: [platformId],
          criteria: { keyword: 'Java' },
        }).id > 0,
      )
    }
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('批次 3：自由文本城市（拉勾原样收中文名）**不该**被拦也不该被提示', () => {
  // 反向的坑：lagou 的 city 是自由文本，表里的 20 个只是建议。
  // 旧行为会为「珠海」报一条**假的**警告（甚至硬拒）—— 误报比不报更伤。
  const { store, plans } = withPlatforms(createLagouAdapter, createIndeedAdapter)
  try {
    const checked = plans.validate({
      name: '自由文本城市',
      platforms: ['lagou', 'indeed'],
      criteria: { keyword: 'Java', city: '珠海' },
    })
    assert.equal(checked.criteria['city'], '珠海', '自由文本平台应当原样接受')
    assert.equal(
      checked.notices.some((note) => note.includes('城市')),
      false,
      `自由文本城市不该产生任何城市提示：${checked.notices.join(' | ')}`,
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('批次 3：「深圳市」按目录归一成「深圳」，并且**说出来**（不能悄悄改写）', () => {
  const { store, plans } = withPlatforms(createFiftyOneAdapter, createWaiqiAdapter)
  try {
    const checked = plans.validate({
      name: '写法不一致',
      platforms: ['51job', 'waiqi'],
      criteria: { keyword: 'Java', city: '深圳市' },
    })
    assert.equal(checked.criteria['city'], '深圳', '各平台码表的键都不带「市」')
    assert.ok(
      checked.notices.some((note) => note.includes('「深圳市」') && note.includes('「深圳」')),
      `改写必须告诉用户：${checked.notices.join(' | ')}`,
    )

    // 原样就能用的写法**绝不**改写（把用户写对的东西改掉是另一种意外）
    const untouched = plans.validate({
      name: '原样可用',
      platforms: ['51job', 'waiqi'],
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.equal(untouched.criteria['city'], '深圳')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('批次 3：城市取值域取**并集**（多平台时选得到只有某个平台支持的城市）', () => {
  const { store, registry } = withPlatforms(createFiftyOneAdapter, createZhipinAdapter)
  try {
    const items = criteriaDimensionsFor(registry, ['51job', 'zhipin'])
    const city = items.find((item) => item.key === 'city')
    assert.ok(city !== undefined)
    const values = city.values.map((item) => item.value)
    // 「东莞」在 zhipin 表里、不在 51job 表里 —— 旧实现只给**第一个**声明 city 的平台那张表，
    // 于是用户根本选不到它。
    assert.ok(values.includes('东莞'), `并集里应当有 zhipin 的东莞：${values.join('、')}`)
    assert.ok(values.length >= citiesOf(createZhipinAdapter()).length, '至少不小于单个平台的表')
    // 顺序按城市目录（不是平台顺序）：北京在最前，且与另一个平台无关
    assert.equal(values[0], '北京')
    assert.ok(city.hint.includes('并集'), `提示要说清这是并集：${city.hint}`)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('提示不是噪音：单平台、城市支持、深度在限内的方案不该有任何提示', () => {
  const { store, plans } = withRegistry()
  try {
    const checked = plans.validate({
      name: '正常',
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳', maxPages: '2' },
    })
    assert.deepEqual(checked.notices, [], '正常配置不该产生提示 —— 否则用户会学会忽略它们')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

// ── 每平台覆盖项（批次 3 数据模型侧）────────────────────────────────────

test('每平台覆盖项：停用一个平台能存下来、读回来还在，且**稀疏**（默认值不落库）', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    const plan = plans.create({
      name: '多平台',
      platforms: ['51job', 'waiqi'],
      // 显式给一个"等于默认"的条目 + 一个真的改动
      platformOverrides: { '51job': { enabled: true, maxPages: null }, waiqi: { enabled: false } },
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.deepEqual(
      plan.platformOverrides,
      { waiqi: { enabled: false, maxPages: null } },
      '等于默认值的条目不落库 —— 这样"什么都没配"的方案与升级前形状一致',
    )

    const reloaded = plans.get(plan.id)
    assert.equal(reloaded.platformOverrides['waiqi']?.enabled, false, '读回来还在')
    assert.equal(reloaded.platformOverrides['51job'], undefined, '默认条目不该被凭空造出来')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('每平台覆盖项：覆盖一个不在方案里的平台 → 显式报错（否则它会在重新加入时静默生效）', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    assert.throws(
      () =>
        plans.create({
          name: '越界覆盖',
          platforms: ['51job'],
          platformOverrides: { waiqi: { enabled: false } },
          criteria: { keyword: 'Java' },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('waiqi'),
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('每平台覆盖项：所有平台都停用 → 报错（那种方案永远不会抓任何东西）', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    assert.throws(
      () =>
        plans.create({
          name: '全停',
          platforms: ['51job', 'waiqi'],
          platformOverrides: { '51job': { enabled: false }, waiqi: { enabled: false } },
          criteria: { keyword: 'Java' },
        }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('每平台覆盖项：页数上限按**该平台自己的**上限校验，不再静默截断', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    // waiqi 的服务端翻页是坏的 → 它自己的上限是 1 页（平台事实，不是我方取舍）
    assert.throws(
      () =>
        plans.create({
          name: '深度越界',
          platforms: ['51job', 'waiqi'],
          platformOverrides: { waiqi: { maxPages: 2 } },
          criteria: { keyword: 'Java', maxPages: '5' },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('waiqi'),
      '以前"方案设 5 页"会在 waiqi 上被静默截断成 1 页 —— 现在同类越界必须显式报错',
    )

    // 在限内则通过，并且能读回来
    const ok = plans.create({
      name: '深度合规',
      platforms: ['51job', 'waiqi'],
      platformOverrides: { waiqi: { maxPages: 1 } },
      criteria: { keyword: 'Java', maxPages: '5' },
    })
    assert.equal(ok.platformOverrides['waiqi']?.maxPages, 1)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('每平台覆盖项：平台被移出方案时，它的覆盖项一起消失', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    const plan = plans.create({
      name: '先要两个平台',
      platforms: ['51job', 'waiqi'],
      platformOverrides: { waiqi: { enabled: false } },
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.equal(plan.platformOverrides['waiqi']?.enabled, false)

    const updated = plans.update(plan.id, { platforms: ['51job'] })
    assert.deepEqual(
      updated.platformOverrides,
      {},
      '留着它，下次把 waiqi 加回来时会**静默生效** —— 而用户早忘了自己配过它',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})
