/**
 * 看板与归因测试（§4.3 `analytics` / §13 U8 / E7）。
 *
 * 这个模块只有一条贯穿始终的原则，而它恰好是最容易被写错的一条：
 * **样本量小的时候不要给百分比。**
 *
 * 所以这里的断言重点不是"数字算得对不对"，而是：
 *   * 上一层为 0 时，这一层的转化率必须是 `null`，**不能是 0** ——
 *     0% 会被读成"完全没转化"，那是与"无从判断"完全不同的一句话；
 *   * 样本不足时 `note` 必须明说；
 *   * 归因里出现的每一行都必须有真实投递支撑（0 条的渠道不入表）；
 *   * 引用了一份已经被删掉的简历时，要如实标成"已删除"，而不是抛错。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { APPLICATION_CHANNEL_LABEL } from '../../src/shared/contract/enums/pipeline.js'
import type { ApplicationChannel, ApplicationStage, ContactStage } from '../../src/shared/contract/enums/pipeline.js'
import { createAnalyticsService, MIN_SAMPLE } from '../../src/host/domain/analytics.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'an-1',
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
    sourceUrl: 'https://jobs.51job.com/all/an-1.html',
    publishedAt: T,
    jdText: '岗位职责：负责前端架构。',
    ...overrides,
  }
}

function seedJob(store: Store, overrides: Partial<JobUpsertInput> = {}): number {
  return store.job.upsert(jobInput(overrides), T).id
}

/** 建一条打招呼记录并把它推到指定的接触态。 */
function seedGreeting(store: Store, jobId: number, stage: ContactStage): number {
  const record = store.pipeline.createGreeting(
    { jobId, platformId: '51job', content: '您好，想聊聊这个岗位。', actor: 'gui' },
    T,
  )
  if (stage !== 'greeted') store.pipeline.advanceGreeting(record.id, stage, T)
  return record.id
}

function seedApplication(
  store: Store,
  input: { jobId: number; resumeId?: number | null; channel?: ApplicationChannel; stage?: ApplicationStage },
): number {
  return store.pipeline.createApplication(
    {
      jobId: input.jobId,
      resumeId: input.resumeId ?? null,
      channel: input.channel ?? 'platform',
      actor: 'gui',
      stage: input.stage ?? 'sent',
    },
    T,
  ).id
}

function withStore(fn: (store: Store) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

/** 从漏斗里取一层，取不到就直接让测试炸掉（比 `?.` 一路静默下去好）。 */
function stepOf(steps: Array<{ key: string; count: number; rate: number | null }>, key: string) {
  const step = steps.find((item) => item.key === key)
  assert.ok(step !== undefined, `漏斗里缺少 ${key} 这一层`)
  return step
}

// ─────────────────────────────────────────────────────────────────────
// 漏斗
// ─────────────────────────────────────────────────────────────────────

test('零数据时漏斗全是 0，且不编造任何百分比', async () => {
  await withStore((store) => {
    const funnel = createAnalyticsService({ store }).funnel()

    assert.deepEqual(
      funnel.steps.map((step) => step.key),
      ['greeted', 'delivered', 'read', 'replied', 'applied', 'interviewed', 'offered'],
      '层的顺序与标签是给人读的，不能悄悄变',
    )
    assert.deepEqual(funnel.steps.map((step) => step.count), [0, 0, 0, 0, 0, 0, 0])
    assert.equal(funnel.steps[0]?.rate, null, '第一层没有"上一层"，只能是 null')
    assert.ok(
      funnel.steps.every((step) => step.rate === null),
      '一条记录都没有时，任何百分比都是编出来的',
    )
    assert.equal(funnel.sampleSize, 0)
    assert.ok(funnel.note.includes('还没有'), `零数据时 note 要说清现在没东西可看：${funnel.note}`)
  })
})

test('漏斗计数正确；上一层为 0 时这一层的 rate 是 null，而不是 0', async () => {
  await withStore((store) => {
    // 6 次打招呼都停在"已打招呼"，一次都没送达
    const jobIds: number[] = []
    for (let index = 0; index < 6; index += 1) {
      const jobId = seedJob(store, { platformJobId: `an-flat-${String(index)}` })
      jobIds.push(jobId)
      seedGreeting(store, jobId, 'greeted')
    }
    // 6 次投递：1 个 Offer、1 个已面试、4 个刚投
    const stages: ApplicationStage[] = ['offer', 'interviewed', 'interviewed', 'sent', 'sent', 'sent']
    stages.forEach((stage, index) => {
      const jobId = jobIds[index]
      assert.ok(jobId !== undefined)
      seedApplication(store, { jobId, stage })
    })

    const funnel = createAnalyticsService({ store }).funnel()
    /**
     * 分层是**累计**口径：拿到 Offer 的人一定面试过，所以「已面试」要把 Offer 算进去。
     *
     * 非累计写法（1 个 Offer + 2 个已面试）会得出「有 1 个人拿到 Offer，但只有 2 个人面试过」
     * 这种自相矛盾的分层，分母也跟着错（`offered.rate` 会变成 1/2 而不是 1/3）。
     * 一张会在自己内部打架的漏斗，比没有漏斗更糟。
     */
    assert.deepEqual(funnel.steps.map((step) => step.count), [6, 0, 0, 0, 6, 3, 1])

    assert.equal(stepOf(funnel.steps, 'greeted').rate, null, '第一层没有转化率可言')
    assert.equal(
      stepOf(funnel.steps, 'delivered').rate,
      0,
      '打了 6 次招呼一次都没送达 —— 这是一个真实的 0%，该照实说',
    )
    assert.equal(
      stepOf(funnel.steps, 'read').rate,
      null,
      '上一层是 0，"已读率"无从计算：给 null，不能给 0（0% 会被读成"读了但一个都没回"）',
    )
    assert.equal(
      stepOf(funnel.steps, 'applied').rate,
      null,
      '上一层（已回复）是 0 时同理 —— 这正是"不编百分比"最容易破功的地方',
    )
    assert.equal(stepOf(funnel.steps, 'interviewed').rate, 3 / 6)
    // 累计口径下，Offer 的分母是"面试过的 3 个"，不是"当前状态是 interviewed 的 2 个"
    assert.equal(stepOf(funnel.steps, 'offered').rate, 1 / 3)

    assert.equal(funnel.sampleSize, 6)
    assert.ok(funnel.note.includes('基于 6'), funnel.note)
  })
})

test('漏斗的分层转化按"相对上一层"算，且都落在 0-1 之间', async () => {
  await withStore((store) => {
    const jobIds: number[] = []
    for (let index = 0; index < 6; index += 1) {
      const jobId = seedJob(store, { platformJobId: `an-ladder-${String(index)}` })
      jobIds.push(jobId)
      // 3 个走到"已回复"，3 个停在"已打招呼"
      seedGreeting(store, jobId, index < 3 ? 'replied' : 'greeted')
    }
    const first = jobIds[0]
    const second = jobIds[1]
    assert.ok(first !== undefined && second !== undefined)
    seedApplication(store, { jobId: first, stage: 'interviewed' })
    seedApplication(store, { jobId: second, stage: 'sent' })

    const funnel = createAnalyticsService({ store }).funnel()
    assert.deepEqual(funnel.steps.map((step) => step.count), [6, 3, 3, 3, 2, 1, 0])
    /**
     * 第 5 个（已投递）是 `null`，**不是** `2/3`。
     *
     * 因为它跨了总体：前四层是"接触"（6 次打招呼），第 5 层起是"投递"（2 次投递）。
     * "投递数 ÷ 回复数"在两个不同总体之间没有意义，而且当投递数大于回复数时会算出 **>100%** 的
     * 转化率 —— 一个能算出 120% 的图会让人不再信任整张图。
     * 所以总体切换处必须留空，并把 `population` 标出来让界面画分隔线。
     */
    assert.deepEqual(funnel.steps.map((step) => step.rate), [null, 0.5, 1, 1, null, 0.5, 0])
    assert.deepEqual(
      funnel.steps.map((step) => step.population),
      ['contact', 'contact', 'contact', 'contact', 'application', 'application', 'application'],
      '改总体这件事必须是显式的，界面才好画分隔线',
    )
    for (const step of funnel.steps) {
      if (step.rate !== null) {
        assert.ok(step.rate >= 0 && step.rate <= 1, `${step.key} 的转化率跑出了 0-1：${String(step.rate)}`)
      }
    }
  })
})

test(`样本少于 ${String(MIN_SAMPLE)} 条时 note 必须明说"别据此改策略"`, async () => {
  await withStore((store) => {
    const jobA = seedJob(store, { platformJobId: 'an-small-a' })
    const jobB = seedJob(store, { platformJobId: 'an-small-b' })
    seedGreeting(store, jobA, 'greeted')
    seedGreeting(store, jobB, 'greeted')
    seedApplication(store, { jobId: jobA })

    const funnel = createAnalyticsService({ store }).funnel()
    assert.equal(funnel.sampleSize, 2)
    assert.ok(funnel.note.includes('样本只有 2 条'), funnel.note)
    assert.ok(
      funnel.note.includes('参考意义') && funnel.note.includes('别据此改策略'),
      `样本不足时必须把话说死 —— 这正是这个模块存在的理由：${funnel.note}`,
    )
  })
})

test(`样本刚好达到 ${String(MIN_SAMPLE)} 条时不再报警告`, async () => {
  await withStore((store) => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      const jobId = seedJob(store, { platformJobId: `an-enough-${String(index)}` })
      seedGreeting(store, jobId, 'greeted')
      seedApplication(store, { jobId })
    }

    const funnel = createAnalyticsService({ store }).funnel()
    assert.equal(funnel.sampleSize, MIN_SAMPLE)
    assert.equal(funnel.note.includes('样本只有'), false, `达到 ${String(MIN_SAMPLE)} 条就不该再喊样本小`)
    assert.ok(funnel.note.includes(`基于 ${String(MIN_SAMPLE)}`), funnel.note)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 归因（§3.3"已读不回 → 改简历"的直接依据）
// ─────────────────────────────────────────────────────────────────────

test('attribution 按渠道与简历版本归因：0 条的渠道不出现，被删的简历如实标成"已删除"', async () => {
  await withStore((store) => {
    const resume = store.resume.create({ name: 'Java 后端', content: emptyResume(), isDefault: true }, T)
    const doomed = store.resume.create({ name: '待删简历', content: emptyResume() }, T)

    const jobContacted = seedJob(store, { platformJobId: 'an-attr-1' })
    const jobDoomed = seedJob(store, { platformJobId: 'an-attr-2' })
    const jobNoResume = seedJob(store, { platformJobId: 'an-attr-3' })
    seedGreeting(store, jobContacted, 'replied')

    seedApplication(store, { jobId: jobContacted, resumeId: resume.id, channel: 'referral' })
    seedApplication(store, { jobId: jobContacted, resumeId: resume.id, channel: 'referral' })

    // FK 开着时删除简历会把 application.resume_id 置空（ON DELETE SET NULL），
    // 所以"引用了已删除简历"这个状态只能靠历史数据/关掉外键构造。
    // 这里刻意构造它：归因必须如实标注，而不是抛错或把这条投递悄悄丢掉。
    seedApplication(store, { jobId: jobDoomed, resumeId: doomed.id, channel: 'platform' })
    store.db.exec('PRAGMA foreign_keys = OFF')
    store.resume.remove(doomed.id)
    store.db.exec('PRAGMA foreign_keys = ON')
    seedApplication(store, { jobId: jobNoResume, channel: 'headhunter' })

    const attribution = createAnalyticsService({ store }).attribution()

    // ── 按渠道 ──────────────────────────────────────────────────────
    const byChannel = new Map(attribution.byChannel.map((row) => [row.key, row]))
    assert.deepEqual([...byChannel.keys()].sort(), ['headhunter', 'platform', 'referral'])
    assert.equal(byChannel.has('website'), false, '一条投递都没有的渠道不该出现在归因表里')
    assert.ok(attribution.byChannel.every((row) => row.total > 0))

    const referral = byChannel.get('referral')
    assert.ok(referral !== undefined)
    assert.equal(referral.label, APPLICATION_CHANNEL_LABEL.referral)
    assert.equal(referral.total, 2, '同一个岗位投两次要算两次 —— 归因看的是投递而不是岗位')
    assert.equal(referral.replied, 2, '这个岗位的接触态是"HR 已回复"，两条投递都该计上')
    assert.equal(referral.replyRate, 1)
    assert.equal(byChannel.get('platform')?.label, APPLICATION_CHANNEL_LABEL.platform)

    // ── 按简历版本 ──────────────────────────────────────────────────
    const byResume = new Map(attribution.byResume.map((row) => [row.key, row]))
    // 标签带 #id 而不是 rev：application 只记了 resume_id，没记"投递当时是哪一版"，
    // 拿简历的**当前** rev 去标注历史投递会说假话；#id 才能让同名简历彼此可区分。
    assert.equal(byResume.get(String(resume.id))?.label, `Java 后端 #${String(resume.id)}`)
    assert.equal(byResume.get(String(resume.id))?.total, 2)
    assert.equal(
      byResume.get(String(doomed.id))?.label,
      `简历 #${String(doomed.id)}（已删除）`,
      '引用了已删除的简历时必须如实说，而不是抛错或假装没这条',
    )
    assert.equal(byResume.get('none')?.label, '（未记录简历）')
    assert.equal(byResume.get('none')?.total, 1)

    assert.equal(attribution.sampleSize, 4)
    assert.ok(attribution.note.includes('投递样本只有 4 条'), attribution.note)
  })
})

// ─────────────────────────────────────────────────────────────────────
// 薪资分位
// ─────────────────────────────────────────────────────────────────────

test('salaryBand 只用薪资下限；空数据全 null', async () => {
  await withStore((store) => {
    const analytics = createAnalyticsService({ store })
    const empty = analytics.salaryBand()
    assert.deepEqual(empty, { scope: '全部', count: 0, min: null, p25: null, median: null, p75: null, max: null })
  })
})

test('salaryBand：分位按线性插值算，上限与"面议"不参与', async () => {
  await withStore((store) => {
    // 深圳 4 条已知下限：10000 / 20000 / 30000 / 40000
    const shenzhen = [10000, 20000, 30000, 40000]
    shenzhen.forEach((salaryMin, index) => {
      seedJob(store, {
        platformJobId: `an-sal-sz-${String(index)}`,
        city: '深圳',
        salaryMin,
        salaryMax: salaryMin + 10000,
      })
    })
    // 只有上限、没有下限的"面议"类岗位：不能进分位
    seedJob(store, { platformJobId: 'an-sal-null-min', city: '深圳', salaryMin: null, salaryMax: 99999 })
    seedJob(store, { platformJobId: 'an-sal-null-min-2', city: '杭州', salaryMin: null, salaryMax: 88888 })
    // 杭州一条 50000：只影响不筛城市的那个口径
    seedJob(store, { platformJobId: 'an-sal-hz', city: '杭州', salaryMin: 50000, salaryMax: 60000 })

    const analytics = createAnalyticsService({ store })

    // 手算期望（线性插值，见 analytics 的 quantile）：
    //   [10000, 20000, 30000, 40000]，n = 4
    //   p25  : position = 3 * 0.25 = 0.75  → 10000 + (20000-10000) * 0.75 = 17500
    //   p50  : position = 3 * 0.50 = 1.5   → 20000 + (30000-20000) * 0.50 = 25000
    //   p75  : position = 3 * 0.75 = 2.25  → 30000 + (40000-30000) * 0.25 = 32500
    const band = analytics.salaryBand({ city: '深圳' })
    assert.equal(band.scope, '深圳')
    assert.equal(band.count, 4, '只算有薪资下限的：上下限混在一起的中位数没有意义')
    assert.equal(band.min, 10000)
    assert.equal(band.p25, 17500)
    assert.equal(band.median, 25000)
    assert.equal(band.p75, 32500)
    assert.equal(band.max, 40000, '上限 99999 那条不该把 max 抬上去')

    // 不筛城市：多一条杭州 50000 → 五个值，p25/p50/p75 恰好落在样本点上
    const all = analytics.salaryBand()
    assert.equal(all.scope, '全部')
    assert.equal(all.count, 5)
    assert.equal(all.min, 10000)
    assert.equal(all.p25, 20000)
    assert.equal(all.median, 30000)
    assert.equal(all.p75, 40000)
    assert.equal(all.max, 50000)
  })
})

/** 归因测试只关心版本标签与计数，简历内容本身用最小合法值。 */
function emptyResume() {
  return {
    basics: { name: '张三', title: '前端开发' },
    summary: '',
    skills: [],
    experiences: [],
    projects: [],
    education: [],
    extras: [],
  }
}

// ── 批次 F：箱线图 / 本地基准 / 简历 A/B ──────────────────────────────

test('F1：箱线图的两个口径算出**不同**的中位数，且都标明口径与单位', () => {
  withStore((store) => {
    // 三条：下限不同，月数不同
    seedJob(store, { platformJobId: 'f1-a', salaryMin: 10000, salaryMax: 20000, salaryMonths: 12 })
    seedJob(store, { platformJobId: 'f1-b', salaryMin: 20000, salaryMax: 30000, salaryMonths: 15 })
    seedJob(store, { platformJobId: 'f1-c', salaryMin: 30000, salaryMax: 40000, salaryMonths: null })

    const analytics = createAnalyticsService({ store })

    const monthly = analytics.salaryBox({ basis: 'monthly_min' })
    assert.equal(monthly.box.basis, 'monthly_min')
    assert.equal(monthly.box.basisLabel.includes('元/月'), true, '单位必须写出来')
    assert.equal(monthly.box.count, 3)
    assert.equal(monthly.box.median, 20000)
    assert.equal(monthly.box.min, 10000)
    assert.equal(monthly.box.max, 30000)

    const annual = analytics.salaryBox({ basis: 'annualized' })
    assert.equal(annual.box.basis, 'annualized')
    assert.equal(annual.box.basisLabel.includes('元/年'), true)
    // 年薪 = 区间中点 × 月数：15000×12=180000 / 25000×15=375000 / 35000×12=420000
    assert.equal(annual.box.min, 180000)
    assert.equal(annual.box.median, 375000)
    assert.equal(annual.box.max, 420000)
    assert.notEqual(monthly.box.median, annual.box.median, '两个口径当然不一样 —— 所以口径必须显式')

    // 另一个口径作为 alternate 一起给，界面切换时不必再请求
    assert.equal(monthly.alternate?.basis, 'annualized')
  })
})

test('F1：箱体（P25–P75）里装了多少条要有据可查', () => {
  withStore((store) => {
    for (const [index, salaryMin] of [10000, 20000, 30000, 40000].entries()) {
      seedJob(store, { platformJobId: `f1-box-${String(index)}`, salaryMin, salaryMax: salaryMin + 5000 })
    }
    const box = createAnalyticsService({ store }).salaryBox({ basis: 'monthly_min' }).box
    assert.equal(box.p25, 17500)
    assert.equal(box.p75, 32500)
    // [17500, 32500] 里落着 20000 与 30000 两条
    assert.equal(box.withinBox, 2)
    assert.ok(box.withinBox <= box.count)
  })
})

test('F1：全部样本同值时不会除零（给一个满宽箱体，而不是 NaN）', () => {
  withStore((store) => {
    seedJob(store, { platformJobId: 'f1-same-1', salaryMin: 20000, salaryMax: 20000 })
    seedJob(store, { platformJobId: 'f1-same-2', salaryMin: 20000, salaryMax: 20000 })
    const box = createAnalyticsService({ store }).salaryBox({ basis: 'monthly_min' }).box
    assert.equal(box.min, 20000)
    assert.equal(box.max, 20000)
    assert.equal(box.median, 20000)
    assert.equal(box.min === box.max, true)
  })
})

test('F2：本地基准只用**自己的岗位库**，并如实说明投递样本不足', () => {
  withStore((store) => {
    for (const [index, salaryMin] of [10000, 15000, 20000, 25000, 30000].entries()) {
      seedJob(store, { platformJobId: `f2-${String(index)}`, salaryMin, salaryMax: salaryMin + 5000 })
    }
    const analytics = createAnalyticsService({ store })

    // 一条投递都没有 → applied 空、medianGap 为 null、且 note 说清"基准是本地库"
    const none = analytics.salaryBaseline()
    assert.equal(none.all.count, 5)
    assert.equal(none.applied.count, 0)
    assert.equal(none.medianGap, null)
    assert.equal(none.enoughSample, false)
    assert.ok(none.note.includes('你自己抓到的岗位库'), '必须写明基准来源，否则用户会当成行业数据')
    assert.ok(none.note.includes('不是行业数据'), '更要说清它**不是**什么')
    assert.ok(none.note.includes('没有数据源'), '并说明为什么不可能有')
  })
})

test('F2：投递过的岗位按**岗位**去重计入基准 —— 投两次不该把它算两遍', async () => {
  await withStore(async (store) => {
    const ids = [10000, 20000, 30000, 40000, 50000].map((salaryMin, index) =>
      seedJob(store, { platformJobId: `f2b-${String(index)}`, salaryMin, salaryMax: salaryMin + 5000 }),
    )
    // 同一个岗位投两次
    store.pipeline.createApplication({ jobId: ids[4] as number, channel: 'platform', actor: 'gui' }, T)
    store.pipeline.createApplication({ jobId: ids[4] as number, channel: 'referral', actor: 'gui' }, T)

    const baseline = createAnalyticsService({ store }).salaryBaseline()
    assert.equal(baseline.applied.count, 1, '按岗位去重：同一个岗位的两次投递只算一次')
    assert.equal(baseline.applied.median, 50000)
    assert.equal(baseline.medianGap, 50000 - 30000)
    assert.equal(baseline.enoughSample, false, `1 条 < ${String(MIN_SAMPLE)}`)
  })
})

test('F3：简历对比每格给**分子/分母**，薄样本格子被显式标出', () => {
  withStore((store) => {
    const resumeId = store.resume.create(
      {
        name: '前端版 · 2026',
        content: emptyResume() as never,
        isDefault: true,
      },
      T,
    ).id
    const jobIds = [1, 2, 3].map((index) =>
      seedJob(store, { platformJobId: `f3-${String(index)}` }),
    )

    // 三条投递，用同一版简历，两条推进到面试中
    for (const [index, jobId] of jobIds.entries()) {
      const application = store.pipeline.createApplication(
        { jobId, resumeId, channel: 'platform', actor: 'gui' },
        T,
      )
      if (index < 2) store.pipeline.advanceApplication(application.id, 'interviewing', T)
    }

    const compare = createAnalyticsService({ store }).resumeCompare()
    assert.equal(compare.sampleSize, 3)
    assert.equal(compare.enoughSample, false, `3 < ${String(MIN_SAMPLE)}`)

    const row = compare.rows.find((item) => item.resumeId === resumeId)
    assert.ok(row !== undefined)
    assert.equal(row.label, '前端版 · 2026')
    assert.equal(row.total, 3)
    assert.equal(row.enoughSample, false)

    const interviewing = row.cells.find((cell) => cell.stage === 'interviewing')
    assert.equal(interviewing?.count, 2)
    assert.equal(interviewing?.thin, true, `2 < ${String(MIN_SAMPLE)}：这一格必须被标出来`)
    const sent = row.cells.find((cell) => cell.stage === 'sent')
    assert.equal(sent?.count, 1)
    assert.equal(sent?.rate, 1 / 3, '比率照给，但样本量同时给')

    // 阶段列是一整条时间线，不是枚举顺序
    assert.deepEqual(
      compare.stages.slice(0, 3).map((stage) => stage.stage),
      ['sent', 'viewed', 'interviewing'],
    )
    assert.ok(compare.note.includes('不做显著性检验'), '小样本必须明说不要看显著性')
  })
})

test('F3：没有投递时不假装有结论', () => {
  withStore((store) => {
    const compare = createAnalyticsService({ store }).resumeCompare()
    assert.deepEqual(compare.rows, [])
    assert.equal(compare.sampleSize, 0)
    assert.equal(compare.enoughSample, false)
    assert.ok(compare.note.includes('还没有投递记录'))
  })
})

test('F3：没有记录简历版本的投递单独成行，不混进任何一版', () => {
  withStore((store) => {
    const jobId = seedJob(store, { platformJobId: 'f3-null' })
    store.pipeline.createApplication({ jobId, channel: 'platform', actor: 'gui' }, T)
    const compare = createAnalyticsService({ store }).resumeCompare()
    assert.equal(compare.rows.length, 1)
    assert.equal(compare.rows[0]?.resumeId, null)
    assert.ok((compare.rows[0]?.label ?? '').includes('未记录'))
  })
})
