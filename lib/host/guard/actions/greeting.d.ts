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
import type { DeliveryState } from '../../../shared/enums.js';
import type { PageSource } from '../../platform/types.js';
import type { JobDto } from '../../../shared/dto.js';
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
        /**
         * 送达状态，原样交给上层。
         *
         * 为什么要传：`delivered` 是「已打招呼」与「已送达」两态的分界（§12.2），
         * 而"未读超时"的跟进建议只在 `delivered` 上成立 —— 上层据此决定记哪一态。
         * 这一层不自己判断（判断口径属于 pipeline 的语义），只如实转交。
         */
        delivery: DeliveryState;
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
/** 「这个平台现在能不能发」的**只读预检**结果（与岗位无关，只看平台能力与登录态）。 */
export interface GreetingPlatformBlocker {
    code: 'platform_unsupported' | 'not_logged_in';
    message: string;
    hint: string;
}
/**
 * 平台层面的预检：适配器实现了 `sayHello` 没有、登录态还在不在。
 *
 * 单条发送、批量预览**共用这一份**：批量预览如果自己再写一套"能不能发"的判断，
 * 两份迟早会漂移 —— 而漂移的表现恰恰是预览说能发、点下去才失败，那比没有预览更恼火。
 *
 * 顺序是刻意的：**能力先于登录**。"这个平台压根不支持打招呼"比"你还没登录"更接近事实 ——
 * 登录了也还是一样发不出去，先说后者会让人白登录一次。
 */
export declare function greetingPlatformBlocker(deps: {
    registry: AdapterRegistry;
    session: SessionService;
}, platformId: string): GreetingPlatformBlocker | null;
/** 「这条现在能不能发」的**只读预检**结果（岗位 + 平台）。 */
export type GreetingReadiness = {
    ok: true;
    job: JobDto;
    adapterName: string;
} | {
    ok: false;
    code: 'NOT_FOUND' | 'NOT_LOGGED_IN' | 'ADAPTER_BROKEN';
    message: string;
    hint: string;
};
/**
 * 只读预检：岗位在不在，以及这个平台能不能发（后者走 `greetingPlatformBlocker`）。
 *
 * @param deps 只要这三个依赖，所以不需要页面、也不会产生任何副作用
 */
export declare function greetingReadinessOf(deps: {
    store: Store;
    registry: AdapterRegistry;
    session: SessionService;
}, jobId: number): GreetingReadiness;
/**
 * 发送打招呼。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function sendGreeting(deps: GreetingSendDeps, guardToken: GuardToken, input: GreetingSendInput): Promise<GreetingSendResult>;
//# sourceMappingURL=greeting.d.ts.map