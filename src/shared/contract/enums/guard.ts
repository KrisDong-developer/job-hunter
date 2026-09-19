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
export const ACTORS = ['gui', 'model', 'schedule', 'user'] as const

export type Actor = (typeof ACTORS)[number]

export const ACTOR_LABEL: Record<Actor, string> = {
  gui: '界面上的你',
  model: '模型（对话里发起）',
  schedule: '定时任务',
  user: '用户',
}

/**
 * 审计记录里的发起者 → 人话。
 *
 * 入参是 `string` 而不是 `Actor`：审计表是**历史数据**，里面可能留着旧版本写入的
 * 取值（或将来新增的键）。认不出来就原样返回 —— 不假装认识，也不显示成空白。
 */
export function actorLabel(actor: string): string {
  return (ACTOR_LABEL as Record<string, string>)[actor] ?? actor
}
