import { useRef } from 'react'
import type { AsyncState } from './use-async.js'

/**
 * 重新拉取期间沿用**上一次成功**的数据。
 *
 * `useAsync` 的 `reload()` 会把状态打回 `loading`，而本屏的内容整块挂在
 * `data !== null` 上 —— 于是每次点完「立即采集 / 忽略」界面都会闪成一句
 * 「正在读取今日概况…」，连刚写进去的执行结果也一起消失。
 *
 * 这里只兜住这一次闪断：加载中接着显示上一次的数据；**出错则不给旧数据**，
 * 那时界面该如实报错，而不是继续把过期的"今天"摆在那里。
 */
export function useSticky<T>(state: AsyncState<T>): T | null {
  const last = useRef<T | null>(null)
  if (state.status === 'ok') last.current = state.data
  return state.status === 'ok' ? state.data : state.status === 'loading' ? last.current : null
}
