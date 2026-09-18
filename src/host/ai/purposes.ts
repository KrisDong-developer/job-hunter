/**
 * 模型用途枚举与开关（§4.5）。
 *
 * 「按用途开关」是隐私设计的一部分：用户可以只开话术、关掉简历定制 ——
 * 而不是只能选择"全开或全关"。
 */
export const AI_PURPOSES = [
  'match_score',
  'explain',
  'jd_summary',
  'greeting_draft',
  'resume_tailor',
  'resume_tone_check',
  'interview_prep',
  'mock_interview',
  'company_intel',
  'stage_extract',
  'offer_compare',
  /** P8：Cover Letter（§4.M M2）。海外岗位通常单独要一封信，不是简历的复述。 */
  'cover_letter',
  /** 消息中心：从 HR 文本里抽出面试时间/地点/形式（配合一键进日程）。 */
  'message_extract',
] as const

export type AiPurpose = (typeof AI_PURPOSES)[number]

export const AI_PURPOSE_LABEL: Record<AiPurpose, string> = {
  match_score: '匹配打分',
  explain: '匹配解释',
  jd_summary: 'JD 摘要',
  greeting_draft: '打招呼话术',
  resume_tailor: '简历定制',
  resume_tone_check: '简历语气检查',
  interview_prep: '面试准备',
  mock_interview: '模拟面试',
  company_intel: '公司情报',
  stage_extract: '阶段识别',
  offer_compare: 'Offer 对比',
  cover_letter: 'Cover Letter',
  message_extract: '消息日程识别',
}

/**
 * 默认开关。
 *
 * 默认**只开低风险、低成本的用途**：话术与摘要。
 * 简历相关的用途默认关 —— 那会把简历内容发给模型，属于用户应当显式同意的范围（I5 知情同意）。
 */
export const AI_PURPOSE_DEFAULT_ENABLED: Record<AiPurpose, boolean> = {
  match_score: true,
  explain: true,
  jd_summary: true,
  greeting_draft: true,
  resume_tailor: false,
  resume_tone_check: false,
  interview_prep: false,
  mock_interview: false,
  company_intel: false,
  stage_extract: false,
  offer_compare: false,
  // 海外方向通常要单独一封信，但生成质量依赖模型 —— 默认关，用户自己开
  cover_letter: false,
  // 消息日程识别：默认开 —— 内容是用户自己贴的 HR 文本，识别结果还要用户确认才进日程
  message_extract: true,
}

export interface AiConfig {
  /** 总开关。关掉之后一切走规则降级，功能不崩（J10）。 */
  enabled: boolean
  purposes: Record<AiPurpose, boolean>
}

/**
 * 配置补丁：`purposes` 允许只写要改的那几项。
 * 不这么写的话，每加一个用途都会让所有调用点的对象字面量编译失败。
 */
export type AiConfigPatch = Partial<Omit<AiConfig, 'purposes'>> & {
  purposes?: Partial<Record<AiPurpose, boolean>>
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: true,
  purposes: { ...AI_PURPOSE_DEFAULT_ENABLED },
}

export const AI_CONFIG_KEY = 'ai-config'

/** 读配置；缺项按默认补齐（新增用途不会让老配置失效）。 */
export function normalizeAiConfig(stored: Partial<AiConfig> | undefined): AiConfig {
  if (stored === undefined) return DEFAULT_AI_CONFIG
  return {
    enabled: stored.enabled !== false,
    purposes: { ...AI_PURPOSE_DEFAULT_ENABLED, ...(stored.purposes ?? {}) },
  }
}
