import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bigramSimilarity,
  cleanJobTitle,
  companyTierOf,
  compareCompanyNames,
  compareJobs,
  jobDedupeKey,
  levenshteinSimilarity,
  normalizeCityForDedupe,
  salaryBucketOf,
  UNKNOWN_SALARY_BUCKET,
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
  assert.equal(salaryBucketOf(null, null), UNKNOWN_SALARY_BUCKET)
  assert.notEqual(
    UNKNOWN_SALARY_BUCKET,
    salaryBucketOf(20000, 30000),
    '哨兵值绝不能等于任何一个真实档位 —— 否则"未知"会被当成"不同"',
  )
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

// ── R25：门槛会被"缺值"击穿（批次 4 修的两个静默 bug）─────────────────
//
// 这两个 bug 此前**完全没有测试覆盖** —— 改完代码后 700 条用例全绿，
// 一个都没红。那说明"少合并"这件事在测试里根本不可见，正是它们静默的原因。

test('R25①：城市**归一到市级**再比较（「深圳」与「深圳·福田区」是同一个城市）', () => {
  assert.equal(normalizeCityForDedupe('深圳'), '深圳')
  assert.equal(normalizeCityForDedupe('深圳市'), '深圳')
  assert.equal(normalizeCityForDedupe('深圳·福田区'), '深圳')
  assert.equal(normalizeCityForDedupe('深圳-福田'), '深圳')
  assert.equal(normalizeCityForDedupe(' 北京 '), '北京')
  assert.equal(normalizeCityForDedupe(''), '')

  const base = { companyName: '字节跳动', title: 'Java开发工程师', salaryMin: 20000, salaryMax: 30000 }
  const verdict = compareJobs(
    jobDedupeKey({ ...base, city: '深圳' }),
    jobDedupeKey({ ...base, city: '深圳·福田区' }),
  )
  assert.equal(
    verdict.merge,
    true,
    '不归一的话这两个会被判成"城市不同" —— 于是同一岗位在跨平台时静默地少合并',
  )
})

test('R25②：薪资**只在两边都锚定时**才当门槛（未知 ≠ 不同）', () => {
  const base = { companyName: '字节跳动', title: 'Java开发工程师', city: '深圳' }

  // 一侧没薪资（BOSS 未登录时的空薪资），另一侧 20-30K → 必须仍然能合并
  const oneSide = compareJobs(
    jobDedupeKey({ ...base, salaryMin: null, salaryMax: null }),
    jobDedupeKey({ ...base, salaryMin: 20000, salaryMax: 30000 }),
  )
  assert.equal(
    oneSide.merge,
    true,
    '旧行为把"未知"当成一个普通档位去比 —— 等于要求"有薪资的那边必须是空"',
  )
  assert.ok(
    oneSide.basis.includes('未锚定'),
    '依据里要写清薪资这次没参与判断，否则事后复盘会以为它比过了',
  )
  assert.equal(oneSide.candidate, false, '合并成功就不是"疑似"')

  // 放宽不能伤到原规则：两边都锚定且档位差得远 → 仍然不合并
  const both = compareJobs(
    jobDedupeKey({ ...base, salaryMin: 20000, salaryMax: 30000 }),
    jobDedupeKey({ ...base, salaryMin: 60000, salaryMax: 80000 }),
  )
  assert.equal(both.merge, false)
  assert.ok(both.basis.includes('薪资档不同'))
})

test('疑似重复：硬门槛全过、只有标题差一点 → 不合并，但**报成 candidate**', () => {
  const base = { companyName: '字节跳动', salaryMin: 20000, salaryMax: 30000, city: '深圳' }

  // bigram 相似度约 0.8，落在 [0.75, 0.9) 之间
  const near = compareJobs(
    jobDedupeKey({ ...base, title: 'Java开发工程师' }),
    jobDedupeKey({ ...base, title: 'Java开发工程师岗位' }),
  )
  assert.equal(near.merge, false, '没到门槛就不合并（宁可漏、不可错）')
  assert.equal(near.candidate, true, '但"没合并"这件事本身必须能被看见')
  assert.ok(near.basis.includes('人工确认'))

  // 差得太远就不该说"疑似" —— 否则这个出口会变成噪音，用户会学会忽略它
  const far = compareJobs(
    jobDedupeKey({ ...base, title: 'Java开发工程师' }),
    jobDedupeKey({ ...base, title: '前端开发工程师' }),
  )
  assert.equal(far.candidate, false)

  // 已经合并的当然不是"疑似"
  const merged = compareJobs(
    jobDedupeKey({ ...base, title: 'Java开发工程师' }),
    jobDedupeKey({ ...base, title: 'Java 开发工程师' }),
  )
  assert.equal(merged.merge, true)
  assert.equal(merged.candidate, false)
})
// ── 公司名这一关的两档（2026-09-21 修）────────────────────────────────
//
// 起因是一个会**静默毁数据**的坏法：宽松归一化把「科技/技术/网络科技」这类行业词也剥了，
// 于是「XX网络科技有限公司」与「XX网络技术有限公司」归一到同一个「XX网络」——
// 公司硬键相等，再撞上通用标题 + 同城 + 同薪资档，两个真岗位就被自动合并。
// 而合并的代价是投递记录串在一起，且极难发现。
//
// 但反过来也不能一刀切：跨平台数据里「北京字节跳动科技有限公司」与「字节跳动」
// 这种**写法差异**极其常见，把它们全判成"疑似"等于把去重废掉。

function keyOf(companyName: string): ReturnType<typeof jobDedupeKey> {
  return jobDedupeKey({ companyName, title: 'Java开发工程师', salaryMin: 20000, salaryMax: 30000, city: '深圳' })
}

test('公司档次：只少写一个行业词 → 仍算同一个公司（写法差异，不该降级）', () => {
  assert.equal(companyTierOf(keyOf('北京字节跳动科技有限公司'), keyOf('字节跳动')), 'same')
  assert.equal(companyTierOf(keyOf('腾讯（深圳）科技有限公司'), keyOf('腾讯')), 'same')
})

test('公司档次：换了一个行业词 → weak（危险的那一种，绝不自动合并）', () => {
  assert.equal(companyTierOf(keyOf('XX网络科技有限公司'), keyOf('XX网络技术有限公司')), 'weak')
  assert.equal(companyTierOf(keyOf('XX科技有限公司'), keyOf('XX技术有限公司')), 'weak')
})

test('公司档次：其它情况该 same / none 的都还对', () => {
  assert.equal(companyTierOf(keyOf('北京字节跳动科技有限公司'), keyOf('字节跳动')), 'same')
  assert.equal(companyTierOf(keyOf('字节跳动'), keyOf('美团')), 'none')
  assert.equal(companyTierOf(keyOf(''), keyOf('美团')), 'none', '公司名归一化后为空 → 不判（不是"不同"）')
})

test('换了一个行业词的同名岗位：**不合并**，但必须报成"疑似"让人看见', () => {
  const left = keyOf('XX网络科技有限公司')
  const right = keyOf('XX网络技术有限公司')
  // 先钉住"为什么它以前会被合掉"：宽松键确实相等
  assert.equal(left.companyKey, right.companyKey, '宽松键相等正是当年的成因')
  assert.notEqual(left.companyKeyStrict, right.companyKeyStrict, '严格键不相等 —— 硬键就该在这里拦住')

  const verdict = compareJobs(left, right)
  assert.equal(verdict.merge, false, '两个真岗位一旦合掉，投递记录会串且极难发现')
  assert.equal(verdict.candidate, true, '不合并是对的，但"少合并了"这件事本身也得能被看见')
  assert.match(verdict.basis, /行业词/)
})