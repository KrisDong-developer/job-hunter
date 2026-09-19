/**
 * message 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { MessageDirection } from '../enums/message.js';
/** 一条往来消息（§11.3 `Message`）。 */
export interface MessageDto {
    id: number;
    platformId: string;
    conversationId: string;
    direction: MessageDirection;
    content: string;
    at: string;
    attachmentRef: string | null;
    jobId: number | null;
    jobTitle: string | null;
    companyName: string | null;
    readAt: string | null;
    /**
     * 规则识别出的面试邀约信号（§13 U6「识别面试邀约」）。
     * **只作为"建议"**：识别到不等于改状态，改状态是另一次显式动作。
     */
    inviteSignal: {
        hit: boolean;
        keywords: string[];
    } | null;
}
/** `GET /inbox`。 */
export interface InboxDto {
    items: MessageDto[];
    unread: number;
    total: number;
}
/**
 * 一段「回复草稿」（消息中心的情境拟稿）。
 *
 * 与发送做了明显区分：这是**草稿**，真正发出去要用户确认并走闸门 —— 生成绝不等于发送。
 */
export interface ReplyDraftDto {
    messageId: number;
    /** 拟好的回复正文。 */
    text: string;
    scenario: string;
    /** llm = 模型拟稿；fallback = 内置模板降级。 */
    via: 'llm' | 'fallback';
    /** 降级/脱敏等说明。 */
    notes: string[];
}
//# sourceMappingURL=message.d.ts.map