import type { DatabaseSync } from 'node:sqlite';
import type { AssessmentKind, AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../../../shared/contract/enums/campus.js';
import type { CoverLetterLanguage, RemoteKind, VisaStance } from '../../../shared/contract/enums/overseas.js';
/**
 * 校招与海外支线仓储（P8，§4.L / §4.M / §11.5）。
 *
 * 放在一个文件里，因为这两条支线共享同一个设计约束：
 * **不可逆节点必须显眼**。校招的笔试截止与三方签署、海外的时区换算，
 * 都是"错一次就没有第二次"的地方 —— 所以读取接口里专门有
 * `deadlines()`，把这类节点单独挑出来给强提醒用，而不是混在普通列表里。
 */
export interface CampusApplicationRecord {
    id: number;
    companyId: number | null;
    jobId: number | null;
    batch: CampusBatch;
    stage: CampusStage;
    stageAt: string;
    applyOpenAt: string | null;
    applyCloseAt: string | null;
    note: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface AssessmentRecord {
    id: number;
    campusApplicationId: number | null;
    platform: string;
    kind: AssessmentKind;
    at: string | null;
    dueAt: string | null;
    durationMin: number | null;
    state: AssessmentState;
    result: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface TalkSessionRecord {
    id: number;
    companyId: number | null;
    at: string;
    place: string | null;
    online: boolean;
    url: string | null;
    worthGoing: string | null;
    note: string | null;
    createdAt: string;
}
export interface TripartiteRecord {
    id: number;
    campusApplicationId: number | null;
    issuedAt: string | null;
    signDeadline: string | null;
    state: TripartiteState;
    penaltySummary: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface VisaRequirementRecord {
    id: number;
    jobId: number;
    stance: VisaStance;
    identityLimit: string | null;
    evidence: string[];
    source: string;
    uncertainty: string | null;
    createdAt: string;
}
export interface CoverLetterRecord {
    id: number;
    jobId: number | null;
    resumeId: number | null;
    language: CoverLetterLanguage;
    content: string;
    via: string;
    notes: string[];
    createdAt: string;
}
/** 一个"不可逆/硬截止"节点。U0 与待办系统只认这一种。 */
export interface BranchDeadline {
    kind: 'assessment' | 'apply-close' | 'tripartite';
    refId: number;
    label: string;
    dueAt: string;
    /** 距今多少小时（负数表示已过期）。 */
    hoursLeft: number;
    irreversible: boolean;
}
export interface BranchRepo {
    createCampusApplication(input: {
        companyId?: number | null;
        jobId?: number | null;
        batch?: CampusBatch;
        applyOpenAt?: string | null;
        applyCloseAt?: string | null;
        note?: string | null;
    }, now: string): CampusApplicationRecord;
    updateCampusApplication(id: number, patch: Partial<{
        stage: CampusStage;
        batch: CampusBatch;
        applyOpenAt: string | null;
        applyCloseAt: string | null;
        note: string | null;
    }>, now: string): CampusApplicationRecord | undefined;
    getCampusApplication(id: number): CampusApplicationRecord | undefined;
    listCampusApplications(filter?: {
        batch?: CampusBatch;
        stage?: CampusStage;
        companyId?: number;
        limit?: number;
    }): CampusApplicationRecord[];
    createAssessment(input: {
        campusApplicationId?: number | null;
        platform?: string;
        kind?: AssessmentKind;
        at?: string | null;
        dueAt?: string | null;
        durationMin?: number | null;
    }, now: string): AssessmentRecord;
    updateAssessment(id: number, patch: Partial<{
        state: AssessmentState;
        result: string | null;
        dueAt: string | null;
        at: string | null;
    }>, now: string): AssessmentRecord | undefined;
    getAssessment(id: number): AssessmentRecord | undefined;
    listAssessments(filter?: {
        campusApplicationId?: number;
        state?: AssessmentState;
        limit?: number;
    }): AssessmentRecord[];
    createTalkSession(input: {
        companyId?: number | null;
        at: string;
        place?: string | null;
        online?: boolean;
        url?: string | null;
        worthGoing?: string | null;
        note?: string | null;
    }, now: string): TalkSessionRecord;
    listTalkSessions(limit?: number): TalkSessionRecord[];
    createTripartite(input: {
        campusApplicationId?: number | null;
        issuedAt?: string | null;
        signDeadline?: string | null;
        penaltySummary?: string | null;
    }, now: string): TripartiteRecord;
    updateTripartite(id: number, patch: Partial<{
        state: TripartiteState;
        signDeadline: string | null;
        penaltySummary: string | null;
    }>, now: string): TripartiteRecord | undefined;
    listTripartite(filter?: {
        state?: TripartiteState;
        limit?: number;
    }): TripartiteRecord[];
    upsertVisaRequirement(input: {
        jobId: number;
        stance: VisaStance;
        identityLimit?: string | null;
        evidence?: string[];
        source?: string;
        uncertainty?: string | null;
    }, now: string): VisaRequirementRecord;
    getVisaRequirement(jobId: number): VisaRequirementRecord | undefined;
    listVisaRequirements(filter?: {
        stance?: VisaStance;
        limit?: number;
    }): VisaRequirementRecord[];
    createCoverLetter(input: {
        jobId: number;
        resumeId?: number | null;
        language?: CoverLetterLanguage;
        content: string;
        via?: string;
        notes?: string[];
    }, now: string): CoverLetterRecord;
    listCoverLetters(filter?: {
        jobId?: number;
        limit?: number;
    }): CoverLetterRecord[];
    getCoverLetter(id: number): CoverLetterRecord | undefined;
    setJobBranches(jobId: number, patch: {
        campusBatch?: CampusBatch | null;
        remoteKind?: RemoteKind | null;
        visaStance?: VisaStance | null;
    }): void;
    /**
     * 所有"不可逆/硬截止"节点，按到期时间升序。
     *
     * 单独一个方法而不是让调用方自己拼：漏掉一类节点就等于漏掉一次"错过即出局"，
     * 而"拼查询"最容易漏。
     */
    deadlines(now: string): BranchDeadline[];
}
export declare function createBranchRepo(db: DatabaseSync): BranchRepo;
//# sourceMappingURL=campus.d.ts.map