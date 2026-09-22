import type { ApplicationBatchBlockerDto, ApplicationBatchPlanDto, ApplicationBatchResultDto } from '../../shared/contract/dto/batch.js';
import type { ApplicationSendResult } from '../guard/actions/application.js';
import type { GuardPreview } from '../guard/index.js';
import type { Actor } from '../../shared/contract/enums/guard.js';
import type { GuardInput } from '../guard/types.js';
import type { Store } from '../store/store.js';
import type { Clock } from '../util/time.js';
import { type QuotaReadout } from './batch.js';
export interface ApplicationBatchDeps {
    store: Store;
    /**
     * **单条投递**（含闸门、审批、记账）—— 就是 runtime 的 `sendApplication`。
     *
     * 收的是一个**附件 id**，不是路径：解析成路径只能由宿主自己做
     * （见 `runtime/actions.ts` 的 `resolveResumeOf`）。
     */
    sendOne(input: {
        jobId: number;
        resumeFileId?: number | null;
        actor: Actor;
        guiConfirmed?: boolean;
        /** 整批条数，透传给闸门（§22.4 的批量上限靠它判定）。 */
        batchSize?: number;
    }): Promise<ApplicationSendResult>;
    /** 闸门**预检**：只读、不写审计。 */
    previewGuard(input: GuardInput): GuardPreview;
    /** 平台能力 + 登录态预检（`sendResume` 实现了没有、登录还在不在）。返回 null = 可以做。 */
    platformBlocker(platformId: string): ApplicationBatchBlockerDto | null;
    /**
     * 这个平台**收不收本地附件**（平台事实 `resumeSource`）。
     *
     * `false` = 只吃平台内简历 ⇒ 指定的文件**不会**上传，这一格会如实写进预览与审批文案。
     * 注意这**不是**拦截条件：平台只吃自己那份并不妨碍这次投递成功，
     * 所以它只影响"这份文件到底传没传"的说法，不影响能不能投。
     */
    acceptsLocalResume(platformId: string): boolean;
    /** 整批共用那份简历的可读标签（简历名 + 附件名）。找不到时返回 `null`。 */
    resumeLabelOf(resumeFileId: number): string | null;
    /** 平台自己还会做的额外动作（如智联投递会顺带替你发一句招呼语）。 */
    sideEffectOf(platformId: string): string | null;
    /** 同一家公司的冷却期（分钟）。`0` = 不限制 —— 那就不做批内去重。 */
    cooldownMinutes(): number;
    /** 今天的额度余量（按平台，`application.send` 那一行）。 */
    remainingToday(platformId: string): QuotaReadout | null;
    clock: Clock;
    /** 注入是为了测试不真的等 3–9 秒。 */
    sleep(ms: number): Promise<void>;
    /** `[0,1)` 随机数；注入以便测试固定间隔。 */
    random(): number;
}
/**
 * "这个岗位的**另一个平台副本**已经投过了" —— 只提醒，不拦。
 *
 * 判定链：岗位在某个去重分组里 → 组内其它成员 → 它们有没有投递记录。
 * 分组是启发式的（可能判错），所以**绝不能**拿它拦下一次投递；但"同一家公司的两个
 * 平台副本各投一次"正是跨平台去重想帮用户避免的重复劳动 —— 必须让人看见。
 *
 * 提醒里带上**是哪一条、哪个平台**：只说"你已经投过了"用户没法核对，
 * 而这条判断本身是有可能错的。
 */
export declare function appliedSiblingWarning(store: Store, jobId: number): string | null;
export interface ApplicationBatchPreviewInput {
    /** 要投的岗位，**顺序即投递顺序**。 */
    jobIds: number[];
    /** 整批共用那份简历（`resume_file.id`）；`null` = 平台内简历。 */
    resumeFileId: number | null;
    /** 谁在看这份预览（模型有批量上限与更严的审批要求，界面自行分批）。 */
    actor: Actor;
}
/** 预览：**只读、无副作用**。反复调用结果一致（鉴权/额度读数可能随时间变）。 */
export declare function previewApplicationBatch(deps: ApplicationBatchDeps, input: ApplicationBatchPreviewInput): Promise<ApplicationBatchPlanDto>;
export interface ApplicationBatchSendInput {
    /** 要投的岗位，**顺序即投递顺序**。 */
    jobIds: number[];
    /** 整批共用那份简历（`resume_file.id`）；`null` = 平台内简历。 */
    resumeFileId: number | null;
    actor: Actor;
    guiConfirmed?: boolean;
}
/**
 * 逐条投递。
 *
 * 每条都：`sendOne`（= 过闸门 + 审批 + 适配器投递 + 成功后记账）→ 成功/失败各记一条回执。
 * 条与条之间插入**随机间隔**（D3 的"随机间隔"；由宿主保证，界面与模型都绕不过）。
 */
export declare function sendApplicationBatch(deps: ApplicationBatchDeps, input: ApplicationBatchSendInput): Promise<ApplicationBatchResultDto>;
//# sourceMappingURL=application-batch.d.ts.map