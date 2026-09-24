import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EMPTY_CO_FILTERS,
  coJobCountInput,
  describeAppliedCoFilters,
  sameCoFilters,
} from '../../src/client/screens/jobs/company-filters.js'

/**
 * 公司维度的筛选纯函数（与 job-filters.test.ts 同一套纪律：测函数不测组件）。
 */

test('sameCoFilters：语义相同（字段逐一比），草稿与已生效的判定基础', () => {
  const base = { ...EMPTY_CO_FILTERS }
  assert.ok(sameCoFilters(base, EMPTY_CO_FILTERS))
  assert.ok(!sameCoFilters(base, { ...base, q: '华为' }), '关键词不同')
  assert.ok(!sameCoFilters(base, { ...base, blacklisted: 'yes' }), '拉黑档不同')
  assert.ok(!sameCoFilters(base, { ...base, minJobCount: '3' }), '岗位数不同')
  assert.ok(!sameCoFilters(base, { ...base, orderBy: 'name' }), '排序不同')
})

test('coJobCountInput：只留数字、5 位封顶', () => {
  assert.equal(coJobCountInput(''), '')
  assert.equal(coJobCountInput('abc'), '')
  assert.equal(coJobCountInput('12'), '12')
  assert.equal(coJobCountInput('-3.5'), '35')
  assert.equal(coJobCountInput('1234567'), '12345')
})

test('describeAppliedCoFilters：只描述偏离默认值的条件，next 是移除后的完整条件', () => {
  // 全默认 → 没有 chips
  assert.deepEqual(describeAppliedCoFilters(EMPTY_CO_FILTERS), [])

  const applied = {
    ...EMPTY_CO_FILTERS,
    q: '华为',
    blacklisted: 'yes' as const,
    manualLabel: '外包',
    minJobCount: '5',
  }
  const chips = describeAppliedCoFilters(applied)
  assert.deepEqual(
    chips.map((chip) => chip.id),
    ['q', 'blacklisted', 'manualLabel', 'minJobCount'],
  )
  assert.equal(chips[0]?.text, '关键词「华为」')
  assert.equal(chips[1]?.text, '只看已拉黑')
  assert.equal(chips[2]?.text, '标签 外包')
  assert.equal(chips[3]?.text, '岗位数 ≥ 5')
  // next：移除那一条后的完整条件（其余条件保留）
  assert.deepEqual(chips[0]?.next, { ...applied, q: '' })
  assert.deepEqual(chips[1]?.next, { ...applied, blacklisted: '' })

  // 未拉黑档也有自己的说法
  const unblack = describeAppliedCoFilters({ ...EMPTY_CO_FILTERS, blacklisted: 'no' })
  assert.equal(unblack[0]?.text, '只看未拉黑')

  // 排序不进 chips：头栏的下拉一直看得见它
  assert.equal(describeAppliedCoFilters({ ...EMPTY_CO_FILTERS, orderBy: 'name' }).length, 0)
})
