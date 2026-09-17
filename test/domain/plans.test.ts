import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlanService } from '../../src/host/domain/plans.js'
import { DEFAULT_SCHEDULE, normalizeSchedule } from '../../src/host/store/repo/plans.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore } from '../support/store.js'

test('定时配置会被收敛到合法范围（坏配置＝静默不跑，必须拦住）', () => {
  const normalized = normalizeSchedule({
    hour: 99,
    minute: -5,
    weekdays: [1, 1, 7, 3.5, 5],
    jitterMs: -1,
    missedGraceMs: 99 * 24 * 60 * 60 * 1000,
  })
  assert.equal(normalized.hour, 23)
  assert.equal(normalized.minute, 0)
  assert.deepEqual(normalized.weekdays, [1, 5], '去重、去非法、排序')
  assert.equal(normalized.jitterMs, 0)
  assert.equal(normalized.missedGraceMs, 7 * 24 * 60 * 60 * 1000)
})

test('缺省时用默认值补齐', () => {
  const normalized = normalizeSchedule(undefined)
  assert.deepEqual(normalized, DEFAULT_SCHEDULE)
  const partial = normalizeSchedule({ hour: 6 })
  assert.equal(partial.hour, 6)
  assert.equal(partial.minute, DEFAULT_SCHEDULE.minute)
  assert.deepEqual(partial.weekdays, DEFAULT_SCHEDULE.weekdays)
})

test('方案 CRUD', () => {
  const store = openTestStore()
  try {
    const plans = createPlanService(store, () => '2026-09-16T01:00:00.000Z')

    const created = plans.create({
      name: '深圳 Java',
      platforms: ['51job'],
      criteria: { keyword: 'Java', city: '深圳' },
      schedule: { hour: 9, minute: 30 },
    })
    assert.equal(created.name, '深圳 Java')
    assert.deepEqual(created.platforms, ['51job'])
    assert.equal(created.schedule.hour, 9)
    assert.equal(created.enabled, true)

    const updated = plans.update(created.id, { name: '改名了', enabled: false })
    assert.equal(updated.name, '改名了')
    assert.equal(updated.enabled, false)
    assert.deepEqual(updated.criteria, { keyword: 'Java', city: '深圳' }, '没给的字段要保留')
    assert.equal(updated.schedule.hour, 9, '定时配置也要保留')

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
