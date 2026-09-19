/**
 * 批量投递的**编排逻辑**测试（L4）。
 *
 * 为什么不走 HTTP：真投递要登录态 + 页面，而这里要钉的是**预测与逐条回执**这两件纯逻辑的事
 * —— 所以直接把依赖注入进来。路由层的契约（400 / 上限 / 逐条不整批失败）在
 * `test/http/application-batch.test.ts` 里。
 *
 * 重点断言五件事：
 *   1. 两种"发不出去"要分清：**平台没接投递动作** 与 **未登录**（且顺序是能力先于登录）；
 *   2. 投递独有的那一格：**平台只吃平台内简历时，指定了本地附件的条目要被逐条拦下**
 *      （这是投递与打招呼最大的不同——用户能改，所以必须说清楚）；
 *   3. 两种**批内预测**必须准：同一家公司、当日额度余量；
 *   4. **逐条回执**：一条失败不影响其它条，顺序与传入一致，且送达状态带出来；
 *   5. 随机间隔插在**条与条之间**，且由宿主保证。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BATCH_ITEM_INTERVAL_MS, BATCH_MAX_ITEMS } from '../../src/shared/constants.js'
import type { ApplicationBatchBlockerDto } from '../../src/shared/dto.js'
import type { DeliveryState } from '../../src/shared/enums.js'
import type { ApplicationSendResult } from '../../src/host/guard/actions/application.js'
import {
  previewApplicationBatch,
  sendApplicationBatch,
  type ApplicationBatchDeps,
} from '../../src/host/runtime/application-batch.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, fixedClock, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: 'zhaopin',
    platformJobId: `batch-${String(Math.random()).slice(2, 8)}`,
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
    sourceUrl: 'https://example.com/x',
    publishedAt: T,
    ...overrides,
  }
}

/** 装配一份"可控"的依赖：默认全部能投、全部成功。 */
function depsOf(
  store: Store,
  options: {
    /** 这些岗位投递时抛错。 */
    failJobIds?: number[]
    /** 这些平台"投不了"（模拟适配器没实现投递）。 */
    unsupportedPlatforms?: string[]
    /** 这些平台"未登录"。 */
    notLoggedInPlatforms?: string[]
    /** 这些平台"只吃平台内简历"（`resumeSource = platform-only`）。默认全部都只吃平台内简历。 */
    platformOnlyResume?: string[]
    /** 库里存在的简历附件：id → 可读标签。 */
    resumeFiles?: Record<number, string>
    /** 闸门预检直接拒绝。 */
    guardDenied?: boolean
    cooldownMinutes?: number
    /** 当日额度余量（同一平台）。 */
    remaining?: number
    /** 这些条只到"已发出·未确认"。 */
    pendingJobIds?: number[]
  } = {},
): ApplicationBatchDeps & { sleeps: number[]; sentBatchSizes: number[] } {
  const sleeps: number[] = []
  const sentBatchSizes: number[] = []
  const platformOnly = options.platformOnlyResume ?? ['zhaopin', 'zhipin']
  return {
    store,
    sleeps,
    sentBatchSizes,
    sendOne: async (input) => {
      sentBatchSizes.push(input.batchSize ?? 0)
      if ((options.failJobIds ?? []).includes(input.jobId)) {
        throw new DomainError('ADAPTER_BROKEN', `第 ${String(input.jobId)} 条投递失败`)
      }
      const delivery: DeliveryState = (options.pendingJobIds ?? []).includes(input.jobId)
        ? 'pending'
        : 'delivered'
      return {
        jobId: input.jobId,
        platformId: 'zhaopin',
        company: '某某科技',
        title: '前端工程师',
        sentAt: '2026-09-16T10:00:05.000Z',
        delivery,
      } satisfies ApplicationSendResult
    },
    previewGuard: () =>
      options.guardDenied === true
        ? {
            ok: false,
            verdict: { ok: false, reason: 'window', message: '现在不在发送窗口内', hint: '等窗口开启。' },
            needsApproval: true,
          }
        : { ok: true, verdict: { ok: true }, needsApproval: true },
    platformBlocker: (platformId): ApplicationBatchBlockerDto | null => {
      if ((options.unsupportedPlatforms ?? []).includes(platformId)) {
        return {
          code: 'platform_unsupported',
          message: `${platformId} 的适配器还没实现投递动作`,
          hint: '不会让你点下去再失败。',
        }
      }
      if ((options.notLoggedInPlatforms ?? []).includes(platformId)) {
        return { code: 'not_logged_in', message: `${platformId} 未登录`, hint: '先去登录。' }
      }
      return null
    },
    acceptsLocalResume: (platformId) => !platformOnly.includes(platformId),
    resumeLabelOf: (resumeFileId) => options.resumeFiles?.[resumeFileId] ?? null,
    sideEffectOf: () => null,
    cooldownMinutes: () => options.cooldownMinutes ?? 24 * 60,
    remainingToday: () =>
      options.remaining === undefined
        ? null
        : { remaining: options.remaining, limit: 10, used: 10 - options.remaining },
    clock: fixedClock(T),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    random: () => 0,
  }
}

function seedJob(store: Store, overrides: Partial<JobUpsertInput> = {}): number {
  return store.job.upsert(jobInput(overrides), T).id
}

function seedCompany(store: Store, name: string): number {
  return store.company.ensure({ name, nameNorm: name }, T).id
}

// ─────────────────────────────────────────────────────────────────────
// 预览
// ─────────────────────────────────────────────────────────────────────

test('预览：平台没接投递 / 未登录各有各的说法，且能力先于登录', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const ok = seedJob(store, { platformId: 'zhaopin', platformJobId: 'a' })
    const unsupported = seedJob(store, { platformId: '51job', platformJobId: 'b' })
    // 这个平台既没接投递、也"未登录"：说出来的必须是**平台不支持**（登录了也一样投不了）
    const both = seedJob(store, { platformId: 'liepin', platformJobId: 'c' })

    const deps = depsOf(store, {
      unsupportedPlatforms: ['51job', 'liepin'],
      notLoggedInPlatforms: ['liepin'],
    })
    const plan = await previewApplicationBatch(deps, {
      jobIds: [ok, unsupported, both],
      resumeFileId: null,
      actor: 'gui',
    })

    assert.equal(plan.sendable, 1)
    assert.equal(plan.blocked, 2)
    assert.equal(plan.items[1]?.blocker?.code, 'platform_unsupported')
    assert.equal(plan.items[2]?.blocker?.code, 'platform_unsupported', '能力先于登录：登录了也投不出去')
    assert.equal(plan.batchMax, BATCH_MAX_ITEMS)
    assert.deepEqual(plan.intervalMs, { min: BATCH_ITEM_INTERVAL_MS.min, max: BATCH_ITEM_INTERVAL_MS.max })
    assert.equal(plan.resumeFileId, null)
    assert.equal(plan.resumeLabel, null)
    assert.ok(plan.note.includes('预测'), plan.note)
    assert.ok(plan.note.includes('不可逆'), plan.note)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('★ 投递独有的一格：指定了本地附件时，要说清"这份文件到底传不传得上去"（而不是拦下）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const a = seedJob(store, { platformId: 'zhaopin', platformJobId: 'r-1' })
    const b = seedJob(store, { platformId: 'zhipin', platformJobId: 'r-2' })

    const platformOnly = await previewApplicationBatch(
      depsOf(store, { resumeFiles: { 7: '前端 · 2026 春 · resume-2026.pdf' } }),
      { jobIds: [a, b], resumeFileId: 7, actor: 'gui' },
    )
    assert.equal(
      platformOnly.sendable,
      2,
      '平台只吃自己那份**不妨碍这次投递成功** —— 它只影响"文件到底传没传"',
    )
    assert.equal(platformOnly.uploadsResumeFile, false, '两个平台都不接受本地附件')
    assert.equal(platformOnly.items[0]?.blocker, null)
    assert.equal(platformOnly.resumeFileId, 7)
    assert.equal(platformOnly.resumeLabel, '前端 · 2026 春 · resume-2026.pdf')

    // 平台**接受**上传时，同一个选择就会被真的传上去（未来有平台实现上传时这条路要通）
    const accepting = await previewApplicationBatch(
      depsOf(store, { platformOnlyResume: [], resumeFiles: { 7: '前端 · 2026 春 · resume-2026.pdf' } }),
      { jobIds: [a, b], resumeFileId: 7, actor: 'gui' },
    )
    assert.equal(accepting.uploadsResumeFile, true)
    assert.equal(accepting.sendable, 2)

    // 不指定附件：这一格不适用（走平台内简历）
    const none = await previewApplicationBatch(depsOf(store), {
      jobIds: [a],
      resumeFileId: null,
      actor: 'gui',
    })
    assert.equal(none.uploadsResumeFile, null)
    assert.equal(none.resumeLabel, null)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('预览：附件 id 在库里找不到 → 整批拒绝（不在预览里逐条报同一个错）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const a = seedJob(store, { platformJobId: 'm-1' })
    await assert.rejects(
      () =>
        previewApplicationBatch(depsOf(store), { jobIds: [a], resumeFileId: 404, actor: 'gui' }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'NOT_FOUND' &&
        error.message.includes('404'),
    )
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('预览：岗位不存在 / 闸门拒绝各有各的原因（闸门要带上被哪条规则拦的）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const jobId = seedJob(store, {})

    const missing = await previewApplicationBatch(depsOf(store), {
      jobIds: [999_999],
      resumeFileId: null,
      actor: 'gui',
    })
    assert.equal(missing.items[0]?.blocker?.code, 'missing')
    assert.ok((missing.items[0]?.blocker?.hint ?? '').length > 0)

    const denied = await previewApplicationBatch(depsOf(store, { guardDenied: true }), {
      jobIds: [jobId],
      resumeFileId: null,
      actor: 'gui',
    })
    assert.equal(denied.items[0]?.blocker?.code, 'guard_denied')
    assert.equal(denied.items[0]?.blocker?.reason, 'window', '要带上被哪条规则拦的')
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('★ 批内预测之一：同一家公司只让投一条（照冷却期口径，默认 24 小时）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const companyId = seedCompany(store, '某某科技有限公司')
    const first = seedJob(store, { platformJobId: 'same-1', companyId })
    const second = seedJob(store, { platformJobId: 'same-2', companyId })
    const other = seedJob(store, { platformJobId: 'other-1' })

    const plan = await previewApplicationBatch(depsOf(store), {
      jobIds: [first, second, other],
      resumeFileId: null,
      actor: 'gui',
    })
    assert.equal(plan.items[0]?.willDeliver, true, '第一条照常投')
    assert.equal(plan.items[1]?.blocker?.code, 'duplicate_company', '同公司第二条要在预览里被拦下')
    assert.ok((plan.items[1]?.blocker?.message ?? '').includes('某某科技'))
    assert.equal(plan.items[2]?.willDeliver, true, '另一家公司不受影响')

    // 冷却期设为 0（不限制）时不该再去重 —— 否则用户改了设置，预览还在拦
    const off = await previewApplicationBatch(depsOf(store, { cooldownMinutes: 0 }), {
      jobIds: [first, second],
      resumeFileId: null,
      actor: 'gui',
    })
    assert.equal(off.sendable, 2)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('★ 批内预测之二：当日额度只剩 1 条时，后面的条在预览里就要说清', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const a = seedJob(store, { platformJobId: 'q-1' })
    const b = seedJob(store, { platformJobId: 'q-2' })
    const c = seedJob(store, { platformJobId: 'q-3' })

    const plan = await previewApplicationBatch(depsOf(store, { remaining: 1 }), {
      jobIds: [a, b, c],
      resumeFileId: null,
      actor: 'gui',
    })
    assert.equal(plan.sendable, 1, '额度只剩 1 条，这一批就只有 1 条能投出去')
    assert.equal(plan.items[1]?.blocker?.code, 'quota_exhausted')
    assert.ok((plan.items[1]?.blocker?.message ?? '').includes('/10'), plan.items[1]?.blocker?.message)
  } finally {
    store.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 执行
// ─────────────────────────────────────────────────────────────────────

test('★ 逐条回执：一条失败不影响其它条，顺序与传入一致，且带上送达状态', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const a = seedJob(store, { platformJobId: 's-1' })
    const b = seedJob(store, { platformJobId: 's-2' })
    const c = seedJob(store, { platformJobId: 's-3' })
    const deps = depsOf(store, { failJobIds: [b], pendingJobIds: [c] })

    const result = await sendApplicationBatch(deps, {
      jobIds: [a, b, c],
      resumeFileId: null,
      actor: 'gui',
      guiConfirmed: true,
    })

    assert.equal(result.sent, 2)
    assert.equal(result.failed, 1)
    assert.deepEqual(
      result.receipts.map((receipt) => receipt.jobId),
      [a, b, c],
      '回执顺序必须与传入一致（用户按顺序核对）',
    )
    assert.deepEqual(
      result.receipts.map((receipt) => receipt.ok),
      [true, false, true],
      '中间那条失败，后面的照样投出去 —— 没有"整批失败"这种状态',
    )
    assert.equal(result.receipts[1]?.code, 'ADAPTER_BROKEN')
    assert.ok((result.receipts[1]?.message ?? '').includes(String(b)))
    assert.equal(result.receipts[1]?.delivery, null, '没投出去就没有送达状态可报')
    assert.equal(result.receipts[0]?.delivery, 'delivered')
    assert.equal(result.receipts[2]?.delivery, 'pending', '只到"已发出·未确认"的要如实带出来')
    assert.ok(
      result.note.includes('未确认'),
      `只到 pending 的条数必须单独说出来，否则用户以为全投成功了：${result.note}`,
    )
    assert.ok(result.note.includes('逐条'), result.note)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('★ 随机间隔插在条与条之间（第一条不等、单条完全不等）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const ids = ['i-1', 'i-2', 'i-3'].map((platformJobId) => seedJob(store, { platformJobId }))

    const deps = depsOf(store)
    await sendApplicationBatch(deps, { jobIds: ids, resumeFileId: null, actor: 'gui', guiConfirmed: true })
    assert.deepEqual(
      deps.sleeps,
      [BATCH_ITEM_INTERVAL_MS.min, BATCH_ITEM_INTERVAL_MS.min],
      '3 条 → 2 次间隔',
    )

    const single = depsOf(store)
    await sendApplicationBatch(single, {
      jobIds: [ids[0] as number],
      resumeFileId: null,
      actor: 'gui',
      guiConfirmed: true,
    })
    assert.deepEqual(single.sleeps, [], '单条不需要等')
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('整批条数要透传给闸门（§22.4 的批量上限靠它判定）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const ids = ['n-1', 'n-2'].map((platformJobId) => seedJob(store, { platformJobId }))
    const deps = depsOf(store)
    await sendApplicationBatch(deps, { jobIds: ids, resumeFileId: null, actor: 'model' })
    assert.deepEqual(
      deps.sentBatchSizes,
      [2, 2],
      '每条都要带整批条数 —— 否则每条看上去都只有 1 条，批量上限永远不会触发',
    )
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('条数上限与空列表：直接拒绝，不进入循环', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const deps = depsOf(store)
    await assert.rejects(
      () => sendApplicationBatch(deps, { jobIds: [], resumeFileId: null, actor: 'gui' }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
    const tooMany = Array.from({ length: BATCH_MAX_ITEMS + 1 }, (_unused, index) => index + 1)
    await assert.rejects(
      () => sendApplicationBatch(deps, { jobIds: tooMany, resumeFileId: null, actor: 'gui' }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.message.includes(String(BATCH_MAX_ITEMS)) &&
        (error.hint ?? '').includes('分批'),
    )
    assert.deepEqual(deps.sleeps, [], '被拒绝时不该有任何等待或投递')
    assert.deepEqual(deps.sentBatchSizes, [], '被拒绝时一条都不该投出去')
  } finally {
    store.close()
    cleanup(dir)
  }
})
