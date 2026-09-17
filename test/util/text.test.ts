import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DictionaryEntry } from '../../src/host/store/repo/dictionary.js'
import { describeHit, groupHits, matchTerms, normalizeForMatch } from '../../src/host/util/text.js'

const entry = (kind: DictionaryEntry['kind'], term: string, meaning: string, weight = 1): DictionaryEntry => ({
  id: 1,
  kind,
  scope: 'global',
  term,
  meaning,
  weight,
  enabled: true,
})

const ENTRIES: DictionaryEntry[] = [
  entry('jargon', '弹性工作', '往往指没有固定下班时间'),
  entry('jargon', '抗压能力强', '通常意味着加班多'),
  entry('outsourcing', '驻场', '驻场开发，通常不是甲方正式编制'),
  entry('fraud', '押金', '任何形式的押金都是高风险信号', 4),
]

test('归一化：全角转半角、折叠空白、小写', () => {
  assert.equal(normalizeForMatch('ＪＡＶＡ   开发\n工程师'), 'java 开发 工程师')
})

test('命中即带出解释与权重', () => {
  const hits = matchTerms('本岗位为驻场开发，需要抗压能力强。', ENTRIES)
  assert.equal(hits.length, 2)
  const byTerm = new Map(hits.map((hit) => [hit.term, hit]))
  assert.equal(byTerm.get('驻场')?.kind, 'outsourcing')
  assert.equal(byTerm.get('抗压能力强')?.meaning, '通常意味着加班多')
  assert.ok(byTerm.get('驻场')?.excerpt.includes('驻场'))
})

test('命中结果可以渲染成给人看的一行依据', () => {
  const hits = matchTerms('弹性工作制', ENTRIES)
  assert.equal(hits.length, 1)
  const hit = hits[0]
  assert.ok(hit)
  assert.equal(describeHit(hit), '命中「弹性工作」→ 往往指没有固定下班时间')
})

test('没有解释的词也能给出可读依据', () => {
  const hit = matchTerms('需要驻场', [entry('outsourcing', '驻场', '', 1)])[0]
  assert.ok(hit)
  hit.meaning = null
  assert.equal(describeHit(hit), '命中「驻场」')
})

test('空白输入与空词表都不炸', () => {
  assert.deepEqual(matchTerms('', ENTRIES), [])
  assert.deepEqual(matchTerms('随便什么', []), [])
})

test('命中数量有上限，异常长文本不会刷出成百条', () => {
  const many = Array.from({ length: 60 }, (_value, index) => entry('jargon', `词${String(index)}`, 'x'))
  const text = many.map((item) => item.term).join(' ')
  assert.equal(matchTerms(text, many, 10).length, 10)
})

test('按类别分组', () => {
  const grouped = groupHits(matchTerms('驻场 + 弹性工作', ENTRIES))
  assert.equal(grouped.get('outsourcing')?.length, 1)
  assert.equal(grouped.get('jargon')?.length, 1)
  assert.equal(grouped.get('fraud'), undefined)
})
