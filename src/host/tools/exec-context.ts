/**
 * 「当前这次工具调用是谁在跑」——审批要用，但工具实现本身不关心。
 *
 * 为什么需要：`ctx.approval.request` 要求**必须**带 `agent`（活对象）与 `toolName`，
 * 否则宿主直接拒绝（"no open turn"）。这两个东西只有工具执行时才知道，
 * 而 guard 的审批端口是在装配期就建好的。
 * 用 `AsyncLocalStorage` 把它们传下去，比把 agent 一路塞进每个领域函数干净得多
 * —— 领域层**不该**知道"模型"这件事存在。
 *
 * 活数据规则：`agent` 在这里只是**原样转发**给宿主服务，绝不读它的字段。
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface ToolExecInfo {
  toolName: string
  /** 不透明活对象，仅转发给 `ctx.approval`。 */
  agent: unknown
  callId?: string | undefined
  signal?: AbortSignal | undefined
}

const storage = new AsyncLocalStorage<ToolExecInfo>()

export const toolExec = {
  run<T>(info: ToolExecInfo, fn: () => Promise<T>): Promise<T> {
    return storage.run(info, fn)
  },
  current(): ToolExecInfo | undefined {
    return storage.getStore()
  },
  /** 供测试/诊断：当前是否处于工具调用内。 */
  active(): boolean {
    return storage.getStore() !== undefined
  },
}
