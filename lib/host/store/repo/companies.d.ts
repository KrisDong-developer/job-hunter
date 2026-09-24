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
/** 工商补全快照（v13，`company_enrichment` 表）—— 一家公司一份，重查整体覆盖。 */
export interface CompanyEnrichmentRecord {
    companyId: number;
    provider: string;
    matchedName: string | null;
    creditCode: string | null;
    /** exact（归一化全等，自动写）/ manual（用户从候选点选）/ unmatched（查无此主体）。 */
    confidence: 'exact' | 'manual' | 'unmatched';
    regStatus: string | null;
    estDate: string | null;
    regCapital: string | null;
    orgType: string | null;
    legalPerson: string | null;
    industry: string | null;
    staffNum: string | null;
    suitCount: number | null;
    investCount: number | null;
    licenseCount: number | null;
    tags: string[];
    sourceUrl: string | null;
    fetchedAt: string;
    updatedAt: string;
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
    /**
     * 人工复核（§4.3 / D-16）—— 自动识别错了用户要能纠正。
     * `blacklisted` / `note` 在 `company` 表，`manualLabel` 在 `company_profile` 表。
     */
    updateReview(companyId: number, patch: {
        blacklisted?: boolean;
        note?: string | null;
        manualLabel?: string | null;
    }, now: string): {
        company: CompanyRecord | undefined;
        profile: CompanyProfileRecord | undefined;
    };
    /** 公司列表浏览（外包/诈骗/黑名单集中曝光用）。 */
    list(filter: {
        blacklisted?: boolean;
        manualLabel?: string | null;
        /** 关键词：匹配公司名 / 归一化名 / 别名 / 备注（不区分大小写）。 */
        q?: string;
        /** 只保留在手岗位数 ≥ 该值的公司（无画像按 0 算）。 */
        minJobCount?: number;
        /** 排序键；缺省沿用 SQL 的岗位数降序。 */
        orderBy?: 'jobCount' | 'outsourcingScore' | 'fraudScore' | 'name';
        /** 仅在传了 `orderBy` 时有意义；缺省降序（与岗位库的默认一致）。 */
        descending?: boolean;
        limit?: number;
        offset?: number;
    }): {
        items: Array<{
            company: CompanyRecord;
            profile: CompanyProfileRecord | null;
        }>;
        total: number;
    };
    /** 重算统计量（岗位数 / 技术栈广度 / 地域跨度 / 驻场比例）。 */
    recomputeProfile(companyId: number, now: string): CompanyProfileRecord;
    /** 只更新识别分数（外包分 / 诈骗分 / 名称关键词命中），不动统计量。 */
    updateScores(companyId: number, scores: {
        nameKeywordHits: number;
        outsourcingScore: number;
        fraudScore: number;
    }, now: string): CompanyProfileRecord;
    /** 工商快照：读（没有查过 = undefined）。 */
    getEnrichment(companyId: number): CompanyEnrichmentRecord | undefined;
    /** 工商快照：整体覆盖写（unmatched 留痕也走它，其余字段给 null）。 */
    upsertEnrichment(record: Omit<CompanyEnrichmentRecord, 'updatedAt'>, now: string): CompanyEnrichmentRecord;
    count(): number;
}
export declare function createCompanyRepo(db: DatabaseSync): CompanyRepo;
//# sourceMappingURL=companies.d.ts.map