/**
 * 投递流水线（§4.3 `pipeline` / §12.1 / §13 U5）。
 *
 * ## 三条硬规则
 *
 * 1. **状态变更必须留事件**：`stage` 只是便于查询的冗余，事实在 `stage_event` 里。
 *    §12.1 的转移表把"自动识别"与"人工打勾"混在一起 —— 不记 `source` 就无法解释
 *    "这个状态是谁改的"，自动识别错了也回溯不了。
 * 2. **不合并状态机**（§7.0）：投递阶段（`application.stage`）与接触态（`greeting.stage`）
 *    是两套。一个岗位可以"已收藏 + 已读未回"，合并成单一枚举就表达不了。
 * 3. **状态只能往前走，但允许人工回退**：回退要显式传 `allowBackward`，
 *    免得手滑把"已 Offer"点回"已投递"而没人知道为什么。
 */
import type { ApplicationChannel, ApplicationStage, ContactStage, StageSource } from '../../shared/contract/enums/pipeline.js';
import type { ApplicationDto, BoardDto, GreetingDto, StageEventDto } from '../../shared/contract/dto/pipeline.js';
import type { Store } from '../store/store.js';
import type { GreetingRecord } from '../store/repo/pipeline.js';
import { type Clock } from '../util/time.js';
export interface PipelineService {
    /** 记一次投递。`actor` 决定审计归属（gui / model）。 */
    recordApplication(input: {
        jobId: number;
        resumeId?: number | null;
        resumeFileId?: number | null;
        channel?: ApplicationChannel;
        actor: string;
        note?: string | null;
        /**
         * 界面上的二次确认（§4.4.2 两段式）。
         *
         * 必须一路传到 `guardRun` 里 —— 少传这一层，界面就会陷入
         * 「点了确认还是让你确认」的死循环（实测就是这么被测试抓到的）。
         * 模型**不能**传这个字段：guard 会拒绝非界面来源的自封确认。
         */
        guiConfirmed?: boolean;
    }): Promise<ApplicationDto>;
    /**
     * 投递**已成功发出之后**记一笔（守卫动作的回调，**不走闸门** —— 外层已在令牌上下文里）。
     *
     * 与 `recordApplication` 的分工：后者是"用户说我把简历投了，记一笔"（走闸门、要求有简历版本）；
     * 这一条是"适配器真的把简历发出去了，落库"（不重复过闸门，平台简历可能没有本地对应版本）。
     */
    recordApplicationSent(input: {
        jobId: number;
        resumeId?: number | null;
        resumeFileId?: number | null;
        channel?: ApplicationChannel;
        actor: string;
        note?: string | null;
    }): ApplicationDto;
    advance(input: {
        applicationId: number;
        to: ApplicationStage;
        actor: string;
        source?: StageSource;
        evidenceRef?: string | null;
        note?: string | null;
        allowBackward?: boolean;
    }): ApplicationDto;
    list(filter?: {
        jobId?: number;
        stage?: ApplicationStage;
        limit?: number;
    }): ApplicationDto[];
    get(id: number): ApplicationDto;
    /** U5 看板：按阶段分组，附带岗位/公司名。 */
    board(): BoardDto;
    /** 某个岗位的全部状态事件（详情页用来回答"凭什么"）。 */
    history(jobId: number): StageEventDto[];
    /** 供 guard 的发送动作在**成功之后**调用。 */
    recordGreetingSent(input: {
        jobId: number;
        platformId: string;
        content: string;
        actor: string;
        templateId?: number | null;
        channel?: ApplicationChannel;
        /**
         * 初始接触态。缺省 `'greeted'`。
         *
         * 平台侧**已验证送达**时传 `'delivered'` —— 那不是装饰：§3.3 的
         * "未读超时"建议挂在 `delivered` 上，全记成 `greeted` 会让那条建议永不触发。
         * 没验证出来就停在 `greeted`，**不猜**。
         */
        stage?: ContactStage;
    }): GreetingRecord;
    advanceContact(input: {
        jobId: number;
        to: ContactStage;
        source?: StageSource;
        evidenceRef?: string | null;
        /** 为什么要改（会进状态事件，回看时能读懂）。 */
        note?: string | null;
    }): GreetingRecord;
    contactStage(jobId: number): ContactStage;
    /**
     * 打招呼记录列表（D6：说了什么、投了哪版、几点发的都要能查）。
     *
     * 带上岗位/公司/模板名：话术效果对比（D2）与"我给谁发过"这两件事
     * 只靠 id 是读不出来的，而让界面为每行再拉一次详情是 N+1 次往返。
     */
    listGreetings(filter?: {
        jobId?: number;
        stage?: ContactStage;
        limit?: number;
    }): GreetingDto[];
    /** 未读超时 / 已读未回超时的**建议**（§12.2 的两条分支，§3.3 的核心洞察）。 */
    followUpSuggestions(): FollowUpSuggestion[];
    /**
     * 处置一条跟进建议（§12.2 收口）。
     *
     * 建议是**推导**出来的（没有持久化行），所以"解决"= 记住 `jobId:kind` 已被用户看过/处理过，
     * `followUpSuggestions` 不再重复返回同一条，直到它下次重新达标。
     */
    resolveFollowUp(jobId: number, kind: string): void;
}
/**
 * 跟进建议。
 *
 * 注意它是**建议**而不是状态：超时是由时间推导出来的，把它写成状态会让状态机被时间污染
 * （一旦写成 `read_timeout`，用户回了消息之后这个状态还得再改回去）。
 */
export interface FollowUpSuggestion {
    jobId: number;
    jobTitle: string | null;
    companyName: string | null;
    stage: ContactStage;
    /** 距今多少小时没动静。 */
    idleHours: number;
    kind: 'unread-timeout' | 'read-no-reply' | 'no-progress';
    message: string;
    advice: string;
}
/** 未读超时阈值（小时）——超过就建议放弃（§3.3）。 */
export declare const UNREAD_TIMEOUT_HOURS = 72;
/** 已读未回超时阈值（小时）——超过就建议改简历/话术，而不是继续加量（§3.3 / §3.2）。 */
export declare const READ_TIMEOUT_HOURS: number;
/** 投递后完全没进展的阈值（天）现在也在 shared/contract/enums/pipeline.ts（客户端要用来判断"该催了"）。 */
export interface PipelineDeps {
    store: Store;
    clock?: Clock;
    /** 投递走闸门（高危）。由装配点注入，避免领域层 import guard。 */
    guardRun?: <T>(input: {
        action: string;
        actor: string;
        danger: 'low' | 'mid' | 'high';
        target?: {
            jobId?: number;
            platformId?: string;
            companyId?: number;
        };
        payload?: Record<string, unknown>;
        guiConfirmed?: boolean;
    }, fn: () => Promise<T>) => Promise<T>;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export declare function createPipelineService(deps: PipelineDeps): PipelineService;
//# sourceMappingURL=pipeline.d.ts.map