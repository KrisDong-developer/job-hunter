/**
 * 七个**编排**：闸门 + 一次性令牌 + 副作用回写 + 事件广播。
 *
 * ## 它们为什么不是领域层
 *
 * 这些方法本身**不实现业务**：真正干活的在 `guard/actions/*`（发送/投递/回复/同步）
 * 与领域服务（话术草稿、接触态、设置）。它们做的是把那几件事**按对的顺序接起来**，
 * 而顺序正是危险所在 —— 比如"本地那条 `direction='me'` 必须等**发送成功之后**才写"
 * （早一步写，看板与接触态从第一天开始就说谎）。
 *
 * 所以这是一层编排，不是一层实现；抽出它的收益是让装配点只剩接线，
 * 而这一层能被一屏读完（一屏读不完的顺序约束，等于没有约束）。
 *
 * ## 依赖为什么全是 `xxxOf: () => ...`
 *
 * 数据层是异步就绪的（§4.9）：这些服务在装配点上都是**可变的槽**
 * （数据层没起来时是 undefined）。传取值函数而不是快照，
 * 保证"调用那一刻"拿到的是当前那一个 —— 与 `gate.ts` 的 `storeOf` 同一个理由。
 */
import type { GreetingDraftDto } from '../../shared/dto.js';
import type { OutreachService } from '../domain/outreach.js';
import type { PipelineService } from '../domain/pipeline.js';
import type { MessageService } from '../domain/messages.js';
import { type ApplicationSendResult } from '../guard/actions/application.js';
import { type GreetingSendResult } from '../guard/actions/greeting.js';
import { type InboxSyncResult } from '../guard/actions/inbox.js';
import { type ReplySendResult } from '../guard/actions/reply.js';
import { type StageProbeResult } from '../guard/actions/stage.js';
import type { Guard } from '../guard/index.js';
import type { Actor } from '../guard/types.js';
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
    }): Promise<GreetingSendResult>;
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
        filePath?: string | null;
        actor: Actor;
        guiConfirmed?: boolean;
    }): Promise<ApplicationSendResult>;
    updateSettings(patch: SettingsPatch, actor: Actor, guiConfirmed?: boolean): Promise<SettingsSnapshot>;
}
export declare function createRuntimeActions(deps: ActionDeps): RuntimeActions;
//# sourceMappingURL=actions.d.ts.map