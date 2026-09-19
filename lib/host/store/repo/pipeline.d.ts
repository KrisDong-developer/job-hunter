import type { DatabaseSync } from 'node:sqlite';
import type { InterviewKind, InterviewState } from '../../../shared/contract/enums/interview.js';
import type { MessageDirection } from '../../../shared/contract/enums/message.js';
import type { ApplicationChannel, ApplicationStage, ContactStage, StageSource } from '../../../shared/contract/enums/pipeline.js';
/**
 * 跟进与看板仓储（P7，§7 / §12）。
 *
 * 四张表放在一个文件里，因为它们共享**同一个不变量**：
 * **任何状态字段的变化都必须同时追加一条 `stage_event`**。
 * 拆到四个文件里，"忘记写事件"就会变成四次机会而不是一次。
 *
 * `greeting.stage` 的语义是**最新一条即当前接触态**（§7.0），所以推进接触态是
 * "改最新那条 greeting"，而不是"给 job 加一个字段" —— 后者会与历史不一致。
 */
export interface GreetingTemplateRecord {
    id: number;
    name: string;
    body: string;
    vars: string[];
    scene: string;
    uses: number;
    replies: number;
    createdAt: string;
    updatedAt: string;
}
export interface GreetingRecord {
    id: number;
    jobId: number | null;
    platformId: string;
    templateId: number | null;
    content: string;
    sentAt: string;
    channel: ApplicationChannel;
    actor: string;
    stage: ContactStage;
    stageAt: string;
    repliedAt: string | null;
}
export interface MessageRecord {
    id: number;
    platformId: string;
    conversationId: string;
    direction: MessageDirection;
    content: string;
    at: string;
    attachmentRef: string | null;
    jobId: number | null;
    readAt: string | null;
}
export interface ApplicationRecord {
    id: number;
    jobId: number | null;
    resumeId: number | null;
    resumeFileId: number | null;
    channel: ApplicationChannel;
    sentAt: string;
    stage: ApplicationStage;
    stageAt: string;
    actor: string;
    note: string | null;
}
export interface StageEventRecord {
    id: number;
    entity: string;
    entityId: number;
    fromStage: string | null;
    toStage: string;
    at: string;
    source: StageSource;
    evidenceRef: string | null;
    note: string | null;
}
export interface InterviewRecord {
    id: number;
    applicationId: number | null;
    jobId: number | null;
    round: number;
    at: string;
    tz: string;
    place: string | null;
    link: string | null;
    contact: string | null;
    kind: InterviewKind;
    state: InterviewState;
    commuteMin: number | null;
    review: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
export interface QuestionNoteRecord {
    id: number;
    question: string;
    myAnswer: string;
    betterAnswer: string;
    topic: string;
    companyId: number | null;
    interviewId: number | null;
    times: number;
    createdAt: string;
    updatedAt: string;
}
export interface StageEventInput {
    /**
     * 状态变更的主体。
     *
     * `campus` / `assessment` / `tripartite` 是 P8 加的：校招与海外的状态机与社招主线**不同**
     * （§12.7 / §12.8），但"每次变更都要留痕"这条规则是一样的 —— 所以共用一张事件表，
     * 只把 `entity` 当区分维度。
     */
    entity: 'greeting' | 'application' | 'job' | 'interview' | 'campus' | 'assessment' | 'tripartite';
    entityId: number;
    fromStage: string | null;
    toStage: string;
    source: StageSource;
    evidenceRef?: string | null;
    note?: string | null;
}
export interface PipelineRepo {
    listTemplates(): GreetingTemplateRecord[];
    upsertTemplate(input: {
        id?: number;
        name: string;
        body: string;
        vars?: string[];
        scene?: string;
    }, now: string): GreetingTemplateRecord;
    removeTemplate(id: number): boolean;
    /** 发送成功/收到回复时累加，用于算模板回复率（§11.3）。 */
    bumpTemplate(id: number, field: 'uses' | 'replies'): void;
    createGreeting(input: {
        jobId: number | null;
        platformId: string;
        templateId?: number | null;
        content: string;
        channel?: ApplicationChannel;
        actor: string;
        /**
         * 初始接触态。缺省 `'greeted'`。
         *
         * 为什么要能传：§12.2 里「已打招呼」与「已送达」是两态，而适配器
         * **可能已经验证了送达**（`ActionResult.delivery === 'delivered'`）。
         * 全都记成 `greeted` 的后果不是少一列数据的装饰问题 ——
         * `followUpSuggestions()` 的"未读超时"分支挂在 `delivered` 上，
         * 永远到不了那一态就等于那条跟进建议永远不触发。
         */
        stage?: ContactStage;
    }, now: string): GreetingRecord;
    listGreetings(filter?: {
        jobId?: number;
        stage?: ContactStage;
        limit?: number;
    }): GreetingRecord[];
    getGreeting(id: number): GreetingRecord | undefined;
    latestGreeting(jobId: number): GreetingRecord | undefined;
    /** 推进某条 greeting 的接触态；返回是否真的变了。 */
    advanceGreeting(id: number, to: ContactStage, now: string): boolean;
    countGreetingsByStage(): Record<string, number>;
    createMessage(input: {
        platformId: string;
        conversationId?: string;
        direction: MessageDirection;
        content: string;
        at?: string;
        attachmentRef?: string | null;
        jobId?: number | null;
    }, now: string): MessageRecord;
    listMessages(filter?: {
        jobId?: number;
        unreadOnly?: boolean;
        limit?: number;
    }): MessageRecord[];
    /**
     * 按「平台 + 会话 + 方向 + 正文」找最近一条。
     *
     * 存在的唯一理由是**收件箱同步的去重**：平台会话列表只给"每个会话的最后一条消息"，
     * 反复同步会把同一条消息反复写进库（`message` 表没有唯一索引，靠 SQL 去重是唯一防线）。
     */
    findMessage(input: {
        platformId: string;
        conversationId: string;
        direction: MessageDirection;
        content: string;
    }): MessageRecord | undefined;
    /**
     * 按 id 取一条消息。
     *
     * 存在的理由：回复流程需要在**群量**消息里精确定位那一条。原先用
     * `listMessages({ limit: 500 }).find(...)`，一旦收件箱超过 500 条，老消息就"找不到"了 ——
     * 那种失败会被误报成"消息不存在"。
     */
    getMessage(id: number): MessageRecord | undefined;
    markMessageRead(id: number, now: string): boolean;
    countUnread(): number;
    createApplication(input: {
        jobId: number | null;
        resumeId?: number | null;
        resumeFileId?: number | null;
        channel?: ApplicationChannel;
        actor: string;
        note?: string | null;
        stage?: ApplicationStage;
    }, now: string): ApplicationRecord;
    listApplications(filter?: {
        jobId?: number;
        stage?: ApplicationStage;
        limit?: number;
    }): ApplicationRecord[];
    getApplication(id: number): ApplicationRecord | undefined;
    advanceApplication(id: number, to: ApplicationStage, now: string): boolean;
    countApplicationsByStage(): Record<string, number>;
    /** 看板与归因要用：投递 + 岗位标题/公司。 */
    boardRows(): Array<ApplicationRecord & {
        jobTitle: string | null;
        companyName: string | null;
    }>;
    appendStageEvent(input: StageEventInput, now: string): number;
    listStageEvents(entity: string, entityId: number, limit?: number): StageEventRecord[];
    recentStageEvents(limit: number): StageEventRecord[];
    createInterview(input: {
        applicationId?: number | null;
        jobId?: number | null;
        round?: number;
        at: string;
        tz?: string;
        place?: string | null;
        link?: string | null;
        contact?: string | null;
        kind?: InterviewKind;
        commuteMin?: number | null;
    }, now: string): InterviewRecord;
    updateInterview(id: number, patch: Partial<{
        at: string;
        state: InterviewState;
        place: string | null;
        link: string | null;
        contact: string | null;
        kind: InterviewKind;
        commuteMin: number | null;
        review: Record<string, unknown>;
        round: number;
    }>, now: string): InterviewRecord | undefined;
    getInterview(id: number): InterviewRecord | undefined;
    listInterviews(filter?: {
        from?: string;
        to?: string;
        jobId?: number;
        state?: InterviewState;
        limit?: number;
    }): InterviewRecord[];
    removeInterview(id: number): boolean;
    /**
     * 记一道题。**同一个「问题 + 主题」再记一次是累加 `times`**，不是新增一行 ——
     * G6 的价值就在"这题被问过 3 次"这个计数上（反复被问的才是必须背下来的）。
     */
    upsertQuestionNote(input: {
        question: string;
        myAnswer?: string;
        betterAnswer?: string;
        topic?: string;
        companyId?: number | null;
        interviewId?: number | null;
    }, now: string): QuestionNoteRecord;
    listQuestionNotes(filter?: {
        topic?: string;
        companyId?: number;
        limit?: number;
    }): QuestionNoteRecord[];
    getQuestionNote(id: number): QuestionNoteRecord | undefined;
    /** 改正答案 / 改主题 / 换关联公司。**不动 `times`**（那是事实，不是可编辑字段）。 */
    updateQuestionNote(id: number, patch: Partial<{
        question: string;
        myAnswer: string;
        betterAnswer: string;
        topic: string;
        companyId: number | null;
        interviewId: number | null;
    }>, now: string): QuestionNoteRecord | undefined;
    removeQuestionNote(id: number): boolean;
}
export declare function createPipelineRepo(db: DatabaseSync): PipelineRepo;
//# sourceMappingURL=pipeline.d.ts.map