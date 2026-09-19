/**
 * P9：三条「断链」补口的路由测试。
 *
 * 这三块共同点是**在此之前只有半个功能**：
 *   1. 接触态：`advanceContact` 写好了却零调用 → 状态永远停在 `greeted`，
 *      而"未读超时 / 已读未回"两条跟进建议分别挂在 `delivered` / `read` 上 → 跟进链路是空的；
 *   2. 待修复队列：`pending_repair` 只有计数，没有列表与清理 → 看得到坏、修不了；
 *   3. 额度：`checkQuota` 算得出用量，但只在**拒绝时**才说 → U0 的「额度余量」没有数据面。
 *
 * 所以这里断言的都不是"路由返回 200"，而是**那条链路真的通了**：
 * 标记 `delivered` 之后 `/followups` 必须能产出建议、写覆盖之后 `effective` 必须真的变、
 * 额度读数必须与闸门同一口径（`limitedBy=platform` 时改自己的额度没有用）。
 *
 * 本文件不发任何网络请求，也不开浏览器。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { writeGuardConfig } from '../../src/host/guard/rules.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
/** 「很久以前」——远早于所有超时阈值，用来触发跟进建议。 */
const LONG_AGO = '2026-01-01T00:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p9-1',
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
    sourceUrl: 'https://jobs.51job.com/all/p9-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。',
    ...overrides,
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

/** 建一个岗位 + 一条打招呼记录，返回 { jobId, greetingId }。 */
function seedGreeting(runtime: HostRuntime): { jobId: number; greetingId: number } {
  const jobId = runtime.jobs()?.upsert(jobInput(), T).id
  assert.ok(typeof jobId === 'number')
  const greeting = runtime.pipeline().recordGreetingSent({
    jobId,
    platformId: '51job',
    content: '您好，我对这个岗位很感兴趣。',
    actor: 'gui',
  })
  return { jobId, greetingId: greeting.id }
}

// ─────────────────────────────────────────────────────────────────────
// 一、接触态写入通道
// ─────────────────────────────────────────────────────────────────────

test('POST /jobs/:id/contact-stage：没有打招呼记录 → 404 且说清为什么', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const jobId = runtime.jobs()?.upsert(jobInput(), T).id as number
    const result = await call(runtime, 'POST', `/jobs/${String(jobId)}/contact-stage`, {
      body: { to: 'read' },
    })
    assert.equal(result.status, 404)
    const body = result.body as { code: string; hint?: string }
    assert.equal(body.code, 'NOT_FOUND')
    assert.ok((body.hint ?? '').includes('打招呼记录'), body.hint)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /jobs/:id/contact-stage：拒绝非法取值，尤其不能标成「未接触」', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { jobId } = seedGreeting(runtime)
    for (const to of ['none', 'bogus', '']) {
      const result = await call(runtime, 'POST', `/jobs/${String(jobId)}/contact-stage`, { body: { to } })
      assert.equal(result.status, 400, `to=${to} 应被拒绝`)
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('接触态可以人工推进与回退，并且每次都留一条事件', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { jobId } = seedGreeting(runtime)
    assert.equal(runtime.pipeline().contactStage(jobId), 'greeted')

    const advanced = await call(runtime, 'POST', `/jobs/${String(jobId)}/contact-stage`, {
      body: { to: 'read', note: '平台上看到已读了' },
    })
    assert.equal(advanced.status, 200)
    const body = advanced.body as { contactStage: string; previousStage: string; greetingId: number; stageAt: string }
    assert.equal(body.contactStage, 'read')
    assert.equal(body.previousStage, 'greeted', '响应要能说明"从哪一态改过来的"')
    assert.ok(body.greetingId > 0)
    assert.equal(runtime.pipeline().contactStage(jobId), 'read')

    // 回退（平台侧会误判，用户要能改回来）
    const back = await call(runtime, 'POST', `/jobs/${String(jobId)}/contact-stage`, {
      body: { to: 'greeted' },
    })
    assert.equal(back.status, 200)
    assert.equal((back.body as { contactStage: string }).contactStage, 'greeted')

    // 每次变更都留痕（来源是人工）
    const events = runtime.pipeline().history(jobId)
    assert.ok(events.length >= 3, `应有 3 条事件（建记录 + 两次变更），实际 ${String(events.length)}`)
    assert.ok(events.every((event) => event.entity === 'greeting'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 标记为「已送达」之后，未读超时的跟进建议真的出现了（这条链路以前是空的）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { jobId, greetingId } = seedGreeting(runtime)
    const store = runtime.store()
    assert.ok(store !== undefined)

    // 造出"很久以前就已送达"的现场（直接写库，避免等 72 小时）
    store.pipeline.advanceGreeting(greetingId, 'delivered', LONG_AGO)

    const followups = await call(runtime, 'GET', '/followups')
    assert.equal(followups.status, 200)
    const items = (followups.body as { items: Array<{ jobId: number; kind: string; advice: string }> }).items
    const mine = items.filter((item) => item.jobId === jobId)
    assert.equal(mine.length, 1, '必须有且只有一条')
    assert.equal(mine[0]?.kind, 'unread-timeout')

    // 处置掉之后不再重复出现（§12.2 收口）
    const resolved = await call(runtime, 'POST', '/followups/resolve', {
      body: { jobId, kind: 'unread-timeout' },
    })
    assert.equal(resolved.status, 200)
    const again = await call(runtime, 'GET', '/followups')
    assert.equal(
      (again.body as { items: Array<{ jobId: number }> }).items.filter((item) => item.jobId === jobId).length,
      0,
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /greetings：带上岗位 / 公司 / 模板名（话术效果对比要读它）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const jobId = runtime.jobs()?.upsert(jobInput(), T).id as number
    const template = runtime.store()?.pipeline.upsertTemplate(
      { name: '正式开场', body: '您好…' },
      T,
    )
    assert.ok(template !== undefined)
    runtime.pipeline().recordGreetingSent({
      jobId,
      platformId: '51job',
      content: '您好，我对这个岗位很感兴趣。',
      actor: 'gui',
      templateId: template.id,
    })

    const result = await call(runtime, 'GET', '/greetings', { query: `jobId=${String(jobId)}` })
    assert.equal(result.status, 200)
    const items = (result.body as { items: Array<Record<string, unknown>> }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.['jobTitle'], '高级前端工程师')
    assert.equal(items[0]?.['templateName'], '正式开场')
    assert.equal(items[0]?.['stage'], 'greeted')
    assert.equal(items[0]?.['content'], '您好，我对这个岗位很感兴趣。')

    // 非法 stage 要报错，而不是静默忽略（否则用户对着"看起来筛了"的列表做判断）
    const bad = await call(runtime, 'GET', '/greetings', { query: 'stage=bogus' })
    assert.equal(bad.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('跨站 POST 被拒（变更类请求必须过同源校验）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const { jobId } = seedGreeting(runtime)
    const result = await call(runtime, 'POST', `/jobs/${String(jobId)}/contact-stage`, {
      body: { to: 'read' },
      sameOrigin: false,
    })
    assert.equal(result.status, 403)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 二、待修复队列 + 适配器配置覆盖
// ─────────────────────────────────────────────────────────────────────

test('GET /repairs：看得到缺哪些字段与样本地址，并如实说明没有原始 HTML', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    store.repair.enqueue(
      {
        platformId: '51job',
        missingFields: ['title', 'source_url'],
        raw: { title: '', company: '某某科技' },
        sourceUrl: null,
      },
      T,
    )

    const result = await call(runtime, 'GET', '/repairs')
    assert.equal(result.status, 200)
    const body = result.body as {
      items: Array<{ id: number; platformId: string; missingFields: string[]; raw: Record<string, unknown> }>
      total: number
      byPlatform: Array<{ platformId: string; count: number }>
      note: string
    }
    assert.equal(body.total, 1)
    assert.deepEqual(body.items[0]?.missingFields, ['title', 'source_url'])
    assert.equal(body.items[0]?.raw['company'], '某某科技', '当时解析出来的字段要能看到')
    assert.deepEqual(body.byPlatform, [{ platformId: '51job', count: 1 }])
    // 口径必须随响应下发 —— 否则界面会以为可以"重放"
    assert.ok(body.note.includes('没有原始 HTML'), body.note)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('丢弃一条待修复记录；重复丢弃如实报"已处理过"', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const id = store.repair.enqueue({ platformId: '51job', missingFields: ['title'], raw: {} }, T)

    const first = await call(runtime, 'POST', `/repairs/${String(id)}/discard`, { body: {} })
    assert.equal(first.status, 200)
    assert.equal(store.repair.countPending('51job'), 0)

    const second = await call(runtime, 'POST', `/repairs/${String(id)}/discard`, { body: {} })
    assert.equal(second.status, 404, '已经处理过的不算"不存在"，但也不该假装成功')
    assert.ok(((second.body as { message: string }).message).includes('已经处理过'))

    const missing = await call(runtime, 'POST', '/repairs/99999/discard', { body: {} })
    assert.equal(missing.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /repairs/clear：必须指定平台（没有"一键清空全部"）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    store.repair.enqueue({ platformId: '51job', missingFields: ['title'], raw: {} }, T)
    store.repair.enqueue({ platformId: '51job', missingFields: ['company'], raw: {} }, T)

    const noPlatform = await call(runtime, 'POST', '/repairs/clear', { body: {} })
    assert.equal(noPlatform.status, 400)
    assert.ok(((noPlatform.body as { hint?: string }).hint ?? '').includes('按平台'))

    const unknown = await call(runtime, 'POST', '/repairs/clear', { body: { platformId: 'nope' } })
    assert.equal(unknown.status, 404)

    const ok = await call(runtime, 'POST', '/repairs/clear', { body: { platformId: '51job' } })
    assert.equal(ok.status, 200)
    assert.equal((ok.body as { cleared: number }).cleared, 2)
    assert.equal(store.repair.countPending(), 0)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('适配器配置覆盖：写进去 → 实际生效值真的变了 → 清除后回到代码默认', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const before = await call(runtime, 'GET', '/platforms/51job/adapter-config')
    assert.equal(before.status, 200)
    const initial = before.body as {
      override: unknown
      defaults: { selectors: Record<string, string> }
      effective: { selectors: Record<string, string> }
      overrideKeys: string[]
    }
    assert.equal(initial.override, null, '全新库里没有覆盖')
    assert.deepEqual(initial.overrideKeys, [])
    const defaultCard = initial.defaults.selectors['card']
    assert.ok(typeof defaultCard === 'string' && defaultCard !== '')

    const written = await call(runtime, 'PUT', '/platforms/51job/adapter-config', {
      // 故意用一个与默认值**不同**的选择器：否则"覆盖生效了"这条断言等于没测
      body: { override: { selectors: { card: '.joblist-item--patched' } } },
    })
    assert.equal(written.status, 200)
    const after = (written.body as { config: typeof initial }).config
    assert.deepEqual(after.overrideKeys, ['selectors'])
    assert.equal(after.effective.selectors['card'], '.joblist-item--patched', '实际生效值必须真的变了')
    assert.notEqual(after.effective.selectors['card'], defaultCard)
    // 没写的字段沿用默认（覆盖的语义是"只写要改的键"）
    assert.deepEqual(Object.keys(after.effective.selectors).sort(), Object.keys(initial.defaults.selectors).sort())
    assert.equal(after.effective.selectors['title'], initial.defaults.selectors['title'])

    // 落库了：再读一次还在
    const reread = await call(runtime, 'GET', '/platforms/51job/adapter-config')
    assert.equal((reread.body as typeof initial).effective.selectors['card'], '.joblist-item--patched')

    // 清除覆盖 → 回到代码默认
    const cleared = await call(runtime, 'PUT', '/platforms/51job/adapter-config', { body: { override: null } })
    assert.equal(cleared.status, 200)
    const clearedBody = (cleared.body as { config: typeof initial }).config
    assert.equal(clearedBody.override, null)
    assert.deepEqual(clearedBody.overrideKeys, [])
    assert.equal(clearedBody.effective.selectors['card'], defaultCard)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('适配器配置覆盖：拒绝非对象、拒绝未知平台、必须显式给 override', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // 数组 / 字符串都不是"一份配置覆盖"
    for (const override of [[], 'nope', 42]) {
      const result = await call(runtime, 'PUT', '/platforms/51job/adapter-config', { body: { override } })
      assert.equal(result.status, 400, `override=${JSON.stringify(override)} 应被拒绝`)
    }
    // 没给 override 字段 ≠ 清除覆盖（拼错请求体不该删掉用户刚写好的选择器）
    const missing = await call(runtime, 'PUT', '/platforms/51job/adapter-config', { body: {} })
    assert.equal(missing.status, 400)
    assert.ok(((missing.body as { hint?: string }).hint ?? '').includes('null'))

    const unknown = await call(runtime, 'GET', '/platforms/nope/adapter-config')
    assert.equal(unknown.status, 404)

    const crossOrigin = await call(runtime, 'PUT', '/platforms/51job/adapter-config', {
      body: { override: { selectors: { card: '.x' } } },
      sameOrigin: false,
    })
    assert.equal(crossOrigin.status, 403)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('适配器配置写完后，注册表里的那个适配器被**热替换**（不是等重启）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const before = runtime.registry().get('51job')
    assert.ok(before !== undefined)
    await call(runtime, 'PUT', '/platforms/51job/adapter-config', {
      body: { override: { selectors: { card: '.joblist-item' } } },
    })
    const after = runtime.registry().get('51job')
    assert.ok(after !== undefined)
    assert.notEqual(after, before, '必须是新实例（配置在 build 时快照进闭包）')
    assert.equal(after.id, '51job', '替换的是同一个平台，不是新增一个')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 三、每日额度读数
// ─────────────────────────────────────────────────────────────────────

test('GET /guard/usage：三个动作都有读数，且与闸门口径一致（计数只算成功的）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    const now = new Date().toISOString()
    // 两次成功 + 一次被拒：额度只算成功的那两次
    store.audit.write({ actor: 'gui', action: 'greeting.send', target: { platformId: '51job' }, result: 'ok' }, now)
    store.audit.write({ actor: 'gui', action: 'greeting.send', target: { platformId: '51job' }, result: 'ok' }, now)
    store.audit.write({ actor: 'gui', action: 'greeting.send', target: { platformId: '51job' }, result: 'denied' }, now)

    const result = await call(runtime, 'GET', '/guard/usage', { query: 'platformId=51job' })
    assert.equal(result.status, 200)
    const body = result.body as {
      since: string
      platforms: Array<{ platformId: string; displayName: string; actions: Array<Record<string, unknown>> }>
    }
    assert.equal(body.platforms.length, 1)
    assert.equal(body.platforms[0]?.platformId, '51job')
    assert.ok(body.platforms[0]!.displayName.length > 0)
    assert.equal(body.platforms[0]?.actions.length, 3)

    const greeting = body.platforms[0]!.actions.find((entry) => entry['action'] === 'greeting.send')
    assert.ok(greeting !== undefined)
    assert.equal(greeting['used'], 2, '被拒的那次不算额度')
    assert.equal(greeting['remaining'], Number(greeting['limit']) - 2)
    assert.equal(greeting['limitedBy'], 'budget', '默认用户额度 20 < BOSS 侧 150')

    const reply = body.platforms[0]!.actions.find((entry) => entry['action'] === 'message.reply')
    assert.equal(reply?.['platformCap'], null, '回复没有平台侧上限')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /guard/usage：用户额度高于平台侧上限时，如实说"是平台侧限的"', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = runtime.store()
    assert.ok(store !== undefined)
    // BOSS（zhipin）打招呼日上限实测约 150 —— 把用户额度调到 1000，限住他的就是平台侧
    writeGuardConfig(store, { dailyLimits: { greeting: 1000, application: 10, reply: 30 } }, T)
    // 同时关掉本地发送窗口：额度读数与窗口无关，但让用例不随时段漂移
    writeGuardConfig(store, { sendWindow: '', dayOffProbability: 0 }, T)

    const result = await call(runtime, 'GET', '/guard/usage', { query: 'platformId=zhipin' })
    assert.equal(result.status, 200)
    const actions = (result.body as { platforms: Array<{ actions: Array<Record<string, unknown>> }> }).platforms[0]?.actions
    const greeting = actions?.find((entry) => entry['action'] === 'greeting.send')
    assert.equal(greeting?.['platformCap'], 150)
    assert.equal(greeting?.['limit'], 150, '取 min(用户额度, 平台上限)')
    assert.equal(greeting?.['limitedBy'], 'platform', '改自己的额度没有用，必须说出来')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /guard/usage：不给 platformId 就是所有平台；未知平台 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const all = await call(runtime, 'GET', '/guard/usage')
    assert.equal(all.status, 200)
    const body = all.body as { platforms: Array<{ platformId: string }>; note: string }
    assert.ok(body.platforms.length >= 2, '注册表里有多个平台')
    assert.ok(body.platforms.some((item) => item.platformId === '51job'))
    assert.ok(body.note.includes('limitedBy=platform'), body.note)

    const unknown = await call(runtime, 'GET', '/guard/usage', { query: 'platformId=nope' })
    assert.equal(unknown.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
