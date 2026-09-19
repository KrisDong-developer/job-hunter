import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../net/client.js'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; message: string; hint: string | undefined }

/**
 * 「拉一次数据」的统一状态机：加载 / 成功 / 失败三态齐全（§13 每屏都要有）。
 *
 * 注意 `deps` 是**显式**传进来的，`loader` 故意不进依赖数组 ——
 * 它每次渲染都是新函数，放进去会无限重拉。约定：`loader` 只依赖 `deps` 里那几项。
 *
 * ## keepPrevious（第四轮，审核 P2-6）
 *
 * 默认行为是"重取即退回 loading 态"，于是每次翻页 / 改筛选 / 外部刷新，
 * 列表都会**整块消失再出现**。分栏屏里这一下正好打断"左列表 + 右详情"的对照阅读。
 * 打开 `keepPrevious` 后：重取期间 `state` 仍是上一次的成功结果（不闪），
 * 同时用 `refreshing` 告诉界面"这是旧数据，正在更新"。
 * 首次加载与失败仍走 loading / error —— 没有旧数据可留，或者错误必须马上被看见。
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: { keepPrevious?: boolean } = {},
): { state: AsyncState<T>; reload: () => void; refreshing: boolean } {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  /**
   * 读当前状态而不把 `state` 放进依赖数组：effect 只在 deps 变化时装一次，
   * 它需要知道"上一次成功过没有"才能决定是保留还是清空 —— 而这个判断
   * 每轮 effect 都要看最新值。用 ref 读，避免自己触发自己。
   */
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const controller = new AbortController()
    const keep = options.keepPrevious === true && stateRef.current.status === 'ok'
    if (keep) setRefreshing(true)
    else setState({ status: 'loading' })
    loader(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setState({ status: 'ok', data })
        setRefreshing(false)
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error),
          hint: error instanceof ApiError ? error.hint : undefined,
        })
        setRefreshing(false)
      },
    )
    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  return { state, reload, refreshing }
}
