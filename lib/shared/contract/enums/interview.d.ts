/**
 * interview 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** 面试状态（§12.6）。 */
export declare const INTERVIEW_STATES: readonly ["pending", "confirmed", "done", "reviewed", "cancelled", "rescheduled"];
export type InterviewState = (typeof INTERVIEW_STATES)[number];
export declare const INTERVIEW_STATE_LABEL: Record<InterviewState, string>;
/** 面试形式 —— 决定要不要算通勤（§13 U7「别撞车别迟到」）。 */
export declare const INTERVIEW_KINDS: readonly ["onsite", "video", "phone", "other"];
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];
export declare const INTERVIEW_KIND_LABEL: Record<InterviewKind, string>;
//# sourceMappingURL=interview.d.ts.map