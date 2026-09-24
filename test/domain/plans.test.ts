import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { criteriaDimensionsFor } from '../../src/host/domain/plan-config.js'
import { DEFAULT_SCHEDULE, normalizeSchedule } from '../../src/host/store/repo/plans.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job/index.js'
import { createGuopinAdapter } from '../../src/host/platform/adapters/guopin/index.js'
import { createHiredChinaAdapter } from '../../src/host/platform/adapters/hiredchina/index.js'
import { createIndeedAdapter } from '../../src/host/platform/adapters/indeed/index.js'
import { createLinkedInAdapter } from '../../src/host/platform/adapters/linkedin/index.js'
import { createWaiqiAdapter } from '../../src/host/platform/adapters/waiqi-job/index.js'
import { createZhaopinAdapter } from '../../src/host/platform/adapters/zhaopin/index.js'
import { createZhipinAdapter } from '../../src/host/platform/adapters/zhipin/index.js'
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
    // ⚠️ 别用 `salary` 当"未知键"示例 —— 51job 自 2026-09-23 起声明了它（合法键，
    // 值域外会走另一条报错路径）。这里用一个任何适配器都不认识的键。
    assert.throws(
      () => plans.create({ name: '怪条件', platforms: ['51job'], criteria: { noSuchFilter: '20K' } }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('noSuchFilter'),
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
      criteria: { keyword: 'Java', city: '深圳', sort: '3', maxPages: '2' },
    })
    assert.equal(ok.criteria['sort'], '3')
    assert.equal(ok.criteria['maxPages'], '2')

    // 2026-09-21 起：51job 的 `postedWithinDays` 是**空值域 + closed**（它自己的 hint 写着
    // "该维度不可用"）→ 界面上不再给输入框，校验也必须**显式拒绝**。
    // 以前它落进 NUMERIC_KEYS 的数值分支并被放行：条件存得下、平台上什么都没筛。
    assert.throws(
      () =>
        plans.create({
          name: '发布时间不可用',
          platforms: ['51job'],
          criteria: { keyword: 'Java', postedWithinDays: '3' },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('发布时间'),
    )

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

test('提示：选到还没校准的平台时要说清楚，而不是让你白跑一轮', () => {
  // 单平台方案：一家一家看（没有"选一批平台"这回事了）。
  // guopin 是实验档 → 必须提示；indeed 已按 2026-09-21 真实夹具升级为 calibrated
  //（曾是唯一的 disabled 平台）→ 不该再吓用户「停用/实验」。
  const { store, plans } = withPlatforms(createGuopinAdapter, createIndeedAdapter)
  try {
    const guopin = plans.validate({
      name: '国聘',
      platforms: ['guopin'],
      criteria: { keyword: 'Java' },
    })
    assert.ok(
      guopin.notices.some((note) => note.includes('guopin') && note.includes('实验')),
      `应当提示 guopin 是实验性平台：${guopin.notices.join(' | ')}`,
    )
    const indeed = plans.validate({
      name: 'indeed',
      platforms: ['indeed'],
      criteria: { keyword: 'Java' },
    })
    assert.ok(
      !indeed.notices.some((note) => note.includes('停用') || note.includes('实验')),
      `indeed 已校准，不应再提示停用/实验：${indeed.notices.join(' | ')}`,
    )
    // **提示 ≠ 拒绝**：方案照样建得出来
    assert.ok(plans.create({ name: '国聘', platforms: ['guopin'], criteria: { keyword: 'Java' } }).id > 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('城市不在这个平台的表里 → 硬拒（单平台之后没有"部分平台不支持"这种中间态）', () => {
  // 多平台时的形态是"有平台接受就放行 + 提示谁不接受"。
  // 单平台方案下这中间态不存在了：要么这个平台认（放行），要么不认（当场拒）——
  // 后者存下来只会每轮空跑，而用户会以为"今天没岗位"。
  const oneCities = citiesOf(createFiftyOneAdapter())
  const waiqiCities = citiesOf(createWaiqiAdapter())
  const cityInOneOnly = oneCities.find((city) => !waiqiCities.includes(city))
  const cityInWaiqiOnly = waiqiCities.find((city) => !oneCities.includes(city))
  const city = cityInOneOnly ?? cityInWaiqiOnly
  assert.ok(city !== undefined, '两个平台的城市表完全互相覆盖 —— 这条用例失去了测试对象，请换一对平台')
  const missingId = cityInOneOnly === undefined ? '51job' : 'waiqi'

  const { store, plans } = withPlatforms(createFiftyOneAdapter, createWaiqiAdapter)
  try {
    assert.throws(
      () =>
        plans.validate({ name: '城市不认', platforms: [missingId], criteria: { keyword: 'Java', city } }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        (error.hint ?? '').length > 0,
      `${missingId} 不认识 ${city} —— 必须当场拒，并给出可选取值`,
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('方案级页数超过平台自己的上限 → 硬拒（"静默截断 + 提一句"的时代结束了）', () => {
  // waiqi 的服务端翻页是坏的 → 它自己的上限是 1 页（平台事实，不是我方取舍）。
  // 单平台之后"设 5 页"就是**这一家**的事：当场说清并拒掉，
  // 而不是存下来、抓的时候按 1 页跑、只在提示里提一句。
  const { store, plans } = withPlatforms(createWaiqiAdapter)
  try {
    assert.throws(
      () =>
        plans.validate({
          name: '深度越界',
          platforms: ['waiqi'],
          criteria: { keyword: 'Java', city: '深圳', maxPages: '5' },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('waiqi'),
      '超过平台自己上限的页数必须当场拒，并点出是哪个平台',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('取值域按**那个平台自己**的城市表判（单平台方案：一家一张表，没有并集）', () => {
  // 判据是"这个平台认不认这个取值"：
  //   * zhipin 的表里有「东莞」→ 放行；
  //   * 51job 的表里没有 → 硬拒（存下来只会每轮空跑，而用户会以为"今天没岗位"）。
  const { store, plans } = withPlatforms(createFiftyOneAdapter, createZhipinAdapter)
  try {
    const zhipin = plans.validate({
      name: 'zhipin 的东莞',
      platforms: ['zhipin'],
      criteria: { keyword: 'Java', city: '东莞' },
    })
    assert.equal(zhipin.criteria['city'], '东莞', 'zhipin 自己表里的城市必须放行')

    assert.throws(
      () =>
        plans.validate({
          name: '51job 的东莞',
          platforms: ['51job'],
          criteria: { keyword: 'Java', city: '东莞' },
        }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
      '51job 的表里没有东莞 —— 必须当场拦住',
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

test('批次 3：自由文本城市（LinkedIn 原样收地名）**不该**被拦也不该被提示', () => {
  // 反向的坑：linkedin 的 city 是自由文本，表里的 9 个只是建议。
  // 旧行为会为「珠海」报一条**假的**警告（甚至硬拒）—— 误报比不报更伤。
  const { store, plans } = withPlatforms(createLinkedInAdapter)
  try {
    const checked = plans.validate({
      name: '自由文本城市',
      platforms: ['linkedin'],
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
  const { store, plans } = withPlatforms(createFiftyOneAdapter)
  try {
    const checked = plans.validate({
      name: '写法不一致',
      platforms: ['51job'],
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
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.equal(untouched.criteria['city'], '深圳')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('单平台方案的筛选条件快照就是**那个平台自己**的表（不再有并集）', () => {
  const { store, registry } = withPlatforms(createFiftyOneAdapter, createZhipinAdapter)
  try {
    const items = criteriaDimensionsFor(registry, ['zhipin'])
    const city = items.find((item) => item.key === 'city')
    assert.ok(city !== undefined)
    const values = city.values.map((item) => item.value)
    // 单平台：就是 zhipin 自己那张表（含东莞），不该混进 51job 的任何城市
    assert.ok(values.includes('东莞'), `zhipin 的表里应当有东莞：${values.join('、')}`)
    assert.equal(values.length, citiesOf(createZhipinAdapter()).length, '不该混进别的平台的城市')
    // 顺序仍按城市目录（便于在两份表之间对照）
    assert.equal(values[0], '北京')
    // 提示里不再说"并集"—— 单平台没有并集这回事
    assert.equal(city.hint.includes('并集'), false, `单平台不该再说并集：${city.hint}`)
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

test('每平台覆盖项：真的改动落库、读回来还在，且**稀疏**（等于默认值的条目不落库）', () => {
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    const plan = plans.create({
      name: '深度覆盖',
      platforms: ['waiqi'],
      // waiqi 自己的上限就是 1 页 → 这条覆盖项合法
      platformOverrides: { waiqi: { maxPages: 1 } },
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.deepEqual(
      plan.platformOverrides,
      { waiqi: { enabled: true, maxPages: 1 } },
      '真的改动要落库',
    )

    const reloaded = plans.get(plan.id)
    assert.equal(reloaded.platformOverrides['waiqi']?.maxPages, 1, '读回来还在')

    // 显式给一个"等于默认"的条目（enabled:true / maxPages:null）→ 不该落库
    const plain = plans.create({
      name: '默认条目',
      platforms: ['51job'],
      platformOverrides: { '51job': { enabled: true, maxPages: null } },
      criteria: { keyword: 'Java', city: '深圳' },
    })
    assert.deepEqual(
      plain.platformOverrides,
      {},
      '等于默认值的条目不落库 —— 这样"什么都没配"的方案与升级前形状一致',
    )
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
          platforms: ['51job'],
          platformOverrides: { '51job': { enabled: false } },
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
          platforms: ['waiqi'],
          platformOverrides: { waiqi: { maxPages: 2 } },
          criteria: { keyword: 'Java' },
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
      platforms: ['waiqi'],
      platformOverrides: { waiqi: { maxPages: 1 } },
      criteria: { keyword: 'Java', maxPages: '1' },
    })
    assert.equal(ok.platformOverrides['waiqi']?.maxPages, 1)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('一个方案只能抓一个平台：两个平台直接拒（条件是按平台自己的参数名定义的）', () => {
  // 为什么是硬约束而不是界面上的默认：条件只能存一份，而 `sort` 在 51job 是 sortType、
  // 在智联是 order；`type` 在神仙外企是"外企/不限"、在 HiredChina 是 Marketing…
  // 两家共用一份条件，必然有一家收到的是"它取值域外的值"，而界面上那句"按它筛"就是假话。
  const { store, plans } = withRegistry({ waiqi: true })
  try {
    assert.throws(
      () =>
        plans.create({
          name: '两个平台',
          platforms: ['51job', 'waiqi'],
          criteria: { keyword: 'Java' },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('只能抓一个平台'),
      '多平台方案必须被配置面拦下 —— 要同时抓就建多个方案（时段与额度各自独立）',
    )
    assert.ok(
      plans.create({ name: '单平台', platforms: ['51job'], criteria: { keyword: 'Java' } }).id > 0,
      '单平台方案照常能建',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

/* ── 维度声明 == 界面上能填什么（2026-09-21）─────────────────────────────
   这一组钉的是三类"界面与适配器声明不一致"的形态，它们都不是视觉问题：
   用户看着一个能填的控件，填完之后平台上什么都没发生。

     ① **声明了却一个取值都不收**（51job / 智联的发布时间、国聘的城市）：
        `closed` + 空值域。以前 `criteriaDimensionsFor` 照样报 `supported: true`，
        界面按 `NUMERIC_KEYS` 渲染成一个可填的数字框，校验的数值分支又排在取值域
        检查前面并 `continue` —— 于是"发布时间＝3"能存进方案。
     ② **值域开放但有建议列表**（领英的 location）：以前按 `values` 非空 = 下拉渲染，
        于是"表外地名"根本打不进去 —— 而适配器明说 `closed: false`（收任何地名）。
     ③ **"站点页面有、适配器没写"的筛选**：那是适配器的缺口，不是用户的配置项 ——
        界面只列"声明了且真的能发到平台参数上"的那些，不让用户配一个点了没用的东西。 */

test('空值域 + closed = 不可填：不给输入框，原因取自适配器自己的声明', () => {
  const { store, registry } = withPlatforms(createFiftyOneAdapter)
  try {
    const items = criteriaDimensionsFor(registry, ['51job'])
    const posted = items.find((item) => item.key === 'postedWithinDays')
    assert.ok(posted !== undefined)
    assert.equal(posted.supported, false, '一个取值都不收 → 不能填')
    assert.equal(posted.declared, true, '"声明过但不可用" 与 "平台没这个筛选" 必须分开')
    assert.equal(posted.values.length, 0)
    assert.equal(posted.open, false)
    assert.ok(
      posted.disabledReason?.includes('issueDate') === true,
      `原因要引用适配器自己写的理由：${posted.disabledReason ?? '（空）'}`,
    )
    assert.equal(posted.platforms[0]?.supported, false)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('空值域 + closed 的城市（国聘）：不可填 —— 以前是一个能打字、保存必失败的输入框', () => {
  const { store, registry } = withPlatforms(createGuopinAdapter)
  try {
    const city = criteriaDimensionsFor(registry, ['guopin']).find((item) => item.key === 'city')
    assert.ok(city !== undefined)
    assert.equal(city.supported, false)
    assert.equal(city.open, false)
    assert.ok(city.disabledReason?.includes('城市码') === true, city.disabledReason ?? '（空）')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('值域开放但有建议列表（领英的城市）：open=true，界面必须允许自由输入', () => {
  const { store, registry } = withPlatforms(createLinkedInAdapter)
  try {
    const city = criteriaDimensionsFor(registry, ['linkedin']).find((item) => item.key === 'city')
    assert.ok(city !== undefined)
    assert.equal(city.supported, true)
    assert.equal(city.open, true, 'accepts free text —— 渲染成下拉就等于禁止表外地名')
    assert.ok(city.values.length > 0, '建议值仍然要给（datalist）')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('多选维度：逗号分隔的多个 id 逐个判取值域（不能拿整串去比）', () => {
  // 神仙外企的公司类型是**数组参数**（companyTypeList）：界面上多选，值在 criteria 里
  // 以逗号分隔存。校验如果拿 "28,31" 整串去比取值集合，永远比不中 —— 用户会看到
  // "公司类型不接受取值「28,31」"这种毫无道理的报错。
  const { store, plans } = withPlatforms(createWaiqiAdapter)
  try {
    const checked = plans.validate({
      name: '多选公司类型',
      platforms: ['waiqi'],
      criteria: { keyword: 'Java', companyType: '28,31' },
    })
    assert.equal(checked.criteria['companyType'], '28,31', '两个合法 id 都要留下')

    assert.throws(
      () =>
        plans.validate({
          name: '多选里混了脏值',
          platforms: ['waiqi'],
          criteria: { keyword: 'Java', companyType: '28,9999' },
        }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'INVALID_INPUT' &&
        error.message.includes('9999'),
      '只要有一个 id 不在取值域里就必须报错，并点名是哪个',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('单平台快照：只含那个平台声明的维度与取值（别人的东西一个都不出现）', () => {
  const { store, registry } = withPlatforms(createFiftyOneAdapter, createWaiqiAdapter)
  try {
    const items = criteriaDimensionsFor(registry, ['51job'])
    const sort = items.find((item) => item.key === 'sort')
    assert.ok(sort !== undefined)
    assert.equal(sort.supported, true)
    assert.deepEqual(
      sort.values.map((item) => item.value).sort(),
      ['0', '1', '3', '5'],
      '排序取值就是 51job 自己的四档',
    )

    // 神仙外企才有的「行业 / 职能」**根本不出现在 51job 的快照里** ——
    // 界面不会把它画成可填的输入框，也不会拿别的平台的名义解释它。
    for (const key of ['businessCategory', 'posInfo']) {
      assert.equal(
        items.some((entry) => entry.key === key),
        false,
        `${key} 是神仙外企才有的维度，不该出现在 51job 的快照里`,
      )
    }
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})