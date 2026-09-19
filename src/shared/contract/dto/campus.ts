

import type { AssessmentKind, AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../enums/campus.js'

/**
 * campus 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */

// 校招与海外支线
/** 一个"不可逆 / 硬截止"节点（§4.L L1/L3/L5）。 */
export interface DeadlineDto {
  kind: 'assessment' | 'apply-close' | 'tripartite'
  refId: number
  label: string
  dueAt: string
  /** 距今多少小时（负数表示已过期）。 */
  hoursLeft: number
  /** 错过即终态 —— 校招的笔试与三方都属于这一类。 */
  irreversible: boolean
  /** 24 小时内：进 U0 与待办时必须当 urgent 处理。 */
  urgent: boolean
  overdue: boolean
}

export interface AssessmentDto {
  id: number
  campusApplicationId: number | null
  platform: string
  kind: AssessmentKind
  at: string | null
  dueAt: string | null
  durationMin: number | null
  state: AssessmentState
  result: string | null
  createdAt: string
  updatedAt: string
  /** 距截止还有多久（负数 = 已过期）；没有截止时间是 null。 */
  hoursLeft: number | null
}

export interface CampusApplicationDto {
  id: number
  companyId: number | null
  companyName: string | null
  jobId: number | null
  jobTitle: string | null
  batch: CampusBatch
  stage: CampusStage
  stageAt: string
  applyOpenAt: string | null
  applyCloseAt: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  assessments: AssessmentDto[]
}

export interface TalkSessionDto {
  id: number
  companyId: number | null
  companyName: string | null
  at: string
  place: string | null
  online: boolean
  url: string | null
  worthGoing: string | null
  note: string | null
  createdAt: string
}

export interface TripartiteDto {
  id: number
  campusApplicationId: number | null
  issuedAt: string | null
  signDeadline: string | null
  state: TripartiteState
  penaltySummary: string | null
  createdAt: string
  updatedAt: string
}

export interface CampusWindowsDto {
  items: CampusApplicationDto[]
  windows: Array<{ batch: CampusBatch; count: number; openCount: number; nextCloseAt: string | null }>
}
