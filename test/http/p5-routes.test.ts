import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { writeGuardConfig } from '../../src/host/guard/rules.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p5-1',
    title: '高级前端工程师',
    companyId: null,
    salaryRaw: '25-40K',
    salaryMin: 25000,
    salaryMax: 40000,
    salaryMonths: null,
    city: '深圳',
    district: '南山区',
    expReq: '3-5年',
    eduReq: '本科',
    tags: ['react'],
    sourceUrl: 'https://jobs.51job.com/all/p5-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。',
    ...overrides,
  }
}

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  // 发送窗口/休息日按**本地时钟**判定，会让用例随时段漂移 —— 这里统一关掉；
  // 它们自己的行为在 guard 专项测试里用受控窗口测。
  const store = runtime.store()
  if (store !== undefined) writeGuardConfig(store, { sendWindow: '', dayOffProbability: 0 }, T)
  return { runtime, dir }
}

async function call(
  runtime: HostRuntime,
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

test('GET /settings 给出 ai 与 guard 两端配置，以及"模型能改什么"', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'GET', '/settings')
    assert.equal(result.status, 200)
    const body = result.body as {
      ai: { enabled: boolean }
      guard: { requireApproval: boolean; auditEnabled: boolean }
      derived: { purposes: unknown[]; modelForbidden: string[] }
    }
    assert.equal(body.ai.enabled, true)
    assert.equal(body.guard.requireApproval, true, '默认必须审批')
    assert.equal(body.guard.auditEnabled, true, '默认必须审计')
    assert.ok(body.derived.purposes.length > 0)
    assert.ok(body.derived.modelForbidden.includes('requireApproval'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('PATCH /settings 改用途开关；界面改禁止项是允许的（那是用户自己的开关）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const off = await call(runtime, 'PATCH', '/settings', {
      body: { ai: { purposes: { greeting_draft: false } } },
    })
    assert.equal(off.status, 200)
    const afterAi = off.body as { settings: { ai: { purposes: Record<string, boolean> } } }
    assert.equal(afterAi.settings.ai.purposes['greeting_draft'], false)
    // 没提到的用途保持原值
    assert.equal(afterAi.settings.ai.purposes['explain'], true)

    const audit = await call(runtime, 'PATCH', '/settings', { body: { guard: { auditEnabled: false } } })
    assert.equal(audit.status, 200)
    const afterGuard = audit.body as { settings: { guard: { auditEnabled: boolean } } }
    assert.equal(afterGuard.settings.guard.auditEnabled, false)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('PATCH /settings 忽略不认识的顶层键（界面不该能碰别的东西）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'PATCH', '/settings', {
      body: { evil: { database: '/etc/passwd' }, ai: { enabled: false } },
    })
    assert.equal(result.status, 200)
    const body = result.body as { settings: { ai: { enabled: boolean } } }
    assert.equal(body.settings.ai.enabled, false)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('跨站 PATCH 被拒（C4：宿主对我们的路由不提供任何鉴权）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, 'PATCH', '/settings', {
      body: { ai: { enabled: false } },
      sameOrigin: false,
    })
    assert.equal(result.status, 403)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /jobs/:id/greeting/draft 生成话术但不发送', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const company = store.company.ensure({ name: '腾讯科技', nameNorm: '腾讯科技' }, T)
    const id = store.job.upsert({ ...jobInput(), companyId: company.id }, T).id

    const result = await call(runtime, 'POST', `/jobs/${String(id)}/greeting/draft`, {
      body: { tone: 'warm' },
    })
    assert.equal(result.status, 200)
    const body = result.body as { ok: boolean; draft: { text: string; via: string; outboundFields: string[] } }
    assert.equal(body.ok, true)
    assert.equal(body.draft.via, 'template', '没配模型时如实标注是模板')
    assert.ok(body.draft.text.includes('高级前端工程师'))
    assert.deepEqual(body.draft.outboundFields, [])
    // 生成不发送：审计里不该有 greeting.send
    assert.equal(store.audit.list(10).length, 0)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /jobs/:id/greeting/draft 拒绝非法语气', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const id = store.job.upsert(jobInput(), T).id
    const result = await call(runtime, 'POST', `/jobs/${String(id)}/greeting/draft`, {
      body: { tone: '霸气' },
    })
    assert.equal(result.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('发送打招呼：隐身没过就先被闸门拒（不会白问用户一次）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const id = store.job.upsert(jobInput(), T).id
    const result = await call(runtime, 'POST', '/greeting/send', {
      body: { jobId: id, text: '您好，我想应聘这个岗位，方便聊聊吗？' },
    })
    assert.equal(result.status, 403)
    const body = result.body as { code: string; message: string }
    assert.equal(body.code, 'GUARD_DENIED')
    assert.ok(body.message.includes('尚未就绪') || body.message.includes('隐身') || body.message.includes('未确认'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('发送打招呼：闸门过了之后是两段式确认 —— 先 409 + 文案，确认后才执行', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const id = store.job.upsert(jobInput(), T).id
    const text = '您好，我想应聘这个岗位，方便聊聊吗？'

    const first = await call(runtime, 'POST', '/greeting/send', { body: { jobId: id, text } })
    assert.equal(first.status, 409)
    const asked = first.body as { code: string; confirmText: string; danger: string; action: string }
    assert.equal(asked.code, 'NEEDS_CONFIRM')
    assert.equal(asked.action, 'greeting.send')
    assert.equal(asked.danger, 'high')
    // §4.4.2：确认文案必须含发起者/平台/目标/正文全文/简历版本
    assert.ok(asked.confirmText.includes('界面上的你'))
    assert.ok(asked.confirmText.includes('51job'))
    assert.ok(asked.confirmText.includes(`#${String(id)}`))
    assert.ok(asked.confirmText.includes(text))
    assert.ok(asked.confirmText.includes('使用简历版本'))

    // 还没确认 → 不该有任何"已执行"的审计
    assert.equal(store.audit.list(10).length, 0)

    // 确认后重发：这次会被真正执行，并在适配器缺能力处**如实失败**
    const second = await call(runtime, 'POST', '/greeting/send', {
      body: { jobId: id, text, confirm: true },
    })
    assert.equal(second.status, 409)
    const failure = second.body as { code: string; message: string; hint?: string }
    assert.equal(failure.code, 'ADAPTER_BROKEN')
    assert.ok(failure.message.includes('还没实现打招呼动作'))
    assert.ok((failure.hint ?? '').includes('不会静默'))

    const records = store.audit.list(10)
    assert.equal(records.length, 1, '确认后的那一次要留痕')
    assert.equal(records[0]?.actor, 'gui')
    assert.equal(records[0]?.result, 'error', '适配器缺能力 → 审计记 error，不是 ok')
    assert.equal(JSON.stringify(records[0]).includes(text), false, '正文不进审计表')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /audit 给出记录与"只存摘要"的口径说明', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    store.audit.write(
      { actor: 'model', action: 'greeting.send', target: { platformId: '51job' }, result: 'denied', reason: '用户拒绝' },
      T,
    )
    const result = await call(runtime, 'GET', '/audit', { query: 'limit=10' })
    assert.equal(result.status, 200)
    const body = result.body as { items: Array<{ action: string; result: string }>; count: number; note: string }
    assert.equal(body.items.length, 1)
    assert.equal(body.items[0]?.action, 'greeting.send')
    assert.equal(body.items[0]?.result, 'denied')
    assert.equal(body.count, 1)
    assert.ok(body.note.includes('摘要'))

    const filtered = await call(runtime, 'GET', '/audit', { query: 'actor=gui' })
    assert.equal((filtered.body as { items: unknown[] }).items.length, 0)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /llm/calls 给出调用留痕与按用途的统计（I5 知情同意）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    store.llmCall.write(
      {
        purpose: 'greeting_draft',
        provider: 'deepseek',
        model: 'deepseek-chat',
        fields: ['jobTitle', 'companyName'],
        promptTokens: 120,
        completionTokens: 80,
        ok: true,
        durationMs: 900,
      },
      T,
    )
    store.llmCall.write({ purpose: 'explain', fields: [], ok: false, errorCode: '超时' }, T)

    const result = await call(runtime, 'GET', '/llm/calls', { query: 'limit=10' })
    assert.equal(result.status, 200)
    const body = result.body as {
      items: Array<{ purpose: string; fields: string[]; ok: boolean }>
      stats: Array<{ purpose: string; calls: number; promptTokens: number }>
      note: string
    }
    assert.equal(body.items.length, 2)
    // 倒序：最后写的那条在前
    assert.equal(body.items[0]?.purpose, 'explain')
    assert.equal(body.items[1]?.purpose, 'greeting_draft')
    assert.deepEqual(body.items[1]?.fields, ['jobTitle', 'companyName'])
    const stat = body.stats.find((item) => item.purpose === 'greeting_draft')
    assert.equal(stat?.calls, 1)
    assert.equal(stat?.promptTokens, 120)
    assert.ok(body.note.includes('字段'))

    const byPurpose = await call(runtime, 'GET', '/llm/calls', { query: 'purpose=explain' })
    assert.equal((byPurpose.body as { items: unknown[] }).items.length, 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('数据层没就绪时 /settings 与 /audit 给出可读的 DATA_UNAVAILABLE', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    for (const [method, path] of [
      ['GET', '/settings'],
      ['GET', '/audit'],
      ['GET', '/llm/calls'],
    ] as const) {
      const result = await call(runtime, method, path)
      assert.equal(result.status, 503, `${path} 应当报告数据层不可用`)
      assert.equal((result.body as { code: string }).code, 'DATA_UNAVAILABLE')
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
