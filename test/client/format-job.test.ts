import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  JOB_ACTION_LABEL,
  jobFreshnessOf,
  jobProgressBadgeOf,
  jobsToMarkdown,
  relativeTime,
  salaryDetail,
  splitJobTags,
} from '../../src/client/format/job.js'
import { JOB_STATE_LABEL } from '../../src/shared/contract/enums/job.js'
import type { JobDto } from '../../src/shared/contract/dto/job.js'

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

// ── 第五轮：进程徽章（批次 C1）与时效档位（批次 C2）────────────────────

test('进程徽章：一个位置只放一枚，按 投递阶段 > 接触态 > 岗位处置态 取', () => {
  // 三种都有：投递阶段赢（"面试中"比"已读"更该被看见）
  const all = jobProgressBadgeOf({
    state: 'saved',
    contactStage: 'read',
    applicationStage: 'interviewing',
  })
  assert.equal(all.source, 'application')
  assert.equal(all.label, '面试中')
  assert.equal(all.variant, 'ok')

  // 没有投递记录时接触态赢
  const contacted = jobProgressBadgeOf({ state: 'new', contactStage: 'greeted', applicationStage: null })
  assert.equal(contacted.source, 'contact')
  assert.equal(contacted.label, '已打招呼')
  assert.equal(contacted.variant, 'progress', '发出去了但还没回音 → 不是"有回音"那一档')

  // 两者都没有 → 落到岗位处置态（类名与取值同名，`seen` 最中性、用基类）
  assert.deepEqual(jobProgressBadgeOf({ state: 'seen', contactStage: 'none', applicationStage: null }), {
    source: 'state',
    label: '已读',
    variant: '',
  })
  assert.equal(jobProgressBadgeOf({ state: 'saved', contactStage: 'none', applicationStage: null }).variant, 'saved')
})

test('进程徽章：终态与"有回音"分开配色（已拒绝/无回复 = 安静，Offer/面试 = 有回音）', () => {
  const of = (applicationStage: JobDto['applicationStage']) =>
    jobProgressBadgeOf({ state: 'new', contactStage: 'none', applicationStage })
  assert.equal(of('sent').variant, 'progress')
  assert.equal(of('viewed').variant, 'progress')
  assert.equal(of('interviewing').variant, 'ok')
  assert.equal(of('offer').variant, 'ok')
  assert.equal(of('rejected').variant, 'closed')
  assert.equal(of('no_reply').variant, 'closed')
  // 接触态里"回了"才算有回音
  assert.equal(
    jobProgressBadgeOf({ state: 'new', contactStage: 'delivered', applicationStage: null }).variant,
    'progress',
  )
  assert.equal(
    jobProgressBadgeOf({ state: 'new', contactStage: 'replied', applicationStage: null }).variant,
    'ok',
  )
})

test('时效档位：固定档 3 天 / 14 天，边界值归上一档；解析不出来就是不知道（null）', () => {
  const now = new Date('2026-09-20T12:00:00.000Z')
  const hoursAgo = (hours: number): string => new Date(now.getTime() - hours * 3_600_000).toISOString()

  assert.equal(jobFreshnessOf(hoursAgo(1), now)?.level, 'fresh')
  assert.equal(jobFreshnessOf(hoursAgo(72), now)?.level, 'fresh', '整 3 天仍算"近来活跃"')
  assert.equal(jobFreshnessOf(hoursAgo(73), now)?.level, 'stale')
  assert.equal(jobFreshnessOf(hoursAgo(336), now)?.level, 'stale', '整 14 天仍算"一周多没见"')
  assert.equal(jobFreshnessOf(hoursAgo(337), now)?.level, 'cold')
  assert.equal(jobFreshnessOf(hoursAgo(1000), now)?.hours, 1000)
  assert.equal(jobFreshnessOf(hoursAgo(1), now)?.label, '近来活跃')

  assert.equal(jobFreshnessOf('不是时间', now), null, '解析不出来就不给档位 —— "不知道"不该被画成"陈旧"')

  // 未来时间（平台给的时间异常 / 机器时钟偏差）按 0 小时算：负数小时会让人怀疑整个列表
  assert.equal(jobFreshnessOf(new Date(now.getTime() + 3_600_000).toISOString(), now)?.hours, 0)
})

test('复制为表格：Markdown 表结构正确，竖线与换行不会把表弄坏', () => {
  const job = {
    companyName: '某某科技',
    title: '后端开发 | 急招', // 标题里带竖线：不处理会把整列错开
    salaryRaw: '20-30K',
    city: '深圳',
    district: '南山区',
    platformName: 'BOSS',
    state: 'new',
    lastSeenAt: '2026-09-20T04:00:00.000Z',
    sourceUrl: 'https://example.com/job/1',
  } as unknown as JobDto

  const table = jobsToMarkdown([job], new Date('2026-09-20T12:00:00.000Z'))
  const lines = table.split('\n')
  assert.equal(lines.length, 3, '表头 + 分隔行 + 一行数据')
  assert.match(lines[0] ?? '', /^\| 公司 \| 岗位 \| 薪资 \|/)
  assert.match(lines[1] ?? '', /^\| --- \| --- \|/)
  assert.ok(lines[2]?.includes('后端开发 / 急招'), '竖线换成斜杠（Markdown 表格没有通用转义）')
  assert.ok(lines[2]?.includes('深圳·南山区'), '城市带上区')
  assert.equal((lines[2] ?? '').split('|').length, (lines[0] ?? '').split('|').length, '列数必须与表头一致')
})
// ── 「已读」兜底（2026-09-21）────────────────────────────────────────
//
// `state` 与 `read_at` 是两次写：中间但凡有一次失败，就会留下
// "state 还是 new、但 read_at 已经有值"的组合。而徽章最招人烦的失败方式恰恰是
// **你明明看过了它还说你没看** —— 所以判据取并集：读过就是读过。

test('徽章兜底：state 还是 new，但已经有了已读时间 → 显示「已读」而不是「新」', () => {
  const badge = jobProgressBadgeOf({
    state: 'new',
    contactStage: 'none',
    applicationStage: null,
    readAt: '2026-09-16T02:00:00.000Z',
  })
  assert.equal(badge.label, JOB_STATE_LABEL.seen)
  assert.equal(badge.variant, '', '「已读」是最中性的一档，不该染色')
})

test('徽章兜底：没读过就还是「新」（别把新岗位误判成已读）', () => {
  const badge = jobProgressBadgeOf({
    state: 'new',
    contactStage: 'none',
    applicationStage: null,
    readAt: null,
  })
  assert.equal(badge.label, JOB_STATE_LABEL.new)
})

test('徽章兜底：调用方不给 readAt 也照样工作（老调用点不必改）', () => {
  const badge = jobProgressBadgeOf({ state: 'new', contactStage: 'none', applicationStage: null })
  assert.equal(badge.label, JOB_STATE_LABEL.new)
})