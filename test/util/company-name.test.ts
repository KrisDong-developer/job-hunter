import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCompanyName, sameCompany } from '../../src/host/util/company-name.js'

test('去地域前缀 + 去公司后缀（后缀是迭代剥的，网络科技也会被剥掉）', () => {
  assert.equal(normalizeCompanyName('北京字节跳动科技有限公司'), '字节跳动')
  assert.equal(normalizeCompanyName('字节跳动'), '字节跳动')
  assert.equal(normalizeCompanyName('深圳市明泰海科技术有限公司'), '明泰海科')
  assert.equal(normalizeCompanyName('上海某某网络科技股份有限公司'), '某某')
})

test('不同公司不会被并到一起（铁律：不确定不合并）', () => {
  assert.notEqual(
    normalizeCompanyName('北京百度网讯科技有限公司'),
    normalizeCompanyName('北京阿里巴巴科技有限公司'),
  )
  // 只做精确比对：能归一化到同一个键才认为同一家
  assert.equal(sameCompany('北京百度网讯科技有限公司', '百度网讯科技'), true)
  assert.equal(sameCompany('北京百度网讯科技有限公司', '阿里巴巴'), false)
  // 「百度」与「百度网讯」归一化后不同 —— 这种就交给 P4 的模糊漏斗 + 人工确认，不在这里猜
  assert.equal(sameCompany('北京百度网讯科技有限公司', '百度'), false)
})

test('括号里的地域/分支标注整块摘掉，全角/大小写/空白统一', () => {
  assert.equal(normalizeCompanyName('  腾讯（深圳）　科技有限公司 '), '腾讯')
  assert.equal(normalizeCompanyName('ACME Technology Ltd'), 'acmetechnologyltd')
})

test('退化输入不崩', () => {
  assert.equal(normalizeCompanyName(''), '')
  assert.equal(normalizeCompanyName('   '), '')
  assert.ok(normalizeCompanyName('有限公司').length > 0)
})
