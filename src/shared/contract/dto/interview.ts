/**
 * interview 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { InterviewKind, InterviewState } from '../enums/interview.js'

/**
 * 从 HR 消息里抽出的面试安排建议（消息中心的「一键进日程」）。
 *
 * **只识别、不写库**：这条只是"HR 可能约了这些"的建议，用户确认后才真正创建面试。
 * 识别不到某个维度就给 null —— 给假的比给空的更糟。
 */
export interface InterviewSuggestionDto {
  messageId: number
  /** 能从消息关联到岗位就给；没有则 null（面试仍可无岗位创建）。 */
  jobId: number | null
  /** 识别出的面试时间（ISO）；识别不到为 null。 */
  at: string | null
  kind: InterviewKind | null
  place: string | null
  link: string | null
  /** llm = 模型识别；fallback = 规则降级。 */
  via: 'llm' | 'fallback'
  /** 降级/脱敏等说明，界面如实展示。 */
  notes: string[]
}

/** 一场面试（§11.3 `Interview` / §12.6 状态）。 */
export interface InterviewDto {
  id: number
  applicationId: number | null
  jobId: number | null
  jobTitle: string | null
  companyName: string | null
  round: number
  at: string
  tz: string
  place: string | null
  link: string | null
  contact: string | null
  kind: InterviewKind
  state: InterviewState
  commuteMin: number | null
  review: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** 与其它面试撞车（同一时间窗内）。 */
  conflicts: number[]
  /** 距现在还有多久（小时，负数表示已过）。 */
  hoursUntil: number
}

/** `GET /interviews/conflicts`。 */
export interface InterviewConflictDto {
  a: number
  b: number
  atA: string
  atB: string
  /** 重叠分钟数。 */
  overlapMin: number
  reason: string
}

/** 面试准备包（`interview_prep` 工具与 U7 用）。 */
export interface InterviewPrepDto {
  interviewId: number
  jobId: number | null
  jobTitle: string | null
  companyName: string | null
  /** 岗位要求里的技能 vs 简历里有的技能 —— 差距一目了然。 */
  matchedSkills: string[]
  missingSkills: string[]
  /** 公司画像里的风险标注（外包/诈骗/僵尸）。 */
  companyFlags: string[]
  /** 之前记过的错题，按出现次数排（含答案：面试前要能直接看到"上次怎么答的"）。 */
  questionNotes: Array<{
    id: number
    question: string
    times: number
    topic: string
    myAnswer: string
    betterAnswer: string
  }>
  /** 通勤提示（仅现场面试才有意义）。 */
  commute: { kind: InterviewKind; minutes: number | null; advice: string }
  checklist: string[]
  notes: string[]
}

/**
 * 面试错题本的一条（G6）。
 *
 * `times` 是**同一个问题被问过的次数**：写入口按「问题 + 主题」去重累加，
 * 所以"这题被问过 3 次"是自动攒出来的，不需要用户自己数。
 */
export interface QuestionNoteDto {
  id: number
  question: string
  /** 我当时怎么答的（越具体越有用：卡在哪一句）。 */
  myAnswer: string
  /** 复盘后认为更好的答法。 */
  betterAnswer: string
  /** 主题/技术点，用于按话题归档与筛选。 */
  topic: string
  companyId: number | null
  interviewId: number | null
  times: number
  createdAt: string
  updatedAt: string
}
