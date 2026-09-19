import type { DatabaseSync } from 'node:sqlite';
/** `pending_repair` 里的一条待修复记录（§4.2.4）。 */
export interface RepairRecord {
    id: number;
    platformId: string;
    crawlRunId: number | null;
    capturedAt: string;
    missingFields: string[];
    raw: unknown;
    sourceUrl: string | null;
    replayState: string;
}
export interface EnqueueRepairInput {
    platformId: string;
    crawlRunId?: number | null;
    /** 该条记录缺了哪些核心字段。 */
    missingFields: string[];
    /** 已解析出的原始字段（标量 JSON）。 */
    raw: unknown;
    /** 原始 HTML 片段，供修好选择器后重放解析。 */
    rawHtml?: string | null;
    sourceUrl?: string | null;
    note?: string | null;
}
export interface RepairRepo {
    enqueue(input: EnqueueRepairInput, now: string): number;
    countPending(platformId?: string): number;
    listPending(platformId: string | undefined, limit: number): RepairRecord[];
    get(id: number): RepairRecord | undefined;
    /**
     * 丢弃**单条**待修复记录（`replay_state = 'discarded'`）。
     *
     * 与 `clear` 的分工：`clear` 是"这个平台的选择器已修好、整队清掉"，
     * 这一条是"就这一条没价值/是平台自己的脏数据"。
     * 两者都不删行 —— 留痕，便于下次遇到同样形态时回看。
     */
    discard(id: number): boolean;
    markReplayed(id: number, jobId: number, now: string): void;
    /** 修好选择器、重放完成后清空该平台的队列。 */
    clear(platformId: string): number;
}
export declare function createRepairRepo(db: DatabaseSync): RepairRepo;
//# sourceMappingURL=repairs.d.ts.map