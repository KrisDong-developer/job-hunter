/**
 * overseas 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { CoverLetterLanguage, VisaStance } from '../enums/overseas.js'

export interface VisaRequirementDto {
  id?: number
  jobId: number
  stance: VisaStance
  identityLimit: string | null
  evidence: string[]
  source: string
  /** 不确定性说明 —— **识别不出来时必须说清楚**，不能给虚假的确定性。 */
  uncertainty: string | null
  createdAt: string
}

/**
 * 面试时间的双重显示（§4.M M3）。
 *
 * 两边都显示而不是只换算一边：只给一个数字用户无从判断对不对，
 * 两边一起给，错的时区会自己露出来。
 */
export interface TimezoneDisplayDto {
  at: string
  counterpartTz: string
  localTz: string
  counterpart: { tz: string; text: string }
  local: { tz: string; text: string }
  diffHours: number
  warning: string | null
}

export interface CoverLetterDto {
  id: number
  jobId: number | null
  resumeId: number | null
  language: CoverLetterLanguage
  content: string
  via: string
  notes: string[]
  createdAt: string
}
