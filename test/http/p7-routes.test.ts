/**
 * P7 跟进与看板路由测试（§4.7 / §13 U5-U8）。
 *
 * 直接驱动 `routeRequest`，不造假 req/res —— 路由层与传输层解耦就是为了这个。
 * 覆盖四块：
 *   1. 投递 / 看板 / 消息 / 面试 / 分析的**协议契约**（状态码、形状、字段）；
 *   2. 闸门与两段式确认在路由上的行为（§4.4.2）；
 *   3. 跨站与数据层未就绪这两条边界；
 *   4. **迁移 v5**：老库能升上来、七张 P7 表就位、重开不再迁移。
 *
 * 本文件不发任何网络请求；所有时间断言要么离得足够远，要么直接写库造出"很久以前"。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { test } from 'node:test'
import { APPLICATION_STAGES } from '../../src/shared/contract/enums/pipeline.js'
import type { AttributionDto, FunnelDto } from '../../src/shared/contract/dto/analytics.js'
import type { InterviewConflictDto, InterviewDto, InterviewPrepDto } from '../../src/shared/contract/dto/interview.js'
import type { InboxDto, MessageDto } from '../../src/shared/contract/dto/message.js'
import type { SalaryBandDto } from '../../src/shared/contract/dto/offer.js'
import type { ApplicationDto, BoardDto, FollowUpDto } from '../../src/shared/contract/dto/pipeline.js'
import type { RouteRequest, RouteResult } from '../../src/host/http/router.js'
import { routeRequest } from '../../src/host/http/router.js'
import { writeGuardConfig } from '../../src/host/guard/rules.js'
import { createHostRuntime, type HostRuntime } from '../../src/host/runtime.js'
import { openDatabase, resolveDbPath } from '../../src/host/store/db.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { currentVersion, MIGRATIONS } from '../../src/host/store/migrate.js'
import { SCHEMA_V1 } from '../../src/host/store/schema.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
/** 迁移测试里的"老数据"时间戳。 */
const T_LEGACY = '2026-09-16T01:00:00.000Z'

// ─────────────────────────────────────────────────────────────────────
// 夹具与驱动
// ─────────────────────────────────────────────────────────────────────

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p7r-1',
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
    sourceUrl: 'https://jobs.51job.com/all/p7r-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。任职要求：熟悉 react。',
    ...overrides,
  }
}

async function openRuntime(): Promise<{ runtime: HostRuntime; dir: string }> {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  await runtime.ready()
  return { runtime, dir }
}

async function route(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { query?: string; body?: unknown; sameOrigin?: boolean } = {},
): Promise<RouteResult> {
  const req: RouteRequest = {
    method,
    path,
    query: new URLSearchParams(options.query ?? ''),
    headers: {},
    sameOrigin: options.sameOrigin ?? true,
    readJson: async () => options.body,
  }
  return await routeRequest(runtime, req)
}

async function call(
  runtime: HostRuntime,
  method: string,
  path: string,
  options: { query?: string; body?: unknown; sameOrigin?: boolean } = {},
): Promise<Extract<RouteResult, { kind: 'json' }>> {
  const result = await route(runtime, method, path, options)
  if (result.kind !== 'json') throw new Error(`期望 JSON 结果，得到 ${result.kind}`)
  return result
}

function storeOf(runtime: HostRuntime) {
  const store = runtime.store()
  assert.ok(store !== undefined, '数据层应当已就绪')
  return store
}

function seedJob(runtime: HostRuntime, overrides: Partial<JobUpsertInput> = {}): number {
  const store = storeOf(runtime)
  const company = store.company.ensure({ name: '腾讯科技（深圳）有限公司', nameNorm: '腾讯科技' }, T)
  return store.job.upsert({ ...jobInput(overrides), companyId: company.id }, T).id
}

function seedResume(runtime: HostRuntime, name = '前端 · 2026 春'): number {
  return storeOf(runtime).resume.create(
    {
      name,
      content: {
        basics: { name: '张三', title: '前端开发', city: '深圳', years: 3 },
        summary: '三年前端经验。',
        skills: [{ name: 'React', level: '熟练', years: 3, evidence: '订单中台' }],
        experiences: [],
        projects: [],
        education: [],
        extras: [],
      },
      isDefault: true,
    },
    T,
  ).id
}

/**
 * 把闸门调到"用户可以投递/回复"的状态。
 *
 * 三件事缺一不可：打开发送分层（默认 l4 是关的）、关掉同公司冷却（否则同一家公司的
 * 第二条投递会被冷却期拦下，测试之间会互相污染）、确认平台隐身已开（高危动作的前置）。
 * `requireApproval: false` 只给"用户自己把审批关掉"的那条路径用。
 */
async function openGate(runtime: HostRuntime, options: { requireApproval?: boolean } = {}): Promise<void> {
  const patched = await call(runtime, 'PATCH', '/settings', {
    body: {
      guard: {
        levels: { l3Greeting: true, l4Application: true, l4Reply: true },
        cooldownMinutes: 0,
        // 发送窗口/休息日按本地时钟判定，会让用例随时段漂移 —— 统一关掉。
        sendWindow: '',
        dayOffProbability: 0,
        ...(options.requireApproval === false ? { requireApproval: false } : {}),
      },
    },
  })
  assert.equal(patched.status, 200, '界面改自己的风险开关是允许的')
  storeOf(runtime).account.upsert(
    { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
    T,
  )
}

// ─────────────────────────────────────────────────────────────────────
// 投递流水线
// ─────────────────────────────────────────────────────────────────────

test('POST /applications → 201；GET 列表能看到它；GET 详情带 events', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime, { requireApproval: false })
    const resumeId = seedResume(runtime)
    const jobId = seedJob(runtime)

    const created = await call(runtime, 'POST', '/applications', {
      body: { jobId, channel: 'referral', note: '朋友内推' },
    })
    assert.equal(created.status, 201)
    const createdBody = created.body as { ok: boolean; application: ApplicationDto }
    assert.equal(createdBody.ok, true)
    const application = createdBody.application
    assert.equal(application.stage, 'sent')
    assert.equal(application.resumeId, resumeId, '投递必须记下用了哪份简历（§11.3 / R6）')
    assert.equal(application.channel, 'referral')
    assert.equal(application.jobTitle, '高级前端工程师')
    assert.equal(application.companyName, '腾讯科技（深圳）有限公司')
    assert.equal(application.events.length, 1, '记录投递本身就是一次状态变更')
    assert.equal(application.events[0]?.fromStage, null)
    assert.equal(application.events[0]?.toStage, 'sent')

    const listed = await call(runtime, 'GET', '/applications')
    assert.equal(listed.status, 200)
    const items = (listed.body as { items: ApplicationDto[] }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.id, application.id)

    const detail = await call(runtime, 'GET', `/applications/${String(application.id)}`)
    assert.equal(detail.status, 200)
    const one = detail.body as ApplicationDto
    assert.equal(one.id, application.id)
    assert.equal(one.events.length, 1, '详情页要能回答"凭什么在这个阶段"')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /applications 的两段式确认：先 409 + 文案，确认后这一次必须真的落库（§4.4.2）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime)
    const store = storeOf(runtime)
    seedResume(runtime)
    const jobId = seedJob(runtime)

    const first = await call(runtime, 'POST', '/applications', { body: { jobId } })
    assert.equal(first.status, 409)
    const asked = first.body as { code: string; action: string; danger: string; confirmText: string }
    assert.equal(asked.code, 'NEEDS_CONFIRM', '第一次不是拒绝，是"需要你确认"')
    assert.equal(asked.action, 'application.send')
    assert.equal(asked.danger, 'high')
    assert.ok(asked.confirmText.includes('使用简历版本'), '审批文案必须写清用了哪版简历（§4.4.2）')
    assert.equal(store.pipeline.listApplications().length, 0, '还没确认就不该有任何记录')

    const second = await call(runtime, 'POST', '/applications', { body: { jobId, confirm: true } })
    // 当前 src 下这一条会红：`http/router.ts` 确实把 `confirm` 转成了 `guiConfirmed` 传给
    // `pipeline.recordApplication`，但 `domain/pipeline.ts` 的 `recordApplication` 既没有
    // 声明这个入参、也没有把它转发进 `guardRun` 的入参（对照 `domain/messages.ts` 的
    // `reply`：那边两者都有，所以回复的两段式确认是通的）。
    // 结果是界面上的投递永远卡在"确认了还是让你确认"。
    assert.equal(
      second.status,
      201,
      '用户在界面上点过确认之后，这一发必须真的执行 —— 否则界面会陷入"确认了还是让你确认"的死循环',
    )
    assert.equal(store.pipeline.listApplications().length, 1)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /applications/:id/advance：前进 200；回退不带 allowBackward 400；非法阶段 400', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime, { requireApproval: false })
    seedResume(runtime)
    const jobId = seedJob(runtime)
    const created = await call(runtime, 'POST', '/applications', { body: { jobId } })
    const application = (created.body as { application: ApplicationDto }).application

    const advanced = await call(runtime, 'POST', `/applications/${String(application.id)}/advance`, {
      body: { to: 'viewed', note: 'HR 已查看' },
    })
    assert.equal(advanced.status, 200)
    assert.equal((advanced.body as { application: ApplicationDto }).application.stage, 'viewed')

    const backward = await call(runtime, 'POST', `/applications/${String(application.id)}/advance`, {
      body: { to: 'sent' },
    })
    assert.equal(backward.status, 400, '回退要显式确认，免得手滑把状态点回去而没人知道为什么')
    assert.equal((backward.body as { code: string }).code, 'INVALID_INPUT')
    assert.ok((backward.body as { hint?: string }).hint?.includes('allowBackward'))

    const allowed = await call(runtime, 'POST', `/applications/${String(application.id)}/advance`, {
      body: { to: 'sent', allowBackward: true },
    })
    assert.equal(allowed.status, 200)
    assert.equal((allowed.body as { application: ApplicationDto }).application.stage, 'sent')

    for (const to of ['聊聊', '', 42]) {
      const bogus = await call(runtime, 'POST', `/applications/${String(application.id)}/advance`, {
        body: { to },
      })
      assert.equal(bogus.status, 400, `to=${JSON.stringify(to)} 应当被判为非法输入`)
      assert.equal((bogus.body as { code: string }).code, 'INVALID_INPUT')
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /board 按 §12.1 的阶段顺序分列，卡片带岗位与公司', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime, { requireApproval: false })
    seedResume(runtime)
    const jobId = seedJob(runtime)
    await call(runtime, 'POST', '/applications', { body: { jobId } })

    const result = await call(runtime, 'GET', '/board')
    assert.equal(result.status, 200)
    const board = result.body as BoardDto
    assert.deepEqual(
      board.columns.map((column) => column.stage),
      [...APPLICATION_STAGES],
    )
    assert.equal(board.total, 1)
    assert.equal(board.staleCount, 0, '刚投的岗位不该被算成"卡住了"')

    const card = board.columns.find((column) => column.stage === 'sent')?.cards[0]
    assert.ok(card !== undefined)
    assert.equal(card.jobTitle, '高级前端工程师')
    assert.equal(card.companyName, '腾讯科技（深圳）有限公司')
    assert.equal(card.daysSinceStage, 0)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /jobs/:id/history 汇总该岗位的投递与接触事件，并给出当前接触态', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime, { requireApproval: false })
    const store = storeOf(runtime)
    seedResume(runtime)
    const jobId = seedJob(runtime)
    await call(runtime, 'POST', '/applications', { body: { jobId } })
    // 接触态直接写库：这里验的是"历史"接口，不是闸门
    const greeting = store.pipeline.createGreeting(
      { jobId, platformId: '51job', content: '您好，想聊聊这个岗位。', actor: 'gui' },
      T,
    )
    store.pipeline.advanceGreeting(greeting.id, 'replied', T)

    const result = await call(runtime, 'GET', `/jobs/${String(jobId)}/history`)
    assert.equal(result.status, 200)
    const body = result.body as { items: Array<{ entity: string }>; contactStage: string }
    assert.ok(body.items.some((event) => event.entity === 'application'))
    assert.equal(body.contactStage, 'replied', '接触态要跟着岗位详情一起给出')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 消息中心
// ─────────────────────────────────────────────────────────────────────

test('POST /messages → 201；GET /inbox 的邀约信号只在 HR 发来的消息上命中', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const jobId = seedJob(runtime)

    const fromHr = await call(runtime, 'POST', '/messages', {
      body: {
        platformId: '51job',
        direction: 'hr',
        content: '你好，我们想邀请你参加面试，方便的时间请告诉我。',
        jobId,
      },
    })
    assert.equal(fromHr.status, 201)
    const hrMessage = (fromHr.body as { message: MessageDto }).message
    assert.equal(hrMessage.direction, 'hr')
    assert.equal(hrMessage.inviteSignal?.hit, true, '内容里有邀约词就要识别出来')
    assert.ok(hrMessage.inviteSignal?.keywords.includes('面试'))
    assert.equal(hrMessage.jobTitle, '高级前端工程师')

    const fromMe = await call(runtime, 'POST', '/messages', {
      body: {
        platformId: '51job',
        direction: 'me',
        content: '期待面试，我的时间都比较灵活。',
        jobId,
      },
    })
    assert.equal(fromMe.status, 201)
    const myMessage = (fromMe.body as { message: MessageDto }).message
    assert.equal(
      myMessage.inviteSignal?.hit,
      false,
      '我自己说的"期待面试"不是 HR 的邀约 —— 方向规则是故意的，识别误报会让人漏掉真正在推进的岗位',
    )

    const inbox = await call(runtime, 'GET', '/inbox')
    assert.equal(inbox.status, 200)
    const inboxDto = inbox.body as InboxDto
    assert.equal(inboxDto.total, 2)
    assert.equal(inboxDto.unread, 2)
    const listed = inboxDto.items.find((item) => item.id === hrMessage.id)
    assert.equal(listed?.inviteSignal?.hit, true, '列表里的信号要与创建时一致')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /messages 拒绝非法方向与空内容', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const badDirection = await call(runtime, 'POST', '/messages', {
      body: { platformId: '51job', direction: 'hrs', content: '你好' },
    })
    assert.equal(badDirection.status, 400)
    const empty = await call(runtime, 'POST', '/messages', {
      body: { platformId: '51job', direction: 'hr', content: '   ' },
    })
    assert.equal(empty.status, 400)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /messages/:id/read：未读数下降；重复标记同一封返回 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const created = await call(runtime, 'POST', '/messages', {
      body: { platformId: '51job', direction: 'hr', content: '在吗？' },
    })
    const messageId = (created.body as { message: MessageDto }).message.id

    const before = await call(runtime, 'GET', '/inbox')
    assert.equal((before.body as InboxDto).unread, 1)

    const read = await call(runtime, 'POST', `/messages/${String(messageId)}/read`)
    assert.equal(read.status, 200)
    const after = await call(runtime, 'GET', '/inbox')
    assert.equal((after.body as InboxDto).unread, 0, '未读数要真的掉下来')

    const again = await call(runtime, 'POST', `/messages/${String(messageId)}/read`)
    assert.equal(again.status, 404, '已经读过的再标一次是"不存在这样的待办"，不是静默成功')
    assert.equal((again.body as { code: string }).code, 'NOT_FOUND')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /messages/:id/reply：先要确认；适配器没实现 reply 时**如实失败**，且不落本地记录', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime)
    const jobId = seedJob(runtime)
    const created = await call(runtime, 'POST', '/messages', {
      body: { platformId: '51job', direction: 'hr', content: '方便聊聊吗？', jobId },
    })
    const messageId = (created.body as { message: MessageDto }).message.id
    const text = '可以，明天下午两点以后我都有空。'

    const first = await call(runtime, 'POST', `/messages/${String(messageId)}/reply`, { body: { content: text } })
    assert.equal(first.status, 409, '回复是真正对外发消息，必须先让用户看一眼')
    assert.equal((first.body as { code: string }).code, 'NEEDS_CONFIRM')

    // 确认之后**不是**"写条本地记录就算回复了"：51job 的适配器没有 actions.reply，
    // 于是这里必须如实报"还没实现"，而不是给用户一个假的成功。
    const second = await call(runtime, 'POST', `/messages/${String(messageId)}/reply`, {
      body: { content: text, confirm: true },
    })
    assert.equal(second.status, 409)
    assert.equal((second.body as { code: string }).code, 'ADAPTER_BROKEN')

    // 这一条才是这次修正的核心：没发出去，就**不能**留下"我已回复"的痕迹
    const inbox = await call(runtime, 'GET', '/inbox')
    const items = (inbox.body as InboxDto).items
    assert.equal(
      items.filter((item) => item.direction === 'me').length,
      0,
      '平台上没发出去，本地就不该有 direction=me 的记录',
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /messages/:id/reply：没有关联岗位的消息拒绝回复（定位不到会话）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime)
    const created = await call(runtime, 'POST', '/messages', {
      body: { platformId: '51job', direction: 'hr', content: '在吗？' },
    })
    const messageId = (created.body as { message: MessageDto }).message.id

    const result = await call(runtime, 'POST', `/messages/${String(messageId)}/reply`, {
      body: { content: '在的', confirm: true },
    })
    // 连岗位都没有，就没有"发往哪个会话"可言 —— 拒绝发生在闸门之前，不该问用户确认
    assert.equal(result.status, 400)
    assert.equal((result.body as { code: string }).code, 'INVALID_INPUT')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 面试日程
// ─────────────────────────────────────────────────────────────────────

test('面试：POST 201、撞车列表、准备包、无 allowReschedule 的改期 400', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    seedResume(runtime)
    const jobId = seedJob(runtime)

    const created = await call(runtime, 'POST', '/interviews', {
      body: { jobId, at: '2027-01-01T02:00:00.000Z', kind: 'onsite', commuteMin: 40 },
    })
    assert.equal(created.status, 201)
    const interview = (created.body as { interview: InterviewDto }).interview
    assert.equal(interview.state, 'pending')
    assert.equal(interview.kind, 'onsite')
    assert.equal(interview.jobTitle, '高级前端工程师')

    // 相隔 30 分钟：远小于"默认时长 + 缓冲窗"，必然撞车
    const close = await call(runtime, 'POST', '/interviews', {
      body: { jobId, at: '2027-01-01T02:30:00.000Z', kind: 'video' },
    })
    assert.equal(close.status, 201)

    const conflicts = await call(runtime, 'GET', '/interviews/conflicts')
    assert.equal(conflicts.status, 200)
    const conflictItems = (conflicts.body as { items: InterviewConflictDto[] }).items
    assert.equal(conflictItems.length, 1)
    assert.ok((conflictItems[0]?.overlapMin ?? 0) > 0)

    const prep = await call(runtime, 'GET', `/interviews/${String(interview.id)}/prep`)
    assert.equal(prep.status, 200)
    const prepDto = prep.body as InterviewPrepDto
    assert.equal(prepDto.interviewId, interview.id)
    assert.equal(prepDto.jobId, jobId)
    assert.ok(Array.isArray(prepDto.matchedSkills))
    assert.ok(Array.isArray(prepDto.missingSkills))
    assert.ok(Array.isArray(prepDto.companyFlags))
    assert.ok(Array.isArray(prepDto.questionNotes))
    assert.equal(prepDto.commute.kind, 'onsite')
    assert.equal(prepDto.commute.minutes, 40)
    assert.ok(prepDto.commute.advice.includes('40 分钟'))
    assert.ok(prepDto.checklist.length >= 3)

    const reschedule = await call(runtime, 'POST', `/interviews/${String(interview.id)}/state`, {
      body: { state: 'rescheduled' },
    })
    assert.equal(reschedule.status, 400, '改期会动到别人的日程，必须显式确认')
    assert.equal((reschedule.body as { code: string }).code, 'INVALID_INPUT')

    const confirmed = await call(runtime, 'POST', `/interviews/${String(interview.id)}/state`, {
      body: { state: 'rescheduled', allowReschedule: true },
    })
    assert.equal(confirmed.status, 200)
    assert.equal((confirmed.body as { interview: InterviewDto }).interview.state, 'rescheduled')

    // upcoming 用真实"现在"：放一场两小时后的，必然落在 72 小时窗口里
    const soon = new Date(Date.now() + 2 * 3_600_000).toISOString()
    await call(runtime, 'POST', '/interviews', { body: { jobId, at: soon, kind: 'video' } })
    const upcoming = await call(runtime, 'GET', '/interviews/upcoming', { query: 'hours=72' })
    assert.equal(upcoming.status, 200)
    assert.deepEqual(
      (upcoming.body as { items: InterviewDto[] }).items.map((item) => item.at),
      [soon],
      '窗口外的（2027 那两场）与已取消的都不该出现',
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('面试的 PATCH / review / DELETE 契约', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const jobId = seedJob(runtime)
    const created = await call(runtime, 'POST', '/interviews', {
      body: { jobId, at: '2027-02-01T02:00:00.000Z' },
    })
    const interview = (created.body as { interview: InterviewDto }).interview

    const patched = await call(runtime, 'PATCH', `/interviews/${String(interview.id)}`, {
      body: { at: '2027-02-02T02:00:00.000Z', place: '深圳湾一号' },
    })
    assert.equal(patched.status, 200)
    const updated = (patched.body as { interview: InterviewDto }).interview
    assert.equal(updated.at, '2027-02-02T02:00:00.000Z')
    assert.equal(updated.place, '深圳湾一号')

    const detail = await call(runtime, 'GET', `/interviews/${String(interview.id)}`)
    assert.equal(detail.status, 200)
    assert.equal((detail.body as InterviewDto).id, interview.id)

    const reviewed = await call(runtime, 'POST', `/interviews/${String(interview.id)}/review`, {
      body: { good: '表达清楚', bad: '项目讲太长' },
    })
    assert.equal(reviewed.status, 200)
    const reviewedDto = (reviewed.body as { interview: InterviewDto }).interview
    assert.equal(reviewedDto.state, 'reviewed', '复盘完状态就是已复盘')
    assert.equal(reviewedDto.review['good'], '表达清楚')

    const removed = await call(runtime, 'DELETE', `/interviews/${String(interview.id)}`)
    assert.equal(removed.status, 200)
    const missing = await call(runtime, 'GET', `/interviews/${String(interview.id)}`)
    assert.equal(missing.status, 404)
    assert.equal((missing.body as { code: string }).code, 'NOT_FOUND')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 看板与归因
// ─────────────────────────────────────────────────────────────────────
test('GET /analytics/funnel|attribution|salary 的形状与口径', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    await openGate(runtime, { requireApproval: false })
    seedResume(runtime)
    const jobId = seedJob(runtime)
    await call(runtime, 'POST', '/applications', { body: { jobId } })

    const funnel = await call(runtime, 'GET', '/analytics/funnel')
    assert.equal(funnel.status, 200)
    const funnelDto = funnel.body as FunnelDto
    assert.deepEqual(
      funnelDto.steps.map((step) => step.key),
      ['greeted', 'delivered', 'read', 'replied', 'applied', 'interviewed', 'offered'],
    )
    assert.equal(funnelDto.steps[0]?.rate, null, '第一层没有转化率')
    assert.equal(funnelDto.sampleSize, 1)
    assert.ok(funnelDto.note.length > 0)
    assert.ok(funnelDto.note.includes('样本'), '样本量口径必须跟着结果一起给出来')

    const attribution = await call(runtime, 'GET', '/analytics/attribution')
    assert.equal(attribution.status, 200)
    const attributionDto = attribution.body as AttributionDto
    assert.deepEqual(
      attributionDto.byChannel.map((row) => row.key),
      ['platform'],
      '只有真的投过的渠道才该出现',
    )
    assert.equal(attributionDto.byChannel[0]?.total, 1)
    assert.equal(attributionDto.sampleSize, 1)
    assert.ok(attributionDto.byResume.length > 0)

    const salary = await call(runtime, 'GET', '/analytics/salary')
    assert.equal(salary.status, 200)
    const salaryDto = salary.body as SalaryBandDto
    assert.deepEqual(Object.keys(salaryDto).sort(), ['count', 'max', 'median', 'min', 'p25', 'p75', 'scope'])
    assert.equal(salaryDto.count, 1)
    assert.equal(salaryDto.median, 25000, '只有一个样本时分位就等于它本身')
    assert.equal(salaryDto.scope, '全部')

    const scoped = await call(runtime, 'GET', '/analytics/salary', { query: 'city=深圳' })
    assert.equal((scoped.body as SalaryBandDto).scope, '深圳')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('GET /followups 给的是"建议"：超时的打招呼要能被推出来', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    const jobId = seedJob(runtime)

    const empty = await call(runtime, 'GET', '/followups')
    assert.equal(empty.status, 200)
    assert.deepEqual((empty.body as { items: FollowUpDto[] }).items, [])

    // 直接写库造一条"100 小时前送达、一直没读"的记录：运行时用的是真实时钟
    const longAgo = new Date(Date.now() - 100 * 3_600_000).toISOString()
    const greeting = store.pipeline.createGreeting(
      { jobId, platformId: '51job', content: '您好，想聊聊这个岗位。', actor: 'gui' },
      longAgo,
    )
    store.pipeline.advanceGreeting(greeting.id, 'delivered', longAgo)

    const result = await call(runtime, 'GET', '/followups')
    assert.equal(result.status, 200)
    const items = (result.body as { items: FollowUpDto[] }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.kind, 'unread-timeout')
    assert.ok((items[0]?.idleHours ?? 0) >= 72)
    assert.ok((items[0]?.advice ?? '').includes('放弃'), '未读超时的建议是"别耗着了"')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('话术模板：POST 建档 → GET 列表带回复率（次数为 0 时不给百分比）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const created = await call(runtime, 'POST', '/greeting/templates', {
      body: { name: '默认打招呼', body: '您好，我做过 {{skill}}，想和您聊聊这个岗位。', vars: ['skill'] },
    })
    assert.equal(created.status, 201)

    const listed = await call(runtime, 'GET', '/greeting/templates')
    assert.equal(listed.status, 200)
    const items = (listed.body as { items: Array<{ name: string; uses: number; replyRate: number | null }> }).items
    assert.equal(items.length, 1)
    assert.equal(items[0]?.name, '默认打招呼')
    assert.equal(items[0]?.replyRate, null, '一次都没用过时回复率是"无从谈起"，不是 0%')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 边界
// ─────────────────────────────────────────────────────────────────────

test('跨站 POST /applications 被拒（C4：宿主对我们的路由不提供任何鉴权）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    seedResume(runtime)
    const jobId = seedJob(runtime)
    const result = await call(runtime, 'POST', '/applications', {
      body: { jobId },
      sameOrigin: false,
    })
    assert.equal(result.status, 403)
    assert.equal((result.body as { code: string }).code, 'CROSS_ORIGIN')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('数据层没就绪时 GET /board 给出可读的 DATA_UNAVAILABLE', async () => {
  const dir = tempDataDir()
  const runtime = createHostRuntime({ dataDir: dir })
  try {
    const result = await call(runtime, 'GET', '/board')
    assert.equal(result.status, 503)
    assert.equal((result.body as { code: string }).code, 'DATA_UNAVAILABLE')
    // 顺带把 P7 的另几个入口也扫一遍：数据层没起来时都不该是 500
    for (const path of ['/applications', '/inbox', '/interviews', '/analytics/funnel', '/followups']) {
      const one = await call(runtime, 'GET', path)
      assert.equal(one.status, 503, `${path} 应当报告数据层不可用`)
      assert.equal((one.body as { code: string }).code, 'DATA_UNAVAILABLE')
    }
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 迁移 v5
// ─────────────────────────────────────────────────────────────────────

test('迁移 v5：老库升上来，七张 P7 表就位且为空，重开不再迁移', () => {
  const dir = tempDataDir()
  try {
    // 不写死版本号：这个断言一加阶段就要改，而它想表达的其实是"v5 已经被纳入迁移链"。
    // 写死会让加 v6 时的失败看起来像 v5 坏了。
    assert.ok(
      (MIGRATIONS.at(-1)?.version ?? 0) >= 5,
      `当前最高版本应当 >= 5，实际 ${String(MIGRATIONS.at(-1)?.version)}`,
    )
    assert.ok(
      MIGRATIONS.some((migration) => migration.version === 5),
      'v5 必须在迁移链里',
    )

    mkdirSync(dir, { recursive: true })
    const path = resolveDbPath(dir)

    // 手工造一个「已经用了 P1，还没有 P7 的表」的库
    const legacy = openDatabase(path)
    legacy.exec(SCHEMA_V1)
    legacy.exec('PRAGMA user_version = 1')
    legacy.exec(
      `INSERT INTO job (platform_id, platform_job_id, title, salary_raw, city, district,
        exp_req, edu_req, tags_json, source_url, first_seen_at, last_seen_at, crawled_at, state)
       VALUES ('51job', 'legacy-1', '老岗位', '20-30K', '深圳', '南山区', '', '', '[]',
        'https://example.com/legacy', '${T_LEGACY}', '${T_LEGACY}', '${T_LEGACY}', 'new')`,
    )
    legacy.close()

    const store = openTestStore(dir)
    try {
      assert.equal(store.migration.to, MIGRATIONS.at(-1)?.version, '升到当前最高版本')
      assert.deepEqual(
        store.migration.applied.map((migration) => migration.version),
        MIGRATIONS.filter((migration) => migration.version > 1).map((migration) => migration.version),
        '只应用缺的那些版本，且按顺序',
      )
      assert.ok(store.migration.backupPath !== null, '从已有库迁移必须先备份')
      assert.ok(existsSync(store.migration.backupPath), '备份文件要真的存在')

      const versionRow = store.db.prepare('PRAGMA user_version').get() as { user_version?: number }
      assert.equal(versionRow.user_version, MIGRATIONS.at(-1)?.version, 'PRAGMA user_version 要推到最高')
      assert.equal(currentVersion(store.db), MIGRATIONS.at(-1)?.version)

      const tables = (
        store.db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name)
      const p7Tables = [
        'greeting_template',
        'greeting',
        'message',
        'application',
        'stage_event',
        'interview',
        'question_note',
      ]
      for (const table of p7Tables) {
        assert.ok(tables.includes(table), `缺少 P7 新表：${table}`)
        const row = store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
        assert.equal(row.n, 0, `${table} 迁移后应当是空的`)
      }

      assert.equal(store.job.count(), 1, '迁移不能弄丢老数据')
      assert.equal(store.pipeline.listApplications().length, 0)
      assert.equal(store.pipeline.listTemplates().length, 0)
    } finally {
      store.close()
    }

    // 再打开一次不再迁移
    const again = openTestStore(dir)
    try {
      assert.deepEqual(again.migration.applied, [])
      assert.equal(currentVersion(again.db), MIGRATIONS.at(-1)?.version, '重开时不再迁移，版本保持最高')
    } finally {
      again.close()
    }
  } finally {
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 适配器动作入口：/inbox/sync（低危）与 /applications/deliver（高危，两段式）
//
// 这两个入口 2026-09-18 才补上，把适配器的 readInbox / sendResume 接到了 HTTP 上。
// ⚠️ 用例一律挑**没有实现该动作**的平台（51job）来断言失败路径 ——
// 这样请求会停在"适配器缺能力"处，**不会真的去启动浏览器**（离线测试的红线）。
// ─────────────────────────────────────────────────────────────────────

/** 把闸门里会随时段漂移的项关掉，并按需打开投递分层。 */
function relaxGuard(runtime: HostRuntime, options: { l4Application?: boolean } = {}): void {
  const store = storeOf(runtime)
  writeGuardConfig(
    store,
    {
      sendWindow: '',
      dayOffProbability: 0,
      levels: { l3Greeting: true, l4Application: options.l4Application === true, l4Reply: true },
    },
    T,
  )
}

test('POST /inbox/sync：适配器没实现收件箱读取 → 如实失败，不返回 0 条', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const result = await call(runtime, 'POST', '/inbox/sync', { body: { platformId: '51job' } })
    assert.equal(result.status, 409)
    const body = result.body as { code: string; message: string }
    assert.equal(body.code, 'ADAPTER_BROKEN')
    assert.ok(body.message.includes('收件箱'), body.message)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /inbox/sync：未登录 → 403 NOT_LOGGED_IN；缺 platformId → 400', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const notLoggedIn = await call(runtime, 'POST', '/inbox/sync', { body: { platformId: 'zhipin' } })
    assert.equal(notLoggedIn.status, 403)
    assert.equal((notLoggedIn.body as { code: string }).code, 'NOT_LOGGED_IN')

    const missing = await call(runtime, 'POST', '/inbox/sync', { body: {} })
    assert.equal(missing.status, 400)
    assert.equal((missing.body as { code: string }).code, 'INVALID_INPUT')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /jobs/:id/detect-stage：适配器没实现探测 → 如实失败（不返回一个像 none 的东西）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    storeOf(runtime).account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const jobId = seedJob(runtime)
    const result = await call(runtime, 'POST', `/jobs/${String(jobId)}/detect-stage`)
    assert.equal(result.status, 409)
    const body = result.body as { code: string; message: string }
    assert.equal(body.code, 'ADAPTER_BROKEN')
    assert.ok(body.message.includes('探测接触阶段'), body.message)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /jobs/:id/detect-stage：低危 → 没有两段式确认；未登录 403 / GET 400 / 岗位不存在 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const jobId = seedJob(runtime)

    // 低危：不弹确认（对比 /messages/:id/reply 的 409 NEEDS_CONFIRM）——
    // 它只读平台上的状态标记，一个字节都不往外发
    const zhipinJobId = seedJob(runtime, { platformId: 'zhipin', platformJobId: 'zp-1' })
    const notLoggedIn = await call(runtime, 'POST', `/jobs/${String(zhipinJobId)}/detect-stage`)
    assert.equal(notLoggedIn.status, 403, '未登录要如实说未登录，而不是先问用户确认')
    assert.equal((notLoggedIn.body as { code: string }).code, 'NOT_LOGGED_IN')

    const wrongMethod = await call(runtime, 'GET', `/jobs/${String(jobId)}/detect-stage`)
    assert.equal(wrongMethod.status, 400)

    const missingJob = await call(runtime, 'POST', '/jobs/9999/detect-stage')
    assert.equal(missingJob.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /applications/deliver：投递分层默认关闭 → 开关先拦，不白问用户一次', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    relaxGuard(runtime) // l4Application 保持默认 false
    const store = storeOf(runtime)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const jobId = seedJob(runtime)
    const result = await call(runtime, 'POST', '/applications/deliver', { body: { jobId } })
    assert.equal(result.status, 403)
    const body = result.body as { code: string; message: string }
    assert.equal(body.code, 'GUARD_DENIED')
    assert.ok(body.message.includes('分层') || body.message.includes('l4Application'), body.message)
    // 被规则拦下会留一条 **denied** 审计（不是"已执行"）—— 这正是审计该记的东西
    const records = store.audit.list(10)
    assert.equal(records.length, 1)
    assert.equal(records[0]?.action, 'application.send')
    assert.equal(records[0]?.result, 'denied')
    assert.equal(store.pipeline.listApplications().length, 0, '没投出去就不能有投递记录')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /applications/deliver：两段式确认 → 确认后执行，适配器缺能力则如实失败', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    relaxGuard(runtime, { l4Application: true })
    const store = storeOf(runtime)
    store.account.upsert(
      { platformId: '51job', loggedIn: true, hiddenFromCurrentEmployer: true, hint: null },
      T,
    )
    const jobId = seedJob(runtime)

    // ① 还没确认：409 + 文案，不执行、不留"已执行"审计
    const first = await call(runtime, 'POST', '/applications/deliver', { body: { jobId } })
    assert.equal(first.status, 409)
    const asked = first.body as { code: string; confirmText: string; action: string; danger: string }
    assert.equal(asked.code, 'NEEDS_CONFIRM')
    assert.equal(asked.action, 'application.send')
    assert.equal(asked.danger, 'high')
    // §4.4.2：确认文案必须写清用了哪版简历
    assert.ok(asked.confirmText.includes('使用简历版本'), asked.confirmText)
    assert.equal(store.audit.list(10).length, 0)

    // ② 确认后：真的执行 → 51job 没有 sendResume → ADAPTER_BROKEN（不是假成功）
    const second = await call(runtime, 'POST', '/applications/deliver', {
      body: { jobId, confirm: true },
    })
    assert.equal(second.status, 409)
    const failure = second.body as { code: string; message: string }
    assert.equal(failure.code, 'ADAPTER_BROKEN')
    assert.ok(failure.message.includes('投递动作'), failure.message)

    const records = store.audit.list(10)
    assert.equal(records.length, 1, '确认后的那一次要留痕')
    assert.equal(records[0]?.action, 'application.send')
    assert.equal(records[0]?.result, 'error', '适配器缺能力 → 审计记 error，不是 ok')
    assert.equal(store.pipeline.listApplications().length, 0, '没投出去就不能有投递记录')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /applications/deliver：缺 jobId / 岗位不存在 → 400 / 404', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    relaxGuard(runtime, { l4Application: true })
    const missing = await call(runtime, 'POST', '/applications/deliver', { body: {} })
    assert.equal(missing.status, 400)

    const notFound = await call(runtime, 'POST', '/applications/deliver', {
      body: { jobId: 99999, confirm: true },
    })
    assert.equal(notFound.status, 404)
    assert.equal((notFound.body as { code: string }).code, 'NOT_FOUND')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
