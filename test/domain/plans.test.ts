import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { DEFAULT_SCHEDULE, normalizeSchedule } from '../../src/host/store/repo/plans.js'
import { createAdapterRegistry } from '../../src/host/platform/registry.js'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job.js'
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

function withRegistry() {
  const store = openTestStore()
  const registry = createAdapterRegistry()
  registry.register(createFiftyOneAdapter())
  return { store, registry, plans: createPlanService(store, undefined, registry) }
}

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
    const ok = plans.create({
      name: '正常',
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳', sort: '2', postedWithinDays: '3', maxPages: '2' },
    })
    assert.equal(ok.criteria['sort'], '2')
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
