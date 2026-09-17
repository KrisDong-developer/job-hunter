import type { DatabaseSync } from 'node:sqlite';
import type { CrawlState } from '../../../shared/enums.js';
import type { CrawlRunDto } from '../../../shared/dto.js';
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
}
export interface CrawlRunRepo {
    start(input: {
        platformId: string;
        planId?: number | null;
    }, now: string): number;
    finish(id: number, patch: CrawlRunPatch, now: string): void;
    get(id: number): CrawlRunDto | undefined;
    latest(platformId?: string): CrawlRunDto | undefined;
    list(limit: number, platformId?: string): CrawlRunDto[];
    count(): number;
}
export declare function createCrawlRunRepo(db: DatabaseSync): CrawlRunRepo;
//# sourceMappingURL=crawl-runs.d.ts.map