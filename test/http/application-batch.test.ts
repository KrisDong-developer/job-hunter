/**
 * 批量投递的**路由契约**测试（L4）。
 *
 * 走真实 runtime + 真实 HTTP 路由，但**不碰浏览器**：这里要钉的是协议、"逐条不整批失败"，
 * 以及本轮收紧的那一格 —— **不接受文件路径**。真投递的那条路径需要登录态 + 页面，
 * 由 `test/host/application-batch.test.ts` 用注入依赖覆盖其逻辑。
 *
 * 这里能覆盖到的真实结论本身就有价值：**只有 zhipin 与 zhaopin 的适配器实现了投递**，
 * 所以"跨平台勾一批"的真实结果是"能投的没几个" —— 这正是预览要提前说清的事。
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
    platformId: 'zhaopin',
    platformJobId: 'ab-1',
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
    sourceUrl: 'https://example.com/ab-1',
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

function storeOf(runtime: HostRuntime) {
  const store = runtime.store()
  assert.ok(store !== undefined, '数据层应当已就绪')
  return store
}

/** 造一份简历 + 一个附件（`resume_file`），返回附件 id。 */
function seedResumeFile(runtime: HostRuntime): number {
  const store = storeOf(runtime)
  const resume = store.resume.create(
    {
      name: '前端 · 2026 春',
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
  )
  return store.resume.addFile(
    {
      resumeId: resume.id,
      format: 'pdf',
      template: 'concise',
      path: `resume-${String(resume.id)}/resume-2026.pdf`,
      bytes: 1234,
      fileName: 'resume-2026.pdf',
    },
    T,
  ).id
}

/**
 * 把闸门调到"可以走到投递那一步"的状态。
 *
 * 三件事缺一不可（与 `test/http/greeting-batch.test.ts` 的 `openGate` 同一套理由）：
 *   1. **打开发送分层 L4**（默认关闭）—— 否则闸门第一条就拒；
 *   2. 关掉发送窗口与随机休息日 —— 它们按**本地时钟**判定，晚上跑测试会得到"不在窗口内"；
 *   3. 逐个平台确认「对当前雇主隐藏」已开 —— 高危动作（`danger: 'high'`）的强制前置（D4）。
 *
 * ⚠️ `loggedIn` 由调用方给：这批用例要钉的正是"未登录"与"平台没接投递"这两种
 * **过了闸门之后**才暴露的原因。
 */
async function openGate(
  runtime: HostRuntime,
  platformIds: string[],
  options: { loggedIn?: boolean } = {},
): Promise<void> {
  const result = await routeRequest(runtime, {
    method: 'PATCH',
    path: '/settings',
    query: new URLSearchParams(''),
    headers: {},
    sameOrigin: true,
    readJson: async () => ({
      guard: {
        levels: { l3Greeting: true, l4Application: true, l4Reply: false },
        cooldownMinutes: 0,
        sendWindow: '',
        dayOffProbability: 0,
      },
    }),
  })
  assert.equal(result.kind === 'json' ? result.status : 0, 200, '界面改自己的风险开关是允许的')

  const store = storeOf(runtime)
  for (const platformId of platformIds) {
    store.account.upsert(
      {
        platformId,
        loggedIn: options.loggedIn ?? false,
        hiddenFromCurrentEmployer: true,
        hint: null,
      },
      T,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────
// 预览
// ─────────────────────────────────────────────────────────────────────

test('POST /applications/deliver-batch/preview：逐条给出"能不能投 + 为什么"', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    // zhaopin 实现了 sendResume 但**未登录**；51job 刻意没实现投递动作
    const zhaopin = store.job.upsert(jobInput({ platformId: 'zhaopin', platformJobId: 'p-1' }), T).id
    const fiftyone = store.job.upsert(jobInput({ platformId: '51job', platformJobId: 'p-2' }), T).id

    const result = await call(runtime, '/applications/deliver-batch/preview', {
      jobIds: [zhaopin, fiftyone, 999_999],
    })
    assert.equal(result.status, 200)
    const plan = (result.body as {
      plan: {
        items: Array<{ jobId: number; willDeliver: boolean; blocker: { code: string; hint?: string } | null }>
        sendable: number
        blocked: number
        batchMax: number
        resumeFileId: number | null
        note: string
      }
    }).plan

    assert.equal(plan.items.length, 3)
    assert.equal(plan.sendable, 0, '未登录 + 平台没接投递 → 一条都投不出去')
    assert.equal(plan.blocked, 3)
    assert.equal(plan.batchMax, BATCH_MAX_ITEMS)
    assert.equal(plan.resumeFileId, null, '不传就是平台内简历')

    const byId = new Map(plan.items.map((item) => [item.jobId, item]))
    assert.equal(byId.get(999_999)?.blocker?.code, 'missing')
    assert.equal(
      byId.get(fiftyone)?.blocker?.code,
      'platform_unsupported',
      '51job 适配器刻意没实现投递 —— 要说"平台不支持"，而不是含糊的失败',
    )
    assert.ok((byId.get(fiftyone)?.blocker?.hint ?? '').length > 0, '要给出下一步，而不是一句"投不了"')
    assert.equal(byId.get(zhaopin)?.blocker?.code, 'not_logged_in')
    assert.ok(plan.note.includes('预测'), plan.note)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 预览：指定了本地附件时说清"传不传得上去"；附件的 id 才认，路径不认', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    // 要走到"用哪份简历"这一格，得先过"平台能力 + 登录"（那是 ①，闸门是 ②）——
    // 所以这里必须让 zhaopin 处于已登录
    await openGate(runtime, ['zhaopin'], { loggedIn: true })
    const jobId = store.job.upsert(jobInput({ platformId: 'zhaopin', platformJobId: 'rf-1' }), T).id
    const fileId = seedResumeFile(runtime)

    const withFile = await call(runtime, '/applications/deliver-batch/preview', {
      jobIds: [jobId],
      resumeFileId: fileId,
    })
    assert.equal(withFile.status, 200)
    const plan = (withFile.body as {
      plan: {
        items: Array<{ willDeliver: boolean; blocker: unknown }>
        sendable: number
        resumeFileId: number | null
        resumeLabel: string | null
        uploadsResumeFile: boolean | null
      }
    }).plan
    assert.equal(plan.resumeFileId, fileId)
    assert.ok((plan.resumeLabel ?? '').includes('resume-2026.pdf'), '标签里要能看出是哪份文件')
    assert.equal(plan.uploadsResumeFile, false, 'zhaopin 只吃平台内简历（实测）')
    assert.equal(
      plan.sendable,
      1,
      '平台只吃自己那份**不妨碍投递** —— 选的这份只是本地登记，不是拦下的理由',
    )
    assert.equal(plan.items[0]?.blocker, null)

    // ⚠️ 本轮收紧的那一格：**路径**不再是合法输入（上一版 `filePath` 收任意字符串、零校验）
    const asPath = await call(runtime, '/applications/deliver-batch/preview', {
      jobIds: [jobId],
      resumeFileId: 'C:\\Users\\me\\resume.pdf',
    })
    assert.equal(asPath.status, 400, '只认 id，不认路径')
    assert.ok(((asPath.body as { hint?: string }).hint ?? '').includes('不接受文件路径'))

    // 库里没有这个附件 → 404（整批，不是逐条报同一个错）
    const missingFile = await call(runtime, '/applications/deliver-batch/preview', {
      jobIds: [jobId],
      resumeFileId: 999_999,
    })
    assert.equal(missingFile.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('预览是只读的：反复调用不写投递记录、不写审计', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    const jobId = store.job.upsert(jobInput({ platformId: '51job', platformJobId: 'ro-1' }), T).id
    const before = store.pipeline.listApplications().length
    const auditsBefore = store.audit.list(10).length

    await call(runtime, '/applications/deliver-batch/preview', { jobIds: [jobId] })
    await call(runtime, '/applications/deliver-batch/preview', { jobIds: [jobId] })

    assert.equal(store.pipeline.listApplications().length, before, '预览一条投递记录都不该写')
    assert.equal(store.audit.list(10).length, auditsBefore, '预览不该留审计')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('预览：jobIds 缺失/为空/全是垃圾 → 400（而不是返回一个空计划）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    assert.equal((await call(runtime, '/applications/deliver-batch/preview', {})).status, 400)
    assert.equal((await call(runtime, '/applications/deliver-batch/preview', { jobIds: [] })).status, 400)
    // 脏 body 不该变成一条 jobId=NaN 的投递尝试
    assert.equal(
      (await call(runtime, '/applications/deliver-batch/preview', { jobIds: ['x', 0, -1] })).status,
      400,
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 发送
// ─────────────────────────────────────────────────────────────────────

test('批量投递必须带 confirm：不带就是 400，且提示先看预览', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const result = await call(runtime, '/applications/deliver-batch', { jobIds: [1] })
    assert.equal(result.status, 400)
    assert.ok(((result.body as { hint?: string }).hint ?? '').includes('preview'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ 逐条回执而不是整批失败：两种"投不了"各自成条，脚本继续跑完', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    // 闸门先过（L4 开关 / 隐身 / 窗口 / 休息日），剩下的两种"投不了"才有机会各自成条
    await openGate(runtime, ['zhaopin', '51job'])
    const zhaopin = store.job.upsert(jobInput({ platformId: 'zhaopin', platformJobId: 's-1' }), T).id
    const fiftyone = store.job.upsert(jobInput({ platformId: '51job', platformJobId: 's-2' }), T).id

    const result = await call(runtime, '/applications/deliver-batch', {
      confirm: true,
      jobIds: [zhaopin, fiftyone],
    })
    assert.equal(result.status, 200, '个别条投不出去不该让整个请求失败')
    const batch = (result.body as {
      result: {
        receipts: Array<{ jobId: number; ok: boolean; code: string | null; delivery: string | null }>
        sent: number
        failed: number
        note: string
      }
    }).result

    assert.equal(batch.sent, 0)
    assert.equal(batch.failed, 2, '两条各自失败，而不是抛一个异常就此中断')
    assert.deepEqual(
      batch.receipts.map((receipt) => receipt.jobId),
      [zhaopin, fiftyone],
    )
    assert.equal(batch.receipts[0]?.code, 'NOT_LOGGED_IN', 'zhaopin：实现了投递但未登录')
    assert.equal(batch.receipts[1]?.code, 'ADAPTER_BROKEN', '51job：适配器没实现投递')
    assert.ok(batch.receipts.every((receipt) => receipt.ok === false))
    assert.ok(batch.receipts.every((receipt) => receipt.delivery === null), '没投出去就不能有送达状态')
    assert.ok(batch.note.includes('逐条'), batch.note)
    assert.equal(store.pipeline.listApplications().length, 0, '一条都没投出去就不能有投递记录')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('一条失败不影响后面的条：坏 id 夹在中间也照样走完', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    await openGate(runtime, ['51job'])
    const fiftyone = store.job.upsert(jobInput({ platformId: '51job', platformJobId: 'm-1' }), T).id

    const result = await call(runtime, '/applications/deliver-batch', {
      confirm: true,
      jobIds: [fiftyone, 999_999, fiftyone],
    })
    const receipts = (result.body as { result: { receipts: Array<{ ok: boolean; code: string | null }> } }).result
      .receipts
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
    const tooMany = Array.from({ length: BATCH_MAX_ITEMS + 1 }, (_unused, index) => index + 1)
    const over = await call(runtime, '/applications/deliver-batch', { confirm: true, jobIds: tooMany })
    assert.equal(over.status, 400)
    assert.ok(((over.body as { message?: string }).message ?? '').includes(String(BATCH_MAX_ITEMS)))

    assert.equal((await call(runtime, '/applications/deliver-batch', { confirm: true, jobIds: [] })).status, 400)
    assert.equal(
      (await call(runtime, '/applications/deliver-batch', { confirm: true, jobIds: [0] })).status,
      400,
    )
    assert.equal(
      (await call(runtime, '/applications/deliver-batch', { confirm: true, jobIds: ['x'] })).status,
      400,
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('跨站来源不许批量投递/预览（与其它危险动作同一条纪律）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    assert.equal(
      (await call(runtime, '/applications/deliver-batch', { confirm: true, jobIds: [1] }, false)).status,
      403,
    )
    assert.equal(
      (await call(runtime, '/applications/deliver-batch/preview', { jobIds: [1] }, false)).status,
      403,
    )
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('路由字面量优先：deliver-batch 不会被 /applications/:id 吃掉', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    // 若 `deliver-batch` 被当成投递 id 处理，这里会得到"非法投递 id"的 400，而不是"需要确认"的 400
    const result = await call(runtime, '/applications/deliver-batch', { jobIds: [] })
    assert.equal(result.status, 400)
    assert.ok(((result.body as { hint?: string }).hint ?? '').includes('preview'))
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 单条：`filePath` 这条老契约必须真的不再被使用
// ─────────────────────────────────────────────────────────────────────

test('★ POST /applications/deliver：body 里的 filePath 不再有任何作用（路径不再是输入）', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    await openGate(runtime, ['zhaopin'])
    const jobId = store.job.upsert(jobInput({ platformId: 'zhaopin', platformJobId: 'fp-1' }), T).id

    // 上一版这里会把这个字符串原样写进审批文案（"本地文件：..."）并当成绝对路径用。
    // 现在它必须**完全无效**：既不进文案，也不改变行为。
    const result = await call(runtime, '/applications/deliver', {
      jobId,
      filePath: 'C:\\Users\\me\\secrets\\resume.pdf',
    })
    assert.equal(result.status, 409, '仍然走两段式确认')
    const asked = result.body as { code: string; confirmText: string }
    assert.equal(asked.code, 'NEEDS_CONFIRM')
    assert.equal(
      asked.confirmText.includes('secrets'),
      false,
      '路径不该出现在确认文案里 —— 那是本机目录结构，用户核对用的应该是"哪一版简历"',
    )
    assert.equal(asked.confirmText.includes('C:\\'), false, '确认文案里不该有任何绝对路径')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('POST /applications/deliver：resumeFileId 只认正整数，路径一律 400', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    const jobId = store.job.upsert(jobInput({ platformId: 'zhaopin', platformJobId: 'rf-2' }), T).id
    const bad = await call(runtime, '/applications/deliver', { jobId, resumeFileId: '/etc/passwd' })
    assert.equal(bad.status, 400)
    assert.ok(((bad.body as { hint?: string }).hint ?? '').includes('不接受文件路径'))

    // 合法 id 但库里没有 → 404（在闸门之前就断了，不会白问用户一次确认）
    const missing = await call(runtime, '/applications/deliver', { jobId, resumeFileId: 999_999 })
    assert.equal(missing.status, 404)
  } finally {
    runtime.close()
    cleanup(dir)
  }
})

test('★ POST /applications/deliver：确认文案写清"用了哪份、以及它会不会真的传上去"', async () => {
  const { runtime, dir } = await openRuntime()
  try {
    const store = storeOf(runtime)
    await openGate(runtime, ['zhaopin'], { loggedIn: true })
    const jobId = store.job.upsert(jobInput({ platformId: 'zhaopin', platformJobId: 'rv-1' }), T).id
    const fileId = seedResumeFile(runtime)

    const result = await call(runtime, '/applications/deliver', { jobId, resumeFileId: fileId })
    assert.equal(result.status, 409, '两段式确认：先给文案，不执行')
    const asked = result.body as { code: string; confirmText: string }
    assert.equal(asked.code, 'NEEDS_CONFIRM')
    // §4.4.2 要"用了哪版简历"。而且只说"哪一份"还不够 ——
    // **会不会真的传上去**必须一起说，否则用户会以为自己传了一版、平台上收到的却是另一版
    assert.ok(asked.confirmText.includes('resume-2026.pdf'), asked.confirmText)
    assert.ok(asked.confirmText.includes('不会上传'), `zhaopin 只吃自己那份，必须说出来：${asked.confirmText}`)
    assert.equal(asked.confirmText.includes('C:\\'), false, '确认文案里不该有任何绝对路径')
  } finally {
    runtime.close()
    cleanup(dir)
  }
})
