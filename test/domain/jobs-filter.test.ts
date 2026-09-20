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
  /** 关联公司（第五轮用：验证"排除已拉黑公司"）。不传 = 没有公司（`company_id` 为 NULL）。 */
  companyId?: number
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
      companyId: input.companyId ?? null,
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

test('折叠：同一组的岗位只留一行，留的那条跟着**当前排序键**走', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const a = upsert(store, { title: 'A', city: '深圳', platformId: 'zhilian', key: 'a' }, now)
    const b = upsert(store, { title: 'A', city: '深圳', platformId: 'zhipin', key: 'b' }, now)
    upsert(store, { title: 'C', city: '深圳', platformId: 'p3', key: 'c' }, now)
    upsert(store, { title: 'D', city: '北京', platformId: 'p1', key: 'd' }, now)
    // 同组两条给**不同**的分：a 分高但 id 小，b 分低但 id 大 ——
    // 于是"留谁"能把两种规则彻底区分开。
    const stamp = { resumeId: 1, rev: 1 }
    store.job.setMatch(a, 88, [{ kind: 'skill', text: '命中关键词', weight: 6 }], stamp)
    store.job.setMatch(b, 40, [{ kind: 'skill', text: '弱相关', weight: -1 }], stamp)
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

    // 默认排序是"抓取时间倒序"，而这两条时间戳相同 → 由 `id DESC` 兜底
    // （与外层 ORDER BY 逐字同一套）。所以代表是 b。
    const byDefault = idsOf(store.job.query({ groupDuplicates: true }))
    assert.ok(
      byDefault.includes(b) && !byDefault.includes(a),
      '代表 = 该组在当前排序下会排最前的那条（时间戳相同则由 id 兜底）',
    )

    // 换成"按匹配分降序"：代表必须换成**分高的那条**（a），即使它的 id 更小 ——
    // 这正是第五轮（批次 A3）改这条规则的原因：上一版固定留最小 id，
    // 用户切到"按匹配分排序"时组内分最高的那条却仍不显示，排序看起来没生效。
    const byScoreDesc = idsOf(store.job.query({ groupDuplicates: true, orderBy: 'match_score' }))
    assert.ok(byScoreDesc.includes(a) && !byScoreDesc.includes(b), '按匹配分降序：组内留分最高的')
    const byScoreAsc = idsOf(
      store.job.query({ groupDuplicates: true, orderBy: 'match_score', descending: false }),
    )
    assert.ok(byScoreAsc.includes(b) && !byScoreAsc.includes(a), '按匹配分升序：组内留分最低的')

    assert.equal(
      folded.find((job) => job.id === b)?.dedupGroupId,
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

// ── 第五轮：匹配分门槛 / 排除已拉黑公司 / 分数过期 ──────────────────────

test('匹配分门槛：只留 ≥ 门槛的，且**未打分的被排除**（没有分就没法参与按分挑岗位）', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const stamp = { resumeId: 1, rev: 1 }
    const high = upsert(store, { title: '高', city: '深圳', platformId: 'p1', key: 'high' }, now)
    const low = upsert(store, { title: '低', city: '深圳', platformId: 'p2', key: 'low' }, now)
    const none = upsert(store, { title: '没打分', city: '深圳', platformId: 'p3', key: 'none' }, now)
    store.job.setMatch(high, 88, [{ kind: 'skill', text: '命中', weight: 6 }], stamp)
    store.job.setMatch(low, 40, [{ kind: 'skill', text: '弱', weight: -1 }], stamp)

    assert.deepEqual(idsOf(store.job.query({ minMatchScore: 50 })), [high])
    assert.equal(
      store.job.countMatching({ minMatchScore: 50 }),
      1,
      'total 必须走同一套条件 —— 否则头和列表对不上',
    )
    assert.deepEqual(
      idsOf(store.job.query({ minMatchScore: 0 })),
      [high, low],
      '门槛 0 也不含未打分的：`match_score >= 0` 对 NULL 不成立（这是有意的）',
    )
    assert.equal(store.job.query({ minMatchScore: 90 }).length, 0)
    assert.ok(none > 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('排除已拉黑公司：默认不过滤；显式要求时只挡那一家，无公司的岗位不受影响', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const company = store.company.ensure({ name: '某某外包科技', nameNorm: '某某外包科技' }, now)
    store.company.updateReview(company.id, { blacklisted: true, note: '同一岗位反复重发' }, now)
    const linked = upsert(
      store,
      { title: '黑名单公司的岗', city: '深圳', platformId: 'p1', key: 'linked', companyId: company.id },
      now,
    )
    const orphan = upsert(store, { title: '没归一化出公司的岗', city: '深圳', platformId: 'p2', key: 'orphan' }, now)

    assert.deepEqual(idsOf(store.job.query({})), [linked, orphan], '默认不过滤：静默隐藏数据比不隐藏更危险')
    assert.deepEqual(
      idsOf(store.job.query({ excludeBlacklistedCompanies: true })),
      [orphan],
      '只有被显式要求时才挡已拉黑公司；company_id 为 NULL 的岗位必须放行',
    )
    assert.equal(store.job.countMatching({ excludeBlacklistedCompanies: true }), 1)
    // 界面头栏那个"已隐藏 N 条"就是这两个数的差（服务端算好一起回传）
    assert.equal(store.job.countMatching({}) - store.job.countMatching({ excludeBlacklistedCompanies: true }), 1)
    assert.equal(store.company.get(company.id)?.note, '同一岗位反复重发', '备注要真的落库（界面第五轮才接上它）')
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('分数过期：只挑"有分但简历版本对不上"的，且 NULL 与 NULL 视为相等', () => {
  const store = openTestStore()
  try {
    const now = '2026-09-16T01:00:00.000Z'
    const reasons = [{ kind: 'skill', text: '命中', weight: 6 }]
    const old = upsert(store, { title: '旧版算的', city: '深圳', platformId: 'p1', key: 'old' }, now)
    const other = upsert(store, { title: '另一版简历算的', city: '深圳', platformId: 'p2', key: 'other' }, now)
    const unscored = upsert(store, { title: '没分', city: '深圳', platformId: 'p3', key: 'unscored' }, now)
    const noResume = upsert(store, { title: '无简历时算的', city: '深圳', platformId: 'p4', key: 'noresume' }, now)
    store.job.setMatch(old, 88, reasons, { resumeId: 1, rev: 1 })
    store.job.setMatch(other, 60, reasons, { resumeId: 2, rev: 1 })
    store.job.setMatch(noResume, 70, reasons, { resumeId: null, rev: 0 })

    // `unscored` 没有分，永远不参与（"过期"的前提是"有分"）。
    // 另外三条各差一个维度，于是能把判定条件逐项钉住：
    //   old      = 简历 1 / rev 1
    //   other    = 简历 2 / rev 1
    //   noResume = 无简历（null）/ rev 0  ← "当初没有启用简历时算的分"
    //
    // 当前是"简历 2 / rev 1"：`old` 简历对不上、`noResume` rev 对不上 → 都过期；
    // `other` 两项都相同 → 不过期。
    assert.deepEqual(
      store.job.listStaleScoreIds({ resumeId: 2, rev: 1 }, 10).sort((a, b) => a - b),
      [old, noResume],
    )
    // 当前是"简历 1 / rev 1"：这次轮到 `other` 过期，`old` 反而是新鲜的。
    assert.deepEqual(
      store.job.listStaleScoreIds({ resumeId: 1, rev: 1 }, 10).sort((a, b) => a - b),
      [other, noResume],
      '判定与领域层的 scoreStale 逐字对齐：只有版本对不上的才算过期',
    )
    assert.equal(
      store.job.countStaleScores({ resumeId: 1, rev: 1 }),
      2,
      '—— 与上面 listStaleScoreIds 的条数必须一致（两处口径不同就会出现"说 7 条只修 3 条"）',
    )
    // 同一份简历改了内容（rev 1 → 2）：三条全过期
    assert.equal(store.job.countStaleScores({ resumeId: 1, rev: 2 }), 3)
    // 无启用简历（null / 0）：只有"当初也是无简历时算的那条"算新鲜 ——
    // NULL 与 NULL 必须视为相等（SQL 里用 `IS NOT` 而不是 `<>`，`<>` 会漏判）
    assert.deepEqual(
      store.job.listStaleScoreIds({ resumeId: null, rev: 0 }, 10).sort((a, b) => a - b),
      [old, other],
    )
    assert.ok(unscored > 0)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})