/**
 * interview 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** 面试状态（§12.6）。 */
export const INTERVIEW_STATES = ['pending', 'confirmed', 'done', 'reviewed', 'cancelled', 'rescheduled'] as const

export type InterviewState = (typeof INTERVIEW_STATES)[number]

export const INTERVIEW_STATE_LABEL: Record<InterviewState, string> = {
  pending: '待确认',
  confirmed: '已确认',
  done: '已完成',
  reviewed: '已复盘',
  cancelled: '已取消',
  rescheduled: '已改期',
}

/** 面试形式 —— 决定要不要算通勤（§13 U7「别撞车别迟到」）。 */
export const INTERVIEW_KINDS = ['onsite', 'video', 'phone', 'other'] as const

export type InterviewKind = (typeof INTERVIEW_KINDS)[number]

export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  onsite: '现场',
  video: '视频',
  phone: '电话',
  other: '其它',
}
