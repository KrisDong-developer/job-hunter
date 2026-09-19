/**
 * 批量打招呼的**编排逻辑**测试（D3 / U1）。
 *
 * 为什么不走 HTTP：真正能发的那条路径需要"适配器实现了 sayHello + 已登录 + 页面"，
 * 而这里要钉的是**预测与逐条回执**这两件纯逻辑的事 —— 所以直接把依赖注入进来。
 * 路由层的契约（400 / 上限 / 逐条不整批失败）在 `test/http/greeting-batch.test.ts` 里。
 *
 * 重点断言四件事：
 *   1. 只为"能发"的项生成话术（注定发不出去的岗位不花模型调用）；
 *   2. 两种**批内预测**必须准：同一家公司、当日额度余量（否则预览就是装饰）；
 *   3. **逐条回执**：一条失败不影响其它条，且顺序与传入一致；
 *   4. 随机间隔插在**条与条之间**（第一条不等、最后一条后面不等），且由宿主机保证。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BATCH_ITEM_INTERVAL_MS, BATCH_MAX_ITEMS } from '../../src/shared/constants.js'
import type { GreetingDraftDto } from '../../src/shared/dto.js'
import type { GreetingSendResult } from '../../src/host/guard/actions/greeting.js'
import { previewGreetingBatch, sendGreetingBatch, type GreetingBatchDeps } from '../../src/host/runtime/greeting-batch.js'
import type { Store } from '../../src/host/store/store.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, fixedClock, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: 'zhipin',
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

/** 装配一份"可控"的依赖：默认全部能发、全部成功。 */
function depsOf(
  store: Store,
  options: {
    /** 这些岗位发送时抛错。 */
    failJobIds?: number[]
    /** 这些平台"发不了"（模拟适配器没实现 / 未登录）。 */
    unsupportedPlatforms?: string[]
    /** 闸门预检直接拒绝。 */
    guardDenied?: boolean
    cooldownMinutes?: number
    /** 当日额度余量（同一平台）。 */
    remaining?: number
    draftFails?: boolean
  } = {},
): GreetingBatchDeps & { sleeps: number[]; drafted: number[]; sentBatchSizes: number[] } {
  const sleeps: number[] = []
  const drafted: number[] = []
  const sentBatchSizes: number[] = []
  return {
    store,
    sleeps,
    drafted,
    sentBatchSizes,
    draft: async ({ jobId }) => {
      drafted.push(jobId)
      if (options.draftFails === true) throw new DomainError('INTERNAL', '模型不可用')
      return {
        jobId,
        text: `您好，我对这个岗位（#${String(jobId)}）很感兴趣，方便聊聊吗？`,
        via: 'template',
        notes: [],
        outboundFields: [],
        callId: null,
      } satisfies GreetingDraftDto
    },
    sendOne: async (input) => {
      sentBatchSizes.push(input.batchSize ?? 0)
      if ((options.failJobIds ?? []).includes(input.jobId)) {
        throw new DomainError('ADAPTER_BROKEN', `第 ${String(input.jobId)} 条发送失败`)
      }
      return {
        jobId: input.jobId,
        platformId: 'zhipin',
        company: '某某科技',
        title: '前端工程师',
        sentAt: '2026-09-16T10:00:05.000Z',
        textLength: (input.text ?? '').length,
      } satisfies GreetingSendResult
    },
    previewGuard: () =>
      options.guardDenied === true
        ? {
            ok: false,
            verdict: { ok: false, reason: 'window', message: '现在不在发送窗口内', hint: '等窗口开启。' },
            needsApproval: true,
          }
        : { ok: true, verdict: { ok: true }, needsApproval: true },
    canSend: (platformId) =>
      (options.unsupportedPlatforms ?? []).includes(platformId)
        ? {
            code: 'platform_unsupported',
            message: `${platformId} 的适配器还没实现打招呼动作`,
            hint: '平台自身没有稳定的"发起聊天"入口契约。',
          }
        : null,
    sideEffectOf: () => null,
    cooldownMinutes: () => options.cooldownMinutes ?? 24 * 60,
    remainingToday: () => (options.remaining === undefined ? null : { remaining: options.remaining, limit: 20, used: 20 - options.remaining }),
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
  // `nameNorm` 是实体身份键（由领域层归一化后传入），这里测试数据直接用原名即可
  return store.company.ensure({ name, nameNorm: name }, T).id
}

// ─────────────────────────────────────────────────────────────────────
// 预览
// ─────────────────────────────────────────────────────────────────────

test('预览只为"能发"的项生成话术', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const ok1 = seedJob(store, { platformId: 'zhipin', platformJobId: 'a' })
    const ok2 = seedJob(store, { platformId: 'zhipin', platformJobId: 'b' })
    const bad = seedJob(store, { platformId: 'liepin', platformJobId: 'c' })
    const deps = depsOf(store, { unsupportedPlatforms: ['liepin'] })

    const plan = await previewGreetingBatch(deps, { jobIds: [ok1, bad, ok2], actor: 'gui' })
    assert.equal(plan.sendable, 2)
    assert.equal(plan.blocked, 1)
    assert.deepEqual(deps.drafted, [ok1, ok2], '只为能发的两项生成话术（不支持的平台不花模型调用）')
    assert.equal(plan.items[1]?.blocker?.code, 'platform_unsupported')
    assert.equal(plan.items[1]?.text, null)
    assert.equal(plan.items[0]?.text, `您好，我对这个岗位（#${String(ok1)}）很感兴趣，方便聊聊吗？`)
    assert.equal(plan.batchMax, BATCH_MAX_ITEMS)
    assert.deepEqual(plan.intervalMs, { min: BATCH_ITEM_INTERVAL_MS.min, max: BATCH_ITEM_INTERVAL_MS.max })
    assert.ok(plan.note.includes('预测'), plan.note)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('★ 批内预测之一：同一家公司只让发一条（照冷却期口径，默认 24 小时）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const companyId = seedCompany(store, '某某科技有限公司')
    const first = seedJob(store, { platformJobId: 'same-1', companyId })
    const second = seedJob(store, { platformJobId: 'same-2', companyId })
    const other = seedJob(store, { platformJobId: 'other-1' })

    const plan = await previewGreetingBatch(depsOf(store, { unsupportedPlatforms: [] }), {
      jobIds: [first, second, other],
      actor: 'gui',
    })
    assert.equal(plan.items[0]?.willSend, true, '第一条照常发')
    assert.equal(plan.items[1]?.blocker?.code, 'duplicate_company', '同公司第二条要在预览里被拦下')
    assert.ok((plan.items[1]?.blocker?.message ?? '').includes('某某科技'))
    assert.equal(plan.items[2]?.willSend, true, '另一家公司不受影响')

    // 冷却期设为 0（不限制）时不该再去重 —— 否则用户改了设置，预览还在拦
    const off = await previewGreetingBatch(depsOf(store, { cooldownMinutes: 0 }), {
      jobIds: [first, second],
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

    const plan = await previewGreetingBatch(depsOf(store, { remaining: 1 }), {
      jobIds: [a, b, c],
      actor: 'gui',
    })
    assert.equal(plan.sendable, 1, '额度只剩 1 条，这一批就只有 1 条能出去')
    assert.equal(plan.items[1]?.blocker?.code, 'quota_exhausted')
    assert.ok((plan.items[1]?.blocker?.message ?? '').includes('/20'), plan.items[1]?.blocker?.message)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('预览：岗位不存在 / 闸门拒绝 / 话术生成失败，各有各的原因', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const jobId = seedJob(store, {})

    const missing = await previewGreetingBatch(depsOf(store), { jobIds: [999_999], actor: 'gui' })
    assert.equal(missing.items[0]?.blocker?.code, 'missing')
    assert.ok((missing.items[0]?.blocker?.hint ?? '').length > 0)

    const denied = await previewGreetingBatch(depsOf(store, { guardDenied: true }), {
      jobIds: [jobId],
      actor: 'gui',
    })
    assert.equal(denied.items[0]?.blocker?.code, 'guard_denied')
    assert.equal(denied.items[0]?.blocker?.reason, 'window', '要带上被哪条规则拦的')
    assert.equal(denied.items[0]?.text, null)

    const draftFailed = await previewGreetingBatch(depsOf(store, { draftFails: true }), {
      jobIds: [jobId],
      actor: 'gui',
    })
    assert.equal(draftFailed.items[0]?.blocker?.code, 'draft_failed')
    assert.ok((draftFailed.items[0]?.blocker?.message ?? '').includes('模型不可用'))
  } finally {
    store.close()
    cleanup(dir)
  }
})

// ─────────────────────────────────────────────────────────────────────
// 发送
// ─────────────────────────────────────────────────────────────────────

test('★ 逐条回执：一条失败不影响其它条，顺序与传入一致', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const a = seedJob(store, { platformJobId: 's-1' })
    const b = seedJob(store, { platformJobId: 's-2' })
    const c = seedJob(store, { platformJobId: 's-3' })
    const deps = depsOf(store, { failJobIds: [b] })

    const result = await sendGreetingBatch(deps, {
      items: [{ jobId: a, text: '甲' }, { jobId: b, text: '乙' }, { jobId: c, text: '丙' }],
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
      '中间那条失败，后面的照样发出去 —— 没有"整批失败"这种状态',
    )
    assert.equal(result.receipts[1]?.code, 'ADAPTER_BROKEN')
    assert.ok((result.receipts[1]?.message ?? '').includes(String(b)))
    assert.equal(result.receipts[0]?.textLength, 1)
    assert.ok(result.note.includes('逐条'), result.note)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('★ 随机间隔插在条与条之间（第一条不等、最后一条后面不等）', async () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const ids = ['i-1', 'i-2', 'i-3'].map((platformJobId) => seedJob(store, { platformJobId }))

    const deps = depsOf(store)
    await sendGreetingBatch(deps, {
      items: ids.map((jobId) => ({ jobId })),
      actor: 'gui',
      guiConfirmed: true,
    })
    assert.deepEqual(deps.sleeps, [BATCH_ITEM_INTERVAL_MS.min, BATCH_ITEM_INTERVAL_MS.min], '3 条 → 2 次间隔')

    const single = depsOf(store)
    await sendGreetingBatch(single, { items: [{ jobId: ids[0] as number }], actor: 'gui', guiConfirmed: true })
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
    await sendGreetingBatch(deps, {
      items: ids.map((jobId) => ({ jobId })),
      actor: 'model',
    })
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
      () => sendGreetingBatch(deps, { items: [], actor: 'gui' }),
      (error: unknown) => error instanceof DomainError && error.code === 'INVALID_INPUT',
    )
    const tooMany = Array.from({ length: BATCH_MAX_ITEMS + 1 }, (_unused, index) => ({ jobId: index + 1 }))
    await assert.rejects(
      () => sendGreetingBatch(deps, { items: tooMany, actor: 'gui' }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.message.includes(String(BATCH_MAX_ITEMS)) &&
        (error.hint ?? '').includes('分批'),
    )
    assert.deepEqual(deps.sleeps, [], '被拒绝时不该有任何等待或发送')
  } finally {
    store.close()
    cleanup(dir)
  }
})
