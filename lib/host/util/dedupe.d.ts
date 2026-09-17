export type DedupeLevel = 'normalized' | 'alias' | 'containment' | 'similarity' | 'none';
export interface DedupeVerdict {
    /** 是否应当合并。 */
    merge: boolean;
    level: DedupeLevel;
    /** 可读依据（会原样落库到 `company_signal.evidence`）。 */
    basis: string;
    /** 0-1；`normalized`/`alias` 命中时为 1。 */
    score: number;
}
/** 相似度阈值。调高更保守（漏合并），调低更激进（误合并）—— 铁律 1 选择保守。 */
export declare const SIMILARITY_THRESHOLD = 0.88;
/** 包含关系的最低长度：太短的包含（如「中」⊂「中国」）没有意义。 */
export declare const CONTAINMENT_MIN_LENGTH = 3;
export interface DedupeOptions {
    /** 归一化键 → 已知等价名列表（`company.aliases_json`）。 */
    aliases?: ReadonlyMap<string, readonly string[]>;
    similarityThreshold?: number;
}
/** 字符 bigram 集合（中文没有词边界，bigram 是最实用的近似）。 */
export declare function bigrams(value: string): Set<string>;
/** Jaccard 相似度（bigram 集合）。 */
export declare function bigramSimilarity(left: string, right: string): number;
/** 归一化编辑距离相似度（1 - 距离/较长长度）。 */
export declare function levenshteinSimilarity(left: string, right: string): number;
/**
 * 判断两条公司名是否指向同一实体。
 *
 * @param left 公司名 A（原始写法即可，内部会归一化）
 * @param right 公司名 B
 */
export declare function compareCompanyNames(left: string, right: string, options?: DedupeOptions): DedupeVerdict;
/** 岗位去重键的组成部分。 */
export interface JobDedupeKey {
    companyKey: string;
    titleClean: string;
    salaryBucket: string;
    city: string;
}
/** 标题清洗：去括号补充、去常见修饰、去空白。 */
export declare function cleanJobTitle(title: string): string;
/** 薪资分桶：把 13K 与 15K 归到同一桶，避免因为范围微差就判成两个岗位。 */
export declare function salaryBucketOf(min: number | null, max: number | null): string;
export declare function jobDedupeKey(input: {
    companyName: string;
    title: string;
    salaryMin: number | null;
    salaryMax: number | null;
    city: string;
}): JobDedupeKey;
export interface JobDedupeVerdict {
    merge: boolean;
    basis: string;
    score: number;
}
/**
 * 判断两个岗位是不是「同一个岗位在不同平台」。
 *
 * 比公司名更保守：键必须**完全一致**，标题再做一次相似度确认。
 * 岗位标题天然差异大（「Java开发工程师」vs「Java 后端工程师」），
 * 所以标题相似度只作为**确认**，不作为主要依据 —— 宁可保留两个，也不要把两个
 * 真岗位合成一个（合并后投递记录会串）。
 */
export declare function compareJobs(left: JobDedupeKey, right: JobDedupeKey, threshold?: number): JobDedupeVerdict;
//# sourceMappingURL=dedupe.d.ts.map