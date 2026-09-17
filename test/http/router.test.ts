import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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

/** 直接调用路由，不需要造假的 req/res 流对象。 */
async function call(
  runtime: ReturnType<typeof createHostRuntime>,
  method: string,
  path: string,
  options: { query?: string; body?: unknown; sameOrigin?: boolean } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: options.sameOrigin ?? true,
    readJson: async () => options.body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

test('GET /health 报告数据层就绪', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'GET', '/health')
    assert.equal(result.status, 200)
    const body = result.body as { dataReady: boolean; jobCount: number }
    assert.equal(body.dataReady, true)
    assert.equal(body.jobCount, 0)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /jobs 分页与筛选', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    for (let index = 0; index < 5; index += 1) {
      store.job.upsert(
        jobInput({
          platformJobId: `j${String(index)}`,
          title: index % 2 === 0 ? 'Java 工程师' : '前端工程师',
          city: index < 3 ? '深圳' : '杭州',
          salaryMin: 10000 + index * 1000,
        }),
        T1,
      )
    }

    const all = await call(runtime, 'GET', '/jobs', { query: 'page=1&pageSize=2' })
    assert.equal(all.status, 200)
    const page = all.body as { items: unknown[]; total: number; hasMore: boolean; pageSize: number }
    assert.equal(page.pageSize, 2)
    assert.equal(page.items.length, 2)
    assert.equal(page.total, 5)
    assert.equal(page.hasMore, true)

    const second = await call(runtime, 'GET', '/jobs', { query: 'page=2&pageSize=2' })
    assert.equal((second.body as { hasMore: boolean }).hasMore, true)
    const third = await call(runtime, 'GET', '/jobs', { query: 'page=3&pageSize=2' })
    assert.equal((third.body as { hasMore: boolean }).hasMore, false)

    const filtered = await call(runtime, 'GET', '/jobs', { query: 'city=深圳' })
    assert.equal((filtered.body as { total: number }).total, 3)

    const byKeyword = await call(runtime, 'GET', '/jobs', { query: 'q=Java' })
    assert.equal((byKeyword.body as { total: number }).total, 3)

    const bySalary = await call(runtime, 'GET', '/jobs', { query: 'minSalary=13000' })
    assert.equal((bySalary.body as { total: number }).total, 2)

    // 排序：按月薪倒序
    const sorted = await call(runtime, 'GET', '/jobs', { query: 'orderBy=salary_min&desc=1' })
    const items = (sorted.body as { items: Array<{ salaryMin: number }> }).items
    assert.equal(items[0]?.salaryMin, 14000)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /jobs 参数非法要报错而不是静默忽略', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const badState = await call(runtime, 'GET', '/jobs', { query: 'state=不存在的状态' })
    assert.equal(badState.status, 400)
    assert.equal((badState.body as { code: string }).code, 'INVALID_INPUT')

    const badOrder = await call(runtime, 'GET', '/jobs', { query: 'orderBy=; DROP TABLE job' })
    assert.equal(badOrder.status, 400, '排序字段必须走白名单')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /jobs/:id 带出公司画像；不存在就 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const company = store.company.ensure({ name: '某某科技', nameNorm: '某某科技' }, T1)
    const written = store.job.upsert(jobInput({ companyId: company.id }), T1)
    store.company.recomputeProfile(company.id, T1)

    const ok = await call(runtime, 'GET', `/jobs/${String(written.id)}`)
    assert.equal(ok.status, 200)
    const detail = ok.body as {
      job: { title: string; companyName: string | null }
      company: { name: string; jobCount: number } | null
    }
    assert.equal(detail.job.title, '全栈开发工程师')
    assert.equal(detail.job.companyName, '某某科技')
    assert.equal(detail.company?.jobCount, 1)

    const missing = await call(runtime, 'GET', '/jobs/99999')
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { code: string }).code, 'NOT_FOUND')

    const garbage = await call(runtime, 'GET', '/jobs/abc')
    assert.equal(garbage.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /jobs/:id/mark：跨站被拒、非法状态被拒、成功改状态并推事件', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const written = store.job.upsert(jobInput(), T1)

    const crossSite = await call(runtime, 'POST', `/jobs/${String(written.id)}/mark`, {
      body: { state: 'saved' },
      sameOrigin: false,
    })
    assert.equal(crossSite.status, 403)
    assert.equal((crossSite.body as { code: string }).code, 'CROSS_ORIGIN')

    const bad = await call(runtime, 'POST', `/jobs/${String(written.id)}/mark`, { body: { state: '乱写' } })
    assert.equal(bad.status, 400)

    const events: string[] = []
    runtime.events().subscribe((event) => events.push(event.type))

    const ok = await call(runtime, 'POST', `/jobs/${String(written.id)}/mark`, { body: { state: 'saved' } })
    assert.equal(ok.status, 200)
    assert.equal((ok.body as { job: { state: string } }).job.state, 'saved')
    assert.equal(store.job.detail(written.id)?.state, 'saved')
    assert.deepEqual(events, ['job.updated'], '改状态要推一条提示事件')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /today 聚合出 U0 需要的数字', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    store.job.upsert(jobInput({ platformJobId: 'a' }), new Date().toISOString())
    store.job.upsert(jobInput({ platformJobId: 'b' }), '2020-01-01T00:00:00.000Z')
    store.todo.create({ kind: 'adapter-degraded', level: 'urgent', title: '降级了', ref: '51job' }, T1)

    const result = await call(runtime, 'GET', '/today')
    assert.equal(result.status, 200)
    const today = result.body as {
      jobCount: number
      newJobs24h: number
      todos: Array<{ title: string }>
      dataReady: boolean
    }
    assert.equal(today.dataReady, true)
    assert.equal(today.jobCount, 2)
    assert.equal(today.newJobs24h, 1, '只有一条是最近 24 小时见到的')
    assert.equal(today.todos.length, 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /crawl/status 与 /crawl/runs', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'GET', '/crawl/status')
    assert.equal(result.status, 200)
    assert.deepEqual((result.body as { paused: string[] }).paused, [])

    const runs = await call(runtime, 'GET', '/crawl/runs', { query: 'limit=5' })
    assert.equal(runs.status, 200)
    assert.deepEqual((runs.body as { items: unknown[] }).items, [])
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /events 交给传输层开流；未知路径 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const sse = await routeRequest(runtime, {
      method: 'GET',
      path: '/events',
      query: new URLSearchParams(),
      headers: {},
      sameOrigin: true,
      readJson: async () => undefined,
    })
    assert.equal(sse.kind, 'sse')

    const missing = await call(runtime, 'GET', '/nope')
    assert.equal(missing.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('P3：调度状态与默认方案', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const status = await call(runtime, 'GET', '/scheduler/status')
    assert.equal(status.status, 200)
    const body = status.body as {
      scheduling: boolean
      armed: boolean
      readOnly: boolean
      plans: Array<{ name: string; platforms: string[] }>
      lease: { held: boolean; pid: number | null }
    }
    assert.equal(body.readOnly, false, '临时目录里的租约应当被本进程拿到')
    assert.equal(body.lease.held, true)
    assert.equal(body.scheduling, true)
    assert.equal(body.plans.length, 1, '首次启动会自动建一个默认方案')
    assert.deepEqual(body.plans[0]?.platforms, ['51job'])
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('P3：方案的增删改查走路由', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const created = await call(runtime, 'POST', '/plans', {
      body: { name: '杭州测试', platforms: ['51job'], criteria: { keyword: '测试', city: '杭州' }, schedule: { hour: 20, minute: 15 } },
    })
    assert.equal(created.status, 201)
    const plan = (created.body as { plan: { id: number; schedule: { hour: number }; criteria: Record<string, string> } }).plan
    assert.equal(plan.schedule.hour, 20)
    assert.equal(plan.criteria['city'], '杭州')

    const list = await call(runtime, 'GET', '/plans')
    assert.equal((list.body as { items: unknown[] }).items.length, 2)

    const patched = await call(runtime, 'PATCH', `/plans/${String(plan.id)}`, { body: { enabled: false } })
    assert.equal(patched.status, 200)
    assert.equal((patched.body as { plan: { enabled: boolean } }).plan.enabled, false)

    const removed = await call(runtime, 'DELETE', `/plans/${String(plan.id)}`)
    assert.equal(removed.status, 200)
    assert.equal((await call(runtime, 'GET', '/plans')).body !== null, true)
    assert.equal(((await call(runtime, 'GET', '/plans')).body as { items: unknown[] }).items.length, 1)

    // 非法输入与不存在的方案
    assert.equal((await call(runtime, 'POST', '/plans', { body: { name: '', platforms: ['51job'] } })).status, 400)
    assert.equal((await call(runtime, 'DELETE', '/plans/9999')).status, 404)
    assert.equal((await call(runtime, 'POST', '/plans/9999/run', { body: {} })).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('P3：平台概览带出登录态；登录引导与待办关闭', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const platforms = await call(runtime, 'GET', '/platforms')
    assert.equal(platforms.status, 200)
    const items = (platforms.body as { items: Array<{ id: string; health: string; account: { loggedIn: boolean }; login: { state: string } }> }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.id, '51job')
    assert.equal(items[0]?.health, 'healthy')
    assert.equal(items[0]?.account.loggedIn, false, '还没登录过')
    assert.equal(items[0]?.login.state, 'idle')

    const login = await call(runtime, 'GET', '/login/status')
    assert.equal(login.status, 200)
    assert.equal((login.body as { items: unknown[] }).items.length, 1)

    // 未注册平台去登录 → 明确 404，而不是假装成功
    assert.equal((await call(runtime, 'POST', '/platforms/nope/login/start', { body: {} })).status, 404)

    // 待办：造一条再关掉
    const store = runtime.store()
    assert.ok(store)
    const todoId = store.todo.create({ kind: 'catch-up', level: 'warn', title: '补跑' }, T1)
    assert.equal(store.todo.countOpen(), 1)

    const closed = await call(runtime, 'POST', `/todos/${String(todoId)}/close`, { body: {} })
    assert.equal(closed.status, 200)
    assert.equal(store.todo.countOpen(), 0)
    assert.equal((await call(runtime, 'POST', `/todos/${String(todoId)}/close`, { body: {} })).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('P3：变更类请求仍然要过同源校验', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const crossSite = await call(runtime, 'POST', '/plans', {
      body: { name: 'x', platforms: ['51job'] },
      sameOrigin: false,
    })
    assert.equal(crossSite.status, 403)
    assert.equal((await call(runtime, 'GET', '/plans')).status, 200, '读操作不受影响')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('P4：详情带出标注依据与匹配理由；公司画像可单独查', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const company = store.company.ensure({ name: '某某人力资源服务有限公司', nameNorm: '某某' }, T1)
    const written = store.job.upsert(
      jobInput({
        companyId: company.id,
        tags: ['驻场'],
        salaryRaw: '10-40K',
        salaryMin: 10000,
        salaryMax: 40000,
        ...({ jdText: '驻场开发，抗压能力强，底薪+提成上不封顶。' } as Record<string, unknown>),
      }),
      T1,
    )
    // 攒够统计样本，让公司维度的依据也能出现
    for (let index = 0; index < 3; index += 1) {
      store.job.upsert(
        jobInput({ platformJobId: `extra${String(index)}`, companyId: company.id, tags: ['驻场'] }),
        T1,
      )
    }
    runtime.intel().evaluateJob(written.id, T1)
    runtime.intel().recomputeCompany(company.id, T1)

    const detail = await call(runtime, 'GET', `/jobs/${String(written.id)}`)
    assert.equal(detail.status, 200)
    const body = detail.body as {
      job: { flagTypes: string[]; matchScore: number | null }
      flags: Array<{ flagType: string; score: number; evidence: string[] }>
      matchReasons: Array<{ kind: string; text: string }>
      company: { outsourcingScore: number | null; nameKeywordHits: number } | null
    }
    assert.ok(body.job.flagTypes.length > 0, '列表侧也要能看到标注类型')
    assert.ok(body.flags.length > 0)
    // ★ 出口标准：每一条标注都必须带可读依据
    for (const flag of body.flags) {
      assert.ok(flag.evidence.length > 0, `${flag.flagType} 没有依据`)
      assert.ok(flag.evidence.every((line) => typeof line === 'string' && line.length > 0))
    }
    assert.ok(body.flags.some((flag) => flag.flagType === 'outsourcing'))
    // ★ 出口标准：分数必须可解释
    assert.ok(body.matchReasons.length > 0, '匹配分必须带理由')
    assert.equal(body.company?.nameKeywordHits, 1)

    const companyDetail = await call(runtime, 'GET', `/companies/${String(company.id)}`)
    assert.equal(companyDetail.status, 200)
    const companyBody = companyDetail.body as {
      company: { jobCount: number; onsiteRatio: number | null }
      signals: Array<{ type: string; evidence: unknown }>
      jobs: unknown[]
      flagCounts: Record<string, number>
    }
    assert.equal(companyBody.company.jobCount, 4)
    assert.equal(companyBody.company.onsiteRatio, 1)
    assert.ok(companyBody.signals.some((signal) => signal.type === 'name-keyword'))
    assert.ok(companyBody.signals.every((signal) => signal.evidence !== null))
    assert.ok(companyBody.jobs.length > 0)

    assert.equal((await call(runtime, 'GET', '/companies/99999')).status, 404)
    assert.equal((await call(runtime, 'GET', '/companies/abc')).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('P4：词表可读可写，重算能刷新标注', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const list = await call(runtime, 'GET', '/intel/dictionary')
    assert.equal(list.status, 200)
    const seeded = (list.body as { items: unknown[] }).items.length
    assert.ok(seeded > 20, '启动时应当播种内置词表')

    const added = await call(runtime, 'POST', '/intel/dictionary', {
      body: { kind: 'jargon', term: '我们是一个大家庭', meaning: '常见于边界不清、加班无补偿的团队', weight: 2 },
    })
    assert.equal(added.status, 200)
    assert.ok((added.body as { items: unknown[] }).items.length > seeded)

    // 非法类别要明确报错
    assert.equal(
      (await call(runtime, 'POST', '/intel/dictionary', { body: { kind: '乱写', term: 'x' } })).status,
      400,
    )
    assert.equal((await call(runtime, 'POST', '/intel/dictionary', { body: { kind: 'jargon', term: '' } })).status, 400)

    const store = runtime.store()
    assert.ok(store)
    store.job.upsert(jobInput(), T1)
    const recomputed = await call(runtime, 'POST', '/intel/recompute', { body: {} })
    assert.equal(recomputed.status, 200)
    assert.ok((recomputed.body as { jobs: number }).jobs >= 1)

    const detail = await call(runtime, 'GET', '/jobs/' + String(store.job.query({}, 1)[0]?.id ?? 0))
    assert.equal(detail.status, 200)
    assert.ok((detail.body as { matchReasons: unknown[] }).matchReasons.length > 0)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('数据层挂了：插件仍挂着，/health 与 /today 如实报告，数据路由 503', async () => {  const dir = tempDataDir()
  mkdirSync(dir, { recursive: true })
  // 造一个「有表但没有 application_id」的库 → 归属校验必须拒绝
  const foreign = new DatabaseSync(join(dir, 'data.db'))
  foreign.exec('CREATE TABLE other(id INTEGER PRIMARY KEY)')
  foreign.close()

  const runtime = createHostRuntime({ dataDir: dir })
  try {
    await runtime.ready()
    assert.equal(runtime.isReady(), false)

    const health = await call(runtime, 'GET', '/health')
    assert.equal(health.status, 200)
    assert.equal((health.body as { dataReady: boolean }).dataReady, false)
    assert.ok((health.body as { dataError: string | null }).dataError !== null)

    const today = await call(runtime, 'GET', '/today')
    assert.equal(today.status, 200)
    assert.equal((today.body as { dataReady: boolean }).dataReady, false)

    const jobs = await call(runtime, 'GET', '/jobs')
    assert.equal(jobs.status, 503)
    assert.equal((jobs.body as { code: string }).code, 'DATA_UNAVAILABLE')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
