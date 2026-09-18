/**
 * 危险动作实现：**同步收件箱**（把平台会话列表读进本地消息表）。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * 读取本身是低危的（不对外发任何东西），但它会**开一个真实浏览器页面**去访问平台 ——
 * 因此和打招呼一样，必须经 `guard.run()` 拿到令牌后走到这里。
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 *
 * 与 `greeting.ts` 的分工：这里只负责"把平台的会话列表读回来"，
 * "读回来的消息怎么落库"通过 `record` 回调交给 domain（消息中心）。
 */
import type { AdapterRegistry } from '../../platform/registry.js';
import type { SessionService } from '../../platform/session.js';
import type { PageSource } from '../../platform/types.js';
import { type GuardToken } from '../token.js';
export declare const INBOX_SYNC_ACTION = "inbox.sync";
export interface InboxSyncDeps {
    registry: AdapterRegistry;
    session: SessionService;
    pageSource: PageSource;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
    /**
     * 把一条读到的消息落库。
     *
     * 为什么是回调而不是这里直接写库：去重口径（同一会话同方向同正文算不算同一条）
     * 属于消息中心的语义，不该由安全闸门定。
     * 返回值 `created` 让这里能如实统计"新增 / 重复"。
     */
    record?: (input: {
        platformId: string;
        direction: 'hr' | 'me';
        content: string;
        conversationId: string;
        at: string | null;
    }) => {
        created: boolean;
    };
}
export interface InboxSyncInput {
    platformId: string;
}
export interface InboxSyncResult {
    platformId: string;
    /** 平台会话列表里读到的条数。 */
    fetched: number;
    /** 新写进本地消息表的条数。 */
    recorded: number;
    /** 已存在、本次跳过的条数（重复同步的正常现象）。 */
    duplicates: number;
    /** 平台标记为未读的条数。 */
    unread: number;
}
/**
 * 同步一次收件箱。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function syncInbox(deps: InboxSyncDeps, guardToken: GuardToken, input: InboxSyncInput): Promise<InboxSyncResult>;
//# sourceMappingURL=inbox.d.ts.map