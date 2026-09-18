export interface LaneOutcome<T> {
    platformId: string;
    /** 成功的结果；失败为 null（error 承载原因）。 */
    summary: T | null;
    error: unknown;
}
export interface LanesRunOptions<T> {
    /** 待启动的平台，按期望的启动序（调度器传 freshness 序）。 */
    platforms: readonly string[];
    /** 启动一个平台（生产接 runtime.crawl / 测试注入桩）。 */
    launch: (platformId: string) => Promise<T>;
    /** 启动前问一次"预算还在吗"。true = 已耗尽，这个平台不启动、进 cut。 */
    budgetExhausted: () => boolean;
    /** 并发上限。缺省 MAX_CONCURRENT_PLATFORMS。 */
    lanes?: number;
    /**
     * 每个平台的结论出来时回调（成功与失败都会调）。
     * 供调用方**即时**发 SSE 事件 —— 不用它的话事件会攒到整轮结束才发。
     */
    onSettled?: (outcome: LaneOutcome<T>) => void;
}
export interface LanesRunResult<T> {
    /** 按**启动序**排列的结论（只含真正启动过的平台）。 */
    outcomes: Array<LaneOutcome<T>>;
    /** 因预算耗尽而没启动的平台（原顺序）。 */
    cut: string[];
}
export declare function runInLanes<T>(options: LanesRunOptions<T>): Promise<LanesRunResult<T>>;
//# sourceMappingURL=lanes.d.ts.map