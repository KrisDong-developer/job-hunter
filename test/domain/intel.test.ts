import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DICTIONARY_SEED } from '../../src/host/domain/dictionary-seed.js'
import {
  DEFAULT_MATCH_PROFILE,
  ZOMBIE_PUBLISH_DAYS,
  createIntelService,
  evaluateJobFlags,
  resumeProfileOf,
  scoreJobMatch,
  type JobIntelInput,
} from '../../src/host/domain/intel.js'
import type { ResumeService } from '../../src/host/domain/resumes.js'
import { emptyResumeContent, type ResumeContent } from '../../src/shared/domain/resume-content.js'
import type { DictionaryEntry } from '../../src/host/store/repo/dictionary.js'
import type { JobUpsertInput } from '../../src/host/store/repo/jobs.js'
import { cleanup, openTestStore, tempDataDir } from '../support/store.js'

const T1 = '2026-09-16T01:00:00.000Z'
const NOW = new Date('2026-09-16T01:00:00.000Z')

/** 用真实播种词表构造条目，避免测试与词表内容脱节。 */
function seededEntries(store: ReturnType<typeof openTestStore>): DictionaryEntry[] {
  store.dictionary.ensureSeed(DICTIONARY_SEED)
  return store.dictionary.list()
}

function intelInput(overrides: Partial<JobIntelInput['job']> = {}, extra: Partial<JobIntelInput> = {}): JobIntelInput {
  return {
    job: {
      title: 'Java开发工程师',
      city: '深圳',
      salaryRaw: '20-30K',
      salaryMin: 20000,
      salaryMax: 30000,
      tags: ['java', 'spring'],
      publishedAt: '2026-09-10T00:00:00.000Z',
      lastSeenAt: T1,
      ...overrides,
    },
    jdText: '负责后端服务开发。',
    companyName: '某某科技有限公司',
    entries: [],
    now: NOW,
    ...extra,
  }
}

// ── 匹配偏好：从简历派生（§4.5.1）──────────────────────────────────

/**
 * 结构化的假 ResumeService：`resumeProfileOf` 只读 `list()` 与 `get()`。
 *
 * 用假件而不是真简历库：这条规则的输入就是"当前那份简历的内容"，
 * 为它建一份真简历（还要 filesDir / pdf / ai）只会让测试变慢，
 * 并把真正的输入（内容）埋进一堆无关的构造里。
 */
function fakeResumes(current: { isDefault: boolean; state: string; content: ResumeContent } | null): ResumeService {
  return {
    list: () => (current === null ? [] : [{ id: 1, isDefault: current.isDefault, state: current.state }]),
    get: () => ({ content: current?.content }),
  } as unknown as ResumeService
}

function resumeContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    ...emptyResumeContent(),
    basics: { name: '张三', title: '前端/Node', city: '深圳' },
    skills: [{ name: 'react' }, { name: 'node' }, { name: 'react' }],
    ...overrides,
  }
}

test('resumeProfileOf：从当前启用简历派生关键词与城市（去重、有上限）', () => {
  const active = { isDefault: true, state: 'active', content: resumeContent() }
  const profile = resumeProfileOf(fakeResumes(active))
  assert.ok(profile !== undefined)
  // 技能去重后在前，标题按分隔符拆词在后；大小写不同的词**不合并**（Node ≠ node）
  assert.deepEqual(profile.keywords, ['react', 'node', '前端', 'Node'])
  assert.deepEqual(profile.cities, ['深圳'])
})

test('resumeProfileOf：没有"当前简历"时返回 undefined（不是抛错）', () => {
  // 三种"没有"都要安静地退回"没有偏好"，否则岗位列表会跟着挂掉
  assert.equal(resumeProfileOf(fakeResumes(null)), undefined, '一份简历都没有')
  assert.equal(
    resumeProfileOf(fakeResumes({ isDefault: false, state: 'active', content: resumeContent() })),
    undefined,
    '非默认的那份不算当前简历',
  )
  assert.equal(
    resumeProfileOf(fakeResumes({ isDefault: true, state: 'archived', content: resumeContent() })),
    undefined,
    '归档的那份不算当前简历',
  )
})

test('resumeProfileOf：没填城市 = 不限城市（空数组，不是 null）', () => {
  const content = resumeContent({ basics: { name: '张三', title: '前端' } })
  const profile = resumeProfileOf(fakeResumes({ isDefault: true, state: 'active', content }))
  assert.ok(profile !== undefined)
  assert.deepEqual(profile.cities, [])
  assert.deepEqual(profile.keywords, ['react', 'node', '前端'])
})

// ── 标注：每条结论都必须有依据 ───────────────────────────────────────

test('干净的岗位不产出任何标注（不硬凑结论）', () => {
  const store = openTestStore()
  try {
    const flags = evaluateJobFlags(intelInput({}, { entries: seededEntries(store) }))
    assert.deepEqual(flags, [])
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('黑话命中：给出解释，而不是只报一个分数', () => {
  const store = openTestStore()
  try {
    const flags = evaluateJobFlags(
      intelInput({}, { entries: seededEntries(store), jdText: '要求抗压能力强，弹性工作制。' }),
    )
    const jargon = flags.find((flag) => flag.type === 'jargon_hit')
    assert.ok(jargon)
    assert.ok(jargon.score > 0)
    assert.equal(jargon.evidence.length, 2)
    assert.ok(jargon.evidence.some((line) => line.includes('抗压能力强')))
    assert.ok(jargon.evidence.some((line) => line.includes('通常意味着加班多')))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('外包：JD 文本 + 公司名关键词，两条依据都要列出来', () => {
  const store = openTestStore()
  try {
    const flags = evaluateJobFlags(
      intelInput(
        {},
        {
          entries: seededEntries(store),
          jdText: '本岗位为驻场开发，与第三方签订劳动合同。',
          companyName: '某某人力资源服务有限公司',
        },
      ),
    )
    const outsourcing = flags.find((flag) => flag.type === 'outsourcing')
    assert.ok(outsourcing)
    assert.ok(outsourcing.evidence.some((line) => line.includes('驻场')))
    assert.ok(outsourcing.evidence.some((line) => line.includes('公司名含「人力资源」')))
    assert.ok(outsourcing.score >= 60)
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('外包：公司维度的统计依据（驻场比例）也会被引用', () => {
  const store = openTestStore()
  try {
    const flags = evaluateJobFlags(
      intelInput(
        {},
        {
          entries: seededEntries(store),
          jdText: '驻场开发。',
          companyProfile: {
            companyId: 1,
            jobCount: 5,
            stackDiversity: 3,
            geoSpread: 1,
            onsiteRatio: 0.8,
            nameKeywordHits: 0,
            outsourcingScore: null,
            fraudScore: null,
            manualLabel: null,
            updatedAt: T1,
          },
        },
      ),
    )
    const outsourcing = flags.find((flag) => flag.type === 'outsourcing')
    assert.ok(outsourcing)
    assert.ok(outsourcing.evidence.some((line) => line.includes('80%')))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('诈骗：高薪 + 无门槛话术的组合会被单独点出来', () => {
  const store = openTestStore()
  try {
    const flags = evaluateJobFlags(
      intelInput(
        { salaryRaw: '20-40K', salaryMin: 20000, salaryMax: 40000 },
        { entries: seededEntries(store), jdText: '无需经验，当天入职，收押金。' },
      ),
    )
    const fraud = flags.find((flag) => flag.type === 'fraud')
    assert.ok(fraud)
    assert.ok(fraud.evidence.some((line) => line.includes('押金')))
    assert.ok(fraud.evidence.some((line) => line.includes('两者并存是典型高风险特征')))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('僵尸岗位：发布时间过久仍在列表里', () => {
  const store = openTestStore()
  try {
    const old = new Date(NOW.getTime() - (ZOMBIE_PUBLISH_DAYS + 10) * 24 * 60 * 60 * 1000).toISOString()
    const flags = evaluateJobFlags(intelInput({ publishedAt: old }, { entries: seededEntries(store) }))
    const zombie = flags.find((flag) => flag.type === 'zombie')
    assert.ok(zombie)
    assert.ok(zombie.evidence.some((line) => line.includes('天前')))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('薪资虚标：提成话术 + 极端跨度', () => {
  const store = openTestStore()
  try {
    const flags = evaluateJobFlags(
      intelInput(
        { salaryRaw: '10-40K', salaryMin: 10000, salaryMax: 40000 },
        { entries: seededEntries(store), jdText: '底薪+提成，上不封顶。' },
      ),
    )
    const salary = flags.find((flag) => flag.type === 'salary_inflation')
    assert.ok(salary)
    assert.ok(salary.evidence.some((line) => line.includes('上不封顶')))
    assert.ok(salary.evidence.some((line) => line.includes('区间跨度')))
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

test('★ 出口标准：任何标注都必须有可读依据', () => {
  const store = openTestStore()
  try {
    const entries = seededEntries(store)
    const samples: JobIntelInput['job'][] = [
      { title: 'A', city: '深圳', salaryRaw: '面议', salaryMin: null, salaryMax: null, tags: [], publishedAt: null, lastSeenAt: T1 },
      { title: 'B', city: '深圳', salaryRaw: '20-30K', salaryMin: 20000, salaryMax: 30000, tags: [], publishedAt: T1, lastSeenAt: T1 },
      { title: 'C', city: '北京', salaryRaw: '10-40K', salaryMin: 10000, salaryMax: 40000, tags: ['驻场'], publishedAt: null, lastSeenAt: T1 },
    ]
    for (const job of samples) {
      const flags = evaluateJobFlags(intelInput(job, { entries, jdText: '驻场，抗压能力强，押金。' }))
      for (const flag of flags) {
        assert.ok(flag.evidence.length > 0, `${flag.type} 没有依据却产出了结论`)
        assert.ok(
          flag.evidence.every((line) => typeof line === 'string' && line.trim() !== ''),
          `${flag.type} 的依据里有空字符串`,
        )
      }
      assert.ok(flags.length > 0)
    }
  } finally {
    const dir = store.dataDir
    store.close()
    cleanup(dir)
  }
})

// ── L1 匹配：分数必须可解释 ─────────────────────────────────────────

test('L1 打分：命中与失分逐条列出', () => {
  const outcome = scoreJobMatch({
    job: { title: 'Java开发工程师', city: '深圳', salaryRaw: '20-30K', salaryMin: 20000, tags: ['java', 'mysql'] },
    jdText: '负责后端服务开发',
    profile: { cities: ['深圳'], minSalary: 18000, keywords: ['java', 'mysql', 'kafka'], excludeKeywords: [] },
  })
  assert.ok(outcome.score > 50)
  assert.ok(outcome.reasons.some((reason) => reason.kind === 'hit' && reason.text.includes('城市匹配')))
  assert.ok(outcome.reasons.some((reason) => reason.kind === 'hit' && reason.text.includes('月薪下限')))
  assert.ok(outcome.reasons.some((reason) => reason.kind === 'miss' && reason.text.includes('kafka')))
})

test('L1 打分：排除词一票否决，并说明是哪个词', () => {
  const outcome = scoreJobMatch({
    job: { title: '外包Java开发', city: '深圳', salaryRaw: '20-30K', salaryMin: 20000, tags: [] },
    jdText: null,
    profile: { ...DEFAULT_MATCH_PROFILE, excludeKeywords: ['外包', '派遣'] },
  })
  assert.equal(outcome.score, 0)
  assert.equal(outcome.reasons[0]?.kind, 'exclude')
  assert.ok(outcome.reasons[0]?.text.includes('外包'))
})

test('L1 打分：薪资面议要如实说「无法判断」，不当作达标', () => {
  const outcome = scoreJobMatch({
    job: { title: 'Java', city: '深圳', salaryRaw: '面议', salaryMin: null, tags: [] },
    jdText: null,
    profile: { ...DEFAULT_MATCH_PROFILE, minSalary: 20000 },
  })
  const unknown = outcome.reasons.find((reason) => reason.kind === 'unknown')
  assert.ok(unknown)
  assert.ok(unknown.text.includes('无法判断'))
  assert.equal(outcome.reasons.some((reason) => reason.kind === 'hit' && reason.text.includes('月薪下限')), false)
})

test('L1 打分的理由永不为空', () => {
  const outcome = scoreJobMatch({
    job: { title: 'Java', city: '深圳', salaryRaw: '面议', salaryMin: null, tags: [] },
    jdText: null,
    profile: DEFAULT_MATCH_PROFILE,
  })
  assert.ok(outcome.reasons.length > 0)
  assert.equal(outcome.score, 50)
})

// ── 服务：落库与画像 ────────────────────────────────────────────────

function jobInput(overrides: Partial<JobUpsertInput> = {}): JobUpsertInput {
  return {
    platformId: '51job',
    platformJobId: 'j1',
    title: 'Java开发工程师',
    companyId: null,
    salaryRaw: '20-30K',
    salaryMin: 20000,
    salaryMax: 30000,
    salaryMonths: null,
    city: '深圳',
    district: '',
    expReq: '',
    eduReq: '',
    tags: ['java'],
    sourceUrl: 'https://example.com/j1',
    publishedAt: T1,
    ...overrides,
  }
}

test('evaluateJob 把标注与匹配分落库，重复调用幂等', () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const intel = createIntelService(store, () => T1)
    intel.seedDictionary()

    const written = store.job.upsert(
      jobInput({ tags: ['驻场'], jdText: '驻场开发，抗压能力强。' }),
      T1,
    )
    const first = intel.evaluateJob(written.id, T1)
    assert.ok(first)
    assert.ok(first.flags.length > 0)
    assert.equal(store.flag.listByJob(written.id).length, first.flags.length)

    // 再算一次不会翻倍（replace 语义）
    intel.evaluateJob(written.id, T1)
    assert.equal(store.flag.listByJob(written.id).length, first.flags.length)

    // 详情里能读回依据与理由
    const job = store.job.detail(written.id)
    assert.ok(job)
    assert.ok(store.job.matchReasons(written.id).length > 0)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('recomputeCompany 汇总名称关键词与驻场比例，分数有依据可查', () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const intel = createIntelService(store, () => T1)
    const company = store.company.ensure({ name: '某某人力资源服务有限公司', nameNorm: '某某' }, T1)

    for (let index = 0; index < 4; index += 1) {
      store.job.upsert(
        jobInput({
          platformJobId: `j${String(index)}`,
          companyId: company.id,
          tags: ['驻场'],
          jdText: '驻场开发',
          city: index < 2 ? '深圳' : '杭州',
        }),
        T1,
      )
    }

    const profile = intel.recomputeCompany(company.id, T1)
    assert.equal(profile.jobCount, 4)
    assert.equal(profile.geoSpread, 2)
    assert.equal(profile.onsiteRatio, 1)
    assert.equal(profile.nameKeywordHits, 1, '公司名命中「人力资源」')
    assert.ok((profile.outsourcingScore ?? 0) >= 50)

    // 分数必须能追到信号依据
    const signals = store.signal.listByCompany(company.id)
    assert.ok(signals.some((signal) => signal.type === 'name-keyword'))
    assert.ok(signals.some((signal) => signal.type === 'onsite-heavy'))
    for (const signal of signals) assert.notEqual(signal.evidence, null, '信号必须带依据')
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('公司画像冷启动时如实说「依据不足」，不硬给结论', () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const intel = createIntelService(store, () => T1)
    const company = store.company.ensure({ name: '某某科技有限公司', nameNorm: '某某科技' }, T1)
    const profile = intel.recomputeCompany(company.id, T1)

    assert.equal(profile.jobCount, 0)
    assert.equal(profile.onsiteRatio, null, '没有岗位时驻场比例是「未知」而不是 0')
    assert.equal(profile.nameKeywordHits, 0)
    assert.equal(profile.outsourcingScore, 0)
  } finally {
    store.close()
    cleanup(dir)
  }
})

test('词表播种幂等，且不覆盖用户改过的权重', () => {
  const dir = tempDataDir()
  const store = openTestStore(dir)
  try {
    const intel = createIntelService(store, () => T1)
    const added = intel.seedDictionary()
    assert.ok(added > 0, '首次应当播种')

    // 用户改权重
    const target = store.dictionary.list('jargon').find((entry) => entry.term === '弹性工作')
    assert.ok(target)
    store.dictionary.upsert({ kind: 'jargon', term: '弹性工作', meaning: target.meaning ?? '', weight: 9 })

    // 再播种不会覆盖
    assert.equal(intel.seedDictionary(), 0)
    const after = store.dictionary.list('jargon').find((entry) => entry.term === '弹性工作')
    assert.equal(after?.weight, 9, '播种不能覆盖用户改过的权重')
  } finally {
    store.close()
    cleanup(dir)
  }
})
