import type { FreshnessLevel, JobFlagType, JobState } from '../enums/job.js';
import type { ApplicationStage, ContactStage } from '../enums/pipeline.js';
/**
 * job 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
export interface JobDto {
    id: number;
    platformId: string;
    /**
     * 平台显示名（服务端 JOIN 出来的）。
     *
     * 界面必须能回答"这条是从哪个平台来的"：同一个岗位横跨多个平台本身就是判断依据
     * （谁在批量转载、哪家平台信息更准）。`null` = 平台表里没有这一行（历史数据或平台已卸载），
     * 那时退回显示 `platformId`。
     */
    platformName: string | null;
    platformJobId: string;
    title: string;
    companyId: number | null;
    companyName: string | null;
    salaryRaw: string;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryMonths: number | null;
    city: string;
    district: string;
    expReq: string;
    eduReq: string;
    tags: string[];
    sourceUrl: string;
    publishedAt: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    /**
     * **这条记录被抓取入库的时间**。
     *
     * 与 `lastSeenAt` 是两个不同的问题：后者回答"这岗还在招吗"（新鲜度），
     * 前者回答"我这份库里的这条是什么时候拿到的"（数据来路）。
     * 界面上的用途是把来源与时间放在一起 —— 用户看到"某平台 · 抓取于 3 小时前"，
     * 才知道这条信息的时效边界在哪。
     *
     * 列表默认排序（`orderBy: 'crawled_at'`）用的就是这一列，但它在界面上从来没露过面：
     * 用户看到的是"按抓取时间"排出来的顺序，却指不出哪一列是抓取时间。
     */
    crawledAt: string;
    state: JobState;
    /** L1 粗筛分（0-100）。**不是**完整评估，界面上必须标清楚（§4.5.1）。 */
    matchScore: number | null;
    /** 算这个分时用的是哪一版简历、哪个 rev（§4.1）。 */
    scoreRev: number;
    scoreResumeId: number | null;
    /**
     * 这个分是不是**过期**了 —— 简历改过之后，旧分数必须被标出来而不是继续用。
     *
     * §4.1 把这条列为"最容易出的看起来对、其实全错的 bug"：分数还是那个分数，
     * 但它已经不是在评价当前这份简历了。
     */
    scoreStale: boolean;
    /** 命中的标注类型；完整依据在详情里。 */
    flagTypes: JobFlagType[];
    /**
     * 跨平台去重分组 id（§4.10.1）。`null` = 它没有被判定为"另一个平台的同一个岗位"。
     *
     * 有了它，列表才能**按组折叠**（同一条岗位在 4 个平台各抓一条时只占一行），
     * 而不是让用户在一屏里看到四条几乎一样的卡片。
     */
    dedupGroupId: number | null;
    /**
     * 接触态（§12.2）—— `none` = 还没有任何打招呼记录。
     *
     * 之前只有详情能回答"这条打过招呼没有"（详情单独调 `GET /jobs/:id/history`）。
     * 列表也要能回答：**打招呼与投递是不可逆的对外动作**，行内给了按钮就必须能
     * 显示"已经发过了"，否则一屏几十行里重复发是迟早的事。
     */
    contactStage: ContactStage;
    /**
     * 最近一次投递的阶段（§12.1）—— `null` = 没投过。
     *
     * 与 `contactStage` **刻意分开**：接触态回答"有没有接触上"（含手工标记），
     * 这个回答"简历投出去之后走到哪一步了"。两者是两个状态机，不合并。
     */
    applicationStage: ApplicationStage | null;
}
/** 一页岗位（`GET /jobs`）。 */
export interface JobPageDto {
    items: JobDto[];
    page: number;
    pageSize: number;
    /** 当前筛选下的总条数（走同一套 WHERE 的 count）。 */
    total: number;
    hasMore: boolean;
}
/** 岗位库筛选器的**取值集**（`GET /jobs/facets`）。 */
export interface JobFacetsDto {
    /** 出去重后的城市列表（界面多选城市用）。 */
    cities: string[];
    /** 去重后的经验要求取值 —— 平台原始串，不是枚举。 */
    expReqs: string[];
    /** 去重后的学历要求取值 —— 同上。 */
    eduReqs: string[];
}
/** `GET /jobs/:id` 的响应：岗位 + JD 原文 + 标注依据 + 匹配理由 + 所属公司画像。 */
export interface JobDetailDto {
    job: JobDto;
    /**
     * JD 原文（岗位职责 / 任职要求）。
     *
     * 只在**详情**里给，不进 `JobDto` 与列表页：原文动辄几千字，列表一次几十条，
     * 塞进去等于把整页响应撑成几兆。
     *
     * `null` 表示**没抓到**（该平台没实现 `detail.extract`，或详情页没命中选择器）——
     * 界面必须如实说"没抓到"，不能拿标签拼一份看起来像 JD 的东西出来。
     */
    jdText: string | null;
    /** 标注的完整记录（含依据）。**没有依据的结论不会出现在这里。** */
    flags: JobFlagDto[];
    /** 匹配分的逐条理由（§4.5.1：分数必须可解释）。 */
    matchReasons: Array<{
        kind: string;
        text: string;
        weight: number;
    }>;
    company: CompanyProfileDto | null;
}
/** 一条标注（带可读依据）。 */
export interface JobFlagDto {
    flagType: JobFlagType;
    score: number;
    evidence: string[];
    computedAt: string;
}
/** 公司画像（U2 展示用）。 */
export interface CompanyProfileDto {
    id: number;
    name: string;
    nameNorm: string;
    industry: string | null;
    size: string | null;
    nature: string | null;
    jobCount: number;
    geoSpread: number;
    stackDiversity: number;
    onsiteRatio: number | null;
    nameKeywordHits: number;
    outsourcingScore: number | null;
    fraudScore: number | null;
    /** 人工标签（复核时打的，不是规则算的）。 */
    manualLabel: string | null;
    /**
     * 是否被用户人工拉黑。
     *
     * 注意它现在的**作用范围**：这是一个人工标记，会出现在岗位详情与公司列表里，
     * 但**不会**自动把该公司的岗位从岗位库查询结果里剔除 ——
     * 静默隐藏数据比不隐藏更危险（用户会以为"这条岗位不存在"）。
     */
    blacklisted: boolean;
}
/** `GET /companies/:id`。 */
export interface CompanyDetailDto {
    company: CompanyProfileDto;
    /** 累积的信号（识别依据的留痕）。 */
    signals: Array<{
        type: string;
        weight: number;
        evidence: unknown;
        source: string;
        createdAt: string;
    }>;
    /** 该公司在手岗位（有界）。 */
    jobs: JobDto[];
    /** 该公司岗位的标注汇总（类型 → 条数）。 */
    flagCounts: Record<string, number>;
}
/**
 * 一个方案的新鲜度（SR-8）。
 *
 * 阈值**随计划频率**：每天跑一次的方案 18 小时就算旧了，
 * 每周跑一次的方案 18 小时完全正常。所以 `thresholds` 一起回传，
 * 界面上写"为什么它算 stale"时有据可依，而不是一个魔数。
 */
export interface FreshnessDto {
    level: FreshnessLevel;
    /** 用来判定的小时数（负数 = 从未成功过，按 cold 处理）。 */
    hoursSinceSuccess: number | null;
    thresholds: {
        freshHours: number;
        coldHours: number;
    };
}
export interface JobListParams {
    q?: string;
    /** 城市数组：命中任意一个即可。 */
    cities?: string[];
    city?: string;
    state?: string;
    minSalary?: number | null;
    /** 经验要求多选：命中任意一个即可（取值来自 `fetchJobFacets`）。 */
    expReqs?: string[];
    /** 学历要求多选：同上。 */
    eduReqs?: string[];
    /** 屏蔽这些标注类型的岗位（传出 `excludeFlags`，黑白名单只有这里的类型）。 */
    excludeFlags?: JobFlagType[];
    /** 批次 4：按跨平台去重分组折叠（同一条岗位在多个平台各抓一条时只占一行）。 */
    groupDuplicates?: boolean;
    /**
     * 「只看新增」：只返回**首次见到**时间 ≥ 该 ISO 时刻的岗位。
     * 界面按时间窗（近 24 小时 / 3 天 / 7 天）算好再传，口径与首屏「今日新增」一致。
     */
    firstSeenSince?: string;
    orderBy?: string;
    descending?: boolean;
    page?: number;
    pageSize?: number;
}
//# sourceMappingURL=job.d.ts.map