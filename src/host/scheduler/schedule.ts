/**
 * 排程计算 —— **纯函数**，不碰时钟也不碰定时器，方便把边界算清楚。
 *
 * 时间语义：窗口起止都是**本地墙钟**（`getHours()` 这一族）。
 * 用户说「工作日早上九点到十一点之间跑」指的就是他所在时区的九点到十一点。
 *
 * ## 为什么不是一个固定时刻（D-19 / SR-1）
 *
 * 固定时刻 + 每天同一分钟是最容易被识别的模式（R18 / D-17）。
 * 所以配置的是一段**偏好时段**，窗口打开后在窗口内**随机**选点，窗口内最多一次。
 *
 * ## 随机点为什么是确定性哈希而不是 `Math.random()`
 *
 * `next_run_at` 要落库（NFR-4），而同一个窗口可能会被反复计算 —— 启动一次、
 * 每次 tick 一次、`status()` 查询一次。如果用 `Math.random()`，每次算出来都不一样：
 *   1. 界面上"下次运行"会在刷新之间自己跳动，用户没法判断到底什么时候跑；
 *   2. **定时器会自旋** —— 武装到 A 点，tick 时重算却得到 B 点，永远追不上。
 * 用 `hash(windowKey)` 就得到"同一个窗口里恒定、不同窗口里不同"的随机点，
 * 既满足"连续 5 天触发时刻互不相同"，也满足"落库之后不再变"。
 */
import type { PlanSchedule } from '../../shared/contract/dto/plan.js'
import { formatHourMinute } from '../../shared/text/time-format.js'

/** 空 weekdays 视为每天。 */
export function effectiveWeekdays(schedule: PlanSchedule): number[] {
  return schedule.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : schedule.weekdays
}

/** 窗口起止换算成"当天第几分钟"。 */
function windowBounds(schedule: PlanSchedule): { start: number; end: number } {
  const start = schedule.windowStartHour * 60 + schedule.windowStartMinute
  const end = schedule.windowEndHour * 60 + schedule.windowEndMinute
  return { start, end }
}

/** 窗口长度（分钟）。跨零点按 24 小时绕回来；零长度窗口给一个**保底 1 分钟**。 */
export function windowLengthMin(schedule: PlanSchedule): number {
  const { start, end } = windowBounds(schedule)
  const length = end > start ? end - start : end + 24 * 60 - start
  return Math.max(1, length)
}

/** 这一天窗口的起点（本地日历日 + 窗口起点）。 */
function windowStartOn(day: Date, schedule: PlanSchedule): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    schedule.windowStartHour,
    schedule.windowStartMinute,
    0,
    0,
  )
}

/**
 * 稳定哈希：把窗口标识（`YYYY-MM-DD#planId`）映射到 `[0, 1)`。
 *
 * 用 FNV-1a 而不是"取字符串长度"之类的简写：简写会让相邻窗口落到相近的偏移，
 * 看起来就像"每天几乎同一分钟"——那正是要避免的模式。
 */
export function stableRatio(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    // FNV 质数 16777619，用移位加法等价表达，避免 32 位溢出后的符号问题
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0
  }
  return hash / 0x1_0000_0000
}

/**
 * 窗口内触发的偏移分钟数。
 *
 * 偏移落在 `[0, windowLengthMin)`，并保证**至少留 1 分钟余量**（否则触点和窗口终点重合，
 * 看起来像"窗口没生效"）。
 */
export function windowOffsetMin(schedule: PlanSchedule, key: string): number {
  const length = windowLengthMin(schedule)
  const span = Math.max(1, length - 1)
  return Math.floor(stableRatio(key) * span)
}

/** 窗口标识 —— 同一个窗口内恒定。 */
export function windowKeyOf(day: Date, planId: number): string {
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${String(day.getFullYear())}-${month}-${date}#${String(planId)}`
}

/** 某一天的窗口起点 + 该窗口的随机偏移 = 触发点。 */
function triggerOn(day: Date, schedule: PlanSchedule, key: string): Date {
  return new Date(windowStartOn(day, schedule).getTime() + windowOffsetMin(schedule, key) * 60_000)
}

/**
 * `from` 之后的下一个触发时刻（SR-1）。
 *
 * `planId` 参与窗口标识，所以两个方案即使窗口相同也会落在不同分钟上 ——
 * 否则"多方案同时到期"会变成每天都同时到期（SR-4 要求串行，但没必要人为制造同时）。
 */
export function nextRunAt(
  schedule: PlanSchedule,
  from: Date,
  planId: number,
  options: { jitterMs?: number } = {},
): Date {
  const weekdays = effectiveWeekdays(schedule)
  for (let offset = 0; offset <= 9; offset += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, 0, 0, 0, 0)
    if (!weekdays.includes(day.getDay())) continue
    const key = windowKeyOf(day, planId)
    const at = triggerOn(day, schedule, key)
    if (at.getTime() <= from.getTime()) continue
    return new Date(at.getTime() + (options.jitterMs ?? 0))
  }
  // 十天内必有匹配的工作日，这里只是兜底
  return new Date(from.getTime() + 24 * 60 * 60 * 1000)
}

/** `now` 之前最近的那个理论触发点（可能就在今天）。 */
export function previousRunAt(schedule: PlanSchedule, now: Date, planId: number): Date | null {
  const weekdays = effectiveWeekdays(schedule)
  for (let offset = 0; offset <= 9; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 0, 0, 0, 0)
    if (!weekdays.includes(day.getDay())) continue
    const at = triggerOn(day, schedule, windowKeyOf(day, planId))
    if (at.getTime() > now.getTime()) continue
    return at
  }
  return null
}

/**
 * `now` 所在窗口的**起点**（SR-6：时钟跳变后用它重算，不做补偿）。
 *
 * 返回 null 表示"现在不在任何窗口里"（窗口外）。
 */
export function currentWindowStart(schedule: PlanSchedule, now: Date): Date | null {
  const weekdays = effectiveWeekdays(schedule)
  for (let offset = 0; offset <= 1; offset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 0, 0, 0, 0)
    if (!weekdays.includes(day.getDay())) continue
    const start = windowStartOn(day, schedule)
    const end = new Date(start.getTime() + windowLengthMin(schedule) * 60_000)
    if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) return start
  }
  return null
}

/** 某个时刻是否落在触发窗口内（SR-3：窗口外不跑）。 */
export function insideWindow(schedule: PlanSchedule, now: Date): boolean {
  return currentWindowStart(schedule, now) !== null
}

export interface MissedRunVerdict {
  missed: boolean
  /** 被错过的那个理论触发时刻。 */
  expectedAt: Date | null
}

/**
 * 启动时判断「这一轮是不是被错过了」（C9 / §4.6）。
 *
 * 三条都要成立才算错过：
 *   1. 距上次**成功**已经超过 `missedGraceMs`；
 *   2. 期间**确实有一个**理论触发点；
 *   3. 那个触发点之后没有成功过（否则就是没跳过）。
 *
 * 第 2 条很关键：新装的方案 `last_run_at` 是空的，如果只按第 1 条判断，
 * 每次开机都会弹一个「要不要补跑」—— 那是骚扰，不是提醒。
 */
export function missedRun(
  schedule: PlanSchedule,
  lastSuccessAt: string | null,
  now: Date,
  planId: number,
): MissedRunVerdict {
  const expected = previousRunAt(schedule, now, planId)
  if (lastSuccessAt === null) return { missed: false, expectedAt: expected }

  const last = new Date(lastSuccessAt)
  if (Number.isNaN(last.getTime())) return { missed: false, expectedAt: expected }
  if (expected === null) return { missed: false, expectedAt: null }

  const overdue = now.getTime() - last.getTime() > schedule.missedGraceMs
  const skippedOne = last.getTime() < expected.getTime()
  return { missed: overdue && skippedOne, expectedAt: expected }
}

/**
 * 给界面用的一行窗口说明，例如 `工作日 09:00–11:00`。
 *
 * 放在这里（而不是客户端）是为了让**工具返回文本与界面文案同源** ——
 * 对话里说的和面板上写的必须是同一句话。
 */
export function describeWindow(schedule: PlanSchedule, weekdayLabel: string): string {
  const start = formatHourMinute(schedule.windowStartHour, schedule.windowStartMinute)
  const end = formatHourMinute(schedule.windowEndHour, schedule.windowEndMinute)
  const overnight =
    schedule.windowEndHour * 60 + schedule.windowEndMinute <=
    schedule.windowStartHour * 60 + schedule.windowStartMinute
  return `${weekdayLabel} ${start}–${overnight ? '次日 ' : ''}${end}`
}
