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

test('只看新增: firstSeenSince 只留新增，且与「今日新增」同口径', () => {
  const store = openTestStore()
  try {
    const old = '2026-09-10T00:00:00.000Z'
    const fresh = '2026-09-16T00:00:00.000Z'
    const since = '2026-09-15T00:00:00.000Z'
    upsert(store, { title: 'A', city: '深圳', platformId: 'p1', key: 'a' }, old)
    const b = upsert(store, { title: 'B', city: '深圳', platformId: 'p2', key: 'b' }, fresh)

    assert.deepEqual(idsOf(store.job.query({ firstSeenSince: since })), [b])
    assert.equal(store.job.countMatching({ firstSeenSince: since }), 1)
    // **同口径**：首屏「今日新增」用 countSince（`first_seen_at >= ?`），
    // 列表筛选必须给出同一个数 —— 两边不一致时用户只会以为其中之一坏了。
    assert.equal(store.job.countMatching({ firstSeenSince: since }), store.job.countSince(since))

    // 边界：正好等于该时刻算新增（`>=` 而不是 `>`）
    assert.deepEqual(idsOf(store.job.query({ firstSeenSince: fresh })), [b])

    // 再抓一次老岗位（`last_seen_at` 被刷新）**不该**把它算成新增 ——
    // 否则每轮抓取都会把库里全部存量变成"新增"，「增量」就没有意义了。
    upsert(store, { title: 'A', city: '深圳', platformId: 'p1', key: 'a' }, '2026-09-17T00:00:00.000Z')
    assert.deepEqual(idsOf(store.job.query({ firstSeenSince: since })), [b])
    assert.equal(store.job.countMatching({ firstSeenSince: since }), 1)
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

// ── 批次 4：按跨平台去重分组折叠 ────────────────────────────────────────

test('折叠：同一组的岗位只留一行，且 total 也按折叠后算', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const a = upsert(store, { title: 'A', city: '深圳', platformId: 'zhilian', key: 'a' }, now)
    const b = upsert(store, { title: 'A', city: '深圳', platformId: 'zhipin', key: 'b' }, now)
    const c = upsert(store, { title: 'C', city: '深圳', platformId: 'p3', key: 'c' }, now)
    upsert(store, { title: 'D', city: '北京', platformId: 'p1', key: 'd' }, now)
    // 直接建组（去重引擎自己那部分在 dedupe-sweep.test.ts 里验）
    const groupId = store.dedupGroup.create(
      // 主岗位刻意选**不是最小 id** 的那个：折叠留谁不能跟着 primary 走
      { primaryJobId: b, memberIds: [a, b], basis: '测试', score: 1 },
      now,
    )

    assert.equal(store.job.countMatching({}), 4, '折叠前是 4 行')
    const folded = store.job.query({ groupDuplicates: true })
    assert.equal(folded.length, 3, 'a 与 b 合成一行')
    assert.equal(
      store.job.countMatching({ groupDuplicates: true }),
      3,
      'total 也必须按折叠后算 —— 否则"共 40 条 / 只有 12 行"是个新谜题',
    )

    const ids = idsOf(folded)
    assert.ok(ids.includes(a) && !ids.includes(b), '留代表按**组内最小 id**，稳定且与插入顺序一致')
    assert.equal(
      folded.find((job) => job.id === a)?.dedupGroupId,
      groupId,
      '行上要带组 id —— 界面靠它显示徽章、拉对照',
    )

    // 折叠是**查询层**的事，不该影响别的筛选条件
    assert.equal(store.job.query({ groupDuplicates: true, cities: ['北京'] }).length, 1)
    assert.equal(store.job.query({ groupDuplicates: true, keyword: 'C' }).length, 1)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('折叠：分页在**折叠后**的集合上 —— 不漏行也不重复', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    // 三组、每组两条（共 6 条），折叠后应当是 3 行
    for (const key of ['a', 'b', 'c']) {
      const first = upsert(store, { title: key, city: '深圳', platformId: 'zhilian', key: `${key}1` }, now)
      const second = upsert(store, { title: key, city: '深圳', platformId: 'zhipin', key: `${key}2` }, now)
      store.dedupGroup.create({ primaryJobId: first, memberIds: [first, second], basis: '测试', score: 1 }, now)
    }

    const page1 = store.job.query({ groupDuplicates: true }, 2, 0)
    const page2 = store.job.query({ groupDuplicates: true }, 2, 2)
    assert.equal(page1.length, 2)
    assert.equal(page2.length, 1)
    const seen = [...page1, ...page2].map((job) => job.id)
    assert.equal(new Set(seen).size, 3, '两页拼起来正好 3 行，不重不漏')
    assert.equal(
      page1.filter((job) => page2.some((other) => other.id === job.id)).length,
      0,
      '同一组不能跨页出现两次',
    )
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})