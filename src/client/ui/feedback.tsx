/**
 * 「一次动作的进行中 / 结果」这一小块反馈状态 —— 今日屏（U0）与采集屏（U9）逐字重复过同一份。
 *
 * 放在 `ui/` 而不是某个屏里：两个屏都要用，谁 import 谁都会形成屏之间的单向依赖
 * （与 `views/freshness.tsx` 同样的理由）。
 */
export interface Feedback {
  running: boolean
  tone: 'ok' | 'error'
  message: string | null
}

export const IDLE: Feedback = { running: false, tone: 'ok', message: null }
