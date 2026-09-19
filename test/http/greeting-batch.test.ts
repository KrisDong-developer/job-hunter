/**
 * 批量打招呼的**路由契约**测试（D3 / U1）。
 *
 * 走真实 runtime + 真实 HTTP 路由，但**不碰浏览器**：这里要钉的是协议与"逐条不整批失败"，
 * 而不是真的把消息发出去（那条路径需要登录态 + 页面，由 `test/host/greeting-batch.test.ts`
 * 用注入依赖覆盖其逻辑，`test/tools/zhipin-send-one-greeting.ts` 走真机）。
 *
 * 这里能覆盖到的真实结论本身就有价值：**目前只有 BOSS 实现了打招呼动作**，
 * 所以"跨平台勾一批"的真实结果就是"能发几个、其余发不了" —— 这正是预览要提前说清的事。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BATCH_MAX_ITEMS } from '../../src/shared/constants.js'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: 'zhipin',
    platformJobId: 'gb-1',
    title: '前端工程师',
    companyId: null,
    salaryRaw: '20-30K',
    salaryMin: 20000,
    salaryMax: 30000,
    salaryMonths: null,
    city: '深圳',
    district: '',
    expReq: '3-5年',
    eduReq: '本科',
    tags: [],
    sourceUrl: 'https://example.com/gb-1',
    publishedAt: T,
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
 * 把闸门调到"可以走到发送那一步"的状态。
 *
 * 三件事缺一不可，否则用例会随运行时段漂移或在隐身那一关就整体被拒：
 *   1. 关掉发送窗口与随机休息日 —— 它们按**本地时钟**判定（默认窗口 09:00-16:00），
 *      晚上跑测试就会得到"现在不在发送窗口内"；
 *   2. 关掉同公司冷却 —— 否则测试之间会互相污染；
 *   3. 逐个平台确认「对当前雇主隐藏」已开 —— 高危动作（`danger: 'high'`）的强制前置（D4）。
 *
 * ⚠️ `loggedIn` 刻意**保持 false**：这批用例要钉的正是"未登录"与"平台不支持"这两种
 * **过了闸门之后**才暴露的原因（`greetingReadinessOf`）。闸门本身必须先过 ——
 * 顺序反了的话，用户看到的会是"未确认对当前雇主隐藏（liepin）"，
 * 而真正的事实是"猎聘压根没有打招呼入口"。
 */
async function openGate(runtime: HostRuntime, platformIds: string[]): Promise<void> {
  const result = await routeRequest(runtime, {
    method: 'PATCH',
    path: '/settings',
    query: new URLSearchParams(''),
    headers: {},
    sameOrigin: true,
    readJson: async () => ({
      guard: {
        levels: { l3Greeting: true, l4Application: false, l4Reply: false },
        cooldownMinutes: 0,
        sendWindow: '',
        dayOffProbability: 0,
      },
    }),
  })
  assert.equal(result.kind === 'json' ? result.status : 0, 200, '界面改自己的风险开关是允许的')

  const store = runtime.store()
  assert.ok(store !== undefined)
  for (const platformId of platformIds) {
    store.account.upsert(
      { platformId, loggedIn: false, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
  }
}

async function call(
  runtime: HostRuntime,
  path: string,
  body: unknown,
  sameOrigin = true,
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const req: RouteRequest = {
    method: 'POST',
    path,
    query: new URLSearchParams(''),
    headers: {},
    sameOrigin,
    readJson: async () => body,
  }
  const result = await routeRequest(runtime, req)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

// ─────────────────────────────────────────────────────────────────────
// 预览
// ─────────────────────────────────────────────────────────────────────

test('POST /greeting/send-batch/preview：逐条给出"能不能发 + 为什么"', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    // BOSS 实现了 sayHello 但**未登录**；猎聘是刻意不实现打招呼的
    const zhipin = store.job.upsert(jobInput({ platformId: 'zhipin', platformJobId: 'p-1' }), T).id
    const liepin = store.job.upsert(jobInput({ platformId: 'liepin', platformJobId: 'p-2' }), T).id

    const result = await call(runtime, '/greeting/send-batch/preview', { jobIds: [zhipin, liepin, 999_999] })
    assert.equal(result.status, 200)
    const plan = (result.body as {
      plan: {
        items: Array<{ jobId: number; willSend: boolean; text: string | null; blocker: { code: string; hint?: string } | null }>
        sendable: number
        blocked: number
        batchMax: number
        note: string
      }
    }).plan

    assert.equal(plan.items.length, 3)
    assert.equal(plan.sendable, 0, '未登录 + 平台不支持 → 一条都发不出去')
    assert.equal(plan.blocked, 3)
    assert.equal(plan.batchMax, BATCH_MAX_ITEMS)

    const byId = new Map(plan.items.map((item) => [item.jobId, item]))
    assert.equal(byId.get(999_999)?.blocker?.code, 'missing')
    assert.equal(
      byId.get(liepin)?.blocker?.code,
      'platform_unsupported',
      '猎聘适配器刻意没实现打招呼 —— 要说"平台不支持"，而不是含糊的失败',
    )
    assert.ok((byId.get(liepin)?.blocker?.hint ?? '').length > 0, '要给出下一步，而不是一句"发不了"')
    assert.equal(byId.get(zhipin)?.blocker?.code, 'not_logged_in')
    assert.ok(plan.note.includes('预测'), plan.note)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('预览是只读的：反复调用不改变任何状态', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const jobId = store.job.upsert(jobInput({ platformId: 'liepin', platformJobId: 'ro-1' }), T).id
    const before = store.pipeline.listGreetings({}).length
    const auditsBefore = store.audit.list(10).length

    await call(runtime, '/greeting/send-batch/preview', { jobIds: [jobId] })
    await call(runtime, '/greeting/send-batch/preview', { jobIds: [jobId] })

    assert.equal(store.pipeline.listGreetings({}).length, before, '预览一条打招呼记录都不该写')
    // 预览走的是 `guard.preview`（只读预检），写审计的是真正执行的那一次 ——
    // 看了两次计划就多两条审计，等于把"计划"伪装成了"动作"
    assert.equal(store.audit.list(10).length, auditsBefore, '预览不该留审计')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('预览：jobIds 缺失或为空 → 400（而不是返回一个空计划让人以为"没什么可发"）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    assert.equal((await call(runtime, '/greeting/send-batch/preview', {})).status, 400)
    assert.equal((await call(runtime, '/greeting/send-batch/preview', { jobIds: [] })).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 发送
// ─────────────────────────────────────────────────────────────────────

test('发送必须带 confirm：不带就是 400，且提示先看预览', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, '/greeting/send-batch', { items: [{ jobId: 1 }] })
    assert.equal(result.status, 400)
    assert.ok(((result.body as { hint?: string }).hint ?? '').includes('preview'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 逐条回执而不是整批失败：两种"发不了"各自成条，脚本继续跑完', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    // 闸门先过（隐身/窗口/休息日），剩下的两种"发不了"才有机会各自成条
    await openGate(runtime, ['zhipin', 'liepin'])
    const zhipin = store.job.upsert(jobInput({ platformId: 'zhipin', platformJobId: 's-1' }), T).id
    const liepin = store.job.upsert(jobInput({ platformId: 'liepin', platformJobId: 's-2' }), T).id

    const result = await call(runtime, '/greeting/send-batch', {
      confirm: true,
      items: [{ jobId: zhipin, text: '您好' }, { jobId: liepin, text: '您好' }],
    })
    assert.equal(result.status, 200, '个别条发不出去不该让整个请求失败')
    const batch = (result.body as {
      result: {
        receipts: Array<{ jobId: number; ok: boolean; code: string | null; message: string | null }>
        sent: number
        failed: number
        note: string
      }
    }).result

    assert.equal(batch.sent, 0)
    assert.equal(batch.failed, 2, '两条各自失败，而不是抛一个异常就此中断')
    assert.deepEqual(
      batch.receipts.map((receipt) => receipt.jobId),
      [zhipin, liepin],
    )
    assert.equal(batch.receipts[0]?.code, 'NOT_LOGGED_IN', 'BOSS：未登录')
    assert.equal(batch.receipts[1]?.code, 'ADAPTER_BROKEN', '猎聘：适配器没实现打招呼')
    assert.ok(batch.receipts.every((receipt) => receipt.ok === false))
    assert.ok(batch.note.includes('逐条'), batch.note)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('一条失败不影响后面的条：坏 id 夹在中间也照样走完', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const liepin = store.job.upsert(jobInput({ platformId: 'liepin', platformJobId: 'm-1' }), T).id

    const result = await call(runtime, '/greeting/send-batch', {
      confirm: true,
      items: [{ jobId: liepin }, { jobId: 999_999 }, { jobId: liepin }],
    })
    const receipts = (result.body as { result: { receipts: Array<{ ok: boolean; code: string | null }> } }).result.receipts
    assert.equal(receipts.length, 3, '三条都要有回执（中间的坏 id 不吞掉后面的）')
    assert.equal(receipts[1]?.code, 'NOT_FOUND')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('条数上限与参数形状', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const tooMany = Array.from({ length: BATCH_MAX_ITEMS + 1 }, (_unused, index) => ({ jobId: index + 1 }))
    const over = await call(runtime, '/greeting/send-batch', { confirm: true, items: tooMany })
    assert.equal(over.status, 400)
    assert.ok(((over.body as { message?: string }).message ?? '').includes(String(BATCH_MAX_ITEMS)))

    assert.equal((await call(runtime, '/greeting/send-batch', { confirm: true, items: [] })).status, 400)
    assert.equal((await call(runtime, '/greeting/send-batch', { confirm: true, items: [{ jobId: 0 }] })).status, 400)
    // 非对象成员也要挡住（脏 body 不该变成一条 jobId=NaN 的发送尝试）
    assert.equal((await call(runtime, '/greeting/send-batch', { confirm: true, items: ['x'] })).status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('跨站来源不许批量发送/预览（与其它危险动作同一条纪律）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    assert.equal((await call(runtime, '/greeting/send-batch', { confirm: true, items: [{ jobId: 1 }] }, false)).status, 403)
    assert.equal((await call(runtime, '/greeting/send-batch/preview', { jobIds: [1] }, false)).status, 403)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('路由字面量优先：批量路径不会被 /greeting/send 吃掉', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // 若 `send-batch` 被当成 `/greeting/:id` 之类处理，这里会得到 404/405 之类的形状错误，
    // 而不是"需要确认"的 400
    const result = await call(runtime, '/greeting/send-batch', { items: [] })
    assert.equal(result.status, 400)
    assert.ok(((result.body as { hint?: string }).hint ?? '').includes('preview'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
