import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyPrivacy,
  HARD_BLOCKED_FIELDS,
  redactPatterns,
  REDACTION,
} from '../../src/host/ai/privacy.js'

test('硬黑名单字段直接剥离，连值都不出现', () => {
  const result = applyPrivacy({
    jobTitle: '前端工程师',
    phone: '13800138000',
    email: 'someone@example.com',
    address: '深圳市南山区',
  })
  assert.equal(result.safe['jobTitle'], '前端工程师')
  assert.equal('phone' in result.safe, false)
  assert.equal('email' in result.safe, false)
  assert.equal('address' in result.safe, false)
  assert.deepEqual(result.outboundFields, ['jobTitle'])
  assert.ok(result.redactedFields.includes('phone'))
  assert.ok(result.redactedFields.includes('email'))
})

test('字段名是子串匹配：mobile / contactEmail 这类变体也会被拦', () => {
  for (const key of HARD_BLOCKED_FIELDS) {
    const result = applyPrivacy({ [`user_${key}_v2`]: '敏感值' })
    assert.equal('user_' + key + '_v2' in result.safe, false, `${key} 的变体应当被剥离`)
  }
})

test('值里的手机号/身份证/邮箱/银行卡被脱敏，字段本身保留', () => {
  const result = applyPrivacy({
    description: '联系人 13800138000，身份证 11010519491231002X，邮箱 a.b@example.com，卡号 6222021234567890123',
  })
  const text = result.safe['description'] as string
  assert.equal(text.includes('13800138000'), false, '手机号不该出现')
  assert.equal(text.includes('11010519491231002X'), false, '身份证不该出现')
  assert.equal(text.includes('a.b@example.com'), false, '邮箱不该出现')
  assert.equal(text.includes('6222021234567890123'), false, '银行卡不该出现')
  assert.ok(text.includes(REDACTION), '应当留下占位符，而不是整段丢弃')
  // 命中记录会带上字段名，便于告诉用户"这次少了什么"
  assert.ok(result.redactedFields.some((item) => item.startsWith('description:')))
})

test('redactPatterns 报告命中了哪几类，且不重复计数', () => {
  const hits = redactPatterns('13800138000 与 13900139000 都是手机号')
  assert.deepEqual(hits.hits, ['phone'])
  assert.equal(hits.text.split(REDACTION).length - 1, 2, '两个号码都要被替换')
})

test('给了字段白名单就只发白名单里的字段', () => {
  const result = applyPrivacy(
    { jobTitle: 'Java', companyName: '某某公司', internalNote: '别发这个' },
    { allowFields: ['jobTitle', 'companyName'] },
  )
  assert.deepEqual(Object.keys(result.safe), ['jobTitle', 'companyName'])
  assert.ok(result.redactedFields.includes('internalNote'))
})

test('嵌套对象与数组不靠"递归猜"保护，直接不发 / 拍平', () => {
  const result = applyPrivacy({
    jobTitle: 'Java',
    nested: { phone: '13800138000' },
    tags: ['react', 'node', { evil: true }],
  })
  assert.equal('nested' in result.safe, false, '嵌套对象根本不进外发载荷')
  assert.equal(result.safe['tags'], 'react, node')
})

test('数字与布尔原样通过，null 保留占位', () => {
  const result = applyPrivacy({ salaryMin: 13000, remote: true, note: null })
  assert.equal(result.safe['salaryMin'], 13000)
  assert.equal(result.safe['remote'], true)
  assert.equal(result.safe['note'], null)
})
