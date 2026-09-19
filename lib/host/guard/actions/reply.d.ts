/**
 * 危险动作实现：**回复一条 HR 消息**（在已有会话里发一条文本）。
 *
 * ⚠️ 这个文件是 2026-09-18 补上的，原因是发现原来那条"回复"链路**只在本地写了条记录**：
 * 工具 `message_reply` 的文案写着「回复一条 HR 消息」，`MessageService.reply` 也老老实实
 * 走完了 `guard.run`（`message.reply`，danger high），但回调里只 `createMessage(...)` ——
 * 平台上什么都没发生。用户以为回了，HR 永远收不到。契约里当时**没有** reply 这个槽位，
 * 领域层就算想发也无处可调。
 *
 * 现在：`guard.run` → 本文件 `sendReply` → `adapter.actions.reply`（真发） →
 * **成功之后**再落本地记录。首行即令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 */
import type { AdapterRegistry } from '../../platform/registry.js';
import type { SessionService } from '../../platform/session.js';
import type { PageSource } from '../../platform/types.js';
import type { Store } from '../../store/store.js';
import { type Clock } from '../../util/time.js';
import { type GuardToken } from '../token.js';
export declare const REPLY_SEND_ACTION = "message.reply";
export interface ReplySendDeps {
    store: Store;
    registry: AdapterRegistry;
    session: SessionService;
    pageSource: PageSource;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
    /**
     * 发送**成功之后**落一条 `direction='me'` 的本地记录。
     *
     * 与打招呼同一条原则：必须发生在成功之后 —— 发失败了也记"我已回复"，
     * 看板与接触态从第一天开始就说谎。
     */
    record?: (input: {
        jobId: number;
        platformId: string;
        content: string;
        actor: string;
    }) => void;
}
export interface ReplySendInput {
    /** 要回复的那条消息 id（用它定位会话所属岗位）。 */
    messageId: number;
    /** 回复正文。**不进审计表**（审计只留长度与摘要）。 */
    text: string;
}
export interface ReplySendResult {
    messageId: number;
    jobId: number;
    platformId: string;
    company: string;
    title: string;
    sentAt: string;
    textLength: number;
}
/**
 * 回复一条 HR 消息。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function sendReply(deps: ReplySendDeps, guardToken: GuardToken, input: ReplySendInput): Promise<ReplySendResult>;
//# sourceMappingURL=reply.d.ts.map