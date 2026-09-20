/**
 * platform 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { CrawlRunDto, FieldHealthDto, YieldSnapshotDto } from './crawl.js';
import type { HealthState } from '../enums/crawl.js';
import type { SkipReason } from '../enums/plan.js';
import type { AuthRequirementValue, MaturityLevel } from '../enums/platform.js';
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
 * `POST /platforms/:id/login/check`：一次「**只检测**、不引导登录」的结果。
 *
 * 与 `LoginStatusDto` 的分工：那个说的是**登录引导流程**走到哪了
 * （`running` / `succeeded` / `failed`），这个说的是"刚刚这一下看到了什么"。
 * 两者不能合并 —— `running` 描述的是"用户正在登录"，
 * 而检测可能发生在根本没有引导的时候。
 */
export interface LoginCheckDto {
    platformId: string;
    /**
     * 检测**过程本身**成功了吗。
     *
     * `false` = 没检测出来（页面打不开 / 适配器抛错）—— 那时 `loggedIn` 没有意义。
     * 「没检测出来」与「确定未登录」必须分得开：前者该提示"再试一次"，
     * 后者才是"去登录"。把两者混成一个 `loggedIn: false`，用户会为一次网络抖动去重登。
     */
    checked: boolean;
    /** 结论：当前页会不会被登录墙挡住。`checked: false` 时恒为 `false`（不作为结论）。 */
    loggedIn: boolean;
    /** 检测时刻（ISO）。 */
    checkedAt: string;
    /** 给人看的一句话：结论或失败原因（界面直接显示，不再加工）。 */
    message: string;
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
        /** 在已有会话里回消息（对方先说话之后）。 */
        reply: boolean;
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
    /**
     * 适配器能翻的最大页数（平台事实）。
     *
     * 为什么它必须在概览里：方案里给某个平台填的页数上限，**是按这个平台的
     * `maxPages` 校验的**（见 `validatePlanConfig`）。界面拿不到这个数，就只能在
     * 用户填完并保存时用一个报错告诉他"最多 N 页" —— 而它本来可以**填之前**就写在
     * 「限制」列里（`guopin`/`waiqi`/`zhipin` 都只有 1 页，不是小概率）。
     */
    maxPages: number;
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
/**
 * 一条**被字段断言拦下**的记录（`pending_repair`）。
 *
 * 为什么这一屏必须存在：字段断言拦下的记录**不进主表**，而 pending 只以
 * 一个数字出现在"今日/设置"里 —— 用户看得到"有 20 条待修复"，却看不到
 * 坏在哪个字段、样本是哪个岗位、什么时候抓的。于是"修选择器"这件事没有入口。
 *
 * ⚠️ **没有**原始 HTML：`crawl.ts` 入队时不带 `rawHtml`（§18：原始页面默认不存），
 * 所以这里**不存在**"离线重放"这种能力 —— 修法是"改选择器覆盖 → 重抓一轮"。
 */
export interface RepairDto {
    id: number;
    platformId: string;
    /** 触发这次隔离的抓取轮次；`null` = 那轮已被清理。 */
    crawlRunId: number | null;
    capturedAt: string;
    /** 缺了哪些核心字段（`title` / `salary_raw` / `company` / `source_url`）。 */
    missingFields: string[];
    /** 当时**已经解析出来**的标量字段（用来判断是"整体解析崩了"还是"只缺一列"）。 */
    raw: Record<string, unknown> | null;
    /** 样本地址；`null` = 连地址那一列也没解析出来。 */
    sourceUrl: string | null;
}
/** `GET /repairs`。 */
export interface RepairListDto {
    items: RepairDto[];
    total: number;
    /** 按平台汇总的待修复条数（平台行上的角标）。 */
    byPlatform: Array<{
        platformId: string;
        count: number;
    }>;
    /**
     * 口径说明必须随响应下发：没有原始 HTML，所以**没有"重放"这个动作**。
     */
    note: string;
}
//# sourceMappingURL=platform.d.ts.map