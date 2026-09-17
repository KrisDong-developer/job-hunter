import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bigramSimilarity,
  cleanJobTitle,
  compareCompanyNames,
  compareJobs,
  jobDedupeKey,
  levenshteinSimilarity,
  salaryBucketOf,
} from '../../src/host/util/dedupe.js'

// ── 第 1 级：归一化 ─────────────────────────────────────────────────

test('归一化后一致 → 合并（这正是编辑距离搞不定的那一类）', () => {
  const verdict = compareCompanyNames('北京字节跳动科技有限公司', '字节跳动')
  assert.equal(verdict.merge, true)
  assert.equal(verdict.level, 'normalized')
  assert.ok(verdict.basis.includes('归一化后完全一致'))

  assert.equal(compareCompanyNames('腾讯（深圳）科技有限公司', '腾讯科技').merge, true)
  assert.equal(compareCompanyNames('深圳市明泰海科技术有限公司', '明泰海科').merge, true)
})

// ── 第 3 级：包含关系 ───────────────────────────────────────────────

test('包含关系 → 合并（分公司形态）', () => {
  const verdict = compareCompanyNames('华为技术有限公司', '华为技术有限公司深圳分公司')
  assert.equal(verdict.merge, true)
  assert.ok(verdict.level === 'containment' || verdict.level === 'normalized')
})

test('太短的包含不算数，避免「中」⊂「中国」式噪音', () => {
  const verdict = compareCompanyNames('中科', '中科云')
  // 两个字符的包含关系不构成合并理由
  assert.equal(verdict.level === 'containment', false)
})

// ── 第 4 级：相似度兜底 ─────────────────────────────────────────────

test('相似度算子的性质（并说明短名字为什么保守）', () => {
  assert.equal(bigramSimilarity('腾讯科技', '腾讯科技'), 1)
  assert.ok(bigramSimilarity('腾讯科技', '完全不同的名字') < 0.2)
  assert.equal(levenshteinSimilarity('abc', 'abc'), 1)
  assert.equal(levenshteinSimilarity('', 'abc'), 0)

  // 短名字里改一个字，bigram 会掉到 0.2 左右（3 个 bigram 里换了 2 个）——
  // 这**正是我们想要的保守**：4 个字差一个字，完全可能是另一家公司，
  // 所以漏斗不会仅凭相似度把它们合并。
  assert.ok(bigramSimilarity('腾讯科技', '腾讯料技') < 0.3)
  assert.ok(levenshteinSimilarity('腾讯科技', '腾讯料技') > 0.7)
  assert.equal(compareCompanyNames('腾讯科技', '腾讯料技').merge, false)
})

// ── 第 5 级：**不确定不合并**（最重要的那组断言）─────────────────────

test('不同公司绝不误合并（真实样本回归）', () => {
  const pairs: Array<[string, string]> = [
    ['北京百度网讯科技有限公司', '北京阿里巴巴科技有限公司'],
    ['中国平安人寿保险股份有限公司', '中国平安财产保险股份有限公司'],
    ['腾讯科技（深圳）有限公司', '腾讯音乐娱乐（深圳）有限公司'],
    ['华为技术有限公司', '华为终端有限公司'],
    ['北京三快科技有限公司', '北京三快在线科技有限公司'],
    ['深圳市腾讯计算机系统有限公司', '深圳市腾讯信息技术有限公司'],
    ['阿里巴巴（中国）有限公司', '阿里云计算有限公司'],
    ['京东数字科技控股股份有限公司', '京东世纪贸易有限公司'],
  ]
  for (const [left, right] of pairs) {
    const verdict = compareCompanyNames(left, right)
    assert.equal(verdict.merge, false, `不应该合并：「${left}」vs「${right}」（${verdict.basis}）`)
    assert.equal(verdict.level, 'none')
  }
})

test('不合并时也要给出可读理由', () => {
  const verdict = compareCompanyNames('北京百度网讯科技有限公司', '北京阿里巴巴科技有限公司')
  assert.equal(verdict.merge, false)
  assert.ok(verdict.basis.includes('不合并'))
})

test('别名表命中优先于相似度（人工维护的等价名）', () => {
  const aliases = new Map<string, string[]>([['阿里', ['阿里巴巴']]])
  const verdict = compareCompanyNames('阿里', '阿里巴巴', { aliases })
  assert.equal(verdict.merge, true)
  assert.equal(verdict.level, 'alias')
})

test('公司名归一化后为空 → 一律不合并', () => {
  const verdict = compareCompanyNames('', '字节跳动')
  assert.equal(verdict.merge, false)
  assert.equal(verdict.level, 'none')
})

// ── 岗位去重 ────────────────────────────────────────────────────────

test('标题清洗：去括号补充与常见修饰词', () => {
  assert.equal(cleanJobTitle('Java开发工程师（深圳）'), 'java开发工程师')
  assert.equal(cleanJobTitle('急招 Java 开发工程师'), 'java开发工程师')
  assert.equal(cleanJobTitle('【高薪】前端工程师'), '前端工程师')
  assert.equal(cleanJobTitle('[急聘] 测试工程师'), '测试工程师')
})

test('薪资分桶把相邻区间归到一起', () => {
  assert.equal(salaryBucketOf(13000, 18000), salaryBucketOf(15000, 18000))
  assert.notEqual(salaryBucketOf(13000, 18000), salaryBucketOf(50000, 60000))
  assert.equal(salaryBucketOf(null, null), 'unknown')
})

test('岗位去重：同公司 + 同城 + 同薪资档 + 标题相似 → 合并', () => {
  const left = jobDedupeKey({
    companyName: '北京字节跳动科技有限公司',
    title: 'Java开发工程师',
    salaryMin: 20000,
    salaryMax: 30000,
    city: '深圳',
  })
  const right = jobDedupeKey({
    companyName: '字节跳动',
    title: 'Java 开发工程师',
    salaryMin: 20000,
    salaryMax: 35000,
    city: '深圳',
  })
  const verdict = compareJobs(left, right)
  assert.equal(verdict.merge, true)
  assert.ok(verdict.basis.includes('标题相似度'))
})

test('岗位去重：任一键不同就不合并（宁可留两个）', () => {
  const base = {
    companyName: '字节跳动',
    title: 'Java开发工程师',
    salaryMin: 20000,
    salaryMax: 30000,
    city: '深圳',
  }
  const baseKey = jobDedupeKey(base)

  const otherCity = compareJobs(baseKey, jobDedupeKey({ ...base, city: '杭州' }))
  assert.equal(otherCity.merge, false)
  assert.ok(otherCity.basis.includes('城市不同'))

  const otherCompany = compareJobs(baseKey, jobDedupeKey({ ...base, companyName: '阿里巴巴' }))
  assert.equal(otherCompany.merge, false)

  const otherSalary = compareJobs(baseKey, jobDedupeKey({ ...base, salaryMin: 60000, salaryMax: 80000 }))
  assert.equal(otherSalary.merge, false)
  assert.ok(otherSalary.basis.includes('薪资档不同'))

  // 键相同但标题差得远 → 也不合并（可能是两个真岗位）
  const otherTitle = compareJobs(baseKey, jobDedupeKey({ ...base, title: '产品经理' }))
  assert.equal(otherTitle.merge, false)
  assert.ok(otherTitle.basis.includes('标题相似度'))
})
