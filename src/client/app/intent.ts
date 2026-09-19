/**
 * 对话 → 面板的意图通道（§22.3「点击后跳转到主面板对应位置」）。
 *
 * 为什么需要它：toolview 卡片渲染在**对话流**里，而岗位详情是**主面板**里的抽屉。
 * 两者之间没有共享的 React 树，也不该为了一个跳转去引一个全局 store。
 * 所以这里只做最小的那件事：记一个待处理的意图 + 通知订阅者。
 *
 * 面板挂载时消费一次，之后每次收到通知都消费 —— 这样"卡片比面板晚挂载"也不丢意图。
 */

export interface PanelIntent {
  jobId: number
  /** `open` = 打开详情抽屉；`draft` = 打开详情并停在话术那一块。 */
  action: 'open' | 'draft'
  at: number
}

let pending: PanelIntent | null = null
const listeners = new Set<(intent: PanelIntent) => void>()

/** 从对话里的卡片发起一次跳转。 */
export function requestPanelIntent(jobId: number, action: PanelIntent['action'] = 'open'): void {
  const intent: PanelIntent = { jobId, action, at: Date.now() }
  pending = intent
  for (const listener of [...listeners]) {
    try {
      listener(intent)
    } catch {
      /* 单个订阅者出错不能影响其余 */
    }
  }
}

/** 订阅意图。返回值取消订阅。 */
export function subscribePanelIntent(listener: (intent: PanelIntent) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 取走待处理的意图（取走即清空，避免重复跳转）。 */
export function consumePanelIntent(): PanelIntent | null {
  const intent = pending
  pending = null
  return intent
}
