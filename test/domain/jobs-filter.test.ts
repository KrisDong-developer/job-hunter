import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanup, openTestStore } from '../support/store.js'

/**
 * 岗位库筛选扩展（多城市 + 屏蔽标注）。
 *
 * 这两条都走 SQL（`IN` / `NOT EXISTS`），是列表查询的边界，必须盯住：
 * 屏蔽不能把正常岗位误杀，多城市不能重复计数。
 */

interface UpsertInput {
  title: string
  city: string
  platformId: string
  key: string
}

function upsert(
  store: ReturnType<typeof openTestStore>,
  input: UpsertInput,
  now: string,
): number {
  return store.job.upsert(
    {
      platformId: input.platformId,
      platformJobId: input.key,
      title: input.title,
      companyId: null,
      salaryRaw: '2-3万',
      salaryMin: 20000,
      salaryMax: 30000,
      salaryMonths: null,
      city: input.city,
      district: '',
      expReq: '',
      eduReq: '',
      tags: [],
      sourceUrl: `https://${input.key}`,
      publishedAt: null,
    },
    now,
  ).id
}

function idsOf(jobs: Array<{ id: number }>): number[] {
  return jobs.map((job) => job.id).sort((a, b) => a - b)
}

test('多城市 cities: 命中任一城市（不去重、不误伤）', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const a = upsert(store, { title: 'A', city: '深圳', platformId: 'p1', key: 'a' }, now)
    const b = upsert(store, { title: 'B', city: '北京', platformId: 'p2', key: 'b' }, now)
    const c = upsert(store, { title: 'C', city: '深圳', platformId: 'p3', key: 'c' }, now)

    assert.deepEqual(idsOf(store.job.query({ cities: ['深圳'] })), idsOf([{ id: a }, { id: c }]))
    assert.deepEqual(idsOf(store.job.query({ cities: ['深圳', '北京'] })), idsOf([{ id: a }, { id: b }, { id: c }]))
    assert.equal(store.job.countMatching({ cities: ['深圳'] }), 2)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('屏蔽标注: 命中该标注类型的岗位不显示，其余保留', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const a = upsert(store, { title: 'A', city: '深圳', platformId: 'p1', key: 'a' }, now)
    const b = upsert(store, { title: 'B', city: '北京', platformId: 'p2', key: 'b' }, now)
    const c = upsert(store, { title: 'C', city: '广州', platformId: 'p3', key: 'c' }, now)
    store.flag.replace(a, [{ type: 'outsourcing', score: 1, evidence: ['测试'] }], now)
    store.flag.replace(b, [{ type: 'fraud', score: 1, evidence: ['测试'] }], now)

    assert.deepEqual(idsOf(store.job.query({ excludeFlagTypes: ['outsourcing'] })), idsOf([{ id: b }, { id: c }]))
    assert.deepEqual(
      idsOf(store.job.query({ excludeFlagTypes: ['outsourcing', 'fraud'] })),
      idsOf([{ id: c }]),
    )
    assert.equal(store.job.countMatching({ excludeFlagTypes: ['fraud'] }), 2)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('组合: 多城市 + 屏蔽标注一起用', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const a = upsert(store, { title: 'A', city: '深圳', platformId: 'p1', key: 'a' }, now)
    upsert(store, { title: 'B', city: '北京', platformId: 'p2', key: 'b' }, now)
    const c = upsert(store, { title: 'C', city: '深圳', platformId: 'p3', key: 'c' }, now)
    store.flag.replace(c, [{ type: 'outsourcing', score: 1, evidence: ['测试'] }], now)

    const result = store.job.query({ cities: ['深圳'], excludeFlagTypes: ['outsourcing'] })
    assert.deepEqual(idsOf(result), [a])
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('listCities: 出去重、去空，NOCASE 排序', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    upsert(store, { title: 'A', city: '深圳', platformId: 'p1', key: 'a' }, now)
    upsert(store, { title: 'A2', city: '深圳', platformId: 'p2', key: 'a2' }, now)
    upsert(store, { title: 'B', city: '北京', platformId: 'p3', key: 'b' }, now)
    upsert(store, { title: 'B2', city: '', platformId: 'p4', key: 'b2' }, now)
    // 空岗位不出现
    upsert(store, { title: 'E', city: '广州', platformId: 'p5', key: 'e' }, now)

    assert.deepEqual(store.job.listCities(), ['北京', '广州', '深圳'])
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})