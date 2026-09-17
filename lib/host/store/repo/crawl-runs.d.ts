import type { DatabaseSync } from 'node:sqlite';
import type { CrawlState } from '../../../shared/enums.js';
import type { CrawlRunDto } from '../../../shared/dto.js';
/**
 * 悬挂 `running` 的收敛阈值（SR-15 / A3）。
 *
 * 为什么是 2 小时：正常一轮抓取最多几分钟（单页 + 1.2–3.2s 随机延时），
 * 2 小时意味着"进程当时已经不在了"。阈值故意给得很宽 ——
 * **把一轮还在跑的抓取误判成失败，比留一条悬挂记录更糟**：前者会让用户以为数据是坏的。
 */
export declare const STALE_RUN_THRESHOLD_MS: number;
/** 结束一轮抓取时写入的汇总（§6.1 / §7 `crawl_run`）。 */
export interface CrawlRunPatch {
    state: CrawlState;
    pages?: number;
    found?: number;
    inserted?: number;
    updated?: number;
    skipped?: number;
    quarantined?: number;
    errorCode?: string | null;
    errorMsg?: string | null;
    logRef?: string | null;
    /** SR-28/29：触发原因（schedule / manual / catch-up）。 */
    reason?: string | null;
    /** SR-17/29：跳过原因（枚举键）。只有"到点了但没跑"才写。 */
    skipReason?: string | null;
}
export interface CrawlRunRepo {
    start(input: {
        platformId: string;
        planId?: number | null;
        reason?: string | null;
    }, now: string): number;
    finish(id: number, patch: CrawlRunPatch, now: string): void;
    get(id: number): CrawlRunDto | undefined;
    latest(platformId?: string): CrawlRunDto | undefined;
    list(limit: number, platformId?: string): CrawlRunDto[];
    count(): number;
    /**
     * SR-15：把**超过阈值仍在 `running`** 的记录收敛为 `failed`。
     *
     * 为什么必须有：进程被强杀（或机器断电）时 `finish()` 根本没机会执行，
     * 那条记录会**永远**停在 `running`。而 `crawlStatus().busy` 之类的判断会因此一直显示"正在跑"，
     * 用户看到的是一个永远不结束的抓取，且下次启动的互斥判断也可能被它带偏。
     *
     * @returns 被收敛的记录数
     */
    reapStale(now: string, thresholdMs?: number): number;
    /** 当前有没有"看起来还在跑"的记录（诊断用，不做业务判断）。 */
    countRunning(): number;
}
export declare function createCrawlRunRepo(db: DatabaseSync): CrawlRunRepo;
//# sourceMappingURL=crawl-runs.d.ts.map