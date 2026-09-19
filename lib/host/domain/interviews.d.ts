/**
 * 面试日程（§4.3 `interviews` / §12.6 / §13 U7）。
 *
 * U7 的目的写得很直白：**别撞车别迟到**。所以这个服务的三件正事就是：
 *   1. `conflicts()` —— 时间窗重叠要显式列出来，而不是靠用户自己比对；
 *   2. 通勤 —— 现场面试才算通勤，视频/电话不算（算了只会制造假警告）；
 *   3. `prep()` —— 准备包：**技能差距 + 公司风险 + 之前的错题 + 检查清单**。
 *
 * 状态机（§12.6）：`待确认 → 已确认 → 已完成 → 已复盘`，任意 → `已取消 / 已改期`。
 * 这条链是**单向**的：改期要显式传 `allowReschedule`，否则就是把别人的日程当草稿。
 */
import type { InterviewKind, InterviewState, StageSource } from '../../shared/enums.js';
import type { InterviewConflictDto, InterviewDto, InterviewPrepDto, QuestionNoteDto } from '../../shared/dto.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
/** 撞车判定的时间窗：两场面试在这段时间内即算冲突（含前后缓冲）。 */
export declare const CONFLICT_WINDOW_MIN = 60;
/** 面试默认时长（分钟）—— 没有明确时长时的保守估计。 */
export declare const DEFAULT_DURATION_MIN = 60;
export interface InterviewService {
    upsert(input: {
        id?: number;
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
        state?: InterviewState;
        /** 谁发起的（写进状态事件的来源）。 */
        actor?: string;
    }): InterviewDto;
    list(filter?: {
        from?: string;
        to?: string;
        jobId?: number;
        state?: InterviewState;
        limit?: number;
    }): InterviewDto[];
    get(id: number): InterviewDto;
    setState(id: number, state: InterviewState, options?: {
        allowReschedule?: boolean;
        source?: StageSource;
    }): InterviewDto;
    review(id: number, review: Record<string, unknown>): InterviewDto;
    remove(id: number): boolean;
    conflicts(): InterviewConflictDto[];
    prep(id: number): InterviewPrepDto;
    /** U0 今日要用：接下来 N 天内即将到来的面试。 */
    upcoming(withinHours?: number): InterviewDto[];
    /**
     * 记一道面试题。**同一个「问题 + 主题」再记一次是累加 `times`** ——
     * "这题被问过 3 次"是自动攒出来的，所以要能重复调用同一个入口。
     *
     * 挂在一场面试下（`POST /interviews/:id/questions`）：这样公司维度能自动补上
     * （从面试关联的岗位推），而"哪家问过什么"正是错题本的第二个用法。
     */
    addQuestion(interviewId: number, input: {
        question: string;
        myAnswer?: string;
        betterAnswer?: string;
        topic?: string;
    }): QuestionNoteDto;
    listQuestions(filter?: {
        topic?: string;
        companyId?: number;
        limit?: number;
    }): QuestionNoteDto[];
    updateQuestion(id: number, patch: Partial<{
        question: string;
        myAnswer: string;
        betterAnswer: string;
        topic: string;
    }>): QuestionNoteDto;
    removeQuestion(id: number): boolean;
}
export interface InterviewDeps {
    store: Store;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export declare function createInterviewService(deps: InterviewDeps): InterviewService;
//# sourceMappingURL=interviews.d.ts.map