/**
 * 危险动作实现：**发送打招呼**。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * domain 只暴露安全的读与准备方法（`greeting_draft` 生成文本但不发送），
 * 真正的发送只能经 `guard.run()` 拿到令牌后走到这里。
 *
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 */
import type { AdapterRegistry } from '../../platform/registry.js';
import type { SessionService } from '../../platform/session.js';
import type { PageSource } from '../../platform/types.js';
import type { Store } from '../../store/store.js';
import { type Clock } from '../../util/time.js';
import { type GuardToken } from '../token.js';
export declare const GREETING_SEND_ACTION = "greeting.send";
export interface GreetingSendDeps {
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
     * 发送**成功之后**记一笔接触记录（P7）。
     *
     * 为什么留成回调而不是在这里直接写库：这条动作的职责是"把消息发出去"，
     * "接触态怎么记"属于 `pipeline` 的语义。
     * 更实际的原因是它必须发生在**成功后** —— 发失败了也记一条"已打招呼"，
     * 状态机就从第一天开始说谎。
     */
    record?: (input: {
        jobId: number;
        platformId: string;
        content: string;
        actor: string;
        templateId?: number | null;
    }) => void;
}
export interface GreetingSendInput {
    jobId: number;
    /** 话术全文。**不进审计表**（审计只留长度与摘要）。 */
    text: string;
}
export interface GreetingSendResult {
    jobId: number;
    platformId: string;
    company: string;
    title: string;
    sentAt: string;
    textLength: number;
}
/**
 * 发送打招呼。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function sendGreeting(deps: GreetingSendDeps, guardToken: GuardToken, input: GreetingSendInput): Promise<GreetingSendResult>;
//# sourceMappingURL=greeting.d.ts.map