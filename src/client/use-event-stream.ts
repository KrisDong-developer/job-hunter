import { useEffect, useRef, useState } from 'react'
import { ROUTE_PREFIX } from '../shared/constants.js'

export type StreamStatus = 'connecting' | 'open' | 'closed'

/**
 * SSE 客户端。
 *
 * **ADR-24：事件只作提示，前端不靠事件构建状态。**
 * 所以这里只做一件事：收到任何事件就调用 `onHint(type)`，
 * 由调用方决定「去重新拉一次」。带 `resync` 类型的事件意味着宿主的有界缓冲接不上了，
 * 调用方应当整体重拉 —— 最坏也只是延迟，不会状态错乱。
 */
export function useEventStream(onHint: (type: string) => void): {
  status: StreamStatus
  lastEventAt: string | null
} {
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)

  // 用 ref 保存最新回调，避免因为回调换身份而重连
  const hintRef = useRef(onHint)
  hintRef.current = onHint

  useEffect(() => {
    const source = new EventSource(`${ROUTE_PREFIX}/events`)

    source.onopen = () => {
      setStatus('open')
    }
    source.onerror = () => {
      // EventSource 自己会重连；这里只反映「当前断了」
      setStatus('closed')
    }
    source.onmessage = (event: MessageEvent<string>) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(event.data) as unknown
      } catch {
        return
      }
      if (parsed === null || typeof parsed !== 'object') return
      const record = parsed as Record<string, unknown>
      const type = typeof record['type'] === 'string' ? record['type'] : 'unknown'
      setLastEventAt(typeof record['at'] === 'string' ? record['at'] : new Date().toISOString())
      hintRef.current(type)
    }

    // §5.5：同一浏览器可能开多个标签，每个标签一条 SSE；离开时主动断开
    const closeOnUnload = (): void => {
      source.close()
    }
    window.addEventListener('beforeunload', closeOnUnload)

    return () => {
      window.removeEventListener('beforeunload', closeOnUnload)
      source.close()
    }
  }, [])

  return { status, lastEventAt }
}
