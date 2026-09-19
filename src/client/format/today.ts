import { TODO_KIND_LABEL, TODO_LEVEL_LABEL } from '../../shared/enums.js'

/** 待办里能直接动手的类型 → 动作。 */
export function planIdOf(todo: { detail: unknown }): number | null {
  if (todo.detail === null || typeof todo.detail !== 'object') return null
  const value = (todo.detail as { planId?: unknown }).planId
  return typeof value === 'number' ? value : null
}

/**
 * `confirm-action` 待办的**可恢复目标** —— 宿主只接受带 `jobId` 的那些
 * （见 `POST /todos/:id/confirm-actions/resume`）。
 *
 * 正文不入库（§4.1），所以"一键执行"是做不到的：宿主只交回 `{action, target}`，
 * 界面能做的诚实的事是**带用户回到那个岗位**让他重新发起。
 */
export function confirmTargetJobIdOf(todo: { detail: unknown }): number | null {
  if (todo.detail === null || typeof todo.detail !== 'object') return null
  const target = (todo.detail as { target?: unknown }).target
  if (target === null || target === undefined || typeof target !== 'object') return null
  const value = (target as { jobId?: unknown }).jobId
  return typeof value === 'number' ? value : null
}

/** 待办级别 / 类别 → 中文。认不出的键原样返回 —— 不假装认识。 */
export function todoLevelLabel(level: string): string {
  return (TODO_LEVEL_LABEL as Record<string, string>)[level] ?? level
}

export function todoKindLabel(kind: string): string {
  return (TODO_KIND_LABEL as Record<string, string>)[kind] ?? kind
}
