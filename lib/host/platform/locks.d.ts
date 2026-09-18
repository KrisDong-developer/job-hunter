/**
 * 按平台互斥（原 §4.2.1「全局互斥，串行执行」的收窄版）。
 *
 * ## 为什么从"全局一把锁"改成"每平台一把"
 *
 * 全局锁要保护的东西其实只有两类，而它们都能按平台切分：
 *   * **同一站点的请求节奏** —— 风控按站点看，跨平台并发不会让任何一个站点
 *     的请求变快；反而全局串行让"等 A 平台的页间延时"白白堵住 B/C 平台；
 *   * **浏览器页面** —— 原来互相踩的根因是 `page()` 复用同一页、`release()`
 *     关掉"多出来的页"；页面池（browser.ts 的 createPagePool）修掉之后，
 *     并发取页各拿各的，不再需要靠全局锁兜底。
 *
 * 不变的两条：
 *   * **同一平台绝不并发**（本模块保证）：两个方案打同一个站点仍串行，
 *     突发惩罚（pacing.ts）也因此保持"每平台一份、单线程访问"的成立条件；
 *   * **忙就立刻失败，不排队**（沿用原 mutex.tryRun 的语义）—— 排队会让
 *     调用方以为"点一下就好"，实际会连跑两遍，那才是触发风控的行为。
 *
 * 并发上限不在这里管：那是调度器发令时的事（`MAX_CONCURRENT_PLATFORMS`），
 * 锁只回答"这个平台现在能不能开工"。
 */
export interface PlatformLocks {
    /**
     * 跑一个平台的任务。该平台已有任务在跑 → **立刻返回 null**（不排队）；
     * 其它平台在跑不影响（它们拿的是别的键）。
     */
    tryRun<T>(platformId: string, fn: () => Promise<T>): Promise<T | null>;
    /** 是否有任何一个平台在跑（空闲自关的守卫与状态栏用）。 */
    busy(): boolean;
    /** 正在跑的平台数（诊断用；并发上限不靠它）。 */
    activeCount(): number;
    /** 某个平台当前是否在跑（诊断用）。 */
    running(platformId: string): boolean;
}
export declare function createPlatformLocks(): PlatformLocks;
//# sourceMappingURL=locks.d.ts.map