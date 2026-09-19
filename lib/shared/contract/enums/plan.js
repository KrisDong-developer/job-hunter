/**
 * plan 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * SR-17：跳过原因枚举。**界面显示人话，不显示这个英文键**。
 *
 * 枚举而不是自由文本：自由文本最后一定会退化成"已武装"这种什么都没说的话，
 * 而"为什么没跑"恰恰是用户最需要知道的。
 */
export const SKIP_REASONS = [
    'not_logged_in',
    'adapter_broken',
    'risk_paused',
    'lease_lost',
    'offline_gate',
    'outside_window',
    'quota_reached',
    'another_run_active',
    'backoff',
    'global_pause',
    'plan_disabled',
    /**
     * SR-46：单轮预算用完，**这一轮**轮不到它了（不是它自己的问题）。
     *
     * 与 `quota_reached` 的区别很关键：后者是"今天（对这个平台）别来了"，
     * 前者是"这一轮到此为止"——下一轮的顺序按新鲜度重排，它很可能排到最前面。
     * 混成一个键会让用户以为平台被限了，去查一个根本不存在的问题。
     */
    'round_budget',
    /**
     * 方案配了城市、而这个平台不认识它（取值域封闭且表里没有）。
     *
     * 这是**配置层面的必败**：适配器的 buildSearchUrl 会直接拒绝（不猜城市码），
     * 以前这种平台每个调度日都要真跑一次、烧一条注定失败的 crawl_run 再进冷却 ——
     * 现在在门前就拦下，带原因留痕（与保存方案时的 notice ④ 说的是同一件事）。
     */
    'city_unsupported',
];
/**
 * 跳过原因 → 人话（SR-17：界面显示人话，不显示枚举键）。
 *
 * 与取值域同住在这里，而不是住在调度器里：它是**给用户看的文案**，
 * 而且 `GET /schedule/skip-reasons` 直接把这张表下发给界面 ——
 * 文案与取值域分居两处时，改一个键就会漏改一处（曾经就是这样：取值域在 shared、
 * 文案在 `scheduler/index.ts`）。
 */
export const SKIP_REASON_LABEL = {
    not_logged_in: '平台未登录 —— 去「采集」页点登录',
    adapter_broken: '适配器已失效（连续失败达阈值）—— 需要人工修复选择器',
    risk_paused: '该平台被风控暂停 —— 需要人工确认才恢复',
    lease_lost: '本实例不持有租约（另一个实例在跑）—— 只读实例不抓取',
    offline_gate: '离线模式已开启（DSH_JOB_HUNTER_NO_NETWORK）—— 不发起真实访问',
    outside_window: '还没到偏好时段（或已错过，等下一轮）',
    quota_reached: '今天的抓取次数已达上限',
    another_run_active: '已经有一轮抓取在跑 —— 同时只允许一个',
    backoff: '上一轮失败了，正在退避等待',
    global_pause: '定时已被一键暂停 —— 手动「立即采集」仍然可用',
    plan_disabled: '方案已停用，或它的定时开关是关的',
    round_budget: '本轮已到时限（单轮预算用完）—— 剩下的平台留到下一轮',
    city_unsupported: '方案配的城市这个平台不认识 —— 抓了也必失败，已自动跳过（改城市或去掉该平台）',
};
/** 触发原因（`crawl_run.reason`）—— 运行历史里要说清"这次是谁让它跑的"。 */
export const RUN_REASONS = ['schedule', 'manual', 'catch-up'];
export const RUN_REASON_LABEL = {
    schedule: '定时',
    manual: '手动',
    'catch-up': '补跑',
};
/** 触发原因的中文标签；不认识的取值**原样返回**（不静默变成"—"）。 */
export function runReasonLabel(reason) {
    if (reason === null || reason === '')
        return null;
    return RUN_REASON_LABEL[reason] ?? reason;
}
/** 配置作用域（§4.3 `config`：全局 / 平台 / 方案）。 */
export const SETTING_SCOPES = ['global', 'platform', 'plan'];
//# sourceMappingURL=plan.js.map