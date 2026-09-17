/**
 * 面试日程领域测试（§4.3 `interviews` / §12.6 / §13 U7）。
 *
 * U7 的三件正事在这里逐条守住：
 *   1. **别撞车** —— `conflicts()` 必须把时间窗重叠显式列出来，且已取消的不算；
 *   2. **别迟到** —— 只有现场面试才谈通勤，视频/电话算通勤只会制造假警告；
 *   3. **状态机单向** —— 改期要显式传 `allowReschedule`；面试"完成"要能把投递阶段
 *      自动推到"已面试"（并且**同样留 stage_event**）。
 *
 * `prep()` 是准备包，它的价值在于"差距一目了然"：技能差、公司风险、错题、检查清单。
 * 所以这里也守住一条：**没有简历时要如实说"做不了技能对比"，而不是报一个空差距**。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INTERVIEW_KINDS, INTERVIEW_STATES } from '../../src/shared/enums.js'
import type { ResumeContent } from '../../src/shared/resume.js'
import {
  CONFLICT_WINDOW_MIN,
  createInterviewService,
  DEFAULT_DURATION_MIN,
} from '../../src/host/domain/interviews.js'
import { createPipelineService } from '../../src/host/domain/pipeline.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'
const T0 = Date.parse('2026-01-01T00:00:00.000Z')

/** 相对 T0 的 ISO 时刻（小时）。一律用绝对 UTC 字符串，好让 `upcoming` 的字符串比较可预期。 */
function at(hours: number): string {
  return new Date(T0 + hours * 3_600_000).toISOString()
}

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'itv-1',
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
    sourceUrl: 'https://jobs.51job.com/all/itv-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。任职要求：熟悉 react。',
    ...overrides,
  }
}

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

function seedResume(store: Store): number {
  return store.resume.create({ name: '前端 · 2026 春', content: resumeContent(), isDefault: true }, T).id
}

interface Harness {
  store: Store
  /** 可推进的"现在"，涉及时间窗的断言全靠它。 */
  setNow(hours: number): void
  service: ReturnType<typeof createInterviewService>
  pipeline: ReturnType<typeof createPipelineService>
}

function withHarness(fn: (harness: Harness) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  let now = at(0)
  const clock = (): string => now
  const harness: Harness = {
    store,
    setNow: (hours) => {
      now = at(hours)
    },
    service: createInterviewService({ store, clock }),
    pipeline: createPipelineService({ store, clock }),
  }
  return Promise.resolve(fn(harness)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

// ─────────────────────────────────────────────────────────────────────
// 建档与自动推进接触态
// ─────────────────────────────────────────────────────────────────────

test('upsert 新建面试；有打招呼记录时接触态自动推到 interview_scheduled 并留 source=auto 的事件', async () => {
  await withHarness(({ store, service }) => {
    const jobId = seedJob(store)
    const greeting = store.pipeline.createGreeting(
      { jobId, platformId: '51job', content: '您好，想聊聊这个岗位。', actor: 'gui' },
      T,
    )
    assert.equal(store.pipeline.latestGreeting(jobId)?.stage, 'greeted')

    const interview = service.upsert({ jobId, at: at(24), kind: 'video' })

    assert.equal(interview.state, 'pending', '新建的面试是待确认')
    assert.equal(interview.round, 1)
    assert.equal(store.pipeline.latestGreeting(jobId)?.stage, 'interview_scheduled')

    const events = store.pipeline.listStageEvents('greeting', greeting.id)
    assert.equal(events.length, 1, '自动推进同样要留痕 —— 否则"接触态是谁改的"就说不清')
    assert.equal(events[0]?.fromStage, 'greeted')
    assert.equal(events[0]?.toStage, 'interview_scheduled')
    assert.equal(events[0]?.source, 'auto', '这一步是系统推的，不是人点的')
    assert.equal(events[0]?.evidenceRef, `interview:${String(interview.id)}`, '依据要能指回那场面试')
  })
})

test('upsert 传 id 是更新而不是再建一场', async () => {
  await withHarness(({ store, service }) => {
    const jobId = seedJob(store)
    const created = service.upsert({ jobId, at: at(24) })
    const updated = service.upsert({ id: created.id, at: at(48), place: '深圳湾一号' })

    assert.equal(updated.id, created.id)
    assert.equal(updated.at, at(48))
    assert.equal(updated.place, '深圳湾一号')
    assert.equal(service.list().length, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 输入校验：错误必须是可读的
// ─────────────────────────────────────────────────────────────────────

test('面试时间解析不了就拒，并给出该怎么写的例子', async () => {
  await withHarness(({ service }) => {
    assert.throws(
      () => service.upsert({ at: '下周三下午' }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('无法解析'), error.message)
        assert.ok((error.hint ?? '').includes('2026-09-20T14:00:00+08:00'), `提示要给可照抄的例子：${String(error.hint)}`)
        return true
      },
    )
  })
})

test('非法的面试形式/状态被拒，且提示里列出全部合法取值', async () => {
  await withHarness(({ service }) => {
    assert.throws(
      () => service.upsert({ at: at(24), kind: '现场' as never }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('面试形式'), error.message)
        for (const kind of INTERVIEW_KINDS) {
          assert.ok((error.hint ?? '').includes(kind), `提示漏了合法取值 ${kind}`)
        }
        return true
      },
    )

    assert.throws(
      () => service.upsert({ at: at(24), state: '待确认' as never }),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('面试状态'), error.message)
        for (const state of INTERVIEW_STATES) {
          assert.ok((error.hint ?? '').includes(state), `提示漏了合法取值 ${state}`)
        }
        return true
      },
    )
  })
})

test('面试不存在时报 NOT_FOUND，而不是静默返回一个空壳', async () => {
  await withHarness(({ service }) => {
    assert.throws(
      () => service.get(9999),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// 撞车（§13 U7"别撞车"）
// ─────────────────────────────────────────────────────────────────────

test('conflicts：时间窗内算撞车并给出重叠分钟；太远的不算；已取消的不算', async () => {
  await withHarness(({ service }) => {
    const window = DEFAULT_DURATION_MIN + CONFLICT_WINDOW_MIN

    const a = service.upsert({ at: at(0) })
    // 相隔 90 分钟：不到"默认时长 + 缓冲窗"，属于"上一场刚结束就要赶下一场"，也是撞车
    const b = service.upsert({ at: at(1.5) })
    const far = service.upsert({ at: at(5) })
    // 正好卡在窗口边界上的一对（相隔 window 分钟）：分得开，不算重叠
    const boundary = service.upsert({ at: at(7) })
    const boundaryPartner = service.upsert({ at: at(7 + window / 60) })

    const conflicts = service.conflicts()
    assert.equal(conflicts.length, 1)
    const [conflict] = conflicts
    assert.ok(conflict !== undefined)
    assert.deepEqual([conflict.a, conflict.b].sort((x, y) => x - y), [a.id, b.id].sort((x, y) => x - y))
    assert.equal(conflict.overlapMin, window - 90, '重叠分钟数 = 窗口 - 实际间隔')
    assert.ok(conflict.overlapMin > 0)
    assert.ok(conflict.reason.includes('间隔不足'), conflict.reason)
    const unrelated = new Set([far.id, boundary.id, boundaryPartner.id])
    assert.equal(
      conflicts.some((item) => unrelated.has(item.a) || unrelated.has(item.b)),
      false,
      `隔了几小时、以及正好隔 ${String(window)} 分钟的两场都不是撞车`,
    )

    service.setState(b.id, 'cancelled')
    assert.deepEqual(service.conflicts(), [], '取消掉的面试不该继续占着时间窗')
  })
})

// ─────────────────────────────────────────────────────────────────────
// 状态机（§12.6）
// ─────────────────────────────────────────────────────────────────────

test('改期必须显式 allowReschedule；带上才生效，并且留一条面试状态事件', async () => {
  await withHarness(({ store, service }) => {
    const interview = service.upsert({ at: at(24) })

    assert.throws(
      () => service.setState(interview.id, 'rescheduled'),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('改期'), error.message)
        assert.ok((error.hint ?? '').includes('allowReschedule'), `提示要告诉用户怎么才能改：${String(error.hint)}`)
        return true
      },
      '改期会动到别人的日程，不能当草稿随手改',
    )
    assert.equal(store.pipeline.getInterview(interview.id)?.state, 'pending', '被拒的改期不该改状态')

    const rescheduled = service.setState(interview.id, 'rescheduled', { allowReschedule: true })
    assert.equal(rescheduled.state, 'rescheduled')
    const events = store.pipeline.listStageEvents('interview', interview.id)
    /**
     * 两条事件：**建档**（null → pending）与**改期**（pending → rescheduled）。
     *
     * 建档也是一次状态变更 —— 不记的话，"这场面试是什么时候定下来的"就永远查不到。
     * 事件按 `at DESC, id DESC` 返回，所以最新的改期排在前面。
     */
    assert.equal(events.length, 2, '建档与改期各留一条痕（§12.6）')
    assert.equal(events[0]?.fromStage, 'pending')
    assert.equal(events[0]?.toStage, 'rescheduled')
    assert.equal(events[1]?.fromStage, null)
    assert.equal(events[1]?.toStage, 'pending')
  })
})

test('面试 done 会把关联的"面试中"投递自动推进到"已面试"，并留 source=auto 的应用事件', async () => {
  await withHarness(async ({ store, service, pipeline }) => {
    seedResume(store)
    const jobId = seedJob(store)
    const application = await pipeline.recordApplication({ jobId, actor: 'gui' })
    pipeline.advance({ applicationId: application.id, to: 'interviewing', actor: 'gui' })

    const interview = service.upsert({ applicationId: application.id, jobId, at: at(24) })
    service.setState(interview.id, 'done')

    assert.equal(store.pipeline.getApplication(application.id)?.stage, 'interviewed')

    const events = store.pipeline.listStageEvents('application', application.id)
    assert.equal(events[0]?.fromStage, 'interviewing')
    assert.equal(events[0]?.toStage, 'interviewed')
    assert.equal(events[0]?.source, 'auto', '这一步是面试完成带出来的，不是人点的')
    assert.equal(events[0]?.evidenceRef, `interview:${String(interview.id)}`)
  })
})

test('面试 done 不会去动已经走到别处的投递（自动推进只认"面试中"）', async () => {
  await withHarness(async ({ store, service, pipeline }) => {
    seedResume(store)
    const jobId = seedJob(store)
    const application = await pipeline.recordApplication({ jobId, actor: 'gui' })
    pipeline.advance({ applicationId: application.id, to: 'offer', actor: 'gui' })

    const interview = service.upsert({ applicationId: application.id, jobId, at: at(24) })
    service.setState(interview.id, 'done')

    assert.equal(
      store.pipeline.getApplication(application.id)?.stage,
      'offer',
      '已经到 Offer 的投递不该被"面试完成"拽回"已面试"',
    )
  })
})

test('review 存下复盘对象并把状态置为 reviewed', async () => {
  await withHarness(({ store, service }) => {
    const interview = service.upsert({ at: at(24), kind: 'video' })
    const review = { good: '算法题思路讲清楚了', bad: '项目介绍太长', todo: '下次先讲结论' }

    const reviewed = service.review(interview.id, review)
    assert.equal(reviewed.state, 'reviewed')
    assert.deepEqual(reviewed.review, review, '复盘内容要原样存下来，供下次面试前翻')
    assert.deepEqual(store.pipeline.getInterview(interview.id)?.review, review)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 准备包（§13 U7）
// ─────────────────────────────────────────────────────────────────────

test('prep：技能差距按"岗位要求 vs 简历里有的"分开列', async () => {
  await withHarness(({ store, service }) => {
    seedResume(store)
    const jobId = seedJob(store, {
      title: '前端工程师',
      tags: ['webpack'],
      jdText: '任职要求：熟悉 React 与 Vue。',
    })
    const interview = service.upsert({ jobId, at: at(24) })

    const prep = service.prep(interview.id)
    assert.deepEqual(prep.matchedSkills, ['react'], '简历里有的要认出来')
    assert.deepEqual([...prep.missingSkills].sort(), ['vue', 'webpack'], '简历里没有的必须单独列出来')
    assert.equal(prep.interviewId, interview.id)
    assert.equal(prep.jobId, jobId)
    assert.equal(prep.jobTitle, '前端工程师')
    assert.ok(prep.checklist.length >= 3, '准备包至少要给出可执行的检查清单')
    assert.ok(
      prep.checklist.some((item) => item.includes('vue') || item.includes('webpack')),
      '有差距时检查清单里要提醒怎么应对，而不是只列个空表',
    )
  })
})

test('prep：带上 P4 的公司风险标注，复用同一份判断而不是另做一套', async () => {
  await withHarness(({ store, service }) => {
    seedResume(store)
    const jobId = seedJob(store)
    store.flag.replace(
      jobId,
      [{ type: 'zombie', score: 0.8, evidence: ['发布日期 420 天前，仍在刷新'] }],
      T,
    )
    const interview = service.upsert({ jobId, at: at(24) })

    const prep = service.prep(interview.id)
    assert.ok(prep.companyFlags.length > 0, '公司有风险标注时准备包必须把它带出来')
    assert.ok(prep.companyFlags.some((item) => item.includes('僵尸岗位')), prep.companyFlags.join(' / '))
    assert.ok(prep.companyFlags.some((item) => item.includes('420 天')), '风险要带可读依据，不能只给个标签')
  })
})

test('prep：现场面试与视频面试的通勤提示必须不同（视频算通勤只会制造假警告）', async () => {
  await withHarness(({ store, service }) => {
    seedResume(store)
    const jobId = seedJob(store)

    const onsite = service.upsert({ jobId, at: at(24), kind: 'onsite', commuteMin: 40 })
    const onsitePrep = service.prep(onsite.id)
    assert.equal(onsitePrep.commute.kind, 'onsite')
    assert.equal(onsitePrep.commute.minutes, 40)
    assert.ok(onsitePrep.commute.advice.includes('40 分钟'), onsitePrep.commute.advice)
    assert.ok(onsitePrep.commute.advice.includes('提前'), onsitePrep.commute.advice)

    const onsiteNoData = service.upsert({ jobId, at: at(48), kind: 'onsite' })
    const noDataPrep = service.prep(onsiteNoData.id)
    assert.equal(noDataPrep.commute.minutes, null)
    assert.ok(
      noDataPrep.commute.advice.includes('还没填通勤时长'),
      `没填通勤就要如实说，别让"别迟到"变成空话：${noDataPrep.commute.advice}`,
    )

    const video = service.upsert({ jobId, at: at(72), kind: 'video' })
    const videoPrep = service.prep(video.id)
    assert.equal(videoPrep.commute.minutes, null, '视频面试不算通勤')
    assert.ok(videoPrep.commute.advice.includes('视频面试不需要通勤'), videoPrep.commute.advice)
    assert.notEqual(videoPrep.commute.advice, onsitePrep.commute.advice)
  })
})

test('prep：还没有简历时如实说"做不了技能对比"，而不是报一个空差距', async () => {
  await withHarness(({ store, service }) => {
    const jobId = seedJob(store, { tags: ['webpack'], jdText: '任职要求：熟悉 React 与 Vue。' })
    const interview = service.upsert({ jobId, at: at(24) })

    const prep = service.prep(interview.id)
    assert.ok(
      prep.notes.some((note) => note.includes('还没有启用简历')),
      `没有简历就必须说出来，否则一个空差距会被读成"我全都不会"：${prep.notes.join(' / ')}`,
    )
    assert.deepEqual(prep.matchedSkills, [], '没有简历就没有任何技能能匹配上')
    assert.ok(prep.missingSkills.length > 0)
  })
})

// ─────────────────────────────────────────────────────────────────────
// upcoming（U0 今日要用）
// ─────────────────────────────────────────────────────────────────────

test('upcoming 只给时间窗内、未取消的面试，并按时间升序', async () => {
  await withHarness(({ service, setNow }) => {
    setNow(0)
    const soon = service.upsert({ at: at(2) })
    const later = service.upsert({ at: at(10) })
    service.upsert({ at: at(100) })
    const cancelled = service.upsert({ at: at(5) })
    service.setState(cancelled.id, 'cancelled')
    service.upsert({ at: at(-5) })

    const upcoming = service.upcoming(24)
    assert.deepEqual(
      upcoming.map((item) => item.id),
      [soon.id, later.id],
      '窗口外、已取消、已经过去的都不该出现，且要按时间排好',
    )
    assert.ok(upcoming.every((item) => item.state !== 'cancelled'))

    // 窗口一收窄，较远的那场就掉出去
    assert.deepEqual(
      service.upcoming(3).map((item) => item.id),
      [soon.id],
    )
  })
})
