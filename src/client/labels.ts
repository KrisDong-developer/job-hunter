import type { JobState } from '../shared/enums.js'

/**
 * 岗位处置态的中文标签。
 *
 * **只此一份**：列表（U1）与详情（U2）必须用同一套文案。
 * 早先两处各写了一份，结果详情里「已收藏」写成「收藏」，与动作按钮的文案撞在一起，
 * 既让人分不清「这是状态还是按钮」，也让端到端断言假失败。
 *
 * P5 起真正的定义搬到了 `src/shared/labels.ts` —— 模型工具的返回文本也要用它。
 * 这里保留转发，是为了让客户端的既有 import 不用改。
 */
export { JOB_STATE_LABEL } from '../shared/labels.js'

/** 详情抽屉里的动作按钮文案（是**动作**，不是状态，所以用祈使式）。 */
export const JOB_ACTION_LABEL: Record<JobState, string> = {
  new: '标为新',
  seen: '标为已读',
  saved: '收藏',
  ignored: '忽略',
  archived: '归档',
}
