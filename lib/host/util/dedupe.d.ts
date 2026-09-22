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
    /**
     * **宽松**公司键（地域 + 法人后缀 + 行业词都剥）。
     *
     * 只用来判"疑似"：两个键相等说明差异**仅在于行业词/机构词**
     * （「XX网络科技」vs「XX网络技术」）—— 可能是同一家，也可能不是，交给人看。
     */
    companyKey: string;
    /**
     * **严格**公司键（只剥地域 + 法人/机构后缀，保留行业词）。
     *
     * 自动合并**只认它**。行业词被剥掉之后「XX网络科技有限公司」与「XX网络技术有限公司」
     * 会落到同一个「XX网络」，再撞上同名通用标题 + 同城 + 同薪资档，就会把两个真岗位
     * 合掉 —— 而合并的代价是投递记录串在一起，且极难发现。
     */
    companyKeyStrict: string;
    titleClean: string;
    salaryBucket: string;
    city: string;
}
/** 标题清洗：去括号补充、去常见修饰、去空白。 */
export declare function cleanJobTitle(title: string): string;
/** 薪资分桶：把 13K 与 15K 归到同一桶，避免因为范围微差就判成两个岗位。 */
export declare function salaryBucketOf(min: number | null, max: number | null): string;
/**
 * **薪资未锚定**的哨兵值（该平台没给薪资，如 BOSS 未登录时的空薪资）。
 *
 * 它必须与"某个真实档位"区分开：R25 的成因正是把 `'unknown'` 当成了一个普通档位，
 * 于是"一侧没薪资"被当成"薪资不同" → **同一个岗位在不同平台永远不会合并**。
 */
export declare const UNKNOWN_SALARY_BUCKET = "unknown";
/**
 * 城市**归一到市级**再比较。
 *
 * BOSS 的卡片给「深圳·福田区·车公庙」（适配器会拆成 city/district），
 * 但别的平台可能把「深圳-福田」整个塞进 city。不归一的话，
 * 「深圳」与「深圳-福田」会被判成两个城市 —— 又是静默地少合并（R25）。
 */
export declare function normalizeCityForDedupe(city: string): string;
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
    /**
     * 疑似重复，但**没到合并门槛** —— 值得人来确认一下。
     *
     * 为什么必须有这个出口：硬门槛全过了（同公司、同城、薪资不冲突），只是标题差一点。
     * 不自动合并是对的（宁可漏、不可错），但**"没合并"这件事本身也得能被看见** ——
     * 否则用户永远不知道自己少了几个合并，也无从纠正。
     */
    candidate: boolean;
}
/** 疑似重复的相似度下界。低于它连提都不提 —— 否则"疑似"会变成噪音。 */
export declare const CANDIDATE_SIMILARITY = 0.75;
/**
 * 公司这一关判到哪一档。
 *
 * * `same` —— 允许自动合并；
 * * `weak` —— **只有**"疑似"：两家公司名只差一个行业词/机构词，而且**不是**
 *   "少写了一个词"那种关系（见下）；
 * * `none` —— 不同（含公司名归一化后为空）。
 *
 * 两档的判据为什么不是简单的一句"严格键相等"：
 *
 * * 「北京字节跳动科技有限公司」与「字节跳动」→ 严格键分别是「字节跳动科技」与「字节跳动」，
 *   长的那边**正好多一个行业词**。这是**写法差异**（同一个词写没写全），算同一个公司
 *   —— 这种形态在跨平台数据里极其常见，一刀切成"疑似"等于把去重废掉。
 * * 「XX网络科技有限公司」与「XX网络技术有限公司」→ 严格键是「XX网络科技」与「XX网络技术」，
 *   谁也不包含谁 —— 是**替换了一个行业词**，语义上可能就是两家不同的公司。
 *   这种才是危险的：硬键一相等，再撞上通用标题 + 同城 + 同薪资档，两个真岗位就被合掉了。
 *
 * 所以用"差集是否恰好是一个被剥掉的词 + 前缀关系"来区分这两者，
 * 而不是把整个行业词表重新引入硬键。
 */
export declare function companyTierOf(left: JobDedupeKey, right: JobDedupeKey): 'same' | 'weak' | 'none';
/**
 * 判断两个岗位是不是「同一个岗位在不同平台」。
 *
 * 比公司名更保守：硬键必须一致，标题再做一次相似度确认。
 * 岗位标题天然差异大（「Java开发工程师」vs「Java 后端工程师」），
 * 所以标题相似度只作为**确认**，不作为主要依据 —— 宁可保留两个，也不要把两个
 * 真岗位合成一个（合并后投递记录会串）。
 *
 * ## 公司名这一关分两档（2026-09-21 修，判据在 `companyTierOf`）
 *
 * * **`same`** → 公司过了，继续看城市 / 薪资 / 标题。除了"严格键完全相等"，
 *   还包括"**只少写了一个行业词**"（「字节跳动科技」vs「字节跳动」）——
 *   那是写法差异，在跨平台数据里极其常见，一刀切成"疑似"等于把去重废掉。
 * * **`weak`** → **不自动合并**，判成"疑似"交人看。成因见 `company-name.ts` 的
 *   `LEGAL_SUFFIXES`：把行业词也剥掉之后，「XX网络科技」与「XX网络技术」会变成
 *   同一家公司 —— 那是"**换了一个行业词**"，语义上可能就是两家不同的公司，
 *   再撞上通用标题 + 同城 + 同薪资档，两个真岗位就会被合掉。
 *
 * 三条硬键各有各的**缺值**处理（R25）：
 *   * 公司：归一化后为空 → 直接不判（无法判断，不是"不同"）；
 *   * 城市：比较前**归一到市级**（`normalizeCityForDedupe`）；
 *   * 薪资：**只在两边都锚定时**才当门槛 —— "未知"不等于"不同"。
 */
export declare function compareJobs(left: JobDedupeKey, right: JobDedupeKey, threshold?: number): JobDedupeVerdict;
//# sourceMappingURL=dedupe.d.ts.map