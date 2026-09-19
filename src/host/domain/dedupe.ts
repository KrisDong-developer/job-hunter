/**
 * 跨平台岗位去重（§4.10.1 / SR-44）。
 *
 * ## 为什么单独一层，而不塞进 `crawl.ts`
 *
 * 抓取那一轮已经很长了（导航 → 风控 → 解析 → 字段断言 → 归一化 → 写库 → 打分）。
 * 去重是**可关的**（SR-44），塞进去会让"关掉去重"变成在抓取主链上插一个 `if`，
 * 而这一层真正的价值在于它的**保守规则**能被单独测：宁可保留两个岗位，
 * 也不要把两个真岗位合成一个 —— 合并之后投递记录会串，而且用户很难发现。
 *
 * ## 保守到什么程度
 *
 * * 只在**不同平台**之间做（同平台的幂等已经由 `UNIQUE(platform_id, platform_job_id)` 保证）；
 * * 公司归一化名、城市、薪资档**必须完全相同**（`compareJobs` 的前三条硬条件）；
 * * 标题相似度只作**确认**（阈值 0.9），不作主要依据；
 * * 判不出来就**不合并**，留给人看。
 */
import type { DedupGroupRepo } from '../store/repo/dedup-groups.js'
import type { JobDto } from '../../shared/contract/dto/job.js'
import { compareJobs, jobDedupeKey, type JobDedupeVerdict } from '../util/dedupe.js'

export interface DedupCandidate {
  id: number
  platformId: string
  /**
   * 公司 id（`null` = 还没归到公司实体上）。
   *
   * 候选是按公司取的（同一家公司的岗位才比），所以它必须在这里 ——
   * 少了它，候选构造器只能回头去查一次库，而那正是"两个调用方各写一份"的开始。
   */
  companyId: number | null
  companyName: string
  title: string
  salaryMin: number | null
  salaryMax: number | null
  city: string
}

export interface DedupOutcome {
  jobId: number
  /** 与之合并的组 id；没合并时为 null。 */
  groupId: number | null
  /** 与之合并（或疑似重复）的那个岗位；都没有时为 null。 */
  withJobId: number | null
  /** 判断依据（人话），无论合没合都给 —— 没合也要能解释"为什么没合"。 */
  basis: string
  /**
   * **疑似重复但未自动合并**（硬门槛全过、只有标题差一点）。
   *
   * 与 `merge: false` 的区别：后者是"确认不是同一个"，这里是"我拿不准，请你看一眼"。
   * 两者都**不合并**，但只有前者可以安心忽略。
   */
  candidate: boolean
}

/** 从 `JobDto` 取去重需要的字段（缺公司名就返回 undefined，表示不参与判断）。 */
export function dedupCandidateOf(job: JobDto): DedupCandidate | undefined {
  if (job.companyName === null || job.companyName.trim() === '') return undefined
  return {
    id: job.id,
    platformId: job.platformId,
    companyId: job.companyId,
    companyName: job.companyName,
    title: job.title,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    city: job.city,
  }
}

/**
 * 判断两个岗位是否应当合并（纯函数，便于离线断言）。
 *
 * 抽出来是因为「不同平台」这一条属于**策略**，而键比较属于**算法**：
 * `compareJobs` 不知道平台的存在，这里补上。
 */
export function shouldMerge(left: DedupCandidate, right: DedupCandidate): JobDedupeVerdict {
  if (left.id === right.id) return { merge: false, basis: '同一个岗位', score: 0, candidate: false }
  if (left.platformId === right.platformId) {
    return {
      merge: false,
      basis: '同平台内不做去重（幂等已由平台内唯一键保证）',
      score: 0,
      candidate: false,
    }
  }
  return compareJobs(
    jobDedupeKey({
      companyName: left.companyName,
      title: left.title,
      salaryMin: left.salaryMin,
      salaryMax: left.salaryMax,
      city: left.city,
    }),
    jobDedupeKey({
      companyName: right.companyName,
      title: right.title,
      salaryMin: right.salaryMin,
      salaryMax: right.salaryMax,
      city: right.city,
    }),
  )
}

export interface DedupDeps {
  dedupGroup: DedupGroupRepo
  /** 找候选：同一家公司的其它岗位（由调用方提供，避免这一层依赖仓储细节）。 */
  candidatesFor(job: DedupCandidate): DedupCandidate[]
}

/**
 * 对一个岗位跑一次去重判定：命中就并入已有分组或新建分组。
 *
 * **不抛错**：去重失败绝不能让它影响刚抓到的数据 —— 岗位已经在库里了，
 * 少一个分组只是"少一点便利"，而抛错会让整轮抓取显示成失败。
 */
export function applyDedup(deps: DedupDeps, job: DedupCandidate, now: string): DedupOutcome {
  const candidates = deps.candidatesFor(job)
  /** 拿不准的那个（相似度最高的一个）——只在**没有**可合并对象时才值得一提。 */
  let doubtful: { candidate: DedupCandidate; basis: string; score: number } | null = null

  for (const candidate of candidates) {
    const verdict = shouldMerge(job, candidate)
    if (!verdict.merge) {
      if (verdict.candidate && (doubtful === null || verdict.score > doubtful.score)) {
        doubtful = { candidate, basis: verdict.basis, score: verdict.score }
      }
      continue
    }

    const existing = deps.dedupGroup.findByJob(candidate.id)
    if (existing === undefined) {
      const groupId = deps.dedupGroup.create(
        {
          primaryJobId: candidate.id,
          memberIds: [candidate.id, job.id],
          basis: verdict.basis,
          score: verdict.score,
        },
        now,
      )
      return { jobId: job.id, groupId, withJobId: candidate.id, basis: verdict.basis, candidate: false }
    }
    deps.dedupGroup.addMember(existing.id, job.id)
    return {
      jobId: job.id,
      groupId: existing.id,
      withJobId: candidate.id,
      basis: verdict.basis,
      candidate: false,
    }
  }

  // 没合并，但有一个"拿不准"的：如实报出来（不合并是对的，但用户得知道有这么一回事）
  if (doubtful !== null) {
    return {
      jobId: job.id,
      groupId: null,
      withJobId: doubtful.candidate.id,
      basis: doubtful.basis,
      candidate: true,
    }
  }

  return {
    jobId: job.id,
    groupId: null,
    withJobId: null,
    basis: '没有找到可合并的跨平台重复岗位',
    candidate: false,
  }
}
