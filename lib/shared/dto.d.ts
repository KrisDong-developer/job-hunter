/**
 * 对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { ApplicationChannel, ApplicationStage, AssessmentKind, AssessmentState, AuthRequirementValue, CampusBatch, CampusStage, ContactStage, CoreField, CoverLetterLanguage, CrawlState, HealthState, InterviewKind, InterviewState, JobFlagType, JobState, MaturityLevel, MessageDirection, StageSource, TripartiteState, VisaStance } from './enums.js';
/** 一条岗位（列表与详情共用；`jd_text` 只在详情里出现）。 */
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
}
/** `/health` 的响应体（客户端与诊断共用）。 */
export interface HealthDto {
    ok: boolean;
    name: string;
    version: string;
    phase: string;
    routePrefix: string;
    hostUptimeMs: number;
    /** P1：数据层是否已就绪。sqlite 打不开时这里会是 false，而不是整个插件不挂载。 */
    dataReady: boolean;
    /** 数据文件路径（便于诊断“我的数据在哪”）。 */
    dataPath: string | null;
    jobCount: number;
    companyCount: number;
    pendingRepairCount: number;
    lastCrawl: CrawlRunDto | null;
    adapters: AdapterHealthDto[];
    /** 打不开数据库时的可读原因。 */
    dataError: string | null;
    /**
     * P5：是否处于**离线模式**（`DSH_JOB_HUNTER_NO_NETWORK=1`）。
     *
     * 界面必须把这件事显式说出来 —— 否则"点了抓取没反应"会看起来像 bug，
     * 而实际上那是为「自动化测试绝不访问真实招聘站」而设的开关。
     */
    offline: boolean;
    /**
     * P5：模型工具的注册结果。
     *
     * 暴露它是为了"工具静默少了一个"这类问题能被一眼看到 ——
     * 实测就是靠它发现插件版 `job_list` 与宿主自带的同名工具撞车、压根没注册上。
     */
    tools: {
        registered: string[];
        failed: Array<{
            name: string;
            reason: string;
        }>;
        conflicts: string[];
    } | null;
}
/** 一次抓取的运行记录（§7 `crawl_run`）。 */
export interface CrawlRunDto {
    id: number;
    platformId: string;
    planId: number | null;
    startedAt: string;
    endedAt: string | null;
    state: CrawlState;
    pages: number;
    found: number;
    inserted: number;
    updated: number;
    skipped: number;
    quarantined: number;
    errorCode: string | null;
    errorMsg: string | null;
    /** SR-28/29：触发原因（schedule / manual / catch-up）。 */
    reason: string | null;
    /** SR-17/29：跳过原因（枚举键）。只有"到点了但没跑"才写。 */
    skipReason: string | null;
}
/** 一个适配器的健康快照（§4.2.3 + §4.2.4 的逐字段计数）。 */
export interface AdapterHealthDto {
    platformId: string;
    health: HealthState;
    failStreak: number;
    lastOkAt: string | null;
    /** 每个核心字段的连续缺失次数与命中统计。 */
    fields: FieldHealthDto[];
    /** 处于降级/失效时的可读原因。 */
    reason: string | null;
}
export interface FieldHealthDto {
    field: CoreField;
    consecutiveMiss: number;
    missTotal: number;
    hitTotal: number;
    lastMissAt: string | null;
    lastHitAt: string | null;
}
/** 一次抓取的执行结果摘要（`crawl:fixture` 与后续 HTTP 路由共用）。 */
export interface CrawlSummaryDto {
    run: CrawlRunDto;
    /** 被字段断言拦下、进了 `pending_repair` 的记录数。 */
    quarantined: number;
    /** 本次各核心字段的命中情况（是否整页都缺该字段）。 */
    fieldPresence: Array<{
        field: CoreField;
        records: number;
        present: number;
    }>;
    /** 本次是否触发了降级（含原因）。 */
    degraded: {
        platformId: string;
        reasons: string[];
    } | null;
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
/** 一条待办。 */
export interface TodoDto {
    id: number;
    kind: string;
    level: string;
    title: string;
    ref: string | null;
    detail: unknown;
    createdAt: string;
}
/**
 * U0 今日（`GET /today`）—— 首屏要回答「今天干什么」。
 *
 * 只放**现在真有数据**的东西。待跟进 / 面试 / 额度要等 P7 与 guard（P5），
 * 这里不放假字段 —— 界面上显示一个恒为 0 的「待跟进」比不显示更糟。
 */
export interface TodayDto {
    generatedAt: string;
    dataReady: boolean;
    dataError: string | null;
    /** 岗位总数与按处置态分布。 */
    jobCount: number;
    byState: Record<string, number>;
    /** 最近 24 小时首次见到的岗位数。 */
    newJobs24h: number;
    /** 未关闭的待办。 */
    todos: TodoDto[];
    /** 被字段断言拦下、等着重放的记录数。 */
    pendingRepair: number;
    adapters: AdapterHealthDto[];
    lastCrawl: CrawlRunDto | null;
    /** P5：离线模式（见 `HealthDto.offline`）。 */
    offline: boolean;
}
/** `GET /crawl/status`。 */
export interface CrawlStatusDto {
    /** 是否有抓取正在跑。 */
    busy: boolean;
    /** 被降级/失效暂停写入的平台。 */
    paused: string[];
    adapters: AdapterHealthDto[];
    recentRuns: CrawlRunDto[];
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
 * 搜索方案的定时配置 —— **偏好时段，不是单点时刻**（D-19 / SR-1 / SR-32）。
 *
 * 为什么不是 `hour: 9, minute: 30`：固定时刻 + 每天同一分钟是最容易被识别的模式
 * （R18 / D-17）。所以配置的是一段窗口，窗口内**随机**选点，窗口内最多跑一次。
 *
 * **SR-32 是硬约束**：配置项里**不提供**"精确到分钟的单点时刻"。
 * 下面的 `windowStartMinute` / `windowEndMinute` 是窗口边界的分钟分量（默认 0），
 * 不是触发分钟 —— 触发点在窗口内部由 `scheduler/schedule.ts` 派生。
 *
 * 时间一律是**本地墙钟**（SR-5：时区跟着人走）。
 */
export interface PlanSchedule {
    enabled: boolean;
    /** 窗口起点：本地时，0-23。 */
    windowStartHour: number;
    /** 窗口起点的分钟分量，0-59（默认 0）。 */
    windowStartMinute: number;
    /** 窗口终点：本地时，0-23。终点 ≤ 起点表示跨零点。 */
    windowEndHour: number;
    /** 窗口终点的分钟分量，0-59（默认 0）。 */
    windowEndMinute: number;
    /** 0=周日 … 6=周六。空数组视为每天。 */
    weekdays: number[];
    /**
     * 窗口内的最小随机间隔（ms）——避免窗口内连着跑两次。
     * 默认等于窗口长度的大约 1/3；它不是"抖动上限"，抖动由窗口本身承担。
     */
    jitterMs: number;
    /** 错过多久之内还算「今天该跑的」，超出就走补跑询问（C9）。 */
    missedGraceMs: number;
}
/**
 * 方案里**单个平台的覆盖项**（批次 3 数据模型侧）。
 *
 * 只解决两件方案级表达不了的事：
 *   * **临时停掉一个平台**：以前只能把它从 `platforms` 里删掉 —— 于是丢了
 *     "这个方案本来就包含它"的意图，重复方案的判定也跟着变；
 *   * **每平台各自的抓取深度**：`maxPages` 是方案级单值，而平台真实上限差得很远
 *     （waiqi 服务端翻页坏 → 1 页，zhaopin → 10 页）。以前"设 5 页"在 waiqi 上
 *     被**静默截断**成 1 页。
 *
 * ⚠️ **稀疏存储**：只有用户真的改过的平台才有条目。默认值（启用 / 用方案级页数）
 * 不落库 —— 于是"什么都没配"的方案在库里的形状与升级前完全一致。
 */
export interface PlanPlatformOverrideDto {
    /** 在这个方案里是否抓这个平台。默认 `true`。 */
    enabled: boolean;
    /** 该平台的抓取页数上限（覆盖方案级 `maxPages`）。`null` = 用方案级。 */
    maxPages: number | null;
}
export interface PlanDto {
    id: number;
    name: string;
    platforms: string[];
    /**
     * 每平台的覆盖项（**稀疏**：只含用户改过的平台，且只会出现 `platforms` 里的 id）。
     *
     * 为什么不把 `platforms` 直接变成对象数组：它是**集合与顺序**（多处按它遍历），
     * 而覆盖项是**按 id 查的稀疏表**。两者访问方式不同，混在一起只会让每处遍历多一层解包。
     */
    platformOverrides: Record<string, PlanPlatformOverrideDto>;
    /** 平台无关的搜索条件，交给适配器的 `buildSearchUrl`。 */
    criteria: Record<string, string>;
    schedule: PlanSchedule;
    enabled: boolean;
    /**
     * SR-7：**尝试**时刻（失败也推进）。
     *
     * 与 `lastSuccessAt` 拆开是必需的：只有分开才能回答"我试过了但没成功"
     * 与"我最后真的拿到数据是什么时候"这两个不同的问题。
     */
    lastAttemptAt: string | null;
    /** SR-7：**成功**时刻（只有 `state='ok'` 才推进）。新鲜度看它。 */
    lastSuccessAt: string | null;
    /** 兼容字段 = `lastSuccessAt`（旧界面与旧断言读它）。 */
    lastRunAt: string | null;
    nextRunAt: string | null;
    /** SR-5：写入时的时间区快照（如 `Asia/Shanghai`）——时区跟着人走，不是推算 UTC。 */
    timezone: string;
    /** SR-44：抓取后处理开关（打分 / 标注 / 去重），默认全开。 */
    postProcess: PlanPostProcess;
    createdAt: string;
}
/** SR-44：抓取后处理开关。关掉打分后不再写 `match_score`。 */
export interface PlanPostProcess {
    /** 情报引擎打分 + 标注（纯规则、零外部调用）。 */
    score: boolean;
    /** 风险/黑话标注。 */
    flag: boolean;
    /** 跨平台去重分组。 */
    dedup: boolean;
}
/** SR-8：三级新鲜度。 */
export type FreshnessLevel = 'fresh' | 'stale' | 'cold';
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
/**
 * SR-17：跳过原因枚举。**界面显示人话，不显示这个英文键**。
 *
 * 枚举而不是自由文本：自由文本最后一定会退化成"已武装"这种什么都没说的话，
 * 而"为什么没跑"恰恰是用户最需要知道的。
 */
export declare const SKIP_REASONS: readonly ["not_logged_in", "adapter_broken", "risk_paused", "lease_lost", "offline_gate", "outside_window", "quota_reached", "another_run_active", "backoff", "global_pause", "plan_disabled", "round_budget"];
export type SkipReason = (typeof SKIP_REASONS)[number];
/**
 * 一次触发尝试的结论（SR-16/17/18/26）。
 *
 * `decision` 只有三种，刻意不给第四种：
 *   * `ran` 真的跑了；
 *   * `skipped` 到点了但没跑，**必须**带原因；
 *   * `waiting` 还没到点（这不是"没跑"，不该产生告警）。
 */
export interface TriggerDecisionDto {
    decision: 'ran' | 'skipped' | 'waiting';
    reason: SkipReason | null;
    /** 人话原因，直接展示。 */
    message: string | null;
    at: string;
}
/**
 * 一个平台某一次的判定结果（SR-18）。
 *
 * 为什么必须**按平台**回传：同一个方案里，猎聘可能未登录、51job 在冷却、
 * 智联正常跑了 —— 只给一个方案级原因就是在丢信息，
 * 而"哪个平台为什么没跑"恰恰是用户要看的。
 */
export interface PlatformTriggerDecisionDto {
    platformId: string;
    /** null = 该平台还没被判定过（例如刚建好方案、还没到点）。 */
    decision: TriggerDecisionDto | null;
}
/**
 * 一个方案的调度状态（SR-26/28）。
 *
 * `lastDecision` 是"为什么没跑"的载体：只报 `armed: true` 等于什么都没说 ——
 * 未登录的平台也会 `armed`，然后每天安静地什么都不做。
 *
 * 多平台之后它只承担"一句话概览"；**逐平台**的结论在 `platformDecisions`。
 */
export interface PlanScheduleStatusDto {
    planId: number;
    name: string;
    enabled: boolean;
    freshness: FreshnessDto;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    nextRunAt: string | null;
    lastDecision: TriggerDecisionDto | null;
    /** SR-18：逐平台判定（顺序与 `plan.platforms` 一致）。 */
    platformDecisions: PlatformTriggerDecisionDto[];
    /** SR-20：当前退避到什么时候（null = 没在退避）。 */
    backoffUntil: string | null;
    /** SR-7/23：方案级连续失败次数（推进方案退避）。 */
    failStreak: number;
    /**
     * SR-21/22：**派生值** —— 该方案下所有平台都被风控暂停。
     *
     * 不再是独立存储的一份状态：风控暂停的真值在平台级
     * （`platform/risk-pause.ts`），方案级存一份必然与它漂移。
     */
    riskPaused: boolean;
    /** 风控暂停的可读原因（含是哪几个平台）。 */
    riskReason: string | null;
}
/**
 * 一个方案的**定时信息**（供界面本地化渲染）。
 *
 * 为什么要单独回传这些而不是只给 `nextRunAt`：界面要写
 * 「下次运行 明天 09:37（含 4 分钟抖动）」，那需要窗口起点 + 抖动 + 时区三样东西一起算。
 * 只给一个时间戳的话，界面只能原样打印 —— 那正是 A1 要修的 bug。
 *
 * 计算放在 **host**（`scheduler/schedule.ts` 是唯一的实现），
 * 界面只做格式化，不重算触发点。两边各算一次必然漂移。
 */
export interface WeeklyTriggerDto {
    planId: number;
    planName: string;
    nextRunAt: string;
    /** 这个触发点所属窗口的起点（本地墙钟语义，按 `timezone` 解释）。 */
    windowStartAt: string;
    windowStartHour: number;
    windowStartMinute: number;
    windowEndHour: number;
    windowEndMinute: number;
    weekdays: number[];
    /** A1：当前生效的抖动上限（ms）——界面据此写"含 N 分钟抖动"。 */
    jitterMs: number;
    /** SR-5：写入时的时间区快照。 */
    timezone: string;
}
/** `GET /scheduler/status` 的一次运行摘要（SR-28 的小表）。 */
export interface RecentRunDto extends CrawlRunDto {
    /** 触发原因：定时 / 人工 / 补跑。 */
    reason: string | null;
    /** 跳过原因（没真跑时才有）。 */
    skipReason: string | null;
}
/** 调度器当前状态（`GET /scheduler/status`）。 */
export interface SchedulerStatusDto {
    /** 是否在按计划自动跑。 */
    scheduling: boolean;
    /** 单实例租约没拿到时为 true：本实例只读，不调度也不开浏览器（R20）。 */
    readOnly: boolean;
    readOnlyReason: string | null;
    /** 定时器是否已武装，以及下一次触发时刻。 */
    armed: boolean;
    nextRunAt: string | null;
    lastRunAt: string | null;
    running: boolean;
    plans: PlanDto[];
    lease: LeaseStatusDto;
    /** SR-5/27：宿主进程的时区（本地时间按它解释）。 */
    timezone: string;
    /** A1：当前生效的抖动上限（ms）——界面必须说明"下次运行含抖动"。 */
    jitterMs: number;
    /** B3/SR-30：全局一键暂停。**只停定时**，手动永远可用。 */
    paused: boolean;
    /** B3：停定时时的原因（人话）。 */
    pausedReason: string | null;
    /** SR-8/26：逐方案的调度状态与"为什么没跑"。 */
    planStatus: PlanScheduleStatusDto[];
    /** A1：逐方案的定时信息（本地化渲染用）。 */
    triggers: WeeklyTriggerDto[];
    /** SR-28：最近几次运行（时间/状态/新增/失败原因/触发原因）。 */
    recentRuns: RecentRunDto[];
    /** C2/SR-2：当前是否建议用户手动刷新一次（stale/cold 且没到下一个窗口）。 */
    refreshSuggested: boolean;
    /** C2：建议刷新的原因（人话）。 */
    refreshHint: string | null;
}
/** 单实例租约状态。 */
export interface LeaseStatusDto {
    path: string;
    held: boolean;
    /** 租约文件里记的 pid；不是本进程时说明另一实例在跑。 */
    pid: number | null;
    heartbeatAt: string | null;
    startedAt: string | null;
    stale: boolean;
}
/** 一个平台的账号/登录态（`account_state`）。 */
export interface AccountStateDto {
    platformId: string;
    loggedIn: boolean;
    hiddenFromCurrentEmployer: boolean | null;
    lastCheckAt: string | null;
    hint: string | null;
    updatedAt: string | null;
}
/** `GET /login/status`。 */
export interface LoginStatusDto {
    platformId: string;
    state: 'idle' | 'running' | 'succeeded' | 'failed';
    message: string | null;
    startedAt: string | null;
    account: AccountStateDto;
}
/**
 * 打招呼话术草稿（§22.2 `greeting_draft`）。
 *
 * `via` 必须如实回传：模型不可用时给的是模板话术，界面上不能标成"AI 生成"（J10）。
 */
export interface GreetingDraftDto {
    jobId: number;
    text: string;
    /** `llm` = 模型生成；`template` = 内置模板降级。 */
    via: 'llm' | 'template';
    /** 为什么降级、屏蔽了哪些字段 —— 直接展示给用户，不藏着。 */
    notes: string[];
    /** 本次**实际外发**给模型的字段清单（I5 知情同意）。 */
    outboundFields: string[];
    /** `llm_call` 留痕 id；降级未调用模型时为 null。 */
    callId: number | null;
}
/**
 * 一次状态变更（`stage_event`）。
 *
 * 它是这一层最重要的东西：`application.stage` 只是"现在在哪",
 * 而这张表回答「**谁、什么时候、凭什么**把它改成那里的」。
 */
export interface StageEventDto {
    id: number;
    entity: string;
    entityId: number;
    fromStage: string | null;
    toStage: string;
    at: string;
    /** `auto` = 自动识别 / `manual` = 人工 / `model` = 模型发起。 */
    source: StageSource;
    evidenceRef: string | null;
    note: string | null;
}
/** 一条投递记录（§11.3 `Application`）。 */
export interface ApplicationDto {
    id: number;
    jobId: number | null;
    jobTitle: string | null;
    companyName: string | null;
    /** **用了哪一版简历** —— 归因分析必需（§11.3 / R6）。 */
    resumeId: number | null;
    resumeFileId: number | null;
    channel: ApplicationChannel;
    sentAt: string;
    stage: ApplicationStage;
    stageAt: string;
    actor: string;
    note: string | null;
    events: StageEventDto[];
}
export interface BoardCardDto {
    applicationId: number;
    jobId: number;
    jobTitle: string | null;
    companyName: string | null;
    channel: ApplicationChannel;
    stage: ApplicationStage;
    stageAt: string;
    sentAt: string;
    resumeId: number | null;
    /** 卡在当前阶段多少天 —— 看板上"该催谁"靠它。 */
    daysSinceStage: number;
}
/** `GET /board`：U5 看板（按 §12.1 的阶段分列）。 */
export interface BoardDto {
    generatedAt: string;
    columns: Array<{
        stage: ApplicationStage;
        cards: BoardCardDto[];
    }>;
    total: number;
    /** 卡在中间阶段超过阈值的天数 —— 界面上要显眼。 */
    staleCount: number;
}
/** 一条往来消息（§11.3 `Message`）。 */
export interface MessageDto {
    id: number;
    platformId: string;
    conversationId: string;
    direction: MessageDirection;
    content: string;
    at: string;
    attachmentRef: string | null;
    jobId: number | null;
    jobTitle: string | null;
    companyName: string | null;
    readAt: string | null;
    /**
     * 规则识别出的面试邀约信号（§13 U6「识别面试邀约」）。
     * **只作为"建议"**：识别到不等于改状态，改状态是另一次显式动作。
     */
    inviteSignal: {
        hit: boolean;
        keywords: string[];
    } | null;
}
/** `GET /inbox`。 */
export interface InboxDto {
    items: MessageDto[];
    unread: number;
    total: number;
}
/**
 * 从 HR 消息里抽出的面试安排建议（消息中心的「一键进日程」）。
 *
 * **只识别、不写库**：这条只是"HR 可能约了这些"的建议，用户确认后才真正创建面试。
 * 识别不到某个维度就给 null —— 给假的比给空的更糟。
 */
export interface InterviewSuggestionDto {
    messageId: number;
    /** 能从消息关联到岗位就给；没有则 null（面试仍可无岗位创建）。 */
    jobId: number | null;
    /** 识别出的面试时间（ISO）；识别不到为 null。 */
    at: string | null;
    kind: InterviewKind | null;
    place: string | null;
    link: string | null;
    /** llm = 模型识别；fallback = 规则降级。 */
    via: 'llm' | 'fallback';
    /** 降级/脱敏等说明，界面如实展示。 */
    notes: string[];
}
/**
 * 一段「回复草稿」（消息中心的情境拟稿）。
 *
 * 与发送做了明显区分：这是**草稿**，真正发出去要用户确认并走闸门 —— 生成绝不等于发送。
 */
export interface ReplyDraftDto {
    messageId: number;
    /** 拟好的回复正文。 */
    text: string;
    scenario: string;
    /** llm = 模型拟稿；fallback = 内置模板降级。 */
    via: 'llm' | 'fallback';
    /** 降级/脱敏等说明。 */
    notes: string[];
}
/** 一条打招呼记录（接触态的载体）。 */
export interface GreetingDto {
    id: number;
    jobId: number | null;
    jobTitle: string | null;
    platformId: string;
    templateId: number | null;
    content: string;
    sentAt: string;
    channel: ApplicationChannel;
    actor: string;
    stage: ContactStage;
    stageAt: string;
    repliedAt: string | null;
}
/** 跟进建议（**建议**，不是状态 —— 超时由时间推导，写进状态会让状态机被时间污染）。 */
export interface FollowUpDto {
    jobId: number;
    jobTitle: string | null;
    companyName: string | null;
    stage: ContactStage;
    idleHours: number;
    kind: 'unread-timeout' | 'read-no-reply' | 'no-progress';
    message: string;
    advice: string;
}
/** 一场面试（§11.3 `Interview` / §12.6 状态）。 */
export interface InterviewDto {
    id: number;
    applicationId: number | null;
    jobId: number | null;
    jobTitle: string | null;
    companyName: string | null;
    round: number;
    at: string;
    tz: string;
    place: string | null;
    link: string | null;
    contact: string | null;
    kind: InterviewKind;
    state: InterviewState;
    commuteMin: number | null;
    review: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
    /** 与其它面试撞车（同一时间窗内）。 */
    conflicts: number[];
    /** 距现在还有多久（小时，负数表示已过）。 */
    hoursUntil: number;
}
/** `GET /interviews/conflicts`。 */
export interface InterviewConflictDto {
    a: number;
    b: number;
    atA: string;
    atB: string;
    /** 重叠分钟数。 */
    overlapMin: number;
    reason: string;
}
/** 面试准备包（`interview_prep` 工具与 U7 用）。 */
export interface InterviewPrepDto {
    interviewId: number;
    jobId: number | null;
    jobTitle: string | null;
    companyName: string | null;
    /** 岗位要求里的技能 vs 简历里有的技能 —— 差距一目了然。 */
    matchedSkills: string[];
    missingSkills: string[];
    /** 公司画像里的风险标注（外包/诈骗/僵尸）。 */
    companyFlags: string[];
    /** 之前记过的错题，按出现次数排。 */
    questionNotes: Array<{
        id: number;
        question: string;
        times: number;
        topic: string;
    }>;
    /** 通勤提示（仅现场面试才有意义）。 */
    commute: {
        kind: InterviewKind;
        minutes: number | null;
        advice: string;
    };
    checklist: string[];
    notes: string[];
}
/**
 * 看板的全局筛选条件（§13 U8）。
 *
 * 有一条**硬约束**必须靠类型与文档记住：`greeting` / `message` / `interview` 三张表
 * **没有 `resume_id`**，所以「简历版本」与「方向」只对**投递链路**成立；
 * 接触段（打招呼/送达/已读/回复）对这两个条件**不生效**，服务层会显式忽略并在 note 里说明
 * —— 一刀切地套上去会让接触段静默变成 0，看起来像"这版简历没人理"，那是假结论。
 */
export interface AnalyticsFilter {
    /** ISO 时间下界（含）。投递链路按 `sent_at`；薪资模块按岗位的 `first_seen_at`。 */
    from?: string;
    /** ISO 时间上界（含）。 */
    to?: string;
    /** 只作用于投递链路的简历版本。 */
    resumeId?: number;
    /** 简历里填的方向（展示层用它当岗位关键词用）。只作用于投递链路。 */
    direction?: string;
    /** 岗位城市：这三张表都没有城市列，要 JOIN `job`。 */
    city?: string;
    /** 岗位标题关键词，同样是 JOIN `job`。 */
    keyword?: string;
}
/** 漏斗的一层。 */
export interface FunnelStepDto {
    key: string;
    label: string;
    count: number;
    /**
     * 相对上一层的转化率（0-1）；`null` 表示**这一层不能算转化率**。
     *
     * 两种 `null`：
     *   1. 第一层（没有上一层）；
     *   2. 上一层的**总体不同** —— 接触漏斗（打招呼/送达/已读/回复）与投递漏斗
     *      （投递/面试/Offer）是两个不同的总体，用"投递数 ÷ 回复数"会算出 >100% 的转化率。
     *      一个能算出 120% 的转化率会让人不再信任整张图。
     */
    rate: number | null;
    /** 这一层属于哪个总体。画图时在总体切换处画一条分隔线。 */
    population: 'contact' | 'application';
}
/** `GET /analytics/funnel`：投递漏斗（§13 U8）。 */
export interface FunnelDto {
    steps: FunnelStepDto[];
    /** 样本量太小时必须显式说出来，否则百分比会骗人。 */
    sampleSize: number;
    note: string;
}
/** 一组归因对比（按渠道 / 按简历版本 / 按平台）。 */
export interface AttributionRowDto {
    key: string;
    label: string;
    total: number;
    replied: number;
    interviewed: number;
    offered: number;
    /** 回复率 / 面试率 / Offer 率（0-1；分母是 total）。 */
    replyRate: number;
    interviewRate: number;
    offerRate: number;
}
export interface AttributionDto {
    byChannel: AttributionRowDto[];
    byResume: AttributionRowDto[];
    sampleSize: number;
    note: string;
}
/** 薪资分位（`job_report` 用）。 */
export interface SalaryBandDto {
    scope: string;
    count: number;
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
}
/**
 * 薪资统计的口径（F1）。
 *
 * **必须显式**：同一个岗位库按"月薪下限"和按"年薪折算"算出来的中位数可以差好几成，
 * 而界面上如果不写清用的是哪一个，那个数字就是在骗人。
 */
export declare const SALARY_BASES: readonly ["monthly_min", "annualized"];
export type SalaryBasis = (typeof SALARY_BASES)[number];
export declare const SALARY_BASIS_LABEL: Record<SalaryBasis, string>;
/**
 * 一个箱线图（F1）。
 *
 * 除了五数概括，还把 **P25–P75 区间**（箱体本身）单独给出来：
 * 界面上要把它高亮，而"高亮哪一段"必须是 host 算好的同一个区间，
 * 不能让前端再算一遍（两边各算一次必然漂移）。
 */
export interface SalaryBoxDto {
    /** 口径标签（含单位），界面直接显示，不再自己拼。 */
    basis: SalaryBasis;
    basisLabel: string;
    count: number;
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
    /** 落进 `[p25, p75]` 的样本数 —— 箱体里装了多少条要有据可查。 */
    withinBox: number;
}
/**
 * `GET /analytics/salary/box`（F1）。
 */
export interface SalaryBoxChartDto {
    box: SalaryBoxDto;
    /** 供界面画刻度的可选口径（同一个方案在另一种口径下的箱体），`null` = 该口径无样本。 */
    alternate: SalaryBoxDto | null;
    note: string;
}
/**
 * `GET /analytics/salary/baseline`（F2）—— **本地基准对比**。
 *
 * 硬约束：基准**只能**来自用户自己抓到的岗位库。
 * 本项目没有服务器、没有行业数据源，编一个"行业基准"就是把假信息画进界面。
 */
export interface SalaryBaselineDto {
    scope: string;
    /** 该城市/关键词下的**全体**岗位分布。 */
    all: SalaryBoxDto;
    /** 用户**投递过**的那些岗位分布（按岗位去重）。 */
    applied: SalaryBoxDto;
    /** 两者中位数之差（投递 − 全体）；任一边没样本时为 null。 */
    medianGap: number | null;
    /** 投递样本是否够下结论（`MIN_SAMPLE`）。不够就**只看分布，不谈高下**。 */
    enoughSample: boolean;
    note: string;
}
/**
 * 简历版本 A/B 对比的一格（F3）。
 *
 * **每格都带样本量**：这是这张表唯一能防住"用 2 条样本画出显著性"的做法。
 */
export interface ResumeCompareCellDto {
    /** 阶段键（已投递 / 已查看 / 面试中 / …）。 */
    stage: string;
    label: string;
    count: number;
    /** count / 该行的总数；分母为 0 时为 null。 */
    rate: number | null;
    /** 这一格是否薄到不该被解读（< `MIN_SAMPLE`）。 */
    thin: boolean;
}
export interface ResumeCompareRowDto {
    resumeId: number | null;
    /** 简历版本名；`null` 表示"没记简历版本的投递"。 */
    label: string;
    total: number;
    cells: ResumeCompareCellDto[];
    /** 该行样本是否足够做对比（`MIN_SAMPLE`）。 */
    enoughSample: boolean;
}
export interface ResumeCompareDto {
    rows: ResumeCompareRowDto[];
    stages: Array<{
        stage: string;
        label: string;
    }>;
    sampleSize: number;
    /** 是否够谈"显著性"。不够时界面必须显式说"别看显著性"。 */
    enoughSample: boolean;
    note: string;
}
/**
 * 简历 A/B 对比的**诚实性**说明（F3）。
 *
 * 写在这里而不是服务里，是为了让界面与工具文案共用同一句话 ——
 * "样本不够就别看显著性"这条规矩必须只有一份。
 */
export declare const RESUME_COMPARE_CAVEAT: string;
/** 一个"不可逆 / 硬截止"节点（§4.L L1/L3/L5）。 */
export interface DeadlineDto {
    kind: 'assessment' | 'apply-close' | 'tripartite';
    refId: number;
    label: string;
    dueAt: string;
    /** 距今多少小时（负数表示已过期）。 */
    hoursLeft: number;
    /** 错过即终态 —— 校招的笔试与三方都属于这一类。 */
    irreversible: boolean;
    /** 24 小时内：进 U0 与待办时必须当 urgent 处理。 */
    urgent: boolean;
    overdue: boolean;
}
export interface AssessmentDto {
    id: number;
    campusApplicationId: number | null;
    platform: string;
    kind: AssessmentKind;
    at: string | null;
    dueAt: string | null;
    durationMin: number | null;
    state: AssessmentState;
    result: string | null;
    createdAt: string;
    updatedAt: string;
    /** 距截止还有多久（负数 = 已过期）；没有截止时间是 null。 */
    hoursLeft: number | null;
}
export interface CampusApplicationDto {
    id: number;
    companyId: number | null;
    companyName: string | null;
    jobId: number | null;
    jobTitle: string | null;
    batch: CampusBatch;
    stage: CampusStage;
    stageAt: string;
    applyOpenAt: string | null;
    applyCloseAt: string | null;
    note: string | null;
    createdAt: string;
    updatedAt: string;
    assessments: AssessmentDto[];
}
export interface TalkSessionDto {
    id: number;
    companyId: number | null;
    companyName: string | null;
    at: string;
    place: string | null;
    online: boolean;
    url: string | null;
    worthGoing: string | null;
    note: string | null;
    createdAt: string;
}
export interface TripartiteDto {
    id: number;
    campusApplicationId: number | null;
    issuedAt: string | null;
    signDeadline: string | null;
    state: TripartiteState;
    penaltySummary: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface VisaRequirementDto {
    id?: number;
    jobId: number;
    stance: VisaStance;
    identityLimit: string | null;
    evidence: string[];
    source: string;
    /** 不确定性说明 —— **识别不出来时必须说清楚**，不能给虚假的确定性。 */
    uncertainty: string | null;
    createdAt: string;
}
/**
 * 面试时间的双重显示（§4.M M3）。
 *
 * 两边都显示而不是只换算一边：只给一个数字用户无从判断对不对，
 * 两边一起给，错的时区会自己露出来。
 */
export interface TimezoneDisplayDto {
    at: string;
    counterpartTz: string;
    localTz: string;
    counterpart: {
        tz: string;
        text: string;
    };
    local: {
        tz: string;
        text: string;
    };
    diffHours: number;
    warning: string | null;
}
export interface CoverLetterDto {
    id: number;
    jobId: number | null;
    resumeId: number | null;
    language: CoverLetterLanguage;
    content: string;
    via: string;
    notes: string[];
    createdAt: string;
}
/**
 * 平台**客观能力**（"这个平台有什么"）。
 *
 * ⚠️ 与 `implementation` 是两件事：这里的 `supportsGreeting: true`
 * 不代表我们能打招呼 —— 后者看 `implementation.actions.sayHello`。
 * 界面上凡是要"点了会真的动"的入口，都必须读 `implementation`。
 */
export interface AdapterCapabilitiesDto {
    searchWithoutLogin: boolean;
    supportsAttachment: boolean;
    supportsReadReceipt: boolean;
    supportsInbox: boolean;
    supportsGreeting: boolean;
    fieldCompleteness: 'high' | 'medium' | 'low';
    antiBot: 'low' | 'medium' | 'high';
}
/**
 * 适配器**实现度**（派生自实现，不手写 —— 手写必然与实际漂移）。
 *
 * 与 `capabilities` 的分工：后者是"这个平台有什么"（平台事实），
 * 这里是"我们实现了哪些方法"。`51job` 的 `capabilities.supportsGreeting` 是
 * `true` 而 `actions` 尚未实现 —— 两个字段各说各的，界面才会撒谎。
 */
export interface AdapterImplementationDto {
    crawl: boolean;
    detail: boolean;
    actions: {
        sayHello: boolean;
        sendResume: boolean;
        readInbox: boolean;
        detectStage: boolean;
    };
    loginCheck: boolean;
}
/** 适配器成熟度（平台事实：验证到什么程度）。 */
export interface AdapterMaturityDto {
    level: MaturityLevel;
    /** 上次真机验证日期（`YYYY-MM-DD`）。null = 未标注/未验证。 */
    verifiedAt: string | null;
    /** 已知缺口或陷阱，直接给人看。 */
    notes?: string;
}
/** 各环节的登录需求（平台事实；`unknown` = 尚未验证，不假装知道）。 */
export interface AuthRequirementDto {
    crawl: AuthRequirementValue;
    detail: AuthRequirementValue;
    actions: AuthRequirementValue;
}
/**
 * 量级快照（批次 5）。
 *
 * 回答的是逐字段健康**回答不了**的问题：字段都好、`state='ok'`，
 * 但条目数比这个平台的常态低了一个数量级。
 */
export interface YieldSnapshotDto {
    /** 历史中位数（只取 `state='ok'` 的轮次）。`null` = 样本不足，不猜。 */
    baseline: number | null;
    /** 用于算基线的样本轮数。 */
    samples: number;
    /** 最近一轮的 `found`。 */
    lastFound: number | null;
    level: 'insufficient' | 'ok' | 'dropped';
}
/** `GET /platforms`：U0/U9 需要的平台概览（健康 + 登录态 + 能力）。 */
export interface PlatformOverviewDto {
    id: string;
    displayName: string;
    enabled: boolean;
    /** 平台客观能力（"这个平台有什么"）。 */
    capabilities: AdapterCapabilitiesDto;
    /** 我们实现到哪一步（派生）。 */
    implementation: AdapterImplementationDto;
    /** 成熟度（平台事实）—— 用户勾平台前就该看到"这个还只是实验性的"。 */
    maturity: AdapterMaturityDto;
    /** 各环节要不要登录（平台事实）。 */
    authRequirement: AuthRequirementDto;
    /** 量级快照（批次 5）：字段都健康、条目数却掉了一个数量级是**另一类**故障。 */
    yield: YieldSnapshotDto;
    health: HealthState;
    healthReason: string | null;
    failStreak: number;
    lastOkAt: string | null;
    account: AccountStateDto;
    fields: FieldHealthDto[];
    /** 登录引导的进行状态。`idle` 表示当前没有在引导。 */
    login: {
        state: LoginStatusDto['state'];
        message: string | null;
    };
    /** 治理事实（批次 5）：跨平台**横向可比**的那几列。 */
    governance: PlatformGovernanceDto;
}
/**
 * 一个平台的治理事实（批次 5 的平台总览矩阵屏）。
 *
 * 为什么单独一组而不是继续往 `PlatformOverviewDto` 上摊平：
 * 上面那些字段回答的是"这个平台**是什么**"（能力/成熟度/登录/健康），
 * 这一组回答的是"它**现在能不能跑、为什么不能**" —— 后者是**时刻**相关的，
 * 会随着冷却、额度、暂停而变。两类东西混在一起，界面上就分不清
 * "这个平台一直需要登录"与"它现在正好在冷却"。
 */
export interface PlatformGovernanceDto {
    /**
     * 现在能不能跑。`null` = 能跑。
     *
     * **复用 `platformGate` 算出来的**，不是另写一套判断 ——
     * 矩阵上写着"可以"，到了点却被门挡住，是比不做矩阵更糟的事。
     */
    blocked: SkipReason | null;
    /** 今天已经自动跑了几轮。 */
    todayRuns: number;
    /** 今天还能自动跑几轮的上限（`DAILY_CRAWL_LIMIT`）。 */
    dailyLimit: number;
    /** 平台级风控暂停（SR-21）。 */
    riskPaused: boolean;
    riskReason: string | null;
    /** 该平台自己的冷却截止（SR-20）。`null` = 没在冷却。 */
    cooldownUntil: string | null;
    /** 最近一轮（含 `aborted` / 失败原因）。`null` = 从没跑过。 */
    lastRun: CrawlRunDto | null;
}
//# sourceMappingURL=dto.d.ts.map