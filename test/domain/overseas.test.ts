/**
 * 海外 / 远程支线领域测试（§4.M / §12.8 / D-11）。
 *
 * 这条支线上有三个"错一次就完"的点，测试的重心也在这三处：
 *
 *   * **M4 工签识别**：识别不出来就必须说识别不出来。把"没写"读成"提供担保"
 *     会让用户投一堆注定无效的岗位 —— 这比不识别更糟，因为它给了虚假的希望。
 *     所以 `unknown` 是一等取值，且必须带上"没写不等于不提供"的说明。
 *   * **M3 时区**：算错时区 = 直接错过面试，所以面试时间**双重显示**（对方 + 本地），
 *     而不是只给一个换算后的数字。时间解析不了要报错；时区名不认识反而**不能**抛 ——
 *     展示层坏掉不该把面试时间本身弄丢。
 *   * **M1 不做机翻**：英文简历只做"检查与提示"。这个约束的执行方式就是**不提供翻译入口**，
 *     所以这里连模块与服务上有没有 `translate` 成员都要断言。
 *
 * 时间一律固定：时区断言用 `Intl`（内置）算，绝不去改进程时区。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAiService } from '../../src/host/ai/client.js'
import { AI_PURPOSE_DEFAULT_ENABLED } from '../../src/host/ai/purposes.js'
import * as overseasModule from '../../src/host/domain/overseas.js'
import {
  CAMPUS_PATTERNS,
  createOverseasService,
  detectCampusBatch,
  detectRemote,
  detectVisa,
  inspectEnglishResume,
  REMOTE_PATTERNS,
  timezoneDisplay,
  VISA_NO_SPONSORSHIP_PATTERNS,
  VISA_PROVIDES_PATTERNS,
} from '../../src/host/domain/overseas.js'
import { VISA_STANCES } from '../../src/shared/contract/enums/overseas.js'
import type { VisaStance } from '../../src/shared/contract/enums/overseas.js'
import type { ResumeContent } from '../../src/shared/domain/resume-content.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import type { Store } from '../../src/host/store/store.js'
import { DomainError } from '../../src/host/util/errors.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T = '2026-09-16T10:00:00.000Z'

/** 一个**什么都没说**的 JD：三类识别都该给"未识别"，不给结论。 */
const BLANK_JD = '岗位职责：负责前端架构。任职要求：熟悉 react。'

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'ov-1',
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
    sourceUrl: 'https://jobs.51job.com/all/ov-1.html',
    publishedAt: T,
    jdText: BLANK_JD,
    ...overrides,
  }
}

function seedJob(store: Store, overrides: Partial<JobUpsertInput> = {}): number {
  const company = store.company.ensure({ name: '腾讯科技（深圳）有限公司', nameNorm: '腾讯科技' }, T)
  return store.job.upsert({ ...jobInput(overrides), companyId: company.id }, T).id
}

function resumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    basics: { name: 'San Zhang', title: 'Frontend Engineer', city: 'Shenzhen', years: 3 },
    summary: 'Frontend engineer with 3 years of experience building web apps.',
    skills: [
      { name: 'React', level: '熟练', years: 3, evidence: '订单中台' },
      { name: 'TypeScript', level: '熟练', years: 3, evidence: '订单中台' },
    ],
    experiences: [{ company: 'Acme', title: 'Frontend Engineer', highlights: ['Led the checkout rewrite'] }],
    projects: [],
    education: [],
    extras: [],
    ...overrides,
  }
}

function withStore(fn: (store: Store) => Promise<void> | void): Promise<void> {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  return Promise.resolve(fn(store)).finally(() => {
    store.close()
    cleanup(dir)
  })
}

/** 故意传非法值：要验证白名单真的拦得住，所以显式绕过类型系统。 */
function bogus<T>(value: string): T {
  return value as unknown as T
}

interface JobBranchRow {
  campus_batch: string | null
  remote_kind: string | null
  visa_stance: string | null
}

/** 直接读 job 的三个识别列 —— 列表/详情 DTO 里没有它们，但筛选全靠它们。 */
function readJobBranches(store: Store, jobId: number): JobBranchRow {
  const row = store.db
    .prepare('SELECT campus_batch, remote_kind, visa_stance FROM job WHERE id = ?')
    .get(jobId) as JobBranchRow | undefined
  assert.ok(row !== undefined, `岗位 ${String(jobId)} 读不到识别列`)
  return row
}

// ─────────────────────────────────────────────────────────────────────
// M4：工签 / Sponsorship 识别（纯函数）
// ─────────────────────────────────────────────────────────────────────

test('detectVisa：明确"不提供"与明确"提供"要分开，命中必须带依据', () => {
  const unable = detectVisa('We are unable to sponsor visas for this role.')
  assert.equal(unable.stance, 'no_sponsorship')
  assert.ok(unable.evidence.length > 0, '判定必须带可读依据（没有依据的结论不如不给结论）')

  // 只命中"不提供"词表的文本：结论要干脆，不该还挂着"不确定"
  const noOnly = detectVisa('No sponsorship is available for this role.')
  assert.equal(noOnly.stance, 'no_sponsorship')
  assert.equal(noOnly.uncertainty, null)
  assert.ok(
    noOnly.evidence.every((hit) => VISA_NO_SPONSORSHIP_PATTERNS.includes(hit)),
    `依据必须来自"不提供"词表：${noOnly.evidence.join('、')}`,
  )

  const provides = detectVisa('Visa sponsorship available for this position.')
  assert.equal(provides.stance, 'provides')
  assert.ok(provides.evidence.length > 0)
  assert.ok(
    provides.evidence.every((hit) => VISA_PROVIDES_PATTERNS.includes(hit)),
    `依据必须来自"提供"词表：${provides.evidence.join('、')}`,
  )
  assert.equal(provides.uncertainty, null, '词表直接命中时不该还挂着"不确定"')
})

test('detectVisa："must be authorized to work" 不能被读成"提供担保"', () => {
  const authorized = detectVisa('Must be authorized to work in the US.')
  // 词表把 "must be authorized to work" 归进"不提供担保"一组：这句话的实质是
  // "你得自己已经有身份"，行动含义与"提供担保"完全相反。
  assert.notEqual(authorized.stance, 'provides', '这句话绝不是"我们提供担保"')
  assert.equal(authorized.stance, 'no_sponsorship')
  assert.ok(authorized.evidence.length > 0)
})

test('detectVisa：同一段里"提供"与"不提供"并存 → 保守判不提供，并挂上不确定性', () => {
  const both = detectVisa(
    'Visa sponsorship available for exceptional candidates. Candidates without sponsorship will not be considered.',
  )
  assert.equal(both.stance, 'no_sponsorship', '投错的代价比不投大，冲突时按保守口径')
  assert.ok(both.uncertainty !== null, '冲突必须说出来，否则用户无从知道要看一眼')
  assert.ok(
    both.uncertainty.includes('同时') || both.uncertainty.includes('人工确认'),
    `不确定性说明要讲清冲突在哪：${both.uncertainty}`,
  )
  assert.ok(both.evidence.length > 0)
})

test('detectVisa：什么都没提 → unknown，且必须说清"没写 != 不提供"', () => {
  const none = detectVisa(BLANK_JD)
  assert.equal(none.stance, 'unknown', '识别不出来就说识别不出来 —— 这是 anti-false-hope 规则')
  assert.deepEqual(none.evidence, [], '没命中任何词表时没有依据可给')
  assert.ok(none.uncertainty !== null)
  assert.ok(
    none.uncertainty.includes('没写'),
    `说明里必须出现"没写"，否则会被读成"不提供"：${none.uncertainty}`,
  )
  assert.ok(
    none.uncertainty.includes('不等于'),
    `说明里必须点明"没写不等于不提供"：${none.uncertainty}`,
  )
  assert.ok(
    none.uncertainty.includes('HR'),
    `说明要给出下一步（去问 HR），而不是丢一个 unknown 就走：${none.uncertainty}`,
  )
})

// ─────────────────────────────────────────────────────────────────────
// M5：远程模式识别（纯函数）
// ─────────────────────────────────────────────────────────────────────

test('detectRemote：remote / hybrid / onsite 认得出，没写就 unknown，不猜', () => {
  assert.equal(detectRemote('This is a fully remote position.').kind, 'remote')
  assert.equal(detectRemote('Hybrid working model, 2 days in office.').kind, 'hybrid')
  assert.equal(detectRemote('This is an on-site role in Shenzhen.').kind, 'onsite')

  const none = detectRemote(BLANK_JD)
  assert.equal(none.kind, 'unknown', '没写就是没写，不猜一个模式出来')
  assert.deepEqual(none.evidence, [])

  const remote = detectRemote('Fully remote, work from anywhere.')
  assert.ok(remote.evidence.length > 0)
  assert.ok(
    remote.evidence.every((hit) => REMOTE_PATTERNS.some((group) => group.patterns.includes(hit))),
    `依据必须来自远程词表：${remote.evidence.join('、')}`,
  )
})

// ─────────────────────────────────────────────────────────────────────
// L7：校招批次识别（纯函数）
// ─────────────────────────────────────────────────────────────────────

test('detectCampusBatch：秋招/春招认得出，认不出来就 null', () => {
  assert.equal(detectCampusBatch('2026届秋招 · 前端工程师').batch, 'autumn')
  assert.equal(detectCampusBatch('春招补录，欢迎投递').batch, 'spring')

  const none = detectCampusBatch('社会招聘：三年以上经验')
  assert.equal(none.batch, null, '社招岗位不该被硬塞一个批次')
  assert.deepEqual(none.evidence, [])

  const autumn = detectCampusBatch('2026届秋招')
  assert.ok(autumn.evidence.length > 0)
  assert.ok(
    autumn.evidence.every((hit) => CAMPUS_PATTERNS.some((group) => group.patterns.includes(hit))),
    `依据必须来自批次词表：${autumn.evidence.join('、')}`,
  )
})

// ─────────────────────────────────────────────────────────────────────
// analyzeJob：识别结果必须落库，且"未识别"不能被写成结论
// ─────────────────────────────────────────────────────────────────────

test('analyzeJob：JD 写了担保/远程/秋招时，visa_requirement 与 job 识别列都跟着落库', async () => {
  await withStore((store) => {
    const jobId = seedJob(store, {
      title: '高级前端工程师',
      jdText: '2026届秋招 · 高级前端工程师\nVisa sponsorship available.\nFully remote role.',
    })
    const overseas = createOverseasService({ store, clock: () => T })
    const result = overseas.analyzeJob(jobId)

    assert.equal(result.stance, 'provides')
    assert.equal(result.remoteKind, 'remote')
    assert.equal(result.campusBatch, 'autumn')
    assert.equal(result.source, 'rule', '规则识别出来的要如实记 source=rule，不能冒充人工')

    const stored = store.branch.getVisaRequirement(jobId)
    assert.ok(stored !== undefined, '识别结果必须落库，不能只出现在返回值里')
    assert.equal(stored.stance, 'provides')
    assert.equal(stored.source, 'rule')
    assert.ok(stored.evidence.length > 0)
    assert.equal(stored.uncertainty, null)

    const row = readJobBranches(store, jobId)
    assert.equal(row.visa_stance, 'provides')
    assert.equal(row.remote_kind, 'remote')
    assert.equal(row.campus_batch, 'autumn')

    // 同一个岗位只留最新一条判断：两条互相矛盾的结论只会让人更迷惑
    overseas.analyzeJob(jobId)
    assert.equal(store.branch.listVisaRequirements({}).length, 1)
  })
})

test('analyzeJob：JD 什么都没写时，visa_requirement 记 unknown 并说明"没写不等于不提供"', async () => {
  await withStore((store) => {
    const jobId = seedJob(store, { title: '前端工程师', tags: [], jdText: BLANK_JD })
    const overseas = createOverseasService({ store, clock: () => T })
    const result = overseas.analyzeJob(jobId)

    assert.equal(result.stance, 'unknown')
    assert.ok((result.uncertainty ?? '').includes('不等于'), `要给虚假的希望之前先说清楚：${String(result.uncertainty)}`)

    const stored = store.branch.getVisaRequirement(jobId)
    assert.equal(stored?.stance, 'unknown')
    assert.equal(stored?.uncertainty, result.uncertainty)
    assert.deepEqual(stored?.evidence, [])
  })
})

test('analyzeJob：JD 什么都没写时，job 上的识别列必须留 NULL，不猜一个值', async () => {
  await withStore((store) => {
    const jobId = seedJob(store, { title: '前端工程师', tags: [], jdText: BLANK_JD })
    const overseas = createOverseasService({ store, clock: () => T })
    overseas.analyzeJob(jobId)

    const row = readJobBranches(store, jobId)
    assert.equal(row.campus_batch, null, '没识别出批次就留 NULL')
    assert.equal(
      row.remote_kind,
      null,
      '识别不出来就该留 NULL（schema 注释：识别不出来就留 NULL，不猜一个值）',
    )
    assert.equal(
      row.visa_stance,
      null,
      '识别不出来就该留 NULL；"未识别"是 visa_requirement.stance 的一等取值，不是 job 识别列的取值',
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// setVisa：人工判定
// ─────────────────────────────────────────────────────────────────────

test('setVisa：人工判定记 source=manual 且不带不确定性；非法立场报错并列出合法取值', async () => {
  await withStore((store) => {
    const jobId = seedJob(store, { jdText: 'Visa sponsorship available.' })
    const overseas = createOverseasService({ store, clock: () => T })
    overseas.analyzeJob(jobId)

    assert.throws(
      () => overseas.setVisa(jobId, bogus<VisaStance>('maybe')),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'INVALID_INPUT')
        assert.ok(error.message.includes('maybe'), `报错要点出非法值：${error.message}`)
        for (const stance of VISA_STANCES) {
          assert.ok((error.hint ?? '').includes(stance), `提示要列出合法取值 ${stance}：${String(error.hint)}`)
        }
        return true
      },
    )
    assert.equal(store.branch.listVisaRequirements({}).length, 1, '非法输入不该落库')

    const manual = overseas.setVisa(jobId, 'no_sponsorship', {
      identityLimit: '仅限本地身份',
      evidence: ['HR 口头说不办工签'],
    })
    assert.equal(manual.stance, 'no_sponsorship')
    assert.equal(manual.source, 'manual', '人工改过之后要能看出这条不是规则识别出来的')
    assert.equal(manual.uncertainty, null, '人工确认过就不该再挂着"不确定"')
    assert.equal(manual.identityLimit, '仅限本地身份')
    assert.deepEqual(manual.evidence, ['HR 口头说不办工签'])

    // 人工判定覆盖规则判定：同一岗位只留一条结论
    assert.equal(store.branch.listVisaRequirements({}).length, 1)
    assert.equal(store.branch.getVisaRequirement(jobId)?.source, 'manual')
    assert.equal(readJobBranches(store, jobId).visa_stance, 'no_sponsorship')

    assert.throws(
      () => overseas.setVisa(9999, 'provides'),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
      '岗位不存在要报 NOT_FOUND，而不是静默写一条挂空的记录',
    )
  })
})

test('getVisa：还没识别过时给"未识别"，不假装已经识别过', async () => {
  await withStore((store) => {
    const jobId = seedJob(store)
    const overseas = createOverseasService({ store, clock: () => T })
    const visa = overseas.getVisa(jobId)
    assert.equal(visa.stance, 'unknown')
    assert.ok((visa.uncertainty ?? '').includes('还没有识别过'))
  })
})

// ─────────────────────────────────────────────────────────────────────
// M3：时区双重显示
// ─────────────────────────────────────────────────────────────────────

/** 纽约夏令时（UTC-4）的固定时刻。 */
const AT_SUMMER = '2026-07-15T13:00:00.000Z'
/** 纽约冬令时（UTC-5）的固定时刻。 */
const AT_WINTER = '2026-01-15T13:00:00.000Z'

test('timezoneDisplay：面试时间两边都显示，差多少小时一眼看得出来（M3）', async () => {
  const shown = timezoneDisplay(AT_SUMMER, 'America/New_York', 'Asia/Shanghai')
  assert.equal(shown.at, AT_SUMMER)
  assert.equal(shown.counterpartTz, 'America/New_York')
  assert.equal(shown.localTz, 'Asia/Shanghai')
  assert.equal(shown.counterpart.tz, 'America/New_York')
  assert.equal(shown.local.tz, 'Asia/Shanghai')
  assert.ok(shown.counterpart.text.length > 0, '对方时区那一行不能是空的')
  assert.ok(shown.local.text.length > 0, '本地时区那一行不能是空的')
  assert.notEqual(shown.counterpart.text, shown.local.text, '两边时间一样就说明换算没做')

  // 纽约 vs 上海：夏令时差 -12 小时、冬令时差 -13 小时。
  // 断言写成区间而不是定值，是因为这一对时区的差值会随夏令时切换而变（每年 3 月与 11 月各切一次）；
  // 同一个 ISO 时刻在别的月份算出来的可能是另一个值。
  assert.ok(
    shown.diffHours <= -12 && shown.diffHours >= -13,
    `纽约与上海的差值应当落在 -13..-12，实际 ${String(shown.diffHours)}`,
  )
  assert.equal(shown.diffHours, -12, '2026-07-15 的纽约在夏令时（UTC-4），与上海（UTC+8）差 -12 小时')
  assert.ok(shown.warning !== null, '差 12 小时属于"最容易记错"的那一类，必须有警告')

  const winter = timezoneDisplay(AT_WINTER, 'America/New_York', 'Asia/Shanghai')
  assert.ok(
    winter.diffHours <= -12 && winter.diffHours >= -13,
    `冬令时同样落在 -13..-12，实际 ${String(winter.diffHours)}`,
  )
  assert.equal(winter.diffHours, -13, '2026-01-15 的纽约在冬令时（UTC-5）')

  await withStore((store) => {
    const overseas = createOverseasService({ store, clock: () => T })
    const viaService = overseas.displayInterviewTime(AT_SUMMER, 'America/New_York')
    assert.equal(viaService.localTz, 'Asia/Shanghai', '本地时区固定是运行环境所在的中国时区')
    assert.equal(viaService.diffHours, shown.diffHours)
  })
})

test('timezoneDisplay：差 6 小时以上才警告，近时区不吓人', () => {
  const tokyo = timezoneDisplay(AT_SUMMER, 'Asia/Tokyo', 'Asia/Shanghai')
  assert.equal(tokyo.diffHours, 1)
  assert.equal(tokyo.warning, null, '只差 1 小时还弹警告就是狼来了')

  const same = timezoneDisplay(AT_SUMMER, 'Asia/Shanghai', 'Asia/Shanghai')
  assert.equal(same.diffHours, 0)
  assert.equal(same.warning, null)
})

test('timezoneDisplay：时间解析不了要报错；时区名不认识反而不能抛', () => {
  assert.throws(
    () => timezoneDisplay('明天下午三点', 'America/New_York', 'Asia/Shanghai'),
    (error: unknown) => {
      assert.ok(error instanceof DomainError)
      assert.equal(error.code, 'INVALID_INPUT')
      assert.ok(error.message.includes('明天下午三点'), `报错要带上原文便于排查：${error.message}`)
      return true
    },
    '面试时间本身有问题时必须说清楚，不能默默给一个 1970 年的时间',
  )

  // 时区名不认识时**不能抛**：面试时间还在，别因为展示层把信息弄丢（丢失面试时间比丢展示难看严重得多）
  const unknownTz = timezoneDisplay(AT_SUMMER, 'Mars/Olympus', 'Asia/Shanghai')
  assert.equal(unknownTz.at, AT_SUMMER, '"at" 必须原样带回来')
  assert.equal(unknownTz.counterpartTz, 'Mars/Olympus')
  assert.ok(unknownTz.counterpart.text.length > 0, '认不出时区也要退回一个能看的东西（UTC 原文）')
  assert.equal(unknownTz.local.tz, 'Asia/Shanghai')
  assert.ok(Number.isFinite(unknownTz.diffHours))
})

// ─────────────────────────────────────────────────────────────────────
// M1：英文简历只体检、不翻译
// ─────────────────────────────────────────────────────────────────────

test('inspectEnglish：年龄、照片、婚姻属于 error；职责式开头与空 Summary 属于 warn', async () => {
  await withStore((store) => {
    const overseas = createOverseasService({ store, clock: () => T })

    const withAge = store.resume.create(
      { name: '英文简历 · 带年龄', content: resumeContent({ basics: { name: 'San Zhang', title: 'Frontend Engineer', age: 24 } }) },
      T,
    )
    const ageIssues = overseas.inspectEnglish(withAge.id)
    assert.ok(
      ageIssues.some((issue) => issue.level === 'error' && issue.message.includes('年龄')),
      `海外简历不该写年龄（歧视风险）：${JSON.stringify(ageIssues)}`,
    )

    const withPhoto = store.resume.create(
      { name: '英文简历 · 带照片', content: resumeContent({ extras: [{ label: '照片', text: '一寸免冠照' }] }) },
      T,
    )
    assert.ok(
      overseas.inspectEnglish(withPhoto.id).some((issue) => issue.level === 'error' && issue.message.includes('照片')),
    )

    const withMarital = store.resume.create(
      { name: '英文简历 · 带婚姻状况', content: resumeContent({ extras: [{ label: '婚姻状况', text: '已婚' }] }) },
      T,
    )
    const maritalIssues = overseas.inspectEnglish(withMarital.id)
    assert.ok(maritalIssues.some((issue) => issue.level === 'error'))
    assert.ok(maritalIssues.some((issue) => issue.message.includes('婚姻状况')), '要指出是哪一条里出的问题')

    const weak = store.resume.create(
      {
        name: '英文简历 · 职责式写法',
        content: resumeContent({
          experiences: [{ company: '字节跳动', title: '前端', highlights: ['负责订单中台的重构', '参与性能优化'] }],
        }),
      },
      T,
    )
    const weakIssues = overseas.inspectEnglish(weak.id)
    assert.ok(
      weakIssues.some((issue) => issue.level === 'warn' && issue.message.includes('动词开头')),
      `英文简历要用 Led / Built / Reduced 这类动词开头：${JSON.stringify(weakIssues)}`,
    )
    assert.equal(weakIssues.some((issue) => issue.level === 'error'), false, '这只是写法建议，不是硬错误')

    const noSummary = store.resume.create(
      { name: '英文简历 · 没有 Summary', content: resumeContent({ summary: '   ' }) },
      T,
    )
    assert.ok(
      overseas.inspectEnglish(noSummary.id).some(
        (issue) => issue.level === 'warn' && issue.message.includes('Summary'),
      ),
      '海外 HR 会先看 Summary，缺了要提醒',
    )

    // 干净的英文简历：一条问题都不该报（报假警会让用户再也不看这份清单）
    const clean = store.resume.create({ name: '英文简历 · 干净', content: resumeContent() }, T)
    assert.deepEqual(overseas.inspectEnglish(clean.id), [])

    assert.throws(
      () => overseas.inspectEnglish(9999),
      (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
    )
  })
})

test('inspectEnglishResume 是纯函数：同样输入给同样结论，不做任何改写', () => {
  const content = {
    basics: { name: 'San Zhang', title: 'Frontend Engineer' },
    summary: 'Frontend engineer.',
    experiences: [{ highlights: ['负责订单中台'] }],
    extras: [],
  }
  const before = JSON.stringify(content)
  const issues = inspectEnglishResume(content)
  assert.equal(JSON.stringify(content), before, '体检函数不许改动传进来的内容')
  assert.deepEqual(
    issues.map((issue) => issue.level),
    ['warn'],
    '空 extras、有 summary、只有一条职责式写法 → 只该有那一条 warn',
  )
})

test('overseas 不提供任何翻译入口：缺 API 就是"不做机翻"的执行方式（M1）', async () => {
  const forbidden = /translat|toenglish|to_english|machine|机翻/i
  assert.deepEqual(
    Object.keys(overseasModule).filter((key) => forbidden.test(key)),
    [],
    '模块上不该有任何翻译入口 —— 提供入口就等于鼓励用它',
  )
  await withStore((store) => {
    const service = createOverseasService({ store })
    assert.deepEqual(
      Object.keys(service).filter((key) => forbidden.test(key)),
      [],
      '服务上也不该有 translate / toEnglish 这类成员',
    )
    assert.equal(typeof service.inspectEnglish, 'function', '能给的是"问题清单"，不是"翻好的文本"')
  })
})

// ─────────────────────────────────────────────────────────────────────
// M2：Cover Letter
// ─────────────────────────────────────────────────────────────────────

test('draftCoverLetter：没有模型时只做模板，且内容里不许出现岗位/简历之外的事实', async () => {
  await withStore(async (store) => {
    const resumeId = store.resume.create({ name: '前端 · 英文版', content: resumeContent(), isDefault: true }, T).id
    const jobId = seedJob(store, {
      title: 'Senior Frontend Engineer',
      jdText: 'We are looking for a senior frontend engineer. 任职要求：熟悉 react。',
    })
    const overseas = createOverseasService({ store, clock: () => T })

    const letter = await overseas.draftCoverLetter({ jobId })
    assert.equal(letter.via, 'rule', '没配模型就是模板，界面上不能标成"AI 生成"（J10）')
    assert.equal(letter.language, 'en', '海外岗位默认英文（M2）')
    assert.equal(letter.resumeId, resumeId, '要记下用的是哪一版简历')
    assert.ok(letter.content.trim().length > 0)
    assert.ok(letter.content.includes('Senior Frontend Engineer'), '要写清投的是哪个岗位')
    for (const skill of ['React', 'TypeScript']) {
      assert.ok(letter.content.includes(skill), `模板只能用简历里已有的技能：缺 ${skill}`)
    }

    // 一眼能看出是模板，而不是"看起来像人写的" —— 用户据此判断要不要再让模型润色
    assert.ok(letter.content.startsWith('Dear Hiring Manager,'))
    assert.ok(letter.content.includes('Sincerely,'))
    assert.ok(letter.notes.length > 0)
    assert.ok(letter.notes.some((note) => note.includes('模板')), `notes 要如实说明这是模板：${letter.notes.join('；')}`)

    // §4.5 禁止编造：模板不得引入岗位与简历里都没有的事实
    for (const invented of ['Kubernetes', 'Google', 'AWS', '世界 500 强', '10 years', '精通分布式']) {
      assert.equal(letter.content.includes(invented), false, `模板不得编造：${invented}`)
    }

    const chinese = await overseas.draftCoverLetter({ jobId, language: 'zh', resumeId })
    assert.equal(chinese.via, 'rule')
    assert.equal(chinese.language, 'zh')
    assert.ok(chinese.content.includes('尊敬的招聘负责人'))
    assert.ok(chinese.content.includes('Senior Frontend Engineer'))
    assert.ok(chinese.content.includes('React'))

    assert.equal(overseas.listCoverLetters(jobId).length, 2)
    assert.equal(overseas.listCoverLetters().length, 2)
  })
})

test('draftCoverLetter：开了 cover_letter 且模型可用时用模型内容，via 记成 llm', async () => {
  await withStore(async (store) => {
    store.resume.create({ name: '前端 · 英文版', content: resumeContent(), isDefault: true }, T)
    const jobId = seedJob(store, { title: 'Senior Frontend Engineer' })
    let calls = 0
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          calls += 1
          return {
            text: JSON.stringify({
              content:
                'Dear Hiring Manager, I am writing to apply for the Senior Frontend Engineer role. My work on the order platform with React and TypeScript matches your requirements closely.',
              notes: ['突出了订单中台的 React 经验'],
            }),
          }
        },
      }),
    })
    // cover_letter 默认是关的 —— 想走模型必须显式打开
    ai.setConfig({ purposes: { cover_letter: true } })
    const overseas = createOverseasService({ store, ai, clock: () => T })

    const letter = await overseas.draftCoverLetter({ jobId })
    assert.equal(letter.via, 'llm')
    assert.ok(letter.content.includes('Senior Frontend Engineer'))
    assert.ok(letter.notes.includes('突出了订单中台的 React 经验'), '模型给的重点要带回来给用户看')
    assert.equal(calls, 1, '输出合规时不该重试')
    assert.equal(store.llmCall.count(), 1, '每次真的调用模型都要留痕（I5）')
  })
})

test('cover_letter 默认关：模型配好了也不会被调用，降级成模板并如实标注', async () => {
  await withStore(async (store) => {
    store.resume.create({ name: '前端 · 英文版', content: resumeContent(), isDefault: true }, T)
    const jobId = seedJob(store, { title: 'Senior Frontend Engineer' })
    assert.equal(
      AI_PURPOSE_DEFAULT_ENABLED.cover_letter,
      false,
      'Cover Letter 的质量依赖模型，默认关，由用户自己开',
    )

    let calls = 0
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          calls += 1
          return { text: '{}' }
        },
      }),
    })
    const overseas = createOverseasService({ store, ai, clock: () => T })

    const letter = await overseas.draftCoverLetter({ jobId })
    assert.equal(letter.via, 'rule')
    assert.equal(calls, 0, '关掉的用途绝不调用模型（§4.5 按用途开关是隐私设计的一部分）')
    assert.equal(store.llmCall.count(), 0, '没调用就不该有留痕')
    assert.ok(
      letter.notes.some((note) => note.includes('未开启')),
      `降级原因要如实说出来：${letter.notes.join('；')}`,
    )
  })
})

test('draftCoverLetter：模型输出不合规时重试一次，仍不合规就退回模板', async () => {
  await withStore(async (store) => {
    store.resume.create({ name: '前端 · 英文版', content: resumeContent(), isDefault: true }, T)
    const jobId = seedJob(store, { title: 'Senior Frontend Engineer' })
    let calls = 0
    const ai = createAiService({
      store,
      llm: () => ({
        async complete() {
          calls += 1
          return { text: '这不是 JSON，也没有 content 字段。' }
        },
      }),
    })
    ai.setConfig({ purposes: { cover_letter: true } })
    const overseas = createOverseasService({ store, ai, clock: () => T })

    const letter = await overseas.draftCoverLetter({ jobId })
    assert.equal(letter.via, 'rule', '解析不出来就必须降级，不能把垃圾当结果')
    assert.equal(calls, 2, '不合规只重试一次 —— 再多就是在跟一个不肯听话的模型耗时间')
    assert.ok(
      letter.notes.some((note) => note.includes('不合规')),
      `降级原因要说清是"输出不合规"：${letter.notes.join('；')}`,
    )
    assert.ok(letter.content.startsWith('Dear Hiring Manager,'), '降级后给的是模板全文，不是空字符串')
  })
})

// ─────────────────────────────────────────────────────────────────────
// M4 / M5：筛选
// ─────────────────────────────────────────────────────────────────────

test('filterJobs：只按已落库的工签/远程判定筛，没识别出来的不会被算进来', async () => {
  await withStore((store) => {
    const remoteJob = seedJob(store, {
      platformJobId: 'ov-remote',
      jdText: 'Visa sponsorship available. Fully remote role.',
    })
    const noSponsorJob = seedJob(store, {
      platformJobId: 'ov-nosponsor',
      jdText: 'We are unable to sponsor visas for this role.',
    })
    const blankJob = seedJob(store, { platformJobId: 'ov-blank', title: '前端工程师', tags: [], jdText: BLANK_JD })

    const overseas = createOverseasService({ store, clock: () => T })
    overseas.analyzeJob(remoteJob)
    overseas.analyzeJob(noSponsorJob)
    overseas.analyzeJob(blankJob)

    assert.deepEqual(
      overseas.filterJobs({ stance: 'provides' }).map((row) => row.jobId),
      [remoteJob],
    )
    assert.deepEqual(
      overseas.filterJobs({ stance: 'no_sponsorship' }).map((row) => row.jobId),
      [noSponsorJob],
    )
    assert.deepEqual(
      overseas.filterJobs({ stance: 'unknown' }).map((row) => row.jobId),
      [blankJob],
      '"未识别"要能单独筛出来 —— 这一批正是要去问 HR 的',
    )
    assert.deepEqual(
      overseas.filterJobs({ remoteKind: 'remote' }).map((row) => row.jobId),
      [remoteJob],
      '没识别出远程模式的岗位不该混进"远程"结果里',
    )
    assert.deepEqual(overseas.filterJobs({ remoteKind: 'onsite' }), [])

    const all = overseas.filterJobs({})
    assert.equal(all.length, 3)
    const blankRow = all.find((row) => row.jobId === blankJob)
    assert.equal(blankRow?.stance, 'unknown')
    assert.notEqual(blankRow?.remoteKind, 'remote', '未识别的岗位不能被算成远程')
    assert.equal(blankRow?.title, '前端工程师')
    assert.equal(blankRow?.companyName, '腾讯科技（深圳）有限公司')
  })
})
