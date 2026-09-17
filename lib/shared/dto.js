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
];
//# sourceMappingURL=dto.js.map