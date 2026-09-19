/**
 * 外发与接触态：打招呼（单条 / 批量 / 预览）、话术模板、跟进建议。
 */
import type { FollowUpDto, GreetingBatchPlanDto, GreetingBatchResultDto, GreetingDraftDto, GreetingDto } from '../../shared/dto.js'
import type { ContactStage } from '../../shared/enums.js'
import { ApiError, NeedsConfirmError, request } from './client.js'
import type { ContactStageUpdateDto } from './types.js'

/** 生成打招呼话术（**不发送**）。 */
export async function draftGreeting(
  jobId: number,
  input: { tone?: string; highlights?: string[] } = {},
): Promise<GreetingDraftDto> {
  const result = await request<{ ok: boolean; draft: GreetingDraftDto }>(
    `/jobs/${String(jobId)}/greeting/draft`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return result.draft
}

/**
 * 批量打招呼的**预览**（D3 / U1）：哪些条能发、为什么不能、将发出什么。
 *
 * **只读**：可以放心在打开弹窗时调一次。它只为"能发"的条目生成话术 ——
 * 注定发不出去的岗位不花模型调用。
 */
export async function previewGreetingBatch(jobIds: number[]): Promise<GreetingBatchPlanDto> {
  const result = await request<{ ok: boolean; plan: GreetingBatchPlanDto }>(
    '/greeting/send-batch/preview',
    { method: 'POST', body: JSON.stringify({ jobIds }) },
  )
  return result.plan
}

/**
 * 批量打招呼：**一次确认、分批发送、逐条回执**。
 *
 * `items` 里的 `text` 来自预览（用户看过或改过的那一段）—— 不传就会在发送那一刻重新生成，
 * 那样"用户确认的"与"实际发出的"可能不是同一段文字。
 *
 * 超过 `batchMax` 时宿主会拒绝（400）：调用方按 `batchMax` 自行分批，
 * 因为每一条都要开页面发送，一次请求塞太多会长时间不返回。
 */
export async function sendGreetingBatch(
  items: Array<{ jobId: number; text?: string }>,
): Promise<GreetingBatchResultDto> {
  const result = await request<{ ok: boolean; result: GreetingBatchResultDto }>('/greeting/send-batch', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, items }),
  })
  return result.result
}

export async function sendGreeting(input: {
  jobId: number
  text?: string
  confirm?: boolean
}): Promise<Record<string, unknown>> {
  try {
    const result = await request<{ ok: boolean; result: Record<string, unknown> }>('/greeting/send', {
      method: 'POST',
      body: JSON.stringify(input),
    })
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
 * 探测某岗位在平台上的**接触阶段**（HR 是否已读/已回）。低危，不需要确认。
 *
 * ⚠️ 它**只报事实、不改状态**（识别 ≠ 改状态）：`stage` 是平台上看到的东西，
 * `null` = 判不出来（会话不在列表里 / 状态标记认不出来）——**不是**"未接触"。
 * 要不要据此推进本地接触态，由用户在界面上显式决定。
 */
export async function probeContactStage(jobId: number): Promise<{
  jobId: number
  platformId: string
  stage: ContactStage | null
  note: string
  checkedAt: string
}> {
  const result = await request<{
    ok: boolean
    result: { jobId: number; platformId: string; stage: ContactStage | null; note: string; checkedAt: string }
  }>(`/jobs/${String(jobId)}/detect-stage`, { method: 'POST', body: JSON.stringify({}) })
  return result.result
}

export async function fetchFollowUps(signal?: AbortSignal): Promise<{ items: FollowUpDto[] }> {
  return await request<{ items: FollowUpDto[] }>('/followups', signal === undefined ? {} : { signal })
}

// ── 接触态 / 打招呼记录（§12.2 / D6）────────────────────────────────

/**
 * 打招呼记录（D6）。
 *
 * 为什么需要它：话术效果对比（D2）要"发了什么 + 用哪套模板 + 结果如何"，
 * 而这些此前只散在 `/jobs/:id/history` 的事件流里。
 */
export async function fetchGreetings(
  params: { jobId?: number; stage?: ContactStage; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ items: GreetingDto[] }> {
  const query = new URLSearchParams()
  if (params.jobId !== undefined) query.set('jobId', String(params.jobId))
  if (params.stage !== undefined) query.set('stage', params.stage)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  const suffix = query.size === 0 ? '' : `?${query.toString()}`
  return await request<{ items: GreetingDto[] }>(`/greetings${suffix}`, signal === undefined ? {} : { signal })
}

/**
 * 改本地接触态（`to` 见 `MANUAL_CONTACT_STAGES`）。
 *
 * ⚠️ 它**不改平台上任何东西**（不改已读、不发消息）—— 只是把"我看到的事实"记下来。
 * 不传 `confirm`：这不是危险动作（服务端也只过同源校验）。
 */
export async function updateContactStage(
  jobId: number,
  input: { to: ContactStage; note?: string; evidenceRef?: string },
): Promise<ContactStageUpdateDto> {
  return await request<ContactStageUpdateDto>(`/jobs/${String(jobId)}/contact-stage`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ── 待修复队列（B13 / J2）───────────────────────────────────────────

