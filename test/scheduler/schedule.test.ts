import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  effectiveWeekdays,
  insideWindow,
  missedRun,
  nextRunAt,
  previousRunAt,
  stableRatio,
  windowKeyOf,
  windowLengthMin,
  windowOffsetMin,
} from '../../src/host/scheduler/schedule.js'
import { DEFAULT_SCHEDULE } from '../../src/host/store/repo/plans.js'
import type { PlanSchedule } from '../../src/shared/dto.js'

/**
 * 全部用**本地时间分量**构造日期（`new Date(y, m, d, h, min)`），
 * 断言也只比对本地分量 —— 这样测试在任何时区都成立，不会因为 CI 在 UTC 就红。
 *
 * D-19 之后这里测的不再是"某个固定时刻"，而是**偏好时段**：
 *   * 触发点必须落在 `[windowStart, windowEnd)` 之内；
 *   * 同一个窗口内**恒定**（否则 `next_run_at` 落库就没意义，定时器还会自旋）；
 *   * 不同窗口**互不相同**（SR-1：连续 5 天触发时刻互不相同）。
 */
const schedule = (patch: Partial<PlanSchedule> = {}): PlanSchedule => ({
  ...DEFAULT_SCHEDULE,
  weekdays: [],
  jitterMs: 0,
  missedGraceMs: 0,
  ...patch,
})

/** 把触发点换算成"当天第几分钟"，方便断言"落在窗口内"。 */
function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

const PLAN_ID = 7

test('SR-1：触发点落在窗口内，不是窗口起点（除非哈希恰好为 0）', () => {
  const config = schedule({ windowStartHour: 9, windowStartMinute: 0, windowEndHour: 11, windowEndMinute: 0 })
  const from = new Date(2026, 8, 16, 8, 0)
  const next = nextRunAt(config, from, PLAN_ID)

  assert.equal(next.getDate(), 16, '8 点时启动，窗口在今天 9:00–11:00 内')
  assert.ok(minuteOfDay(next) >= 9 * 60, `触发点 ${next.toISOString()} 不该早于窗口起点`)
  assert.ok(minuteOfDay(next) < 11 * 60, `触发点 ${next.toISOString()} 不该晚于窗口终点`)
  assert.ok(next.getTime() > from.getTime())
})

test('SR-1：连续 5 天的触发时刻互不相同，且都在窗口内', () => {
  const config = schedule({ windowStartHour: 9, windowEndHour: 11 })
  const seen = new Set<string>()
  let from = new Date(2026, 8, 14, 0, 0) // 周一 0 点起

  for (let day = 0; day < 5; day += 1) {
    const next = nextRunAt(config, from, PLAN_ID)
    const minute = minuteOfDay(next)
    assert.ok(minute >= 9 * 60 && minute < 11 * 60, `第 ${day + 1} 天落点 ${String(minute)} 不在窗口内`)
    seen.add(`${String(next.getMonth())}-${String(next.getDate())}T${String(minute)}`)
    // 从"这一天的窗口结束之后"再找下一个，模拟一夜过去
    from = new Date(next.getFullYear(), next.getMonth(), next.getDate(), 12, 0)
  }

  assert.equal(seen.size, 5, `五天应当有五个不同的触发点，实际 ${String(seen.size)} 个：${[...seen].join(', ')}`)
})

test('同一个窗口反复计算得到**同一个**触发点（否则 next_run_at 落库没意义、定时器会自旋）', () => {
  const config = schedule({ windowStartHour: 9, windowEndHour: 11 })
  const from = new Date(2026, 8, 16, 8, 0)
  const first = nextRunAt(config, from, PLAN_ID)
  const second = nextRunAt(config, from, PLAN_ID)
  const third = nextRunAt(config, from, PLAN_ID)
  assert.equal(first.getTime(), second.getTime())
  assert.equal(second.getTime(), third.getTime())
})

test('不同方案在同一窗口落在不同分钟（避免每天都同时到期）', () => {
  const config = schedule({ windowStartHour: 9, windowEndHour: 11 })
  const from = new Date(2026, 8, 16, 8, 0)
  const a = nextRunAt(config, from, 1)
  const b = nextRunAt(config, from, 2)
  assert.notEqual(a.getTime(), b.getTime())
})

test('已经过了今天的窗口就推到下一个工作日', () => {
  // 2026-09-16 是星期三
  const config = schedule({ windowStartHour: 9, windowEndHour: 11, weekdays: [1, 3, 5] })
  const from = new Date(2026, 8, 16, 12, 0) // 周三中午，窗口已过
  const next = nextRunAt(config, from, PLAN_ID)
  assert.equal(next.getDay(), 5, '下一个是周五')
  assert.ok(next.getTime() > from.getTime())
})

test('窗口内的时刻即使还没到触发点，也仍然算"在窗口里"（SR-3 的 outside_window 判定）', () => {
  const config = schedule({ windowStartHour: 9, windowEndHour: 11 })
  assert.equal(insideWindow(config, new Date(2026, 8, 16, 9, 0)), true)
  assert.equal(insideWindow(config, new Date(2026, 8, 16, 10, 59)), true)
  assert.equal(insideWindow(config, new Date(2026, 8, 16, 11, 0)), false, '终点是开区间')
  assert.equal(insideWindow(config, new Date(2026, 8, 16, 8, 59)), false)
})

test('跨零点窗口：22:00–次日 02:00 在凌晨仍然算"在窗口里"', () => {
  const config = schedule({ windowStartHour: 22, windowEndHour: 2 })
  assert.equal(windowLengthMin(config), 4 * 60)
  assert.equal(insideWindow(config, new Date(2026, 8, 16, 23, 30)), true)
  // 17 日凌晨 1 点：窗口在 16 日 22:00 打开，还没关
  assert.equal(insideWindow(config, new Date(2026, 8, 17, 1, 0)), true)
  assert.equal(insideWindow(config, new Date(2026, 8, 17, 3, 0)), false)
})

test('空 weekdays 视为每天，非空只挑指定的那几天', () => {
  assert.equal(effectiveWeekdays(schedule({ weekdays: [] })).length, 7)
  assert.deepEqual(effectiveWeekdays(schedule({ weekdays: [1, 3] })), [1, 3])
  // 2026-09-16 是星期三
  const wednesday = new Date(2026, 8, 16, 10, 0)
  const next = nextRunAt(schedule({ windowStartHour: 9, windowEndHour: 11, weekdays: [1] }), wednesday, PLAN_ID)
  assert.equal(next.getDay(), 1, '下一个周一')
})

test('窗口长度与随机偏移永远留出至少 1 分钟余量', () => {
  const config = schedule({ windowStartHour: 9, windowEndHour: 11 })
  assert.equal(windowLengthMin(config), 120)
  for (const key of ['a', 'b', 'c', 'd', 'e']) {
    const offset = windowOffsetMin(config, key)
    assert.ok(offset >= 0 && offset < 120, `偏移 ${String(offset)} 越界`)
  }
})

test('稳定哈希：同一个 key 恒定，不同 key 大概率不同', () => {
  assert.equal(stableRatio('2026-09-16#1'), stableRatio('2026-09-16#1'))
  const values = new Set(['2026-09-14#1', '2026-09-15#1', '2026-09-16#1', '2026-09-17#1', '2026-09-18#1'].map(stableRatio))
  assert.equal(values.size >= 4, true, `五个窗口的哈希应当基本不同，实际 ${String(values.size)} 个`)
  assert.equal(windowKeyOf(new Date(2026, 8, 6), 3), '2026-09-06#3')
})

test('抖动只往后加，不会提前', () => {
  const from = new Date(2026, 8, 16, 8, 0)
  const config = schedule({ windowStartHour: 9, windowEndHour: 11 })
  const base = nextRunAt(config, from, PLAN_ID)
  const jittered = nextRunAt(config, from, PLAN_ID, { jitterMs: 7 * 60 * 1000 })
  assert.equal(jittered.getTime() - base.getTime(), 7 * 60 * 1000)
})

test('上一个触发点：往回找最近的那个，且落在窗口内', () => {
  const config = schedule({ windowStartHour: 7, windowEndHour: 8 })
  const now = new Date(2026, 8, 16, 8, 30)
  const previous = previousRunAt(config, now, PLAN_ID)
  assert.ok(previous !== null)
  assert.equal(previous.getDate(), 16)
  assert.ok(minuteOfDay(previous) >= 7 * 60 && minuteOfDay(previous) < 8 * 60)
})

test('错过判定：既要有理论触发点，也要超过宽限期', () => {
  const now = new Date(2026, 8, 16, 10, 0)
  const config = schedule({ windowStartHour: 7, windowEndHour: 8, missedGraceMs: 60 * 60 * 1000 })
  const expected = previousRunAt(config, now, PLAN_ID)
  assert.ok(expected !== null)
  assert.equal(expected.getDate(), 16, '今天 7–8 点的窗口已经过去了')

  // 昨天跑过 → 今天这一轮没跑，且已过宽限
  const missed = missedRun(config, new Date(2026, 8, 15, 9, 0).toISOString(), now, PLAN_ID)
  assert.equal(missed.missed, true)
  assert.equal(missed.expectedAt?.getTime(), expected.getTime())

  // 刚好在窗口终点跑过 → 没过宽限期（相对于"现在"只差 2 小时，但仍要看宽限）
  const recent = missedRun(config, new Date(2026, 8, 16, 8, 30).toISOString(), now, PLAN_ID)
  assert.equal(recent.missed, false, '30 分钟前刚跑过，没过 1 小时宽限')

  // 今天窗口内跑过 → 没有跳过任何一轮
  const onTime = missedRun(config, new Date(expected.getTime() + 60_000).toISOString(), now, PLAN_ID)
  assert.equal(onTime.missed, false)
})

test('从没跑过的方案不算「错过」—— 新装不骚扰', () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const verdict = missedRun(schedule({ windowStartHour: 7, windowEndHour: 7, missedGraceMs: 1 }), null, now, PLAN_ID)
  assert.equal(verdict.missed, false)
})
