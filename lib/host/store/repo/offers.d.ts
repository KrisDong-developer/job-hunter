/**
 * Offer 仓储（§4.H / §11.3）。
 *
 * 三条纪律：
 *   1. **`comp_json` 一律过 `normalizeOfferComp`**（与 `resume.content_json` 同一条）——
 *      它是界面手搓的 JSON，也可能是模型给的 JSON，两者都不可信；
 *   2. **`annual_cash` 只在这里算**：`comp_json` 是唯一真相，标量列是它的投影。
 *      两处各算一次必然漂移，而漂移的表现是"对比表说 A 高、排序把 B 排前面"；
 *   3. 外键全 `SET NULL`（见 `schema.ts` v10）：岗位/公司被清理时 offer 行必须留着 ——
 *      它是用户资产，也是谈过什么的唯一记录。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { OfferState } from '../../../shared/enums.js';
import { type OfferComp } from '../../../shared/offer.js';
export interface OfferRecord {
    id: number;
    companyId: number | null;
    companyName: string;
    jobId: number | null;
    applicationId: number | null;
    role: string;
    comp: OfferComp;
    annualCash: number | null;
    deadline: string | null;
    state: OfferState;
    note: string | null;
    createdAt: string;
    updatedAt: string;
}
/** 写入输入。缺省键 = 不改（`update` 时）或取默认（`create` 时）。 */
export interface OfferInput {
    companyId?: number | null;
    companyName?: string;
    jobId?: number | null;
    applicationId?: number | null;
    role?: string;
    /** 待遇明细。**整份替换**，与 `criteria` / `resume.content` 同一个语义。 */
    comp?: unknown;
    deadline?: string | null;
    state?: OfferState;
    note?: string | null;
}
export interface OfferRepo {
    list(filter?: {
        state?: OfferState;
        companyId?: number;
        openOnly?: boolean;
        limit?: number;
    }): OfferRecord[];
    get(id: number): OfferRecord | undefined;
    create(input: OfferInput, now: string): OfferRecord;
    update(id: number, patch: OfferInput, now: string): OfferRecord | undefined;
    setState(id: number, state: OfferState, now: string): OfferRecord | undefined;
    remove(id: number): boolean;
    /** 某个岗位拿到的 offer（岗位详情要能回答"这个岗位走到哪一步了"）。 */
    listByJob(jobId: number): OfferRecord[];
    /** 还没决定的 offer 数（U0）。 */
    countOpen(): number;
    /** 还没决定、且截止时间早于 `beforeIso` 的（含已经过期的）—— 提醒与倒计时的数据面。 */
    listDueBefore(beforeIso: string): OfferRecord[];
}
export declare function createOfferRepo(db: DatabaseSync): OfferRepo;
//# sourceMappingURL=offers.d.ts.map