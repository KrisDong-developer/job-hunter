import assert from 'node:assert/strict'
import { test } from 'node:test'
import { annualPackage, parseSalary } from '../../src/host/util/salary.js'

test('K 单位按月薪折算', () => {
  const salary = parseSalary('15-25K')
  assert.equal(salary.min, 15000)
  assert.equal(salary.max, 25000)
  assert.equal(salary.unit, 'month')
  assert.equal(salary.months, null)
  assert.equal(salary.raw, '15-25K')
})

test('万 单位按月薪折算', () => {
  const salary = parseSalary('1.3-1.8万')
  assert.equal(salary.min, 13000)
  assert.equal(salary.max, 18000)
  assert.equal(salary.unit, 'month')
})

test('万/年 折算到月薪', () => {
  const salary = parseSalary('20-40万/年')
  assert.equal(salary.unit, 'year')
  assert.equal(salary.min, Math.round((20 * 10000) / 12))
  assert.equal(salary.max, Math.round((40 * 10000) / 12))
})

test('15薪 只算月数，绝不混进薪资数字', () => {
  const salary = parseSalary('1.3-1.8万·15薪')
  assert.equal(salary.months, 15)
  assert.equal(salary.min, 13000)
  assert.equal(salary.max, 18000)
  // 年包 = 下限 × 月数
  assert.equal(annualPackage(salary), 13000 * 15)
})

test('面议 是合法值，不是脏数据', () => {
  const salary = parseSalary('面议')
  assert.equal(salary.negotiable, true)
  assert.equal(salary.min, null)
  assert.equal(salary.max, null)
  assert.equal(salary.raw, '面议')
})

test('看不懂的（****元）返回全 null 且保留原文', () => {
  const salary = parseSalary('****元')
  assert.equal(salary.min, null)
  assert.equal(salary.max, null)
  assert.equal(salary.note, 'no-number')
  assert.equal(salary.raw, '****元')
})

test('单值 + 以上 / 以下', () => {
  const above = parseSalary('1万以上')
  assert.equal(above.min, 10000)
  assert.equal(above.max, null)

  const below = parseSalary('8000元以下')
  assert.equal(below.min, null)
  assert.equal(below.max, 8000)
})

test('单值区间退化为 min = max', () => {
  const salary = parseSalary('8000元/月')
  assert.equal(salary.min, 8000)
  assert.equal(salary.max, 8000)
})

test('按天计酬无法可靠折算 → 不猜，留 null', () => {
  const salary = parseSalary('300元/天')
  assert.equal(salary.unit, 'day')
  assert.equal(salary.min, null)
  assert.equal(salary.note, 'unsupported-unit')
})

test('全角与各种连字符都能认', () => {
  const salary = parseSalary('１．５～２．５万')
  assert.equal(salary.min, 15000)
  assert.equal(salary.max, 25000)
})

test('空输入不抛错', () => {
  const salary = parseSalary('')
  assert.equal(salary.min, null)
  assert.equal(salary.note, 'empty')
})
