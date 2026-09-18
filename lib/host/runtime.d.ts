import type { CrawlStatusDto, CrawlSummaryDto, DeadlineDto, GreetingDraftDto, HealthDto, LoginStatusDto, PlanDto, PlatformOverviewDto, SchedulerStatusDto, TodayDto } from '../shared/dto.js';
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
import { type GreetingSendResult } from './guard/actions/greeting.js';
import { type ApplicationSendResult } from './guard/actions/application.js';
import { type InboxSyncResult } from './guard/actions/inbox.js';
import type { Guard } from './guard/index.js';
import type { Actor } from './guard/types.js';
import { type EventBus } from './http/sse.js';
import type { BrowserManager } from './platform/browser.js';
import type { PlatformLocks } from './platform/locks.js';
import type { AdapterRegistry } from './platform/registry.js';
import type { SearchCriteria } from './platform/types.js';
import { type RunReason } from './scheduler/index.js';
import { type TimerLike } from './scheduler/timer-port.js';
import type { SettingsPatch, SettingsService, SettingsSnapshot } from './settings.js';
import type { Store } from './store/store.js';
import type { ToolRegistrationReport } from './tools/index.js';
import { DomainError } from './util/errors.js';
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
export interface RuntimeFailure {
    code: string;
    message: string;
    hint?: string;
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
    }): Promise<GreetingSendResult>;
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
     * 投递简历 —— **高危**（§22.4），走 `application.send` 闸门。
     *
     * 与 `pipeline.recordApplication` 的区别：那是"记一笔我投了"，这是**真的投出去**。
     * `filePath` 省略/null = 用平台内简历（BOSS 求职者网页端只支持这种）。
     */
    sendApplication(input: {
        jobId: number;
        filePath?: string | null;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<ApplicationSendResult>;
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
/** 数据层未就绪时的统一错误。 */
export declare function dataNotReady(runtime: HostRuntime): DomainError;
export declare function createHostRuntime(options?: HostRuntimeOptions): HostRuntime;
export type { PlanDto };
//# sourceMappingURL=runtime.d.ts.map