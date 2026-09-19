import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDU_RANK_UNKNOWN, buildExpChips, eduRankOf, expBucketOf, sortEduValues } from '../../src/shared/domain/job-facets.js'

/**
 * 经验梯队与学历梯度的归一化。
 *
 * 这一层是**启发式**：平台的原始串写法五花八门，规则里任何一个正则写宽了都会把
 * 岗位分错档（用户按"3-5年"筛，结果 1 年经验的岗位混进来）。所以用各平台夹具里
 * 真实出现过的取值当样本钉住它。
 */

/** 各平台适配器与夹具里实测出现过的经验取值（见 test/fixtures 与 adapters/*）。 */
const REAL_EXP_VALUES = [
  '不限经验', // waiqi / guopin
  '经验不限', // guopin / liepin
  '无需经验',
  '应届生', // guopin / liepin
  '应届毕业生', // sinojobs
  '在校生', // guopin / liepin
  '1年以内', // guopin / liepin
  '1年以下', // liepin / 51job
  '1-3年', // waiqi / lagou / 51job
  '1年～3年', // sinojobs
  '2-3年',
  '1-5年',
  '2年及以上',
  '3-5年', // waiqi / lagou / zhaopin
  '3年～5年', // sinojobs
  '5-10年', // waiqi / lagou
  '5年以上', // sinojobs
  '10年以上', // 51job
  '10-15年', // guopin
  '20年以上', // guopin
]

test('经验：真实平台取值全部能归进标准梯队，没有一个落到"认不出来"', () => {
  const unknown = REAL_EXP_VALUES.filter((value) => expBucketOf(value) === null)
  assert.deepEqual(unknown, [], `这些取值没被任何梯队接住：${unknown.join(' / ')}`)
})

test('经验：「不限」与「应届」是两档，不能被数字规则吞掉', () => {
  for (const value of ['不限经验', '经验不限', '无需经验']) {
    assert.equal(expBucketOf(value), 'any', value)
  }
  for (const value of ['应届生', '应届毕业生', '在校生', '在校/应届']) {
    assert.equal(expBucketOf(value), 'fresh', value)
  }
})

test('经验：0-1 年的写法归「应届生」，满 1 年归「1-3年」', () => {
  assert.equal(expBucketOf('1年以下'), 'fresh')
  assert.equal(expBucketOf('1年以内'), 'fresh')
  assert.equal(expBucketOf('0-1年'), 'fresh')
  assert.equal(expBucketOf('1年'), '1-3')
  assert.equal(expBucketOf('1年以上'), '1-3')
})

test('经验：有界区间取中位，无上界取下限', () => {
  assert.equal(expBucketOf('1-3年'), '1-3')
  assert.equal(expBucketOf('2-3年'), '1-3')
  assert.equal(expBucketOf('3-5年'), '3-5')
  assert.equal(expBucketOf('3-6年'), '3-5')
  assert.equal(expBucketOf('5-10年'), '5-10')
  assert.equal(expBucketOf('8-10年'), '5-10')
  assert.equal(expBucketOf('10-15年'), '10+')
  assert.equal(expBucketOf('5年以上'), '5-10')
  assert.equal(expBucketOf('2年及以上'), '1-3')
  assert.equal(expBucketOf('20年以上'), '10+')
})

test('经验：全角数字与各种连接符都能读（平台的原文不能要求用户看惯）', () => {
  assert.equal(expBucketOf('１－３年'), '1-3')
  assert.equal(expBucketOf('3～5年'), '3-5')
  assert.equal(expBucketOf('5—10年'), '5-10')
})

test('经验：归并后 chip 数远少于原始取值数，且每个 chip 都带着原始串', () => {
  const chips = buildExpChips(REAL_EXP_VALUES)
  assert.ok(chips.length <= 6, `归并后只剩 ${String(chips.length)} 个 chip，应 ≤ 6`)
  const covered = chips.flatMap((chip) => chip.values).sort()
  assert.deepEqual(covered, [...REAL_EXP_VALUES].sort(), '原始取值一个都不能丢')
  // 每个 chip 至少有一条原始串，否则就是个点了得 0 条的假选项
  for (const chip of chips) assert.ok(chip.values.length > 0, chip.id)
})

test('经验：库里没有岗位的档位不出现（不给"点了得到 0 条"的选项）', () => {
  const chips = buildExpChips(['3-5年', '3年～5年'])
  assert.deepEqual(
    chips.map((chip) => [chip.id, chip.values]),
    [['3-5', ['3-5年', '3年～5年']]],
  )
})

test('经验：认不出来的原始串原样排成 chip，不消失也不假装认识', () => {
  const chips = buildExpChips(['3-5年', '看能力'])
  assert.deepEqual(
    chips.map((chip) => [chip.id, chip.label, chip.values]),
    [
      ['3-5', '3-5年', ['3-5年']],
      ['raw:看能力', '看能力', ['看能力']],
    ],
  )
})

test('经验：空值不产出 chip（空串不是一档经验）', () => {
  assert.deepEqual(buildExpChips(['', '  ']), [])
  assert.equal(expBucketOf(''), null)
  assert.equal(expBucketOf('   '), null)
})

test('学历：按梯度正向排列（用户看的是顺序，这里钉住它）', () => {
  const sorted = sortEduValues(['中技/中专', '初中及以下', '大专', '本科', '硕士', '高中'])
  assert.deepEqual(sorted, ['初中及以下', '中技/中专', '高中', '大专', '本科', '硕士'])
})

test('学历：层级序号单调，且识别不出的一律排在最后', () => {
  assert.ok(eduRankOf('学历不限') < eduRankOf('初中及以下'))
  assert.ok(eduRankOf('初中及以下') < eduRankOf('高中'))
  // 高中 / 中专 / 中技是**同一档**（用户心里的梯度里它们并列），不是可比的上下级
  assert.equal(eduRankOf('高中'), eduRankOf('中专'))
  assert.ok(eduRankOf('中专') < eduRankOf('大专'))
  assert.ok(eduRankOf('大专') < eduRankOf('本科'))
  assert.ok(eduRankOf('本科') < eduRankOf('硕士'))
  assert.ok(eduRankOf('硕士') < eduRankOf('博士'))
  assert.equal(eduRankOf('中专'), eduRankOf('中技/中专'))
  assert.equal(eduRankOf('MBA'), eduRankOf('硕士'))
  assert.equal(eduRankOf('保密'), EDU_RANK_UNKNOWN)

  const sorted = sortEduValues(['保密', '本科', '大专'])
  assert.deepEqual(sorted, ['大专', '本科', '保密'])
})

test('学历：同层级保持库里给的原始顺序（排序不该顺手重排同类）', () => {
  assert.deepEqual(sortEduValues(['高中', '中专', '中技']), ['高中', '中专', '中技'])
})
