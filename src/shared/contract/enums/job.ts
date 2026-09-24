/**
 * job 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */

/** SR-8：三级新鲜度。 */
export const FRESHNESS_LEVELS = ['fresh', 'stale', 'cold'] as const

export type FreshnessLevel = (typeof FRESHNESS_LEVELS)[number]

/** 岗位处置态（`job.state`）。 */
export const JOB_STATES = ['new', 'seen', 'saved', 'ignored', 'archived'] as const

export type JobState = (typeof JOB_STATES)[number]

/**
 * 岗位处置态的中文标签。**只此一份**（客户端曾另抄一份，于是详情里把「已收藏」写成了「收藏」）。
 *
 * 放在这里而不是界面侧：模型工具的返回文本里也要写「已收藏」而不是 `saved` ——
 * 用户在对话里看到的和界面上看到的必须是同一套词。
 */
export const JOB_STATE_LABEL: Record<JobState, string> = {
  new: '新',
  seen: '已读',
  saved: '已收藏',
  ignored: '已忽略',
  archived: '已归档',
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

/**
 * 岗位库的排序字段（请求参数 `orderBy`）。
 *
 * 取值域与界面下拉同住一个文件：界面能选的与宿主接受的必须是**同一个集合** ——
 * 曾经宿主在一个数组里校验（`routes/jobs.ts`）、另在 `JobQuery` 里写了一遍联合类型、
 * 客户端再在一个数组里渲染下拉，三处的顺序还各不相同。
 *
 * ⚠️ `match_score`（第五轮，批次 A）排的是**库里存着的那个分**：
 * 分数是"简历版本的函数"，换简历后旧分不会自动重算（只会被标成过期，
 * 见 `JobDto.scoreStale`）。所以界面在按分排序/筛选时**必须**同时把过期分标出来，
 * 否则用户会以为自己在按"当前简历的匹配度"挑岗位。
 */
export const JOB_ORDER_VALUES = [
  'crawled_at',
  'match_score',
  'salary_min',
  'title',
  'last_seen_at',
  'first_seen_at',
] as const

export type JobOrderValue = (typeof JOB_ORDER_VALUES)[number]

/** 排序下拉的选项。**数组顺序就是下拉里的顺序**。 */
export const JOB_ORDER_OPTIONS: ReadonlyArray<{ value: JobOrderValue; label: string }> = [
  { value: 'crawled_at', label: '按抓取时间' },
  { value: 'match_score', label: '按匹配分' },
  { value: 'salary_min', label: '按月薪' },
  { value: 'last_seen_at', label: '按最近出现' },
  { value: 'first_seen_at', label: '按首次出现' },
  { value: 'title', label: '按标题' },
]

/**
 * 公司列表的排序键（公司维度，`GET /companies` 的 `orderBy`）。
 *
 * 与 `JOB_ORDER_VALUES` 同住一个文件、同一套纪律：界面下拉与宿主校验共用一份。
 * `name` 用中文 locale 排序（`localeCompare(…, 'zh')`）；分数键上没有画像的公司按 0 算
 * —— 冷启动信号弱时"没有分"和"0 分"本来就是同一个答案（见 CompanyPanel 的说明）。
 */
export const COMPANY_ORDER_VALUES = [
  'jobCount',
  'outsourcingScore',
  'fraudScore',
  'name',
] as const

export type CompanyOrderValue = (typeof COMPANY_ORDER_VALUES)[number]

export const COMPANY_ORDER_OPTIONS: ReadonlyArray<{ value: CompanyOrderValue; label: string }> = [
  { value: 'jobCount', label: '按岗位数' },
  { value: 'outsourcingScore', label: '按外包分' },
  { value: 'fraudScore', label: '按风险分' },
  { value: 'name', label: '按名称' },
]

/**
 * 岗位**时效档位**的天数阈值（第五轮，批次 C）。
 *
 * ── 为什么另立一套，而不是复用 `FRESHNESS_LEVELS` 那套采集新鲜度
 *
 * 已有的 `FreshnessBadge` 回答的是"**采集方案**的数据有多旧"（基准 `plan.lastSuccessAt`，
 * 阈值随计划频率浮动）。岗位要回答的是另一个问题："**这条岗位**我们最近还见到过吗"
 * （基准 `JobDto.lastSeenAt`）。两者基准不同、量级差两个数量级，混用会让用户
 * 在两个屏上看到同一个词指两件事 —— 所以这里给岗位固定档：
 *
 *   最近见到 ≤ 3 天   → fresh（近来活跃）
 *   4–14 天           → stale（一周多没见）
 *   > 14 天           → cold（半月以上没见）
 *
 * 固定档而不是随采集频率浮动：岗位库的读者是"今天要投哪几条"，阈值跳动会让
 * "昨天还新鲜今天突然陈旧"这种解释不清的变化出现。
 *
 * 与"僵尸岗位"标注（`published_at > 60 天`）**不重复**：那个看平台发布时间，
 * 这个看我们最近一次见到它的时间，tooltip 里要写清基准。
 */
export const JOB_FRESHNESS_FRESH_DAYS = 3

export const JOB_FRESHNESS_COLD_DAYS = 14

/**
 * 岗位时效档位的中文说法。
 *
 * 用词刻意与采集新鲜度（`FreshnessBadge` 的"新鲜 / 偏旧 / 陈旧"）**区分开**：
 * 那两个词在采集屏指的是"数据有多旧"，如果岗位库用同一套词，用户会以为是同一件事。
 * 这里的说法自带基准（"见"= 我们最近一次在平台上见到它）。
 */
export const JOB_FRESHNESS_LABEL: Record<FreshnessLevel, string> = {
  fresh: '近来活跃',
  stale: '一周多没见',
  cold: '半月以上没见',
}

/** 「今日新增」的口径：24 小时。与 `JOB_NEW_WINDOWS` 里的 `'1d'` 是**同一个数**。 */
export const TODAY_NEW_WINDOW_HOURS = 24

/**
 * 「只看新增」的时间窗。
 *
 * 24 小时那一档**必须与首屏「今日新增」同口径**（就是上面的 `TODAY_NEW_WINDOW_HOURS`）——
 * 写成"今天零点"会让首屏说 12 条、列表筛出 3 条，而两者看的是同一列 `first_seen_at`，
 * 用户只会以为其中之一坏了。两处引用同一个常量，所以漂移不了。
 */
export const JOB_NEW_WINDOWS: ReadonlyArray<{ value: string; label: string; hours: number }> = [
  { value: '1d', label: '近 24 小时', hours: TODAY_NEW_WINDOW_HOURS },
  { value: '3d', label: '近 3 天', hours: 72 },
  { value: '7d', label: '近 7 天', hours: 168 },
]
