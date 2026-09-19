/**
 * G6：面试错题本的**写入口**。
 *
 * 在这个文件之前，`question_note` 表、仓储方法与 `interviews.prep` 的读取都在，
 * 但 `upsertQuestionNote` **零调用** —— 于是准备包里那段"之前记过的错题"永远是空的。
 * 所以这里断言的不是"路由返回 201"，而是**那条链路真的通了**：
 * 记一道题 → `prep` 里必须看得到 → 同一道题再记一次必须**累加次数**而不是新增一行
 * （"这题被问过 3 次"正是错题本存在的理由：反复被问的才是必须背下来的）。
 *
 * 本文件不发任何网络请求，也不开浏览器。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(companyId: number | null): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'q-1',
    title: '高级前端工程师',
    companyId,
    salaryRaw: '25-40K',
    salaryMin: 25000,
    salaryMax: 40000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/q-1.html',
    publishedAt: T,
  }
}

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { query?: string; body?: unknown } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: true,
    readJson: async () => options.body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

/** 造一场面试（走真实路由），返回 { jobId, interviewId, companyId }。 */
async function seedInterview(runtime: HostRuntime): Promise<{ jobId: number; interviewId: number; companyId: number }> {
  const store = runtime.store()
  assert.ok(store !== undefined)
  const company = store.company.ensure({ name: '某互联网公司', nameNorm: '某互联网公司' }, T)
  const jobId = store.job.upsert(jobInput(company.id), T).id
  const created = await call(runtime, 'POST', '/interviews', {
    body: { jobId, at: '2026-09-18T14:00:00+08:00', kind: 'video' },
  })
  assert.equal(created.status, 201)
  const interviewId = (created.body as { interview: { id: number } }).interview.id
  return { jobId, interviewId, companyId: company.id }
}

test('记一道题 → prep 里看得到（这才是这个功能存在的理由）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { interviewId, companyId } = await seedInterview(runtime)

    const added = await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, {
      body: {
        question: '你项目里那个超时是怎么处理的',
        myAnswer: '说了用连接池，但没说具体参数',
        betterAnswer: '先讲清定性：超时来源是哪里，再讲参数与压测数据',
        topic: '性能',
      },
    })
    assert.equal(added.status, 201)
    const note = (added.body as { question: { id: number; times: number; companyId: number | null } }).question
    assert.equal(note.times, 1)
    assert.equal(note.companyId, companyId, '公司要从面试关联的岗位自动补上（用户不该再选一次）')

    // 链路通的证据：准备包（它一直在读错题本）现在真的读到了东西
    const prep = await call(runtime, 'GET', `/interviews/${String(interviewId)}/prep`)
    assert.equal(prep.status, 200)
    const notes = (prep.body as { questionNotes: Array<{ question: string; betterAnswer: string }> }).questionNotes
    assert.equal(notes.length, 1)
    assert.equal(notes[0]?.question, '你项目里那个超时是怎么处理的')
    assert.ok(
      (notes[0]?.betterAnswer ?? '').includes('压测'),
      '准备包里要能看到"上次整理的答法"，否则面试前还得自己去翻错题列表',
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('同一道题再记一次是**累加次数**，不是新增一行', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { interviewId } = await seedInterview(runtime)
    const body = { question: '介绍一下你最有成就感的项目', topic: '项目' }

    const first = await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, { body })
    const second = await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, { body })
    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    assert.equal((second.body as { question: { times: number } }).question.times, 2)

    const list = await call(runtime, 'GET', '/questions')
    const items = (list.body as { items: unknown[] }).items
    assert.equal(items.length, 1, '同一道题只该有一行')
    assert.equal((items[0] as { times: number }).times, 2)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('题目为空 / 面试不存在：都必须明确拒绝', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { interviewId } = await seedInterview(runtime)

    const empty = await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, {
      body: { question: '   ' },
    })
    assert.equal(empty.status, 400, '空题目不该写进错题本')

    const missing = await call(runtime, 'POST', '/interviews/9999/questions', {
      body: { question: '这道题没有归属的面试' },
    })
    assert.equal(missing.status, 404)

    // 非数字 id 是 400（打错的路径不该命中数据）
    const badId = await call(runtime, 'POST', '/interviews/abc/questions', { body: { question: 'x' } })
    assert.equal(badId.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('改答案不动次数；删除后再删是 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { interviewId } = await seedInterview(runtime)
    const added = await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, {
      body: { question: 'HTTP 缓存怎么控制', myAnswer: '说了 Cache-Control' },
    })
    const id = (added.body as { question: { id: number } }).question.id

    const patched = await call(runtime, 'PATCH', `/questions/${String(id)}`, {
      body: { betterAnswer: '补上 ETag / 协商缓存，以及为什么它比强缓存更安全' },
    })
    assert.equal(patched.status, 200)
    const updated = (patched.body as { question: { betterAnswer: string; times: number } }).question
    assert.ok(updated.betterAnswer.includes('ETag'))
    assert.equal(updated.times, 1, 'times 是事实，编辑答案不该动它')

    const removed = await call(runtime, 'DELETE', `/questions/${String(id)}`)
    assert.equal(removed.status, 200)
    const again = await call(runtime, 'DELETE', `/questions/${String(id)}`)
    assert.equal(again.status, 404)
    const list = await call(runtime, 'GET', '/questions')
    assert.deepEqual((list.body as { items: unknown[] }).items, [])
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('按主题筛选：只拿得到那一类', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { interviewId } = await seedInterview(runtime)
    await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, {
      body: { question: 'GC 分代是什么', topic: 'JVM' },
    })
    await call(runtime, 'POST', `/interviews/${String(interviewId)}/questions`, {
      body: { question: '为什么离职', topic: 'HR' },
    })

    const filtered = await call(runtime, 'GET', '/questions', { query: 'topic=JVM' })
    const items = (filtered.body as { items: Array<{ question: string }> }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.question, 'GC 分代是什么')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
