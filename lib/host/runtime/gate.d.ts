import type { AdapterRegistry } from '../platform/registry.js';
import type { PlatformGate } from '../scheduler/index.js';
import type { Store } from '../store/store.js';
import type { Clock } from '../util/time.js';
/**
 * 装配参数。
 *
 * `storeOf` 是**读取函数**而不是快照：数据层是异步就绪的（§4.9），
 * 门在数据层就绪之前就可能被问到，而且必须如实回答 `lease_lost`。
 */
export interface PlatformGateDeps {
    storeOf: () => Store | undefined;
    registry: AdapterRegistry;
    clock: Clock;
}
/**
 * SR-20：这个平台自己的冷却截止（ISO）。`null` = 没在冷却。
 *
 * 抽出来是因为**它有两个读者**：`createPlatformGate`（据此拦）与平台总览矩阵（据此显示）。
 * 两处各写一遍必然漂移，而这类漂移最难发现：矩阵写着"可以"，到点却被挡住。
 */
export declare function cooldownUntilOf(store: Store | undefined, platformId: string): string | null;
/**
 * SR-3：今天这个平台已经自动跑了几轮 / 上限。**同上：两个读者共用一份算法。**
 *
 * 只算**自动**触发的那些：手动是人在操作，不该被这条挡住（SR-3 的例外）。
 */
export declare function crawlQuotaOf(store: Store | undefined, platformId: string, clock: Clock): {
    used: number;
    limit: number;
};
/**
 * SR-16：**每平台独立**检查前置条件。
 *
 * 这是一个**纯判定**函数（不发请求、不改状态）—— 它回答的正是用户最想知道的那个问题：
 * 「为什么今天没跑？」。所以它的返回值直接进界面文案（SR-17/26）。
 *
 * 顺序：离线闸门 → **平台级风控暂停** → 适配器健康 → 登录态 → 每平台冷却 → 每日配额。
 * 顺序有讲究：越"根本、越不可能自愈"的原因越先报，
 * 否则"没到点/配额"这类会盖住"你的适配器已经坏了"。
 *
 * 风控暂停紧跟在离线闸门之后，是为了**保持迁移前的可见行为**：
 * 旧实现里方案级 `riskPaused` 也先于平台 gate 判定，于是"连续失败达阈值时
 * health 同时变 broken"的场合，用户看到的一直是 `risk_paused`。
 */
export declare function createPlatformGate(deps: PlatformGateDeps): PlatformGate;
//# sourceMappingURL=gate.d.ts.map