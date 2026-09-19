

import type { ResumeLanguage, ResumeState } from '../enums/resume.js'
import type { ResumeContent, ResumeIssue } from '../../domain/resume-content.js'

/**
 * 简历域的对外 DTO（值对象与规则见 domain/resume-content.ts）。
 *
 * 边界铁律：**只允许标量 JSON**，禁止活对象穿越这一层（§4.3 字段级铁律 P7）。
 */

/**
 * 简历版本 A/B 对比的一格（F3）。
 *
 * **每格都带样本量**：这是这张表唯一能防住"用 2 条样本画出显著性"的做法。
 */
export interface ResumeCompareCellDto {
  /** 阶段键（已投递 / 已查看 / 面试中 / …）。 */
  stage: string
  label: string
  count: number
  /** count / 该行的总数；分母为 0 时为 null。 */
  rate: number | null
  /** 这一格是否薄到不该被解读（< `MIN_SAMPLE`）。 */
  thin: boolean
}

export interface ResumeCompareRowDto {
  resumeId: number | null
  /** 简历版本名；`null` 表示"没记简历版本的投递"。 */
  label: string
  total: number
  cells: ResumeCompareCellDto[]
  /** 该行样本是否足够做对比（`MIN_SAMPLE`）。 */
  enoughSample: boolean
}

export interface ResumeCompareDto {
  rows: ResumeCompareRowDto[]
  stages: Array<{ stage: string; label: string }>
  sampleSize: number
  /** 是否够谈"显著性"。不够时界面必须显式说"别看显著性"。 */
  enoughSample: boolean
  note: string
}

/**
 * 简历 A/B 对比的**诚实性**说明（F3）。
 *
 * 与 `ResumeCompareDto` 同住：它是这张表的固定口径，界面与工具文案必须共用同一句话 ——
 * "样本不够就别看显著性"这条规矩只能有一份。
 */
export const RESUME_COMPARE_CAVEAT =
  '这张表只做**对比**，不做显著性检验：这是本地小样本，任何"某版简历更有效"的说法都可能是噪音。' +
  '每一格都标了样本量，样本不足的格子会被显式标出来 —— 那时请看数字，别下结论。'

export interface ResumeFileDto {
  id: number
  format: string
  fileName: string
  bytes: number
  createdAt: string
}

export interface ResumeDto {
  id: number
  /** 方向 / 版本名，如「Java 后端 · 2026 春」。 */
  name: string
  direction: string
  language: ResumeLanguage
  state: ResumeState
  /** 是否是当前启用的版本（同方向只应有一个）。 */
  isDefault: boolean
  content: ResumeContent
  /** 该版本的版本号；匹配分据此判断是否失效（§4.1）。 */
  rev: number
  createdAt: string
  updatedAt: string
  files: ResumeFileDto[]
  /** 未采用的定制数量，界面上给个角标。 */
  tailoringCount: number
}

/** 列表用的轻量形状：不把整份简历塞进列表（§22.5 同样的理由）。 */
export interface ResumeSummaryDto {
  id: number
  name: string
  direction: string
  language: ResumeLanguage
  state: ResumeState
  isDefault: boolean
  rev: number
  updatedAt: string
  /**
   * 这一版导出的附件（**不含磁盘路径**，见 `ResumeFileDto`）。
   *
   * 为什么要带在列表里：投递时要选"用哪份简历"，而那个选择落在**附件**上
   * （`resume_file.id`）—— 列表里不带 id，选简历这件事就只能靠"每版再请求一次"拼出来。
   * 本身是几个标量，不违反"列表不带正文"的那条纪律。
   */
  files: ResumeFileDto[]
  /** 结构化程度概览，让用户一眼看出"这份填得全不全"。 */
  counts: {
    skills: number
    experiences: number
    projects: number
    education: number
    files: number
  }
  issues: number
}

export interface TailoringDto {
  id: number
  resumeId: number
  jobId: number
  jobTitle: string | null
  companyName: string | null
  content: ResumeContent
  /** `llm` = 模型产出（已过防编造）；`rule` = 规则降级。 */
  via: 'llm' | 'rule'
  notes: string[]
  adopted: boolean
  outcome: string | null
  createdAt: string
}

export interface ResumeDetailDto extends ResumeDto {
  issues: ResumeIssue[]
}
