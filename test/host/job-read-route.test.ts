import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeRequest, type RouteRequest, type RouteResult } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

/**
 * 岗位**已读**这条线（2026-09-21）。
 *
 * 起因是一个用户直接感受到的毛病："我浏览了该岗位，它还显示新" ——
 * 查下来没有任何地方会自动标已读：点一条岗位只是 `setSelected`，一个写请求都不发。
 * 根因是 `state` 一个字段背了两件事：**已读**（事实，应自动）与**处置**（决定，只能手动）。
 *
 * 修法：单开 `read_at` + 一条 `/jobs/:id/read`；`state` 只在 `new → seen` 时被顺手推一下。
 * 这个文件钉的就是那条端点与它和列表计数（`unread`）的配合。
 */

const T = '2026-09-16T01:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: '173674707',
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
    sourceUrl: 'https://jobs.51job.com/all/173674707.html',
    publishedAt: null,
    ...overrides,
  }
}

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

/**
 * 打一条路由。
 *
 * ⚠️ `path` **不带** `?query`：路由是按 `/` 切段的，查询串混在 path 里会把
 * 最后一段变成 `jobs?city=…`，于是谁都匹配不上（真实服务器也是分开的）。
 * 查询参数走 `query` 形参。
 */
async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  body?: unknown,
  query = '',
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(query),
    headers: {},
    sameOrigin: true,
    readJson: async () => body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

function seed(runtime: HostRuntime, overrides: Partial<JobUpsertInput> = {}): number {
  const service = runtime.jobs()
  if (service === undefined) throw new Error('岗位服务没起来')
  return service.upsert(jobInput(overrides), T).id
}

test('POST /jobs/:id/read：记下已读时间，并把「新」推成「已读」', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const id = seed(runtime)
    assert.equal(runtime.jobs()?.detail(id).state, 'new')
    assert.equal(runtime.jobs()?.detail(id).readAt, null)

    const result = await call(runtime, 'POST', `/jobs/${String(id)}/read`)
    assert.equal(result.status, 200)
    const job = (result.body as { job: { state: string; readAt: string | null } }).job
    assert.equal(job.state, 'seen', '看过就不该再显示「新」')
    assert.ok(job.readAt !== null, '已读时间要落下来（它是"我看过"的事实）')
  } finally {
    cleanup(dir)
  }
})

test('POST /jobs/:id/read：幂等 —— 重复打开不改第一次的时间', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const id = seed(runtime)
    const first = await call(runtime, 'POST', `/jobs/${String(id)}/read`)
    const firstAt = (first.body as { job: { readAt: string } }).job.readAt

    const second = await call(runtime, 'POST', `/jobs/${String(id)}/read`)
    assert.equal(second.status, 200, '重复打开是安全的（界面每次点开都会调）')
    assert.equal((second.body as { job: { readAt: string } }).job.readAt, firstAt)
  } finally {
    cleanup(dir)
  }
})

test('POST /jobs/:id/read：已收藏 / 已忽略的岗位**不许被改掉处置态**', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const id = seed(runtime)
    runtime.jobs()?.mark(id, 'saved')

    const result = await call(runtime, 'POST', `/jobs/${String(id)}/read`)
    const job = (result.body as { job: { state: string; readAt: string | null } }).job
    assert.equal(job.state, 'saved', '打开一次详情不该动用户的决定')
    assert.ok(job.readAt !== null, '但"我看过"照样记 —— 两件事互不干扰')
  } finally {
    cleanup(dir)
  }
})

test('POST /jobs/:id/read：岗位不存在 → 404（不静默成功）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // ⚠️ 路由层把 DomainError 转成 JSON 响应（不抛给调用方）—— 所以要断 status
    const result = await call(runtime, 'POST', '/jobs/999999/read')
    assert.equal(result.status, 404, '读一条不存在的岗位必须如实报错，否则界面会把失败当成功')
    assert.match(JSON.stringify(result.body), /岗位不存在/)
  } finally {
    cleanup(dir)
  }
})

test('GET /jobs：`unread` 是**全库**口径，读过一条就少一条', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const a = seed(runtime, { platformJobId: 'a' })
    seed(runtime, { platformJobId: 'b' })

    const before = await call(runtime, 'GET', '/jobs')
    assert.equal((before.body as { unread: number }).unread, 2, '刚抓到的两条都还没读过')

    await call(runtime, 'POST', `/jobs/${String(a)}/read`)

    const after = await call(runtime, 'GET', '/jobs')
    assert.equal((after.body as { unread: number }).unread, 1, '读过一条，「N 条新」就该少一条')

    // 关键：它**不跟筛选走** —— 它是"我库里还堆着多少条没扫过"
    const filtered = await call(runtime, 'GET', '/jobs', undefined, 'city=不存在的城市')
    assert.equal((filtered.body as { unread: number }).unread, 1, '筛掉全部结果，未读数依然是全库口径')
    assert.equal((filtered.body as { total: number }).total, 0)
  } finally {
    cleanup(dir)
  }
})
