import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RawJob } from '../../src/host/platform/types.js'
import { isFieldMiss, partitionByRequiredFields } from '../../src/host/platform/validate.js'
import { CORE_FIELDS } from '../../src/shared/enums.js'

function job(overrides: Partial<RawJob> = {}): RawJob {
  return {
    platformJobId: '1',
    title: '全栈开发工程师',
    salaryRaw: '1.3-1.8万',
    company: '某某公司',
    sourceUrl: 'https://example.com/1.html',
    ...overrides,
  }
}

test('字段齐全的记录写主表，缺字段的进隔离队列', () => {
  const result = partitionByRequiredFields(
    [
      job({ platformJobId: '1' }),
      job({ platformJobId: '2', company: '' }),
      job({ platformJobId: '3', salaryRaw: '', sourceUrl: '' }),
    ],
    CORE_FIELDS,
  )
  assert.equal(result.accepted.length, 1)
  assert.equal(result.rejected.length, 2)
  assert.deepEqual(result.rejected[0]?.missing, ['company'])
  assert.deepEqual(result.rejected[1]?.missing, ['salary_raw', 'source_url'])
})

test('「面议」是合法值，绝不能被当成缺字段', () => {
  const result = partitionByRequiredFields([job({ salaryRaw: '面议' })], CORE_FIELDS)
  assert.equal(result.accepted.length, 1)
  assert.equal(result.rejected.length, 0)
})

test('逐字段命中统计', () => {
  const result = partitionByRequiredFields(
    [job({ platformJobId: '1' }), job({ platformJobId: '2', company: '' })],
    CORE_FIELDS,
  )
  const byField = new Map(result.presence.map((entry) => [entry.field, entry]))
  assert.equal(byField.get('title')?.present, 2)
  assert.equal(byField.get('company')?.present, 1)
  assert.equal(byField.get('company')?.records, 2)
})

test('整轮缺失只在「有记录但零命中」时成立', () => {
  assert.equal(isFieldMiss({ field: 'title', records: 20, present: 0 }), true)
  assert.equal(isFieldMiss({ field: 'title', records: 20, present: 1 }), false)
  // 0 条记录是「整页失败」，归运行级失败计数管，不该污染字段计数
  assert.equal(isFieldMiss({ field: 'title', records: 0, present: 0 }), false)
})

test('空输入不产生任何记录', () => {
  const result = partitionByRequiredFields([], CORE_FIELDS)
  assert.equal(result.accepted.length, 0)
  assert.equal(result.rejected.length, 0)
  assert.ok(result.presence.every((entry) => entry.records === 0))
})
