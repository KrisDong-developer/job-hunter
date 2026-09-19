/**
 * job 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/** SR-8：三级新鲜度。 */
export const FRESHNESS_LEVELS = ['fresh', 'stale', 'cold'];
/** 岗位处置态（`job.state`）。 */
export const JOB_STATES = ['new', 'seen', 'saved', 'ignored', 'archived'];
/**
 * 岗位处置态的中文标签。**只此一份**（客户端曾另抄一份，于是详情里把「已收藏」写成了「收藏」）。
 *
 * 放在这里而不是界面侧：模型工具的返回文本里也要写「已收藏」而不是 `saved` ——
 * 用户在对话里看到的和界面上看到的必须是同一套词。
 */
export const JOB_STATE_LABEL = {
    new: '新',
    seen: '已读',
    saved: '已收藏',
    ignored: '已忽略',
    archived: '已归档',
};
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
export const DELIVERY_STATES = ['delivered', 'pending', 'failed', 'missing'];
export const DELIVERY_STATE_LABEL = {
    delivered: '已确认送达',
    pending: '已发出·未确认',
    failed: '失败',
    missing: '无从确认',
};
/** 送达状态的色调（`pending` 是 warn 而不是 error：它可能已经成功了）。 */
export const DELIVERY_STATE_TONE = {
    delivered: 'ok',
    pending: 'warn',
    failed: 'error',
    missing: 'muted',
};
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
];
/** 标注的中文名。 */
export const JOB_FLAG_LABEL = {
    outsourcing: '疑似外包',
    fraud: '高风险',
    zombie: '僵尸岗位',
    salary_inflation: '薪资虚标',
    jargon_hit: '黑话',
};
/**
 * 岗位库的排序字段（请求参数 `orderBy`）。
 *
 * 取值域与界面下拉同住一个文件：界面能选的与宿主接受的必须是**同一个集合** ——
 * 曾经宿主在一个数组里校验（`routes/jobs.ts`）、另在 `JobQuery` 里写了一遍联合类型、
 * 客户端再在一个数组里渲染下拉，三处的顺序还各不相同。
 */
export const JOB_ORDER_VALUES = ['crawled_at', 'salary_min', 'title', 'last_seen_at', 'first_seen_at'];
/** 排序下拉的选项。**数组顺序就是下拉里的顺序**。 */
export const JOB_ORDER_OPTIONS = [
    { value: 'crawled_at', label: '按抓取时间' },
    { value: 'salary_min', label: '按月薪' },
    { value: 'last_seen_at', label: '按最近出现' },
    { value: 'first_seen_at', label: '按首次出现' },
    { value: 'title', label: '按标题' },
];
/** 「今日新增」的口径：24 小时。与 `JOB_NEW_WINDOWS` 里的 `'1d'` 是**同一个数**。 */
export const TODAY_NEW_WINDOW_HOURS = 24;
/**
 * 「只看新增」的时间窗。
 *
 * 24 小时那一档**必须与首屏「今日新增」同口径**（就是上面的 `TODAY_NEW_WINDOW_HOURS`）——
 * 写成"今天零点"会让首屏说 12 条、列表筛出 3 条，而两者看的是同一列 `first_seen_at`，
 * 用户只会以为其中之一坏了。两处引用同一个常量，所以漂移不了。
 */
export const JOB_NEW_WINDOWS = [
    { value: '1d', label: '近 24 小时', hours: TODAY_NEW_WINDOW_HOURS },
    { value: '3d', label: '近 3 天', hours: 72 },
    { value: '7d', label: '近 7 天', hours: 168 },
];
//# sourceMappingURL=job.js.map