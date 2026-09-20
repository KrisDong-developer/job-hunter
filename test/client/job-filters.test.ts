import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EMPTY_FILTERS,
  clampScoreInput,
  digitsOf,
  firstSeenSinceOf,
  sameFilters,
  salaryInput,
  toggleValue,
  type Filters,
} from '../../src/client/screens/jobs/filters.js'

/**
 * 岗位库的筛选状态工具（第五轮补测）。
 *
 * 这几个函数都不是"顺手用一下"的配角：
 *   * `sameFilters` 决定「条件已改动，点筛选生效」提示、空态的「清除筛选条件」、
 *     以及**套用的视图是否已经漂移**（`index.tsx` 的 submit 会据此把下拉复位）——
 *     它错了会有三种不同的错法；
 *   * `clampScoreInput` / `salaryInput` 是"界面先收敛，别让用户撞上服务端 400"的那一层；
 *   * `toggleValue` 的**顺序**会被 `sameFilters` 按集合比较掉，但会被服务端的视图校验
 *     原样存下来 —— 两者不能互相矛盾（这也是当初不用 JSON.stringify 比的原因）。
 */

test('clampScoreInput：0–100 的整数，空串 = 不限（超上限夹住而不是报错）', () => {
  assert.equal(clampScoreInput(''), '')
  assert.equal(clampScoreInput('abc'), '')
  assert.equal(clampScoreInput('0'), '0')
  assert.equal(clampScoreInput('60'), '60')
  assert.equal(clampScoreInput('100'), '100')
  assert.equal(clampScoreInput('101'), '100', '超上限夹成 100 —— 否则整个列表会变成"查询失败"')
  assert.equal(clampScoreInput('9999'), '100')
  assert.equal(clampScoreInput('6a0'), '60', '非数字直接去掉')
})

test('salaryInput：只留数字且 7 位封顶（与服务端保存视图的校验同一个上限）', () => {
  assert.equal(salaryInput('1.5万'), '15')
  assert.equal(salaryInput('20000'), '20000')
  assert.equal(salaryInput('12345678'), '1234567', '8 位会被服务端拒，界面先截断')
  assert.equal(digitsOf('-5'), '5', '负号不留')
})

test('sameFilters：按语义比（多选顺序不算差别），且覆盖第五轮新增的两个字段', () => {
  const base: Filters = { ...EMPTY_FILTERS, cities: ['深圳', '杭州'], expBuckets: ['3-5年'] }
  assert.ok(sameFilters(base, { ...base, cities: ['杭州', '深圳'] }), '多城市顺序不同 = 同一组条件')
  assert.ok(!sameFilters(base, { ...base, cities: ['深圳'] }))

  // 新增字段漏比 → "条件已改动"提示与视图漂移检测会一起失灵
  assert.ok(!sameFilters(base, { ...base, minScore: '60' }), 'minScore 必须参与比较')
  assert.ok(!sameFilters(base, { ...base, excludeBlacklisted: false }), 'excludeBlacklisted 必须参与比较')
  assert.ok(
    sameFilters({ ...base, minScore: '60' }, { ...base, minScore: '60' }),
    '两边改成同一个值就是相等的（否则"未应用"提示会一直亮着）',
  )

  // 默认值：空条件与自己相等（`hasFilters` 就是靠这个判断"有没有筛过"）
  assert.ok(sameFilters(EMPTY_FILTERS, EMPTY_FILTERS))
  assert.ok(
    !sameFilters(EMPTY_FILTERS, { ...EMPTY_FILTERS, excludeBlacklisted: false }),
    '把默认的"排除已拉黑公司"关掉，也算"改过条件"',
  )
})

test('toggleValue：选中就移除、未选中就追加（不改原数组）', () => {
  const list = ['a', 'b']
  assert.deepEqual(toggleValue(list, 'c'), ['a', 'b', 'c'])
  assert.deepEqual(toggleValue(list, 'a'), ['b'])
  assert.deepEqual(list, ['a', 'b'], '不能就地改调用方的数组（React 靠新引用判断变化）')
})

test('firstSeenSinceOf：时间窗算成 ISO 时刻，口径与首屏「今日新增」一致', () => {
  const now = Date.parse('2026-09-20T12:00:00.000Z')
  assert.equal(firstSeenSinceOf('', now), undefined, '不限 → 不传这个参数')
  assert.equal(firstSeenSinceOf('1d', now), '2026-09-19T12:00:00.000Z')
  assert.equal(firstSeenSinceOf('7d', now), '2026-09-13T12:00:00.000Z')
  assert.equal(firstSeenSinceOf('不认识的窗', now), undefined)
})
