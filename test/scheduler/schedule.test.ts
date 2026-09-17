import assert from 'node:assert/strict'
import { test } from 'node:test'
import { jitterFor, missedRun, nextRunAt, previousRunAt } from '../../src/host/scheduler/schedule.js'
import { DEFAULT_SCHEDULE } from '../../src/host/store/repo/plans.js'
import type { PlanSchedule } from '../../src/shared/dto.js'

/**
 * 全部用**本地时间分量**构造日期（`new Date(y, m, d, h, min)`），
 * 断言也只比对本地分量 —— 这样测试在任何时区都成立，不会因为 CI 在 UTC 就红。
 */
const schedule = (patch: Partial<PlanSchedule> = {}): PlanSchedule => ({
  ...DEFAULT_SCHEDULE,
  weekdays: [],
  jitterMs: 0,
  missedGraceMs: 0,
  ...patch,
})

test('下一个触发点：今天还没到就是今天', () => {
  const from = new Date(2026, 8, 16, 8, 0)
  const next = nextRunAt(schedule({ hour: 9, minute: 30 }), from)
  assert.equal(next.getFullYear(), 2026)
  assert.equal(next.getMonth(), 8)
  assert.equal(next.getDate(), 16)
  assert.equal(next.getHours(), 9)
  assert.equal(next.getMinutes(), 30)
})

test('已经过了今天的点就推到明天', () => {
  const from = new Date(2026, 8, 16, 10, 0)
  const next = nextRunAt(schedule({ hour: 9, minute: 30 }), from)
  assert.equal(next.getDate(), 17)
  assert.equal(next.getHours(), 9)
})

test('恰好在触发那一分钟也要推到下一个周期（不能原地反复触发）', () => {
  const from = new Date(2026, 8, 16, 9, 30)
  const next = nextRunAt(schedule({ hour: 9, minute: 30 }), from)
  assert.ok(next.getTime() > from.getTime())
  assert.equal(next.getDate(), 17)
})

test('只挑指定的星期几', () => {
  // 2026-09-16 是星期三
  const wednesday = new Date(2026, 8, 16, 10, 0)
  assert.equal(wednesday.getDay(), 3)
  const next = nextRunAt(schedule({ hour: 9, minute: 0, weekdays: [1] }), wednesday)
  assert.equal(next.getDay(), 1, '下一个周一')
  assert.ok(next.getTime() > wednesday.getTime())
})

test('空 weekdays 视为每天', () => {
  const from = new Date(2026, 8, 16, 10, 0)
  const next = nextRunAt(schedule({ hour: 11, minute: 0, weekdays: [] }), from)
  assert.equal(next.getDate(), 16)
})

test('抖动只往后加，不会提前', () => {
  const from = new Date(2026, 8, 16, 8, 0)
  const base = nextRunAt(schedule({ hour: 9, minute: 0 }), from)
  const jittered = nextRunAt(schedule({ hour: 9, minute: 0 }), from, 7 * 60 * 1000)
  assert.equal(jittered.getTime() - base.getTime(), 7 * 60 * 1000)
})

test('抖动幅度在配置范围内', () => {
  const config = schedule({ jitterMs: 600_000 })
  assert.equal(jitterFor(config, () => 0), 0)
  assert.equal(jitterFor(config, () => 1), 600_000)
  assert.equal(jitterFor(schedule({ jitterMs: 0 }), () => 1), 0)
})

test('上一个触发点：往回找最近的那个', () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const previous = previousRunAt(schedule({ hour: 7, minute: 0 }), now)
  assert.ok(previous !== null)
  assert.equal(previous.getDate(), 16)
  assert.equal(previous.getHours(), 7)
})

test('错过判定：既要有理论触发点，也要超过宽限期', () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const config = schedule({ hour: 7, minute: 0, missedGraceMs: 60 * 60 * 1000 })

  // 昨天跑过 → 今天 7 点这一轮没跑，且已过宽限
  const missed = missedRun(config, new Date(2026, 8, 15, 7, 0).toISOString(), now)
  assert.equal(missed.missed, true)
  assert.equal(missed.expectedAt?.getHours(), 7)

  // 一小时前刚跑过 → 没过宽限期
  const recent = missedRun(config, new Date(2026, 8, 16, 7, 30).toISOString(), now)
  assert.equal(recent.missed, false)

  // 今天 7 点之后跑过 → 没有跳过任何一轮
  const onTime = missedRun(config, new Date(2026, 8, 16, 7, 5).toISOString(), now)
  assert.equal(onTime.missed, false)
})

test('从没跑过的方案不算「错过」—— 新装不骚扰', () => {
  const now = new Date(2026, 8, 16, 8, 0)
  const verdict = missedRun(schedule({ hour: 7, minute: 0, missedGraceMs: 1 }), null, now)
  assert.equal(verdict.missed, false)
})
