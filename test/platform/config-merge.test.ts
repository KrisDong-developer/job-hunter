/**
 * 通用配置覆盖合并（批次 6 的"共享构造样板"）。
 *
 * 这四条语义原本在 10 个适配器里各写了一遍；漏掉哪一条都只会以
 * "某个平台的配置突然被清空"的形式暴露 —— 极难归因。所以逐条钉住。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_FIFTYONE_CONFIG,
  mergeFiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job/config.js'
import { mergeAdapterConfig } from '../../src/host/platform/config-merge.js'

test('顶层白名单：多出来的**顶层**键丢弃（DB 拼错键名应当静默无效）', () => {
  const base = {
    selectors: { a: '.a', b: '.b' },
    detailUrlTemplate: 'tpl',
    maxCards: 20,
  }
  const merged = mergeAdapterConfig(base, {
    selectors: { b: '.B' },
    selector: '.typo',
    maxCards: 5,
  })
  assert.deepEqual(merged.selectors, { a: '.a', b: '.B' }, '覆盖的键生效 + 未覆盖的键保留')
  assert.equal(merged.maxCards, 5)
  assert.equal(
    'selector' in merged,
    false,
    '拼错的顶层键名应当静默无效，而不是塞进一个从未被读过的字段',
  )
  assert.deepEqual(base.selectors, { a: '.a', b: '.b' }, '不能改动入参')
})

test('分组内的新键**保留** —— 给 cityCodes 补内置表里没有的城市正是靠它', () => {
  const base = { cityCodes: { 北京: '010000' } }
  const merged = mergeAdapterConfig(base, { cityCodes: { 成都: '280000' } })
  assert.deepEqual(
    merged.cityCodes,
    { 北京: '010000', 成都: '280000' },
    '分组内也做成白名单的话，"用 DB 覆盖补城市码"这条路会直接断掉',
  )
})

test('字符串空值 = 没改（界面上清空输入框，不该把必填字段清成空串）', () => {
  const base = { detailUrlTemplate: 'tpl' }
  assert.equal(
    mergeAdapterConfig(base, { detailUrlTemplate: '' }).detailUrlTemplate,
    'tpl',
    '空串会让整页解析崩掉 —— 必须视为"没改"',
  )
  assert.equal(
    mergeAdapterConfig(base, { detailUrlTemplate: 'new' }).detailUrlTemplate,
    'new',
  )
})

test('数组整体替换（按索引合并从来不是想要的语义）', () => {
  const merged = mergeAdapterConfig({ tags: ['a', 'b'] }, { tags: ['c'] })
  assert.deepEqual(merged.tags, ['c'])
})

test('脏覆盖一律回落默认值且不崩：null / 数组 / 字符串 / 类型不符', () => {
  const base = { maxCards: 20, name: 'x' }
  assert.deepEqual(mergeAdapterConfig(base, null), base)
  assert.deepEqual(mergeAdapterConfig(base, ['a']), base)
  assert.deepEqual(mergeAdapterConfig(base, 'nope'), base)
  assert.equal(
    mergeAdapterConfig(base, { maxCards: '20' }).maxCards,
    20,
    '类型对不上就沿用默认值 —— DB 里的脏值不该改变行为',
  )
})

test('51job 的覆盖走同一套语义（迁移没有放松旧行为）', () => {
  const merged = mergeFiftyOneConfig({ selectors: { card: '.my-card' } })
  assert.equal(merged.selectors.card, '.my-card', '覆盖生效')
  assert.deepEqual(
    merged.cityCodes,
    DEFAULT_FIFTYONE_CONFIG.cityCodes,
    '没被覆盖的分组保持默认',
  )
  assert.deepEqual(mergeFiftyOneConfig(null), DEFAULT_FIFTYONE_CONFIG, '脏值回落默认')
  assert.deepEqual(
    mergeFiftyOneConfig({ selectors: { card: '.my-card' } }).selectors.tags,
    DEFAULT_FIFTYONE_CONFIG.selectors.tags,
    '同分组里未覆盖的键也要保留',
  )
})
