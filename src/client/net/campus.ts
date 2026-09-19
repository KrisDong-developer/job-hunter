/**
 * 校招支线：批次推进、笔试测评、三方协议、硬截止。
 */
import type { AssessmentDto, CampusApplicationDto, DeadlineDto, TripartiteDto } from '../../shared/contract/dto/campus.js'
import type { AssessmentKind, AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../../shared/contract/enums/campus.js'
import { request } from './client.js'
import type { CampusWindowsDto } from '../../shared/contract/dto/campus.js'

export async function fetchCampus(signal?: AbortSignal): Promise<CampusWindowsDto> {
  return await request<CampusWindowsDto>('/campus', signal === undefined ? {} : { signal })
}

export async function createCampus(input: {
  companyId?: number
  /** 界面只给一个「公司名」输入框（用户手里没有 company id）；宿主按归一化键幂等登记公司。 */
  companyName?: string
  jobId?: number
  batch?: CampusBatch
  applyCloseAt?: string
  note?: string
}): Promise<CampusApplicationDto> {
  const result = await request<{ ok: boolean; campus: CampusApplicationDto }>('/campus', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.campus
}

export async function advanceCampus(
  id: number,
  stage: CampusStage,
  allowBackward = false,
): Promise<CampusApplicationDto> {
  const result = await request<{ ok: boolean; campus: CampusApplicationDto }>(
    `/campus/${String(id)}/advance`,
    { method: 'POST', body: JSON.stringify({ stage, allowBackward }) },
  )
  return result.campus
}

export async function createAssessment(input: {
  campusApplicationId?: number
  platform?: string
  kind?: AssessmentKind
  dueAt: string
  durationMin?: number
}): Promise<AssessmentDto> {
  const result = await request<{ ok: boolean; assessment: AssessmentDto }>('/assessments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.assessment
}

export async function setAssessmentState(id: number, state: AssessmentState): Promise<AssessmentDto> {
  const result = await request<{ ok: boolean; assessment: AssessmentDto }>(
    `/assessments/${String(id)}/state`,
    { method: 'POST', body: JSON.stringify({ state }) },
  )
  return result.assessment
}

export async function fetchDeadlines(
  signal?: AbortSignal,
): Promise<{ items: DeadlineDto[]; overdue: DeadlineDto[] }> {
  return await request('/deadlines', signal === undefined ? {} : { signal })
}

export async function fetchTripartite(signal?: AbortSignal): Promise<{ items: TripartiteDto[] }> {
  return await request<{ items: TripartiteDto[] }>('/tripartite', signal === undefined ? {} : { signal })
}

export async function createTripartite(input: {
  campusApplicationId?: number
  signDeadline?: string
  penaltySummary?: string
}): Promise<TripartiteDto> {
  const result = await request<{ ok: boolean; tripartite: TripartiteDto }>('/tripartite', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.tripartite
}

export async function setTripartiteState(id: number, state: TripartiteState): Promise<TripartiteDto> {
  const result = await request<{ ok: boolean; tripartite: TripartiteDto }>(
    `/tripartite/${String(id)}/state`,
    { method: 'POST', body: JSON.stringify({ state }) },
  )
  return result.tripartite
}

