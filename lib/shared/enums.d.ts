/**
 * 状态机与枚举（§7.0：三套状态机分表承载，**不得合并成单一枚举**）。
 * host 与 client 共享，只放标量字面量。
 */
/** 岗位处置态 —— `job.state`。 */
export declare const JOB_STATES: readonly ["new", "seen", "saved", "ignored", "archived"];
export type JobState = (typeof JOB_STATES)[number];
/** 抓取运行态 —— `crawl_run.state`。 */
/** 抓取运行态 —— `crawl_run.state`。 */
export declare const CRAWL_STATES: readonly ["queued", "running", "ok", "partial", "failed", "aborted"];
export type CrawlState = (typeof CRAWL_STATES)[number];
/**
 * 运行态的中文标签。**界面上一律用这一份。**
 *
 * 把 `ok` / `partial` / `failed` 直接印给用户看等于漏出内部枚举 ——
 * 而非技术用户读不懂 `partial` 到底是成了还是没成。
 * 放在 shared 里，所以面板上的词与模型工具返回文本里的词必然一致。
 */
export declare const CRAWL_STATE_LABEL: Record<CrawlState, string>;
/** 状态徽章的色调（界面据此上色，不自己猜）。 */
export declare const CRAWL_STATE_TONE: Record<CrawlState, 'ok' | 'warn' | 'error' | 'muted'>;
/**
 * 适配器健康态（§4.2.3）：
 *   healthy ──连续失败 N 次──→ degraded ──仍失败──→ broken ──修复并自检──→ healthy
 */
export declare const HEALTH_STATES: readonly ["healthy", "degraded", "broken"];
export type HealthState = (typeof HEALTH_STATES)[number];
/** 健康态的中文标签（同上：不把 `degraded` 直接印出来）。 */
export declare const HEALTH_STATE_LABEL: Record<HealthState, string>;
export declare const HEALTH_STATE_TONE: Record<HealthState, 'ok' | 'warn' | 'error'>;
/** 触发原因（`crawl_run.reason`）—— 运行历史里要说清"这次是谁让它跑的"。 */
export declare const RUN_REASONS: readonly ["schedule", "manual", "catch-up"];
export type RunReasonKey = (typeof RUN_REASONS)[number];
export declare const RUN_REASON_LABEL: Record<RunReasonKey, string>;
/** 触发原因的中文标签；不认识的取值**原样返回**（不静默变成"—"）。 */
export declare function runReasonLabel(reason: string | null): string | null;
/**
 * 对外动作的**送达状态**（适配器 `ActionResult.delivery`）。
 *
 * 为什么进 shared：界面**至今看不到这一格** —— 投递/打招呼的结果只有成功或异常，
 * 而"点了按钮"与"消息真的进了对方会话"是两件事（§12.2）。
 * 批量回执要逐条写清它，所以它得是 host 与 client 共用的一套取值。
 *
 * ⚠️ 最要紧的一格是 `pending`：动作看起来已经发出，但没能验证送达 ——
 * 它**不可逆**，也可能已经成功。说成"失败"会让人直接重投一次，说成"成功"是撒谎。
 */
export declare const DELIVERY_STATES: readonly ["delivered", "pending", "failed", "missing"];
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export declare const DELIVERY_STATE_LABEL: Record<DeliveryState, string>;
/** 送达状态的色调（`pending` 是 warn 而不是 error：它可能已经成功了）。 */
export declare const DELIVERY_STATE_TONE: Record<DeliveryState, 'ok' | 'warn' | 'error' | 'muted'>;
/**
 * 核心字段（§4.2.4）：每个适配器都必须声明的一组字段。
 * 任一字段**连续 3 次缺失**即触发降级；不合格的**单条**记录不写主表，进 `pending_repair`。
 */
export declare const CORE_FIELDS: readonly ["title", "salary_raw", "company", "source_url"];
export type CoreField = (typeof CORE_FIELDS)[number];
/**
 * 适配器成熟度（**事实**：这个平台适配到什么程度了）。
 *
 * 存在的理由：注册表里有平台 ≠ 这个平台能用。10 个适配器实际分三档
 * （可用 / 探针校准过 / 还没验过），而 `capabilities` 只描述**平台有什么能力**、
 * `implementation` 只描述**我们实现了哪些方法** —— 两者都回答不了
 * 「选它进方案会不会白跑」。没有这一轴，用户勾了 4 个平台会得到
 * 「1 个能跑 + 3 个静默返回 0 条」，而界面显示"采集完成"。
 */
export declare const MATURITY_LEVELS: readonly ["stable", "calibrated", "experimental", "disabled"];
export type MaturityLevel = (typeof MATURITY_LEVELS)[number];
export declare const MATURITY_LEVEL_LABEL: Record<MaturityLevel, string>;
/**
 * 同上，**密集表格里用的短档**（能力矩阵一列 10 行，长标签会把表格撑到必须横向滚动）。
 *
 * 为什么放在这个文件、紧挨着长标签：界面层自己再写一份 `{stable:'可用'}` 就是
 * **第二份文案**，迟早与 `MATURITY_LEVEL_LABEL` 漂移（本项目已经为这类漂移
 * 吃过亏，见 `styles.ts` 里 `.jh-clip` 那段注释）。放在一起，改一处就够。
 */
export declare const MATURITY_LEVEL_SHORT: Record<MaturityLevel, string>;
export declare const MATURITY_LEVEL_TONE: Record<MaturityLevel, 'ok' | 'warn' | 'error' | 'muted'>;
/**
 * 要不要为此提醒用户（界面与 host 共用**同一份**判断，避免两处漂移）。
 * `calibrated` 不提醒：它意味着"可用，只是有已知缺口"，缺口写在 notes 里按需查看。
 */
export declare function maturityNeedsWarning(level: MaturityLevel): boolean;
/** 某个环节要不要登录（**平台事实**，`unknown` = 没验证过，不假装知道）。 */
export declare const AUTH_REQUIREMENTS: readonly ["none", "required", "unknown"];
export type AuthRequirementValue = (typeof AUTH_REQUIREMENTS)[number];
export declare const AUTH_REQUIREMENT_LABEL: Record<AuthRequirementValue, string>;
/**
 * 风控命中类型（§4.2.2 `detectBlock`）。
 *
 * `quota-exhausted`（P1/D-17a 增强）：平台侧"今日额度用完"（如 51job「今日投递太多」、
 * 智联「达到上限」）。与 `rate-limited` 的本质区别：退避重试**没用**（额度不随时间恢复），
 * 正确动作是当天对该平台停手。
 */
export declare const BLOCK_KINDS: readonly ["captcha", "login-required", "rate-limited", "quota-exhausted", "blank"];
export type BlockKind = (typeof BLOCK_KINDS)[number];
/** 待办类型。降级告警必须主动产生待办（§4.2.4 降级语义 / B13）。 */
export declare const TODO_KINDS: readonly ["adapter-degraded", "adapter-broken", "yield-drop", "login-required", "blocked", "new-jobs", "catch-up", "confirm-action", "deadline"];
export type TodoKind = (typeof TODO_KINDS)[number];
/** 待办级别。 */
export declare const TODO_LEVELS: readonly ["info", "warn", "urgent"];
export type TodoLevel = (typeof TODO_LEVELS)[number];
/**
 * 待办级别与类别的中文标签。
 *
 * 与其它枚举同一个理由：`urgent` / `catch-up` 是**机器**读的键，
 * 界面上直接印出来等于没说（用户看到"urgent"还得猜这是多急）。
 * 待办正文（`title`）本来就是中文，这两个标签补的是级别徽章与类别那一行。
 */
export declare const TODO_LEVEL_LABEL: Record<TodoLevel, string>;
export declare const TODO_KIND_LABEL: Record<TodoKind, string>;
/** 配置作用域（§4.3 `config`：全局 / 平台 / 方案）。 */
export declare const SETTING_SCOPES: readonly ["global", "platform", "plan"];
export type SettingScope = (typeof SETTING_SCOPES)[number];
/**
 * 岗位标注类型（§7 `job_flag.flag_type`）。
 *
 * 每一条标注都必须带**可读依据**才允许落库 —— 没有依据的结论不如不给结论。
 */
export declare const JOB_FLAG_TYPES: readonly ["outsourcing", "fraud", "zombie", "salary_inflation", "jargon_hit"];
export type JobFlagType = (typeof JOB_FLAG_TYPES)[number];
/** 标注的中文名。 */
export declare const JOB_FLAG_LABEL: Record<JobFlagType, string>;
/**
 * 简历版本态。
 *
 * 刻意只有两个值：`archived` 是"留着但不再投"，不是删除 ——
 * 简历是用户资产，**只能由用户显式删除**（§18 保留策略）。
 */
export declare const RESUME_STATES: readonly ["active", "archived"];
export type ResumeState = (typeof RESUME_STATES)[number];
/**
 * 简历语言。
 *
 * 海外方向**不做中文机翻**（§4.M / D-11），所以语言是简历的一等属性：
 * 中英各是一份独立维护的版本，而不是同一份的两个渲染。
 */
export declare const RESUME_LANGUAGES: readonly ["zh", "en"];
export type ResumeLanguage = (typeof RESUME_LANGUAGES)[number];
export declare const RESUME_LANGUAGE_LABEL: Record<ResumeLanguage, string>;
export declare const RESUME_STATE_LABEL: Record<ResumeState, string>;
/** 排版模板（R3：至少 2 套）。 */
export declare const RESUME_TEMPLATES: readonly ["concise", "professional"];
export type ResumeTemplate = (typeof RESUME_TEMPLATES)[number];
export declare const RESUME_TEMPLATE_LABEL: Record<ResumeTemplate, string>;
/** 导出格式（§17 R1/R2）。 */
export declare const RESUME_FORMATS: readonly ["pdf", "docx", "html"];
export type ResumeFormat = (typeof RESUME_FORMATS)[number];
/**
 * 接触态（§12.2）—— 落在 `greeting.stage`，**最新一条即当前接触态**。
 *
 * 关键设计：未读超时与已读未回超时是**两条不同分支**（§3.3 的核心洞察），
 * 所以这里没有"超时"这个状态 —— 超时是**由 `delivered`/`read` + 时间推导出来的建议**，
 * 不是状态本身。把建议写成状态会让状态机被时间污染，回不来。
 */
export declare const CONTACT_STAGES: readonly ["none", "greeted", "delivered", "read", "replied", "interview_scheduled"];
export type ContactStage = (typeof CONTACT_STAGES)[number];
export declare const CONTACT_STAGE_LABEL: Record<ContactStage, string>;
/**
 * 用户**手工**可以标记的接触态（`POST /jobs/:id/contact-stage`）。
 *
 * 排除 `none`：「未接触」不是能"标记"出来的状态 —— 它的含义是"没有打招呼记录"，
 * 而手工标记的载体恰恰是一条打招呼记录（§7.0：最新一条即当前接触态）。
 * 允许把它标成 `none` 只会得到一条写着"未接触"的打招呼记录，自相矛盾。
 *
 * 其余五态都允许人工设置/回退：平台侧会误判，用户也可能是补记历史
 * （"上周其实已经读过了"）—— 所以要能改回来，且每次改动都留一条状态事件。
 */
export declare const MANUAL_CONTACT_STAGES: readonly ["greeted", "delivered", "read", "replied", "interview_scheduled"];
export type ManualContactStage = (typeof MANUAL_CONTACT_STAGES)[number];
/** 投递阶段（§12.1）—— 落在 `application.stage`。 */
export declare const APPLICATION_STAGES: readonly ["sent", "viewed", "interviewing", "interviewed", "offer", "rejected", "no_reply"];
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
export declare const APPLICATION_STAGE_LABEL: Record<ApplicationStage, string>;
/**
 * 阶段的先后顺序。回退判断、漏斗排序、看板列序都靠它，
 * **顺序本身就是业务规则**（§12.1）。
 */
export declare const STAGE_ORDER: readonly ApplicationStage[];
export declare function stageRank(stage: ApplicationStage): number;
/**
 * 终态：到了这里就不该再自动往前走，也没有"下一格"。
 *
 * 放在 shared 而不是 host：客户端也要用它决定**要不要渲染"推进"按钮**。
 * 早先它只在 host，客户端因此只能"永远渲染、终态点了没反应"。
 */
export declare const TERMINAL_STAGES: readonly ApplicationStage[];
/**
 * 在途阶段里 stage 的下一格；终态没有下一格，返回 null。
 *
 * `advance` 的默认推进目标与看板按钮的目标都从这里取 —— 只有一份顺序，
 * 不会出现"按钮说去 A、后端去 B"。
 */
export declare function nextStageOf(stage: ApplicationStage): ApplicationStage | null;
/** 投递后完全没进展的阈值（天）——超过就该催了。 */
export declare const NO_PROGRESS_DAYS = 21;
/** 投递渠道（§11.3：归因分析必需）。 */
export declare const APPLICATION_CHANNELS: readonly ["platform", "referral", "website", "headhunter"];
export type ApplicationChannel = (typeof APPLICATION_CHANNELS)[number];
export declare const APPLICATION_CHANNEL_LABEL: Record<ApplicationChannel, string>;
/** 消息方向（§11.3 `message.direction`）。 */
export declare const MESSAGE_DIRECTIONS: readonly ["hr", "me"];
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
/** 面试状态（§12.6）。 */
export declare const INTERVIEW_STATES: readonly ["pending", "confirmed", "done", "reviewed", "cancelled", "rescheduled"];
export type InterviewState = (typeof INTERVIEW_STATES)[number];
export declare const INTERVIEW_STATE_LABEL: Record<InterviewState, string>;
/** 面试形式 —— 决定要不要算通勤（§13 U7「别撞车别迟到」）。 */
export declare const INTERVIEW_KINDS: readonly ["onsite", "video", "phone", "other"];
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];
export declare const INTERVIEW_KIND_LABEL: Record<InterviewKind, string>;
/**
 * 状态变更的来源（`stage_event.source`）。
 *
 * 为什么必须记：§12.1 的转移表里"自动识别"与"人工打勾"混在一起，
 * 不记来源就无法解释"这个状态是谁改的"，也无法在自动识别错的时候回溯。
 */
export declare const STAGE_SOURCES: readonly ["auto", "manual", "model"];
export type StageSource = (typeof STAGE_SOURCES)[number];
export declare const STAGE_SOURCE_LABEL: Record<StageSource, string>;
/**
 * 校招批次。
 *
 * 为什么批次是一等字段：校招有**硬时间窗**（§4.L：错过就等一年）。
 * 秋招与春招的节点完全不同，把它们混在一个"投递"里就没法做时间窗管理。
 */
export declare const CAMPUS_BATCHES: readonly ["autumn", "spring", "other"];
export type CampusBatch = (typeof CAMPUS_BATCHES)[number];
export declare const CAMPUS_BATCH_LABEL: Record<CampusBatch, string>;
/**
 * 校招流程状态（§12.7）。
 *
 * 与社招的投递阶段并存而不是替换：校招对象多、流程长，且有社招没有的
 * 「笔试」与「三方协议」两个**不可逆**节点。
 */
export declare const CAMPUS_STAGES: readonly ["intent", "applied", "assessment_pending", "assessment_done", "interview_pending", "interviewing", "final", "tripartite_pending", "tripartite_signed", "closed", "rejected"];
export type CampusStage = (typeof CAMPUS_STAGES)[number];
export declare const CAMPUS_STAGE_LABEL: Record<CampusStage, string>;
/** 笔试/测评的形态（§11.5 `Assessment`）。 */
export declare const ASSESSMENT_KINDS: readonly ["written", "aptitude", "personality", "video", "other"];
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];
export declare const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string>;
/**
 * 测评状态。
 *
 * `missed` 是**终态且不可逆** —— 这正是校招与社招最大的差异（§12.7）。
 * 所以它不是一个普通状态，而是一个需要"强提醒"的事件。
 */
export declare const ASSESSMENT_STATES: readonly ["pending", "in_progress", "done", "missed"];
export type AssessmentState = (typeof ASSESSMENT_STATES)[number];
export declare const ASSESSMENT_STATE_LABEL: Record<AssessmentState, string>;
/** 三方协议状态（§4.L L5：不可逆节点，违约有真实代价）。 */
export declare const TRIPARTITE_STATES: readonly ["pending", "signed", "breached"];
export type TripartiteState = (typeof TRIPARTITE_STATES)[number];
export declare const TRIPARTITE_STATE_LABEL: Record<TripartiteState, string>;
/**
 * 工签/Sponsorship 立场（§4.M M4）。
 *
 * `unknown` 是一等取值而不是"没填"：**识别不出来就必须说识别不出来**。
 * 把"没看到 no sponsorship 字样"当成"提供担保"，会让用户投一堆注定无效的岗位。
 */
export declare const VISA_STANCES: readonly ["provides", "no_sponsorship", "local_only", "unknown"];
export type VisaStance = (typeof VISA_STANCES)[number];
export declare const VISA_STANCE_LABEL: Record<VisaStance, string>;
/** 工作模式（§4.M M5）。 */
export declare const REMOTE_KINDS: readonly ["onsite", "hybrid", "remote", "unknown"];
export type RemoteKind = (typeof REMOTE_KINDS)[number];
export declare const REMOTE_KIND_LABEL: Record<RemoteKind, string>;
/** Cover Letter 语言（M2：与简历语言独立，海外岗位通常要英文）。 */
export declare const COVER_LETTER_LANGUAGES: readonly ["en", "zh"];
export type CoverLetterLanguage = (typeof COVER_LETTER_LANGUAGES)[number];
/** 消息中心的回复拟稿情境（卡片快捷键的同一份说法）。 */
export declare const REPLY_SCENARIOS: readonly [{
    readonly key: "negotiate-time";
    readonly label: "协商面试时间";
}, {
    readonly key: "salary";
    readonly label: "询问薪资结构";
}, {
    readonly key: "decline";
    readonly label: "婉拒邀约";
}];
export type ReplyScenario = (typeof REPLY_SCENARIOS)[number]['key'];
export declare const REPLY_SCENARIO_LABEL: Record<ReplyScenario, string>;
//# sourceMappingURL=enums.d.ts.map