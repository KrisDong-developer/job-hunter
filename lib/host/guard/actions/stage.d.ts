/**
 * 低危动作实现：**探测某岗位在平台上的接触阶段**。
 *
 * 为什么也算"经闸门"：它是低危（只看不发，一个字节都不往外写），但它会**开一个真实
 * 浏览器页面访问招聘站** —— 与 `inbox.sync` 同一条理由：凡是要动浏览器的事，统一从
 * 闸门过（离线闸门、风控暂停、额度、冷却都在那边），而不是各个入口自己判断。
 *
 * ## 一条硬规则：**探测 ≠ 改状态**
 *
 * §4.3 的硬规则用在消息上（识别邀约不改状态），这里同理：平台说"HR 已读"，
 * 不等于我们本地那条接触态就该被改。规则识别会误判，而状态被误改之后用户会漏掉
 * 一个真正在推进的岗位。所以本动作**只返回平台事实**（`stage`），一个字段都不写库；
 * 要不要据此推进接触态，是用户的下一次显式动作。
 */
import type { AdapterRegistry } from '../../platform/registry.js';
import type { SessionService } from '../../platform/session.js';
import type { PageSource } from '../../platform/types.js';
import type { ContactStage } from '../../../shared/enums.js';
import type { Store } from '../../store/store.js';
import { type Clock } from '../../util/time.js';
import { type GuardToken } from '../token.js';
export declare const STAGE_PROBE_ACTION = "contact.stage";
export interface StageProbeDeps {
    store: Store;
    registry: AdapterRegistry;
    session: SessionService;
    pageSource: PageSource;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export interface StageProbeInput {
    jobId: number;
}
export interface StageProbeResult {
    jobId: number;
    platformId: string;
    /**
     * 平台上的事实。
     *
     * `null` = **判不出来**（会话不在列表里，或状态标记认不出来）—— 契约允许，
     * 而且这里绝不拿 `none` 顶上：「从没打过招呼」与「会话被平台移出保留窗口」
     * 是两件不同的事，猜一个会让用户在错误的岗位上下判断。
     */
    stage: ContactStage | null;
    /** 给人看的一句说明（含"没有改动任何本地状态"这件事）。 */
    note: string;
    checkedAt: string;
}
/**
 * 探测一个岗位当前的接触阶段。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export declare function probeContactStage(deps: StageProbeDeps, guardToken: GuardToken, input: StageProbeInput): Promise<StageProbeResult>;
//# sourceMappingURL=stage.d.ts.map