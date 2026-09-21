/**
 * 采集方案的读写：CRUD、保存前校验、筛选维度声明。
 */
import type { PlanDto } from '../../../shared/contract/dto/plan.js'
import { request } from '../client.js'
import type {
  CriteriaDimensionsDto,
  CriteriaPreviewDto,
  PlanDuplicateDto,
  PlanValidationDto,
  PlanWriteInput,
} from '../../../shared/contract/dto/plan.js'

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

/**
 * **干跑**：这份条件对每个平台会发出什么请求（宿主侧不发请求、不开浏览器）。
 *
 * 用途是"把看不见的那一段变可见"：界面上写的条件 → 校验放行的条件 → **真正发出的请求**
 * 是三件事，分叉时用户什么都看不出来（"筛了没结果"与"没筛"长得一样）。
 */
export async function previewCriteria(
  platforms: string[],
  criteria: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ items: CriteriaPreviewDto[] }> {
  return await request<{ items: CriteriaPreviewDto[] }>('/criteria/preview', {
    method: 'POST',
    body: JSON.stringify({ platforms, criteria }),
    ...(signal === undefined ? {} : { signal }),
  })
}

