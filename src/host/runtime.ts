/**
 * 宿主侧运行时装配（composition root）。
 *
 * 把各部件接起来：sqlite store、适配器注册表、全局互斥、浏览器管理器、领域服务、
 * 单实例租约、登录态、自排程器。入口层（http / tools）只跟这个门面打交道。
 *
 * **硬规则（§4.9）**：`apply()` 必须立即返回。所以数据层是**异步就绪**的：
 * `ready()` 返回一个 promise，而 apply 不 await 它；在它完成之前 `/health` 会如实报告
 * `dataReady: false` 与失败原因 —— 而不是让插件挂不上、或者让宿主启动被迁移拖慢。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DAILY_CRAWL_LIMIT,
  PHASE,
  PLUGIN_ID,
  REQUEST_DELAY_MAX_MS,
  REQUEST_DELAY_MIN_MS,
  ROUTE_PREFIX,
} from '../shared/constants.js'
import type {
  CrawlStatusDto,
  CrawlSummaryDto,
  DeadlineDto,
  GreetingDraftDto,
  HealthDto,
  LoginStatusDto,
  PlanDto,
  PlatformOverviewDto,
  SchedulerStatusDto,
  TodayDto,
} from '../shared/dto.js'
import type { AiService } from './ai/client.js'
import { createAiService } from './ai/client.js'
import type { LlmSourceLike, ModelSelectorLike } from './ai/llm-port.js'
import { createLlmPort } from './ai/llm-port.js'
import type { CompanyService } from './domain/companies.js'
import { createCompanyService } from './domain/companies.js'
import { runCrawl } from './domain/crawl.js'
import type { DedupSweepResult } from './domain/dedupe-sweep.js'
import { sweepDedup } from './domain/dedupe-sweep.js'
import type { JobService } from './domain/jobs.js'
import { createJobService } from './domain/jobs.js'
import type { PipelineService, FollowUpSuggestion } from './domain/pipeline.js'
import { createPipelineService } from './domain/pipeline.js'
import type { MessageService } from './domain/messages.js'
import { createMessageService } from './domain/messages.js'
import type { InterviewService } from './domain/interviews.js'
import { createInterviewService } from './domain/interviews.js'
import type { AnalyticsService } from './domain/analytics.js'
import { createAnalyticsService } from './domain/analytics.js'
import type { CampusService } from './domain/campus.js'
import { createCampusService } from './domain/campus.js'
import type { OverseasService } from './domain/overseas.js'
import { createOverseasService } from './domain/overseas.js'
import type { OutreachService } from './domain/outreach.js'
import { createOutreachService } from './domain/outreach.js'
import type { ResumeService } from './domain/resumes.js'
import { createResumeService, stripContacts } from './domain/resumes.js'
import { createPdfRenderer, type PdfRenderer } from './render/pdf.js'
import type { PlanService } from './domain/plans.js'
import { createPlanService } from './domain/plans.js'
import type { IntelService, MatchProfile } from './domain/intel.js'
import { createIntelService } from './domain/intel.js'
import { buildToday, buildTodayUnavailable } from './domain/today.js'
import type { ApprovalAnswer, ApprovalPort } from './guard/approval.js'
import { createApprovalPort, renderApproval } from './guard/approval.js'
import { sendGreeting, GREETING_SEND_ACTION, type GreetingSendResult } from './guard/actions/greeting.js'
import {
  sendApplication,
  APPLICATION_SEND_ACTION,
  type ApplicationSendResult,
} from './guard/actions/application.js'
import { syncInbox, INBOX_SYNC_ACTION, type InboxSyncResult } from './guard/actions/inbox.js'
import { sendReply, REPLY_SEND_ACTION, type ReplySendResult } from './guard/actions/reply.js'
import {
  probeContactStage,
  STAGE_PROBE_ACTION,
  type StageProbeResult,
} from './guard/actions/stage.js'
import { SETTINGS_WRITE_ACTION } from './guard/actions/settings.js'
import type { Guard } from './guard/index.js'
import { createGuard } from './guard/index.js'
import type { GuardToken } from './guard/token.js'
import type { Actor } from './guard/types.js'
import { createEventBus, type EventBus } from './http/sse.js'
import { createFiftyOneAdapter, mergeFiftyOneConfig } from './platform/adapters/fiftyone-job.js'
import { createGuopinAdapter, mergeGuopinConfig } from './platform/adapters/guopin.js'
import { createHiredChinaAdapter, mergeHiredChinaConfig } from './platform/adapters/hiredchina.js'
import { createLagouAdapter, mergeLagouConfig } from './platform/adapters/lagou.js'
import { createIndeedAdapter, mergeIndeedConfig } from './platform/adapters/indeed.js'
import { createLiepinAdapter, mergeLiepinConfig } from './platform/adapters/liepin.js'
import { createWaiqiAdapter, mergeWaiqiConfig } from './platform/adapters/waiqi-job.js'
import { createZhaopinAdapter, mergeZhaopinConfig } from './platform/adapters/zhaopin.js'
import { createZhipinAdapter, mergeZhipinConfig } from './platform/adapters/zhipin.js'
import { createSinoJobsAdapter, mergeSinoJobsConfig } from './platform/adapters/sinojobs.js'
import type { BrowserManager } from './platform/browser.js'
import { browserPageSource, createBrowserManager } from './platform/browser.js'
import { idleCloseMsOf, readBrowserConfig, writeBrowserConfig } from './browser-config.js'
import { readCrawlConfig, writeCrawlConfig } from './crawl-config.js'
import { citySupportOf } from './platform/cities.js'
import { readAdapterHealth } from './platform/health.js'
import { platformFacts } from './platform/platform-facts.js'
import { readPlatformRiskPause } from './platform/risk-pause.js'
import { readYieldSnapshot } from './platform/yield-baseline.js'
import type { LeaseManager } from './platform/lease.js'
import { createLease } from './platform/lease.js'
import type { PlatformLocks } from './platform/locks.js'
import { createPlatformLocks } from './platform/locks.js'
import { BurstGuard } from './platform/pacing.js'
import type { AdapterRegistry } from './platform/registry.js'
import { createAdapterRegistry } from './platform/registry.js'
import type { LoginFlow, SessionService } from './platform/session.js'
import { createLoginFlow, createSessionService, toAccountDto } from './platform/session.js'
import { adapterImplementationOf } from './platform/types.js'
import type { SearchCriteria } from './platform/types.js'
import { createScheduler, type PlatformGate, type Scheduler, type RunReason } from './scheduler/index.js'
import { cordisTimerPort, nativeTimerPort, type TimerLike, type TimerPort } from './scheduler/timer-port.js'
import type { ResumeContent } from '../shared/resume.js'
import type { SettingsPatch, SettingsService, SettingsSnapshot } from './settings.js'
import { createSettingsService, describeSettingsPatch } from './settings.js'
import { resolveDataDir } from './store/db.js'
import type { Store } from './store/store.js'
import { openStore } from './store/store.js'
import { toolExec } from './tools/exec-context.js'
import type { ToolRegistrationReport } from './tools/index.js'
import { DomainError, messageOf } from './util/errors.js'
import { assertNetworkAllowed, isOfflineMode, NO_NETWORK_ENV } from './util/offline.js'
import { systemClock } from './util/time.js'

export interface RuntimeLogger {
  info(message: string): void
  warn(message: string): void
}

export interface HostRuntimeOptions {
  dataDir?: string
  logger?: RuntimeLogger
  /** Cordis 的 timer 服务（可选）。缺失时退到原生定时器，而不是让调度不工作。 */
  timer?: TimerLike
  /**
   * `ctx.llm`（可选）。缺失时一切模型用途走规则/模板降级 —— 功能降级但不崩（J10、§4.5）。
   * 类型故意是 `unknown`：装配点是唯一需要形状断言的地方，其余代码只见 `LlmPort`。
   */
  llm?: unknown
  /** `ctx.agentDefaultModel`（可选）。用于解析默认的 provider/model 路由。 */
  defaultModel?: unknown
  /**
   * `ctx.approval`（可选）。**这是模型发起高危动作的唯一审批通道**（§22.4）。
   * 缺失时审批端口一律 fail-closed（拒绝）。
   */
  approval?: unknown
}

export interface RuntimeFailure {
  code: string
  message: string
  hint?: string
}

export interface HostRuntime {
  /** 异步就绪。幂等；失败不 reject（失败信息进 `failure()`）。 */
  ready(): Promise<void>
  isReady(): boolean
  failure(): RuntimeFailure | null
  /** 给 `/health` 用的快照。数据层没就绪时也安全返回。 */
  health(): HealthDto
  /** U0 今日聚合。 */
  today(): TodayDto
  crawlStatus(): CrawlStatusDto
  /** 手动触发一次抓取（走真实浏览器）。 */
  crawl(options: {
    platformId: string
    criteria: SearchCriteria
    planId?: number | null
    /** SR-28：触发原因，落进 `crawl_run.reason`（定时/人工/补跑）。 */
    reason?: RunReason
    /** SR-46：本轮的到点时刻（ISO）。调度器给；直接调（界面/工具）不传 = 无预算。 */
    deadlineAt?: string
  }): Promise<CrawlSummaryDto>
  /** B3/SR-30：全局一键暂停（**只停定时**，手动永远可用）。 */
  setSchedulePaused(paused: boolean, reason?: string): void
  /** SR-21：人工确认恢复风控暂停的方案。 */
  resumeRisk(planId: number): void
  /**
   * 重新检测一次租约（R20）。
   *
   * 为什么需要：界面在对方进程被关掉后仍会显示"另一个实例正在运行"，直到心跳过期
   * （默认 90 秒）。让用户干等并且没有任何反馈是糟糕的体验。
   * 这个动作只**重新读一次**并尝试接管（对方的租约真要过期了才会成功）——
   * 它绝不可能抢走一个还活着的实例的租约。
   *
   * @returns 检测后的调度状态（界面直接重渲染，不用再请求一次）
   */
  recheckLease(): SchedulerStatusDto
  /**
   * 人工**接管**租约（R20 的逃生出口）。
   *
   * **只在对方心跳已过期时才允许**：一个还活着的实例绝不能被抢走租约，
   * 否则两个调度器会同时抓取、抢同一个浏览器 profile —— 那正是 R20 要防的事。
   * 所以这个动作的语义是"我确认那个实例已经死了"，而不是"我要强抢"。
   * 对方还活着时它**如实拒绝**并告诉用户该怎么办。
   */
  takeoverLease(): SchedulerStatusDto
  /** 实时事件总线（ADR-24：事件只作提示）。 */
  events(): EventBus

  /** 情报引擎（P4）。 */
  intel(): IntelService

  // ── P5：安全与工具 ─────────────────────────────────────────────
  /** 安全闸门。**唯一**的危险动作入口（GUI 与模型工具共用同一实例）。 */
  guard(): Guard
  /** 模型服务（含隐私闸门与调用留痕）。数据层没就绪时抛 `DATA_UNAVAILABLE`。 */
  ai(): AiService
  /** 话术生成（只生成，不发送）。 */
  outreach(): OutreachService
  settings(): SettingsService
  /** 生成话术草稿（不发送）。`tone` 与 `highlights` 可选。 */
  draftGreeting(input: {
    jobId: number
    tone?: 'formal' | 'warm' | 'concise'
    highlights?: string[]
    extra?: string
  }): Promise<GreetingDraftDto>
  /**
   * 发送打招呼 —— **高危**（§22.4）。
   *
   * `actor === 'gui'` 且 `guiConfirmed !== true` 时抛 `ConfirmRequiredError`（不是拒绝），
   * 界面上把确认文案显示给用户，用户同意后带 `guiConfirmed: true` 重发。
   * 模型发起时走 `ctx.approval`；`guiConfirmed` 由模型设置会被直接拒绝。
   */
  sendGreeting(input: {
    jobId: number
    text?: string
    actor: Actor
    guiConfirmed?: boolean
  }): Promise<GreetingSendResult>
  /**
   * 回复一条 HR 消息 —— **高危**（§22.4），走 `message.reply` 闸门，**真的发到平台上**。
   *
   * 与 `messages().record()` 的区别：那是"记一笔我说过的话"，这是**真的发出去**。
   * 本地那条记录由闸门动作在**发送成功之后**写入 —— 所以不会再出现
   * "界面说已回复、平台上什么都没有"（2026-09-18 修正的正是这一点）。
   */
  replyToMessage(input: {
    messageId: number
    content: string
    actor: Actor
    guiConfirmed?: boolean
  }): Promise<ReplySendResult>
  /**
   * 同步收件箱 —— 把平台会话列表读进本地消息表（§13 U6）。
   *
   * **低危**（不对外发任何东西），但仍经闸门：它会开一个真实浏览器页面访问平台。
   * `actor === 'model'` 也不会被要求审批（低危不打扰用户）。
   */
  syncInbox(input: { platformId: string; actor: Actor }): Promise<InboxSyncResult>
  /**
   * 探测某岗位在平台上的接触阶段（§13 U6 的「已读 / 已回」）。
   *
   * **低危**（只看不发），但仍经闸门：它会开一个真实浏览器页面。模型发起也不打扰用户。
   *
   * ⚠️ **只报事实、不改状态**（识别 ≠ 改状态，§4.3）：`stage` 是平台上看到的东西，
   * 本地那条接触态不会被它改动 —— 误判一次就会让一个真在推进的岗位被漏掉。
   * `stage === null` = 判不出来（会话不在列表里 / 状态标记认不出来），**不猜**。
   */
  probeContactStage(input: { jobId: number; actor: Actor }): Promise<StageProbeResult>
  /**
   * 投递简历 —— **高危**（§22.4），走 `application.send` 闸门。
   *
   * 与 `pipeline.recordApplication` 的区别：那是"记一笔我投了"，这是**真的投出去**。
   * `filePath` 省略/null = 用平台内简历（BOSS 求职者网页端只支持这种）。
   */
  sendApplication(input: {
    jobId: number
    filePath?: string | null
    actor: Actor
    guiConfirmed?: boolean
  }): Promise<ApplicationSendResult>
  /** 写插件配置。走 `settings.write` 闸门。 */
  updateSettings(patch: SettingsPatch, actor: Actor, guiConfirmed?: boolean): Promise<SettingsSnapshot>

  // ── P6：简历 ───────────────────────────────────────────────────
  /** 简历服务（版本、定制、附件生成）。 */
  resumes(): ResumeService
  /** 附件根目录（`<dataDir>/files`）。 */
  filesDir(): string
  /** PDF 渲染器是否在跑（诊断用；空闲时会自动关闭）。 */
  pdfRendererRunning(): boolean

  // ── P7：跟进与看板 ─────────────────────────────────────────────
  pipeline(): PipelineService
  messages(): MessageService
  interviews(): InterviewService
  analytics(): AnalyticsService
  /** 跟进建议（未读超时 / 已读未回超时是**两条不同分支**，§12.2）。 */
  followUps(): FollowUpSuggestion[]
  /** 未读消息数（U0 与侧栏角标用）。 */
  unreadCount(): number

  // ── P8：校招与海外支线 ─────────────────────────────────────────
  campus(): CampusService
  overseas(): OverseasService
  /**
   * 所有**不可逆硬截止**（笔试截止 / 网申截止 / 三方签署）。
   *
   * U0 与待办系统只认这一种为 urgent —— 校招的笔试错过就出局（§12.7 / 决策记录第 3 条）。
   */
  deadlines(): DeadlineDto[]
  /** 审批通道是否可用（诊断与 `/health` 用）。 */
  approvalAvailable(): boolean
  /**
   * 记下模型工具的注册结果（由插件入口在注册后调用）。
   *
   * 为什么要在 `/health` 里暴露：工具静默少了一个是"模型忽然做不到某件事"里最难查的原因。
   * 实测就是靠这一条发现了与宿主 `job_list` 的重名。
   */
  setToolReport(report: ToolRegistrationReport): void
  /** 当前工具注册结果；还没注册时为 null。 */
  toolReport(): ToolRegistrationReport | null

  // ── P3 ──────────────────────────────────────────────────────────
  plans(): PlanService
  schedulerStatus(): SchedulerStatusDto
  runPlan(planId: number, reason: Exclude<RunReason, 'schedule'>): Promise<CrawlSummaryDto>
  /** 直接驱动一次到期检查（测试与诊断用；生产走定时器）。 */
  schedulerTick(): Promise<void>
  platforms(): PlatformOverviewDto[]
  loginStatuses(): LoginStatusDto[]
  startLogin(platformId: string): LoginStatusDto
  closeTodo(id: number): boolean

  store(): Store | undefined
  jobs(): JobService | undefined
  companies(): CompanyService | undefined
  /**
   * 全库去重复核（批次 4）。
   *
   * 放在 runtime 上而不是让每个入口各自调 `sweepDedup`：三条入口（GUI / 模型工具 / HTTP）
   * 必须走**同一份实现**，否则"界面复核了、工具复核的是另一套"——正是 SR-45 那条纪律。
   */
  sweepDedup(): DedupSweepResult
  registry(): AdapterRegistry
  /** 按平台互斥（同平台串行 / 跨平台并发）。见 platform/locks.ts。 */
  locks(): PlatformLocks
  browser(): BrowserManager
  /** 同步收尾：停调度、关库、放租约、发起关闭浏览器（不阻塞调用方）。 */
  close(): void
}

/** 数据层未就绪时的统一错误。 */
export function dataNotReady(runtime: HostRuntime): DomainError {
  const failure = runtime.failure()
  return new DomainError('DATA_UNAVAILABLE', failure?.message ?? '数据层尚未就绪', {
    ...(failure?.hint === undefined ? {} : { hint: failure.hint }),
  })
}

/** 从包清单读版本；读不到就退化，绝不因此让插件挂不上。 */
function readVersion(): string {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** 租约心跳间隔。比 `LEASE_STALE_MS` 小得多，留足抖动余量。 */
const HEARTBEAT_MS = 30_000

export function createHostRuntime(options: HostRuntimeOptions = {}): HostRuntime {
  const logger = options.logger
  const startedAt = Date.now()
  const version = readVersion()
  const dataDir = resolveDataDir(options.dataDir)
  const clock = systemClock
  const timerPort: TimerPort = options.timer === undefined ? nativeTimerPort() : cordisTimerPort(options.timer)

  const registry = createAdapterRegistry()
  const platformLocks = createPlatformLocks()
  /**
   * 突发惩罚守卫按平台记忆（跨平台并发后各平台各一份窗口，跨轮次连续）。
   * 见 crawl.ts 对 `createBurstGuard` 的说明 —— 那里记着为什么必须共享。
   */
  const burstGuards = new Map<string, BurstGuard>()
  const bus = createEventBus()
  const lease: LeaseManager = createLease({
    path: join(dataDir, 'lease.json'),
    pid: process.pid,
    label: PLUGIN_ID,
  })
  const browser = createBrowserManager({
    profileDir: join(dataDir, 'browser-profile'),
    ...(logger === undefined ? {} : { logger }),
    /* 空闲自关（NFR-7 / C12）。
       idleCloseMs 由设置决定，但**设置存在 store 里，而 store 要等租约拿到才打开**
       （见下面 `opened = openStore(...)`）—— 所以这里先不传时长，
       等 store 就绪后立即 `browser.setIdleCloseMs(...)` 一次。
       守卫用闭包读**调用时**的状态，因此不必关心初始化顺序。 */
    shouldKeepAlive: (): boolean => {
      // 登录引导轮询中：那是用户正在输密码的窗口，绝不能关
      if (loginFlow?.isRunning() === true) return false
      // 采集 / 补跑进行中：任一平台锁被持有（并发下只要还有一条泳道在跑就不算空闲）
      if (platformLocks.busy()) return false
      return true
    },
  })

  let store: Store | undefined
  let jobs: JobService | undefined
  let companies: CompanyService | undefined
  let plans: PlanService | undefined
  let session: SessionService | undefined
  let loginFlow: LoginFlow | undefined
  let scheduler: Scheduler | undefined
  let intel: IntelService | undefined
  let guard: Guard | undefined
  let ai: AiService | undefined
  let outreach: OutreachService | undefined
  let settings: SettingsService | undefined
  let resumes: ResumeService | undefined
  let pipeline: PipelineService | undefined
  let messages: MessageService | undefined
  let interviews: InterviewService | undefined
  let analytics: AnalyticsService | undefined
  let campus: CampusService | undefined
  let overseas: OverseasService | undefined
  const pdfRenderer: PdfRenderer = createPdfRenderer({
    ...(logger === undefined ? {} : { logger }),
  })
  let toolReport: ToolRegistrationReport | null = null
  let heartbeatCancel: (() => void) | null = null
  let failure: RuntimeFailure | null = null
  let readyPromise: Promise<void> | undefined

  // ── P5：审批端口 ────────────────────────────────────────────────────
  // 模型发起的高危动作只有一条审批通道：`ctx.approval.request`。
  // 它要求 `agent` + `toolName`，而那两样只有工具执行期间才知道，
  // 所以这里从 AsyncLocalStorage 取（见 tools/exec-context.ts）。
  const approvalService = options.approval
  const approvalIsUsable = (): boolean =>
    approvalService !== undefined && toolExec.current() !== undefined

  const approvalPort: ApprovalPort = createApprovalPort({
    available: approvalIsUsable,
    ask: async (request): Promise<ApprovalAnswer> => {
      const exec = toolExec.current()
      if (approvalService === undefined) throw new Error('宿主没有 approval 服务')
      if (exec === undefined) throw new Error('不在工具调用上下文里，无法弹出审批')
      const outcome = await (
        approvalService as {
          request(input: {
            agent: unknown
            toolName: string
            callId?: string
            reason?: string
            signal?: AbortSignal
          }): Promise<string>
        }
      ).request({
        agent: exec.agent,
        toolName: exec.toolName,
        ...(exec.callId === undefined ? {} : { callId: exec.callId }),
        // 审批文案就是 `renderApproval` 的结果（含发起者/平台/目标/正文全文/简历版本）
        reason: renderApproval(request),
        ...(exec.signal === undefined ? {} : { signal: exec.signal }),
      })
      // **如实区分**三种"没放行"：宿主说没有应答者，不等于"用户拒绝了"。
      // 真实模型在 headless 里跑的时候正是这一点读不出来 —— 它只看到"用户未批准"，
      // 而真相是那个环境根本没有审批界面（该走 fail-closed + 建待办，而不是当成用户的决定）。
      switch (outcome) {
        case 'allowed-once':
          return true
        case 'rejected':
          return false
        case 'cancelled':
          return 'cancelled'
        default:
          // 'unavailable' 以及任何宿主将来新增的未知取值，一律按"没问到"处理（fail-closed）
          return 'unavailable'
      }
    },
  })

  /** 是否允许调度：数据层就绪 **且** 持有单实例租约（R20）。 */
  const canSchedule = (): boolean => store !== undefined && lease.held()

  /** SR-44：读方案上的后处理开关。没有方案（裸抓一次）时按默认全开。 */
  const postProcessForPlan = (planId: number | null): { score: boolean; flag: boolean; dedup: boolean } => {
    if (planId === null) return { score: true, flag: true, dedup: true }
    return store?.plan.get(planId)?.postProcess ?? { score: true, flag: true, dedup: true }
  }

  /**
   * SR-20：这个平台自己的冷却截止（ISO）。`null` = 没在冷却。
   *
   * 抽出来是因为**它有两个读者**：`platformGate`（据此拦）与平台总览矩阵（据此显示）。
   * 两处各写一遍必然漂移，而这类漂移最难发现：矩阵写着"可以"，到点却被挡住。
   */
  const cooldownUntilOf = (platformId: string): string | null => {
    const opened = store
    if (opened === undefined) return null
    const cooldown = opened.setting.get<{ until?: string }>('cooldown-until', 'platform', platformId)
    if (cooldown === null || typeof cooldown !== 'object') return null
    const until = typeof cooldown.until === 'string' ? cooldown.until : null
    if (until === null) return null
    const at = new Date(until).getTime()
    return Number.isNaN(at) ? null : new Date(at).toISOString()
  }

  /**
   * SR-3：今天这个平台已经自动跑了几轮 / 上限。**同上：两个读者共用一份算法。**
   *
   * 只算**自动**触发的那些：手动是人在操作，不该被这条挡住（SR-3 的例外）。
   */
  const crawlQuotaOf = (platformId: string): { used: number; limit: number } => {
    const opened = store
    if (opened === undefined) return { used: 0, limit: DAILY_CRAWL_LIMIT }
    const today = clock().slice(0, 10)
    const used = opened.crawlRun
      .list(200, platformId)
      .filter((run) => run.startedAt.slice(0, 10) === today && run.reason !== 'manual').length
    return { used, limit: DAILY_CRAWL_LIMIT }
  }

  /**
   * SR-16：**每平台独立**检查前置条件。
   *
   * 这是一个**纯判定**函数（不发请求、不改状态）—— 它回答的正是用户最想知道的那个问题：
   * 「为什么今天没跑？」。所以它的返回值直接进界面文案（SR-17/26）。
   *
   * 顺序：离线闸门 → **平台级风控暂停** → 适配器健康 → 登录态 → 每平台冷却 → 每日配额。
   * 顺序有讲究：越"根本、越不可能自愈"的原因越先报，
   * 否则"没到点/配额"这类会盖住"你的适配器已经坏了"。
   *
   * 风控暂停紧跟在离线闸门之后，是为了**保持迁移前的可见行为**：
   * 旧实现里方案级 `riskPaused` 也先于平台 gate 判定，于是"连续失败达阈值时
   * health 同时变 broken"的场合，用户看到的一直是 `risk_paused`。
   */
  const platformGate: PlatformGate = (platformId, options) => {
    const opened = store
    if (opened === undefined) return 'lease_lost'
    // 离线闸门（§14）：开了就**绝不**发起真实访问
    if (isOfflineMode()) return 'offline_gate'

    // SR-21：**平台级**风控暂停（真值在 `platform/risk-pause.ts`）。
    // 补跑（catch-up）是用户看到欠账后显式点的，按既有例外放行。
    if (options?.ignoreRiskPause !== true && readPlatformRiskPause(opened, platformId).paused) {
      return 'risk_paused'
    }

    const adapter = registry.get(platformId)
    if (adapter === undefined) return 'adapter_broken'

    // 城市档（city_unsupported）：方案配了城市而**这个平台不认识它** ——
    // 配置层面的必败（buildSearchUrl 会直接拒绝，不猜城市码）。
    // 以前这种平台每个调度日真跑一次、烧一条注定失败的 crawl_run 再进冷却；
    // 现在门前拦下、带原因留痕。放在健康/登录之前：它**永远不会自愈**，
    // 只有用户改方案才会变 —— 越根本的原因越先报。
    const city = options?.city
    if (city !== undefined && city !== '' && citySupportOf(adapter, city) === 'unsupported') {
      return 'city_unsupported'
    }

    const health = readAdapterHealth(opened, platformId)
    if (health.health === 'broken') return 'adapter_broken'

    // 登录态：只有"确实被登录墙挡过"才算未登录。
    // 全新安装时 account_state 是空的（logged_in=0），但 51job 的搜索本来就不需要登录 ——
    // 把"从没检查过"当成"没登录"会让定时任务永远不跑，那是个很隐蔽的死锁。
    const account = opened.account.get(platformId)
    if (account !== undefined && !account.loggedIn && account.lastCheckAt !== null) return 'not_logged_in'

    // SR-20/23：**每平台独立冷却** —— 这个平台刚失败过就先别去碰它。
    // 判定放在这里（而不是调度器里）是因为这里已经是"每平台前置条件"的唯一入口，
    // 写冷却在调度器（它才知道哪一轮失败了），读冷却在这里。
    const cooldownUntil = cooldownUntilOf(platformId)
    if (cooldownUntil !== null && new Date(cooldownUntil).getTime() > new Date(clock()).getTime()) {
      return 'backoff'
    }

    // SR-3：每日上限（只算自动触发的那些；手动是人在操作，不该被这条挡住）
    const quota = crawlQuotaOf(platformId)
    if (quota.used >= quota.limit) return 'quota_reached'

    return null
  }

  /** 当前启用简历的标识；没有简历时是 `{null, 0}`（此时分数一律算作"无简历基准"）。 */
  const currentResumeStamp = (): { resumeId: number | null; rev: number } =>
    resumes?.scoreStamp() ?? { resumeId: null, rev: 0 }

  /** 从当前简历派生匹配偏好（§4.5.1：简历是最诚实的偏好声源）。 */
  const resumeProfile = (): Partial<MatchProfile> | undefined => {
    const current = resumes === undefined ? undefined : safeDefaultResume(resumes)
    if (current === undefined) return undefined
    const content = current.content
    const keywords = [
      ...content.skills.slice(0, 15).map((skill) => skill.name),
      ...content.basics.title.split(/[\s/、,，]+/),
    ].filter((token) => token.trim() !== '')
    return {
      keywords: [...new Set(keywords)].slice(0, 20),
      cities: content.basics.city === undefined ? [] : [content.basics.city],
    }
  }

  const readOnlyReason = (): string | null => {
    if (store === undefined) return failure?.message ?? '数据层尚未就绪'
    if (!lease.held()) {
      const status = lease.status()
      return `另一个实例正在运行（pid ${String(status.pid ?? '?')}）`
    }
    return null
  }

  /**
   * 把 24 小时以内的硬截止同步进待办（§12.7 / 决策记录第 3 条）。
   *
   * 两件事必须一起做，否则这条提醒本身就是坏的：
   *   * **周期性地跑** —— 只在数据层打开时跑一次的话，用户今天刚建的笔试根本进不了待办，
   *     要等到下次重启才出现，而"错过即终态"的提醒晚一天就等于没有；
   *   * 标题里的"剩 N 小时"要**跟着时间更新** —— `createOnce` 命中已有待办时直接返回、
   *     不改文案，一条已经过期两小时的笔试还写着"剩 3 小时"，比没有提醒更糟。
   * 所以命中已有待办时不能只靠 `createOnce` 跳过：文案变了就先关掉再重建。
   */
  const syncDeadlineTodos = (): void => {
    const opened = store
    const service = campus
    if (opened === undefined || service === undefined) return
    try {
      const now = clock()
      const existing = new Map(
        opened.todo.listOpen({ kind: 'deadline', limit: 200 }).map((todo) => [todo.ref ?? '', todo]),
      )
      for (const deadline of service.deadlines()) {
        const ref = `${deadline.kind}:${String(deadline.refId)}`
        const open = existing.get(ref)
        if (!deadline.urgent) {
          // 不再紧急（或已处理）就收掉，别留一条永远不消的提醒
          if (open !== undefined) opened.todo.closeByRef('deadline', ref, now)
          continue
        }
        const title = `${deadline.label}（${deadline.overdue ? '已过期' : `剩 ${String(deadline.hoursLeft)} 小时`}）`
        if (open !== undefined && open.title === title) continue
        if (open !== undefined) opened.todo.closeByRef('deadline', ref, now)
        opened.todo.createOnce(
          {
            kind: 'deadline',
            level: 'urgent',
            title,
            ref,
            detail: {
              kind: deadline.kind,
              refId: deadline.refId,
              dueAt: deadline.dueAt,
              irreversible: deadline.irreversible,
              hint: '校招的笔试/网申/三方错过就是终态，没有第二次机会。',
            },
          },
          now,
        )
      }
    } catch (error) {
      logger?.warn(`[${PLUGIN_ID}] 硬截止同步待办失败（不影响其它功能）：${messageOf(error)}`)
    }
  }

  /** 拿到租约后要做的事（心跳里可能晚一步才拿到）。 */
  let onLeaseAcquired: (() => void) | null = null

  /** 心跳用 after 自链，两种 TimerPort 都能干净取消（C15）。 */
  const startHeartbeat = (): void => {
    const beat = (): void => {
      if (lease.held()) {
        lease.heartbeat()
        // 硬截止待办跟着心跳走：新截止要能进待办，旧待办的数字也要跟着时间变
        syncDeadlineTodos()
      } else {
        // 只读实例不能就此躺平：上一个实例可能已经被强杀，
        // 等它的心跳过期后我们要能自己接管，而不是必须重启。
        const verdict = lease.acquire()
        if (verdict.held) {
          logger?.info(
            `[${PLUGIN_ID}] 已接管租约（上一次持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期），开始调度`,
          )
          bus.publish('lease.acquired', { pid: process.pid })
          onLeaseAcquired?.()
        }
      }
      heartbeatCancel = timerPort.after(HEARTBEAT_MS, beat)
    }
    heartbeatCancel = timerPort.after(HEARTBEAT_MS, beat)
  }

  const openDataLayer = (): void => {
    // 注意作用域：`opened` 必须在 try 之外可见 —— 下面租约与调度都要用它
    let opened: Store
    try {
      opened = openStore({
        ...(options.dataDir === undefined ? {} : { dataDir: options.dataDir }),
        ...(logger === undefined ? {} : { logger }),
      })
    } catch (error) {
      const domain = error instanceof DomainError ? error : undefined
      failure = {
        code: domain?.code ?? 'INTERNAL',
        message: messageOf(error),
        ...(domain?.hint === undefined ? {} : { hint: domain.hint }),
      }
      logger?.warn(`[${PLUGIN_ID}] 数据层启动失败：${failure.message}`)
      bus.publish('data.failed', { message: failure.message, code: failure.code })
      // 故意不抛出：数据层挂了插件仍要挂上去，
      // 好让 /health 与面板能告诉用户「为什么没有数据」，而不是静默消失。
      return
    }

    store = opened

    // 设置存在库里，而库要等租约拿到才打开 —— 所以空闲关闭时长在这里才装上。
    // 用户改设置时 settings 服务会再调一次 setIdleCloseMs，无需重启。
    try {
      const browserRuntimeConfig = readBrowserConfig(opened)
      browser.setIdleCloseMs(idleCloseMsOf(browserRuntimeConfig))
      // D-17a 环境一致性：引擎偏好与 stealth 注入开关（浏览器未启动时立即生效，
      // 已启动则等空闲自关后的下一次启动生效）。
      browser.applyRuntimeConfig({
        engine: browserRuntimeConfig.engine,
        stealthInit: browserRuntimeConfig.stealthInit,
      })
    } catch (error) {
      logger?.warn(`[${PLUGIN_ID}] 读取浏览器设置失败：${messageOf(error)}`)
    }

    // SR-15（A3）：**崩溃安全**。进程被强杀时 `finish()` 没机会执行，
    // 那条 crawl_run 会永远停在 `running`，于是界面上永远显示"正在跑"。
    // 启动时收敛超阈值的悬挂记录；没找到就什么都不做（正常启动的代价为零）。
    try {
      const reaped = opened.crawlRun.reapStale(clock())
      if (reaped > 0) {
        logger?.warn(
          `[${PLUGIN_ID}] 收敛了 ${String(reaped)} 条悬挂的抓取记录（上次进程在结束前退出）—— 已置为 failed`,
        )
      }
    } catch (error) {
      logger?.warn(`[${PLUGIN_ID}] 收敛悬挂抓取记录失败（不影响其它功能）：${messageOf(error)}`)
    }

    // 简历服务要先建：匹配分要读"当前简历版本"，而 jobs/intel 都需要它（§4.1）
    const filesDirPath = join(dataDir, 'files')
    resumes = createResumeService({
      store: opened,
      filesDir: filesDirPath,
      clock,
      ai,
      pdf: pdfRenderer,
      ...(logger === undefined ? {} : { logger }),
    })
    jobs = createJobService(opened, { scoreStamp: () => currentResumeStamp() })
    companies = createCompanyService(opened)
    // 注册表传进去：方案的平台与筛选条件必须按**适配器声明**校验（SR-39/41/42/45）
    plans = createPlanService(opened, clock, registry)
    session = createSessionService(opened, clock)

    // 适配器配置以 DB 为权威（ADR-19）：DB 覆盖合并到代码默认值之上
    const override = opened.setting.get<unknown>('adapter-config', 'platform', '51job')
    registry.register(
      createFiftyOneAdapter({
        config: mergeFiftyOneConfig(override),
        // P5：请求之间要随机延时，别踩出规律性的节奏
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 51job 已注册（配置来源：${override === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // 拉勾（lagou.com）：列表公开可爬，但被 WAF 滑块挡门（antiBot=high）——
    // 关键词进路径段、城市用中文名；翻页读「下一页」真实 href，不自己拼拼音 slug。
    // 详见适配器文件头。
    const lagouOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'lagou')
    registry.register(
      createLagouAdapter({
        config: mergeLagouConfig(lagouOverride),
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 lagou 已注册（配置来源：${lagouOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // 神仙外企（waiqi.com）：列表走接口、DOM 不承载岗位数据 —— 详见适配器文件头。
    const waiqiOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'waiqi')
    registry.register(
      createWaiqiAdapter({
        config: mergeWaiqiConfig(waiqiOverride),
        // P5：请求之间要随机延时，别踩出规律性的节奏
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 waiqi 已注册（配置来源：${waiqiOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // 智联招聘（zhaopin.com）：搜索页是 /sou/jl<城市码>，**不是** /jobs?jl= 那条老路由 ——
    // 两条路由的 DOM 完全不同，详见适配器文件头。
    const zhaopinOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'zhaopin')
    registry.register(
      createZhaopinAdapter({
        config: mergeZhaopinConfig(zhaopinOverride),
        // P5：请求之间要随机延时，别踩出规律性的节奏
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 zhaopin 已注册（配置来源：${zhaopinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // 猎聘（liepin.com）：风控最强（检测"CDP 控制页面"本身）—— 依赖 D-17a
    // 环境一致性三件套（patchright 引擎 + stealth 注入 + 端口守卫，平台层已就位）。
    // 适配器只做 URL 导航 + 语义锚点解析 + 判墙即停；锚点待 probe:liepin 夹具校准。
    const liepinOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'liepin')
    registry.register(
      createLiepinAdapter({
        config: mergeLiepinConfig(liepinOverride),
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 liepin 已注册（配置来源：${liepinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // BOSS 直聘（zhipin.com）：与猎聘同路线（D-17a 三件套）。2026-09-18 夹具校准：
    // 未登录可搜（薪资隐藏 → requiredFields 不含 salary_raw）；详情选择器来自
    // BossHunter site-patterns（2026-05-26 验证）。
    const zhipinOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'zhipin')
    registry.register(
      createZhipinAdapter({
        config: mergeZhipinConfig(zhipinOverride),
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 zhipin 已注册（配置来源：${zhipinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // Indeed（cn.indeed.com）：⚠️ 中国大陆站 2022 起停运，2026-09-18 实测搜索入口
    // 302 重定向到 www.indeed.com 并被 Cloudflare 验证墙拦截。适配器按 Indeed JCS
    // 稳定语义锚点实现，判墙即停（captcha/blank）；默认 host=cn.indeed.com 不可用，
    // 需配 DB 覆盖换仍运营的域（如 sg/de.indeed.com）并校准夹具后才真实启用。
    const indeedOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'indeed')
    registry.register(
      createIndeedAdapter({
        config: mergeIndeedConfig(indeedOverride),
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 indeed 已注册（配置来源：${indeedOverride === undefined ? '代码默认' : 'DB 覆盖'}${
        indeedOverride === undefined ? '；⚠️ 中国大陆站已停运，默认 host 不可用' : ''
      }）`,
    )

    // 国聘网（iguopin.com）：「国聘行动」官方平台，央企/国企/事业单位为主。
    // 2026-09-18 真实线上调研（列表页 /jobList?keyword=，详情 /job/detail?id=）。
    // v1 语义锚点单页采集：分页参数与城市码未确证，**不编** —— 见适配器文件头。
    const guopinOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'guopin')
    registry.register(
      createGuopinAdapter({
        config: mergeGuopinConfig(guopinOverride),
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 guopin 已注册（配置来源：${guopinOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // HiredChina（hiredchina.com）：面向在华外国人的招聘平台（eChinacities 同源）。
    // 2026-09-18 真实调研 + 浏览器探针校准：列表 `/<lang>/jobs` 是 Next.js RSC 服务端渲染
    // （可抓 DOM，无需页面内调接口）；卡片字段按 Tailwind 底色徽章区分；翻页 `?page=N` 已实测。
    // 主站 www.hiredchina.com raw HTTP 会吃 Cloudflare managed challenge（真浏览器 + 登录态可过）；
    // 探针/夹具走同源子域 hcweb.gicexpat.com（不拦截）。城市筛选参数未确证 → v1 不筛 —— 见适配器文件头。
    const hiredchinaOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'hiredchina')
    registry.register(
      createHiredChinaAdapter({
        config: mergeHiredChinaConfig(hiredchinaOverride),
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 hiredchina 已注册（配置来源：${hiredchinaOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // SinoJobs 中欧招聘（sinojobs.com.cn）：中欧双向求职平台，岗位多为德企/欧洲企业在华
    // 与海外职位。列表**不在 DOM 里**（AJAX 渲染）—— 与 waiqi 同款「页面内调接口」路线，
    // `POST /Recruitment/indexAjaxPage.html` 匿名可读、可翻页、筛选参数全部实测生效。
    const sinojobsOverride = opened.setting.get<unknown>('adapter-config', 'platform', 'sinojobs')
    registry.register(
      createSinoJobsAdapter({
        config: mergeSinoJobsConfig(sinojobsOverride),
        // P5：请求之间要随机延时，别踩出规律性的节奏
        delayRangeMs: [REQUEST_DELAY_MIN_MS, REQUEST_DELAY_MAX_MS],
      }),
    )
    logger?.info(
      `[${PLUGIN_ID}] 适配器 sinojobs 已注册（配置来源：${sinojobsOverride === undefined ? '代码默认' : 'DB 覆盖'}）`,
    )

    // 平台实体随适配器注册一起登记：account_state 有指向 platform 的外键，
    // 而用户可能在第一次抓取之前就先点「登录」。
    for (const adapter of registry.list()) {
      opened.platform.ensure(
        { id: adapter.id, displayName: adapter.displayName, capabilities: adapter.capabilities },
        clock(),
      )
    }

    // 情报引擎（P4）：先幂等播种内置词表，再装配服务
    intel = createIntelService(opened, clock, {
      resumeProfile,
      scoreStamp: currentResumeStamp,
    })
    const seeded = intel.seedDictionary()
    if (seeded > 0) logger?.info(`[${PLUGIN_ID}] 已播种 ${String(seeded)} 条内置词表`)

    // ── P5：安全与模型层 ────────────────────────────────────────────
    guard = createGuard({
      store: opened,
      session,
      approval: approvalPort,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })

    // 模型端口可能压根不存在（用户没配模型）—— 那就一切走降级，而不是让插件挂不上
    const llmPort =
      options.llm === undefined
        ? undefined
        : createLlmPort({
            llm: options.llm as LlmSourceLike,
            ...(options.defaultModel === undefined
              ? {}
              : { defaultModel: options.defaultModel as ModelSelectorLike }),
            onWarn: (message: string) => logger?.warn(`[${PLUGIN_ID}] ${message}`),
          })

    ai = createAiService({
      store: opened,
      llm: () => llmPort,
      onDegrade: (info) => {
        // 降级必须可见：用户要能知道"这次给你的不是模型结果"（J10）
        logger?.info(`[${PLUGIN_ID}] 模型用途 ${info.purpose} 降级：${info.reason}`)
        bus.publish('llm.degraded', { purpose: info.purpose, reason: info.reason })
      },
    })

    outreach = createOutreachService({
      store: opened,
      ai,
      ...(logger === undefined ? {} : { logger }),
      onInjection: (info) => {
        logger?.warn(
          `[${PLUGIN_ID}] 岗位 ${String(info.jobId)} 的 JD 命中疑似提示注入：` +
            info.hits.map((hit) => `${hit.name}(${hit.sample})`).join(' / '),
        )
        bus.publish('ai.injection.suspected', {
          jobId: info.jobId,
          hits: info.hits.map((hit) => hit.name),
        })
      },
    })

    settings = createSettingsService({
      store: opened,
      ai,
      clock,
      browser: {
        read: () => readBrowserConfig(opened),
        // 写完立刻作用到浏览器实例上：改设置不该要求重启插件
        write: (patch) => {
          const next = writeBrowserConfig(opened, patch, clock())
          browser.setIdleCloseMs(idleCloseMsOf(next))
          browser.applyRuntimeConfig({ engine: next.engine, stealthInit: next.stealthInit })
          return next
        },
      },
      crawl: {
        // 单轮预算落库即可 —— 调度器每次开轮都通过 roundBudgetMs 读一次，天然即时生效
        read: () => readCrawlConfig(opened),
        write: (patch) => writeCrawlConfig(opened, patch, clock()),
      },
    })

    // ── P7：跟进与看板 ──────────────────────────────────────────────
    // guardRun 把"走闸门"这件事以回调形式注进去，领域层因此不需要 import guard
    // （依赖方向保持 domain ← guard，而不是互相依赖）。
    // `fn` 收一次性令牌：领域层若真要执行对外动作（而不是只写本地库），
    // 必须把令牌一路传到 `guard/actions/*` 的实现在首行校验 —— 否则那个实现会拒绝执行。
    const guardRun = async <T>(
      input: {
        action: string
        actor: string
        danger: 'low' | 'mid' | 'high'
        target?: { jobId?: number; platformId?: string; companyId?: number }
        payload?: Record<string, unknown>
        guiConfirmed?: boolean
      },
      fn: (token: GuardToken) => Promise<T>,
    ): Promise<T> => {
      if (guard === undefined) throw dataNotReady(runtime)
      return await guard.run(
        {
          action: input.action,
          actor: input.actor as Actor,
          danger: input.danger,
          ...(input.target === undefined ? {} : { target: input.target }),
          ...(input.payload === undefined ? {} : { payload: input.payload }),
          ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
        },
        async (token) => await fn(token),
      )
    }

    pipeline = createPipelineService({
      store: opened,
      clock,
      guardRun,
      ...(logger === undefined ? {} : { logger }),
    })
    messages = createMessageService({
      store: opened,
      clock,
      ai,
      ...(logger === undefined ? {} : { logger }),
    })
    interviews = createInterviewService({
      store: opened,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    analytics = createAnalyticsService({ store: opened, clock })

    // ── P8：校招与海外支线 ──────────────────────────────────────────
    campus = createCampusService({
      store: opened,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    overseas = createOverseasService({
      store: opened,
      ai,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    // 硬截止进待办：这些节点**不可逆**，所以必须是 urgent 而不是普通提示（§12.7）。
    // 同步逻辑在 syncDeadlineTodos()，心跳里还会再跑一次 —— 只在启动时写一次的话，
    // 用户今天新建的笔试要等到下次重启才会进待办。
    syncDeadlineTodos()
    logger?.info(
      `[${PLUGIN_ID}] 安全闸门已就绪（审批通道：${approvalService === undefined ? '无 → 高危一律拒绝' : '有'}）；` +
        `模型：${llmPort === undefined ? '未配置 → 全部降级为规则/模板' : '已接入'}`,
    )
    if (isOfflineMode()) {
      logger?.warn(
        `[${PLUGIN_ID}] 离线模式已开启（${NO_NETWORK_ENV}）：抓取与登录引导一律拒绝，` +
          '这是「自动化测试绝不访问真实招聘站」的机制化兜底。',
      )
    }

    bus.publish('data.ready', { path: opened.path })
    // 数据层好了才谈租约与调度
    const verdict = lease.acquire()
    if (verdict.held) {
      if (verdict.stale) {
        logger?.warn(`[${PLUGIN_ID}] 接管了一个过期租约（上次 pid ${String(verdict.other?.pid ?? '?')}，可能被强杀）`)
      }
    } else {
      logger?.warn(
        `[${PLUGIN_ID}] 另一个实例正在运行（pid ${String(verdict.other?.pid ?? '?')}）→ ` +
          '本实例只读：不启动调度、不开浏览器（R20）。对方心跳过期后本实例会自动接管。',
      )
    }
    // 无论持没持有都起心跳：没持有的话，它是「等待接管」的探测循环
    startHeartbeat()

    loginFlow = createLoginFlow({
      registry,
      session: session as SessionService,
      pageSource: browserPageSource(browser),
      events: bus,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })

    scheduler = createScheduler({
      store: opened,
      plans: plans as PlanService,
      run: async (input) =>
        await runtime.crawl({
          platformId: input.platformId,
          criteria: input.criteria,
          planId: input.planId,
          reason: input.reason,
          // SR-46：把本轮终点传给抓取侧 —— 平台内部据此在页与页之间收手
          ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
        }),
      timer: timerPort,
      events: bus,
      canSchedule,
      readOnlyReason,
      leaseStatus: () => lease.status(),
      platformGate,
      // 单轮预算从设置读（每次开轮读一次 → 改完立刻生效，不必重启）
      roundBudgetMs: () => readCrawlConfig(opened).roundBudgetMinutes * 60_000,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    onLeaseAcquired = () => {
      scheduler?.start()
    }
    scheduler.start()
  }

  const runtime: HostRuntime = {
    ready(): Promise<void> {
      if (readyPromise !== undefined) return readyPromise
      // setImmediate：把开库与迁移推到 apply 返回之后再跑（§4.9 / §6.5）
      readyPromise = new Promise<void>((resolve) => {
        setImmediate(resolve)
      }).then(() => {
        openDataLayer()
      })
      return readyPromise
    },

    isReady(): boolean {
      return store !== undefined
    },

    failure(): RuntimeFailure | null {
      return failure
    },

    health(): HealthDto {
      const opened = store
      const base = {
        ok: true,
        name: PLUGIN_ID,
        version,
        phase: PHASE,
        routePrefix: ROUTE_PREFIX,
        hostUptimeMs: Date.now() - startedAt,
      }

      if (opened === undefined) {
        return {
          ...base,
          dataReady: false,
          dataPath: null,
          jobCount: 0,
          companyCount: 0,
          pendingRepairCount: 0,
          lastCrawl: null,
          adapters: [],
          dataError: failure?.message ?? '数据层尚未就绪',
          offline: isOfflineMode(),
          tools: toolReport,
        }
      }

      return {
        ...base,
        dataReady: true,
        dataPath: opened.path,
        jobCount: opened.job.count(),
        companyCount: opened.company.count(),
        pendingRepairCount: opened.repair.countPending(),
        lastCrawl: opened.crawlRun.latest() ?? null,
        adapters: registry.list().map((adapter) => {
          const snapshot = readAdapterHealth(opened, adapter.id)
          return {
            platformId: adapter.id,
            health: snapshot.health,
            failStreak: snapshot.failStreak,
            lastOkAt: snapshot.lastOkAt,
            fields: snapshot.fields,
            reason: snapshot.reason,
          }
        }),
        dataError: null,
        offline: isOfflineMode(),
        tools: toolReport,
      }
    },

    today(): TodayDto {
      const opened = store
      if (opened === undefined) {
        return buildTodayUnavailable(failure?.message ?? '数据层尚未就绪', systemClock())
      }
      return buildToday({ store: opened, registry, clock })
    },

    crawlStatus(): CrawlStatusDto {
      const opened = store
      const adapters = registry.list().map((adapter) => {
        const snapshot =
          opened === undefined
            ? { health: 'healthy' as const, failStreak: 0, lastOkAt: null, reason: null, fields: [] }
            : readAdapterHealth(opened, adapter.id)
        return {
          platformId: adapter.id,
          health: snapshot.health,
          failStreak: snapshot.failStreak,
          lastOkAt: snapshot.lastOkAt,
          fields: snapshot.fields,
          reason: snapshot.reason,
        }
      })
      return {
        busy: platformLocks.busy(),
        paused: adapters.filter((adapter) => adapter.health !== 'healthy').map((adapter) => adapter.platformId),
        adapters,
        recentRuns: opened?.crawlRun.list(10) ?? [],
      }
    },

    async crawl(options): Promise<CrawlSummaryDto> {
      // §14 的机制化兜底：离线模式下**绝不**发起真实访问
      assertNetworkAllowed('抓取招聘网站')
      const opened = store
      const jobService = jobs
      const companyService = companies
      if (opened === undefined || jobService === undefined || companyService === undefined) {
        throw dataNotReady(runtime)
      }
      // 不持租约就不许驱动浏览器：两个实例抢同一个 profile 会直接报错（R20）
      if (!lease.held()) {
        throw new DomainError('CONFLICT', readOnlyReason() ?? '本实例不持有租约', {
          hint: '另一个实例正在运行 —— 请在那边抓取。',
        })
      }

      bus.publish('crawl.started', { platformId: options.platformId, criteria: options.criteria })
      try {
        const summary = await runCrawl(
          {
            store: opened,
            registry,
            locks: platformLocks,
            // 突发惩罚按平台共享（跨轮次连续）—— 各平台各一份滑动窗口。
            createBurstGuard: (platformId: string): BurstGuard => {
              const existing = burstGuards.get(platformId)
              if (existing !== undefined) return existing
              const created = new BurstGuard()
              burstGuards.set(platformId, created)
              return created
            },
            pageSource: browserPageSource(browser),
            jobs: jobService,
            companies: companyService,
            ...(intel === undefined ? {} : { intel }),
            ...(logger === undefined ? {} : { logger }),
          },
          {
            platformId: options.platformId,
            criteria: options.criteria,
            ...(options.planId === undefined ? {} : { planId: options.planId }),
            // SR-28：触发原因随记录落库 —— 运行历史表要能回答「这次是谁触发的」
            reason: options.reason ?? 'manual',
            // SR-44：抓取后处理开关来自**方案**。方案服务不认识"抓取"，
            // 抓取不认识"方案" —— 所以由装配点在这里把它们接起来。
            postProcess: postProcessForPlan(options.planId ?? null),
            // SR-46：到点时刻由调度器给（本轮开始 + `ROUND_BUDGET_MS`）。
            // 界面/工具直接调 `crawl` 时不带它 —— 那种场合用户就在屏幕前，
            // 一个 20 分钟的保险丝不该悄无声息地把他的抓取腰斩。
            ...(options.deadlineAt === undefined ? {} : { deadlineAt: options.deadlineAt }),
          },
        )
        bus.publish('crawl.finished', {
          platformId: options.platformId,
          state: summary.run.state,
          found: summary.run.found,
          inserted: summary.run.inserted,
          updated: summary.run.updated,
          quarantined: summary.quarantined,
        })
        return summary
      } catch (error) {
        bus.publish('crawl.failed', { platformId: options.platformId, message: messageOf(error) })
        throw error
      }
    },

    events(): EventBus {
      return bus
    },

    intel(): IntelService {
      if (intel === undefined) throw dataNotReady(runtime)
      return intel
    },

    // ── P5：安全与工具 ────────────────────────────────────────────────
    guard(): Guard {
      if (guard === undefined) throw dataNotReady(runtime)
      return guard
    },

    ai(): AiService {
      if (ai === undefined) throw dataNotReady(runtime)
      return ai
    },

    outreach(): OutreachService {
      if (outreach === undefined) throw dataNotReady(runtime)
      return outreach
    },

    settings(): SettingsService {
      if (settings === undefined) throw dataNotReady(runtime)
      return settings
    },

    approvalAvailable(): boolean {
      return approvalIsUsable()
    },

    setToolReport(report): void {
      toolReport = report
    },

    toolReport(): ToolRegistrationReport | null {
      return toolReport
    },

    resumes(): ResumeService {
      if (resumes === undefined) throw dataNotReady(runtime)
      return resumes
    },

    filesDir(): string {
      return join(dataDir, 'files')
    },

    pdfRendererRunning(): boolean {
      return pdfRenderer.isRunning()
    },

    pipeline(): PipelineService {
      if (pipeline === undefined) throw dataNotReady(runtime)
      return pipeline
    },

    messages(): MessageService {
      if (messages === undefined) throw dataNotReady(runtime)
      return messages
    },

    interviews(): InterviewService {
      if (interviews === undefined) throw dataNotReady(runtime)
      return interviews
    },

    analytics(): AnalyticsService {
      if (analytics === undefined) throw dataNotReady(runtime)
      return analytics
    },

    followUps(): FollowUpSuggestion[] {
      return pipeline?.followUpSuggestions() ?? []
    },

    unreadCount(): number {
      return messages?.unreadCount() ?? 0
    },

    campus(): CampusService {
      if (campus === undefined) throw dataNotReady(runtime)
      return campus
    },

    overseas(): OverseasService {
      if (overseas === undefined) throw dataNotReady(runtime)
      return overseas
    },

    deadlines(): DeadlineDto[] {
      return campus?.deadlines() ?? []
    },

    async draftGreeting(input): Promise<GreetingDraftDto> {
      const service = outreach
      if (service === undefined) throw dataNotReady(runtime)
      return await service.draft({
        jobId: input.jobId,
        ...(input.tone === undefined ? {} : { tone: input.tone }),
        ...(input.highlights === undefined ? {} : { highlights: input.highlights }),
        ...(input.extra === undefined ? {} : { extra: input.extra }),
      })
    },

    async sendGreeting(input): Promise<GreetingSendResult> {
      const opened = store
      const service = outreach
      const gate = guard
      const sessionService = session
      if (opened === undefined || service === undefined || gate === undefined || sessionService === undefined) {
        throw dataNotReady(runtime)
      }

      const job = opened.job.detail(input.jobId)
      if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
          hint: '它可能已被删除；先用 job_list 看当前有哪些岗位。',
        })
      }

      // 文本没给就现生成 —— 生成是**低危**的（不发送），所以它理应发生在闸门之前
      let text = input.text?.trim() ?? ''
      let via: 'llm' | 'template' | 'given' = 'given'
      if (text === '') {
        const draft = await service.draft({ jobId: job.id })
        text = draft.text
        via = draft.via
      }
      const greetingSideEffect = platformFacts(job.platformId).greetingSideEffect

      const result = await gate.run(
        {
          action: GREETING_SEND_ACTION,
          actor: input.actor,
          danger: 'high',
          target: {
            jobId: job.id,
            platformId: job.platformId,
            ...(job.companyId === null ? {} : { companyId: job.companyId }),
          },
          payload: {
            // 正文只用于**审批展示**；审计里只留长度（§4.1）
            text,
            jobTitle: job.title,
            company: job.companyName ?? '',
            // §4.4.2 要求审批文案显示"用了哪版简历" —— 打招呼不用简历，如实写出来
            resumeVersion: '不适用（打招呼只发文本）',
            draftVia: via,
            // 平台自己还会做的额外动作（平台事实）：BOSS 点了「立即沟通」会**先替你发一句
            // 平台默认招呼语**，随后我们才发上面这段 text —— 一次动作两条消息，用户得知道。
            ...(greetingSideEffect === undefined ? {} : { sideEffect: greetingSideEffect }),
          },
          ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
        },
        async (token) =>
          await sendGreeting(
            {
              store: opened,
              registry,
              session: sessionService,
              pageSource: browserPageSource(browser),
              clock,
              ...(logger === undefined ? {} : { logger }),
              // P7：发送**成功后**记一笔接触记录（接触态的载体，§7.0）
              record: (recorded) => {
                pipeline?.recordGreetingSent(recorded)
                bus.publish('greeting.recorded', {
                  jobId: recorded.jobId,
                  actor: recorded.actor,
                })
              },
            },
            token,
            { jobId: job.id, text },
          ),
      )

      bus.publish('greeting.sent', {
        jobId: result.jobId,
        platformId: result.platformId,
        company: result.company,
        actor: input.actor,
      })
      return result
    },

    async replyToMessage(input): Promise<ReplySendResult> {
      const opened = store
      const gate = guard
      const sessionService = session
      const messageService = messages
      if (opened === undefined || gate === undefined || sessionService === undefined || messageService === undefined) {
        throw dataNotReady(runtime)
      }

      const text = input.content.trim()
      if (text === '') {
        // **必须在闸门之前**：这条正文会被逐字打进输入框，为空的话用户确认完才发现发不出去
        throw new DomainError('INVALID_INPUT', '回复内容不能为空')
      }

      // 审批文案要写清"发给谁、回的是哪条"（§4.4.2），所以这里先读一次目标。
      // 真正的定位与发送在闸门里（`guard/actions/reply.ts`）**再做一遍** ——
      // 审批期间对方可能已经把它移出会话列表，那一步不该信任这里的快照。
      const target = opened.pipeline.getMessage(input.messageId)
      if (target === undefined) {
        throw new DomainError('NOT_FOUND', `消息不存在：${String(input.messageId)}`, {
          hint: '先用 inbox_list 看看当前有哪些消息。',
          detail: { messageId: input.messageId },
        })
      }
      if (target.jobId === null) {
        throw new DomainError('INVALID_INPUT', '这条消息没有关联岗位，无法定位到具体会话，不能回复', {
          hint: '回复要靠"发往哪个岗位的会话"来定位；请把它关联到岗位，或直接去平台上回。',
          detail: { messageId: target.id, platformId: target.platformId },
        })
      }
      const job = opened.job.detail(target.jobId)
      if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(target.jobId)}`, {
          detail: { jobId: target.jobId },
        })
      }

      const result = await gate.run(
        {
          action: REPLY_SEND_ACTION,
          actor: input.actor,
          danger: 'high',
          target: {
            jobId: job.id,
            platformId: job.platformId,
            ...(job.companyId === null ? {} : { companyId: job.companyId }),
          },
          payload: {
            // 正文只用于**审批展示**；审计里只留摘要与长度（§4.1）
            text,
            toJob: job.title,
            company: job.companyName ?? '',
            replyTo: target.content.slice(0, 80),
            // §4.4.2 要求审批文案写清"用了哪版简历" —— 回复只发文本，如实写出来
            resumeVersion: '不适用（回复只发文本）',
          },
          ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
        },
        async (token) =>
          await sendReply(
            {
              store: opened,
              registry,
              session: sessionService,
              pageSource: browserPageSource(browser),
              clock,
              ...(logger === undefined ? {} : { logger }),
              // 发送**成功之后**才落本地那条 `direction='me'` ——
              // 发失败了也记"我已回复"，看板与接触态从第一天开始就说谎（与打招呼同一条原则）
              record: (recorded) => {
                messageService.record({
                  platformId: recorded.platformId,
                  direction: 'me',
                  content: recorded.content,
                  jobId: recorded.jobId,
                })
              },
            },
            token,
            { messageId: target.id, text },
          ),
      )

      bus.publish('message.replied', {
        messageId: result.messageId,
        jobId: result.jobId,
        platformId: result.platformId,
      })
      return result
    },

    async syncInbox(input): Promise<InboxSyncResult> {
      const opened = store
      const gate = guard
      const sessionService = session
      const messageService = messages
      if (opened === undefined || gate === undefined || sessionService === undefined || messageService === undefined) {
        throw dataNotReady(runtime)
      }

      const result = await gate.run(
        {
          action: INBOX_SYNC_ACTION,
          actor: input.actor,
          // 低危：只读平台会话列表 + 写本地库，不对外发任何东西
          danger: 'low',
          target: { platformId: input.platformId },
        },
        async (token) =>
          await syncInbox(
            {
              registry,
              session: sessionService,
              pageSource: browserPageSource(browser),
              ...(logger === undefined ? {} : { logger }),
              // 去重口径留在消息中心（同「平台+会话+方向+正文」算同一条）
              record: (recorded) =>
                messageService.recordOnce({
                  platformId: recorded.platformId,
                  direction: recorded.direction,
                  content: recorded.content,
                  conversationId: recorded.conversationId,
                  ...(recorded.at === null ? {} : { at: recorded.at }),
                }),
            },
            token,
            { platformId: input.platformId },
          ),
      )

      if (result.recorded > 0) {
        bus.publish('inbox.synced', {
          platformId: result.platformId,
          recorded: result.recorded,
          unread: result.unread,
        })
      }
      return result
    },

    async probeContactStage(input): Promise<StageProbeResult> {
      const opened = store
      const gate = guard
      const sessionService = session
      if (opened === undefined || gate === undefined || sessionService === undefined) {
        throw dataNotReady(runtime)
      }

      const result = await gate.run(
        {
          action: STAGE_PROBE_ACTION,
          actor: input.actor,
          // 低危：只读平台上的状态标记，**一个字段都不写**（本地库也不写）
          danger: 'low',
          target: { jobId: input.jobId },
        },
        async (token) =>
          await probeContactStage(
            {
              store: opened,
              registry,
              session: sessionService,
              pageSource: browserPageSource(browser),
              clock,
              ...(logger === undefined ? {} : { logger }),
            },
            token,
            { jobId: input.jobId },
          ),
      )
      bus.publish('contact.stage.probed', {
        jobId: result.jobId,
        platformId: result.platformId,
        stage: result.stage,
      })
      return result
    },

    async sendApplication(input): Promise<ApplicationSendResult> {
      const opened = store
      const gate = guard
      const sessionService = session
      const pipelineService = pipeline
      if (opened === undefined || gate === undefined || sessionService === undefined) {
        throw dataNotReady(runtime)
      }

      const job = opened.job.detail(input.jobId)
      if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, {
          hint: '它可能已被删除；先用 job_list 看当前有哪些岗位。',
        })
      }

      const filePath = input.filePath ?? null
      const sideEffect = platformFacts(job.platformId).applicationSideEffect
      const result = await gate.run(
        {
          action: APPLICATION_SEND_ACTION,
          actor: input.actor,
          danger: 'high',
          target: {
            jobId: job.id,
            platformId: job.platformId,
            ...(job.companyId === null ? {} : { companyId: job.companyId }),
          },
          payload: {
            jobTitle: job.title,
            company: job.companyName ?? '',
            // §4.4.2 要求审批文案写清"用了哪版简历"
            resumeVersion:
              filePath === null ? '平台内简历（未指定本地版本）' : `本地文件：${filePath}`,
            resumeFileId: filePath === null ? null : filePath,
            // 平台自己还会做的额外动作（如智联投递时会替你发一句招呼语）——
            // **来自平台事实表**，不是各入口自己写死；没有这一格的平台就不会出现这一行。
            ...(sideEffect === undefined ? {} : { sideEffect }),
          },
          ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
        },
        async (token) =>
          await sendApplication(
            {
              store: opened,
              registry,
              session: sessionService,
              pageSource: browserPageSource(browser),
              clock,
              ...(logger === undefined ? {} : { logger }),
              // 投递**成功之后**记一笔（接触态/看板的载体，§12.1）
              record: (recorded) => {
                pipelineService?.recordApplicationSent({
                  jobId: recorded.jobId,
                  actor: recorded.actor,
                  note:
                    recorded.filePath === null
                      ? '平台内简历投递（适配器执行）'
                      : `本地简历投递（适配器执行）：${recorded.filePath}`,
                })
              },
            },
            token,
            { jobId: job.id, filePath },
          ),
      )

      bus.publish('application.sent', {
        jobId: result.jobId,
        platformId: result.platformId,
        company: result.company,
        actor: input.actor,
        delivery: result.delivery,
      })
      return result
    },

    async updateSettings(patch, actor, guiConfirmed): Promise<SettingsSnapshot> {
      const opened = store
      const service = settings
      const gate = guard
      if (opened === undefined || service === undefined || gate === undefined) throw dataNotReady(runtime)

      // 禁止项检查看的是**顶层键**，所以 guard 那半边要摊平传进去
      //（否则 `requireApproval` 藏在 patch.guard 里就查不到了）。
      const guardPatch = (patch.guard ?? {}) as Record<string, unknown>
      const description = describeSettingsPatch(patch)

      return await gate.run(
        {
          action: SETTINGS_WRITE_ACTION,
          actor,
          danger: 'mid',
          payload: { patch: guardPatch, description },
          ...(guiConfirmed === true ? { guiConfirmed: true } : {}),
        },
        async (token) => {
          const next = service.update(patch, token)
          bus.publish('settings.updated', { by: actor, description })
          return next
        },
      )
    },

    // ── P3 ────────────────────────────────────────────────────────────
    plans(): PlanService {
      if (plans === undefined) throw dataNotReady(runtime)
      return plans
    },

    schedulerStatus(): SchedulerStatusDto {
      if (scheduler === undefined) {
        // 数据层还没就绪：如实报告，并且**每个字段都给一个真值** ——
        // 少一个字段就是界面上一个 `undefined`，比空态更难查。
        return {
          scheduling: false,
          readOnly: true,
          readOnlyReason: readOnlyReason() ?? '数据层尚未就绪',
          armed: false,
          nextRunAt: null,
          lastRunAt: null,
          running: false,
          plans: [],
          lease: lease.status(),
          timezone: 'UTC',
          jitterMs: 0,
          paused: false,
          pausedReason: null,
          planStatus: [],
          triggers: [],
          recentRuns: [],
          refreshSuggested: false,
          refreshHint: null,
        }
      }
      return scheduler.status()
    },

    setSchedulePaused(paused, reason): void {
      const instance = scheduler
      if (instance === undefined) throw dataNotReady(runtime)
      instance.setPaused(paused, reason)
    },

    resumeRisk(planId): void {
      const instance = scheduler
      if (instance === undefined) throw dataNotReady(runtime)
      instance.resumeRisk(planId)
    },

    recheckLease(): SchedulerStatusDto {
      // 只读实例不能躺平等：上一个实例可能刚被关掉，这里立刻重试一次
      if (!lease.held()) {
        const verdict = lease.acquire()
        if (verdict.held) {
          logger?.info(
            `[${PLUGIN_ID}] 重新检测后接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')}）`,
          )
          bus.publish('lease.acquired', { pid: process.pid })
          onLeaseAcquired?.()
        }
      }
      return runtime.schedulerStatus()
    },

    takeoverLease(): SchedulerStatusDto {
      if (lease.held()) return runtime.schedulerStatus()
      const before = lease.status()
      // 对方心跳**新鲜** = 它还活着 → 拒绝，并把「怎么办」说清楚。
      // 这是这个接口存在的全部意义：它绝不能变成"抢活人的锁"的按钮。
      if (!before.stale) {
        const beat =
          before.heartbeatAt === null ? '未知' : new Date(before.heartbeatAt).toLocaleTimeString()
        throw new DomainError(
          'CONFLICT',
          `另一个实例（进程 ${String(before.pid ?? '?')}）还在运行，不能接管`,
          {
            hint:
              `它的心跳是 ${beat}，说明那个窗口还活着。请在那个窗口里操作，或者关掉它 —— ` +
              '关掉之后本实例会在 90 秒内自动接管（不需要重启），也可以点「重新检测」立刻重试。',
            detail: { pid: before.pid, heartbeatAt: before.heartbeatAt },
          },
        )
      }
      const verdict = lease.acquire()
      if (!verdict.held) {
        throw new DomainError('CONFLICT', '接管租约失败', {
          hint: '另一个实例刚刚又活过来了。点「重新检测」看看当前状态。',
        })
      }
      logger?.warn(
        `[${PLUGIN_ID}] 人工接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期）`,
      )
      bus.publish('lease.acquired', { pid: process.pid })
      onLeaseAcquired?.()
      return runtime.schedulerStatus()
    },

    async runPlan(planId, reason): Promise<CrawlSummaryDto> {
      if (scheduler === undefined) throw dataNotReady(runtime)
      return await scheduler.runPlan(planId, reason)
    },

    async schedulerTick(): Promise<void> {
      if (scheduler === undefined) return
      await scheduler.tick()
    },

    platforms(): PlatformOverviewDto[] {
      const opened = store
      return registry.list().map((adapter) => {
        const record = opened?.platform.get(adapter.id)
        const snapshot =
          opened === undefined
            ? { health: 'healthy' as const, failStreak: 0, lastOkAt: null, reason: null, fields: [] }
            : readAdapterHealth(opened, adapter.id)
        const account = session?.status(adapter.id) ?? {
          platformId: adapter.id,
          loggedIn: false,
          hiddenFromCurrentEmployer: null,
          lastCheckAt: null,
          hint: null,
          updatedAt: null,
        }
        const login = loginFlow?.status(adapter.id)
        // 批次 5：平台总览矩阵要的"横向可比"事实。三处都与调度判定**共用同一份算法**
        // （`platformGate` / `crawlQuotaOf` / `cooldownUntilOf`）——
        // 矩阵写着"可以"、到点却被门挡住，是比不做矩阵更糟的一件事。
        const pause =
          opened === undefined
            ? { paused: false, reason: null }
            : readPlatformRiskPause(opened, adapter.id)
        const quota = crawlQuotaOf(adapter.id)
        return {
          id: adapter.id,
          displayName: adapter.displayName,
          enabled: record?.enabled ?? true,
          capabilities: adapter.capabilities,
          // 实现度**派生**自实现对象本身 —— 手写一份必然与实际漂移
          implementation: adapterImplementationOf(adapter),
          maturity: adapter.maturity,
          // 页数上限是**平台事实**（适配器自己声明），与"我们实现了什么"无关。
          // 界面用它渲染「限制」列，避免用户填完才被校验拒绝。
          maxPages: adapter.maxPages,
          authRequirement: adapter.authRequirement,
          // 量级快照（批次 5）：查的是"字段都好、条目数却掉了"，与逐字段健康互补
          yield:
            opened === undefined
              ? { baseline: null, samples: 0, lastFound: null, level: 'insufficient' as const }
              : readYieldSnapshot(opened, adapter.id),
          health: snapshot.health,
          healthReason: snapshot.reason,
          failStreak: snapshot.failStreak,
          lastOkAt: snapshot.lastOkAt,
          account: toAccountDto(account),
          fields: snapshot.fields,
          login: { state: login?.state ?? 'idle', message: login?.message ?? null },
          // 批次 5 的平台总览矩阵（SR-46 的同批界面落点）：一屏看完每个平台
          // "是什么"与"现在能不能跑、为什么不能"。
          governance: {
            // 没有数据层时门还没法判（`platformGate` 会回 lease_lost，那是误导）——
            // 这时整页都处于"数据层未就绪"的状态，不假装有结论。
            blocked: opened === undefined ? null : platformGate(adapter.id),
            todayRuns: quota.used,
            dailyLimit: quota.limit,
            riskPaused: pause.paused,
            riskReason: pause.reason,
            cooldownUntil: cooldownUntilOf(adapter.id),
            lastRun: opened?.crawlRun.latest(adapter.id) ?? null,
          },
        }
      })
    },

    loginStatuses(): LoginStatusDto[] {
      return registry.list().map((adapter) => {
        if (loginFlow !== undefined) return loginFlow.status(adapter.id)
        const account = session?.status(adapter.id)
        return {
          platformId: adapter.id,
          state: 'idle',
          message: null,
          startedAt: null,
          account: toAccountDto(
            account ?? {
              platformId: adapter.id,
              loggedIn: false,
              hiddenFromCurrentEmployer: null,
              lastCheckAt: null,
              hint: null,
              updatedAt: null,
            },
          ),
        }
      })
    },

    startLogin(platformId): LoginStatusDto {
      // 登录引导会真的打开招聘站页面 —— 同样受离线闸门约束
      assertNetworkAllowed('打开招聘网站登录页')
      // 与 `crawl` 同一条纪律（R20）：只读实例不许开浏览器。
      // 两个实例共用一个 browser-profile 目录会互相踩，而登录引导恰好是**最长**的一次占用
      // （用户在里面输密码，可能几分钟）—— 恰恰是最不该被第二个实例插进来的场景。
      if (!lease.held()) {
        throw new DomainError('CONFLICT', readOnlyReason() ?? '本实例不持有租约', {
          hint: '另一个实例正在运行 —— 请在那边登录，避免两个实例抢同一个浏览器 profile。',
        })
      }
      const flow = loginFlow
      if (flow === undefined) throw dataNotReady(runtime)
      return flow.start(platformId)
    },

    closeTodo(id): boolean {
      const opened = store
      if (opened === undefined) throw dataNotReady(runtime)
      return opened.todo.close(id, clock())
    },

    store(): Store | undefined {
      return store
    },
    jobs(): JobService | undefined {
      return jobs
    },
    companies(): CompanyService | undefined {
      return companies
    },

    sweepDedup(): DedupSweepResult {
      const opened = store
      if (opened === undefined) throw dataNotReady(runtime)
      const result = sweepDedup(opened, clock())
      // 复核会改分组：让界面（与其它窗口）知道该重拉，而不是等下次手动刷新
      if (result.merged > 0 || result.newGroups > 0) {
        bus.publish('dedup.swept', result)
      }
      logger?.info(
        `[dedup] 全库复核：看过 ${String(result.scanned)} 条 · 合并 ${String(result.merged)} 条 · ` +
          `新建 ${String(result.newGroups)} 组 · 疑似待确认 ${String(result.candidates)} 条`,
      )
      return result
    },
    registry(): AdapterRegistry {
      return registry
    },
    locks(): PlatformLocks {
      return platformLocks
    },
    browser(): BrowserManager {
      return browser
    },

    close(): void {
      // 顺序有讲究：先停调度（别再排新任务），再关数据层，最后放租约
      scheduler?.stop()
      if (heartbeatCancel !== null) {
        heartbeatCancel()
        heartbeatCancel = null
      }
      loginFlow?.cancelAll()
      try {
        store?.close()
      } catch (error) {
        logger?.warn(`[${PLUGIN_ID}] 关闭数据库失败：${messageOf(error)}`)
      }
      store = undefined
      jobs = undefined
      companies = undefined
      plans = undefined
      session = undefined
      loginFlow = undefined
      scheduler = undefined
      intel = undefined
      guard = undefined
      ai = undefined
      outreach = undefined
      settings = undefined
      resumes = undefined
      // PDF 渲染器是独立的 headless 实例：不关就是孤儿 Chromium（C12）
      void pdfRenderer.close().catch(() => undefined)
      lease.release()
      // 浏览器关闭是异步的：不阻塞卸载，但必须发起，否则会留孤儿 Chromium（§4.2.1）
      void browser.close().catch((error: unknown) => {
        logger?.warn(`[${PLUGIN_ID}] 关闭浏览器失败：${messageOf(error)}`)
      })
    },
  }

  return runtime
}

/** 从当前简历派生匹配偏好时用的小工具：没有简历就返回 undefined（不是抛错）。 */
function safeDefaultResume(service: ResumeService): { content: ResumeContent } | undefined {
  try {
    const listed = service.list().find((item) => item.isDefault && item.state === 'active')
    if (listed === undefined) return undefined
    return { content: service.get(listed.id).content }
  } catch {
    // 简历坏了不该让「岗位列表」整个挂掉
    return undefined
  }
}

export type { PlanDto }
