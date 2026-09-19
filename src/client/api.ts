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
  DeliveryState,
  InterviewKind,
  InterviewState,
  MessageDirection,
  RemoteKind,
  ResumeFormat,
  ResumeTemplate,
  TripartiteState,
} from '../shared/enums.js'
import type {
  AdapterConfigDto,
  AnalyticsFilter,
  ApplicationDto,
  AssessmentDto,
  AttributionDto,
  BoardDto,
  CampusApplicationDto,
  CleanupPlanDto,
  CleanupResultDto,
  CoverLetterDto,
  DataExportFormat,
  DataImportResultDto,
  DeadlineDto,
  ApplicationBatchItemDto,
  ApplicationBatchPlanDto,
  ApplicationBatchReceiptDto,
  ApplicationBatchResultDto,
  FollowUpDto,
  FunnelDto,
  GreetingBatchPlanDto,
  GreetingBatchReceiptDto,
  GreetingBatchResultDto,
  GreetingDto,
  GuardUsageDto,
  InboxDto,
  InterviewConflictDto,
  InterviewDto,
  InterviewPrepDto,
  InterviewSuggestionDto,
  MessageDto,
  RepairDto,
  RepairListDto,
  ReplyDraftDto,
  RetentionPolicy,
  ResumeCompareDto,
  SalaryBandDto,
  SalaryBaselineDto,
  SalaryBasis,
  SalaryBoxChartDto,
  StageEventDto,
  StorageUsageDto,
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
  CompanyDetailDto,
  CrawlStatusDto,
  CrawlSummaryDto,
  GreetingDraftDto,
  HealthDto,
  JobDetailDto,
  JobPageDto,
  JobDto,
  JobFacetsDto,
  LoginStatusDto,
  PlanDto,
  PlanPostProcess,
  PlanSchedule,
  PlanScheduleStatusDto,
  PlatformOverviewDto,
  RecentRunDto,
  SchedulerStatusDto,
  SkipReason,
  TodayDto,
  WeeklyTriggerDto,
} from '../shared/dto.js'
import type { JobFlagType, JobState } from '../shared/enums.js'
import type { ReplyScenario } from '../shared/enums.js'
import type { ResumeContent } from '../shared/resume.js'

export type {
  CrawlStatusDto,
  CrawlSummaryDto,
  GreetingDraftDto,
  HealthDto,
  JobDetailDto,
  JobPageDto,
  JobDto,
  JobFacetsDto,
  LoginStatusDto,
  PlanDto,
  PlanPostProcess,
  PlanSchedule,
  PlanScheduleStatusDto,
  PlatformOverviewDto,
  RecentRunDto,
  ResumeDto,
  ResumeFileDto,
  ResumeIssue,
  ResumeSummaryDto,
  SchedulerStatusDto,
  SkipReason,
  TailoringDto,
  TodayDto,
  WeeklyTriggerDto,
}

/**
 * 客户端调用宿主 API 失败时的统一错误类型。
 *
 * 宿主接口遵循统一响应协议（`{ ok, code, message, hint? }`），本类把
 * HTTP 状态码、机器可读错误码、以及面向用户的可读提示打包成一个 Error，
 * 界面层拿到后可以直接把 `display` 展示给用户，无需再解析原始响应体。
 *
 * 字段说明：
 * - `status`：HTTP 状态码，用于日志与请求调试定位。
 * - `code`：机器可读错误码（如 `NEEDS_CONFIRM`、`GUARD_DENIED`），供逻辑分支判断。
 * - `hint`：宿主返回的用户可读文案；为空时界面退化为使用 `message`。
 * - `body`：原始响应体。审批类流程需要读其中的额外字段（如 `confirmText`）。
 * - `display`：给用户看的一行字，优先采用宿主给的 `hint`。
 */
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
  /** 城市数组：命中任意一个即可。 */
  cities?: string[]
  city?: string
  state?: string
  minSalary?: number | null
  /** 经验要求多选：命中任意一个即可（取值来自 `fetchJobFacets`）。 */
  expReqs?: string[]
  /** 学历要求多选：同上。 */
  eduReqs?: string[]
  /** 屏蔽这些标注类型的岗位（传出 `excludeFlags`，黑白名单只有这里的类型）。 */
  excludeFlags?: JobFlagType[]
  /** 批次 4：按跨平台去重分组折叠（同一条岗位在多个平台各抓一条时只占一行）。 */
  groupDuplicates?: boolean
  /**
   * 「只看新增」：只返回**首次见到**时间 ≥ 该 ISO 时刻的岗位。
   * 界面按时间窗（近 24 小时 / 3 天 / 7 天）算好再传，口径与首屏「今日新增」一致。
   */
  firstSeenSince?: string
  orderBy?: string
  descending?: boolean
  page?: number
  pageSize?: number
}

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

/**
 * 公司详情：画像 + 识别信号留痕 + 该公司的在手岗位（≤50）+ 标注汇总。
 *
 * 这份接口一直都在，只是客户端从来没调过 —— 于是岗位详情里只能显示
 * "在手岗位 37"这个数字，看不到那 37 条是什么。
 */
export async function fetchCompanyDetail(
  companyId: number,
  signal?: AbortSignal,
): Promise<CompanyDetailDto> {
  return await request<CompanyDetailDto>(
    `/companies/${String(companyId)}`,
    signal === undefined ? {} : { signal },
  )
}

/** 人工复核：打标签 / 拉黑。**只发生命中的键**，缺的键沿用现值（不会清空备注）。 */
export async function updateCompanyReview(
  companyId: number,
  patch: { blacklisted?: boolean; manualLabel?: string | null },
): Promise<void> {
  await request<{ ok: boolean }>(`/companies/${String(companyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
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

/** 方案写入体。**只有显式给出的键**才会被发出去 —— 缺的键由宿主沿用现值。 */
export interface PlanWriteInput {
  name?: string
  platforms?: string[]
  /** 多关键词（逐个采集）。空数组 = 清空（回到单关键词/不限的老形态）。 */
  keywords?: string[]
  /** 每平台的覆盖项（批次 3，稀疏）。`maxPages: null` = 用方案级页数。 */
  platformOverrides?: Record<string, { enabled?: boolean; maxPages?: number | null }>
  criteria?: Record<string, string>
  schedule?: Partial<PlanSchedule>
  enabled?: boolean
  postProcess?: Partial<PlanPostProcess>
}

/** SR-41：一个筛选维度的声明（界面据此渲染；不支持的**禁用而非隐藏**）。 */
export interface CriteriaDimensionDto {
  key: string
  label: string
  values: Array<{ value: string; label: string }>
  max: number | null
  hint: string
  supported: boolean
  disabledReason: string | null
  numeric: boolean
}

export interface CriteriaDimensionsDto {
  items: CriteriaDimensionDto[]
  platforms: string[]
  available: Array<{ id: string; displayName: string }>
}

/** SR-43：重复提示（只提示，不合并）。 */
export interface PlanDuplicateDto {
  planId: number
  name: string
  reason: string
}

/** SR-45：校验结果。界面保存前先问一次，与工具/HTTP 是同一份校验。 */
export interface PlanValidationDto {
  name: string
  platforms: string[]
  criteria: Record<string, string>
  schedule: PlanSchedule
  enabled: boolean
  postProcess: PlanPostProcess
  duplicates: PlanDuplicateDto[]
  /** 非致命但必须让用户知道的事（多平台：城市不支持 / 平台未校准 / 深度被截断）。 */
  notices: string[]
  dimensions: CriteriaDimensionDto[]
}

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

/** A2：「抓取一次」= 按默认方案跑一轮（不再写死 51job/深圳/Java）。 */
export async function runDefaultPlan(): Promise<CrawlSummaryDto & { planId: number; planName: string }> {
  return await request<CrawlSummaryDto & { planId: number; planName: string }>('/crawl', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** B3/SR-30：全局一键暂停（**只停定时**，手动仍然可用）。 */
export async function setSchedulePaused(paused: boolean, reason?: string): Promise<SchedulerStatusDto> {
  const result = await request<{ ok: boolean; status: SchedulerStatusDto }>('/schedule/pause', {
    method: 'POST',
    body: JSON.stringify(reason === undefined ? { paused } : { paused, reason }),
  })
  return result.status
}

/** SR-21：人工确认恢复风控暂停的方案（系统不会自动恢复）。 */
export async function resumePlanRisk(id: number): Promise<PlanDto> {
  const result = await request<{ ok: boolean; plan: PlanDto }>(`/plans/${String(id)}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return result.plan
}

/**
 * R20：重新检测一次租约。
 *
 * 对方进程刚被关掉时，界面本来要干等最长 90 秒（心跳过期）才会变；
 * 这个动作让它**立刻**重试一次。它抢不走活着的实例的租约。
 */
export async function recheckLease(): Promise<SchedulerStatusDto> {
  const result = await request<{ ok: boolean; status: SchedulerStatusDto }>(
    '/schedule/lease/recheck',
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.status
}

/**
 * R20：人工接管租约。**只在对方心跳已过期时才会成功** ——
 * 抢一个活着的实例会造成两个调度器同时抓取，那正是这条锁要防的事。
 */
export async function takeoverLease(): Promise<SchedulerStatusDto> {
  const result = await request<{ ok: boolean; status: SchedulerStatusDto }>(
    '/schedule/lease/takeover',
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.status
}

/** SR-17/26：跳过原因 → 人话。宿主是唯一来源，界面不自己写一套。 */
export async function fetchSkipReasons(
  signal?: AbortSignal,
): Promise<{ items: Record<string, string> }> {
  return await request<{ items: Record<string, string> }>(
    '/schedule/reasons',
    signal === undefined ? {} : { signal },
  )
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

/** `confirm-action` 待办交回的意图：宿主不重放正文，只给"该回哪个上下文重新发起"。 */
export interface ConfirmActionIntentDto {
  action: string
  actor: string
  target: Record<string, number | string>
}

/**
 * 恢复一条「待确认动作」待办（guard 在审批超时/无界面时落下的那种）。
 *
 * ⚠️ 它**不重放**原动作：正文不入库（§4.1），所以宿主只做两件事 ——
 * 关掉这条待办、把 `{action, actor, target}` 意图交回界面。
 * "带用户回到目标岗位重新发起"那一步在界面这一侧。
 */
export async function resumeConfirmAction(
  id: number,
): Promise<{ intent: ConfirmActionIntentDto; note: string }> {
  const result = await request<{ ok: boolean; intent: ConfirmActionIntentDto; note: string }>(
    `/todos/${String(id)}/confirm-actions/resume`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return { intent: result.intent, note: result.note }
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
    /** 发送时间窗口，`'HH:MM-HH:MM'`（本地时间，支持跨午夜）；空串 = 不限。 */
    sendWindow: string
    /** 随机休息日概率（0–1）。 */
    dayOffProbability: number
  }
  /**
   * 浏览器运行期设置（资源设置，不是闸门配置，模型也可改）。
   * 宿主那边还有 `engine` / `stealthInit` 两个键，界面目前不用，所以不在这里声明。
   */
  browser: {
    idleCloseMinutes: number
    /** 每轮采集结束后就关掉采集浏览器（打开时 `idleCloseMinutes` 被它接管）。 */
    closeAfterRun: boolean
  }
  /** 采集运行期设置（单轮预算）。资源/节奏设置，模型不可改。 */
  crawl: {
    /** 一轮采集（一个方案的一次运行，含多关键词与详情补抓）最多多少分钟。 */
    roundBudgetMinutes: number
  }
  /** 数据保留策略（§18）。资源设置，模型不可改。 */
  retention: RetentionPolicy
  derived: {
    purposes: Array<{ purpose: string; label: string; enabled: boolean }>
    modelEditable: string[]
    modelForbidden: string[]
    /**
     * 出厂默认值（由宿主下发，客户端不另写一份）。
     * 界面用它填问号说明里的"默认多少"，以及发送时段为空（不限）时输入框显示什么。
     */
    defaults: {
      purposes: Record<string, boolean>
      guard: {
        dailyLimits: { greeting: number; application: number; reply: number }
        cooldownMinutes: number
        batchLimit: number
        sendWindow: string
        dayOffProbability: number
      }
      /** 保留期的出厂默认（"恢复默认"按钮用它）。 */
      retention: RetentionPolicy
    }
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

/**
 * 「高危动作需要用户二次确认」的客户端错误。
 *
 * 宿主对危险操作采用**两段式确认**协议：第一次请求不带确认标志时，宿主返回
 * 409 `NEEDS_CONFIRM` 并携带 `confirmText` 文案；界面收到本错误后把
 * `confirmText` 展示给用户，用户点确认后再带 `confirm: true` 重发同一请求。
 *
 * 这是 HTTP 层 `ConfirmRequiredError` 在客户端的对应投影——`request` 捕获到
 * `ApiError`（code 为 `NEEDS_CONFIRM`）后翻译成该语义明确的类型，
 * 界面可用 `instanceof` 精准分支处理确认流程。
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

/**
 * 在系统文件管理器里打开数据文件所在目录。
 *
 * 浏览器没有打开本机文件夹的能力，所以这件事由宿主半执行 ——
 * 而且它**只认数据文件自己的目录**，界面传不了路径（见 `host/util/reveal.ts`）。
 *
 * 返回 `ok: false` 是**业务结果**（宿主里没有文件管理器），不是协议错误：
 * 界面要如实转述，不能一律说"已打开"。
 */
export async function revealDataDir(): Promise<{ dir: string; ok: boolean; reason: string | null }> {
  const result = await request<{ ok: boolean; dir: string; reason?: string }>('/system/reveal', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return { dir: result.dir, ok: result.ok, reason: result.reason ?? null }
}

export async function updateSettings(patch: {
  ai?: Record<string, unknown>
  guard?: Record<string, unknown>
  browser?: Record<string, unknown>
  crawl?: Record<string, unknown>
  /** 数据保留策略（§18）。资源设置，不是闸门，所以不需要审批。 */
  retention?: Record<string, unknown>
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
  InterviewSuggestionDto,
  MessageDto,
  ReplyDraftDto,
  ResumeCompareDto,
  SalaryBandDto,
  SalaryBaselineDto,
  SalaryBasis,
  SalaryBoxChartDto,
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

export interface DedupGroupDto {
  id: number
  primaryJobId: number | null
  basis: string
  score: number
  createdAt: string
  members: Array<{
    id: number
    platformId: string
    /** 平台显示名（服务端 JOIN 出来的；平台被卸载时为 null，界面退回显示 id）。 */
    platformName: string | null
    title: string
    companyName: string | null
    city: string
    salaryRaw: string
    sourceUrl: string
    state: JobState
    isPrimary: boolean
  }>
}

export async function fetchDedupGroups(
  signal?: AbortSignal,
): Promise<{ items: DedupGroupDto[]; count: number }> {
  return await request<{ items: DedupGroupDto[]; count: number }>(
    '/dedup/groups',
    signal === undefined ? {} : { signal },
  )
}

/**
 * 单个去重分组（批次 4）。
 *
 * 岗位库按组折叠时，展开那一行才拉这一条 —— 而不是预取全部 200 个分组
 * （大多数行用户根本不会展开，预取等于每次翻页都传一遍全库的分组）。
 */
export async function fetchDedupGroup(
  groupId: number,
  signal?: AbortSignal,
): Promise<DedupGroupDto> {
  const result = await request<{ group: DedupGroupDto }>(
    `/dedup/groups/${String(groupId)}`,
    signal === undefined ? {} : { signal },
  )
  return result.group
}

/** 全库去重复核的结果（批次 4）。 */
export interface DedupSweepResultDto {
  /** 真的送去判定的岗位数（跳过已分组、没公司名的）。 */
  scanned: number
  /** 已经在某个分组里、这一轮没再判的岗位数。 */
  skippedGrouped: number
  merged: number
  newGroups: number
  candidates: number
  groups: number
  /** 复核之后的分组列表（界面直接重渲染，不用再请求一次）。 */
  items: DedupGroupDto[]
}

/** 触发一次**全库**去重复核。 */
export async function runDedupSweep(): Promise<DedupSweepResultDto> {
  return await request<DedupSweepResultDto>('/dedup/run', { method: 'POST', body: JSON.stringify({}) })
}

/** 把一个岗位从去重组里拆出（可逆：拆出后它独立成普通岗位）。 */
export async function splitDedupMember(groupId: number, jobId: number): Promise<void> {
  await request<{ ok: boolean }>(`/dedup/groups/${String(groupId)}/split`, {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  })
}

/** 删除整个去重组（组内岗位全部独立，不删岗位本身）。 */
export async function deleteDedupGroup(groupId: number): Promise<void> {
  await request<{ ok: boolean }>(`/dedup/groups/${String(groupId)}`, { method: 'DELETE' })
}

// ── 批次 F：箱线图 / 本地基准 / 简历 A/B ─────────────────────────────

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

export async function fetchFollowUps(signal?: AbortSignal): Promise<{ items: FollowUpDto[] }> {
  return await request<{ items: FollowUpDto[] }>('/followups', signal === undefined ? {} : { signal })
}

export async function fetchGreetingTemplates(
  signal?: AbortSignal,
): Promise<{ items: GreetingTemplateDto[] }> {
  return await request<{ items: GreetingTemplateDto[] }>('/greeting/templates', signal === undefined ? {} : { signal })
}

// ── 接触态 / 打招呼记录（§12.2 / D6）────────────────────────────────

export type { GreetingDto }

/** 人工标记接触态的结果。低危（只写本地库、不碰平台）。 */
export interface ContactStageUpdateDto {
  ok: boolean
  contactStage: ContactStage
  greetingId: number
  stageAt: string
  repliedAt: string | null
  /** 改之前是什么 —— 界面据此显示"从 X → Y"。 */
  previousStage: ContactStage
}

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

export type { AdapterConfigDto, GuardUsageDto, RepairDto, RepairListDto }

export async function fetchRepairs(platformId?: string, signal?: AbortSignal): Promise<RepairListDto> {
  const suffix = platformId === undefined || platformId === '' ? '' : `?platformId=${encodeURIComponent(platformId)}`
  return await request<RepairListDto>(`/repairs${suffix}`, signal === undefined ? {} : { signal })
}

/** 丢弃单条待修复记录（行保留、状态置 discarded，用于留痕）。 */
export async function discardRepair(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/repairs/${String(id)}/discard`, { method: 'POST', body: JSON.stringify({}) })
}

/** 清空某平台的待修复队列（改好选择器、确认新数据正常之后）。返回清掉了几条。 */
export async function clearRepairs(platformId: string): Promise<number> {
  const result = await request<{ ok: boolean; cleared: number }>('/repairs/clear', {
    method: 'POST',
    body: JSON.stringify({ platformId }),
  })
  return result.cleared
}

// ── 适配器配置覆盖（J2 / ADAPTERS.md §4）─────────────────────────

/** 读三层视图：代码默认 / DB 覆盖 / 实际生效。 */
export async function fetchAdapterConfig(platformId: string, signal?: AbortSignal): Promise<AdapterConfigDto> {
  return await request<AdapterConfigDto>(
    `/platforms/${encodeURIComponent(platformId)}/adapter-config`,
    signal === undefined ? {} : { signal },
  )
}

/** 写入覆盖并**热生效**（宿主会重建适配器）。`override: null` = 清除覆盖。 */
export async function updateAdapterConfig(platformId: string, override: unknown): Promise<AdapterConfigDto> {
  const result = await request<{ ok: boolean; config: AdapterConfigDto }>(
    `/platforms/${encodeURIComponent(platformId)}/adapter-config`,
    { method: 'PUT', body: JSON.stringify({ override }) },
  )
  return result.config
}

// ── 每日额度读数（D7 / U0「额度余量」）──────────────────────────

export async function fetchGuardUsage(platformId?: string, signal?: AbortSignal): Promise<GuardUsageDto> {
  const suffix = platformId === undefined || platformId === '' ? '' : `?platformId=${encodeURIComponent(platformId)}`
  return await request<GuardUsageDto>(`/guard/usage${suffix}`, signal === undefined ? {} : { signal })
}

// ── 数据保留、清理与可携带性（§18 / J8）────────────────────────

export type {
  ApplicationBatchItemDto,
  ApplicationBatchPlanDto,
  ApplicationBatchReceiptDto,
  ApplicationBatchResultDto,
  CleanupPlanDto,
  CleanupResultDto,
  DataExportFormat,
  DataImportResultDto,
  GreetingBatchPlanDto,
  GreetingBatchReceiptDto,
  GreetingBatchResultDto,
  RetentionPolicy,
  StorageUsageDto,
}

/** 磁盘占用（§18.3 P3）：真实文件大小 + 按表占用 + 按类型的行数。 */
export async function fetchStorage(signal?: AbortSignal): Promise<StorageUsageDto> {
  return await request<StorageUsageDto>('/maintenance/storage', signal === undefined ? {} : { signal })
}

/**
 * 清理预览（§18.3 P2，P0）：**只读、无副作用**，可以放心反复调。
 *
 * 界面必须先拉到它、把将删什么显示给用户，用户点过确认之后才发 `/maintenance/cleanup`。
 */
export async function previewCleanup(): Promise<CleanupPlanDto> {
  return await request<CleanupPlanDto>('/maintenance/cleanup/preview', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** 执行清理（不可逆）。`only` 只清这几类；缺省 = 预览里所有会执行的项。 */
export async function runCleanup(input: { only?: string[] } = {}): Promise<CleanupResultDto> {
  const result = await request<{ ok: boolean; result: CleanupResultDto }>('/maintenance/cleanup', {
    method: 'POST',
    body: JSON.stringify({ confirm: true, ...input }),
  })
  return result.result
}

/**
 * 导出的下载地址（直接给 `<a href>` 或 `window.open` 用）。
 *
 * 为什么不做成 `fetch` + Blob：导出的东西是文件，浏览器的原生下载更稳
 * （大文件不进 JS 堆、断点与文件名都交给浏览器）。与简历附件的打开方式一致。
 */
export function dataExportUrl(format: 'json' | 'csv' | 'archive'): string {
  return `${ROUTE_PREFIX}/data/export?format=${format}`
}

/** 导入岗位（CSV / JSON）。**幂等** —— 同一份表导两次只会更新。 */
export async function importJobsPayload(input: {
  format: 'csv' | 'json'
  content: string
}): Promise<DataImportResultDto> {
  const result = await request<{ ok: boolean; result: DataImportResultDto }>('/data/import', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.result
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
