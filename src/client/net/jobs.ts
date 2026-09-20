/**
 * 岗位库：列表 / 筛选面 / 详情 / 处置态 / 查看历史。
 */
import type {
  JobDetailDto,
  JobDto,
  JobFacetsDto,
  JobPageDto,
  JobViewsDto,
} from '../../shared/contract/dto/job.js'
import type { StageEventDto } from '../../shared/contract/dto/pipeline.js'
import { ROUTE_PREFIX } from '../../shared/config/plugin.js'
import type { JobState } from '../../shared/contract/enums/job.js'
import type { ContactStage } from '../../shared/contract/enums/pipeline.js'
import { request } from './client.js'
import type { JobListParams } from '../../shared/contract/dto/job.js'

export async function fetchJobs(params: JobListParams, signal?: AbortSignal): Promise<JobPageDto> {
  const query = new URLSearchParams()
  if (params.q !== undefined && params.q !== '') query.set('q', params.q)
  if (params.cities !== undefined && params.cities.length > 0) query.set('cities', params.cities.join(','))
  else if (params.city !== undefined && params.city !== '') query.set('city', params.city)
  if (params.state !== undefined && params.state !== '') query.set('state', params.state)
  if (params.minSalary !== undefined && params.minSalary !== null) {
    query.set('minSalary', String(params.minSalary))
  }
  // 匹配分门槛（批次 A）：不传 = 不限；传了就等于"只看分数 ≥ 它的"。
  // 注意未打分的岗位不会被返回（见 `JobListParams.minScore` 的注释）。
  if (params.minScore !== undefined && params.minScore !== null) {
    query.set('minScore', String(params.minScore))
  }
  if (params.expReqs !== undefined && params.expReqs.length > 0) {
    query.set('expReqs', params.expReqs.join(','))
  }
  if (params.eduReqs !== undefined && params.eduReqs.length > 0) {
    query.set('eduReqs', params.eduReqs.join(','))
  }
  if (params.excludeFlags !== undefined && params.excludeFlags.length > 0) {
    query.set('excludeFlags', params.excludeFlags.join(','))
  }
  // 排除已拉黑公司（批次 B）：只在真的开着时传，服务端默认不过滤。
  if (params.excludeBlacklisted === true) query.set('excludeBlacklisted', '1')
  if (params.groupDuplicates === true) query.set('groupDuplicates', '1')
  if (params.firstSeenSince !== undefined && params.firstSeenSince !== '') {
    query.set('firstSeenSince', params.firstSeenSince)
  }
  if (params.orderBy !== undefined && params.orderBy !== '') query.set('orderBy', params.orderBy)
  query.set('desc', params.descending === false ? '0' : '1')
  query.set('page', String(params.page ?? 1))
  query.set('pageSize', String(params.pageSize ?? 20))
  return await request<JobPageDto>(`/jobs?${query.toString()}`, signal === undefined ? {} : { signal })
}

/** 筛选器的取值集：城市 / 经验 / 学历（界面多选 chips 用）。 */
export async function fetchJobFacets(signal?: AbortSignal): Promise<JobFacetsDto> {
  return await request<JobFacetsDto>('/jobs/facets', signal === undefined ? {} : { signal })
}

export async function fetchJobDetail(id: number, signal?: AbortSignal): Promise<JobDetailDto> {
  return await request<JobDetailDto>(`/jobs/${String(id)}`, signal === undefined ? {} : { signal })
}

export async function markJob(id: number, state: JobState): Promise<JobDto> {
  const result = await request<{ ok: boolean; job: JobDto }>(`/jobs/${String(id)}/mark`, {
    method: 'POST',
    body: JSON.stringify({ state }),
  })
  return result.job
}

/**
 * 批量标记（批次 D1）。
 *
 * 宿主端点早就有了（`POST /jobs/batch/mark`，无条数上限、去重、不存在的 id 收进 `missing`），
 * 只是界面一直没接上 —— 于是"扫完一页扔掉一半"只能一条条点 ✕。
 * `missing` 要如实回报（那几条可能已被清理），不能假装全成功。
 */
export async function markJobs(
  ids: number[],
  state: JobState,
): Promise<{ total: number; missing: number[] }> {
  const result = await request<{ ok: boolean; total: number; missing: number[] }>('/jobs/batch/mark', {
    method: 'POST',
    body: JSON.stringify({ ids, state }),
  })
  return { total: result.total, missing: result.missing }
}

// ── 保存的筛选视图（批次 B2）────────────────────────────────────────

export async function fetchJobViews(signal?: AbortSignal): Promise<JobViewsDto> {
  return await request<JobViewsDto>('/jobs/views', signal === undefined ? {} : { signal })
}

/** 整体覆盖写（幂等）：调用方传**全量**视图数组。 */
export async function saveJobViews(views: JobViewsDto['views']): Promise<JobViewsDto> {
  return await request<JobViewsDto>('/jobs/views', { method: 'PUT', body: JSON.stringify({ views }) })
}

// ── 其它 ────────────────────────────────────────────────────────────

/**
 * 「导出选中」的下载地址（批次 D2）。
 *
 * 返回 URL 而不是发请求：导出的是文件，交给浏览器的原生下载更稳
 * （大文件不进 JS 堆、文件名与断点都归它管）—— 与 `dataExportUrl` 同一个理由。
 * 界面用它渲染一个 `<a download>`（见 `batch-toolbar.tsx`）。
 */
export function jobsExportUrl(ids: number[]): string {
  return `${ROUTE_PREFIX}/jobs/export?ids=${ids.join(',')}`
}

/**
 * 只重算**分数已过期**的岗位（批次 A2）。
 *
 * 换简历之后库里所有旧分都作废，而抓取只覆盖"这一轮见到的"——
 * 没有这个入口，"按匹配分排序"会长期排在一堆旧分上。
 * 单次上限由宿主定（当前 100 条），`remaining > 0` 时界面要说"还剩多少"。
 */
export async function recomputeStaleScores(): Promise<{ jobs: number; remaining: number; note: string }> {
  return await request<{ jobs: number; remaining: number; note: string }>('/intel/recompute', {
    method: 'POST',
    body: JSON.stringify({ scope: 'stale' }),
  })
}

// ── 公司维度（P4）：详情 + 人工复核 ──────────────────────────────────

export async function fetchJobHistory(
  jobId: number,
  signal?: AbortSignal,
): Promise<{ items: StageEventDto[]; contactStage: ContactStage }> {
  return await request(`/jobs/${String(jobId)}/history`, signal === undefined ? {} : { signal })
}

