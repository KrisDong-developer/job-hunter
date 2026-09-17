import type { DatabaseSync } from 'node:sqlite';
/**
 * 公司信号（§7 `company_signal`）。
 *
 * 识别引擎的每一条判断都要在这里留痕：类型 + 依据 + 权重。
 * 它同时承担一个额外职责：**公司合并的可逆凭据** ——
 * `type='name-merge'` 的信号记下「谁并到了谁、依据是什么」，
 * 人工拆开时照着它反向操作即可（§4.10.1 铁律 2：去重必须可逆）。
 */
export interface CompanySignalRecord {
    id: number;
    companyId: number;
    type: string;
    evidence: unknown;
    weight: number;
    source: string;
    createdAt: string;
}
export interface CompanySignalInput {
    companyId: number;
    type: string;
    evidence: unknown;
    weight?: number;
    source?: string;
}
export interface SignalRepo {
    add(input: CompanySignalInput, now: string): number;
    /** 幂等写入：同一 (company, type) 已有同源信号时不再追加（重算不会刷屏）。 */
    addOnce(input: CompanySignalInput, now: string): number | null;
    listByCompany(companyId: number, limit?: number): CompanySignalRecord[];
    listByType(type: string, limit: number): CompanySignalRecord[];
    /** 按来源清空（重算前先清掉上次的规则信号）。 */
    clearBySource(companyId: number, source: string): number;
    countByType(): Record<string, number>;
    count(): number;
}
export declare function createSignalRepo(db: DatabaseSync): SignalRepo;
//# sourceMappingURL=signals.d.ts.map