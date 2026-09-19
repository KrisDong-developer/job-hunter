/**
 * 采集方案的读写：CRUD、保存前校验、筛选维度声明。
 */
import type { PlanDto } from '../../../shared/contract/dto/plan.js'
import { request } from '../client.js'
import type { CriteriaDimensionsDto, PlanDuplicateDto, PlanValidationDto, PlanWriteInput } from '../../../shared/contract/dto/plan.js'

export async function fetchPlans(signal?: AbortSignal): Promise<{ items: PlanDto[] }> {
  return await request<{ items: PlanDto[] }>('/plans', signal === undefined ? {} : { signal })
}

export async function createPlan(
  input: PlanWriteInput,
): Promise<{ plan: PlanDto; duplicates: PlanDuplicateDto[]; notices: string[] }> {
  return await request<{ ok: boolean; plan: PlanDto; duplicates: PlanDuplicateDto[]; notices: string[] }>(
    '/plans',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function updatePlan(
  id: number,
  input: PlanWriteInput,
): Promise<{ plan: PlanDto; duplicates: PlanDuplicateDto[]; notices: string[] }> {
  return await request<{ ok: boolean; plan: PlanDto; duplicates: PlanDuplicateDto[]; notices: string[] }>(
    `/plans/${String(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function deletePlan(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/plans/${String(id)}`, { method: 'DELETE' })
}

export async function validatePlan(
  id: number,
  input: PlanWriteInput,
): Promise<PlanValidationDto> {
  const result = await request<{ ok: boolean; validation: PlanValidationDto }>(
    `/plans/${String(id)}/validate`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return result.validation
}

/**
 * **草稿校验**（没有 id 的新方案）。
 *
 * 为什么值得单独一条：新建方案在保存之前也需要"与谁重复 / 哪些平台会返回空" ——
 * 那正是用户最需要提示的时刻（保存之后才提示，晚了一步：方案已经在列表里了）。
 */
export async function validatePlanDraft(input: PlanWriteInput): Promise<PlanValidationDto> {
  const result = await request<{ ok: boolean; validation: PlanValidationDto }>('/plans/validate', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.validation
}

export async function fetchCriteriaDimensions(
  platforms: string[] = [],
  signal?: AbortSignal,
): Promise<CriteriaDimensionsDto> {
  const query = platforms.length === 0 ? '' : `?platforms=${encodeURIComponent(platforms.join(','))}`
  return await request<CriteriaDimensionsDto>(`/criteria/dimensions${query}`, signal === undefined ? {} : { signal })
}

