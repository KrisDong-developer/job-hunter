/** guard 的公共类型（§4.4）。 */

/** 谁发起的。审计与审批策略都看它。 */
export type Actor = 'gui' | 'model' | 'schedule' | 'user'

/** 危险级。`high` 或 `actor==='model'` 必过审批（§4.4 检查链第 5 项）。 */
export type Danger = 'low' | 'mid' | 'high'

/** 被拒绝的原因分类（对应 §9 的 `GUARD_DENIED.reason`）。 */
export type GuardDeniedReason =
  | 'switch'
  | 'stealth'
  | 'quota'
  | 'cooldown'
  | 'approval'
  | 'batch'
  | 'forbidden'
  | 'bypassed'

export interface GuardTarget {
  jobId?: number
  platformId?: string
  companyId?: number
}

export interface GuardInput {
  /** 稳定动作名，如 `greeting.send` / `application.send` / `settings.write`。 */
  action: string
  actor: Actor
  danger: Danger
  target?: GuardTarget
  /**
   * 用于审批展示与审计**摘要**的载荷。
   * 注意：正文（话术全文、简历全文）只用于**审批展示**，审计里只留摘要与长度。
   */
  payload?: Record<string, unknown>
  /**
   * 界面的**二次确认**标记：用户在 GUI 里看过确认文案并点了"确认"。
   *
   * 两条硬约束（见 `guard/index.ts`）：
   *   1. 只有 `actor === 'gui'` 能置位 —— 模型工具、定时任务置位会被直接拒绝并审计；
   *   2. 第一次请求不带它，guard 抛 `NEEDS_CONFIRM`（不是"拒绝"），
   *      界面把确认文案显示给用户，用户同意后重发同一个请求并带上它。
   *
   * 这样 GUI 与模型走的是**同一道闸门**，只是"问"的方式不同：
   * 模型问 `ctx.approval`，界面问用户自己（两段式 HTTP）。
   */
  guiConfirmed?: boolean
}
