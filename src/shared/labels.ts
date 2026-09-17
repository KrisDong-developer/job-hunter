/**
 * 跨半边共用的文案（宿主与客户端都要用）。
 *
 * `JOB_STATE_LABEL` 放在这里而不是 `src/client/labels.ts`：
 * 模型工具的返回文本里也要写「已收藏」而不是 `saved` ——
 * 用户在对话里看到的和界面上看到的必须是同一套词。
 */
import type { JobState } from './enums.js'

/** 岗位处置态的中文标签。**只此一份**（见 src/client/labels.ts 的历史注释）。 */
export const JOB_STATE_LABEL: Record<JobState, string> = {
  new: '新',
  seen: '已读',
  saved: '已收藏',
  ignored: '已忽略',
  archived: '已归档',
}

/** 打招呼语气的标签（宿主提示词与客户端选择器共用）。 */
export const TONE_LABEL: Record<'formal' | 'warm' | 'concise', string> = {
  formal: '正式',
  warm: '热情',
  concise: '简短',
}

/**
 * 简历语言标签与简历状态标签放在这里（而不是 client/labels.ts）：
 * 模型工具的返回文本里也要写「中文」而不是 `zh`。
 */
export { RESUME_LANGUAGE_LABEL, RESUME_STATE_LABEL, RESUME_TEMPLATE_LABEL } from './enums.js'
