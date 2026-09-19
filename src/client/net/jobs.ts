/**
 * 岗位库：列表 / 筛选面 / 详情 / 处置态 / 查看历史。
 */
import type { JobDetailDto, JobDto, JobFacetsDto, JobPageDto } from '../../shared/contract/dto/job.js'
import type { StageEventDto } from '../../shared/contract/dto/pipeline.js'
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
  if (params.expReqs !== undefined && params.expReqs.length > 0) {
    query.set('expReqs', params.expReqs.join(','))
  }
  if (params.eduReqs !== undefined && params.eduReqs.length > 0) {
    query.set('eduReqs', params.eduReqs.join(','))
  }
  if (params.excludeFlags !== undefined && params.excludeFlags.length > 0) {
    query.set('excludeFlags', params.excludeFlags.join(','))
  }
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

// ── 公司维度（P4）：详情 + 人工复核 ──────────────────────────────────

export async function fetchJobHistory(
  jobId: number,
  signal?: AbortSignal,
): Promise<{ items: StageEventDto[]; contactStage: ContactStage }> {
  return await request(`/jobs/${String(jobId)}/history`, signal === undefined ? {} : { signal })
}

