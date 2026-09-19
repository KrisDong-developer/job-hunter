/**
 * 状态机与枚举（§7.0：三套状态机分表承载，**不得合并成单一枚举**）。
 * host 与 client 共享，只放标量字面量。
 */

/** 岗位处置态 —— `job.state`。 */
export const JOB_STATES = ['new', 'seen', 'saved', 'ignored', 'archived'] as const
export type JobState = (typeof JOB_STATES)[number]

/** 抓取运行态 —— `crawl_run.state`。 */
/** 抓取运行态 —— `crawl_run.state`。 */
export const CRAWL_STATES = ['queued', 'running', 'ok', 'partial', 'failed', 'aborted'] as const
export type CrawlState = (typeof CRAWL_STATES)[number]

/**
 * 运行态的中文标签。**界面上一律用这一份。**
 *
 * 把 `ok` / `partial` / `failed` 直接印给用户看等于漏出内部枚举 ——
 * 而非技术用户读不懂 `partial` 到底是成了还是没成。
 * 放在 shared 里，所以面板上的词与模型工具返回文本里的词必然一致。
 */
export const CRAWL_STATE_LABEL: Record<CrawlState, string> = {
  queued: '排队中',
  running: '进行中',
  ok: '成功',
  partial: '部分成功',
  failed: '失败',
  aborted: '已中止',
}

/** 状态徽章的色调（界面据此上色，不自己猜）。 */
export const CRAWL_STATE_TONE: Record<CrawlState, 'ok' | 'warn' | 'error' | 'muted'> = {
  queued: 'muted',
  running: 'muted',
  ok: 'ok',
  partial: 'warn',
  failed: 'error',
  aborted: 'muted',
}

/**
 * 适配器健康态（§4.2.3）：
 *   healthy ──连续失败 N 次──→ degraded ──仍失败──→ broken ──修复并自检──→ healthy
 */
export const HEALTH_STATES = ['healthy', 'degraded', 'broken'] as const
export type HealthState = (typeof HEALTH_STATES)[number]

/** 健康态的中文标签（同上：不把 `degraded` 直接印出来）。 */
export const HEALTH_STATE_LABEL: Record<HealthState, string> = {
  healthy: '正常',
  degraded: '降级',
  broken: '失效',
}

export const HEALTH_STATE_TONE: Record<HealthState, 'ok' | 'warn' | 'error'> = {
  healthy: 'ok',
  degraded: 'warn',
  broken: 'error',
}

/** 触发原因（`crawl_run.reason`）—— 运行历史里要说清"这次是谁让它跑的"。 */
export const RUN_REASONS = ['schedule', 'manual', 'catch-up'] as const
export type RunReasonKey = (typeof RUN_REASONS)[number]

export const RUN_REASON_LABEL: Record<RunReasonKey, string> = {
  schedule: '定时',
  manual: '手动',
  'catch-up': '补跑',
}

/** 触发原因的中文标签；不认识的取值**原样返回**（不静默变成"—"）。 */
export function runReasonLabel(reason: string | null): string | null {
  if (reason === null || reason === '') return null
  return (RUN_REASON_LABEL as Record<string, string | undefined>)[reason] ?? reason
}

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
export const DELIVERY_STATES = ['delivered', 'pending', 'failed', 'missing'] as const
export type DeliveryState = (typeof DELIVERY_STATES)[number]

export const DELIVERY_STATE_LABEL: Record<DeliveryState, string> = {
  delivered: '已确认送达',
  pending: '已发出·未确认',
  failed: '失败',
  missing: '无从确认',
}

/** 送达状态的色调（`pending` 是 warn 而不是 error：它可能已经成功了）。 */
export const DELIVERY_STATE_TONE: Record<DeliveryState, 'ok' | 'warn' | 'error' | 'muted'> = {
  delivered: 'ok',
  pending: 'warn',
  failed: 'error',
  missing: 'muted',
}

/**
 * 核心字段（§4.2.4）：每个适配器都必须声明的一组字段。
 * 任一字段**连续 3 次缺失**即触发降级；不合格的**单条**记录不写主表，进 `pending_repair`。
 */
export const CORE_FIELDS = ['title', 'salary_raw', 'company', 'source_url'] as const
export type CoreField = (typeof CORE_FIELDS)[number]

/**
 * 适配器成熟度（**事实**：这个平台适配到什么程度了）。
 *
 * 存在的理由：注册表里有平台 ≠ 这个平台能用。10 个适配器实际分三档
 * （可用 / 探针校准过 / 还没验过），而 `capabilities` 只描述**平台有什么能力**、
 * `implementation` 只描述**我们实现了哪些方法** —— 两者都回答不了
 * 「选它进方案会不会白跑」。没有这一轴，用户勾了 4 个平台会得到
 * 「1 个能跑 + 3 个静默返回 0 条」，而界面显示"采集完成"。
 */
export const MATURITY_LEVELS = ['stable', 'calibrated', 'experimental', 'disabled'] as const
export type MaturityLevel = (typeof MATURITY_LEVELS)[number]

export const MATURITY_LEVEL_LABEL: Record<MaturityLevel, string> = {
  stable: '可用（真实夹具 + 冒烟验证）',
  calibrated: '已校准（探针/夹具验证，缺口见备注）',
  experimental: '实验（未验证或部分未实现，可能返回空）',
  disabled: '停用（平台侧不可用，需改配置才启用）',
}

/**
 * 同上，**密集表格里用的短档**（能力矩阵一列 10 行，长标签会把表格撑到必须横向滚动）。
 *
 * 为什么放在这个文件、紧挨着长标签：界面层自己再写一份 `{stable:'可用'}` 就是
 * **第二份文案**，迟早与 `MATURITY_LEVEL_LABEL` 漂移（本项目已经为这类漂移
 * 吃过亏，见 `styles.ts` 里 `.jh-clip` 那段注释）。放在一起，改一处就够。
 */
export const MATURITY_LEVEL_SHORT: Record<MaturityLevel, string> = {
  stable: '可用',
  calibrated: '已校准',
  experimental: '实验',
  disabled: '停用',
}

export const MATURITY_LEVEL_TONE: Record<MaturityLevel, 'ok' | 'warn' | 'error' | 'muted'> = {
  stable: 'ok',
  calibrated: 'warn',
  experimental: 'error',
  disabled: 'muted',
}

/**
 * 要不要为此提醒用户（界面与 host 共用**同一份**判断，避免两处漂移）。
 * `calibrated` 不提醒：它意味着"可用，只是有已知缺口"，缺口写在 notes 里按需查看。
 */
export function maturityNeedsWarning(level: MaturityLevel): boolean {
  return level === 'experimental' || level === 'disabled'
}

/** 某个环节要不要登录（**平台事实**，`unknown` = 没验证过，不假装知道）。 */
export const AUTH_REQUIREMENTS = ['none', 'required', 'unknown'] as const
export type AuthRequirementValue = (typeof AUTH_REQUIREMENTS)[number]

export const AUTH_REQUIREMENT_LABEL: Record<AuthRequirementValue, string> = {
  none: '不需要登录',
  required: '需要登录',
  unknown: '尚未验证',
}

/**
 * 风控命中类型（§4.2.2 `detectBlock`）。
 *
 * `quota-exhausted`（P1/D-17a 增强）：平台侧"今日额度用完"（如 51job「今日投递太多」、
 * 智联「达到上限」）。与 `rate-limited` 的本质区别：退避重试**没用**（额度不随时间恢复），
 * 正确动作是当天对该平台停手。
 */
export const BLOCK_KINDS = [
  'captcha',
  'login-required',
  'rate-limited',
  'quota-exhausted',
  'blank',
] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]

/** 待办类型。降级告警必须主动产生待办（§4.2.4 降级语义 / B13）。 */
export const TODO_KINDS = [
  'adapter-degraded',
  'adapter-broken',
  /**
   * 批次 5：**量级骤降**（`found` 掉到该平台历史常态的三成以下）。
   *
   * 与 `adapter-degraded` 的区别：后者是"某个字段整页解析不出来"（逐字段计数），
   * 这条是"字段都好好的、条目数却掉了一个数量级"。两者成因与修法都不同，
   * 合成一类会让"先去查什么"失去指向。
   */
  'yield-drop',
  'login-required',
  'blocked',
  'new-jobs',
  'catch-up',
  /** §4.4.2：审批超时/无人响应时，把这次动作转成"待确认"，不静默丢弃。 */
  'confirm-action',
  /**
   * P8：**不可逆硬截止**（校招笔试截止 / 网申截止 / 三方签署）。
   *
   * 单独一类而不是复用 `new-jobs`：这类节点错过就是终态，
   * 待办列表必须能把它们挑出来当 urgent 显示（§12.7 / 决策记录第 3 条）。
   */
  'deadline',
] as const
export type TodoKind = (typeof TODO_KINDS)[number]

/** 待办级别。 */
export const TODO_LEVELS = ['info', 'warn', 'urgent'] as const
export type TodoLevel = (typeof TODO_LEVELS)[number]

/**
 * 待办级别与类别的中文标签。
 *
 * 与其它枚举同一个理由：`urgent` / `catch-up` 是**机器**读的键，
 * 界面上直接印出来等于没说（用户看到"urgent"还得猜这是多急）。
 * 待办正文（`title`）本来就是中文，这两个标签补的是级别徽章与类别那一行。
 */
export const TODO_LEVEL_LABEL: Record<TodoLevel, string> = {
  info: '提示',
  warn: '提醒',
  urgent: '紧急',
}

export const TODO_KIND_LABEL: Record<TodoKind, string> = {
  'adapter-degraded': '适配器降级',
  'adapter-broken': '适配器失效',
  'yield-drop': '量级骤降',
  'login-required': '需要登录',
  blocked: '风控暂停',
  'new-jobs': '新岗位',
  'catch-up': '补抓欠账',
  'confirm-action': '待确认动作',
  deadline: '硬截止',
}

/** 配置作用域（§4.3 `config`：全局 / 平台 / 方案）。 */
export const SETTING_SCOPES = ['global', 'platform', 'plan'] as const
export type SettingScope = (typeof SETTING_SCOPES)[number]

/**
 * 岗位标注类型（§7 `job_flag.flag_type`）。
 *
 * 每一条标注都必须带**可读依据**才允许落库 —— 没有依据的结论不如不给结论。
 */
export const JOB_FLAG_TYPES = [
  'outsourcing',
  'fraud',
  'zombie',
  'salary_inflation',
  'jargon_hit',
] as const
export type JobFlagType = (typeof JOB_FLAG_TYPES)[number]

/** 标注的中文名。 */
export const JOB_FLAG_LABEL: Record<JobFlagType, string> = {
  outsourcing: '疑似外包',
  fraud: '高风险',
  zombie: '僵尸岗位',
  salary_inflation: '薪资虚标',
  jargon_hit: '黑话',
}

// ── P6：简历 ─────────────────────────────────────────────────────────

/**
 * 简历版本态。
 *
 * 刻意只有两个值：`archived` 是"留着但不再投"，不是删除 ——
 * 简历是用户资产，**只能由用户显式删除**（§18 保留策略）。
 */
export const RESUME_STATES = ['active', 'archived'] as const
export type ResumeState = (typeof RESUME_STATES)[number]

/**
 * 简历语言。
 *
 * 海外方向**不做中文机翻**（§4.M / D-11），所以语言是简历的一等属性：
 * 中英各是一份独立维护的版本，而不是同一份的两个渲染。
 */
export const RESUME_LANGUAGES = ['zh', 'en'] as const
export type ResumeLanguage = (typeof RESUME_LANGUAGES)[number]

export const RESUME_LANGUAGE_LABEL: Record<ResumeLanguage, string> = {
  zh: '中文',
  en: '英文',
}

export const RESUME_STATE_LABEL: Record<ResumeState, string> = {
  active: '启用中',
  archived: '已归档',
}

/** 排版模板（R3：至少 2 套）。 */
export const RESUME_TEMPLATES = ['concise', 'professional'] as const
export type ResumeTemplate = (typeof RESUME_TEMPLATES)[number]

export const RESUME_TEMPLATE_LABEL: Record<ResumeTemplate, string> = {
  concise: '简洁',
  professional: '专业',
}

/** 导出格式（§17 R1/R2）。 */
export const RESUME_FORMATS = ['pdf', 'docx', 'html'] as const
export type ResumeFormat = (typeof RESUME_FORMATS)[number]

// ── P7：跟进与看板 ───────────────────────────────────────────────────

/**
 * 接触态（§12.2）—— 落在 `greeting.stage`，**最新一条即当前接触态**。
 *
 * 关键设计：未读超时与已读未回超时是**两条不同分支**（§3.3 的核心洞察），
 * 所以这里没有"超时"这个状态 —— 超时是**由 `delivered`/`read` + 时间推导出来的建议**，
 * 不是状态本身。把建议写成状态会让状态机被时间污染，回不来。
 */
export const CONTACT_STAGES = ['none', 'greeted', 'delivered', 'read', 'replied', 'interview_scheduled'] as const
export type ContactStage = (typeof CONTACT_STAGES)[number]

export const CONTACT_STAGE_LABEL: Record<ContactStage, string> = {
  none: '未接触',
  greeted: '已打招呼',
  delivered: '已送达',
  read: 'HR 已读',
  replied: 'HR 已回复',
  interview_scheduled: '已约面',
}

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
export const MANUAL_CONTACT_STAGES = ['greeted', 'delivered', 'read', 'replied', 'interview_scheduled'] as const
export type ManualContactStage = (typeof MANUAL_CONTACT_STAGES)[number]

/** 投递阶段（§12.1）—— 落在 `application.stage`。 */
export const APPLICATION_STAGES = [
  'sent',
  'viewed',
  'interviewing',
  'interviewed',
  'offer',
  'rejected',
  'no_reply',
] as const
export type ApplicationStage = (typeof APPLICATION_STAGES)[number]

export const APPLICATION_STAGE_LABEL: Record<ApplicationStage, string> = {
  sent: '已投递',
  viewed: '已查看',
  interviewing: '面试中',
  interviewed: '已面试',
  offer: 'Offer',
  rejected: '已拒绝',
  no_reply: '无回复',
}

/**
 * 阶段的先后顺序。回退判断、漏斗排序、看板列序都靠它，
 * **顺序本身就是业务规则**（§12.1）。
 */
export const STAGE_ORDER: readonly ApplicationStage[] = APPLICATION_STAGES

export function stageRank(stage: ApplicationStage): number {
  return STAGE_ORDER.indexOf(stage)
}

/**
 * 终态：到了这里就不该再自动往前走，也没有"下一格"。
 *
 * 放在 shared 而不是 host：客户端也要用它决定**要不要渲染"推进"按钮**。
 * 早先它只在 host，客户端因此只能"永远渲染、终态点了没反应"。
 */
export const TERMINAL_STAGES: readonly ApplicationStage[] = ['offer', 'rejected', 'no_reply']

/**
 * 在途阶段里 stage 的下一格；终态没有下一格，返回 null。
 *
 * `advance` 的默认推进目标与看板按钮的目标都从这里取 —— 只有一份顺序，
 * 不会出现"按钮说去 A、后端去 B"。
 */
export function nextStageOf(stage: ApplicationStage): ApplicationStage | null {
  const index = STAGE_ORDER.indexOf(stage)
  if (index < 0 || index >= STAGE_ORDER.length - 1) return null
  const next = STAGE_ORDER[index + 1]
  return next === undefined || TERMINAL_STAGES.includes(next) ? null : next
}

/** 投递后完全没进展的阈值（天）——超过就该催了。 */
export const NO_PROGRESS_DAYS = 21

/** 投递渠道（§11.3：归因分析必需）。 */
export const APPLICATION_CHANNELS = ['platform', 'referral', 'website', 'headhunter'] as const
export type ApplicationChannel = (typeof APPLICATION_CHANNELS)[number]

export const APPLICATION_CHANNEL_LABEL: Record<ApplicationChannel, string> = {
  platform: '平台内投',
  referral: '内推',
  website: '官网',
  headhunter: '猎头',
}

/** 消息方向（§11.3 `message.direction`）。 */
export const MESSAGE_DIRECTIONS = ['hr', 'me'] as const
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number]

/** 面试状态（§12.6）。 */
export const INTERVIEW_STATES = ['pending', 'confirmed', 'done', 'reviewed', 'cancelled', 'rescheduled'] as const
export type InterviewState = (typeof INTERVIEW_STATES)[number]

export const INTERVIEW_STATE_LABEL: Record<InterviewState, string> = {
  pending: '待确认',
  confirmed: '已确认',
  done: '已完成',
  reviewed: '已复盘',
  cancelled: '已取消',
  rescheduled: '已改期',
}

/** 面试形式 —— 决定要不要算通勤（§13 U7「别撞车别迟到」）。 */
export const INTERVIEW_KINDS = ['onsite', 'video', 'phone', 'other'] as const
export type InterviewKind = (typeof INTERVIEW_KINDS)[number]

export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  onsite: '现场',
  video: '视频',
  phone: '电话',
  other: '其它',
}

/**
 * 状态变更的来源（`stage_event.source`）。
 *
 * 为什么必须记：§12.1 的转移表里"自动识别"与"人工打勾"混在一起，
 * 不记来源就无法解释"这个状态是谁改的"，也无法在自动识别错的时候回溯。
 */
export const STAGE_SOURCES = ['auto', 'manual', 'model'] as const
export type StageSource = (typeof STAGE_SOURCES)[number]

export const STAGE_SOURCE_LABEL: Record<StageSource, string> = {
  auto: '自动识别',
  manual: '人工',
  model: '模型',
}

// ── P8：校招支线（§4.L）─────────────────────────────────────────────

/**
 * 校招批次。
 *
 * 为什么批次是一等字段：校招有**硬时间窗**（§4.L：错过就等一年）。
 * 秋招与春招的节点完全不同，把它们混在一个"投递"里就没法做时间窗管理。
 */
export const CAMPUS_BATCHES = ['autumn', 'spring', 'other'] as const
export type CampusBatch = (typeof CAMPUS_BATCHES)[number]

export const CAMPUS_BATCH_LABEL: Record<CampusBatch, string> = {
  autumn: '秋招',
  spring: '春招',
  other: '其他批次',
}

/**
 * 校招流程状态（§12.7）。
 *
 * 与社招的投递阶段并存而不是替换：校招对象多、流程长，且有社招没有的
 * 「笔试」与「三方协议」两个**不可逆**节点。
 */
export const CAMPUS_STAGES = [
  'intent',
  'applied',
  'assessment_pending',
  'assessment_done',
  'interview_pending',
  'interviewing',
  'final',
  'tripartite_pending',
  'tripartite_signed',
  'closed',
  'rejected',
] as const
export type CampusStage = (typeof CAMPUS_STAGES)[number]

export const CAMPUS_STAGE_LABEL: Record<CampusStage, string> = {
  intent: '意向',
  applied: '已网申',
  assessment_pending: '待笔试',
  assessment_done: '已笔试',
  interview_pending: '待面试',
  interviewing: '面试中',
  final: '终面',
  tripartite_pending: '待发三方',
  tripartite_signed: '已签三方',
  closed: '结束',
  rejected: '已拒',
}

/** 笔试/测评的形态（§11.5 `Assessment`）。 */
export const ASSESSMENT_KINDS = ['written', 'aptitude', 'personality', 'video', 'other'] as const
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  written: '笔试',
  aptitude: '能力测评',
  personality: '性格测评',
  video: 'AI 视频面',
  other: '其它',
}

/**
 * 测评状态。
 *
 * `missed` 是**终态且不可逆** —— 这正是校招与社招最大的差异（§12.7）。
 * 所以它不是一个普通状态，而是一个需要"强提醒"的事件。
 */
export const ASSESSMENT_STATES = ['pending', 'in_progress', 'done', 'missed'] as const
export type AssessmentState = (typeof ASSESSMENT_STATES)[number]

export const ASSESSMENT_STATE_LABEL: Record<AssessmentState, string> = {
  pending: '待完成',
  in_progress: '进行中',
  done: '已完成',
  missed: '已错过',
}

/** 三方协议状态（§4.L L5：不可逆节点，违约有真实代价）。 */
export const TRIPARTITE_STATES = ['pending', 'signed', 'breached'] as const
export type TripartiteState = (typeof TRIPARTITE_STATES)[number]

export const TRIPARTITE_STATE_LABEL: Record<TripartiteState, string> = {
  pending: '待签',
  signed: '已签',
  breached: '违约',
}

// ── P8：海外支线（§4.M）─────────────────────────────────────────────

/**
 * 工签/Sponsorship 立场（§4.M M4）。
 *
 * `unknown` 是一等取值而不是"没填"：**识别不出来就必须说识别不出来**。
 * 把"没看到 no sponsorship 字样"当成"提供担保"，会让用户投一堆注定无效的岗位。
 */
export const VISA_STANCES = ['provides', 'no_sponsorship', 'local_only', 'unknown'] as const
export type VisaStance = (typeof VISA_STANCES)[number]

export const VISA_STANCE_LABEL: Record<VisaStance, string> = {
  provides: '提供签证担保',
  no_sponsorship: '不提供担保',
  local_only: '仅限本地身份',
  unknown: '未识别',
}

/** 工作模式（§4.M M5）。 */
export const REMOTE_KINDS = ['onsite', 'hybrid', 'remote', 'unknown'] as const
export type RemoteKind = (typeof REMOTE_KINDS)[number]

export const REMOTE_KIND_LABEL: Record<RemoteKind, string> = {
  onsite: '坐班',
  hybrid: '混合',
  remote: '远程',
  unknown: '未识别',
}

/** Cover Letter 语言（M2：与简历语言独立，海外岗位通常要英文）。 */
export const COVER_LETTER_LANGUAGES = ['en', 'zh'] as const
export type CoverLetterLanguage = (typeof COVER_LETTER_LANGUAGES)[number]

/** 消息中心的回复拟稿情境（卡片快捷键的同一份说法）。 */
export const REPLY_SCENARIOS = [
  { key: 'negotiate-time', label: '协商面试时间' },
  { key: 'salary', label: '询问薪资结构' },
  { key: 'decline', label: '婉拒邀约' },
] as const
export type ReplyScenario = (typeof REPLY_SCENARIOS)[number]['key']
export const REPLY_SCENARIO_LABEL = Object.fromEntries(
  REPLY_SCENARIOS.map((item) => [item.key, item.label]),
) as Record<ReplyScenario, string>

// ── Offer（§4.H H1/H3/H4）────────────────────────────────────────────

/**
 * Offer 状态。
 *
 * 四个值都是**用户的事实**，不是我们能推断的东西 —— 所以没有任何自动流转：
 * `pending`（还没决定）→ `accepted` / `declined` 只能由人写；`expired` 是
 * "截止时间过了还没决定"的显式落库（由用户在界面上确认，不做自动改写 ——
 * 自动把 pending 改成 expired 会在用户刚谈妥延期时把事实改错）。
 */
export const OFFER_STATES = ['pending', 'accepted', 'declined', 'expired'] as const
export type OfferState = (typeof OFFER_STATES)[number]

export const OFFER_STATE_LABEL: Record<OfferState, string> = {
  pending: '待决定',
  accepted: '已接受',
  declined: '已拒绝',
  expired: '已过期',
}

/**
 * 还没决定的状态 —— 只有这些才需要"截止倒计时"（H3）。
 *
 * 单独一个常量而不是各处写 `state === 'pending'`：倒计时出现在今日、offer 列表
 * 与提醒三处，三处各写一遍必然漂移（漏掉一处就会对着已拒绝的 offer 催用户）。
 */
export const OFFER_OPEN_STATES: readonly OfferState[] = ['pending']
