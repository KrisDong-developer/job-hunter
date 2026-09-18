import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ruleExtract } from '../../src/host/domain/messages.js'
import type { NormalizedExtract } from '../../src/host/domain/messages.js'

/**
 * 「一键进日程」的**规则降级**识别。
 *
 * 这些是纯函数，最容易打错边界（中文日期、跨年、线上/电话/现场、URL、地点），
 * 值得单独盯住 —— 模型不可用时这一层就是兜底的那个答案。
 */

test('中文完整时间：9月20日 14:00 → 解析成 ISO，且不早于当前', () => {
  const before = Date.now()
  const result = ruleExtract('下周安排一场面试于9月20日 14:00，地点：深圳市南山区科技园')
  const parsed = result.at !== null ? Date.parse(result.at) : null
  assert.ok(parsed !== null, '应当抽出合法时间')
  assert.ok(parsed >= before - 1000, '落在当下的完整日期，不应解成过去')
})

test('跨年：目标日期已过 → 自动进下一年', () => {
  const past = new Date()
  past.setDate(past.getDate() - 2) // 前天，必已过去
  const result = ruleExtract(`${past.getMonth() + 1}月${past.getDate()}日 10:00`)
  const parsed = result.at === null ? null : new Date(result.at)
  assert.ok(parsed !== null)
  assert.equal(parsed!.getFullYear(), past.getFullYear() + 1)
  assert.equal(parsed!.getMonth(), past.getMonth())
  assert.equal(parsed!.getDate(), past.getDate())
})

test('"明天 10:00" → 明天这个时刻', () => {
  const result = ruleExtract('明天 10:00 视频面试，链接 https://meet.example.com/x')
  assert.ok(result.at !== null)
  const now = new Date()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0)
  assert.equal(result.at, tomorrow.toISOString())
})

test('线上/视频 → video，电话 → phone，现场 → onsite', () => {
  assert.equal(ruleExtract('我们用腾讯会议视频面试').kind, 'video')
  assert.equal(ruleExtract('稍后电话沟通').kind, 'phone')
  assert.equal(ruleExtract('请于周三到公司现场').kind, 'onsite')
})

test('链接被抽出（去掉句尾标点）', () => {
  const result = ruleExtract('会议链接：https://meet.example.com/ab,c?x=1。')
  assert.equal(result.link, 'https://meet.example.com/ab,c?x=1')
})

test('什么都抽不到 → 全是 null，不给假值', () => {
  const result: NormalizedExtract = ruleExtract('您好，请问下周方便吗？')
  assert.equal(result.at, null)
  assert.equal(result.kind, null)
  assert.equal(result.place, null)
  assert.equal(result.link, null)
})

test('时间能解出来，但没有形式/地点 → 只有 at 非空', () => {
  const result = ruleExtract('9月21日 15:30，记得来')
  assert.ok(result.at !== null)
  assert.equal(result.kind, null)
})