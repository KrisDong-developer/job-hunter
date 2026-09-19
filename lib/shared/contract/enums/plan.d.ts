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
export declare const SKIP_REASONS: readonly ["not_logged_in", "adapter_broken", "risk_paused", "lease_lost", "offline_gate", "outside_window", "quota_reached", "another_run_active", "backoff", "global_pause", "plan_disabled", "round_budget", "city_unsupported"];
export type SkipReason = (typeof SKIP_REASONS)[number];
/**
 * 跳过原因 → 人话（SR-17：界面显示人话，不显示枚举键）。
 *
 * 与取值域同住在这里，而不是住在调度器里：它是**给用户看的文案**，
 * 而且 `GET /schedule/skip-reasons` 直接把这张表下发给界面 ——
 * 文案与取值域分居两处时，改一个键就会漏改一处（曾经就是这样：取值域在 shared、
 * 文案在 `scheduler/index.ts`）。
 */
export declare const SKIP_REASON_LABEL: Record<SkipReason, string>;
/** 触发原因（`crawl_run.reason`）—— 运行历史里要说清"这次是谁让它跑的"。 */
export declare const RUN_REASONS: readonly ["schedule", "manual", "catch-up"];
export type RunReasonKey = (typeof RUN_REASONS)[number];
export declare const RUN_REASON_LABEL: Record<RunReasonKey, string>;
/** 触发原因的中文标签；不认识的取值**原样返回**（不静默变成"—"）。 */
export declare function runReasonLabel(reason: string | null): string | null;
/** 配置作用域（§4.3 `config`：全局 / 平台 / 方案）。 */
export declare const SETTING_SCOPES: readonly ["global", "platform", "plan"];
export type SettingScope = (typeof SETTING_SCOPES)[number];
//# sourceMappingURL=plan.d.ts.map