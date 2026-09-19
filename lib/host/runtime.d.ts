import type { AdapterConfigDto, CleanupPlanDto, CleanupResultDto, CrawlStatusDto, CrawlSummaryDto, DataExportFormat, DataExportEntryDto, DataImportResultDto, DeadlineDto, ApplicationBatchPlanDto, ApplicationBatchResultDto, GreetingBatchPlanDto, GreetingBatchResultDto, GreetingDraftDto, GuardUsageDto, HealthDto, LoginStatusDto, PlatformOverviewDto, SchedulerStatusDto, StorageUsageDto, TodayDto } from '../shared/dto.js';
import type { AiService } from './ai/client.js';
import type { CompanyService } from './domain/companies.js';
import type { DedupSweepResult } from './domain/dedupe-sweep.js';
import type { JobService } from './domain/jobs.js';
import type { PipelineService, FollowUpSuggestion } from './domain/pipeline.js';
import type { MessageService } from './domain/messages.js';
import type { InterviewService } from './domain/interviews.js';
import type { AnalyticsService } from './domain/analytics.js';
import type { CampusService } from './domain/campus.js';
import type { OverseasService } from './domain/overseas.js';
import type { OutreachService } from './domain/outreach.js';
import type { ResumeService } from './domain/resumes.js';
import type { PlanService } from './domain/plans.js';
import type { IntelService } from './domain/intel.js';
import type { ApplicationSendResult } from './guard/actions/application.js';
import type { GreetingSendResult } from './guard/actions/greeting.js';
import type { InboxSyncResult } from './guard/actions/inbox.js';
import type { ReplySendResult } from './guard/actions/reply.js';
import type { StageProbeResult } from './guard/actions/stage.js';
import type { Guard } from './guard/index.js';
import type { Actor } from './guard/types.js';
import { type EventBus } from './http/sse.js';
import type { BrowserManager } from './platform/browser.js';
import type { PlatformLocks } from './platform/locks.js';
import type { AdapterRegistry } from './platform/registry.js';
import type { SearchCriteria } from './platform/types.js';
import type { RuntimeFailure } from './runtime/contract.js';
import { type RunReason } from './scheduler/index.js';
import { type TimerLike } from './scheduler/timer-port.js';
import type { SettingsPatch, SettingsService, SettingsSnapshot } from './settings.js';
import type { Store } from './store/store.js';
import type { ToolRegistrationReport } from './tools/types.js';
export interface RuntimeLogger {
    info(message: string): void;
    warn(message: string): void;
}
export interface HostRuntimeOptions {
    dataDir?: string;
    logger?: RuntimeLogger;
    /** Cordis 的 timer 服务（可选）。缺失时退到原生定时器，而不是让调度不工作。 */
    timer?: TimerLike;
    /**
     * `ctx.llm`（可选）。缺失时一切模型用途走规则/模板降级 —— 功能降级但不崩（J10、§4.5）。
     * 类型故意是 `unknown`：装配点是唯一需要形状断言的地方，其余代码只见 `LlmPort`。
     */
    llm?: unknown;
    /** `ctx.agentDefaultModel`（可选）。用于解析默认的 provider/model 路由。 */
    defaultModel?: unknown;
    /**
     * `ctx.approval`（可选）。**这是模型发起高危动作的唯一审批通道**（§22.4）。
     * 缺失时审批端口一律 fail-closed（拒绝）。
     */
    approval?: unknown;
}
export interface HostRuntime {
    /** 异步就绪。幂等；失败不 reject（失败信息进 `failure()`）。 */
    ready(): Promise<void>;
    isReady(): boolean;
    failure(): RuntimeFailure | null;
    /** 给 `/health` 用的快照。数据层没就绪时也安全返回。 */
    health(): HealthDto;
    /** U0 今日聚合。 */
    today(): TodayDto;
    crawlStatus(): CrawlStatusDto;
    /** 手动触发一次抓取（走真实浏览器）。 */
    crawl(options: {
        platformId: string;
        criteria: SearchCriteria;
        planId?: number | null;
        /** SR-28：触发原因，落进 `crawl_run.reason`（定时/人工/补跑）。 */
        reason?: RunReason;
        /** SR-46：本轮的到点时刻（ISO）。调度器给；直接调（界面/工具）不传 = 无预算。 */
        deadlineAt?: string;
    }): Promise<CrawlSummaryDto>;
    /** B3/SR-30：全局一键暂停（**只停定时**，手动永远可用）。 */
    setSchedulePaused(paused: boolean, reason?: string): void;
    /** SR-21：人工确认恢复风控暂停的方案。 */
    resumeRisk(planId: number): void;
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
    recheckLease(): SchedulerStatusDto;
    /**
     * 人工**接管**租约（R20 的逃生出口）。
     *
     * **只在对方心跳已过期时才允许**：一个还活着的实例绝不能被抢走租约，
     * 否则两个调度器会同时抓取、抢同一个浏览器 profile —— 那正是 R20 要防的事。
     * 所以这个动作的语义是"我确认那个实例已经死了"，而不是"我要强抢"。
     * 对方还活着时它**如实拒绝**并告诉用户该怎么办。
     */
    takeoverLease(): SchedulerStatusDto;
    /** 实时事件总线（ADR-24：事件只作提示）。 */
    events(): EventBus;
    /** 情报引擎（P4）。 */
    intel(): IntelService;
    /** 安全闸门。**唯一**的危险动作入口（GUI 与模型工具共用同一实例）。 */
    guard(): Guard;
    /** 模型服务（含隐私闸门与调用留痕）。数据层没就绪时抛 `DATA_UNAVAILABLE`。 */
    ai(): AiService;
    /** 话术生成（只生成，不发送）。 */
    outreach(): OutreachService;
    settings(): SettingsService;
    /** 生成话术草稿（不发送）。`tone` 与 `highlights` 可选。 */
    draftGreeting(input: {
        jobId: number;
        tone?: 'formal' | 'warm' | 'concise';
        highlights?: string[];
        extra?: string;
    }): Promise<GreetingDraftDto>;
    /**
     * 发送打招呼 —— **高危**（§22.4）。
     *
     * `actor === 'gui'` 且 `guiConfirmed !== true` 时抛 `ConfirmRequiredError`（不是拒绝），
     * 界面上把确认文案显示给用户，用户同意后带 `guiConfirmed: true` 重发。
     * 模型发起时走 `ctx.approval`；`guiConfirmed` 由模型设置会被直接拒绝。
     */
    sendGreeting(input: {
        jobId: number;
        text?: string;
        actor: Actor;
        guiConfirmed?: boolean;
        /** 整批条数（批量逐条发送时透传给闸门，用于 §22.4 的批量上限）。 */
        batchSize?: number;
    }): Promise<GreetingSendResult>;
    /**
     * 批量打招呼的**预览**（D3 / U1）：哪些条能发、为什么不能、将发出什么。
     *
     * **只读、无副作用**（界面必须先调它、把逐条结果给用户看过，才允许发）。
     * 只为"能发"的项生成话术 —— 注定发不出去的岗位不值得花模型调用。
     */
    previewGreetingBatch(input: {
        jobIds: number[];
        actor: Actor;
    }): Promise<GreetingBatchPlanDto>;
    /**
     * 批量打招呼 —— **高危**（§22.4）。
     *
     * **逐条过闸门、逐条回执**：每条都独立走 `greeting.send` 的完整检查链与审批，
     * 一条失败不影响其它条（没有"整批失败"这种状态）。
     * 条与条之间由宿主插入 3–9 秒随机间隔（D3 的"随机间隔"，界面与模型都绕不过）。
     */
    sendGreetingBatch(input: {
        items: Array<{
            jobId: number;
            text?: string;
        }>;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<GreetingBatchResultDto>;
    /**
     * 回复一条 HR 消息 —— **高危**（§22.4），走 `message.reply` 闸门，**真的发到平台上**。
     *
     * 与 `messages().record()` 的区别：那是"记一笔我说过的话"，这是**真的发出去**。
     * 本地那条记录由闸门动作在**发送成功之后**写入 —— 所以不会再出现
     * "界面说已回复、平台上什么都没有"（2026-09-18 修正的正是这一点）。
     */
    replyToMessage(input: {
        messageId: number;
        content: string;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<ReplySendResult>;
    /**
     * 同步收件箱 —— 把平台会话列表读进本地消息表（§13 U6）。
     *
     * **低危**（不对外发任何东西），但仍经闸门：它会开一个真实浏览器页面访问平台。
     * `actor === 'model'` 也不会被要求审批（低危不打扰用户）。
     */
    syncInbox(input: {
        platformId: string;
        actor: Actor;
    }): Promise<InboxSyncResult>;
    /**
     * 探测某岗位在平台上的接触阶段（§13 U6 的「已读 / 已回」）。
     *
     * **低危**（只看不发），但仍经闸门：它会开一个真实浏览器页面。模型发起也不打扰用户。
     *
     * ⚠️ **只报事实、不改状态**（识别 ≠ 改状态，§4.3）：`stage` 是平台上看到的东西，
     * 本地那条接触态不会被它改动 —— 误判一次就会让一个真在推进的岗位被漏掉。
     * `stage === null` = 判不出来（会话不在列表里 / 状态标记认不出来），**不猜**。
     */
    probeContactStage(input: {
        jobId: number;
        actor: Actor;
    }): Promise<StageProbeResult>;
    /**
     * 投递简历 —— **高危**（§22.4），走 `application.send` 闸门。
     *
     * 与 `pipeline.recordApplication` 的区别：那是"记一笔我投了"，这是**真的投出去**。
     * `resumeFileId` 省略/null = 用平台内简历（BOSS 与智联的网页端都只支持这种）。
     */
    sendApplication(input: {
        jobId: number;
        /** 关联哪份简历附件（`resume_file.id`）；`null` = 平台内简历。**不接受路径**。 */
        resumeFileId?: number | null;
        actor: Actor;
        guiConfirmed?: boolean;
        /** 批量时带整批条数（`checkBatch` 的批量上限靠它判定）。 */
        batchSize?: number;
    }): Promise<ApplicationSendResult>;
    /**
     * 批量投递的**预览**（L4）：逐条给出"能不能投 + 为什么 + 用哪份简历"。只读、无副作用。
     */
    previewApplicationBatch(input: {
        jobIds: number[];
        resumeFileId: number | null;
        actor: Actor;
    }): Promise<ApplicationBatchPlanDto>;
    /** 批量投递：**逐条过闸门、逐条回执**（不可逆，所以回执带送达状态）。 */
    sendApplicationBatch(input: {
        jobIds: number[];
        resumeFileId: number | null;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<ApplicationBatchResultDto>;
    /** 写插件配置。走 `settings.write` 闸门。 */
    updateSettings(patch: SettingsPatch, actor: Actor, guiConfirmed?: boolean): Promise<SettingsSnapshot>;
    /** 简历服务（版本、定制、附件生成）。 */
    resumes(): ResumeService;
    /** 附件根目录（`<dataDir>/files`）。 */
    filesDir(): string;
    /** PDF 渲染器是否在跑（诊断用；空闲时会自动关闭）。 */
    pdfRendererRunning(): boolean;
    pipeline(): PipelineService;
    messages(): MessageService;
    interviews(): InterviewService;
    analytics(): AnalyticsService;
    /** 跟进建议（未读超时 / 已读未回超时是**两条不同分支**，§12.2）。 */
    followUps(): FollowUpSuggestion[];
    /** 未读消息数（U0 与侧栏角标用）。 */
    unreadCount(): number;
    campus(): CampusService;
    overseas(): OverseasService;
    /**
     * 所有**不可逆硬截止**（笔试截止 / 网申截止 / 三方签署）。
     *
     * U0 与待办系统只认这一种为 urgent —— 校招的笔试错过就出局（§12.7 / 决策记录第 3 条）。
     */
    deadlines(): DeadlineDto[];
    /** 审批通道是否可用（诊断与 `/health` 用）。 */
    approvalAvailable(): boolean;
    /**
     * 记下模型工具的注册结果（由插件入口在注册后调用）。
     *
     * 为什么要在 `/health` 里暴露：工具静默少了一个是"模型忽然做不到某件事"里最难查的原因。
     * 实测就是靠这一条发现了与宿主 `job_list` 的重名。
     */
    setToolReport(report: ToolRegistrationReport): void;
    /** 当前工具注册结果；还没注册时为 null。 */
    toolReport(): ToolRegistrationReport | null;
    plans(): PlanService;
    schedulerStatus(): SchedulerStatusDto;
    runPlan(planId: number, reason: Exclude<RunReason, 'schedule'>): Promise<CrawlSummaryDto>;
    /** 直接驱动一次到期检查（测试与诊断用；生产走定时器）。 */
    schedulerTick(): Promise<void>;
    platforms(): PlatformOverviewDto[];
    loginStatuses(): LoginStatusDto[];
    startLogin(platformId: string): LoginStatusDto;
    closeTodo(id: number): boolean;
    /**
     * D7 的额度读数：每个平台、每个动作今天用了几次、还剩几次。
     *
     * ⚠️ 它与**抓取配额**（`PlatformGovernanceDto.todayRuns`）是两回事：那个数的是
     * "自动跑了几轮采集"，这个数的是"发了几条招呼 / 投了几份 / 回了几条"。
     * 以前只有前者有读数，所以 U0 的「额度余量」其实一直是抓取配额。
     *
     * @param platformId 省略 = 所有已注册平台
     */
    guardUsage(platformId?: string): GuardUsageDto;
    /** 某个平台的适配器配置三层视图（默认 / 覆盖 / 生效）。数据层未就绪时抛 `DATA_UNAVAILABLE`。 */
    adapterConfig(platformId: string): AdapterConfigDto;
    /**
     * 写入适配器配置覆盖并**热替换**适配器（J2：不要求重启插件）。
     *
     * `override === null` = 清除覆盖，回到代码默认。
     */
    updateAdapterConfig(platformId: string, override: unknown): AdapterConfigDto;
    /** 磁盘占用（§18.3 P3）：真实文件大小 + 按表 dbstat 占用 + 按类型的行数。 */
    storage(): StorageUsageDto;
    /**
     * 清理**预览**（§18.3 P2，P0）：**只读、无副作用**，可反复调用。
     *
     * 它给出"将删多少行 / 预计释放多少"，并如实说明"只有 VACUUM 之后文件才会变小"。
     */
    cleanupPreview(): CleanupPlanDto;
    /**
     * 执行清理。**调用方必须先确认**（路由层两段式）且**必须持有租约**。
     *
     * @param only 只清这几类；缺省 = 预览里所有 `willRun` 的项
     */
    runCleanup(only?: readonly string[]): CleanupResultDto;
    /** 导出到**内存**（HTTP 直接回给浏览器下载）。 */
    exportData(format: DataExportFormat): {
        fileName: string;
        bytes: Uint8Array;
        entries: DataExportEntryDto[];
        note: string;
    };
    /**
     * 导出并**落盘**到 `<dataDir>/exports/`（模型工具用：对话里没法接二进制流）。
     *
     * 为什么限定这个目录：与 `system/reveal` 同一条纪律 —— 不接受任意路径，
     * 于是"导出"永远不会写到你没预期的地方。
     */
    saveExport(format: DataExportFormat): {
        fileName: string;
        path: string;
        bytes: number;
        entries: DataExportEntryDto[];
        note: string;
    };
    /** 读 `exports/` 下的一个文件（模型工具导入用）；只认文件名，不认路径。 */
    readExportFile(fileName: string): string;
    /** 导入岗位（CSV / JSON）。幂等。 */
    importJobs(input: {
        format: 'csv' | 'json';
        content: string;
    }): DataImportResultDto;
    store(): Store | undefined;
    jobs(): JobService | undefined;
    companies(): CompanyService | undefined;
    /**
     * 全库去重复核（批次 4）。
     *
     * 放在 runtime 上而不是让每个入口各自调 `sweepDedup`：三条入口（GUI / 模型工具 / HTTP）
     * 必须走**同一份实现**，否则"界面复核了、工具复核的是另一套"——正是 SR-45 那条纪律。
     */
    sweepDedup(): DedupSweepResult;
    registry(): AdapterRegistry;
    /** 按平台互斥（同平台串行 / 跨平台并发）。见 platform/locks.ts。 */
    locks(): PlatformLocks;
    browser(): BrowserManager;
    /** 同步收尾：停调度、关库、放租约、发起关闭浏览器（不阻塞调用方）。 */
    close(): void;
}
export { dataNotReady } from './runtime/contract.js';
export type { RuntimeFailure } from './runtime/contract.js';
export declare function createHostRuntime(options?: HostRuntimeOptions): HostRuntime;
//# sourceMappingURL=runtime.d.ts.map