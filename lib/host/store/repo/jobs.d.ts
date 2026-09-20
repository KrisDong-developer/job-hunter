import type { DatabaseSync } from 'node:sqlite';
import type { JobDto } from '../../../shared/contract/dto/job.js';
import { type JobFlagType, type JobOrderValue, type JobState } from '../../../shared/contract/enums/job.js';
/** 岗位写入/筛选所需的标量字段（活对象已被适配器剥掉，§4.3 P7）。 */
export interface JobUpsertInput {
    platformId: string;
    platformJobId: string;
    title: string;
    companyId: number | null;
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
    jdText?: string | null;
}
/**
 * 算分时"用的是哪一版简历"（§4.1）。
 *
 * 单独立一个类型是因为它必须**跟着分数一起写**：只写分数不写版本，
 * 就没法判断旧分数是否过期 —— 而"展示旧分数误导决策"正是 §4.1 点名的那个坑。
 */
export interface MatchStamp {
    resumeId: number | null;
    rev: number;
}
export interface JobQuery {
    state?: JobState;
    platformId?: string;
    /**
     * 只要这些岗位 id（第五轮，批次 D2 的"导出选中"用）。
     *
     * 走 `IN` 而不是让调用方逐个 `detail()`：一次查询、顺序由 SQL 决定，
     * 也不会因为 N 个 id 变成 N 次查询。
     */
    ids?: number[];
    /** 多城市：命中任意一个即可（`IN` 查询）。 */
    cities?: string[];
    /** 兼容的单城市旧字段（有 `cities` 时以 `cities` 为准）。 */
    city?: string;
    companyId?: number;
    /** 标题模糊匹配（走 LIKE，仅作粗筛）。 */
    keyword?: string;
    /**
     * 经验 / 学历要求：命中任意一个即可（`IN`）。
     *
     * 存的是**平台原始串**（"3-5年"、"本科"），不是枚举 —— 各平台写法不统一，
     * 归一化到一套枚举会丢掉原文里的信息。所以筛选只能按"库里已有的取值"多选，
     * 取值集由 `facets` 给出（界面上是 chips，不是输入框）。
     */
    expReqs?: string[];
    eduReqs?: string[];
    /** 只要月薪下限 ≥ 该值的岗位。 */
    minSalaryAtLeast?: number;
    /**
     * 只要匹配分 ≥ 该值的岗位（第五轮，批次 A）。
     *
     * 注意两点口径：
     *   * 比的是**库里存着的那个分**，它可能是**用旧版简历**算出来的
     *     （是否过期由领域层按 `score_rev` / `score_resume_id` 判定，SQL 层不参与）；
     *   * 未打分的岗位（`match_score IS NULL`）**不满足** `>= N`，因此会被排除 ——
     *     这是有意的：没有分就没法参与"按分挑岗位"，悄悄放进来等于让用户
     *     对着一批无法判断的条目做取舍。
     */
    minMatchScore?: number;
    /**
     * 排除**已拉黑公司**的岗位（第五轮，批次 B）。
     *
     * 默认 **false**（不加条件）：拉黑是人工标记，"把人家的岗位藏起来"必须由调用方
     * 显式要求 —— 静默隐藏数据比不隐藏更危险。界面上的「排除已拉黑公司」默认开着，
     * 并在列表头栏写明因此隐藏了几条，用户看得见也关得掉。
     */
    excludeBlacklistedCompanies?: boolean;
    /**
     * 只要**首次见到**时间 ≥ 该时刻（ISO）的岗位 —— 即「只看新增」。
     *
     * 口径刻意与 U0 的「今日新增」（`countSince`：`first_seen_at >= ?`）**完全一致**：
     * 同一列、同一个比较符。两边若各写一套，首屏说"今日新增 12 条"而列表筛出 3 条，
     * 用户只会认为其中一个坏了 —— 而它们看的是同一份数据。
     *
     * ⚠️ 比的是 `first_seen_at` 而不是 `crawled_at` / `last_seen_at`：
     * 后两者每轮都刷新，用它筛出来的永远等于"本轮抓到的全部"，那叫"这次抓了多少"，
     * 不叫"新出现了多少岗位"。
     */
    firstSeenSince?: string;
    /** 排序字段。取值域见 `JOB_ORDER_VALUES`（与路由校验、界面下拉同一份）。 */
    orderBy?: JobOrderValue;
    descending?: boolean;
    /**
     * 屏蔽这些标注类型的岗位：命中任意一个标注的岗位一律不显示（`NOT EXISTS`）。
     * 「一键屏蔽疑似外包/高风险」落在这里 —— 风险标签是已算好的事实，屏蔽是查询层的事。
     */
    excludeFlagTypes?: JobFlagType[];
    /**
     * **按跨平台去重分组折叠**（批次 4）。
     *
     * 同一条岗位在 4 个平台各抓一条时，列表里只留一行，而不是让用户在一屏里
     * 看到四条几乎一样的卡片。**留哪一条跟着排序键走**（第五轮，批次 A3）：
     * 组内代表 = 这一组在当前排序下会排最前的那条（例如"按匹配分"就留分最高的），
     * 详见 `buildWhere`。
     *
     * `total` 与分页也按**折叠后**的数量算（`countMatching` 走同一段 WHERE）——
     * 否则"共 40 条 / 只有 12 行"会变成一个新谜题。
     */
    groupDuplicates?: boolean;
}
export interface JobRepo {
    /** 幂等写入：按 `(platform_id, platform_job_id)` upsert，重复跑不产生重复数据（§6.1）。 */
    upsert(input: JobUpsertInput, now: string): {
        id: number;
        outcome: 'inserted' | 'updated';
    };
    query(filters?: JobQuery, limit?: number, offset?: number): JobDto[];
    detail(id: number): JobDto | undefined;
    mark(id: number, state: JobState): boolean;
    /** 读 JD 正文（列表页拿不到，P2+ 的详情页才有）。 */
    jdText(id: number): string | null;
    /**
     * 写 JD 正文（P2 详情补抓）。
     *
     * **只在非空时覆盖**：详情页锚点腐烂时解析结果为空，那次不该把已有的 JD 抹掉。
     * 空串/纯空白一律忽略并返回 false（调用方据此统计"这一轮真的补到了几条"）。
     */
    setJdText(id: number, text: string): boolean;
    /** 写匹配分与**逐条理由**（§4.5.1：分数必须可解释）。 */
    setMatch(id: number, score: number, reasons: unknown, stamp?: MatchStamp | undefined): void;
    /** 读回匹配理由。 */
    matchReasons(id: number): Array<{
        kind: string;
        text: string;
        weight: number;
    }>;
    count(): number;
    /** 与 `query` 用同一套 WHERE 的计数（分页 total 用）。 */
    countMatching(filters?: JobQuery): number;
    /**
     * 分数**已过期**的岗位 id（第五轮，批次 A2）。
     *
     * "过期" = 有分（`match_score IS NOT NULL`）但算分时记下的简历版本与**当前启用简历**
     * 不一致。判定条件与领域层 `decorate()` 里的 `scoreStale` **逐字对齐**
     * （`score_rev` 不等、或 `score_resume_id` 不等，`null` 与 `null` 视为相等）——
     * 两处若各写一套，界面说"本页 7 条已过期"而重算只算 3 条，用户只会认为其中之一坏了。
     */
    listStaleScoreIds(stamp: MatchStamp, limit: number): number[];
    /** 同上，只要条数（用于"还剩多少条要重算"）。 */
    countStaleScores(stamp: MatchStamp): number;
    /** 首次见到时间 ≥ 该时刻的岗位数（U0 的「今日新增」）。 */
    countSince(iso: string): number;
    countByState(): Record<string, number>;
    latest(limit?: number): JobDto[];
    /** 出去重后的城市列表（界面多选城市用；空城市不返回）。 */
    listCities(): string[];
    /** 去重后的经验要求取值（界面多选 chips 用；空值不返回）。 */
    listExpReqs(): string[];
    /** 去重后的学历要求取值（同上）。 */
    listEduReqs(): string[];
}
export declare function createJobRepo(db: DatabaseSync): JobRepo;
//# sourceMappingURL=jobs.d.ts.map