import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkNoFabrication, normalizeResumeContent, type ResumeContent } from '../../src/shared/domain/resume-content.js'

/**
 * 防编造检查的**回归测试**。
 *
 * 这三条各自对应一个真实踩到的缺陷（都由"用一份英文/带数字的简历自己跟自己比"暴露出来）。
 * 之所以单独一个文件：它们防的是**误报**，而误报的后果不是"少拦一次编造"，
 * 而是"用户与模型都被这个检查烦到之后把它关掉" —— 那才是真的失去防线。
 */

function resume(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return normalizeResumeContent({
    basics: { name: '张三', title: 'Java 后端开发', city: '深圳', years: 5 },
    summary: '五年后端开发经验，熟悉 Java 与 MySQL。',
    skills: [{ name: 'Java' }, { name: 'MySQL' }],
    experiences: [
      {
        company: 'Acme 科技',
        title: '后端工程师',
        start: '2021-03',
        end: '至今',
        highlights: ['负责订单服务的重构，接口耗时下降 40%'],
      },
    ],
    projects: [{ name: '订单中台', highlights: ['支撑日均 200 万单'] }],
    education: [{ school: '浙江大学', major: '计算机科学与技术', degree: '本科' }],
    ...overrides,
  })
}

test('【回归】一份简历跟自己比，必须判定"没有编造"', () => {
  const content = resume()
  const report = checkNoFabrication(content, content)
  assert.equal(report.ok, true, `自比被误判成编造：${report.reasons.join('；')}`)
  assert.deepEqual(report.addedTech, [])
  assert.deepEqual(report.addedNumbers, [])
  assert.deepEqual(report.addedOrgs, [])
})

test('【回归】标题里的技术词不会因为"只在标题里出现"就被当成新增', () => {
  // 曾经的缺陷：原简历一侧不抽 basics.title，候选一侧抽 →
  // 只要模型原样保留标题，"java" 就被报成新增
  const content = resume({ basics: { name: '张三', title: 'Java 后端开发' } })
  const report = checkNoFabrication(content, content)
  assert.equal(report.ok, true, report.reasons.join('；'))
  assert.equal(report.addedTech.includes('java'), false)
})

test('【回归】技能名/证据里的数字不会因为口径不同就被当成新增', () => {
  // 曾经的缺陷：原简历一侧不从 skills 抽数字，候选一侧抽 → 一律误报
  const content = resume({
    skills: [{ name: 'Vue3', evidence: '把首页 QPS 从 200 提到 2000' }],
  })
  const report = checkNoFabrication(content, content)
  assert.equal(report.ok, true, `带数字的技能被误判：${report.reasons.join('；')}`)
  assert.deepEqual(report.addedNumbers, [])
})

test('【回归】纯英文简历（含姓名/公司/学校）自比也不误报', () => {
  // 英文是 §4.M 与 RESUME_LANGUAGES 明确支持的方向，
  // 曾经所有英文简历的定制都必然被拒、静默退回规则路径
  const content = normalizeResumeContent({
    basics: { name: 'San Zhang', title: 'Backend Engineer', city: 'Shanghai' },
    summary: 'Backend engineer with 5 years of experience.',
    skills: [{ name: 'Java' }, { name: 'Kubernetes' }],
    experiences: [
      {
        company: 'Acme Corp',
        title: 'Senior Backend Engineer',
        highlights: ['Led the migration of the order service'],
      },
    ],
    projects: [{ name: 'Order Platform', role: 'Tech Lead', highlights: ['Handled 2M orders per day'] }],
    education: [{ school: 'Zhejiang University', major: 'Computer Science', degree: 'Bachelor' }],
  })
  const report = checkNoFabrication(content, content)
  assert.equal(report.ok, true, `英文简历自比被误判：${report.reasons.join('；')}`)
})

test('口径对称之后，真正的编造依然全部拦得住（检查没有被削弱）', () => {
  const original = resume()

  // ① 加一段不存在的经历
  const withNewJob = resume({
    experiences: [
      ...resume().experiences,
      { company: '字节跳动', title: '架构师', highlights: ['负责推荐系统'] },
    ],
  })
  const jobReport = checkNoFabrication(original, withNewJob)
  assert.equal(jobReport.ok, false)
  assert.ok(jobReport.reasons.some((reason) => reason.includes('字节跳动')))

  // ② 编一个没用过的技术
  const withNewTech = resume({ skills: [...resume().skills, { name: 'Kubernetes' }] })
  const techReport = checkNoFabrication(original, withNewTech)
  assert.equal(techReport.ok, false)
  assert.ok(techReport.addedTech.includes('kubernetes'))

  // ③ 把数字写大
  const inflated = resume({
    experiences: [
      {
        company: 'Acme 科技',
        title: '后端工程师',
        highlights: ['负责订单服务的重构，接口耗时下降 80%'],
      },
    ],
  })
  const numberReport = checkNoFabrication(original, inflated)
  assert.equal(numberReport.ok, false)
  assert.ok(numberReport.addedNumbers.includes('80%'), JSON.stringify(numberReport.addedNumbers))

  // ④ 把技能名换成一个没写过的
  const swapped = resume({ skills: [{ name: 'Golang' }] })
  assert.equal(checkNoFabrication(original, swapped).ok, false)
})

test('allowTech 只放行技术词：目标岗位的拉丁关键词可以出现，经历/技能/数字仍严格', () => {
  const original = resume()
  // 目标岗位名里带一个原简历没有的拉丁词 —— 这才是 allowTech 真正要放行的情形
  const aimed = resume({
    basics: { name: '张三', title: 'Kubernetes 平台工程师', city: '深圳', years: 5 },
    summary: '五年后端开发经验，熟悉 Java 与 MySQL，希望从事 Kubernetes 平台方向。',
  })
  const withoutAllow = checkNoFabrication(original, aimed)
  assert.equal(withoutAllow.ok, false, '放行前应当报出岗位方向词')
  assert.ok(withoutAllow.addedTech.includes('kubernetes'), JSON.stringify(withoutAllow.addedTech))

  const withAllow = checkNoFabrication(original, aimed, { allowTech: ['kubernetes'] })
  assert.equal(withAllow.ok, true, withAllow.reasons.join('；'))

  // 放行技术词**不**等于放行经历与数字
  const sneaky = resume({
    basics: { name: '张三', title: 'Kubernetes 平台工程师' },
    projects: [
      { name: '订单中台', highlights: ['支撑日均 200 万单'] },
      { name: '某新项目', highlights: ['x'] },
    ],
  })
  const report = checkNoFabrication(original, sneaky, { allowTech: ['kubernetes'] })
  assert.equal(report.ok, false)
  assert.ok(report.addedOrgs.includes('某新项目'), JSON.stringify(report.addedOrgs))
})

test('【回归】中文技能也拦得住 —— 词表匹配看不见的那一类编造', () => {
  // 技术词抽取基于拉丁 token，所以"精通分布式事务"这类中文技能**一个都抽不出来**。
  // 只看词表的话，模型往技能表里加一条中文技能完全不会被发现 ——
  // 而这恰恰是最常见的编造。结构性检查（技能集必须是子集）与语言无关。
  const original = resume()
  const withChineseSkill = resume({
    skills: [...resume().skills, { name: '分布式事务', level: '精通' }],
  })
  const report = checkNoFabrication(original, withChineseSkill)
  assert.equal(report.ok, false, '中文新增技能必须被拦下')
  assert.deepEqual(report.addedSkills, ['分布式事务'])
  assert.ok(report.reasons.some((reason) => reason.includes('分布式事务')))

  // 而"删掉一项技能"是合法的（子集允许少）
  const dropped = resume({ skills: [{ name: 'Java' }] })
  assert.equal(checkNoFabrication(original, dropped).ok, true, '删减不该被拦')

  // 同一家公司换个岗位也算新增经历
  const promoted = resume({
    experiences: [
      { company: 'Acme 科技', title: '后端工程师', highlights: ['负责订单服务的重构，接口耗时下降 40%'] },
      { company: 'Acme 科技', title: '架构师', highlights: ['负责整体架构'] },
    ],
  })
  const promotionReport = checkNoFabrication(original, promoted)
  assert.equal(promotionReport.ok, false, '凭空多出"架构师"这段经历必须被拦下')
})

test('提示词层与检查层用同一个投影：允许的岗位词来自 techTokensOf', async () => {
  const { techTokensOf } = await import('../../src/shared/domain/resume-content.js')
  const tokens = techTokensOf('高级 Java 工程师（微服务 / Kubernetes）')
  assert.ok(tokens.includes('java'))
  assert.ok(tokens.includes('kubernetes'))
  // 中文技术词抽不出来是已知限制：抽取规则基于拉丁 token，
  // 所以中文岗位词需要调用方另外补进 allowTech，不能假装它被覆盖了
  assert.equal(tokens.includes('微服务'), false)
})
