/**
 * 泳道发令器：把一轮的平台按 `MAX_CONCURRENT_PLATFORMS` 条泳道并发启动。
 *
 * ## 为什么单独一个文件
 *
 * 这是"跨平台并发"唯一的新编排逻辑，抽成纯函数（注入 launch 与预算判定）
 * 是为了让并发行为可以**离线钉住**：谁和谁重叠过、上限有没有被尊重、
 * 结果顺序是否稳定 —— 这些恰恰是并发改动里最容易悄悄退化的性质。
 *
 * ## 三条不变量
 *
 * 1. **每个平台恰好启动一次**，按传入顺序领取（freshness 序）；
 *    预算耗尽时，还没**领取**的不启动、如实报 `cut` —— 被裁掉的是
 *    "最不需要现在跑"的尾部，与串行时代的裁剪语义一致；
 * 2. **结果顺序 = 启动顺序**（不是完成顺序）：界面的"本轮结果"与既有测试
 *    都依赖确定性，完成顺序在并发下是随机的，不能让它漏出去；
 * 3. **一个平台失败不阻断其它平台**（沿用 SR-18 的不连坐原则）。
 *
 * 同平台串行不在这里管 —— 那是 platform/locks.ts 的事；这里的输入
 * （一个方案的平台列表）本身就不含重复。
 */
import { MAX_CONCURRENT_PLATFORMS } from '../../shared/config/crawl.js';
export async function runInLanes(options) {
    const { platforms, launch, budgetExhausted } = options;
    const lanes = Math.max(1, options.lanes ?? MAX_CONCURRENT_PLATFORMS);
    /** 启动序的槽位：worker 领到哪个下标就写哪个槽，最后按序压实。 */
    const slots = [];
    const cut = [];
    let cursor = 0;
    const worker = async () => {
        for (;;) {
            // 领号要同步：两个 worker 不能领到同一个下标（JS 单线程，这里没有竞态）。
            const index = cursor;
            cursor += 1;
            const platformId = platforms[index];
            if (platformId === undefined)
                return;
            // SR-46：到点了就不再开始新平台。判定在**领取时**做 ——
            // 已在跑的泳道继续到自己的终点（页与页之间收手由 deadlineAt 管）。
            if (budgetExhausted()) {
                cut.push(platformId);
                continue;
            }
            const outcome = { platformId, summary: null, error: null };
            try {
                outcome.summary = await launch(platformId);
            }
            catch (error) {
                outcome.error = error;
            }
            slots[index] = outcome;
            options.onSettled?.(outcome);
        }
    };
    const laneCount = Math.min(lanes, platforms.length);
    await Promise.all(Array.from({ length: laneCount }, () => worker()));
    // 按启动序压实（worker 写槽是乱序完成的）。
    const outcomes = [];
    for (const slot of slots) {
        if (slot !== undefined)
            outcomes.push(slot);
    }
    return { outcomes, cut };
}
//# sourceMappingURL=lanes.js.map