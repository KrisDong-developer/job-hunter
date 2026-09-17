import type { DatabaseSync } from 'node:sqlite';
import type { ApplicationChannel, ApplicationStage, ContactStage, InterviewKind, InterviewState, MessageDirection, StageSource } from '../../../shared/enums.js';
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
    }, now: string): GreetingRecord;
    listGreetings(filter?: {
        jobId?: number;
        stage?: ContactStage;
        limit?: number;
    }): GreetingRecord[];
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
    upsertQuestionNote(input: {
        question: string;
        myAnswer?: string;
        betterAnswer?: string;
        topic?: string;
        interviewId?: number | null;
    }, now: string): QuestionNoteRecord;
    listQuestionNotes(filter?: {
        topic?: string;
        limit?: number;
    }): QuestionNoteRecord[];
}
export declare function createPipelineRepo(db: DatabaseSync): PipelineRepo;
//# sourceMappingURL=pipeline.d.ts.map