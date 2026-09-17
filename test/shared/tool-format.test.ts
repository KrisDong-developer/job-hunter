import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DETAIL_KEYS,
  formatDetailLine,
  formatJobDetailTitle,
  formatJobListLine,
  JD_SUMMARY_CHARS,
  parseDetailLines,
  parseJobListLine,
  summarizeJd,
} from '../../src/shared/tool-format.js'

const job = {
  id: 12,
  title: '高级前端工程师',
  companyName: '腾讯科技',
  city: '深圳',
  district: '南山区',
  salaryRaw: '25-40K',
  matchScore: 82.4,
  flagTypes: [] as string[],
}

test('岗位行生产者与消费者是同一个约定（往返一致）', () => {
  const line = formatJobListLine(job)
  assert.equal(line, '#12 高级前端工程师 · 腾讯科技 · 深圳 南山区 · 25-40K · 粗筛 82')
  const parsed = parseJobListLine(line)
  assert.deepEqual(parsed, {
    id: 12,
    title: '高级前端工程师',
    company: '腾讯科技',
    city: '深圳 南山区',
    salary: '25-40K',
    score: '粗筛 82',
  })
})

test('缺字段时有可读兜底，不出现 "null" 这种字符串', () => {
  const line = formatJobListLine({
    id: 3,
    title: 'Java 工程师',
    companyName: null,
    city: '',
    district: '',
    salaryRaw: '',
    matchScore: null,
    flagTypes: [],
  })
  assert.ok(line.includes('未知公司'))
  assert.ok(line.includes('地点未知'))
  assert.ok(line.includes('薪资面议'))
  assert.ok(line.includes('未打分'))
  assert.equal(line.includes('null'), false)
  assert.equal(line.includes('undefined'), false)
})

test('有风险标注时行尾带一个警示，且不影响解析', () => {
  const line = formatJobListLine({ ...job, flagTypes: ['outsourcing', 'fraud'] })
  assert.ok(line.endsWith('⚠ 2 项标注'))
  const parsed = parseJobListLine(line)
  assert.equal(parsed?.title, '高级前端工程师')
  assert.equal(parsed?.company, '腾讯科技')
})

test('非岗位行不会被误当成岗位行', () => {
  for (const line of ['库里共 5 条：', '', '搜索「Java」完成：发现 20 条', '#abc 标题']) {
    assert.equal(parseJobListLine(line), undefined, `${line} 不该被解析成岗位`)
  }
})

test('详情行的键名在白名单里，别的行被丢掉（客户端据此渲染）', () => {
  const text = [
    formatJobDetailTitle(12, '高级前端工程师', '腾讯科技'),
    formatDetailLine(DETAIL_KEYS.company, '腾讯科技'),
    formatDetailLine(DETAIL_KEYS.match, '82（规则粗筛分，不是完整评估）'),
    formatDetailLine(DETAIL_KEYS.url, 'https://jobs.51job.com/all/g1.html'),
    '随便一行没有键的东西',
    '当前处置态：已收藏',
  ].join('\n')
  const rows = parseDetailLines(text).filter((row) => row !== null)
  assert.deepEqual(
    rows.map((row) => row.key),
    ['公司', '粗筛匹配', '链接'],
  )
  assert.equal(rows[0]?.value, '腾讯科技')
})

test('JD 摘要会压平换行并截断，且明确告诉读者被截断了', () => {
  assert.equal(summarizeJd(null), '（没有抓到 JD 正文）')
  assert.equal(summarizeJd('  短  JD  '), '短 JD')
  const long = '要'.repeat(JD_SUMMARY_CHARS + 200)
  const summary = summarizeJd(long)
  assert.ok(summary.length < long.length)
  assert.ok(summary.includes('已截断'))
})
