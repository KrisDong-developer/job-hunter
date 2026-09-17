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
    markReplayed(id: number, jobId: number, now: string): void;
    /** 修好选择器、重放完成后清空该平台的队列。 */
    clear(platformId: string): number;
}
export declare function createRepairRepo(db: DatabaseSync): RepairRepo;
//# sourceMappingURL=repairs.d.ts.map