/**
 * 消息与面试：收件箱同步、人工录入、回复、面试记录与准备。
 */
import type { InboxDto, InterviewConflictDto, InterviewDto, InterviewPrepDto, InterviewSuggestionDto, MessageDto, ReplyDraftDto } from '../../shared/dto.js'
import type { InterviewKind, InterviewState, MessageDirection, ReplyScenario } from '../../shared/enums.js'
import { request } from './client.js'

/**
 * 同步收件箱：把平台会话列表读进本地消息表。低危，不需要确认。
 */
export async function syncInbox(input: { platformId: string }): Promise<{
  platformId: string
  fetched: number
  recorded: number
  duplicates: number
  unread: number
}> {
  const result = await request<{
    ok: boolean
    result: { platformId: string; fetched: number; recorded: number; duplicates: number; unread: number }
  }>('/inbox/sync', { method: 'POST', body: JSON.stringify(input) })
  return result.result
}

export async function fetchInbox(
  filter: { jobId?: number; unreadOnly?: boolean } = {},
  signal?: AbortSignal,
): Promise<InboxDto> {
  const query = new URLSearchParams()
  if (filter.jobId !== undefined) query.set('jobId', String(filter.jobId))
  if (filter.unreadOnly === true) query.set('unread', '1')
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`
  return await request<InboxDto>(`/inbox${suffix}`, signal === undefined ? {} : { signal })
}

/**
 * 从消息里抽出面试安排（「一键进日程」前置）。**只识别、不写库**。
 * 返回值里的字段都要用户确认后才真正创建面试。
 */
export async function extractInterview(id: number): Promise<InterviewSuggestionDto> {
  const result = await request<{ ok: boolean; extraction: InterviewSuggestionDto }>(
    `/messages/${String(id)}/extract-interview`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.extraction
}

/** 按情境拟一段回复草稿（**只生成、不发送**；发送走 reply）。 */
export async function draftReply(id: number, scenario: ReplyScenario): Promise<ReplyDraftDto> {
  const result = await request<{ ok: boolean; draft: ReplyDraftDto }>(
    `/messages/${String(id)}/draft-reply`,
    { method: 'POST', body: JSON.stringify({ scenario }) },
  )
  return result.draft
}

export async function recordMessage(input: {
  platformId: string
  direction: MessageDirection
  content: string
  jobId?: number
}): Promise<MessageDto> {
  const result = await request<{ ok: boolean; message: MessageDto }>('/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.message
}

export async function markMessageRead(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/messages/${String(id)}/read`, { method: 'POST', body: JSON.stringify({}) })
}

/**
 * 回复一条 HR 消息。**这会把消息真的发到平台上**（高危：界面要二次确认）。
 *
 * 返回值刻意是 `void`：真正的结果是"平台上发出去没有"，而那不是靠一个本地 id 表达的 ——
 * 服务端确认送达后才会写本地记录，失败会抛 `ApiError`（含适配器给的送达状态与处置建议）。
 * 界面照旧重拉收件箱即可。
 */
export async function replyMessage(id: number, content: string, confirm = false): Promise<void> {
  await request<{ ok: boolean }>(`/messages/${String(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content, confirm }),
  })
}

export async function fetchInterviews(
  signal?: AbortSignal,
): Promise<{ items: InterviewDto[]; conflicts: InterviewConflictDto[] }> {
  return await request('/interviews', signal === undefined ? {} : { signal })
}

export async function createInterview(input: {
  at: string
  jobId?: number
  applicationId?: number
  round?: number
  kind?: InterviewKind
  place?: string
  link?: string
  contact?: string
  commuteMin?: number
}): Promise<InterviewDto> {
  const result = await request<{ ok: boolean; interview: InterviewDto }>('/interviews', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.interview
}

export async function setInterviewState(
  id: number,
  state: InterviewState,
  allowReschedule = false,
): Promise<InterviewDto> {
  const result = await request<{ ok: boolean; interview: InterviewDto }>(
    `/interviews/${String(id)}/state`,
    { method: 'POST', body: JSON.stringify({ state, allowReschedule }) },
  )
  return result.interview
}

export async function fetchInterviewPrep(id: number, signal?: AbortSignal): Promise<InterviewPrepDto> {
  return await request<InterviewPrepDto>(`/interviews/${String(id)}/prep`, signal === undefined ? {} : { signal })
}

export async function deleteInterview(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/interviews/${String(id)}`, { method: 'DELETE' })
}

