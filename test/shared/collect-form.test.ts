import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WEEKDAY_PRESETS,
  clockValueOf,
  formatWindow,
  parseClockValue,
} from '../../src/shared/time-format.js'

/**
 * 偏好时段的时间选择器（界面评审：四个数字框 → 两个原生 time 输入）。
 *
 * 这一对转换函数是**唯一的转换点**，所以边界必须在离线测里钉住 ——
 * 尤其是"没填"与"00:00"必须分得开：前者要提示、后者是合法配置。
 */

test('时/分 ↔ 时间选择器的值：往返一致', () => {
  assert.equal(clockValueOf(9, 0), '09:00')
  assert.equal(clockValueOf(0, 0), '00:00')
  assert.equal(clockValueOf(23, 59), '23:59')
  for (const [hour, minute] of [
    [0, 0],
    [9, 30],
    [12, 5],
    [23, 59],
  ] as const) {
    const text = clockValueOf(hour, minute)
    assert.deepEqual(parseClockValue(text), { hour, minute }, `${text} 往返不一致`)
  }
})

test('解析：合法值接受，前导零可有可无', () => {
  assert.deepEqual(parseClockValue('09:05'), { hour: 9, minute: 5 })
  assert.deepEqual(parseClockValue('9:5'), { hour: 9, minute: 5 })
  assert.deepEqual(parseClockValue(' 23:59 '), { hour: 23, minute: 59 })
})

test('解析：空串返回 null（"没填"不是 00:00）', () => {
  // 这条是整个改动的关键：清空输入框不能被静默当成午夜
  assert.equal(parseClockValue(''), null)
  assert.equal(parseClockValue('   '), null)
})

test('解析：越界一律 null，**不静默钳到边界**', () => {
  // 钳到 23:59 会让"我明明填的是 25:00"变成一次没人发现的静默改动
  assert.equal(parseClockValue('24:00'), null)
  assert.equal(parseClockValue('09:60'), null)
  assert.equal(parseClockValue('-1:00'), null)
  assert.equal(parseClockValue('99:99'), null)
})

test('解析：格式不对一律 null（不猜）', () => {
  assert.equal(parseClockValue('9点'), null)
  assert.equal(parseClockValue('09-00'), null)
  assert.equal(parseClockValue('09:00:00'), null)
  assert.equal(parseClockValue('abc'), null)
})

test('跨零点时段仍然按"次日"呈现（不受这次改动影响）', () => {
  assert.equal(formatWindow(9, 0, 11, 0), '09:00–11:00')
  assert.equal(formatWindow(22, 0, 2, 0), '22:00–次日 02:00')
})

test('运行日预设：四组都是合法且互不相同的组合', () => {
  assert.deepEqual(
    WEEKDAY_PRESETS.map((preset) => preset.key),
    ['workdays', 'weekend', 'all', 'none'],
  )
  for (const preset of WEEKDAY_PRESETS) {
    for (const day of preset.days) {
      assert.equal(Number.isInteger(day) && day >= 0 && day <= 6, true, `${preset.key} 含非法星期 ${day}`)
    }
    assert.equal(new Set(preset.days).size, preset.days.length, `${preset.key} 有重复`)
  }
  assert.deepEqual(WEEKDAY_PRESETS[0]?.days, [1, 2, 3, 4, 5], '工作日 = 周一到周五')
  assert.deepEqual(WEEKDAY_PRESETS[1]?.days, [0, 6], '周末 = 周日与周六')
  assert.equal(WEEKDAY_PRESETS[2]?.days.length, 7, '每天 = 全选')
  assert.deepEqual(WEEKDAY_PRESETS[3]?.days, [], '清空 = 空（空数组在宿主那边等于每天）')
})
