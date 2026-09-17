/**
 * 情报引擎（P4 / §4.3 companies + §4.5.1 L1）。
 *
 * 三件事，全部**纯规则**：
 *   1. **岗位标注**（外包 / 诈骗 / 僵尸 / 薪资虚标 / 黑话）—— 每条标注必须带**可读依据**；
 *   2. **公司画像打分**（外包分 / 诈骗分 / 名称关键词命中）—— 依据累积在 `company_signal`；
 *   3. **L1 可解释匹配**（硬条件 + 关键词命中率）—— 产出分数与逐条理由。
 *
 * **L2（LLM 精评）不在 P4 范围内**：那需要 `ctx.llm` 接线、隐私闸门与注入防御，
 * 属于后续阶段。这里明确只做规则，并且界面上会标「粗筛分」，不冒充完整评估。
 */
import type { JobFlagInput, JobFlagType } from '../store/repo/flags.js'
import type { CompanyProfileRecord } from '../store/repo/companies.js'
import type { DictionaryEntry } from '../store/repo/dictionary.js'
import type { Store } from '../store/store.js'
import { DICTIONARY_SEED } from './dictionary-seed.js'
import { parseSalary } from '../util/salary.js'
import { describeHit, matchTerms, type TermHit } from '../util/text.js'

// ── 岗位标注 ────────────────────────────────────────────────────────

/** 僵尸岗位的判定阈值：发布时间超过这么多天还在列表里出现。 */
export const ZOMBIE_PUBLISH_DAYS = 60

/** 薪资虚标的跨度阈值：上限 / 下限。 */
export const SALARY_SPAN_RATIO = 2

/** 公司名里的外包标记词（比 JD 正文里的更可信 —— 名字就写着的）。 */
export const OUTSOURCING_NAME_MARKERS = [
  '人力资源',
  '人才服务',
  '劳务',
  '外包',
  '派遣',
  '服务外包',
] as const

export interface JobIntelInput {
  job: {
    title: string
    city: string
    salaryRaw: string
    salaryMin: number | null
    salaryMax: number | null
    tags: string[]
    publishedAt: string | null
    lastSeenAt: string
  }
  jdText: string | null
  companyName: string | null
  companyProfile?: CompanyProfileRecord | undefined
  entries: readonly DictionaryEntry[]
  now: Date
}

/** 分数上限，避免一个啰嗦的 JD 刷出满分。 */
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function sumWeights(hits: readonly TermHit[]): number {
  return hits.reduce((total, hit) => total + hit.weight, 0)
}

/**
 * 给一个岗位算标注。
 *
 * 关键约束：**没有依据的结论一律不产出**。每个分支在 push 之前都必须先攒到至少一条
 * evidence，否则整条标注被丢掉 —— 这直接兑现「不得有无依据的结论」。
 */
export function evaluateJobFlags(input: JobIntelInput): JobFlagInput[] {
  const { job, jdText, companyName, companyProfile, entries, now } = input
  const haystack = [job.title, jdText ?? '', job.tags.join(' ')].join('\n')
  const hits = matchTerms(haystack, entries)

  const byKind = (kind: string): TermHit[] => hits.filter((hit) => hit.kind === kind)
  const flags: JobFlagInput[] = []

  const push = (type: JobFlagType, score: number, evidence: string[]): void => {
    // 铁律：没有依据就不产出结论
    if (evidence.length === 0) return
    flags.push({ type, score: clampScore(score), evidence })
  }

  // ── 黑话命中 ──────────────────────────────────────────────────────
  const jargon = byKind('jargon')
  push('jargon_hit', sumWeights(jargon) * 12, jargon.map(describeHit))

  // ── 外包 ──────────────────────────────────────────────────────────
  {
    const evidence = byKind('outsourcing').map(describeHit)
    const name = companyName ?? ''
    const nameHits = OUTSOURCING_NAME_MARKERS.filter((marker) => name.includes(marker))
    for (const marker of nameHits) evidence.push(`公司名含「${marker}」`)
    if (companyProfile !== undefined && companyProfile.jobCount >= 3 && companyProfile.onsiteRatio !== null) {
      if (companyProfile.onsiteRatio >= 0.6) {
        evidence.push(
          `该公司在手的 ${String(companyProfile.jobCount)} 个岗位里，` +
            `${String(Math.round(companyProfile.onsiteRatio * 100))}% 提到驻场/现场`,
        )
      }
    }
    const score = sumWeights(byKind('outsourcing')) * 15 + nameHits.length * 20
    push('outsourcing', score, evidence)
  }

  // ── 诈骗 / 高风险 ─────────────────────────────────────────────────
  {
    const fraudHits = byKind('fraud')
    const evidence = fraudHits.map(describeHit)
    // 组合规则：高薪 + 「无门槛」话术同时出现，风险明显更高
    const noBarrier = fraudHits.some((hit) => /无经验|无需经验|年龄不限/.test(hit.term))
    if (noBarrier && job.salaryMin !== null && job.salaryMin >= 15000) {
      evidence.push(
        `同时出现「无门槛」话术与 ${String(job.salaryMin)} 元起的标称薪资 —— 两者并存是典型高风险特征`,
      )
    }
    push('fraud', sumWeights(fraudHits) * 18 + (noBarrier ? 10 : 0), evidence)
  }

  // ── 僵尸岗位 ──────────────────────────────────────────────────────
  {
    const evidence = byKind('zombie').map(describeHit)
    if (job.publishedAt !== null) {
      const published = new Date(job.publishedAt)
      const ageDays = Math.floor((now.getTime() - published.getTime()) / (24 * 60 * 60 * 1000))
      if (Number.isFinite(ageDays) && ageDays > ZOMBIE_PUBLISH_DAYS) {
        evidence.push(
          `岗位发布于 ${String(ageDays)} 天前（超过 ${String(ZOMBIE_PUBLISH_DAYS)} 天）却仍在列表中，` +
            '可能并不真的在招',
        )
      }
    }
    push('zombie', byKind('zombie').length * 20 + (evidence.length > 0 ? 15 : 0), evidence)
  }

  // ── 薪资虚标 ──────────────────────────────────────────────────────
  {
    const salaryHits = byKind('salary')
    const evidence = salaryHits.map(describeHit)
    const salary = parseSalary(job.salaryRaw)
    if (salary.min !== null && salary.max !== null && salary.min > 0) {
      const span = salary.max / salary.min
      if (span >= SALARY_SPAN_RATIO && salary.max >= 20000) {
        evidence.push(
          `标称区间跨度 ${span.toFixed(1)} 倍（${String(salary.min)}-${String(salary.max)} 元/月），上限往往不可达`,
        )
      }
    }
    push('salary_inflation', sumWeights(salaryHits) * 18, evidence)
  }

  return flags
}

// ── L1 可解释匹配 ───────────────────────────────────────────────────

/**
 * 求职偏好（L1 打分的输入）。
 *
 * 目前来自 `setting` 的 `match-profile`。**P6 会改成由简历派生** ——
 * 那时这份结构就是简历的投影，规则本身不用动。
 */
export interface MatchProfile {
  /** 期望城市；空数组表示不限。 */
  cities: string[]
  /** 期望月薪下限（元）。 */
  minSalary: number | null
  /** 期望命中的技能/方向关键词。 */
  keywords: string[]
  /** 命中即**硬排除**的词。 */
  excludeKeywords: string[]
}

export const DEFAULT_MATCH_PROFILE: MatchProfile = {
  cities: [],
  minSalary: null,
  keywords: [],
  excludeKeywords: [],
}

export interface MatchReason {
  kind: 'hit' | 'miss' | 'penalty' | 'exclude' | 'unknown'
  text: string
  weight: number
}

export interface MatchOutcome {
  score: number
  reasons: MatchReason[]
}

export interface MatchInput {
  job: {
    title: string
    city: string
    salaryRaw: string
    salaryMin: number | null
    tags: string[]
  }
  jdText: string | null
  profile: MatchProfile
}

/**
 * L1 粗筛：**纯规则**，全量适用、零成本（§4.5.1）。
 *
 * 结果必须自带理由：用户看到 62 分时要能立刻知道"为什么不是 80"。
 * 返回的 `reasons` **永不为空** —— 一句「无明显匹配信号」也比一片空白强。
 */
export function scoreJobMatch(input: MatchInput): MatchOutcome {
  const { job, jdText, profile } = input
  const haystack = [job.title, job.tags.join(' '), jdText ?? ''].join('\n').toLowerCase()
  const reasons: MatchReason[] = []
  let score = 50

  // 硬排除：命中即出局，且必须说明是哪个词
  const excluded = profile.excludeKeywords.filter(
    (keyword) => keyword !== '' && haystack.includes(keyword.toLowerCase()),
  )
  if (excluded.length > 0) {
    for (const keyword of excluded) {
      reasons.push({ kind: 'exclude', text: `命中排除词「${keyword}」`, weight: -50 })
    }
    return { score: 0, reasons }
  }

  // 城市
  if (profile.cities.length > 0) {
    if (profile.cities.includes(job.city)) {
      score += 15
      reasons.push({ kind: 'hit', text: `城市匹配（${job.city}）`, weight: 15 })
    } else {
      score -= 20
      reasons.push({ kind: 'penalty', text: `城市不在期望范围（${job.city}）`, weight: -20 })
    }
  }

  // 薪资
  if (profile.minSalary !== null) {
    if (job.salaryMin === null) {
      reasons.push({ kind: 'unknown', text: `薪资为「${job.salaryRaw}」，无法判断是否达标`, weight: 0 })
    } else if (job.salaryMin >= profile.minSalary) {
      score += 15
      reasons.push({
        kind: 'hit',
        text: `月薪下限 ${String(job.salaryMin)} ≥ 期望 ${String(profile.minSalary)}`,
        weight: 15,
      })
    } else {
      score -= 10
      reasons.push({
        kind: 'penalty',
        text: `月薪下限 ${String(job.salaryMin)} < 期望 ${String(profile.minSalary)}`,
        weight: -10,
      })
    }
  }

  // 技能关键词命中率
  if (profile.keywords.length > 0) {
    let matched = 0
    for (const keyword of profile.keywords) {
      if (keyword === '') continue
      if (haystack.includes(keyword.toLowerCase())) {
        matched += 1
        reasons.push({ kind: 'hit', text: `命中期望技能「${keyword}」`, weight: 6 })
      }
    }
    const bonus = Math.min(24, matched * 6)
    score += bonus
    const missed = profile.keywords.filter((keyword) => !haystack.includes(keyword.toLowerCase()))
    if (missed.length > 0) {
      reasons.push({
        kind: 'miss',
        text: `未命中期望技能：${missed.join('、')}`,
        weight: 0,
      })
    }
  }

  if (reasons.length === 0) {
    reasons.push({ kind: 'unknown', text: '没有设置偏好，仅凭规则无法给出更细的理由', weight: 0 })
  }

  return { score: clampScore(score), reasons }
}

// ── 服务 ────────────────────────────────────────────────────────────

export interface JobIntelResult {
  jobId: number
  flags: JobFlagInput[]
  match: MatchOutcome
}

export interface IntelService {
  /** 幂等播种内置词表。 */
  seedDictionary(): number
  matchProfile(): MatchProfile
  /** 重算一个岗位的标注与匹配分，并落库。 */
  evaluateJob(jobId: number, now: string): JobIntelResult | null
  /** 重算公司画像（统计量 + 由信号聚合出的分数）。 */
  recomputeCompany(companyId: number, now: string): CompanyProfileRecord
}

export interface IntelServiceOptions {
  /**
   * 从**当前简历**派生求职偏好（P6）。
   *
   * 为什么简历要参与匹配偏好：简历是用户对自己能力最诚实的声明 ——
   * 技能列表就是他"想被匹配到"的关键词，城市就是他能接受的地点。
   * 之前只有"搜索方案"这一个来源，等于让一次抓取的关键词代表了全部偏好。
   */
  resumeProfile?: () => Partial<MatchProfile> | undefined
  /** 算分时用的简历版本标识，跟着分数一起写（§4.1）。 */
  scoreStamp?: () => { resumeId: number | null; rev: number }
}

export function createIntelService(
  store: Store,
  clock: () => string,
  options: IntelServiceOptions = {},
): IntelService {
  /**
   * 读求职偏好，四级来源（前面的赢）：
   *   1. `setting` 里显式设置的 `match-profile`（用户自己配的，最权威）；
   *   2. **从当前简历派生**（P6）：技能 → 关键词、城市 → 城市；
   *   3. 从搜索方案派生 —— 方案本身就是一次意图声明（"深圳 Java" 就是偏好）；
   *   4. 默认空偏好（此时分数恒为中性 50，理由会如实写「没有设置偏好」）。
   *
   * 第 3 条是避免"功能看着有、实际永远 50 分"的务实做法；
   * 第 2 条比它更靠前，因为**简历是用户资产，方案只是一次抓取的参数**。
   */
  const readProfile = (): MatchProfile => {
    const stored = store.setting.get<Partial<MatchProfile>>('match-profile', 'global', '')
    if (stored !== undefined) {
      return {
        cities: Array.isArray(stored.cities) ? stored.cities : [],
        minSalary: typeof stored.minSalary === 'number' ? stored.minSalary : null,
        keywords: Array.isArray(stored.keywords) ? stored.keywords : [],
        excludeKeywords: Array.isArray(stored.excludeKeywords) ? stored.excludeKeywords : [],
      }
    }

    const fromResume = options.resumeProfile?.()
    if (fromResume !== undefined && ((fromResume.keywords?.length ?? 0) > 0 || (fromResume.cities?.length ?? 0) > 0)) {
      return {
        cities: fromResume.cities ?? [],
        minSalary: fromResume.minSalary ?? null,
        keywords: fromResume.keywords ?? [],
        excludeKeywords: fromResume.excludeKeywords ?? [],
      }
    }

    const plans = store.plan.list()
    const plan = plans.find((item) => item.enabled) ?? plans[0]
    if (plan === undefined) return DEFAULT_MATCH_PROFILE
    const city = typeof plan.criteria['city'] === 'string' ? plan.criteria['city'] : ''
    const keyword = typeof plan.criteria['keyword'] === 'string' ? plan.criteria['keyword'] : ''
    return {
      cities: city === '' ? [] : [city],
      minSalary: null,
      keywords: keyword === '' ? [] : [keyword],
      excludeKeywords: [],
    }
  }

  const evaluateJob = (jobId: number, now: string): JobIntelResult | null => {
    const job = store.job.detail(jobId)
    if (job === undefined) return null

    const jdText = store.job.jdText(jobId)
    const companyProfile =
      job.companyId === null ? undefined : store.company.getProfile(job.companyId)
    const entries = store.dictionary.list()
    const at = new Date(now)

    const flags = evaluateJobFlags({
      job: {
        title: job.title,
        city: job.city,
        salaryRaw: job.salaryRaw,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        tags: job.tags,
        publishedAt: job.publishedAt,
        lastSeenAt: job.lastSeenAt,
      },
      jdText,
      companyName: job.companyName,
      companyProfile,
      entries,
      now: at,
    })
    store.flag.replace(jobId, flags, now)

    const match = scoreJobMatch({
      job: {
        title: job.title,
        city: job.city,
        salaryRaw: job.salaryRaw,
        salaryMin: job.salaryMin,
        tags: job.tags,
      },
      jdText,
      profile: readProfile(),
    })
    store.job.setMatch(jobId, match.score, match.reasons, options.scoreStamp?.())

    return { jobId, flags, match }
  }

  const recomputeCompany = (companyId: number, now: string): CompanyProfileRecord => {
    const company = store.company.get(companyId)
    if (company === undefined) {
      throw new Error(`公司不存在：${String(companyId)}`)
    }

    // 统计量（岗位数 / 技术栈广度 / 地域跨度 / 驻场比例）
    const profile = store.company.recomputeProfile(companyId, now)

    // 名称关键词命中：公司名里就写着「人力资源」「外包」这种，比 JD 正文更可信
    const nameHits = OUTSOURCING_NAME_MARKERS.filter((marker) => company.name.includes(marker))

    // 由累积信号聚合出分数（P4 只累积规则信号；人工确认的标签优先级更高）
    store.signal.clearBySource(companyId, 'rule')
    for (const marker of nameHits) {
      store.signal.addOnce(
        {
          companyId,
          type: 'name-keyword',
          evidence: { marker, name: company.name },
          weight: 25,
          source: 'rule',
        },
        now,
      )
    }
    if (profile.jobCount >= 3 && profile.onsiteRatio !== null && profile.onsiteRatio >= 0.6) {
      store.signal.addOnce(
        {
          companyId,
          type: 'onsite-heavy',
          evidence: { onsiteRatio: profile.onsiteRatio, jobCount: profile.jobCount },
          weight: 30,
          source: 'rule',
        },
        now,
      )
    }

    const signals = store.signal.listByCompany(companyId)
    const outsourcingScore = Math.min(
      100,
      signals
        .filter((signal) => signal.type === 'name-keyword' || signal.type === 'onsite-heavy')
        .reduce((total, signal) => total + signal.weight, 0),
    )
    const fraudScore = Math.min(
      100,
      signals.filter((signal) => signal.type === 'fraud').reduce((total, signal) => total + signal.weight, 0),
    )

    return store.company.updateScores(
      companyId,
      { nameKeywordHits: nameHits.length, outsourcingScore, fraudScore },
      now,
    )
  }

  return {
    seedDictionary(): number {
      return store.dictionary.ensureSeed(DICTIONARY_SEED)
    },
    matchProfile: readProfile,
    evaluateJob,
    recomputeCompany,
  }
}

/** 供上层渲染依据用。 */
export function describeReasons(reasons: readonly MatchReason[]): string[] {
  return reasons.map(
    (reason) => `${reason.kind === 'penalty' || reason.kind === 'exclude' ? '−' : '+'} ${reason.text}`,
  )
}
