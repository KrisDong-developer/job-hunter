

import type { ApplicationChannel, ApplicationStage, ContactStage, StageSource } from '../enums/pipeline.js'

/**
 * pipeline 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */

/**
 * 打招呼话术草稿（§22.2 `greeting_draft`）。
 *
 * `via` 必须如实回传：模型不可用时给的是模板话术，界面上不能标成"AI 生成"（J10）。
 */
export interface GreetingDraftDto {
  jobId: number
  text: string
  /** `llm` = 模型生成；`template` = 内置模板降级。 */
  via: 'llm' | 'template'
  /** 为什么降级、屏蔽了哪些字段 —— 直接展示给用户，不藏着。 */
  notes: string[]
  /** 本次**实际外发**给模型的字段清单（I5 知情同意）。 */
  outboundFields: string[]
  /** `llm_call` 留痕 id；降级未调用模型时为 null。 */
  callId: number | null
}

// 跟进、消息、面试、看板
/**
 * 一次状态变更（`stage_event`）。
 *
 * 它是这一层最重要的东西：`application.stage` 只是"现在在哪",
 * 而这张表回答「**谁、什么时候、凭什么**把它改成那里的」。
 */
export interface StageEventDto {
  id: number
  entity: string
  entityId: number
  fromStage: string | null
  toStage: string
  at: string
  /** `auto` = 自动识别 / `manual` = 人工 / `model` = 模型发起。 */
  source: StageSource
  evidenceRef: string | null
  note: string | null
}

/** 一条投递记录（§11.3 `Application`）。 */
export interface ApplicationDto {
  id: number
  jobId: number | null
  jobTitle: string | null
  companyName: string | null
  /** **用了哪一版简历** —— 归因分析必需（§11.3 / R6）。 */
  resumeId: number | null
  resumeFileId: number | null
  channel: ApplicationChannel
  sentAt: string
  stage: ApplicationStage
  stageAt: string
  actor: string
  note: string | null
  events: StageEventDto[]
}

export interface BoardCardDto {
  applicationId: number
  jobId: number
  jobTitle: string | null
  companyName: string | null
  channel: ApplicationChannel
  stage: ApplicationStage
  stageAt: string
  sentAt: string
  resumeId: number | null
  /** 卡在当前阶段多少天 —— 看板上"该催谁"靠它。 */
  daysSinceStage: number
}

/** `GET /board`：U5 看板（按 §12.1 的阶段分列）。 */
export interface BoardDto {
  generatedAt: string
  columns: Array<{ stage: ApplicationStage; cards: BoardCardDto[] }>
  total: number
  /** 卡在中间阶段超过阈值的天数 —— 界面上要显眼。 */
  staleCount: number
}

/** 一条打招呼记录（接触态的载体）。 */
export interface GreetingDto {
  id: number
  jobId: number | null
  jobTitle: string | null
  /** 公司名。列表要回答"我给谁发过、结果如何"，只有岗位标题不够。 */
  companyName: string | null
  platformId: string
  templateId: number | null
  /** 模板名（已删则 null）。话术效果对比（D2）要的可读标签，不是 id。 */
  templateName: string | null
  content: string
  sentAt: string
  channel: ApplicationChannel
  actor: string
  stage: ContactStage
  stageAt: string
  repliedAt: string | null
}

/** 跟进建议（**建议**，不是状态 —— 超时由时间推导，写进状态会让状态机被时间污染）。 */
export interface FollowUpDto {
  jobId: number
  jobTitle: string | null
  companyName: string | null
  stage: ContactStage
  idleHours: number
  kind: 'unread-timeout' | 'read-no-reply' | 'no-progress'
  message: string
  advice: string
}

/** 人工标记接触态的结果。低危（只写本地库、不碰平台）。 */
export interface ContactStageUpdateDto {
  ok: boolean
  contactStage: ContactStage
  greetingId: number
  stageAt: string
  repliedAt: string | null
  /** 改之前是什么 —— 界面据此显示"从 X → Y"。 */
  previousStage: ContactStage
}
