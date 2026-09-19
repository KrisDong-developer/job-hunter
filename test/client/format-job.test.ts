import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JOB_ACTION_LABEL, relativeTime, salaryDetail, splitJobTags } from '../../src/client/format/job.js'
import type { JobDto } from '../../src/shared/dto.js'

/**
 * 岗位展示口径的纯函数 —— 客户端第一批离线测试。
 *
 * 挑它开场有两个理由：它**没有 React、没有 fetch**，跑起来零成本；而它决定的
 * 恰恰是用户在列表与详情里最先看的那几个东西（薪资、"多久以前"、标签分组），
 * 也就是"同一件事两处写法必须一致"的高发区。
 */

/**
 * 只关心薪资三个字段的 JobDto。
 *
 * `salaryDetail` 只读这三个字段，其余字段与本函数无关 —— 用一次断言代替
 * 三十个字段的样板，避免测试里出现一份会随 DTO 漂移的假数据。
 */
function jobOf(salary: Partial<Pick<JobDto, 'salaryMin' | 'salaryMax' | 'salaryMonths'>>): JobDto {
  return { salaryMin: null, salaryMax: null, salaryMonths: null, ...salary } as unknown as JobDto
}

test('薪资：区间 / 单值 / 带月数 三种形态', () => {
  assert.equal(salaryDetail(jobOf({ salaryMin: 20000, salaryMax: 30000 })), '20000-30000 元/月')
  assert.equal(salaryDetail(jobOf({ salaryMin: 20000, salaryMax: 20000 })), '20000 元/月')
  assert.equal(salaryDetail(jobOf({ salaryMin: 20000, salaryMonths: 13 })), '20000 元/月 · 13 薪')
})

test('薪资：没有归一化结果时返回 null —— 界面据此退回显示原文', () => {
  assert.equal(salaryDetail(jobOf({})), null)
})

test('相对时间：按跨度换单位，超过 30 天改报日期（"43 天前"不如日期直观）', () => {
  const now = new Date('2026-09-20T12:00:00.000Z')
  assert.equal(relativeTime('2026-09-20T11:59:30.000Z', now), '刚刚')
  assert.equal(relativeTime('2026-09-20T11:30:00.000Z', now), '30 分钟前')
  assert.equal(relativeTime('2026-09-20T06:00:00.000Z', now), '6 小时前')
  assert.equal(relativeTime('2026-09-18T12:00:00.000Z', now), '2 天前')
  assert.equal(relativeTime('2026-07-01T12:00:00.000Z', now), '2026-07-01')
})

test('相对时间：解析不出来返回 null，不编一个"未知时间"', () => {
  assert.equal(relativeTime('不是时间'), null)
})

test('标签分组：判不出来的一律留在「技能要求」，且保持平台给的原始顺序', () => {
  const { skills, benefits } = splitJobTags(['Java', '五险一金', 'MySQL', '下午茶'])
  assert.deepEqual(skills, ['Java', 'MySQL'])
  assert.deepEqual(benefits, ['五险一金', '下午茶'])
})

test('标签分组：空数组不炸', () => {
  assert.deepEqual(splitJobTags([]), { skills: [], benefits: [] })
})

test('动作文案与状态文案是两套词（当年"已收藏"被写成"收藏"那件事的约束）', () => {
  assert.equal(JOB_ACTION_LABEL.saved, '收藏')
  assert.notEqual(JOB_ACTION_LABEL.saved, '已收藏')
})
