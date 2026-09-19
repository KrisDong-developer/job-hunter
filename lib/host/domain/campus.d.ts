/**
 * 校招支线（§4.L / §12.7）。
 *
 * 校招与社招主线最大的差别是**两个不可逆节点**：
 *   * **笔试/测评有硬截止，错过即终态**；
 *   * **三方协议签署前后必须显著区分**（违约有真实代价）。
 *
 * 所以这个服务的核心不是 CRUD，而是 `deadlines()` 与 `overdue()`：
 * 把"再不做就来不及了"这件事单独挑出来。它们会被 U0 与待办系统当 **urgent** 处理，
 * 而不是普通通知 —— 这类错误没有第二次机会（决策记录第 3 条）。
 */
import type { AssessmentKind, AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../../shared/enums.js';
import type { CampusApplicationDto, AssessmentDto, DeadlineDto, TalkSessionDto, TripartiteDto } from '../../shared/dto.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
/** 距截止多久开始算"紧急"。24 小时以内的硬截止才是 urgent —— 再早会变成狼来了。 */
export declare const URGENT_WITHIN_HOURS = 24;
/** 距截止多久开始进入"要提醒"的范围。 */
export declare const WARN_WITHIN_HOURS = 72;
export interface CampusService {
    create(input: {
        companyId?: number | null;
        /** 界面只给用户一个「公司名」输入框（他手里没有 company id），这里按归一化键幂等登记。 */
        companyName?: string | null;
        jobId?: number | null;
        batch?: CampusBatch;
        applyOpenAt?: string | null;
        applyCloseAt?: string | null;
        note?: string | null;
    }): CampusApplicationDto;
    advance(id: number, stage: CampusStage, options?: {
        allowBackward?: boolean;
        note?: string | null;
    }): CampusApplicationDto;
    get(id: number): CampusApplicationDto;
    list(filter?: {
        batch?: CampusBatch;
        stage?: CampusStage;
        companyId?: number;
        limit?: number;
    }): CampusApplicationDto[];
    /** 秋招/春招的时间窗概览 —— 校招是季节性的事，得先看到窗口。 */
    windows(): Array<{
        batch: CampusBatch;
        count: number;
        openCount: number;
        nextCloseAt: string | null;
    }>;
    addAssessment(input: {
        campusApplicationId?: number | null;
        platform?: string;
        kind?: AssessmentKind;
        at?: string | null;
        dueAt?: string | null;
        durationMin?: number | null;
    }): AssessmentDto;
    setAssessmentState(id: number, state: AssessmentState, result?: string | null): AssessmentDto;
    listAssessments(filter?: {
        campusApplicationId?: number;
        state?: AssessmentState;
    }): AssessmentDto[];
    addTalkSession(input: {
        companyId?: number | null;
        at: string;
        place?: string | null;
        online?: boolean;
        url?: string | null;
        worthGoing?: string | null;
        note?: string | null;
    }): TalkSessionDto;
    listTalkSessions(): TalkSessionDto[];
    addTripartite(input: {
        campusApplicationId?: number | null;
        issuedAt?: string | null;
        signDeadline?: string | null;
        penaltySummary?: string | null;
    }): TripartiteDto;
    setTripartiteState(id: number, state: TripartiteState): TripartiteDto;
    listTripartite(): TripartiteDto[];
    /** 所有硬截止，按到期时间升序（**这是这个服务最重要的方法**）。 */
    deadlines(): DeadlineDto[];
    /** 已经错过的硬截止 —— 不可逆的事必须显式认账，不能默默消失。 */
    overdue(): DeadlineDto[];
}
export interface CampusDeps {
    store: Store;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export declare function createCampusService(deps: CampusDeps): CampusService;
//# sourceMappingURL=campus.d.ts.map