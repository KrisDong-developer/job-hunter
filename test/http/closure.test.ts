// A/B/C/D 闭环：把"写到库却无入口"的数据补齐读/改/处置端点。
// 覆盖：待办列表+筛选+待确认动作恢复、企业人工复核、去重拆分、跟进建议处置、批量标记。
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

test('A：GET /todos 列表 + kind/level 筛选 + countOpen；GET /todos/:id', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    store.todo.create({ kind: 'adapter-degraded', level: 'urgent', title: '降级了', ref: '51job' }, T1)
    store.todo.create({ kind: 'catch-up', level: 'warn', title: '补跑', ref: '1' }, T1)

    const all = await call(runtime, 'GET', '/todos')
    assert.equal(all.status, 200)
    const body = all.body as { items: Array<{ kind: string; level: string; title: string }>; countOpen: number }
    assert.equal(body.countOpen, 2)
    assert.equal(body.items.length, 2)

    const urgent = await call(runtime, 'GET', '/todos', { query: 'level=urgent' })
    assert.equal(((urgent.body as { items: unknown[] }).items as Array<{ level: string }>).length, 1)
    assert.equal(((urgent.body as { items: Array<{ level: string }> }).items)[0]?.level, 'urgent')

    const catchUp = await call(runtime, 'GET', '/todos', { query: 'kind=catch-up' })
    const catchUpItems = (catchUp.body as { items: Array<{ kind: string }> }).items
    assert.equal(catchUpItems.length, 1)
    assert.equal(catchUpItems[0]?.kind, 'catch-up')

    // 非法筛选要 400
    assert.equal((await call(runtime, 'GET', '/todos', { query: 'kind=乱写' })).status, 400)

    const id = (all.body as { items: Array<{ id: number }> }).items[0]?.id ?? -1
    const detail = await call(runtime, 'GET', `/todos/${String(id)}`)
    assert.equal(detail.status, 200)
    assert.equal((detail.body as { title: string }).title, '降级了')
    assert.equal((await call(runtime, 'GET', '/todos/99999')).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('D：POST /todos/:id/confirm-actions/resume 关闭并返回可执行意图', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const todoId = store.todo.create(
      {
        kind: 'confirm-action',
        level: 'warn',
        title: '有一个动作等你确认：greeting.send',
        ref: null,
        detail: {
          action: 'greeting.send',
          actor: 'model',
          target: { jobId: 7, platformId: '51job' },
          reason: '审批无人响应',
        },
      },
      T1,
    )

    const resumed = await call(runtime, 'POST', `/todos/${String(todoId)}/confirm-actions/resume`, { body: {} })
    assert.equal(resumed.status, 200)
    const intent = (resumed.body as { intent: { action: string; actor: string; target: { jobId: number } } }).intent
    assert.equal(intent.action, 'greeting.send')
    assert.equal(intent.target.jobId, 7)
    assert.equal(store.todo.countOpen(), 0, '恢复后应关闭该待办')

    // 已关闭 / 非 confirm-action / 缺少目标：都要报错而不是假装成功
    assert.equal((await call(runtime, 'POST', `/todos/${String(todoId)}/confirm-actions/resume`, { body: {} })).status, 404)

    const plainId = store.todo.create({ kind: 'catch-up', level: 'warn', title: '普通待办' }, T1)
    assert.equal((await call(runtime, 'POST', `/todos/${String(plainId)}/confirm-actions/resume`, { body: {} })).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('C：GET /companies 列表 + PATCH /companies/:id 人工复核（黑名单/备注/人工打标）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const a = store.company.ensure({ name: '某外包公司', nameNorm: '某外包公司' }, T1)
    store.job.upsert(jobInput({ companyId: a.id }), T1)
    store.company.recomputeProfile(a.id, T1)

    const list = await call(runtime, 'GET', '/companies')
    assert.equal(list.status, 200)
    const listBody = list.body as { items: Array<{ company: { blacklisted: boolean }; profile: { jobCount: number } }>; total: number }
    assert.equal(listBody.total, 1)
    assert.equal(listBody.items[0]?.company.blacklisted, false, '默认不在黑名单')
    assert.equal(listBody.items[0]?.profile.jobCount, 1)

    const reviewed = await call(runtime, 'PATCH', `/companies/${String(a.id)}`, {
      body: { blacklisted: true, note: '骗子', manualLabel: 'fraud' },
    })
    assert.equal(reviewed.status, 200)
    const reviewedBody = reviewed.body as { reviewed: { company: { blacklisted: boolean; note: string }; profile: { manualLabel: string | null } } }
    assert.equal(reviewedBody.reviewed.company.blacklisted, true)
    assert.equal(reviewedBody.reviewed.company.note, '骗子')
    assert.equal(reviewedBody.reviewed.profile.manualLabel, 'fraud')

    const filtered = await call(runtime, 'GET', '/companies', { query: 'blacklisted=1&manualLabel=fraud' })
    assert.equal(((filtered.body as { items: unknown[] }).items).length, 1)

    // 只写白名单键：body 里混入 noise 必须被忽略
    const cleanPatch = await call(runtime, 'PATCH', `/companies/${String(a.id)}`, { body: { blacklisted: false, rev: 999 } })
    assert.equal((cleanPatch.body as { reviewed: { company: { blacklisted: boolean } } }).reviewed.company.blacklisted, false)

    assert.equal((await call(runtime, 'PATCH', '/companies/99999', { body: { blacklisted: true } })).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('C：去重分组可拆分（split）与整组删除（delete）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const j1 = store.job.upsert(jobInput({ platformId: '51job', platformJobId: 'a1' }), T1).id
    const j2 = store.job.upsert(jobInput({ platformJobId: 'a2', platformId: 'zhaopin' }), T1).id
    const groupId = store.dedupGroup.create({ primaryJobId: j1, memberIds: [j1, j2], basis: '同名同城同档', score: 0.95 }, T1)
    assert.equal(store.dedupGroup.findByJob(j2)?.id, groupId)

    const groups = await call(runtime, 'GET', '/dedup/groups')
    assert.equal(groups.status, 200)
    const items = (groups.body as { items: Array<{ id: number; members: Array<{ id: number; isPrimary: boolean }> }> }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.members.length, 2)

    // split 拆出一个 → 剩余 1 个成员时分组合自动删除
    const split = await call(runtime, 'POST', `/dedup/groups/${String(groupId)}/split`, { body: { jobId: j2 } })
    assert.equal(split.status, 200)
    assert.equal(store.dedupGroup.get(groupId), undefined, '只剩一个成员的分组应被删除')
    assert.equal(store.dedupGroup.findByJob(j2), undefined, '拆出的岗位应脱离分组')
    assert.equal(store.dedupGroup.findByJob(j1), undefined, '剩余成员也随整组删除而独立')

    // 重建分组再整组删除
    const g2 = store.dedupGroup.create({ primaryJobId: j1, memberIds: [j1, j2], basis: 'again', score: 0.9 }, T1)
    const del = await call(runtime, 'DELETE', `/dedup/groups/${String(g2)}`)
    assert.equal(del.status, 200)
    assert.equal(store.dedupGroup.count(), 0)
    assert.equal(store.dedupGroup.findByJob(j1), undefined)

    assert.equal((await call(runtime, 'DELETE', '/dedup/groups/99999')).status, 404)
    assert.equal((await call(runtime, 'POST', `/dedup/groups/${String(g2)}/split`, { body: { jobId: 123456 } })).status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('B：POST /followups/resolve 处置跟进建议（jobId+kind）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    // 造一条"已读未回超时"的打招呼记录：状态 read + 超过 7 天 → 会进建议
    // 相对"真实当前时刻"回拨，因为 pipeline 的 clock 是系统时钟。
    const realNow = new Date()
    const tenDaysAgo = new Date(realNow.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const eightDaysAgo = new Date(realNow.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const j1 = store.job.upsert(jobInput({ platformJobId: 'f1' }), tenDaysAgo).id
    store.pipeline.createGreeting(
      { jobId: j1, platformId: '51job', templateId: null, content: '您好', channel: 'platform', actor: 'gui' },
      tenDaysAgo,
    )
    const greeting = store.pipeline.latestGreeting(j1)
    assert.ok(greeting)
    store.pipeline.advanceGreeting(greeting.id, 'read', eightDaysAgo)

    const before = await call(runtime, 'GET', '/followups')
    assert.equal(
      ((before.body as { items: Array<{ kind: string }> }).items).some((item) => item.kind === 'read-no-reply'),
      true,
      '超时应产生一条降级建议',
    )

    const resolved = await call(runtime, 'POST', '/followups/resolve', { body: { jobId: j1, kind: 'read-no-reply' } })
    assert.equal(resolved.status, 200)

    const after = await call(runtime, 'GET', '/followups')
    assert.equal(
      ((after.body as { items: Array<{ kind: string }> }).items).some((item) => item.kind === 'read-no-reply'),
      false,
      '已处置的建议不应再返回',
    )

    // 非法 kind / 缺 jobId
    assert.equal((await call(runtime, 'POST', '/followups/resolve', { body: { jobId: 1, kind: '乱写' } })).status, 400)
    assert.equal((await call(runtime, 'POST', '/followups/resolve', { body: { jobId: 1 } })).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('批量岗位标记 POST /jobs/batch/mark', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store)
    const ids: number[] = []
    for (let index = 0; index < 3; index += 1) {
      ids.push(store.job.upsert(jobInput({ platformJobId: `b${String(index)}` }), T1).id)
    }

    const events: string[] = []
    runtime.events().subscribe((event) => events.push(event.type))

    const ok = await call(runtime, 'POST', '/jobs/batch/mark', { body: { ids, state: 'saved' } })
    assert.equal(ok.status, 200)
    const body = ok.body as { applied: Array<{ id: number }>; total: number; missing: number[] }
    assert.equal(body.total, 3)
    assert.deepEqual(body.missing, [])
    for (const id of ids) assert.equal(store.job.detail(id)?.state, 'saved')
    assert.ok(events.includes('jobs.marked'), '要推一条批量事件')

    // 部分不存在也能如实报告
    const partial = await call(runtime, 'POST', '/jobs/batch/mark', { body: { ids: [...ids, 999999], state: 'ignored' } })
    assert.equal((partial.body as { total: number; missing: number[] }).total, 3)
    assert.deepEqual((partial.body as { missing: number[] }).missing, [999999])

    // 非法状态 / 空 ids
    assert.equal((await call(runtime, 'POST', '/jobs/batch/mark', { body: { ids, state: '乱写' } })).status, 400)
    assert.equal((await call(runtime, 'POST', '/jobs/batch/mark', { body: { ids: [], state: 'saved' } })).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})