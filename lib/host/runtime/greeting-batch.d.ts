import type { GreetingBatchBlockerDto, GreetingBatchPlanDto, GreetingBatchResultDto } from '../../shared/contract/dto/batch.js';
import type { GreetingDraftDto } from '../../shared/contract/dto/pipeline.js';
import type { GreetingSendResult } from '../guard/actions/greeting.js';
import type { GuardPreview } from '../guard/index.js';
import type { Actor } from '../../shared/contract/enums/guard.js';
import type { GuardInput } from '../guard/types.js';
import type { Store } from '../store/store.js';
import type { Clock } from '../util/time.js';
import { type QuotaReadout } from './batch.js';
export interface GreetingBatchDeps {
    store: Store;
    /** 生成话术（低危，不发送）。 */
    draft(input: {
        jobId: number;
    }): Promise<GreetingDraftDto>;
    /** **单条发送**（含闸门、审批、记账）—— 就是 runtime 的 `sendGreeting`。 */
    sendOne(input: {
        jobId: number;
        text?: string;
        actor: Actor;
        guiConfirmed?: boolean;
        /** 整批条数，透传给闸门（§22.4 的批量上限靠它判定，见 `actions.ts`）。 */
        batchSize?: number;
    }): Promise<GreetingSendResult>;
    /** 闸门**预检**：只读、不写审计。 */
    previewGuard(input: GuardInput): GuardPreview;
    /** 平台能力 + 登录态预检（由 registry / session 提供）。返回 null = 可以做。 */
    canSend(platformId: string): GreetingBatchBlockerDto | null;
    /** 平台自己会额外做的事（BOSS 点「立即沟通」会先替你发一句默认招呼语）。 */
    sideEffectOf(platformId: string): string | null;
    /** 同一家公司的冷却期（分钟）。`0` = 不限制 —— 那就不做批内去重。 */
    cooldownMinutes(): number;
    /** 今天的额度余量（按平台，`greeting.send` 那一行）。 */
    remainingToday(platformId: string): QuotaReadout | null;
    clock: Clock;
    /** 注入是为了测试不真的等 3–9 秒。 */
    sleep(ms: number): Promise<void>;
    /** `[0,1)` 随机数；注入以便测试固定间隔。 */
    random(): number;
}
export interface GreetingBatchPreviewInput {
    jobIds: number[];
    /**
     * 谁在看这份预览。
     *
     * 闸门预检要区分发起者：模型有**批量上限**（§22.4）与更严的审批要求，
     * 而界面按 `BATCH_MAX_ITEMS` 自行分批。传错了会让预览与实际判定不一致。
     */
    actor: Actor;
}
/** 预览：**只读、无副作用**。同一时刻反复调用结果一致（模型生成的话术可能不同）。 */
export declare function previewGreetingBatch(deps: GreetingBatchDeps, input: GreetingBatchPreviewInput): Promise<GreetingBatchPlanDto>;
export interface GreetingBatchSendInput {
    /**
     * 要发的条目，**顺序即发送顺序**。
     *
     * `text` 缺省时由服务端在发送那一刻生成 —— 但界面应当把预览里**用户看过（或改过）的那段**
     * 传回来：不传的话，用户确认的与他实际发出的可能不是同一段文字（模型每次生成都不一样）。
     */
    items: Array<{
        jobId: number;
        text?: string;
    }>;
    actor: Actor;
    guiConfirmed?: boolean;
}
/**
 * 逐条发送。
 *
 * 每条都：`sendOne`（= 过闸门 + 审批 + 记账）→ 成功/失败各记一条回执。
 * 条与条之间插入**随机间隔**（D3 的"随机间隔"；由宿主保证，界面与模型都绕不过）。
 */
export declare function sendGreetingBatch(deps: GreetingBatchDeps, input: GreetingBatchSendInput): Promise<GreetingBatchResultDto>;
//# sourceMappingURL=greeting-batch.d.ts.map