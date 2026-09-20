/**
 * jobs 领域服务（§4.3）。
 *
 * 入口层（http / tools）只做协议转换，一切筛选、分页、状态流转都在这里。
 * 返回的一律是标量 JSON DTO（§4.3 P7）。
 *
 * P4 起 `query` / `detail` 会带上**标注类型**与**匹配分**，
 * `detailFull` 还会带出完整依据 —— 界面上任何一个分数与徽章都要能回答「凭什么」。
 */
import type { CompanyProfileDto, JobDetailDto, JobDto, JobFacetsDto, JobFlagDto, JobViewsDto } from '../../shared/contract/dto/job.js'
import { JOB_STATES, type JobFlagType, type JobState } from '../../shared/contract/enums/job.js'
import { jobViewsOf, saveJobViews } from './job-views.js'
import type { JobQuery, JobUpsertInput, MatchStamp } from '../store/repo/jobs.js'
import type { Store } from '../store/store.js'
import { DomainError } from '../util/errors.js'

export interface JobServiceOptions {
  /**
   * 当前启用简历的 `{resumeId, rev}`。
   *
   * 由装配点注入而不是让 jobs 去依赖 resume 服务：匹配分与简历确实是耦合的，
   * 但耦合点应该只有一个函数，而不是让两个领域服务互相 import。
   */
  scoreStamp?: () => { resumeId: number | null; rev: number }
}

export interface JobService {
  query(filters?: JobQuery, limit?: number, offset?: number): JobDto[]
  detail(id: number): JobDto
  /** 详情 + 标注依据 + 匹配理由 + 公司画像（P4）。 */
  detailFull(id: number): JobDetailDto
  /** 收藏 / 忽略 / 归档。 */
  mark(id: number, state: JobState): JobDto
  latest(limit?: number): JobDto[]
  count(): number
  /** 与 `query` 同一套筛选条件的计数（分页 total）。 */
  countMatching(filters?: JobQuery): number
  countByState(): Record<string, number>
  /** 筛选器的取值集：城市 / 经验 / 学历（界面渲染多选 chips 用）。 */
  facets(): JobFacetsDto
  /** 供采集层写入；重复跑按 `(platform, platformJobId)` 幂等。 */
  upsert(input: JobUpsertInput, now: string): { id: number; outcome: 'inserted' | 'updated' }
  /**
   * 保存的筛选视图（第五轮，批次 B2）：整体读。
   *
   * 与岗位查询无关，但它是**岗位库这个屏的偏好**，放这里是为了让入口层（路由）
   * 只依赖一个服务；规范化与校验在 `job-views.ts` 里（读到宽容、写到严格）。
   */
  jobViews(): JobViewsDto
  /** 保存的筛选视图：整体覆盖写（幂等）；非法内容显式报错。 */
  saveJobViews(payload: unknown, now: string): JobViewsDto
}

export function createJobService(store: Store, options: JobServiceOptions = {}): JobService {
  /**
   * 当前启用简历的标识。**每次都现算**而不是缓存 —— 缓存一份就可能与数据库不一致，
   * 而"分数是否过期"判断错了，用户看到的就是一个自信的错数字（§4.1）。
   */
  const stampOf = (): MatchStamp | undefined => options.scoreStamp?.()

  /** 标注类型 + 分数过期判定一起补上。 */
  const decorate = (items: JobDto[]): JobDto[] => {
    if (items.length === 0) return items
    const byJob = store.flag.listTypesForJobs(items.map((item) => item.id))
    const stamp = stampOf()
    return items.map((item) => ({
      ...item,
      flagTypes: byJob.get(item.id) ?? [],
      scoreStale:
        stamp !== undefined &&
        item.matchScore !== null &&
        (item.scoreRev !== stamp.rev || item.scoreResumeId !== stamp.resumeId),
    }))
  }

  const jobWithFlags = (id: number): JobDto => {
    const job = store.job.detail(id)
    if (job === undefined) {
      throw new DomainError('NOT_FOUND', `岗位不存在：${String(id)}`, { detail: { id } })
    }
    return decorate([job])[0] ?? job
  }

  const companyProfileOf = (companyId: number | null): CompanyProfileDto | null => {
    if (companyId === null) return null
    const company = store.company.get(companyId)
    if (company === undefined) return null
    const profile = store.company.getProfile(companyId)
    return {
      id: company.id,
      name: company.name,
      nameNorm: company.nameNorm,
      industry: company.industry,
      size: company.size,
      nature: company.nature,
      jobCount: profile?.jobCount ?? 0,
      geoSpread: profile?.geoSpread ?? 0,
      stackDiversity: profile?.stackDiversity ?? 0,
      onsiteRatio: profile?.onsiteRatio ?? null,
      nameKeywordHits: profile?.nameKeywordHits ?? 0,
      outsourcingScore: profile?.outsourcingScore ?? null,
      fraudScore: profile?.fraudScore ?? null,
      manualLabel: profile?.manualLabel ?? null,
      note: company.note,
      blacklisted: company.blacklisted,
    }
  }

  return {
    query(filters, limit, offset): JobDto[] {
      return decorate(store.job.query(filters ?? {}, limit, offset))
    },

    detail: jobWithFlags,

    detailFull(id): JobDetailDto {
      const job = jobWithFlags(id)
      const flags: JobFlagDto[] = store.flag.listByJob(id).map((record) => ({
        flagType: record.flagType,
        score: record.score,
        evidence: record.evidence,
        computedAt: record.computedAt,
      }))
      const reasons = store.job.matchReasons(id)
      // 存的是 `string | null`，但空串与"没抓到"在界面上是同一件事 —— 统一收敛成 null，
      // 免得界面要同时判 `null` 与 `''` 两种空。
      const rawJd = store.job.jdText(id)
      const jdText = rawJd === null || rawJd.trim() === '' ? null : rawJd
      return { job, jdText, flags, matchReasons: reasons, company: companyProfileOf(job.companyId) }
    },

    mark(id, state): JobDto {
      if (!JOB_STATES.includes(state)) {
        throw new DomainError('INVALID_INPUT', `非法岗位状态：${String(state)}`, {
          hint: `合法取值：${JOB_STATES.join(' / ')}`,
        })
      }
      const changed = store.job.mark(id, state)
      if (!changed) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(id)}`, { detail: { id } })
      }
      return jobWithFlags(id)
    },

    latest(limit): JobDto[] {
      return decorate(store.job.latest(limit))
    },

    count(): number {
      return store.job.count()
    },

    countMatching(filters): number {
      return store.job.countMatching(filters ?? {})
    },

    countByState(): Record<string, number> {
      return store.job.countByState()
    },

    facets(): JobFacetsDto {
      return {
        cities: store.job.listCities(),
        expReqs: store.job.listExpReqs(),
        eduReqs: store.job.listEduReqs(),
      }
    },

    upsert(input, now): { id: number; outcome: 'inserted' | 'updated' } {
      return store.job.upsert(input, now)
    },

    jobViews(): JobViewsDto {
      return jobViewsOf(store)
    },

    saveJobViews(payload, now): JobViewsDto {
      return saveJobViews(store, payload, now)
    },
  }
}

/** 标注类型的可读名（UI 与工具共用）。 */
export type { JobFlagType }
