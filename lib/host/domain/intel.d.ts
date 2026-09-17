/**
 * 情报引擎（P4 / §4.3 companies + §4.5.1 L1）。
 *
 * 三件事，全部**纯规则**：
 *   1. **岗位标注**（外包 / 诈骗 / 僵尸 / 薪资虚标 / 黑话）—— 每条标注必须带**可读依据**；
 *   2. **公司画像打分**（外包分 / 诈骗分 / 名称关键词命中）—— 依据累积在 `company_signal`；
 *   3. **L1 可解释匹配**（硬条件 + 关键词命中率）—— 产出分数与逐条理由。
 *
 * **L2（LLM 精评）不在 P4 范围内**：那需要 `ctx.llm` 接线、隐私闸门与注入防御，
 * 属于后续阶段。这里明确只做规则，并且界面上会标「粗筛分」，不冒充完整评估。
 */
import type { JobFlagInput } from '../store/repo/flags.js';
import type { CompanyProfileRecord } from '../store/repo/companies.js';
import type { DictionaryEntry } from '../store/repo/dictionary.js';
import type { Store } from '../store/store.js';
/** 僵尸岗位的判定阈值：发布时间超过这么多天还在列表里出现。 */
export declare const ZOMBIE_PUBLISH_DAYS = 60;
/** 薪资虚标的跨度阈值：上限 / 下限。 */
export declare const SALARY_SPAN_RATIO = 2;
/** 公司名里的外包标记词（比 JD 正文里的更可信 —— 名字就写着的）。 */
export declare const OUTSOURCING_NAME_MARKERS: readonly ["人力资源", "人才服务", "劳务", "外包", "派遣", "服务外包"];
export interface JobIntelInput {
    job: {
        title: string;
        city: string;
        salaryRaw: string;
        salaryMin: number | null;
        salaryMax: number | null;
        tags: string[];
        publishedAt: string | null;
        lastSeenAt: string;
    };
    jdText: string | null;
    companyName: string | null;
    companyProfile?: CompanyProfileRecord | undefined;
    entries: readonly DictionaryEntry[];
    now: Date;
}
/**
 * 给一个岗位算标注。
 *
 * 关键约束：**没有依据的结论一律不产出**。每个分支在 push 之前都必须先攒到至少一条
 * evidence，否则整条标注被丢掉 —— 这直接兑现「不得有无依据的结论」。
 */
export declare function evaluateJobFlags(input: JobIntelInput): JobFlagInput[];
/**
 * 求职偏好（L1 打分的输入）。
 *
 * 目前来自 `setting` 的 `match-profile`。**P6 会改成由简历派生** ——
 * 那时这份结构就是简历的投影，规则本身不用动。
 */
export interface MatchProfile {
    /** 期望城市；空数组表示不限。 */
    cities: string[];
    /** 期望月薪下限（元）。 */
    minSalary: number | null;
    /** 期望命中的技能/方向关键词。 */
    keywords: string[];
    /** 命中即**硬排除**的词。 */
    excludeKeywords: string[];
}
export declare const DEFAULT_MATCH_PROFILE: MatchProfile;
export interface MatchReason {
    kind: 'hit' | 'miss' | 'penalty' | 'exclude' | 'unknown';
    text: string;
    weight: number;
}
export interface MatchOutcome {
    score: number;
    reasons: MatchReason[];
}
export interface MatchInput {
    job: {
        title: string;
        city: string;
        salaryRaw: string;
        salaryMin: number | null;
        tags: string[];
    };
    jdText: string | null;
    profile: MatchProfile;
}
/**
 * L1 粗筛：**纯规则**，全量适用、零成本（§4.5.1）。
 *
 * 结果必须自带理由：用户看到 62 分时要能立刻知道"为什么不是 80"。
 * 返回的 `reasons` **永不为空** —— 一句「无明显匹配信号」也比一片空白强。
 */
export declare function scoreJobMatch(input: MatchInput): MatchOutcome;
export interface JobIntelResult {
    jobId: number;
    flags: JobFlagInput[];
    match: MatchOutcome;
}
export interface IntelService {
    /** 幂等播种内置词表。 */
    seedDictionary(): number;
    matchProfile(): MatchProfile;
    /** 重算一个岗位的标注与匹配分，并落库。 */
    evaluateJob(jobId: number, now: string): JobIntelResult | null;
    /** 重算公司画像（统计量 + 由信号聚合出的分数）。 */
    recomputeCompany(companyId: number, now: string): CompanyProfileRecord;
}
export interface IntelServiceOptions {
    /**
     * 从**当前简历**派生求职偏好（P6）。
     *
     * 为什么简历要参与匹配偏好：简历是用户对自己能力最诚实的声明 ——
     * 技能列表就是他"想被匹配到"的关键词，城市就是他能接受的地点。
     * 之前只有"搜索方案"这一个来源，等于让一次抓取的关键词代表了全部偏好。
     */
    resumeProfile?: () => Partial<MatchProfile> | undefined;
    /** 算分时用的简历版本标识，跟着分数一起写（§4.1）。 */
    scoreStamp?: () => {
        resumeId: number | null;
        rev: number;
    };
}
export declare function createIntelService(store: Store, clock: () => string, options?: IntelServiceOptions): IntelService;
/** 供上层渲染依据用。 */
export declare function describeReasons(reasons: readonly MatchReason[]): string[];
//# sourceMappingURL=intel.d.ts.map