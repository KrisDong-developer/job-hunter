/**
 * 投递流水线领域测试（§4.3 `pipeline` / §12.1 / §12.2 / §13 U5）。
 *
 * 这里守的是三条硬规则，每一条都能独立坏掉：
 *   1. **状态变更必须留事件** —— `application.stage` 只是冗余，事实在 `stage_event` 里；
 *   2. **不合并状态机** —— 投递阶段与接触态是两套，接触态"最新一条即当前接触态"；
 *   3. **超时是建议不是状态** —— 未读超时与已读未回是**两条不同分支**（§3.3 的核心洞察），
 *      给的建议也必须不同：一个说"放弃"，另一个说"改简历/话术"。
 *
 * 时间一律用可控时钟：涉及天数/小时数的断言（看板的 `daysSinceStage`、超时建议）
 * 一旦依赖真实时间就是随机失败源。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APPLICATION_STAGES } from '../../src/shared/enums.js'
import type { ResumeContent } from '../../src/shared/resume.js'
import {
  createPipelineService,
  NO_PROGRESS_DAYS,
  READ_TIMEOUT_HOURS,
  UNREAD_TIMEOUT_HOURS,
  type PipelineDeps,
} from '../../src/host/domain/pipeline.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'p7-1',
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
    sourceUrl: 'https://jobs.51job.com/all/p7-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。任职要求：熟悉 react。',
    ...overrides,
  }
}

/** 建一个带公司的岗位（看板要显示公司名，审批文案也要）。 */
function seedJob(store: Store, overrides: Partial<JobUpsertInput> = {}): number {
  const company = store.company.ensure({ name: '腾讯科技（深圳）有限公司', nameNorm: '腾讯科技' }, T)
  return store.job.upsert({ ...jobInput(overrides), companyId: company.id }, T).id
}

function resumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    basics: { name: '张三', title: '前端开发', city: '深圳', years: 3 },
    summary: '三年前端经验。',
    skills: [{ name: 'React', level: '熟练', years: 3, evidence: '订单中台' }],
    experiences: [],
    projects: [],
    education: [],
    extras: [],
    ...overrides,
  }
}

/** 建一份启用中的简历（`recordApplication` 靠它拿默认版本）。 */
function seedResume(store: Store, isDefault = true): number {
  return store.resume.create({ name: '前端 · 2026 春', content: resumeContent(), isDefault }, T).id
}

function withStore(fn: (store: Store) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

/** 闸门收到的调用（与 `PipelineDeps['guardRun']` 的第一个入参同形）。 */
interface GuardCall {
  action: string
  actor: string
  danger: 'low' | 'mid' | 'high'
  target?: { jobId?: number; platformId?: string; companyId?: number }
  payload?: Record<string, unknown>
  guiConfirmed?: boolean
}

/** 记下每次闸门调用并放行 —— 用于断言"投递确实被当成高危动作问过"。 */
function recordingGuard(calls: GuardCall[]): NonNullable<PipelineDeps['guardRun']> {
  return async (input, fn) => {
    calls.push(input)
    return await fn()
  }
}

// ─────────────────────────────────────────────────────────────────────
// 状态变更必须留事件
// ─────────────────────────────────────────────────────────────────────

test('recordApplication 写一条 fromStage=null → sent 的事件，advance 写完整的 from/to/source', async () => {
  await withStore(async (store) => {
    seedResume(store)
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    const application = await pipeline.recordApplication({ jobId, actor: 'gui' })
    assert.equal(application.stage, 'sent')

    const afterRecord = store.pipeline.listStageEvents('application', application.id)
    assert.equal(afterRecord.length, 1, '记录投递本身就是一次状态变更，必须留痕')
    assert.equal(afterRecord[0]?.fromStage, null, '新建投递没有"上一个状态"')
    assert.equal(afterRecord[0]?.toStage, 'sent')
    assert.equal(afterRecord[0]?.source, 'manual', '界面发起的动作记成"人工"')
    assert.equal(afterRecord[0]?.entity, 'application')
    assert.equal(afterRecord[0]?.entityId, application.id)

    const advanced = pipeline.advance({
      applicationId: application.id,
      to: 'viewed',
      actor: 'gui',
      source: 'auto',
      evidenceRef: 'hr-read:1',
      note: 'HR 打开了简历',
    })
    assert.equal(advanced.stage, 'viewed')

    const events = store.pipeline.listStageEvents('application', application.id)
    assert.equal(events.length, 2)
    // 最新一条在前 —— 详情页与"凭什么"的回答都靠这个顺序
    assert.deepEqual(
      events.map((event) => event.toStage),
      ['viewed', 'sent'],
    )
    assert.equal(events[0]?.fromStage, 'sent')
    assert.equal(events[0]?.toStage, 'viewed')
    assert.equal(events[0]?.source, 'auto')
    assert.equal(events[0]?.evidenceRef, 'hr-read:1')
    assert.equal(events[0]?.note, 'HR 打开了简历')
  })
})

test('model 身份的投递记成 source=model，便于回溯"这个状态是谁改的"', async () => {
  await withStore(async (store) => {
    seedResume(store)
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    const application = await pipeline.recordApplication({ jobId, actor: 'model' })
    const events = store.pipeline.listStageEvents('application', application.id)
    assert.equal(events[0]?.source, 'model')
  })
})

test('回退必须显式带 allowBackward：不带就拒，带了才改并留事件', async () => {
  await withStore(async (store) => {
    seedResume(store)
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })
    const application = await pipeline.recordApplication({ jobId, actor: 'gui' })
    pipeline.advance({ applicationId: application.id, to: 'interviewing', actor: 'gui' })

    assert.throws(
      () => pipeline.advance({ applicationId: application.id, to: 'sent', actor: 'gui' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        // 提示要能告诉用户"怎么才能回退"，而不只是"不行"
        assert.ok((error.hint ?? '').includes('allowBackward'), `提示不可操作：${String(error.hint)}`)
        return true
      },
      '把"面试中"点回"已投递"属于回退，必须显式确认，否则没人知道为什么',
    )
    assert.equal(store.pipeline.getApplication(application.id)?.stage, 'interviewing', '被拒的回退不该改数据')
    assert.equal(store.pipeline.listStageEvents('application', application.id).length, 2, '被拒的回退不该留事件')

    const backward = pipeline.advance({
      applicationId: application.id,
      to: 'sent',
      actor: 'gui',
      allowBackward: true,
      note: 'HR 说岗位重开，要从头再走一遍',
    })
    assert.equal(backward.stage, 'sent')

    const events = store.pipeline.listStageEvents('application', application.id)
    assert.equal(events[0]?.fromStage, 'interviewing')
    assert.equal(events[0]?.toStage, 'sent')
    assert.equal(events[0]?.note, 'HR 说岗位重开，要从头再走一遍', '回退的原因必须留在事件里')
  })
})

test('推进到同一个阶段是幂等空操作：改都不改，更不写事件', async () => {
  await withStore(async (store) => {
    seedResume(store)
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })
    const application = await pipeline.recordApplication({ jobId, actor: 'gui' })

    const before = store.pipeline.listStageEvents('application', application.id)
    const same = pipeline.advance({ applicationId: application.id, to: 'sent', actor: 'gui' })

    assert.equal(same.stage, 'sent')
    assert.equal(store.pipeline.listStageEvents('application', application.id).length, before.length)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 投递必须记下用了哪份简历（§11.3 / R6）
// ─────────────────────────────────────────────────────────────────────

test('一份简历都没有时拒绝记录投递，并说清"投递必须记下用了哪份简历"', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    await assert.rejects(
      () => pipeline.recordApplication({ jobId, actor: 'gui' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok((error.hint ?? '').includes('投递必须记下'), `提示要说清为什么：${String(error.hint)}`)
        return true
      },
    )
    assert.equal(store.pipeline.listApplications().length, 0, '失败时不该留下半条投递')
  })
})

test('有默认简历时把它记进 resumeId；显式传 resumeId 时以显式为准', async () => {
  await withStore(async (store) => {
    const defaultResume = seedResume(store, true)
    const otherResume = store.resume.create(
      { name: '前端 · 备选', content: resumeContent(), isDefault: false },
      T,
    ).id
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    const viaDefault = await pipeline.recordApplication({ jobId, actor: 'gui' })
    assert.equal(viaDefault.resumeId, defaultResume, '没指定就用当前启用版本')

    const viaExplicit = await pipeline.recordApplication({ jobId, resumeId: otherResume, actor: 'gui' })
    assert.equal(viaExplicit.resumeId, otherResume, '显式指定优先')

    // R6 / 归因分析的原始数据：简历版本必须真的落在库里，而不是只出现在返回值里
    const stored = store.pipeline.getApplication(viaExplicit.id)
    assert.equal(stored?.resumeId, otherResume)
    assert.equal(store.resume.get(otherResume)?.rev, 1, '记下的是"哪一版"，rev 也要能查回来')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 高危动作走闸门（§4.4.2）
// ─────────────────────────────────────────────────────────────────────

test('recordApplication 走闸门：高危 + 审批文案里有岗位、公司与简历版本', async () => {
  await withStore(async (store) => {
    const resumeId = seedResume(store)
    const jobId = seedJob(store)
    const calls: GuardCall[] = []
    const pipeline = createPipelineService({ store, guardRun: recordingGuard(calls) })

    await pipeline.recordApplication({ jobId, actor: 'gui', channel: 'referral' })

    assert.equal(calls.length, 1, '投递是真正对外的动作，必须先过闸门')
    const call = calls[0]
    assert.ok(call !== undefined)
    assert.equal(call.action, 'application.send')
    assert.equal(call.danger, 'high')
    assert.equal(call.target?.jobId, jobId)
    assert.equal(call.target?.platformId, '51job')
    assert.ok(call.target?.companyId !== undefined, '审批文案要能指出是投给哪家公司')
    // §4.4.2：两段式确认的文案必须能回答"投给谁、用什么投的"
    assert.equal(call.payload?.['jobTitle'], '高级前端工程师')
    assert.ok(String(call.payload?.['company']).includes('腾讯'), `审批文案缺公司名：${String(call.payload?.['company'])}`)
    assert.equal(call.payload?.['resumeVersion'], `#${String(resumeId)}`)
    assert.equal(call.payload?.['channel'], 'referral')
  })
})

test('闸门拒绝时：既不写投递行，也不写状态事件（不能留下"看起来投过"的痕迹）', async () => {
  await withStore(async (store) => {
    seedResume(store)
    const jobId = seedJob(store)
    const pipeline = createPipelineService({
      store,
      guardRun: async () => {
        throw new DomainError('GUARD_DENIED', '用户拒绝了这次投递')
      },
    })

    await assert.rejects(() => pipeline.recordApplication({ jobId, actor: 'gui' }), /用户拒绝/)
    assert.equal(store.pipeline.listApplications().length, 0, '被拒的投递不该落库')
    assert.equal(store.pipeline.recentStageEvents(20).length, 0, '被拒的投递不该留下状态事件')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 看板（§13 U5）
// ─────────────────────────────────────────────────────────────────────

test('board：按 §12.1 阶段分列、带上岗位与公司、算出卡了几天、只对在途岗位计 stale', async () => {
  await withStore(async (store) => {
    seedResume(store)
    let now = '2026-01-01T00:00:00.000Z'
    const pipeline = createPipelineService({ store, clock: () => now })

    const jobStale = seedJob(store, { platformJobId: 'board-old', title: '卡住的岗位' })
    const jobOffer = seedJob(store, { platformJobId: 'board-offer', title: '已 Offer 的岗位' })
    const jobFresh = seedJob(store, { platformJobId: 'board-fresh', title: '刚投的岗位' })

    const stale = await pipeline.recordApplication({ jobId: jobStale, actor: 'gui' })
    const offered = await pipeline.recordApplication({ jobId: jobOffer, actor: 'gui' })
    pipeline.advance({ applicationId: offered.id, to: 'offer', actor: 'gui' })

    // 30 天后再投一个：同样的"在途"，但不该算 stale
    now = '2026-01-31T00:00:00.000Z'
    const fresh = await pipeline.recordApplication({ jobId: jobFresh, actor: 'gui' })

    const board = pipeline.board()
    assert.equal(board.generatedAt, now)
    assert.equal(board.total, 3)
    assert.deepEqual(
      board.columns.map((column) => column.stage),
      [...APPLICATION_STAGES],
      '看板的列顺序就是投递阶段的顺序（§12.1），顺序本身就是业务规则',
    )
    for (const column of board.columns) {
      assert.ok(Array.isArray(column.cards))
    }

    const sentColumn = board.columns.find((column) => column.stage === 'sent')
    assert.equal(sentColumn?.cards.length, 2)
    const staleCard = sentColumn?.cards.find((card) => card.applicationId === stale.id)
    assert.ok(staleCard !== undefined)
    assert.equal(staleCard.jobTitle, '卡住的岗位', '卡片要能直接看出是哪个岗位')
    assert.equal(staleCard.companyName, '腾讯科技（深圳）有限公司')
    assert.equal(staleCard.daysSinceStage, 30, '卡了 30 天 —— "该催谁"全靠这个数')

    const freshCard = sentColumn?.cards.find((card) => card.applicationId === fresh.id)
    assert.equal(freshCard?.daysSinceStage, 0)

    const offerColumn = board.columns.find((column) => column.stage === 'offer')
    assert.equal(offerColumn?.cards.length, 1)
    assert.equal(offerColumn?.cards[0]?.applicationId, offered.id)

    // stale 只看"卡在中间阶段太久"的：终态（offer/rejected/no_reply）不算
    assert.equal(board.staleCount, 1, `阈值 ${String(NO_PROGRESS_DAYS)} 天，且终态不计入`)
  })
})

test('board 上没有投递时：列照旧全在，只是都空着', async () => {
  await withStore(async (store) => {
    const pipeline = createPipelineService({ store })
    const board = pipeline.board()
    assert.deepEqual(
      board.columns.map((column) => column.stage),
      [...APPLICATION_STAGES],
    )
    assert.equal(board.total, 0)
    assert.equal(board.staleCount, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 接触态（§7.0"最新一条即当前接触态"）
// ─────────────────────────────────────────────────────────────────────

test('recordGreetingSent 建 greeted + 一条事件；advanceContact 推进并留事件', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    const greeting = pipeline.recordGreetingSent({
      jobId,
      platformId: '51job',
      content: '您好，我做过三年 react，和这个岗位比较对口。',
      actor: 'gui',
    })
    assert.equal(greeting.stage, 'greeted')
    assert.equal(pipeline.contactStage(jobId), 'greeted')

    const events = store.pipeline.listStageEvents('greeting', greeting.id)
    assert.equal(events.length, 1, '接触态的变化同样要留痕')
    assert.equal(events[0]?.fromStage, 'none')
    assert.equal(events[0]?.toStage, 'greeted')

    const advanced = pipeline.advanceContact({ jobId, to: 'delivered' })
    assert.equal(advanced.stage, 'delivered')
    assert.equal(pipeline.contactStage(jobId), 'delivered')

    const after = store.pipeline.listStageEvents('greeting', greeting.id)
    assert.equal(after.length, 2)
    assert.equal(after[0]?.fromStage, 'greeted')
    assert.equal(after[0]?.toStage, 'delivered')
  })
})

test('一个岗位有两条打招呼时，接触态取**最新那条**（§7.0）', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    const older = pipeline.recordGreetingSent({
      jobId,
      platformId: '51job',
      content: '第一版话术',
      actor: 'gui',
    })
    const newer = pipeline.recordGreetingSent({
      jobId,
      platformId: '51job',
      content: '改过话术的第二版',
      actor: 'gui',
    })

    pipeline.advanceContact({ jobId, to: 'read' })

    assert.equal(store.pipeline.latestGreeting(jobId)?.id, newer.id)
    assert.equal(pipeline.contactStage(jobId), 'read', '当前接触态必须看最新那一条')
    assert.equal(
      store.pipeline.listGreetings({ jobId }).find((item) => item.id === older.id)?.stage,
      'greeted',
      '推进只应改最新那条，历史记录不能被改写',
    )
  })
})

test('没有任何打招呼记录时推进接触态：报可读的 NOT_FOUND，而不是凭空造一条', async () => {
  await withStore(async (store) => {
    const jobId = seedJob(store)
    const pipeline = createPipelineService({ store })

    assert.throws(
      () => pipeline.advanceContact({ jobId, to: 'read' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'NOT_FOUND')
        assert.ok(
          (error.hint ?? '').includes('最新一条即当前接触态'),
          `提示要解释接触态挂在哪：${String(error.hint)}`,
        )
        return true
      },
    )
    assert.equal(store.pipeline.listGreetings({ jobId }).length, 0, '失败不该建记录')
    assert.equal(pipeline.contactStage(jobId), 'none')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 跟进建议：未读超时 vs 已读未回（§3.3 / §12.2）
// ─────────────────────────────────────────────────────────────────────

test('followUpSuggestions：未读超时与已读未回是两条分支，给的建议也不同', async () => {
  await withStore(async (store) => {
    const T0 = Date.parse('2026-01-01T00:00:00.000Z')
    const at = (hours: number): string => new Date(T0 + hours * 3_600_000).toISOString()
    let now = at(-200)
    const pipeline = createPipelineService({ store, clock: () => now })

    const jobUnread = seedJob(store, { platformJobId: 'fu-unread' })
    const jobRead = seedJob(store, { platformJobId: 'fu-read' })
    const jobReplied = seedJob(store, { platformJobId: 'fu-replied' })
    const jobInterview = seedJob(store, { platformJobId: 'fu-interview' })
    const jobFresh = seedJob(store, { platformJobId: 'fu-fresh' })

    const greet = (jobId: number): void => {
      pipeline.recordGreetingSent({ jobId, platformId: '51job', content: '您好，想聊聊这个岗位。', actor: 'gui' })
    }

    // 200 小时前已读、没回
    greet(jobRead)
    pipeline.advanceContact({ jobId: jobRead, to: 'read' })

    // 100 小时前送达、HR 一直没读
    now = at(-100)
    greet(jobUnread)
    pipeline.advanceContact({ jobId: jobUnread, to: 'delivered' })

    now = at(0)
    greet(jobReplied)
    pipeline.advanceContact({ jobId: jobReplied, to: 'replied' })
    greet(jobInterview)
    pipeline.advanceContact({ jobId: jobInterview, to: 'interview_scheduled' })
    greet(jobFresh)
    pipeline.advanceContact({ jobId: jobFresh, to: 'delivered' })

    const items = pipeline.followUpSuggestions()
    assert.equal(items.length, 2, '只有"送达未读"与"已读未回"两条该被催')

    const unread = items.find((item) => item.jobId === jobUnread)
    assert.ok(unread !== undefined)
    assert.equal(unread.kind, 'unread-timeout')
    assert.equal(unread.stage, 'delivered')
    assert.equal(unread.idleHours, 100, '100 小时没读 —— 已经超过未读超时阈值')
    assert.ok(unread.advice.includes('放弃'), `未读超时的建议应当是"别耗着了"：${unread.advice}`)

    const read = items.find((item) => item.jobId === jobRead)
    assert.ok(read !== undefined)
    assert.equal(read.kind, 'read-no-reply')
    assert.equal(read.stage, 'read')
    assert.equal(read.idleHours, 200)
    assert.ok(
      read.idleHours >= READ_TIMEOUT_HOURS,
      `已读未回阈值是 ${String(READ_TIMEOUT_HOURS)} 小时，这里 ${String(read.idleHours)} 小时早就超了`,
    )
    assert.ok(
      read.advice.includes('改简历') && read.advice.includes('话术'),
      `已读未回的建议应当指向"你呈现的东西不对"，而不是继续加量：${read.advice}`,
    )

    // 两条分支必须给出**不同**的建议 —— 否则这个区分就白做了
    assert.notEqual(unread.advice, read.advice)
    assert.equal(
      items.some((item) => item.jobId === jobReplied || item.jobId === jobInterview),
      false,
      '已经回复/约面的不该再出现在"待跟进"里',
    )
    assert.equal(items.some((item) => item.jobId === jobFresh), false, '刚送出去的不该立刻被催')
  })
})

test('followUpSuggestions：刚好卡在阈值上算超时，差一小时不算', async () => {
  await withStore(async (store) => {
    const T0 = Date.parse('2026-01-01T00:00:00.000Z')
    const at = (hours: number): string => new Date(T0 + hours * 3_600_000).toISOString()
    let now = at(0)
    const pipeline = createPipelineService({ store, clock: () => now })

    const jobEdge = seedJob(store, { platformJobId: 'fu-edge' })
    const jobJustUnder = seedJob(store, { platformJobId: 'fu-under' })

    pipeline.recordGreetingSent({ jobId: jobEdge, platformId: '51job', content: '您好。', actor: 'gui' })
    pipeline.advanceContact({ jobId: jobEdge, to: 'delivered' })

    // 差一小时的那条晚一小时才送达
    now = at(1)
    pipeline.recordGreetingSent({ jobId: jobJustUnder, platformId: '51job', content: '您好。', actor: 'gui' })
    pipeline.advanceContact({ jobId: jobJustUnder, to: 'delivered' })

    now = at(UNREAD_TIMEOUT_HOURS)
    const items = pipeline.followUpSuggestions()
    assert.deepEqual(
      items.map((item) => item.jobId),
      [jobEdge],
      '阈值是 >=，卡在阈值上的要报；差一小时的不能报（否则建议会天天变）',
    )
  })
})
