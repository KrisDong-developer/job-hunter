/**
 * guard 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * 动作发起者（`audit_log.actor`、审批提示、待确认动作）。
 *
 * 为什么跨半边：它出现在审计记录与"待确认动作"两处**响应**里，界面必须把
 * `gui` / `model` 显示成「界面上的你 / 模型」—— 取值域与文案都得是同一份，
 * 否则界面只能把英文键直接印给用户（这件事曾经真的发生过：审计表格显示 `gui`）。
 */
export declare const ACTORS: readonly ["gui", "model", "schedule", "user"];
export type Actor = (typeof ACTORS)[number];
export declare const ACTOR_LABEL: Record<Actor, string>;
/**
 * 审计记录里的发起者 → 人话。
 *
 * 入参是 `string` 而不是 `Actor`：审计表是**历史数据**，里面可能留着旧版本写入的
 * 取值（或将来新增的键）。认不出来就原样返回 —— 不假装认识，也不显示成空白。
 */
export declare function actorLabel(actor: string): string;
/** 状态徽章的色调（与 `jh-tone-*` 对应）。 */
export type AuditTone = 'ok' | 'warn' | 'error';
/**
 * 审计记录的**结果**取值（`audit_log.result`）、中文标签与色调。
 *
 * 与上面的 `ACTORS` 同一个理由 —— 它出现在审计表里，界面必须把它变成人话。
 * 这张表曾经把 `ok` / `denied` / `error` 原样印给用户（"审计表格显示 `gui`"那件事的
 * 同一类问题），而且 `error` 与 `denied` 共用一个警示色：
 *   * `denied` 是"规则按预期拦住了"（正常，甚至是我们想要的）；
 *   * `error` 是"这一趟没跑完"（要查）。
 * 两者混成一个颜色就等于把"一切正常"和"出事了"画成同一种。
 */
export declare const AUDIT_RESULTS: readonly ["ok", "denied", "error"];
export type AuditResult = (typeof AUDIT_RESULTS)[number];
export declare const AUDIT_RESULT_LABEL: Record<AuditResult, string>;
export declare const AUDIT_RESULT_TONE: Record<AuditResult, AuditTone>;
/**
 * 审计结果 → 人话 / 色调。
 *
 * 入参是 `string`：审计表是**历史数据**，里面可能留着旧版本写入的取值。
 * 认不出来就原样返回（`actorLabel` 同一条纪律）—— 不假装认识，也不显示成空白。
 */
export declare function auditResultLabel(result: string): string;
export declare function auditResultTone(result: string): AuditTone;
//# sourceMappingURL=guard.d.ts.map