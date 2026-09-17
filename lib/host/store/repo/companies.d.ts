import type { DatabaseSync } from 'node:sqlite';
export interface CompanyRecord {
    id: number;
    name: string;
    nameNorm: string;
    aliases: string[];
    industry: string | null;
    size: string | null;
    nature: string | null;
    blacklisted: boolean;
    note: string | null;
    createdAt: string;
}
export interface CompanyProfileRecord {
    companyId: number;
    jobCount: number;
    stackDiversity: number;
    geoSpread: number;
    /** 提到驻场/现场的岗位占比（外包识别的重要统计信号）。无岗位时为 null。 */
    onsiteRatio: number | null;
    /** 公司名命中的识别关键词个数（D-16 的名称特征）。 */
    nameKeywordHits: number;
    outsourcingScore: number | null;
    fraudScore: number | null;
    manualLabel: string | null;
    updatedAt: string;
}
export interface EnsureCompanyInput {
    /** 原始公司名，用于展示。 */
    name: string;
    /** 归一化键（由领域层用 `normalizeCompanyName` 算好），用于实体身份。 */
    nameNorm: string;
    industry?: string | null;
    size?: string | null;
    nature?: string | null;
}
export interface CompanyRepo {
    /** 幂等登记公司；命中别名表时复用已有实体（§4.10.1 第 2 级）。 */
    ensure(input: EnsureCompanyInput, now: string): {
        id: number;
        created: boolean;
    };
    get(id: number): CompanyRecord | undefined;
    findByNorm(nameNorm: string): CompanyRecord | undefined;
    /** 精确命中手工维护的别名（`aliases_json`）。 */
    findByAlias(alias: string): CompanyRecord | undefined;
    addAlias(companyId: number, alias: string): void;
    getProfile(companyId: number): CompanyProfileRecord | undefined;
    /** 重算统计量（岗位数 / 技术栈广度 / 地域跨度 / 驻场比例）。 */
    recomputeProfile(companyId: number, now: string): CompanyProfileRecord;
    /** 只更新识别分数（外包分 / 诈骗分 / 名称关键词命中），不动统计量。 */
    updateScores(companyId: number, scores: {
        nameKeywordHits: number;
        outsourcingScore: number;
        fraudScore: number;
    }, now: string): CompanyProfileRecord;
    count(): number;
}
export declare function createCompanyRepo(db: DatabaseSync): CompanyRepo;
//# sourceMappingURL=companies.d.ts.map