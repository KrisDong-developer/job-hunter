/**
 * 实时事件总线 + SSE 线格式（§4.7 `/events`、§5.5、ADR-24）。
 *
 * **ADR-24 的约束决定了这里的形状**：事件只作「去重新拉取」的提示，
 * 前端**不得**靠事件流构建状态。所以：
 *   * 宿主只持有**有界**缓冲；
 *   * 客户端带上 `Last-Event-ID`，命中缓冲就补发；
 *   * **命中不了就发 `resync`**，让前端整体重拉。
 * 这样丢事件最坏只是延迟，不会状态错乱。
 */
import { systemClock, type Clock } from '../util/time.js'

export interface BusEvent {
  /** 单调递增；作为 SSE 的 `id:` 字段。 */
  id: number
  type: string
  data: unknown
  at: string
}

export interface ReplayResult {
  events: BusEvent[]
  /** true 表示缓冲里已经没有客户端要的那一段，必须整体重拉。 */
  resync: boolean
}

export interface EventBus {
  publish(type: string, data: unknown): BusEvent
  subscribe(listener: (event: BusEvent) => void): () => void
  /** 从 `lastEventId` 之后补发；`null` 表示新连接（无需补发）。 */
  replay(lastEventId: number | null): ReplayResult
  lastEventId(): number
  /** 当前缓冲里的事件数（诊断用）。 */
  size(): number
  subscriberCount(): number
}

/** 有界缓冲大小。超过就丢最旧的 —— 丢事件的代价只是让前端 resync。 */
export const SSE_BUFFER_SIZE = 200

export function createEventBus(options: { bufferSize?: number; clock?: Clock } = {}): EventBus {
  const limit = Math.max(1, options.bufferSize ?? SSE_BUFFER_SIZE)
  const clock = options.clock ?? systemClock
  const buffer: BusEvent[] = []
  const listeners = new Set<(event: BusEvent) => void>()
  let nextId = 1

  return {
    publish(type, data): BusEvent {
      const event: BusEvent = { id: nextId, type, data, at: clock() }
      nextId += 1
      buffer.push(event)
      while (buffer.length > limit) buffer.shift()
      // 一个监听器抛错不得影响其它监听器，也不得影响发布方
      for (const listener of [...listeners]) {
        try {
          listener(event)
        } catch {
          /* 已由订阅方自己记录 */
        }
      }
      return event
    },

    subscribe(listener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    replay(lastEventId): ReplayResult {
      if (lastEventId === null || !Number.isFinite(lastEventId)) {
        // 新连接：前端本来就会拉一次当前状态，不需要补发
        return { events: [], resync: false }
      }
      const newest = nextId - 1
      if (lastEventId >= newest) return { events: [], resync: false }

      const oldest = buffer[0]?.id
      if (oldest === undefined || oldest > lastEventId + 1) {
        // 缓冲里已经接不上了
        return { events: [], resync: true }
      }
      return { events: buffer.filter((event) => event.id > lastEventId), resync: false }
    },

    lastEventId(): number {
      return nextId - 1
    },

    size(): number {
      return buffer.length
    },

    subscriberCount(): number {
      return listeners.size
    },
  }
}

/**
 * 格式化成 SSE 帧。
 * `data` 用 JSON 编码，且**不能含裸换行** —— 否则会被 SSE 解析成多个 data 行。
 */
export function formatSseFrame(event: BusEvent): string {
  const payload = JSON.stringify({ type: event.type, data: event.data, at: event.at })
  return `id: ${String(event.id)}\nevent: message\ndata: ${payload}\n\n`
}

/** 心跳注释帧，防止中间层把空闲连接掐掉。 */
export const SSE_HEARTBEAT_FRAME = ': ping\n\n'

/** 心跳间隔（§4.7：15s）。 */
export const SSE_HEARTBEAT_MS = 15_000
