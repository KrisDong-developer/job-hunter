import { useCallback, useEffect, useState } from 'react'
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
 */
export function useAsync<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): { state: AsyncState<T>; reload: () => void } {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    loader(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setState({ status: 'ok', data })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          message: error instanceof ApiError ? error.message : error instanceof Error ? error.message : String(error),
          hint: error instanceof ApiError ? error.hint : undefined,
        })
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

  return { state, reload }
}
