// 第五轮（批次 A/B/D）的 HTTP 面：匹配分门槛、排除已拉黑公司、保存的筛选视图、导出选中。
//
// 这一层专门盯"路由解析 + 服务端校验"两件事：参数非法要**显式报错**（不静默忽略）、
// 隐藏了什么要**如实回报**（`hiddenByBlacklist`）、整份覆盖写的入参要被逐字段校验。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeRequest, type RouteRequest, type RouteResult } from '../../src/host/http/router.js'
import { createHostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T1 = '2026-09-16T01:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'j1',
    title: '全栈开发工程师',
    companyId: null,
    salaryRaw: '1.3-1.8万',
    salaryMin: 13000,
    salaryMax: 18000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '5年及以上',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/j1.html',
    publishedAt: T1,
    ...overrides,
  }
}

async function openRuntime(): Promise<{ runtime: ReturnType<typeof createHostRuntime>; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

async function callRaw(
  runtime: ReturnType<typeof createHostRuntime>,
  method: string,
  path: string,
  options: { query?: string; body?: unknown } = {},
): Promise<RouteResult> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: true,
    readJson: async () => options.body,
  }
  return await routeRequest(runtime, req)
}

async function call(
  runtime: ReturnType<typeof createHostRuntime>,
  method: string,
  path: string,
  options: { query?: string; body?: unknown } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const result = await callRaw(runtime, method, path, options)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

test('批次 A：minScore 生效；非法值显式报错而不是静默忽略', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const high = store.job.upsert(jobInput({ platformJobId: 'high', title: '高分岗' }), T1).id
    const low = store.job.upsert(jobInput({ platformJobId: 'low', title: '低分岗' }), T1).id
    const none = store.job.upsert(jobInput({ platformJobId: 'none', title: '没打分' }), T1).id
    const stamp = { resumeId: 1, rev: 1 }
    store.job.setMatch(high, 88, [{ kind: 'skill', text: '命中', weight: 6 }], stamp)
    store.job.setMatch(low, 40, [{ kind: 'skill', text: '弱', weight: -1 }], stamp)

    const filtered = await call(runtime, 'GET', '/jobs', { query: 'minScore=50' })
    const body = filtered.body as { items: Array<{ id: number }>; total: number }
    assert.deepEqual(body.items.map((job) => job.id), [high])
    assert.equal(body.total, 1, 'total 与列表同口径')

    // 未打分的岗位不会出现在分数筛选结果里（没有分就没法参与按分挑岗位）
    assert.ok(!body.items.some((job) => job.id === none))

    // 非法值：显式 400 + hint（静默忽略会让用户对着"看着筛了其实没筛"的列表做判断）
    const bad = await call(runtime, 'GET', '/jobs', { query: 'minScore=abc' })
    assert.equal(bad.status, 400)
    const tooBig = await call(runtime, 'GET', '/jobs', { query: 'minScore=101' })
    assert.equal(tooBig.status, 400)

    // 按分排序也能跑通（折叠代表规则跟着排序走，这条只确认没把参数写错）
    const sorted = await call(runtime, 'GET', '/jobs', { query: 'orderBy=match_score' })
    const sortedItems = (sorted.body as { items: Array<{ id: number }> }).items
    assert.equal(sortedItems[0]?.id, high, '按匹配分降序：分高的在前（未打分的排最后）')
  } finally {
    cleanup(dir)
  }
})

test('批次 B：excludeBlacklisted 生效，且如实回报隐藏了几条', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const company = store.company.ensure({ name: '某某外包科技', nameNorm: '某某外包科技' }, T1)
    store.company.updateReview(company.id, { blacklisted: true }, T1)
    store.job.upsert(jobInput({ platformJobId: 'linked', companyId: company.id }), T1)
    store.job.upsert(jobInput({ platformJobId: 'orphan', companyId: null }), T1)

    // 不传参数 = 不过滤（服务端永远不静默隐藏；隐藏是界面显式要求的行为）
    const all = await call(runtime, 'GET', '/jobs')
    const allBody = all.body as { total: number; hiddenByBlacklist?: number }
    assert.equal(allBody.total, 2)
    assert.equal(allBody.hiddenByBlacklist, undefined, '没要求排除时不该有隐藏数')

    const excluded = await call(runtime, 'GET', '/jobs', { query: 'excludeBlacklisted=1' })
    const excludedBody = excluded.body as { total: number; hiddenByBlacklist?: number }
    assert.equal(excludedBody.total, 1)
    assert.equal(excludedBody.hiddenByBlacklist, 1, '界面头栏那句"已隐藏 N 条"就是这个数')
  } finally {
    cleanup(dir)
  }
})

test('批次 B2：/jobs/views 整份读写；非法入参逐字段报错', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const empty = await call(runtime, 'GET', '/jobs/views')
    assert.deepEqual((empty.body as { views: unknown[] }).views, [])

    const filters = {
      q: 'Java',
      cities: ['深圳'],
      expBuckets: [],
      eduReqs: [],
      state: 'new',
      minSalary: '',
      minScore: '60',
      excludeFlags: ['outsourcing'],
      excludeBlacklisted: true,
      groupDuplicates: false,
      newWindow: '3d',
      orderBy: 'match_score',
      descending: true,
    }
    const saved = await call(runtime, 'PUT', '/jobs/views', {
      body: { views: [{ id: 'v1', name: '深圳 Java', filters }] },
    })
    assert.equal(saved.status, 200)
    assert.equal((saved.body as { views: unknown[] }).views.length, 1)

    const readBack = await call(runtime, 'GET', '/jobs/views')
    assert.deepEqual((readBack.body as { views: Array<{ name: string }> }).views[0]?.name, '深圳 Java')

    // 非法：指名字段，不静默修正
    const bad = await call(runtime, 'PUT', '/jobs/views', {
      body: { views: [{ id: 'v2', name: '坏的', filters: { ...filters, orderBy: 'salary' } }] },
    })
    assert.equal(bad.status, 400)
    assert.match(String((bad.body as { message?: string }).message ?? ''), /不认识的排序字段/)

    const dup = await call(runtime, 'PUT', '/jobs/views', {
      body: { views: [{ id: 'v1', name: 'A', filters }, { id: 'v1', name: 'B', filters }] },
    })
    assert.equal(dup.status, 400)

    // 空数组 = 清空（整体覆盖写，不是"忽略这次请求"）
    await call(runtime, 'PUT', '/jobs/views', { body: { views: [] } })
    const cleared = await call(runtime, 'GET', '/jobs/views')
    assert.deepEqual((cleared.body as { views: unknown[] }).views, [])
  } finally {
    cleanup(dir)
  }
})

test('批次 D2：/jobs/export 按 id 导 CSV；有 id 不存在就报错而不是少给', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const a = store.job.upsert(jobInput({ platformJobId: 'a', title: '带,逗号的岗' }), T1).id
    const b = store.job.upsert(jobInput({ platformJobId: 'b', title: '普通岗' }), T1).id

    const result = await callRaw(runtime, 'GET', '/jobs/export', { query: `ids=${String(a)},${String(b)}` })
    assert.equal(result.kind, 'bytes')
    if (result.kind !== 'bytes') return
    assert.equal(result.contentType, 'text/csv; charset=utf-8')
    assert.equal(result.disposition, 'attachment')
    assert.match(result.fileName ?? '', /^jobs-\d{4}-\d{2}-\d{2}\.csv$/)
    const text = Buffer.from(result.bytes).toString('utf8')
    assert.ok(text.startsWith('\ufeff'), '带 BOM，Excel 打开不乱码')
    assert.ok(text.includes('"带,逗号的岗"'), '含逗号的字段要加引号')
    assert.ok(text.includes('普通岗'))

    // 有 id 不存在：不能少给一行还不说 —— 显式报错并列出是哪几条
    const missing = await call(runtime, 'GET', '/jobs/export', { query: `ids=${String(a)},999999` })
    assert.equal(missing.status, 400)
    assert.match(String((missing.body as { message?: string }).message ?? ''), /999999/)

    const empty = await call(runtime, 'GET', '/jobs/export', { query: '' })
    assert.equal(empty.status, 400, 'ids 不能为空')
  } finally {
    cleanup(dir)
  }
})

test('批次 A2：/intel/recompute 支持只重算过期分数，并回报剩余条数', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const job = store.job.upsert(jobInput({ platformJobId: 'x' }), T1)
    // 造一条"旧版简历算出来的分"：当前没有启用简历（null / 0），所以它算过期
    store.job.setMatch(job.id, 70, [{ kind: 'skill', text: '命中', weight: 6 }], { resumeId: 1, rev: 1 })
    assert.equal(store.job.countStaleScores({ resumeId: null, rev: 0 }), 1)

    const result = await call(runtime, 'POST', '/intel/recompute', { body: { scope: 'stale' } })
    assert.equal(result.status, 200)
    const body = result.body as { jobs: number; remaining: number; note: string }
    assert.ok(body.jobs >= 1, '至少重算了那一条')
    assert.equal(body.remaining, 0, '重算后不该还有过期的')
    assert.match(body.note, /重算了/)

    // 不认识的 scope：显式报错（别把"每周全量"这种意图打成静默的默认行为）
    const bad = await call(runtime, 'POST', '/intel/recompute', { body: { scope: 'all' } })
    assert.equal(bad.status, 400)
  } finally {
    cleanup(dir)
  }
})
