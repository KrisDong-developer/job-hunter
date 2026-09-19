import type { ApplicationBatchPlanDto, ApplicationBatchResultDto, GreetingBatchPlanDto, GreetingBatchResultDto } from '../../shared/contract/dto/batch.js';
import type { GreetingDraftDto } from '../../shared/contract/dto/pipeline.js';
import type { OutreachService } from '../domain/outreach.js';
import type { PipelineService } from '../domain/pipeline.js';
import type { MessageService } from '../domain/messages.js';
import { type ApplicationSendResult } from '../guard/actions/application.js';
import { type GreetingSendResult } from '../guard/actions/greeting.js';
import { type InboxSyncResult } from '../guard/actions/inbox.js';
import { type ReplySendResult } from '../guard/actions/reply.js';
import { type StageProbeResult } from '../guard/actions/stage.js';
import type { Guard } from '../guard/index.js';
import type { Actor } from '../../shared/contract/enums/guard.js';
import type { EventBus } from '../http/sse.js';
import type { BrowserManager } from '../platform/browser.js';
import type { AdapterRegistry } from '../platform/registry.js';
import type { SessionService } from '../platform/session.js';
import { type SettingsPatch, type SettingsService, type SettingsSnapshot } from '../settings.js';
import type { Store } from '../store/store.js';
import type { Clock } from '../util/time.js';
import { type RuntimeFailure } from './contract.js';
/** 只用到 info/warn —— 与装配点的 logger 形状一致，但不必 import 它（避免双向引用）。 */
export interface ActionLogger {
    info(message: string): void;
    warn(message: string): void;
}
export interface ActionDeps {
    storeOf: () => Store | undefined;
    guardOf: () => Guard | undefined;
    sessionOf: () => SessionService | undefined;
    outreachOf: () => OutreachService | undefined;
    settingsOf: () => SettingsService | undefined;
    pipelineOf: () => PipelineService | undefined;
    messagesOf: () => MessageService | undefined;
    registry: AdapterRegistry;
    browser: BrowserManager;
    events: EventBus;
    clock: Clock;
    /**
     * 简历附件所在的目录（`<dataDir>/files`）。
     *
     * 只有这里需要它：把 `resume_file.id` 解析成适配器要的绝对路径。
     * 外部（HTTP / 工具）永远只给 id，路径由这一层自己拼。
     */
    filesDir: string;
    /** 给 `dataNotReady` 用：数据层为什么没起来（装配点才知道）。 */
    failureOf: () => RuntimeFailure | null;
    logger?: ActionLogger;
}
export interface RuntimeActions {
    draftGreeting(input: {
        jobId: number;
        tone?: 'formal' | 'warm' | 'concise';
        highlights?: string[];
        extra?: string;
    }): Promise<GreetingDraftDto>;
    sendGreeting(input: {
        jobId: number;
        text?: string;
        actor: Actor;
        guiConfirmed?: boolean;
        /**
         * 这次调用一共涉及几条（批量时为整批条数，单条时不传）。
         *
         * 为什么要单独一个字段：§22.4 的批量上限由 `checkBatch` 读 `payload.count`/`payload.jobIds` 判定，
         * 而批量是**逐条**调这个方法发出去的 —— 不把整批条数带进来，每条看上去都只有 1 条，
         * 上限就永远不会触发（"逐条过闸门"会变成"逐条绕过批量上限"）。
         */
        batchSize?: number;
    }): Promise<GreetingSendResult>;
    /**
     * 批量打招呼的**预览**（D3 / U1）：哪些条能发、为什么不能、将发出什么。
     *
     * 只读、无副作用；只为"能发"的项生成话术。
     */
    previewGreetingBatch(input: {
        jobIds: number[];
        actor: Actor;
    }): Promise<GreetingBatchPlanDto>;
    /** 批量打招呼：**逐条过闸门、逐条回执**（一条失败不影响其它条）。 */
    sendGreetingBatch(input: {
        items: Array<{
            jobId: number;
            text?: string;
        }>;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<GreetingBatchResultDto>;
    replyToMessage(input: {
        messageId: number;
        content: string;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<ReplySendResult>;
    syncInbox(input: {
        platformId: string;
        actor: Actor;
    }): Promise<InboxSyncResult>;
    probeContactStage(input: {
        jobId: number;
        actor: Actor;
    }): Promise<StageProbeResult>;
    sendApplication(input: {
        jobId: number;
        /**
         * 这次投递**关联**到哪一份简历附件（`resume_file.id`）；`null` / 不传 = 平台内简历。
         *
         * 为什么是 id 而不是路径：路径由宿主从库里查（见 `resolveResumeOf`），
         * 外部给路径就是一个"任意路径读文件"的洞。传了 id 而平台不收本地附件时，
         * 批量预览会把它标成 `local_resume_unsupported`（可修：改成平台内简历即可）。
         */
        resumeFileId?: number | null;
        actor: Actor;
        guiConfirmed?: boolean;
        /** 批量时带整批条数（`checkBatch` 的批量上限靠它判定，与打招呼同一格）。 */
        batchSize?: number;
    }): Promise<ApplicationSendResult>;
    /**
     * 批量投递的**预览**（L4）：哪些条能投、为什么不能、用哪份简历。
     *
     * 只读、无副作用。
     */
    previewApplicationBatch(input: {
        jobIds: number[];
        resumeFileId: number | null;
        actor: Actor;
    }): Promise<ApplicationBatchPlanDto>;
    /** 批量投递：**逐条过闸门、逐条回执**（一条失败不影响其它条；不可逆，所以回执带送达状态）。 */
    sendApplicationBatch(input: {
        jobIds: number[];
        resumeFileId: number | null;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<ApplicationBatchResultDto>;
    updateSettings(patch: SettingsPatch, actor: Actor, guiConfirmed?: boolean): Promise<SettingsSnapshot>;
}
export declare function createRuntimeActions(deps: ActionDeps): RuntimeActions;
//# sourceMappingURL=actions.d.ts.map