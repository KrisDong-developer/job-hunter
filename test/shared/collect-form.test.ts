import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WEEKDAY_PRESETS,
  clockValueOf,
  formatDuration,
  formatWindow,
  parseClockValue,
} from '../../src/shared/time-format.js'
import {
  emptyForm,
  formOf,
  parseKeywordsText,
  writeOf,
} from '../../src/client/screens/collect.js'
import type { PlanDto } from '../../src/shared/dto.js'

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

/* ── 时长（采集页「最近运行」的耗时列）─────────────────────────────────
   与上面的时间选择器同属共享的时间显示模块，所以放在一起断言。
   它是纯函数，边界必须在这里钉住：负数与非法值宁可返回 null（界面显示 —），
   也不能吐出一个 `-3 秒` —— 那只可能来自系统时钟被往回拨。 */

test('时长：分档到 秒 / 分 / 小时，末位为 0 时不写出来', () => {
  assert.equal(formatDuration(0), '0 秒')
  assert.equal(formatDuration(12_400), '12 秒')
  assert.equal(formatDuration(60_000), '1 分')
  assert.equal(formatDuration(200_000), '3 分 20 秒')
  assert.equal(formatDuration(3_600_000), '1 小时')
  assert.equal(formatDuration(3_900_000), '1 小时 5 分')
})

test('时长：负数与非有限数返回 null（时钟回拨时宁可不显示）', () => {
  assert.equal(formatDuration(-1), null)
  assert.equal(formatDuration(Number.NaN), null)
  assert.equal(formatDuration(Number.POSITIVE_INFINITY), null)
})

/* ── 多关键词的表单往返（方案级 keywords ↔ 每行一个的文本域）─────────── */

/** 最小可用的 PlanDto（formOf 只读这些字段；缺一个就是它自己的接口在撒谎）。 */
function planStub(patch: Partial<PlanDto>): PlanDto {
  return {
    id: 1,
    name: '桩',
    platforms: ['51job'],
    keywords: [],
    platformOverrides: {},
    criteria: {},
    schedule: {
      enabled: true,
      windowStartHour: 9,
      windowStartMinute: 0,
      windowEndHour: 11,
      windowEndMinute: 0,
      weekdays: [],
      jitterMs: 0,
      missedGraceMs: 0,
    },
    enabled: true,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastRunAt: null,
    nextRunAt: null,
    timezone: 'Asia/Shanghai',
    postProcess: { score: true, flag: true, dedup: true },
    createdAt: '2026-09-18T00:00:00.000Z',
    ...patch,
  }
}

test('关键词文本：trim / 丢空行 / 去重保序，清洗只在 parseKeywordsText 一处', () => {
  assert.deepEqual(parseKeywordsText('  Java \n\nJava\nGo\r\n'), ['Java', 'Go'])
  assert.deepEqual(parseKeywordsText(''), [])
})

test('表单 → 写入体：keywords 非空时 criteria 里不再带 keyword（单一事实源）', () => {
  const form = { ...emptyForm(), keywordsText: ' Java \nGo' }
  const written = writeOf(form)
  assert.deepEqual(written.keywords, ['Java', 'Go'])
  assert.equal(written.criteria?.['keyword'], undefined)
})

test('表单 → 写入体：关键词留空 → keywords 为空数组、criteria 原样（老形态）', () => {
  const form = { ...emptyForm(), criteria: { keyword: 'Java' } }
  const written = writeOf(form)
  assert.deepEqual(written.keywords, [])
  assert.equal(written.criteria?.['keyword'], 'Java')
})

test('方案 → 表单：多关键词方案回填为每行一个；老方案把单关键词翻成一行', () => {
  const multi = formOf(planStub({ keywords: ['Java', 'Go'] }))
  assert.equal(multi.keywordsText, 'Java\nGo')

  const legacy = formOf(planStub({ criteria: { keyword: 'Java' } }))
  assert.equal(legacy.keywordsText, 'Java')
})

test('往返一致：writeOf(formOf(plan)) 的关键词不丢、不多', () => {
  const roundtrip = writeOf(formOf(planStub({ keywords: ['Java', 'Go', '前端'] })))
  assert.deepEqual(roundtrip.keywords, ['Java', 'Go', '前端'])
  assert.equal(roundtrip.criteria?.['keyword'], undefined)
})
