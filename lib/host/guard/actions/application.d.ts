/**
 * 危险动作实现：**投递简历**（`application.send` 的平台侧执行）。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * 真正"把简历发出去"这件事只能经 `guard.run()` 拿到令牌后走到这里。
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 *
 * 与 `pipeline.recordApplication` 的分工：
 *   * `recordApplication` = 用户说"我把简历投了"，记一笔（本身也过闸门）；
 *   * 本文件 = **适配器真的把简历发出去了**，然后由 `record` 回调落库。
 *     两件事都叫"投递"，但一件是记账，一件是对外发东西。
 *
 * `delivery` 是这条动作里唯一不能猜的东西：适配器没说 `delivered` 就不算发出去了，
 * 失败时把 `delivery` / `evidence` 原样带进错误 detail，让上层能如实转述。
 */
import type { AdapterRegistry } from '../../platform/registry.js';
import type { SessionService } from '../../platform/session.js';
import type { DeliveryState, PageSource } from '../../platform/types.js';
import type { Store } from '../../store/store.js';
import { type Clock } from '../../util/time.js';
import { type GuardToken } from '../token.js';
export declare const APPLICATION_SEND_ACTION = "application.send";
export interface ApplicationSendDeps {
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
     * 投递**成功之后**记一笔（P7）。
     *
     * 与 `greeting.ts` 的 `record` 同一分工：这条动作的职责是"把简历发出去"，
     * 落库口径属于 pipeline 的语义。必须发生在**成功之后** —— 发失败了也记一条"已投递"，
     * 看板从第一天开始就说谎。
     */
    record?: (input: {
        jobId: number;
        platformId: string;
        actor: string;
        filePath: string | null;
        delivery: DeliveryState;
    }) => void;
}
export interface ApplicationSendInput {
    jobId: number;
    /** 本地简历文件（绝对路径）；`null` = 走平台内简历（BOSS 求职者网页端只支持这一种）。 */
    filePath: string | null;
}
export interface ApplicationSendResult {
    jobId: number;
    platformId: string;
    company: string;
    title: string;
    sentAt: string;
    delivery: DeliveryState;
    /** 适配器给的可读说明（例如"平台只支持平台内简历"）。 */
    detail?: string;
}
/**
 * 投递简历（平台侧执行）。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function sendApplication(deps: ApplicationSendDeps, guardToken: GuardToken, input: ApplicationSendInput): Promise<ApplicationSendResult>;
//# sourceMappingURL=application.d.ts.map