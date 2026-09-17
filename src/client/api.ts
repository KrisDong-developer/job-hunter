import { ROUTE_PREFIX } from '../shared/constants.js'
import type {
  ApplicationChannel,
  ApplicationStage,
  AssessmentKind,
  AssessmentState,
  CampusBatch,
  CampusStage,
  ContactStage,
  CoverLetterLanguage,
  InterviewKind,
  InterviewState,
  MessageDirection,
  RemoteKind,
  ResumeFormat,
  ResumeTemplate,
  TripartiteState,
} from '../shared/enums.js'
import type {
  ApplicationDto,
  AssessmentDto,
  AttributionDto,
  BoardDto,
  CampusApplicationDto,
  CoverLetterDto,
  DeadlineDto,
  FollowUpDto,
  FunnelDto,
  InboxDto,
  InterviewConflictDto,
  InterviewDto,
  InterviewPrepDto,
  MessageDto,
  SalaryBandDto,
  StageEventDto,
  TalkSessionDto,
  TimezoneDisplayDto,
  TripartiteDto,
  VisaRequirementDto,
} from '../shared/dto.js'

/** 话术模板（§11.3 `GreetingTemplate`）。 */
export interface GreetingTemplateDto {
  id: number
  name: string
  body: string
  vars: string[]
  scene: string
  uses: number
  replies: number
  /** 回复率；`uses === 0` 时为 null（样本不足不给百分比）。 */
  replyRate: number | null
  createdAt: string
  updatedAt: string
}
import type {
  ResumeDto,
  ResumeFileDto,
  ResumeIssue,
  ResumeSummaryDto,
  TailoringDto,
} from '../shared/resume.js'
import type {
  CrawlStatusDto,
  CrawlSummaryDto,
  GreetingDraftDto,
  HealthDto,
  JobDetailDto,
  JobPageDto,
  JobDto,
  LoginStatusDto,
  PlanDto,
  PlatformOverviewDto,
  SchedulerStatusDto,
  TodayDto,
} from '../shared/dto.js'
import type { JobState } from '../shared/enums.js'
import type { ResumeContent } from '../shared/resume.js'

export type {
  CrawlStatusDto,
  CrawlSummaryDto,
  GreetingDraftDto,
  HealthDto,
  JobDetailDto,
  JobPageDto,
  JobDto,
  LoginStatusDto,
  PlanDto,
  PlatformOverviewDto,
  ResumeDto,
  ResumeFileDto,
  ResumeIssue,
  ResumeSummaryDto,
  SchedulerStatusDto,
  TailoringDto,
  TodayDto,
}

/** 带宿主返回的 `code` / `hint` 的 API 错误，界面可以直接把 `hint` 显示给用户。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly hint: string | undefined
  /** 原始响应体。审批类流程需要读其中的额外字段（如 `confirmText`）。 */
  readonly body: unknown

  constructor(status: number, code: string, message: string, hint?: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = hint
    this.body = body
  }

  /** 给用户看的一行字：优先用宿主给的 hint。 */
  get display(): string {
    return this.hint === undefined || this.hint === '' ? this.message : this.hint
  }
}

/** 只走 `/job-hunter/*`，权威数据始终在宿主 sqlite（§5.2）。 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined
  const response = await fetch(`${ROUTE_PREFIX}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  let body: unknown = null
  if (text !== '') {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    throw new ApiError(
      response.status,
      typeof record['code'] === 'string' ? record['code'] : `HTTP_${String(response.status)}`,
      typeof record['message'] === 'string' ? record['message'] : `HTTP ${String(response.status)}`,
      typeof record['hint'] === 'string' ? record['hint'] : undefined,
      body,
    )
  }
  return body as T
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthDto> {
  return await request<HealthDto>('/health', signal === undefined ? {} : { signal })
}

export async function fetchToday(signal?: AbortSignal): Promise<TodayDto> {
  return await request<TodayDto>('/today', signal === undefined ? {} : { signal })
}

export interface JobListParams {
  q?: string
  city?: string
  state?: string
  minSalary?: number | null
  orderBy?: string
  descending?: boolean
  page?: number
  pageSize?: number
}

export async function fetchJobs(params: JobListParams, signal?: AbortSignal): Promise<JobPageDto> {
  const query = new URLSearchParams()
  if (params.q !== undefined && params.q !== '') query.set('q', params.q)
  if (params.city !== undefined && params.city !== '') query.set('city', params.city)
  if (params.state !== undefined && params.state !== '') query.set('state', params.state)
  if (params.minSalary !== undefined && params.minSalary !== null) {
    query.set('minSalary', String(params.minSalary))
  }
  if (params.orderBy !== undefined && params.orderBy !== '') query.set('orderBy', params.orderBy)
  query.set('desc', params.descending === false ? '0' : '1')
  query.set('page', String(params.page ?? 1))
  query.set('pageSize', String(params.pageSize ?? 20))
  return await request<JobPageDto>(`/jobs?${query.toString()}`, signal === undefined ? {} : { signal })
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

export async function fetchCrawlStatus(signal?: AbortSignal): Promise<CrawlStatusDto> {
  return await request<CrawlStatusDto>('/crawl/status', signal === undefined ? {} : { signal })
}

export async function runCrawl(input: {
  platformId?: string
  criteria?: Record<string, string>
}): Promise<CrawlSummaryDto> {
  return await request<CrawlSummaryDto>('/crawl/run', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ── P3：调度与健康 ────────────────────────────────────────────────────

export async function fetchPlans(signal?: AbortSignal): Promise<{ items: PlanDto[] }> {
  return await request<{ items: PlanDto[] }>('/plans', signal === undefined ? {} : { signal })
}

export async function fetchSchedulerStatus(signal?: AbortSignal): Promise<SchedulerStatusDto> {
  return await request<SchedulerStatusDto>('/scheduler/status', signal === undefined ? {} : { signal })
}

export async function fetchPlatforms(signal?: AbortSignal): Promise<{ items: PlatformOverviewDto[] }> {
  return await request<{ items: PlatformOverviewDto[] }>('/platforms', signal === undefined ? {} : { signal })
}

export async function fetchLoginStatuses(signal?: AbortSignal): Promise<{ items: LoginStatusDto[] }> {
  return await request<{ items: LoginStatusDto[] }>('/login/status', signal === undefined ? {} : { signal })
}

/** 手动跑一次方案；`catchUp` 为 true 表示这是对「错过一轮」待办的响应。 */
export async function runPlan(planId: number, catchUp = false): Promise<CrawlSummaryDto> {
  return await request<CrawlSummaryDto>(`/plans/${String(planId)}/run`, {
    method: 'POST',
    body: JSON.stringify({ catchUp }),
  })
}

export async function startLogin(platformId: string): Promise<LoginStatusDto> {
  const result = await request<{ ok: boolean; login: LoginStatusDto }>(
    `/platforms/${encodeURIComponent(platformId)}/login/start`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.login
}

export async function closeTodo(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/todos/${String(id)}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ── P5：话术 / 审批 / 审计 / 配置 ────────────────────────────────────

export interface AuditRecordDto {
  id: number
  at: string
  actor: string
  action: string
  target: Record<string, unknown>
  detail: Record<string, unknown>
  result: string
  reason: string | null
  approval: unknown
  durationMs: number | null
}

export interface LlmCallDto {
  id: number
  at: string
  purpose: string
  provider: string | null
  model: string | null
  fields: string[]
  promptTokens: number
  completionTokens: number
  ref: Record<string, unknown>
  ok: boolean
  errorCode: string | null
  durationMs: number
}

export interface SettingsDto {
  ai: { enabled: boolean; purposes: Record<string, boolean> }
  guard: {
    levels: { l3Greeting: boolean; l4Application: boolean; l4Reply: boolean }
    dailyLimits: { greeting: number; application: number; reply: number }
    cooldownMinutes: number
    batchLimit: number
    requireApproval: boolean
    auditEnabled: boolean
  }
  derived: {
    purposes: Array<{ purpose: string; label: string; enabled: boolean }>
    modelEditable: string[]
    modelForbidden: string[]
  }
}

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
 * 发送打招呼。**两段式**：第一次不带 `confirm`，宿主会返回 409 `NEEDS_CONFIRM`
 * 与要展示给用户的文案；用户点了确认再带 `confirm: true` 重发。
 */
export class NeedsConfirmError extends Error {
  readonly code = 'NEEDS_CONFIRM'
  constructor(readonly confirmText: string) {
    super('这个动作需要你先确认')
    this.name = 'NeedsConfirmError'
  }
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

export async function fetchSettings(signal?: AbortSignal): Promise<SettingsDto> {
  return await request<SettingsDto>('/settings', signal === undefined ? {} : { signal })
}

export async function updateSettings(patch: {
  ai?: Record<string, unknown>
  guard?: Record<string, unknown>
}): Promise<SettingsDto> {
  const result = await request<{ ok: boolean; settings: SettingsDto }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return result.settings
}

export async function fetchAudit(
  limit = 50,
  filter: { actor?: string; action?: string } = {},
  signal?: AbortSignal,
): Promise<{ items: AuditRecordDto[]; count: number; note: string }> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (filter.actor !== undefined && filter.actor !== '') query.set('actor', filter.actor)
  if (filter.action !== undefined && filter.action !== '') query.set('action', filter.action)
  return await request(`/audit?${query.toString()}`, signal === undefined ? {} : { signal })
}

export async function fetchLlmCalls(
  limit = 50,
  signal?: AbortSignal,
): Promise<{
  items: LlmCallDto[]
  stats: Array<{ purpose: string; calls: number; promptTokens: number; completionTokens: number }>
  note: string
}> {
  return await request(`/llm/calls?limit=${String(limit)}`, signal === undefined ? {} : { signal })
}

// ── P6：简历 ─────────────────────────────────────────────────────────

export interface ResumeDetailDto extends ResumeDto {
  issues: ResumeIssue[]
}

export async function fetchResumes(
  signal?: AbortSignal,
): Promise<{ items: ResumeSummaryDto[] }> {
  return await request<{ items: ResumeSummaryDto[] }>('/resumes', signal === undefined ? {} : { signal })
}

export async function fetchResume(id: number, signal?: AbortSignal): Promise<ResumeDetailDto> {
  return await request<ResumeDetailDto>(`/resumes/${String(id)}`, signal === undefined ? {} : { signal })
}

export async function createResume(input: {
  name: string
  direction?: string
  language?: string
  content: ResumeContent
}): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>('/resumes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.resume
}

export async function updateResume(
  id: number,
  patch: {
    name?: string
    direction?: string
    language?: string
    state?: string
    content?: ResumeContent
    isDefault?: boolean
  },
): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>(`/resumes/${String(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return result.resume
}

export async function deleteResume(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/resumes/${String(id)}`, { method: 'DELETE' })
}

export async function duplicateResume(id: number, name?: string): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>(
    `/resumes/${String(id)}/duplicate`,
    { method: 'POST', body: JSON.stringify(name === undefined ? {} : { name }) },
  )
  return result.resume
}

export async function setDefaultResume(id: number): Promise<ResumeDto> {
  const result = await request<{ ok: boolean; resume: ResumeDto }>(`/resumes/${String(id)}/default`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return result.resume
}

export async function exportResume(
  id: number,
  input: { format: ResumeFormat; template?: ResumeTemplate },
): Promise<ResumeFileDto> {
  const result = await request<{ ok: boolean; file: ResumeFileDto }>(
    `/resumes/${String(id)}/export`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return result.file
}

/** 预览与附件都是直接给浏览器一个 URL（PDF 用内联，浏览器自己就能看）。 */
export function previewUrl(id: number, template?: ResumeTemplate): string {
  return `${ROUTE_PREFIX}/resumes/${String(id)}/preview${template === undefined ? '' : `?template=${template}`}`
}

export function fileUrl(fileId: number): string {
  return `${ROUTE_PREFIX}/files/${String(fileId)}`
}

/** 删除一个附件（源文件与记录一起删）。界面上写着"只有你显式删除才会消失"，这就是那个删除。 */
export async function deleteFile(fileId: number): Promise<void> {
  await request<{ ok: boolean }>(`/files/${String(fileId)}`, { method: 'DELETE' })
}

export async function tailorResume(input: {
  jobId: number
  resumeId?: number
  useLlm?: boolean
}): Promise<TailoringDto> {
  const result = await request<{ ok: boolean; tailoring: TailoringDto }>('/resume/tailor', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.tailoring
}

export async function fetchTailorings(
  filter: { jobId?: number; resumeId?: number; limit?: number },
  signal?: AbortSignal,
): Promise<{ items: TailoringDto[] }> {
  const query = new URLSearchParams()
  if (filter.jobId !== undefined) query.set('jobId', String(filter.jobId))
  if (filter.resumeId !== undefined) query.set('resumeId', String(filter.resumeId))
  if (filter.limit !== undefined) query.set('limit', String(filter.limit))
  return await request<{ items: TailoringDto[] }>(
    `/tailorings?${query.toString()}`,
    signal === undefined ? {} : { signal },
  )
}

export async function adoptTailoring(id: number, adopted: boolean): Promise<TailoringDto> {
  const result = await request<{ ok: boolean; tailoring: TailoringDto }>(
    `/tailorings/${String(id)}/adopt`,
    { method: 'POST', body: JSON.stringify({ adopted }) },
  )
  return result.tailoring
}

// ── P7：跟进、消息、面试、看板 ────────────────────────────────────────

export type {
  ApplicationDto,
  AttributionDto,
  BoardDto,
  FollowUpDto,
  FunnelDto,
  InboxDto,
  InterviewConflictDto,
  InterviewDto,
  InterviewPrepDto,
  MessageDto,
  SalaryBandDto,
  StageEventDto,
}

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

export async function fetchJobHistory(
  jobId: number,
  signal?: AbortSignal,
): Promise<{ items: StageEventDto[]; contactStage: ContactStage }> {
  return await request(`/jobs/${String(jobId)}/history`, signal === undefined ? {} : { signal })
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

export async function replyMessage(id: number, content: string, confirm = false): Promise<MessageDto> {
  const result = await request<{ ok: boolean; message: MessageDto }>(`/messages/${String(id)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ content, confirm }),
  })
  return result.message
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

export async function fetchFunnel(signal?: AbortSignal): Promise<FunnelDto> {
  return await request<FunnelDto>('/analytics/funnel', signal === undefined ? {} : { signal })
}

export async function fetchAttribution(signal?: AbortSignal): Promise<AttributionDto> {
  return await request<AttributionDto>('/analytics/attribution', signal === undefined ? {} : { signal })
}

export async function fetchSalaryBand(
  filter: { city?: string; q?: string } = {},
  signal?: AbortSignal,
): Promise<SalaryBandDto> {
  const query = new URLSearchParams()
  if (filter.city !== undefined && filter.city !== '') query.set('city', filter.city)
  if (filter.q !== undefined && filter.q !== '') query.set('q', filter.q)
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`
  return await request<SalaryBandDto>(`/analytics/salary${suffix}`, signal === undefined ? {} : { signal })
}

export async function fetchFollowUps(signal?: AbortSignal): Promise<{ items: FollowUpDto[] }> {
  return await request<{ items: FollowUpDto[] }>('/followups', signal === undefined ? {} : { signal })
}

export async function fetchGreetingTemplates(
  signal?: AbortSignal,
): Promise<{ items: GreetingTemplateDto[] }> {
  return await request<{ items: GreetingTemplateDto[] }>('/greeting/templates', signal === undefined ? {} : { signal })
}

// ── P8：校招与海外支线 ───────────────────────────────────────────────

export type {
  AssessmentDto,
  CampusApplicationDto,
  CoverLetterDto,
  DeadlineDto,
  TalkSessionDto,
  TimezoneDisplayDto,
  TripartiteDto,
  VisaRequirementDto,
}

export interface CampusWindowsDto {
  items: CampusApplicationDto[]
  windows: Array<{ batch: CampusBatch; count: number; openCount: number; nextCloseAt: string | null }>
}

export async function fetchCampus(signal?: AbortSignal): Promise<CampusWindowsDto> {
  return await request<CampusWindowsDto>('/campus', signal === undefined ? {} : { signal })
}

export async function createCampus(input: {
  companyId?: number
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

export async function analyzeOverseas(
  jobId: number,
): Promise<VisaRequirementDto & { remoteKind: RemoteKind; campusBatch: string | null }> {
  return await request<VisaRequirementDto & { remoteKind: RemoteKind; campusBatch: string | null }>(
    '/overseas/analyze',
    { method: 'POST', body: JSON.stringify({ jobId }) },
  )
}

export async function fetchTimezone(at: string, tz: string, signal?: AbortSignal): Promise<TimezoneDisplayDto> {
  const query = new URLSearchParams({ at, tz })
  return await request<TimezoneDisplayDto>(`/timezone?${query.toString()}`, signal === undefined ? {} : { signal })
}

export async function fetchEnglishCheck(
  resumeId: number,
  signal?: AbortSignal,
): Promise<{ items: Array<{ level: 'error' | 'warn'; message: string }>; note: string }> {
  return await request(`/resumes/${String(resumeId)}/english-check`, signal === undefined ? {} : { signal })
}

export async function draftCoverLetter(input: {
  jobId: number
  language?: CoverLetterLanguage
  resumeId?: number
  useLlm?: boolean
}): Promise<CoverLetterDto> {
  const result = await request<{ ok: boolean; coverLetter: CoverLetterDto }>('/cover-letters', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.coverLetter
}

export async function fetchCoverLetters(
  jobId?: number,
  signal?: AbortSignal,
): Promise<{ items: CoverLetterDto[] }> {
  const suffix = jobId === undefined ? '' : `?jobId=${String(jobId)}`
  return await request<{ items: CoverLetterDto[] }>(`/cover-letters${suffix}`, signal === undefined ? {} : { signal })
}
