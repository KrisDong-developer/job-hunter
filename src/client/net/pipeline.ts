/**
 * 投递流水线与看板：投递 / 批量 / 漏斗 / 归因 / 薪资 / 简历版本对比。
 */
import type { AnalyticsFilter, AttributionDto, FunnelDto } from '../../shared/contract/dto/analytics.js'
import type { ApplicationBatchPlanDto, ApplicationBatchResultDto } from '../../shared/contract/dto/batch.js'
import type { SalaryBandDto, SalaryBaselineDto, SalaryBoxChartDto } from '../../shared/contract/dto/offer.js'
import type { ApplicationDto, BoardDto } from '../../shared/contract/dto/pipeline.js'
import type { ResumeCompareDto } from '../../shared/contract/dto/resume.js'
import type { SalaryBasis } from '../../shared/contract/enums/analytics.js'
import type { DeliveryState } from '../../shared/contract/enums/job.js'
import type { ApplicationChannel, ApplicationStage } from '../../shared/contract/enums/pipeline.js'
import { ApiError, NeedsConfirmError, request } from './client.js'

export async function fetchBoard(signal?: AbortSignal): Promise<BoardDto> {
  return await request<BoardDto>('/board', signal === undefined ? {} : { signal })
}

export async function fetchApplications(
  filter: { jobId?: number } = {},
  signal?: AbortSignal,
): Promise<{ items: ApplicationDto[] }> {
  const query = new URLSearchParams()
  if (filter.jobId !== undefined) query.set('jobId', String(filter.jobId))
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`
  return await request<{ items: ApplicationDto[] }>(`/applications${suffix}`, signal === undefined ? {} : { signal })
}

export async function createApplication(input: {
  jobId: number
  resumeId?: number
  channel?: ApplicationChannel
  note?: string
  confirm?: boolean
}): Promise<ApplicationDto> {
  const result = await request<{ ok: boolean; application: ApplicationDto }>('/applications', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.application
}

/**
 * 投递简历：**真的用适配器把简历投出去**（与 `createApplication` 的"记一笔"不同）。
 *
 * 高危，两段式确认：不带 `confirm` 时宿主抛 `NEEDS_CONFIRM`，这里翻译成
 * `NeedsConfirmError`，界面显示 `confirmText` 后再带 `confirm: true` 重发。
 *
 * `resumeFileId` 是这次投递**关联**的本地简历附件（用于记录与归因），不是"上传这个文件"——
 * 目前 BOSS 与智联都只吃平台上已有的那份简历。直接传**文件路径是不允许的**
 * （宿主只认 id，路径由它自己从库里查）。
 */
export async function deliverApplication(input: {
  jobId: number
  resumeFileId?: number | null
  confirm?: boolean
}): Promise<{
  jobId: number
  platformId: string
  company: string
  title: string
  sentAt: string
  delivery: DeliveryState
  detail?: string
}> {
  try {
    const result = await request<{
      ok: boolean
      result: {
        jobId: number
        platformId: string
        company: string
        title: string
        sentAt: string
        delivery: DeliveryState
        detail?: string
      }
    }>('/applications/deliver', { method: 'POST', body: JSON.stringify(input) })
    return result.result
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NEEDS_CONFIRM') {
      const body = error.body
      const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
      const text = typeof record['confirmText'] === 'string' ? record['confirmText'] : error.message
      throw new NeedsConfirmError(text)
    }
    throw error
  }
}

/**
 * 批量投递的**预览**（L4）：哪些条能投、为什么不能、用哪份简历。
 *
 * **只读**：可以放心在打开弹窗时调一次。`resumeFileId` 省略/null = 用平台内简历。
 */
export async function previewApplicationBatch(
  jobIds: number[],
  resumeFileId: number | null,
): Promise<ApplicationBatchPlanDto> {
  const result = await request<{ ok: boolean; plan: ApplicationBatchPlanDto }>(
    '/applications/deliver-batch/preview',
    { method: 'POST', body: JSON.stringify({ jobIds, resumeFileId }) },
  )
  return result.plan
}

/**
 * 批量投递：**一次确认、分批投递、逐条回执**。
 *
 * 超过 `batchMax` 时宿主会拒绝（400）：调用方按 `batchMax` 自行分批，
 * 因为每一条都要开平台页面点「投递」，一次请求塞太多会长时间不返回。
 *
 * ⚠️ 投递**不可逆**：回执里 `delivery` 不是 `delivered` 的那些（尤其 `pending`）
 * 必须提示用户去平台上核对，而不是直接重投。
 */
export async function sendApplicationBatch(
  jobIds: number[],
  resumeFileId: number | null,
): Promise<ApplicationBatchResultDto> {
  const result = await request<{ ok: boolean; result: ApplicationBatchResultDto }>(
    '/applications/deliver-batch',
    { method: 'POST', body: JSON.stringify({ confirm: true, jobIds, resumeFileId }) },
  )
  return result.result
}

export async function advanceApplication(input: {
  applicationId: number
  to: ApplicationStage
  note?: string
  allowBackward?: boolean
}): Promise<ApplicationDto> {
  const result = await request<{ ok: boolean; application: ApplicationDto }>(
    `/applications/${String(input.applicationId)}/advance`,
    {
      method: 'POST',
      body: JSON.stringify({
        to: input.to,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.allowBackward === undefined ? {} : { allowBackward: input.allowBackward }),
      }),
    },
  )
  return result.application
}

/** 把全局筛选拼成 query。空值一律不发，免得后端要区分 "" 与缺失。 */
function analyticsQuery(filter: AnalyticsFilter): string {
  const query = new URLSearchParams()
  if (filter.from !== undefined && filter.from !== '') query.set('from', filter.from)
  if (filter.to !== undefined && filter.to !== '') query.set('to', filter.to)
  if (filter.city !== undefined && filter.city !== '') query.set('city', filter.city)
  if (filter.keyword !== undefined && filter.keyword !== '') query.set('q', filter.keyword)
  if (filter.direction !== undefined && filter.direction !== '') query.set('direction', filter.direction)
  if (filter.resumeId !== undefined) query.set('resumeId', String(filter.resumeId))
  const text = query.toString()
  return text === '' ? '' : `?${text}`
}

export async function fetchFunnel(
  filter: AnalyticsFilter = {},
  signal?: AbortSignal,
): Promise<FunnelDto> {
  return await request<FunnelDto>(`/analytics/funnel${analyticsQuery(filter)}`, signal === undefined ? {} : { signal })
}

export async function fetchAttribution(
  filter: AnalyticsFilter = {},
  signal?: AbortSignal,
): Promise<AttributionDto> {
  return await request<AttributionDto>(
    `/analytics/attribution${analyticsQuery(filter)}`,
    signal === undefined ? {} : { signal },
  )
}

export async function fetchSalaryBand(
  filter: AnalyticsFilter = {},
  signal?: AbortSignal,
): Promise<SalaryBandDto> {
  return await request<SalaryBandDto>(`/analytics/salary${analyticsQuery(filter)}`, signal === undefined ? {} : { signal })
}

// ── 跨平台去重分组（A2：让"合并/拆分"可逆可查）───────────────────────────

/** F1：薪资箱线图。`basis` 必须显式给 —— 两个口径算出来的中位数不一样。 */
export async function fetchSalaryBox(
  filter: AnalyticsFilter = {},
  basis: SalaryBasis = 'monthly_min',
  signal?: AbortSignal,
): Promise<SalaryBoxChartDto> {
  const query = analyticsQuery(filter)
  const separator = query === '' ? '?' : '&'
  return await request<SalaryBoxChartDto>(
    `/analytics/salary/box${query}${separator}basis=${basis}`,
    signal === undefined ? {} : { signal },
  )
}

/** F2：本地基准对比（基准 = 自己抓到的岗位库）。 */
export async function fetchSalaryBaseline(
  filter: AnalyticsFilter = {},
  signal?: AbortSignal,
): Promise<SalaryBaselineDto> {
  return await request<SalaryBaselineDto>(
    `/analytics/salary/baseline${analyticsQuery(filter)}`,
    signal === undefined ? {} : { signal },
  )
}

/** F3：简历版本 A/B 对比（每格带样本量）。 */
export async function fetchResumeCompare(
  filter: AnalyticsFilter = {},
  signal?: AbortSignal,
): Promise<ResumeCompareDto> {
  return await request<ResumeCompareDto>(
    `/analytics/resume/compare${analyticsQuery(filter)}`,
    signal === undefined ? {} : { signal },
  )
}

