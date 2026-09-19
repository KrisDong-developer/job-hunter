/**
 * campus 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
// 校招支线（§4.L）
/**
 * 校招批次。
 *
 * 为什么批次是一等字段：校招有**硬时间窗**（§4.L：错过就等一年）。
 * 秋招与春招的节点完全不同，把它们混在一个"投递"里就没法做时间窗管理。
 */
export const CAMPUS_BATCHES = ['autumn', 'spring', 'other'] as const

export type CampusBatch = (typeof CAMPUS_BATCHES)[number]

export const CAMPUS_BATCH_LABEL: Record<CampusBatch, string> = {
  autumn: '秋招',
  spring: '春招',
  other: '其他批次',
}

/**
 * 校招流程状态（§12.7）。
 *
 * 与社招的投递阶段并存而不是替换：校招对象多、流程长，且有社招没有的
 * 「笔试」与「三方协议」两个**不可逆**节点。
 */
export const CAMPUS_STAGES = [
  'intent',
  'applied',
  'assessment_pending',
  'assessment_done',
  'interview_pending',
  'interviewing',
  'final',
  'tripartite_pending',
  'tripartite_signed',
  'closed',
  'rejected',
] as const

export type CampusStage = (typeof CAMPUS_STAGES)[number]

export const CAMPUS_STAGE_LABEL: Record<CampusStage, string> = {
  intent: '意向',
  applied: '已网申',
  assessment_pending: '待笔试',
  assessment_done: '已笔试',
  interview_pending: '待面试',
  interviewing: '面试中',
  final: '终面',
  tripartite_pending: '待发三方',
  tripartite_signed: '已签三方',
  closed: '结束',
  rejected: '已拒',
}

/** 笔试/测评的形态（§11.5 `Assessment`）。 */
export const ASSESSMENT_KINDS = ['written', 'aptitude', 'personality', 'video', 'other'] as const

export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  written: '笔试',
  aptitude: '能力测评',
  personality: '性格测评',
  video: 'AI 视频面',
  other: '其它',
}

/**
 * 测评状态。
 *
 * `missed` 是**终态且不可逆** —— 这正是校招与社招最大的差异（§12.7）。
 * 所以它不是一个普通状态，而是一个需要"强提醒"的事件。
 */
export const ASSESSMENT_STATES = ['pending', 'in_progress', 'done', 'missed'] as const

export type AssessmentState = (typeof ASSESSMENT_STATES)[number]

export const ASSESSMENT_STATE_LABEL: Record<AssessmentState, string> = {
  pending: '待完成',
  in_progress: '进行中',
  done: '已完成',
  missed: '已错过',
}

/** 三方协议状态（§4.L L5：不可逆节点，违约有真实代价）。 */
export const TRIPARTITE_STATES = ['pending', 'signed', 'breached'] as const

export type TripartiteState = (typeof TRIPARTITE_STATES)[number]

export const TRIPARTITE_STATE_LABEL: Record<TripartiteState, string> = {
  pending: '待签',
  signed: '已签',
  breached: '违约',
}
