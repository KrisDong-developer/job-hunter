/**
 * 宿主侧运行时装配（composition root）。
 *
 * 把各部件接起来：sqlite store、适配器注册表、全局互斥、浏览器管理器、领域服务、
 * 单实例租约、登录态、自排程器。入口层（http / tools）只跟这个门面打交道。
 *
 * **硬规则（§4.9）**：`apply()` 必须立即返回。所以数据层是**异步就绪**的：
 * `ready()` 返回一个 promise，而 apply 不 await 它；在它完成之前 `/health` 会如实报告
 * `dataReady: false` 与失败原因 —— 而不是让插件挂不上、或者让宿主启动被迁移拖慢。
 *
 * 对外形状（`HostRuntime` / 选项 / 失败）就声明在这个文件里；实现按职责拆在 `runtime/` 下，
 * 每个子模块都是**叶子或单向依赖**（不反向 import 本文件）：
 *
 *   * `contract.ts` —— 失败形状与 `dataNotReady`（路由不必为一个错误依赖整个装配点）
 *   * `adapters.ts` —— 平台清单与注册样板（新增平台 = 表里加一行）
 *   * `gate.ts`     —— 每平台前置条件（SR-16）与冷却/配额两个读数
 *   * `views.ts`    —— 只读投影：store → DTO（同一份事实只映射一次）
 *   * `actions.ts`  —— 七个编排：闸门 + 令牌 + 成功后才回写 + 事件广播
 *   * `lifecycle.ts`—— 租约（R20）与心跳
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  EXPORTS_DIR_NAME,
  PLUGIN_ID,
} from '../shared/constants.js'
import type {
  AdapterConfigDto,
  CleanupPlanDto,
  CleanupResultDto,
  CrawlStatusDto,
  CrawlSummaryDto,
  DataExportFormat,
  DataExportEntryDto,
  DataImportResultDto,
  DeadlineDto,
  ApplicationBatchPlanDto,
  ApplicationBatchResultDto,
  GreetingBatchPlanDto,
  GreetingBatchResultDto,
  GreetingDraftDto,
  GuardUsageDto,
  HealthDto,
  LoginStatusDto,
  PlatformOverviewDto,
  SchedulerStatusDto,
  StorageUsageDto,
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
import { createOfferService, type OfferService } from './domain/offers.js'
import type { MessageService } from './domain/messages.js'
import { createMessageService } from './domain/messages.js'
import type { InterviewService } from './domain/interviews.js'
import { createInterviewService } from './domain/interviews.js'
import type { AnalyticsService } from './domain/analytics.js'
import { createAnalyticsService } from './domain/analytics.js'
import type { CampusService } from './domain/campus.js'
import { createCampusService, syncDeadlineTodos as syncDeadlineTodoItems } from './domain/campus.js'
import type { OverseasService } from './domain/overseas.js'
import { createOverseasService } from './domain/overseas.js'
import type { OutreachService } from './domain/outreach.js'
import { createOutreachService } from './domain/outreach.js'
import type { ResumeService } from './domain/resumes.js'
import { createResumeService } from './domain/resumes.js'
import { createPdfRenderer, type PdfRenderer } from './render/pdf.js'
import type { PlanService } from './domain/plans.js'
import { createPlanService } from './domain/plans.js'
import { exportData as exportDataOf, importJobs as importJobsOf } from './domain/portability.js'
import {
  cleanupPlanOf,
  maybeAutoClean,
  readRetentionPolicy,
  runCleanupOf,
  storageUsageOf,
  writeRetentionPolicy,
} from './store/cleanup.js'
import type { IntelService, MatchProfile } from './domain/intel.js'
import { createIntelService, resumeProfileOf } from './domain/intel.js'
import { buildToday, buildTodayUnavailable } from './domain/today.js'
import type { ApprovalAnswer, ApprovalPort } from './guard/approval.js'
import { createApprovalPort, renderApproval } from './guard/approval.js'
// 危险动作的**结果类型**（接口签名用）；实现（`sendGreeting` 等）在 runtime/actions.ts
import type { ApplicationSendResult } from './guard/actions/application.js'
import type { GreetingSendResult } from './guard/actions/greeting.js'
import type { InboxSyncResult } from './guard/actions/inbox.js'
import type { ReplySendResult } from './guard/actions/reply.js'
import type { StageProbeResult } from './guard/actions/stage.js'
import type { Guard } from './guard/index.js'
import { createGuard } from './guard/index.js'
import type { GuardToken } from './guard/token.js'
import type { Actor } from './guard/types.js'
import { createEventBus, type EventBus } from './http/sse.js'
import type { BrowserManager } from './platform/browser.js'
import { browserPageSource, createBrowserManager } from './platform/browser.js'
import { idleCloseMsOf, readBrowserConfig, writeBrowserConfig } from './browser-config.js'
import { readCrawlConfig, writeCrawlConfig } from './crawl-config.js'
import type { LeaseManager } from './platform/lease.js'
import { createLease } from './platform/lease.js'
import type { PlatformLocks } from './platform/locks.js'
import { createPlatformLocks } from './platform/locks.js'
import { BurstGuard } from './platform/pacing.js'
import type { AdapterRegistry } from './platform/registry.js'
import { createAdapterRegistry } from './platform/registry.js'
import type { LoginFlow, SessionService } from './platform/session.js'
import { createLoginFlow, createSessionService } from './platform/session.js'
import type { SearchCriteria } from './platform/types.js'
import {
  ADAPTER_CONFIG_KEY,
  ADAPTER_CONFIG_MAX_CHARS,
  adapterSpecOf,
  rebuildAdapter,
  registerAdapters,
} from './runtime/adapters.js'
import { createRuntimeActions } from './runtime/actions.js'
import { dataNotReady } from './runtime/contract.js'
import type { RuntimeFailure } from './runtime/contract.js'
import { createPlatformGate } from './runtime/gate.js'
import { readOnlyReasonOf, requireLease, startHeartbeat, takeOverLease } from './runtime/lifecycle.js'
import { guardUsageOf } from './guard/rules.js'
import {
  buildCrawlStatus,
  buildHealth,
  buildLoginStatuses,
  buildPlatforms,
  unavailableSchedulerStatus,
} from './runtime/views.js'
import { createScheduler, type PlatformGate, type Scheduler, type RunReason } from './scheduler/index.js'
import { cordisTimerPort, nativeTimerPort, type TimerLike, type TimerPort } from './scheduler/timer-port.js'
import type { SettingsPatch, SettingsService, SettingsSnapshot } from './settings.js'
import { createSettingsService } from './settings.js'
import { resolveDataDir } from './store/db.js'
import type { Store } from './store/store.js'
import { openStore } from './store/store.js'
import { toolExec } from './tools/exec-context.js'
// 只依赖工具层的**叶子**契约（不 import tools/index.js）：
// 后者需要 HostRuntime 类型，两边都指向 index 就会形成双向类型引用。
import type { ToolRegistrationReport } from './tools/types.js'
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
    /** 整批条数（批量逐条发送时透传给闸门，用于 §22.4 的批量上限）。 */
    batchSize?: number
  }): Promise<GreetingSendResult>
  /**
   * 批量打招呼的**预览**（D3 / U1）：哪些条能发、为什么不能、将发出什么。
   *
   * **只读、无副作用**（界面必须先调它、把逐条结果给用户看过，才允许发）。
   * 只为"能发"的项生成话术 —— 注定发不出去的岗位不值得花模型调用。
   */
  previewGreetingBatch(input: { jobIds: number[]; actor: Actor }): Promise<GreetingBatchPlanDto>
  /**
   * 批量打招呼 —— **高危**（§22.4）。
   *
   * **逐条过闸门、逐条回执**：每条都独立走 `greeting.send` 的完整检查链与审批，
   * 一条失败不影响其它条（没有"整批失败"这种状态）。
   * 条与条之间由宿主插入 3–9 秒随机间隔（D3 的"随机间隔"，界面与模型都绕不过）。
   */
  sendGreetingBatch(input: {
    items: Array<{ jobId: number; text?: string }>
    actor: Actor
    guiConfirmed?: boolean
  }): Promise<GreetingBatchResultDto>
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
   * `resumeFileId` 省略/null = 用平台内简历（BOSS 与智联的网页端都只支持这种）。
   */
  sendApplication(input: {
    jobId: number
    /** 关联哪份简历附件（`resume_file.id`）；`null` = 平台内简历。**不接受路径**。 */
    resumeFileId?: number | null
    actor: Actor
    guiConfirmed?: boolean
    /** 批量时带整批条数（`checkBatch` 的批量上限靠它判定）。 */
    batchSize?: number
  }): Promise<ApplicationSendResult>
  /**
   * 批量投递的**预览**（L4）：逐条给出"能不能投 + 为什么 + 用哪份简历"。只读、无副作用。
   */
  previewApplicationBatch(input: {
    jobIds: number[]
    resumeFileId: number | null
    actor: Actor
  }): Promise<ApplicationBatchPlanDto>
  /** 批量投递：**逐条过闸门、逐条回执**（不可逆，所以回执带送达状态）。 */
  sendApplicationBatch(input: {
    jobIds: number[]
    resumeFileId: number | null
    actor: Actor
    guiConfirmed?: boolean
  }): Promise<ApplicationBatchResultDto>
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
  /** Offer（§4.H）：逐项对比与截止倒计时（拿到 offer 之后的那一段决策）。 */
  offers(): OfferService
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
  /**
   * D7 的额度读数：每个平台、每个动作今天用了几次、还剩几次。
   *
   * ⚠️ 它与**抓取配额**（`PlatformGovernanceDto.todayRuns`）是两回事：那个数的是
   * "自动跑了几轮采集"，这个数的是"发了几条招呼 / 投了几份 / 回了几条"。
   * 以前只有前者有读数，所以 U0 的「额度余量」其实一直是抓取配额。
   *
   * @param platformId 省略 = 所有已注册平台
   */
  guardUsage(platformId?: string): GuardUsageDto
  /** 某个平台的适配器配置三层视图（默认 / 覆盖 / 生效）。数据层未就绪时抛 `DATA_UNAVAILABLE`。 */
  adapterConfig(platformId: string): AdapterConfigDto
  /**
   * 写入适配器配置覆盖并**热替换**适配器（J2：不要求重启插件）。
   *
   * `override === null` = 清除覆盖，回到代码默认。
   */
  updateAdapterConfig(platformId: string, override: unknown): AdapterConfigDto

  // ── P20：数据保留、清理与可携带性（§18 / J8）──────────────────────
  /** 磁盘占用（§18.3 P3）：真实文件大小 + 按表 dbstat 占用 + 按类型的行数。 */
  storage(): StorageUsageDto
  /**
   * 清理**预览**（§18.3 P2，P0）：**只读、无副作用**，可反复调用。
   *
   * 它给出"将删多少行 / 预计释放多少"，并如实说明"只有 VACUUM 之后文件才会变小"。
   */
  cleanupPreview(): CleanupPlanDto
  /**
   * 执行清理。**调用方必须先确认**（路由层两段式）且**必须持有租约**。
   *
   * @param only 只清这几类；缺省 = 预览里所有 `willRun` 的项
   */
  runCleanup(only?: readonly string[]): CleanupResultDto
  /** 导出到**内存**（HTTP 直接回给浏览器下载）。 */
  exportData(format: DataExportFormat): {
    fileName: string
    bytes: Uint8Array
    entries: DataExportEntryDto[]
    note: string
  }
  /**
   * 导出并**落盘**到 `<dataDir>/exports/`（模型工具用：对话里没法接二进制流）。
   *
   * 为什么限定这个目录：与 `system/reveal` 同一条纪律 —— 不接受任意路径，
   * 于是"导出"永远不会写到你没预期的地方。
   */
  saveExport(format: DataExportFormat): {
    fileName: string
    path: string
    bytes: number
    entries: DataExportEntryDto[]
    note: string
  }
  /** 读 `exports/` 下的一个文件（模型工具导入用）；只认文件名，不认路径。 */
  readExportFile(fileName: string): string
  /** 导入岗位（CSV / JSON）。幂等。 */
  importJobs(input: { format: 'csv' | 'json'; content: string }): DataImportResultDto

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

// 契约层（叶子）是权威；这里 re-export 让既有的 `import ... from './runtime.js'` 继续可用。
export { dataNotReady } from './runtime/contract.js'
export type { RuntimeFailure } from './runtime/contract.js'

/**
 * 往上找**最近的** `package.json`（那就是本包清单）读版本；全找不到就退化，
 * 绝不因此让插件挂不上。
 *
 * ## 为什么不写死一个相对层数
 *
 * 这个文件会在三种位置被执行，而它们的相对深度**并不相同**：
 * `src/host/runtime.ts`（源码/单测）、`lib/host/runtime.js`（生产产物）、
 * 以及被 esbuild 打进测试产物（`npm test` 把 `test` 下的 `*.test.ts` 连依赖打成
 * `.test-build/host/` 里的 `.mjs`，那时 `import.meta.url` 指向的是打包产物）。
 *
 * 写死层数的后果是**静默**的：读不到时 `catch` 把它变成 `'0.0.0'` ——
 * 界面上就是一个假版本号，不报错、不影响启动，也几乎没人会发现。
 * 沿目录往上找（由近及远）在以上四种布局里都指向正确的那一份，
 * 而且是"谁拥有这个文件"的直接翻译。`test/host/version.test.ts` 钉住它。
 */
const MANIFEST_DIRS = ['./', '../', '../../', '../../../'] as const

function readVersion(): string {
  for (const dir of MANIFEST_DIRS) {
    try {
      const manifest = JSON.parse(
        readFileSync(new URL(`${dir}package.json`, import.meta.url), 'utf8'),
      ) as { version?: unknown }
      if (typeof manifest.version === 'string') return manifest.version
    } catch {
      // 这一层没有（或不是合法 JSON）→ 继续往上找
    }
  }
  return '0.0.0'
}

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
  let offers: OfferService | undefined
  let campus: CampusService | undefined
  let overseas: OverseasService | undefined
  const pdfRenderer: PdfRenderer = createPdfRenderer({
    ...(logger === undefined ? {} : { logger }),
  })
  let toolReport: ToolRegistrationReport | null = null
  let heartbeatCancel: (() => void) | null = null
  let failure: RuntimeFailure | null = null
  let readyPromise: Promise<void> | undefined

  /**
   * 清空**全部**服务槽（`close()` 用）。
   *
   * 它紧贴在声明下面，因为"新增一个槽时忘了清"这件事**不会报错**：漏掉的槽在
   * `close()` 之后仍返回一个绑在**已关闭 sqlite** 上的旧服务 —— 不是"未就绪"的
   * `DATA_UNAVAILABLE`，而是拿旧对象去用。这份清单曾经写在 `close()` 里（文件末尾），
   * 于是漂移过一次：`pipeline` / `messages` / `interviews` / `analytics` / `campus` / `overseas`
   * 六个都被漏掉。
   *
   * 现在由 `test/host/lifecycle.test.ts` 兜底：它逐个访问器断言 close 之后一律
   * `DATA_UNAVAILABLE`。**加槽时在下面补一行，并在那个测试里加一条断言。**
   */
  const clearSlots = (): void => {
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
    pipeline = undefined
    messages = undefined
    interviews = undefined
    analytics = undefined
    offers = undefined
    campus = undefined
    overseas = undefined
  }

  /**
   * 取一个**已就绪**的服务；数据层还没起来就抛 `DATA_UNAVAILABLE`。
   *
   * 为什么值得有这么个东西：十几个访问器原本各写一遍
   * `if (x === undefined) throw dataNotReady(runtime)`。样板本身无害，
   * 但它让"哪个访问器漏了检查"必须逐个读才能确认 —— 而漏一个的后果正是
   * 把 `undefined` 漏给调用方（下一个错误信息会离现场很远）。
   */
  const need = <T>(value: T | undefined): T => {
    if (value === undefined) throw dataNotReady(runtime)
    return value
  }

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
   * SR-16：每平台前置条件 —— 判定与它的两个读数（冷却截止 / 今日配额）都在
   * `runtime/gate.ts`。那里是唯一实现；这里只负责把它接到**当前**这一份 store 上
   * （数据层异步就绪，所以传的是读取函数而不是快照）。
   */
  const platformGate: PlatformGate = createPlatformGate({ storeOf: () => store, registry, clock })

  /**
   * 七个编排动作（闸门 + 一次性令牌 + 成功后才回写 + 事件广播）。实现见 `runtime/actions.ts`。
   *
   * 依赖**全部传取值函数**：数据层是异步就绪的，这些槽会在运行期从 undefined 变成服务；
   * 传快照会让动作永远看到 undefined（`gate.ts` 的 `storeOf` 是同一个理由）。
   */
  const actions = createRuntimeActions({
    storeOf: () => store,
    guardOf: () => guard,
    sessionOf: () => session,
    outreachOf: () => outreach,
    settingsOf: () => settings,
    pipelineOf: () => pipeline,
    messagesOf: () => messages,
    registry,
    browser,
    events: bus,
    clock,
    // 简历附件的根目录：只有"把 resume_file.id 解析成绝对路径"这一处要用它
    filesDir: join(dataDir, 'files'),
    failureOf: () => failure,
    ...(logger === undefined ? {} : { logger }),
  })

  /** 当前启用简历的标识；没有简历时是 `{null, 0}`（此时分数一律算作"无简历基准"）。 */
  const currentResumeStamp = (): { resumeId: number | null; rev: number } =>
    resumes?.scoreStamp() ?? { resumeId: null, rev: 0 }

  /** 从当前简历派生匹配偏好（§4.5.1）；派生规则本身在 domain/intel.ts。 */
  const resumeProfile = (): Partial<MatchProfile> | undefined => {
    const service = resumes
    return service === undefined ? undefined : resumeProfileOf(service)
  }

  /** 本实例为什么是只读的（`null` = 不是）。说法只有一份，见 runtime/lifecycle.ts。 */
  const readOnlyReason = (): string | null =>
    readOnlyReasonOf({ storeReady: store !== undefined, failureMessage: failure?.message, lease })

  /** 一条覆盖里"顶层键有哪些"（用于界面判断这东西是不是长得不正常）。非对象一律空。 */
  const overrideKeysOf = (override: unknown): string[] =>
    override !== null && typeof override === 'object' && !Array.isArray(override)
      ? Object.keys(override as Record<string, unknown>)
      : []

  /**
   * 组装适配器配置的三层视图。
   *
   * `effective` 走的是 `spec.config.merge` —— 与 `build` 内部同一个函数，
   * 所以界面上看到的生效值**就是**适配器此刻拿在手里的那一份（见 `AdapterSpec.config`）。
   */
  const buildAdapterConfigOf = (opened: Store, platformId: string): AdapterConfigDto => {
    const spec = adapterSpecOf(platformId)
    if (spec === undefined) {
      throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`, {
        hint: '平台清单见 GET /platforms。',
        detail: { platformId },
      })
    }
    const override = opened.setting.get<unknown>(ADAPTER_CONFIG_KEY, 'platform', platformId) ?? null
    return {
      platformId,
      displayName: registry.get(platformId)?.displayName ?? platformId,
      override,
      defaults: spec.config.defaults,
      effective: spec.config.merge(override ?? undefined),
      overrideKeys: overrideKeysOf(override),
    }
  }

  /**
   * 把硬截止同步进待办（§12.7）。规则本身在 `domain/campus.ts`，这里只做两件事：
   * 在数据层/校招服务还没就绪时安静跳过，以及**失败不影响其它功能**
   * （它挂在心跳上跑，抛出去会打断心跳）。
   */
  const syncDeadlineTodos = (): void => {
    const opened = store
    const service = campus
    if (opened === undefined || service === undefined) return
    try {
      syncDeadlineTodoItems(opened, service.deadlines(), clock())
    } catch (error) {
      logger?.warn(`[${PLUGIN_ID}] 硬截止同步待办失败（不影响其它功能）：${messageOf(error)}`)
    }
  }

  /**
   * 拿到租约后要做的事（心跳里可能晚一步才拿到 —— 见 runtime/lifecycle.ts）。
   * 心跳与两个按钮（重新检测 / 人工接管）共用它，所以只在这里写一次。
   */
  const onLeaseAcquired = (): void => {
    scheduler?.start()
  }

  /** 心跳（含"等对方过期就自己接管"的探测循环）。取消函数归 close 保管。 */
  const cancelHeartbeat = (): void => {
    if (heartbeatCancel === null) return
    heartbeatCancel()
    heartbeatCancel = null
  }

  /**
   * ① 开库 + 浏览器运行配置 + 崩溃恢复（SR-15 悬挂记录收敛）。
   *
   * 失败**不抛**、返回 `undefined`：数据层挂了插件仍要挂上去，
   * 好让 `/health` 与面板能告诉用户「为什么没有数据」，而不是静默消失（§4.9）。
   */
  const openStorePhase = (): Store | undefined => {
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
      return undefined
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

    return opened
  }

  /**
   * ② 模型层（P5）：宿主 llm 服务 → 端口 → 模型服务。
   *
   * **它必须早于任何会用到模型的服务**，尤其早于简历服务 —— 简历定制（`resume_tailor`）
   * 要拿它调模型。这里曾经排在简历之后，于是 `resumes` 拿到的 `ai` 永远是 `undefined`：
   * 表现是"配了模型、也点了用模型定制，结果永远走规则路径"，而且不报错、不留痕
   * （`via` 如实写 `'rule'`，所以也不算说谎 —— 只是那个降级是接线造成的）。
   * 顺序上就能成立的事，别靠注释提醒：`test/host/ai-wiring.test.ts` 钉着它。
   */
  const modelPhase = (opened: Store): AiService => {
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

    // 注意：即便用户没配模型，这个服务也**存在**（它内部一律降级），只是端口为 undefined
    const service = createAiService({
      store: opened,
      llm: () => llmPort,
      onDegrade: (info) => {
        // 降级必须可见：用户要能知道"这次给你的不是模型结果"（J10）
        logger?.info(`[${PLUGIN_ID}] 模型用途 ${info.purpose} 降级：${info.reason}`)
        bus.publish('llm.degraded', { purpose: info.purpose, reason: info.reason })
      },
    })
    ai = service
    // 模型是否真的接上了：这条日志是"为什么一直是模板结果"的第一现场
    logger?.info(
      `[${PLUGIN_ID}] 模型服务已装配（${llmPort === undefined ? '未配置 → 全部降级为规则/模板' : '已接入'}）`,
    )
    return service
  }

  /**
   * ③ 基础领域服务与平台注册。
   *
   * 顺序有依赖：**简历服务在这一步要先建** —— 匹配分要读"当前简历版本"，而 jobs 与 intel 都要它（§4.1）；
   * 而它要用的模型服务已经在 ② 里就位（这正是 ② 必须在前的原因）。
   */
  const coreServicesPhase = (opened: Store, model: AiService): void => {
    const filesDirPath = join(dataDir, 'files')
    resumes = createResumeService({
      store: opened,
      filesDir: filesDirPath,
      clock,
      // 简历定制要用模型（`resume_tailor`）—— 拿到的必须是**已建好的**那一个（见 ② 的注释）
      ai: model,
      pdf: pdfRenderer,
      ...(logger === undefined ? {} : { logger }),
    })
    jobs = createJobService(opened, { scoreStamp: () => currentResumeStamp() })
    companies = createCompanyService(opened)
    // 注册表传进去：方案的平台与筛选条件必须按**适配器声明**校验（SR-39/41/42/45）
    plans = createPlanService(opened, clock, registry)
    session = createSessionService(opened, clock)

    // 适配器清单与注册样板在 runtime/adapters.ts（含 platform 行登记）
    registerAdapters({ store: opened, registry, clock, ...(logger === undefined ? {} : { logger }) })

    // 情报引擎（P4）：先幂等播种内置词表，再装配服务
    intel = createIntelService(opened, clock, {
      resumeProfile,
      scoreStamp: currentResumeStamp,
    })
    const seeded = intel.seedDictionary()
    if (seeded > 0) logger?.info(`[${PLUGIN_ID}] 已播种 ${String(seeded)} 条内置词表`)
  }

  /**
   * ④ 安全闸门与话术、设置（P5）：闸门 → 话术 → 设置。
   *
   * 闸门在这里才建，是因为它要 `session`（③）与审批端口；而话术/设置要模型服务（②）。
   */
  const safetyPhase = (opened: Store, model: AiService): void => {
    guard = createGuard({
      store: opened,
      session,
      approval: approvalPort,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })

    outreach = createOutreachService({
      store: opened,
      ai: model,
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
      ai: model,
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
      // 保留策略（§18）：预览与清理每次都现读，所以写库即生效
      retention: {
        read: () => readRetentionPolicy(opened),
        write: (patch) => writeRetentionPolicy(opened, patch, clock()),
      },
    })

    // 审批通道有没有，是"高危动作会不会被一律拒绝"的第一现场（模型接入与否见 ② 的日志）
    logger?.info(
      `[${PLUGIN_ID}] 安全闸门已就绪（审批通道：${approvalService === undefined ? '无 → 高危一律拒绝' : '有'}）`,
    )
    if (isOfflineMode()) {
      logger?.warn(
        `[${PLUGIN_ID}] 离线模式已开启（${NO_NETWORK_ENV}）：抓取与登录引导一律拒绝，` +
          '这是「自动化测试绝不访问真实招聘站」的机制化兜底。',
      )
    }
  }

  /** ⑤ 跟进与看板（P7）+ 校招与海外支线（P8），最后宣告数据层就绪。 */
  const followUpPhase = (opened: Store, model: AiService): void => {
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
      return await need(guard).run(
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
      ai: model,
      ...(logger === undefined ? {} : { logger }),
    })
    interviews = createInterviewService({
      store: opened,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    analytics = createAnalyticsService({ store: opened })
    // Offer（§4.H）：要模型是为了 `offer_compare` 的建议；关掉用途/没有模型时
    // 对比表照常可用（结论 `facts` 是规则算的）
    offers = createOfferService({
      store: opened,
      clock,
      ai: model,
      ...(logger === undefined ? {} : { logger }),
    })

    // ── P8：校招与海外支线 ──────────────────────────────────────────
    campus = createCampusService({
      store: opened,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    overseas = createOverseasService({
      store: opened,
      ai: model,
      clock,
      ...(logger === undefined ? {} : { logger }),
    })
    // 硬截止进待办：这些节点**不可逆**，所以必须是 urgent 而不是普通提示（§12.7）。
    // 同步逻辑在 syncDeadlineTodos()，心跳里还会再跑一次 —— 只在启动时写一次的话，
    // 用户今天新建的笔试要等到下次重启才会进待办。
    syncDeadlineTodos()

    bus.publish('data.ready', { path: opened.path })
  }

  /** ⑥ 租约与调度（R20 / P3）：单实例仲裁 → 心跳 → 登录引导 → 自排程器。 */
  const schedulingPhase = (opened: Store): void => {
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
    heartbeatCancel = startHeartbeat({
      lease,
      timer: timerPort,
      events: bus,
      ...(logger === undefined ? {} : { logger }),
      onAcquired: onLeaseAcquired,
      // 硬截止待办跟着心跳走：新截止要能进待办，旧待办的数字也要跟着时间变
      onBeat: syncDeadlineTodos,
      describe: (verdict) =>
        `已接管租约（上一次持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期），开始调度`,
    })

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
    scheduler.start()
  }

  /**
   * 数据层从"打不开"到"能调度"的**全部步骤，按顺序读**。
   *
   * 拆成阶段不是为了少几行：这里的顺序是有语义的（库没开就没有服务、没有租约就不许
   * 驱动浏览器），而一个四百行的函数里读不出"哪些相邻是顺序要求、哪些只是碰巧挨着"。
   * 失败语义也随之分开了 —— **只有 ① 会失败**（后面各阶段的输入是一份已打开的库），
   * 而 ① 的失败不抛（见它自己的注释）。
   */
  const openDataLayer = (): void => {
    const opened = openStorePhase()
    if (opened === undefined) return
    // 模型服务**显式往下传**：谁要用模型，签名上就写着（不再靠"它在前面已经赋过值了"）
    const model = modelPhase(opened)
    coreServicesPhase(opened, model)
    safetyPhase(opened, model)
    followUpPhase(opened, model)
    schedulingPhase(opened)
    autoCleanPhase(opened)
  }

  /**
   * ⑦ 启动时的**定时清理**（§18.3 P1，默认关闭）。
   *
   * 为什么放在最后、只跑一次：VACUUM 可能阻塞几百毫秒到几秒，而心跳是几十秒一次的轻活 ——
   * 往心跳里塞写操作迟早出事。放在启动末尾，代价可预期；而且此时租约已拿到（
   * `schedulingPhase` 在前面），不会出现"只读实例偷偷删数据"。
   *
   * 只在**真的删了东西**时才提示：默认关、且大多数启动没有到期数据，
   * 每天弹一条"清理完成（0 行）"只会让人学会忽略通知。
   */
  const autoCleanPhase = (opened: Store): void => {
    if (!lease.held()) return
    try {
      const result = maybeAutoClean(opened, clock)
      if (result === null) return
      logger?.info(
        `[${PLUGIN_ID}] 启动时自动清理：${String(result.totalRows)} 行 · ` +
          `文件 ${String(result.dbBytesBefore)} → ${String(result.dbBytesAfter)} 字节`,
      )
      bus.publish('storage.cleaned', {
        totalRows: result.totalRows,
        dbBytesBefore: result.dbBytesBefore,
        dbBytesAfter: result.dbBytesAfter,
        vacuumed: result.vacuumed,
        automatic: true,
      })
    } catch (error) {
      // 自动清理失败绝不能影响启动（它是后台的维护动作，不是启动的必要条件）
      logger?.warn(`[${PLUGIN_ID}] 启动时自动清理失败（不影响其它功能）：${messageOf(error)}`)
    }
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
      return buildHealth({
        store,
        registry,
        version,
        startedAt,
        dataError: failure?.message ?? '数据层尚未就绪',
        tools: toolReport,
      })
    },

    today(): TodayDto {
      const opened = store
      if (opened === undefined) {
        return buildTodayUnavailable(failure?.message ?? '数据层尚未就绪', systemClock())
      }
      return buildToday({
        store: opened,
        registry,
        clock,
        // offer 截止倒计时（H3）：它是**有时间窗**的决策，必须进首屏
        ...(offers === undefined ? {} : { offers }),
      })
    },

    crawlStatus(): CrawlStatusDto {
      return buildCrawlStatus({ store, registry, busy: platformLocks.busy() })
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
      requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边抓取。')

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
      return need(intel)
    },

    // ── P5：安全与工具 ────────────────────────────────────────────────
    guard(): Guard {
      return need(guard)
    },

    ai(): AiService {
      return need(ai)
    },

    outreach(): OutreachService {
      return need(outreach)
    },

    settings(): SettingsService {
      return need(settings)
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
      return need(resumes)
    },

    filesDir(): string {
      return join(dataDir, 'files')
    },

    pdfRendererRunning(): boolean {
      return pdfRenderer.isRunning()
    },

    pipeline(): PipelineService {
      return need(pipeline)
    },

    messages(): MessageService {
      return need(messages)
    },

    interviews(): InterviewService {
      return need(interviews)
    },

    analytics(): AnalyticsService {
      return need(analytics)
    },

    offers(): OfferService {
      return need(offers)
    },

    followUps(): FollowUpSuggestion[] {
      return pipeline?.followUpSuggestions() ?? []
    },

    unreadCount(): number {
      return messages?.unreadCount() ?? 0
    },

    campus(): CampusService {
      return need(campus)
    },

    overseas(): OverseasService {
      return need(overseas)
    },

    deadlines(): DeadlineDto[] {
      return campus?.deadlines() ?? []
    },

    // ── P5：高危动作与配置写入 ────────────────────────────────────────
    // 七个编排（闸门 + 令牌 + 成功后才回写 + 事件广播）在 runtime/actions.ts。
    // 放那边的理由是顺序约束要能被一屏读完 —— 读不完的顺序约束等于没有约束。
    draftGreeting: actions.draftGreeting,
    sendGreeting: actions.sendGreeting,
    previewGreetingBatch: actions.previewGreetingBatch,
    sendGreetingBatch: actions.sendGreetingBatch,
    replyToMessage: actions.replyToMessage,
    syncInbox: actions.syncInbox,
    probeContactStage: actions.probeContactStage,
    sendApplication: actions.sendApplication,
    previewApplicationBatch: actions.previewApplicationBatch,
    sendApplicationBatch: actions.sendApplicationBatch,
    updateSettings: actions.updateSettings,

    // ── P3 ────────────────────────────────────────────────────────────
    plans(): PlanService {
      return need(plans)
    },

    schedulerStatus(): SchedulerStatusDto {
      // 数据层还没就绪：如实报告（字段清单在 views.ts，与真实的 status 形状对齐）
      if (scheduler === undefined) {
        return unavailableSchedulerStatus(readOnlyReason() ?? '数据层尚未就绪', lease.status())
      }
      return scheduler.status()
    },

    setSchedulePaused(paused, reason): void {
      need(scheduler).setPaused(paused, reason)
    },

    resumeRisk(planId): void {
      need(scheduler).resumeRisk(planId)
    },

    recheckLease(): SchedulerStatusDto {
      // 只读实例不能躺平等：上一个实例可能刚被关掉，这里立刻重试一次
      if (!lease.held()) {
        takeOverLease({
          lease,
          events: bus,
          ...(logger === undefined ? {} : { logger }),
          onAcquired: onLeaseAcquired,
          describe: (verdict) =>
            `重新检测后接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')}）`,
        })
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
      const taken = takeOverLease({
        lease,
        events: bus,
        ...(logger === undefined ? {} : { logger }),
        onAcquired: onLeaseAcquired,
        level: 'warn',
        describe: (verdict) =>
          `人工接管了租约（原持有者 pid ${String(verdict.other?.pid ?? '?')} 心跳已过期）`,
      })
      if (!taken) {
        throw new DomainError('CONFLICT', '接管租约失败', {
          hint: '另一个实例刚刚又活过来了。点「重新检测」看看当前状态。',
        })
      }
      return runtime.schedulerStatus()
    },

    async runPlan(planId, reason): Promise<CrawlSummaryDto> {
      return await need(scheduler).runPlan(planId, reason)
    },

    async schedulerTick(): Promise<void> {
      if (scheduler === undefined) return
      await scheduler.tick()
    },

    platforms(): PlatformOverviewDto[] {
      return buildPlatforms({
        store,
        registry,
        sessionOf: () => session,
        loginFlowOf: () => loginFlow,
        gate: platformGate,
        clock,
      })
    },

    loginStatuses(): LoginStatusDto[] {
      return buildLoginStatuses({ registry, sessionOf: () => session, loginFlowOf: () => loginFlow })
    },

    startLogin(platformId): LoginStatusDto {
      // 登录引导会真的打开招聘站页面 —— 同样受离线闸门约束
      assertNetworkAllowed('打开招聘网站登录页')
      // 与 `crawl` 同一条纪律（R20）：只读实例不许开浏览器。
      // 两个实例共用一个 browser-profile 目录会互相踩，而登录引导恰好是**最长**的一次占用
      // （用户在里面输密码，可能几分钟）—— 恰恰是最不该被第二个实例插进来的场景。
      requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边登录，避免两个实例抢同一个浏览器 profile。')
      return need(loginFlow).start(platformId)
    },

    closeTodo(id): boolean {
      return need(store).todo.close(id, clock())
    },

    guardUsage(platformId): GuardUsageDto {
      const opened = store
      const since = `${clock().slice(0, 10)}T00:00:00.000Z`
      // 数据层没就绪时 U0 仍要能渲染：如实说明，而不是抛错让首屏整块空掉
      if (opened === undefined) {
        return { since, platforms: [], note: '数据层尚未就绪 —— 暂时读不到额度余量。' }
      }
      const targets =
        platformId === undefined
          ? registry.list().map((adapter) => ({ id: adapter.id, displayName: adapter.displayName }))
          : (() => {
              const adapter = registry.get(platformId)
              if (adapter === undefined) {
                throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`, {
                  hint: '平台清单见 GET /platforms。',
                  detail: { platformId },
                })
              }
              return [{ id: adapter.id, displayName: adapter.displayName }]
            })()
      return {
        since,
        platforms: targets.map((target) => ({
          platformId: target.id,
          displayName: target.displayName,
          actions: guardUsageOf(opened, clock, target.id),
        })),
        note:
          '计数只算**今天成功**的动作（口径与闸门拒绝时同一份：审计表 + UTC 日）。' +
          'limit 是 min(你的每日额度, 平台侧上限)；limitedBy=platform 时改自己的额度没有用。',
      }
    },

    adapterConfig(platformId): AdapterConfigDto {
      return buildAdapterConfigOf(need(store), platformId)
    },
    updateAdapterConfig(platformId, override): AdapterConfigDto {
      const opened = need(store)
      const spec = adapterSpecOf(platformId)
      if (spec === undefined) {
        throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`, {
          hint: '平台清单见 GET /platforms。',
          detail: { platformId },
        })
      }
      // 只接受普通对象或 null：数组/字符串/数字都不是"一份配置覆盖"，
      // 放进去会在 merge 时被当成"没改"而静默无效（那正是最难查的一类问题）
      if (override !== null && (typeof override !== 'object' || Array.isArray(override))) {
        throw new DomainError('INVALID_INPUT', 'override 必须是一个 JSON 对象，或 null（清除覆盖）', {
          hint: '只写你要改的键即可（会与代码默认值合并），例如 {"selectors":{"card":".joblist-item"}}。',
        })
      }
      const serialized = JSON.stringify(override ?? null)
      if (serialized.length > ADAPTER_CONFIG_MAX_CHARS) {
        throw new DomainError('INVALID_INPUT', `覆盖太大了（${String(serialized.length)} 字符，上限 ${String(ADAPTER_CONFIG_MAX_CHARS)}）`, {
          hint: '配置覆盖只该写"要改的那几个键"，不该整份复制进来。',
        })
      }
      if (override === null) {
        opened.setting.remove(ADAPTER_CONFIG_KEY, 'platform', platformId)
      } else {
        opened.setting.set(ADAPTER_CONFIG_KEY, 'platform', platformId, override, clock())
      }
      // **重建并热替换**：配置是在 build 时快照进闭包的，只写库要等下次装配才生效（J2）
      const adapter = rebuildAdapter(spec, override ?? undefined, registry)
      const next = buildAdapterConfigOf(opened, platformId)
      bus.publish('adapter.config.updated', {
        platformId,
        keys: next.overrideKeys,
        cleared: override === null,
      })
      logger?.info(
        `[${PLUGIN_ID}] 适配器 ${platformId} 配置已更新并热生效（覆盖键：${
          next.overrideKeys.length === 0 ? '无（回到代码默认）' : next.overrideKeys.join('、')
        }；适配器 ${adapter.displayName}）`,
      )
      return next
    },

    // ── P20：数据保留、清理与可携带性（§18 / J8）──────────────────────
    storage(): StorageUsageDto {
      return storageUsageOf(need(store), dataDir, clock)
    },

    cleanupPreview(): CleanupPlanDto {
      return cleanupPlanOf(need(store), clock)
    },

    runCleanup(only): CleanupResultDto {
      const opened = need(store)
      // 与 `crawl` / `startLogin` 同一条纪律：只读实例不许写库（两个实例抢同一个文件）
      requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边清理数据。')
      const result = runCleanupOf(opened, only === undefined ? {} : { only }, clock)
      if (result.totalRows > 0) {
        bus.publish('storage.cleaned', {
          totalRows: result.totalRows,
          dbBytesBefore: result.dbBytesBefore,
          dbBytesAfter: result.dbBytesAfter,
          vacuumed: result.vacuumed,
        })
      }
      logger?.info(
        `[${PLUGIN_ID}] 数据清理：${String(result.totalRows)} 行 · ` +
          `文件 ${String(result.dbBytesBefore)} → ${String(result.dbBytesAfter)} 字节` +
          `${result.vacuumed ? '（已 VACUUM）' : '（未 VACUUM）'}`,
      )
      return result
    },

    exportData(format) {
      const opened = need(store)
      const result = exportDataOf({ store: opened, filesDir: join(dataDir, 'files'), format }, clock)
      bus.publish('data.exported', { format, fileName: result.fileName, bytes: result.bytes.byteLength })
      return result
    },

    saveExport(format) {
      const opened = need(store)
      const result = exportDataOf({ store: opened, filesDir: join(dataDir, 'files'), format }, clock)
      const dir = join(dataDir, EXPORTS_DIR_NAME)
      mkdirSync(dir, { recursive: true })
      const path = join(dir, basename(result.fileName))
      writeFileSync(path, result.bytes)
      bus.publish('data.exported', { format, fileName: result.fileName, bytes: result.bytes.byteLength })
      logger?.info(`[${PLUGIN_ID}] 已导出数据（${format}）→ ${path}（${String(result.bytes.byteLength)} 字节）`)
      return {
        fileName: result.fileName,
        path,
        bytes: result.bytes.byteLength,
        entries: result.entries,
        note: result.note,
      }
    },

    readExportFile(fileName) {
      // 只认文件名：`basename` 之外的一律拒绝 —— 与 `system/reveal` 同一条纪律
      // （不接受任意路径，于是"导入"永远不会读到你没预期的文件）
      const safe = basename(fileName)
      if (safe !== fileName || safe === '' || safe.startsWith('.')) {
        throw new DomainError('INVALID_INPUT', `只接受 exports/ 目录下的文件名：${fileName}`, {
          hint: '用 data_transfer 的 export 动作先导出，再用返回的文件名导入。',
        })
      }
      const path = join(dataDir, EXPORTS_DIR_NAME, safe)
      try {
        return readFileSync(path, 'utf8')
      } catch (error) {
        throw new DomainError('NOT_FOUND', `读不到导出文件：${safe}`, {
          hint: `它应该在本机的 ${join(dataDir, EXPORTS_DIR_NAME)} 目录下。`,
          cause: error,
        })
      }
    },

    importJobs(input): DataImportResultDto {
      const opened = need(store)
      requireLease(lease, readOnlyReason, '另一个实例正在运行 —— 请在那边导入数据。')
      const companyService = companies
      const intelService = intel
      const result = importJobsOf(
        {
          store: opened,
          ensureCompany: (companyInput) => {
            if (companyService === undefined) {
              throw new DomainError('DATA_UNAVAILABLE', '公司服务还没就绪')
            }
            return companyService.ensureByName(companyInput, clock())
          },
          // 导入的岗位立刻算一遍匹配分与标注，与抓取来的岗位长得一样 ——
          // 否则用户在列表里看到一批"还没有分"的岗位，会以为导入没成功
          ...(intelService === undefined ? {} : { evaluate: (jobId: number) => intelService.evaluateJob(jobId, clock()) }),
        },
        input,
        clock,
      )
      if (result.inserted > 0 || result.updated > 0) {
        bus.publish('data.imported', {
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
        })
      }
      logger?.info(
        `[${PLUGIN_ID}] 导入岗位（${input.format}）：新增 ${String(result.inserted)} · ` +
          `更新 ${String(result.updated)} · 跳过 ${String(result.skipped)}`,
      )
      return result
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
      const opened = need(store)
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
      cancelHeartbeat()
      loginFlow?.cancelAll()
      try {
        store?.close()
      } catch (error) {
        logger?.warn(`[${PLUGIN_ID}] 关闭数据库失败：${messageOf(error)}`)
      }
      // 一次清空**全部**槽（清单在声明旁边，见 clearSlots）
      clearSlots()
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
