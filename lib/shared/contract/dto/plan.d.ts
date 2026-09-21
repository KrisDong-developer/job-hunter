import type { RecentRunDto } from './crawl.js';
import type { FreshnessDto } from './job.js';
import type { SkipReason } from '../enums/plan.js';
/**
 * plan 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
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
     * 多关键词（逐个采集）：第 1 个抓完它的页数 → 第 2 个 → …，每个关键词
     * 一条独立的 `crawl_run`。空数组 = 用 `criteria.keyword`（单关键词，老形态），
     * 两者都没有 = 不按关键词筛。
     *
     * 为什么是方案级字段而不是 `criteria.keywords`：criteria 的形状是
     * `Record<string, string>`（适配器按单值拼 URL），塞数组会波及全部适配器与
     * 校验；展开成"每次抓取一个 keyword"是**调度层**的事 —— 字段放方案级，
     * 展开点唯一（`keywordsOfPlan`），适配器零改动。
     */
    keywords: string[];
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
/** 方案写入体。**只有显式给出的键**才会被发出去 —— 缺的键由宿主沿用现值。 */
export interface PlanWriteInput {
    name?: string;
    platforms?: string[];
    /** 多关键词（逐个采集）。空数组 = 清空（回到单关键词/不限的老形态）。 */
    keywords?: string[];
    /** 每平台的覆盖项（批次 3，稀疏）。`maxPages: null` = 用方案级页数。 */
    platformOverrides?: Record<string, {
        enabled?: boolean;
        maxPages?: number | null;
    }>;
    criteria?: Record<string, string>;
    schedule?: Partial<PlanSchedule>;
    enabled?: boolean;
    postProcess?: Partial<PlanPostProcess>;
}
/**
 * SR-41：一个筛选维度的声明 —— 界面据此渲染筛选器，**不支持的维度禁用而非隐藏**
 * （隐藏会让用户以为功能坏了，§5.5 能力驱动的 UI）。
 *
 * 宿主生产、界面消费，所以声明只此一份：曾经宿主与客户端各写一遍同名同字段的接口。
 */
export interface CriteriaDimensionDto {
    key: string;
    label: string;
    /**
     * 取值域（已选平台的**并集**，按声明顺序）。
     *
     * 每一项带 `platforms`：**哪些已选平台接受这个取值**。多平台下这是必需信息 ——
     * `sort` 在 51job 是 `sortType`、在智联是 `order`，同名的 1 意思完全不同，
     * 界面如果只画一个下拉而不说"这个值只有谁认"，用户就只能靠猜。
     */
    values: Array<{
        value: string;
        label: string;
        platforms: string[];
    }>;
    max: number | null;
    hint: string;
    /** 至少有一个已选平台能填它且**会生效**。false = 界面上不给输入框 + 说明原因。 */
    supported: boolean;
    /** 不支持的原因（`supported === false` 时必有；聚合了各平台自己的解释）。 */
    disabledReason: string | null;
    /** 数值型维度（界面渲染成数字输入而不是下拉）。 */
    numeric: boolean;
    /**
     * 值域是否**开放**（自由文本）。
     *
     * 必须单独回传，不能从 `values` 空不空推：领英的 city 有建议列表但**收任何地名**
     * （`closed: false`），而 hiredchina 的 city 是空表 + 封闭（一个都不收）。
     * 界面据它决定渲染下拉还是可输入的框 —— 之前靠"values 非空 = 下拉"，
     * 于是领英用户**填不了**列表外的城市（如 Hangzhou），而适配器明明说可以。
     */
    open: boolean;
    /** 是否被任一已选平台声明过。false = 谁都没有这个筛选（与"声明了但不可用"不同）。 */
    declared: boolean;
    /**
     * 每个已选平台对这个维度的态度。
     *
     * `declared` = 这个平台**声明过**它（`false` = 平台侧没有这个筛选参数）；
     * `supported` = 用户能填进去一个它接受的值（声明了但一个取值都不收时为 `false`）；
     * `note` 是该平台自己写的解释；`wire` 是**它把值落到哪个参数上**
     * （`null` = 不进请求，只是采集深度）。界面据此写出"谁支持、谁不支持、为什么、
     * 落到哪个参数"——`sort` 在 51job 是 `sortType`、在智联是 `order`，就是这样看出来的。
     */
    platforms: Array<{
        id: string;
        declared: boolean;
        supported: boolean;
        note: string | null;
        wire: {
            target: 'url' | 'body';
            param: string | null;
        } | null;
    }>;
    /**
     * 这个维度**会进请求**吗（取各平台声明里的第一份；逐平台的参数名看上面的 `platforms`）。
     *
     * `null` = 采集深度旋钮（页数上限 / 加载轮数）：它不改请求，只改采集循环跑几轮。
     * 界面必须把这两种分开说 —— 否则"页数上限 5"看起来和筛选条件一样，用户会以为没生效。
     */
    wire: {
        target: 'url' | 'body';
        param: string | null;
    } | null;
    /**
     * ≥2 个已选平台声明了它、但**取值含义不同**（各自的值域/封闭性不一样）。
     *
     * 典型：`type` 在神仙外企是"外企/不限"，在 HiredChina 是 Marketing/Teaching…；
     * `sort` 在 51job 是四档 sortType、在智联只有 `order=4`。方案级只能存一个值，
     * 所以界面必须显式警告，而不是画一个"看起来共享"的下拉。
     */
    conflict: boolean;
    /** 冲突的可读说明（`conflict === true` 时必有）。 */
    conflictNote: string | null;
}
export interface CriteriaDimensionsDto {
    items: CriteriaDimensionDto[];
    platforms: string[];
    available: Array<{
        id: string;
        displayName: string;
    }>;
}
/** SR-43：重复提示（只提示，不合并）。 */
export interface PlanDuplicateDto {
    planId: number;
    name: string;
    reason: string;
}
/**
 * 一条"这份条件对这个平台**实际会请求什么**"的干跑结果（`POST /criteria/preview`）。
 *
 * `request === null` 不是"没有条件"，而是**这一轮这个平台会被跳过**（例如城市码未配置）——
 * `error` 里就是原因。两者在界面上必须长得不一样。
 */
export interface CriteriaPreviewDto {
    platformId: string;
    displayName: string;
    request: {
        url: string;
        method: 'GET' | 'POST';
        /** 真实参数：GET 的 query，或 POST 的请求体字段（键名都是平台自己的）。 */
        params: Record<string, string>;
        body?: string;
        /** 声明了但**不进请求**的维度（采集深度旋钮）——界面要与筛选条件分开说。 */
        crawlOnly: string[];
    } | null;
    error: string | null;
}
/** SR-45：校验结果。界面保存前先问一次，与工具/HTTP 是同一份校验。 */
export interface PlanValidationDto {
    name: string;
    platforms: string[];
    criteria: Record<string, string>;
    schedule: PlanSchedule;
    enabled: boolean;
    postProcess: PlanPostProcess;
    duplicates: PlanDuplicateDto[];
    /** 非致命但必须让用户知道的事（多平台：城市不支持 / 平台未校准 / 深度被截断）。 */
    notices: string[];
    dimensions: CriteriaDimensionDto[];
}
//# sourceMappingURL=plan.d.ts.map