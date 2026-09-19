/**
 * 跨半边共用的文案（宿主与客户端都要用）。
 *
 * `JOB_STATE_LABEL` 放在这里而不是客户端侧：
 * 模型工具的返回文本里也要写「已收藏」而不是 `saved` ——
 * 用户在对话里看到的和界面上看到的必须是同一套词。
 */
import type { JobState } from './enums.js';
/** 岗位处置态的中文标签。**只此一份**（客户端曾另抄一份，于是详情里把「已收藏」写成了「收藏」）。 */
export declare const JOB_STATE_LABEL: Record<JobState, string>;
/** 打招呼语气的标签（宿主提示词与客户端选择器共用）。 */
export declare const TONE_LABEL: Record<'formal' | 'warm' | 'concise', string>;
/**
 * 简历语言标签与简历状态标签放在这里（而不是客户端侧）：
 * 模型工具的返回文本里也要写「中文」而不是 `zh`。
 */
export { RESUME_LANGUAGE_LABEL, RESUME_STATE_LABEL, RESUME_TEMPLATE_LABEL } from './enums.js';
//# sourceMappingURL=labels.d.ts.map