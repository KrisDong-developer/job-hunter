/**
 * 简历共享层的纯函数测试（§4.5 禁止编造 / R4 / §17）。
 *
 * 这一层是 host、client、渲染器与模型提示词**共用**的一份形状与规则，所以测试的重点
 * 不是"某个实现细节"，而是两条产品底线：
 *   1. **不可信输入永不炸**：用户手改的 JSON、模型返回的 JSON 都从这里进来，
 *      规范化必须把任何东西收敛成一个合法形状（而不是抛错让上层去兜）；
 *   2. **合法定制不许被误判为编造**：防编造检查一旦开始误报，用户就会把它关掉 ——
 *      那等于没有检查。所以"只重排 + 只改措辞"必须稳稳通过。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkNoFabrication, emptyResumeContent, factAtoms, inspectResume, isResumeContentUsable, normalizeResumeContent, resumeFileName, techTokensOf, type ResumeContent } from '../../src/shared/domain/resume-content.js'

// ─────────────────────────────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────────────────────────────

/**
 * 一份"填得挺全"的简历：体检无问题、防编造的三类原子都有。
 *
 * 刻意让 `basics.title` **不含拉丁字母**：标题里的技术词与 `factAtoms` 的抽取范围
 * 有一处不一致（见文件末尾的说明），用不含技术词的标题可以让绝大多数用例
 * 只考察它们各自要考察的规则。
 */
function baseContent(): ResumeContent {
  return {
    basics: {
      name: '张三',
      title: '后端开发',
      phone: '13800001111',
      email: 'zhangsan@example.com',
      city: '杭州',
      years: 5,
    },
    summary: '五年后端经验，做过订单与支付系统。',
    skills: [
      { name: 'Java', level: '精通', years: 5, evidence: '订单中台' },
      { name: 'MySQL', level: '熟练', years: 5, evidence: '支付对账' },
    ],
    experiences: [
      {
        company: '杭州云启科技有限公司',
        title: '高级后端工程师',
        start: '2021-07',
        end: '2024-06',
        city: '杭州',
        highlights: ['把订单接口 P99 从 800ms 压到 120ms', '负责支付对账，日处理 200 万笔'],
        stack: ['Java', 'MySQL'],
      },
    ],
    projects: [
      {
        name: '订单中台',
        role: '核心开发',
        highlights: ['拆分订单状态机，线上事故下降 60%'],
        stack: ['Java'],
      },
    ],
    education: [{ school: '浙江大学', major: '软件工程', degree: '本科' }],
    extras: [{ label: '语言', text: '英语 CET-6' }],
  }
}

// ─────────────────────────────────────────────────────────────────────
// 规范化
// ─────────────────────────────────────────────────────────────────────

test('normalizeResumeContent：敌意输入一律收敛成合法形状，永不抛错', () => {
  const hostile: unknown[] = [
    null,
    undefined,
    [],
    '这是一段字符串',
    42,
    true,
    { basics: '张三', summary: [], skills: 'Java', experiences: {}, projects: null, education: 7, extras: {} },
    { basics: { name: 42, title: ['前端'] }, skills: [null, 'Java', 3, [], { name: 42 }, { name: '  MySQL  ' }] },
    { experiences: [null, 'x', { company: '某公司' }, { title: '工程师' }] },
  ]

  for (const input of hostile) {
    const content = normalizeResumeContent(input)
    assert.deepEqual(
      Object.keys(content).sort(),
      ['basics', 'education', 'experiences', 'extras', 'projects', 'skills', 'summary'],
      `输入 ${JSON.stringify(input) ?? 'undefined'} 的顶层形状不对`,
    )
    assert.equal(typeof content.basics.name, 'string')
    assert.equal(typeof content.basics.title, 'string')
    assert.equal(typeof content.summary, 'string')
    for (const list of [content.skills, content.experiences, content.projects, content.education, content.extras]) {
      assert.ok(Array.isArray(list), '五个段落必须永远是数组')
    }
  }
})

test('normalizeResumeContent：字符串占位、垃圾项、错误等级与字符串数字都被纠正', () => {
  const content = normalizeResumeContent({
    basics: {
      name: 42,
      title: 'Java 后端',
      years: '5',
      age: '二十八',
      links: [null, { label: 'GitHub' }, { label: '主页', url: 'https://example.com' }],
    },
    skills: [null, 'Java', 3, { name: '  MySQL  ', level: '大师', years: '3' }, { name: '', level: '精通' }],
    experiences: [
      { company: '云启', title: '后端', start: '2021-07', end: '2024-06', highlights: ['做了订单', 42, '  '], stack: 'Java' },
      { title: '工程师' },
    ],
    projects: [{ name: '中台', highlights: [null, '拆分状态机'] }],
    education: [{ school: '浙大', major: 42 }, { school: '' }],
    extras: [{ label: '语言', text: '英语' }, { label: '', text: 'x' }, { label: 'x', text: '' }],
  })

  // 对象位置上给了字符串 → 取不到就退化成空串，而不是 "[object Object]" 之类的东西
  assert.equal(content.basics.name, '')
  assert.equal(content.basics.title, 'Java 后端')
  assert.equal(content.basics.years, 5, '数字以字符串给出也要解析成数字')
  assert.equal(content.basics.age, undefined, '解析不出来的一律丢掉，不要 NaN 混进渲染')
  assert.deepEqual(content.basics.links, [{ label: '主页', url: 'https://example.com' }])

  assert.equal(content.skills.length, 1, '空名技能的记录没有意义，应当被丢掉')
  assert.equal(content.skills[0]?.name, 'MySQL', '技能名要去掉首尾空白')
  assert.equal(content.skills[0]?.level, undefined, '不在白名单里的等级降级为 undefined')
  assert.equal(content.skills[0]?.years, 3)
  assert.equal(normalizeResumeContent({ skills: [{ name: 'Java', level: '精通' }] }).skills[0]?.level, '精通')

  assert.equal(content.experiences.length, 2, '只有公司或只有职位都保留；纯垃圾项丢掉')
  assert.deepEqual(content.experiences[0]?.highlights, ['做了订单'], '成果列表只留非空字符串')
  assert.equal(content.experiences[0]?.stack, undefined, '技术栈给成字符串就不认，而不是拆成字符')
  assert.deepEqual(content.projects[0]?.highlights, ['拆分状态机'])
  assert.equal(content.education.length, 1)
  assert.equal(content.education[0]?.major, undefined)
  assert.equal(content.extras.length, 1)
})

// ─────────────────────────────────────────────────────────────────────
// 可用性判定
// ─────────────────────────────────────────────────────────────────────

test('isResumeContentUsable：空简历与只有姓名的简历都不可用', () => {
  assert.equal(isResumeContentUsable(emptyResumeContent()), false)

  const nameOnly: ResumeContent = { ...emptyResumeContent(), basics: { name: '张三', title: '' } }
  assert.equal(isResumeContentUsable(nameOnly), false, '只有姓名导出的是一张白纸')

  assert.equal(
    isResumeContentUsable({ ...nameOnly, skills: [{ name: 'Java' }] }),
    true,
    '姓名 + 技能就算有内容',
  )
  assert.equal(
    isResumeContentUsable({
      ...nameOnly,
      experiences: [{ company: '云启', title: '后端', highlights: [] }],
    }),
    true,
  )
  assert.equal(
    isResumeContentUsable({ ...nameOnly, projects: [{ name: '中台', highlights: [] }] }),
    true,
  )
})

// ─────────────────────────────────────────────────────────────────────
// 规则体检
// ─────────────────────────────────────────────────────────────────────

test('inspectResume：缺姓名、时间倒挂、没有任何经历都是 error', () => {
  const noName = inspectResume({ ...baseContent(), basics: { name: '', title: '后端开发' } })
  assert.ok(noName.some((issue) => issue.level === 'error' && issue.at === 'basics.name'))

  const reversed = inspectResume({
    ...baseContent(),
    experiences: [
      { company: '云启', title: '后端', start: '2024-06', end: '2021-07', highlights: ['做了订单'] },
    ],
  })
  const rangeIssue = reversed.find((issue) => issue.at === 'experiences[0]' && issue.level === 'error')
  assert.ok(rangeIssue !== undefined, '开始时间晚于结束时间必须报 error')
  assert.ok(rangeIssue.message.includes('开始时间'))
  assert.ok(rangeIssue.message.includes('结束时间'))

  const noHistory = inspectResume({ ...baseContent(), experiences: [], projects: [] })
  assert.ok(
    noHistory.some((issue) => issue.level === 'error' && issue.at === 'experiences'),
    '既没有经历也没有项目 = 这份简历没有信息量',
  )
})

test('inspectResume：填得全的简历不该被挑出任何问题', () => {
  assert.deepEqual(inspectResume(baseContent()), [])
})

// ─────────────────────────────────────────────────────────────────────
// 防编造（§4.5 / R8）
// ─────────────────────────────────────────────────────────────────────

test('防编造：新增公司、学校、项目都不行，理由要点名具体组织', () => {
  const original = baseContent()

  const addedCompany = checkNoFabrication(original, {
    ...original,
    experiences: [...original.experiences, { company: '字节跳动', title: '架构师', highlights: [] }],
  })
  assert.equal(addedCompany.ok, false)
  assert.ok(addedCompany.addedOrgs.includes('字节跳动'))
  assert.ok(addedCompany.reasons.some((reason) => reason.includes('字节跳动')), '理由要让用户能核对')

  const addedSchool = checkNoFabrication(original, {
    ...original,
    education: [...original.education, { school: '清华大学' }],
  })
  assert.equal(addedSchool.ok, false)
  assert.ok(addedSchool.reasons.some((reason) => reason.includes('清华大学')))

  const addedProject = checkNoFabrication(original, {
    ...original,
    projects: [...original.projects, { name: '一个没做过的项目', highlights: [] }],
  })
  assert.equal(addedProject.ok, false)
  assert.ok(addedProject.addedOrgs.includes('一个没做过的项目'))
})

test('防编造：新增技术词与新增数字都要被拒', () => {
  const original = baseContent()

  const addedTech = checkNoFabrication(original, {
    ...original,
    skills: [...original.skills, { name: 'Kubernetes' }],
  })
  assert.equal(addedTech.ok, false)
  assert.ok(addedTech.addedTech.includes('kubernetes'))
  assert.ok(addedTech.reasons.some((reason) => reason.includes('技术词')))

  const addedNumber = checkNoFabrication(original, {
    ...original,
    projects: [
      {
        ...original.projects[0]!,
        highlights: [...original.projects[0]!.highlights, '性能提升 30%'],
      },
    ],
  })
  assert.equal(addedNumber.ok, false)
  assert.ok(addedNumber.addedNumbers.includes('30%'))
  assert.ok(addedNumber.reasons.some((reason) => reason.includes('数字')))
})

test('防编造：只重排、只改措辞必须通过（误报会让这条检查被关掉）', () => {
  const original = baseContent()

  // 同一份简历当然不能算"编造了自己"
  assert.equal(checkNoFabrication(original, original).ok, true)

  const reworded: ResumeContent = {
    ...original,
    // 新的简介里没有任何拉丁技术词、没有任何数字 —— 这才是"只改措辞"
    summary: '五年后端经验，长期负责订单与支付方向的系统建设，习惯用数据说话。',
    skills: [...original.skills].reverse(),
    experiences: original.experiences.map((experience) => ({
      ...experience,
      highlights: [...experience.highlights].reverse(),
    })),
    projects: original.projects.map((project) => ({
      ...project,
      highlights: [...project.highlights].reverse(),
    })),
  }

  const report = checkNoFabrication(original, reworded)
  assert.equal(report.ok, true, `合法改写被误判：${report.reasons.join('；')}`)
  assert.deepEqual(report.addedTech, [])
  assert.deepEqual(report.addedNumbers, [])
  assert.deepEqual(report.addedOrgs, [])
})

/**
 * 上面这条"必须通过"的用例刻意只用中文姓名/公司/职位、且技能名里不带数字。
 *
 * 原因：`checkNoFabrication` 判定"新增"时，**原简历那一侧**用的是 `factAtoms`
 * （只从技能、经历标题/技术栈/成果、项目、简介、其他里抽），而**候选那一侧**用的是
 * `flattenResumeText`（还包含 `basics.name`/`basics.title`、公司名、学校/专业/学历、
 * 技能名与证据）。两侧口径不一致 → 候选只要**原样保留**这些字段里的拉丁词或数字，
 * 就会被报成"新增"。实测（见交付说明）：一份全英文简历自己跟自己比都会
 * `ok:false`（reason 里列出一串公司名/专业名），技能写成 `Vue3` 或证据里带
 * `QPS 从 200 提到 2000` 也会被判"多出了数字"。
 *
 * 这是**误报**，而误报正是注释里点名要避免的（"误报会让合法的措辞改写被拒"）。
 * 修好之前这里只断言中文简历这一类确实应当通过的情形，不把错误行为固化成契约。
 */

test('防编造：allowTech 只放行目标岗位的技术词，技能/组织/数字仍然严格', () => {
  const original = baseContent()
  const jobKeywords = techTokensOf('Kubernetes 运维工程师')

  // 目标岗位名出现在**标题与简介**里 —— 这是 allowTech 真正要放行的情形（瞄准，不是编造）
  const allowedTech = checkNoFabrication(
    original,
    {
      ...original,
      basics: { ...original.basics, title: 'Kubernetes 运维工程师' },
      summary: `${original.summary} 希望从事 Kubernetes 方向。`,
    },
    { allowTech: jobKeywords },
  )
  assert.equal(allowedTech.ok, true, `瞄准目标岗位不算编造：${allowedTech.reasons.join('；')}`)

  // **但把同一个词加进技能表就是编造** —— 技能是"我会什么"的声明，不是措辞。
  // 这正是模块注释里点名的那个例子（"顺手写个 Kubernetes"）。
  const addedAsSkill = checkNoFabrication(
    original,
    { ...original, skills: [...original.skills, { name: 'Kubernetes' }] },
    { allowTech: jobKeywords },
  )
  assert.equal(addedAsSkill.ok, false, 'allowTech 不该放行"凭空多一项技能"')
  assert.ok(addedAsSkill.addedSkills.includes('Kubernetes'), JSON.stringify(addedAsSkill.addedSkills))

  const withNewOrg = checkNoFabrication(
    original,
    {
      ...original,
      basics: { ...original.basics, title: 'Kubernetes 运维工程师' },
      experiences: [...original.experiences, { company: '某大厂', title: '架构师', highlights: [] }],
    },
    { allowTech: jobKeywords },
  )
  assert.equal(withNewOrg.ok, false, '放行技术词不等于放行多一段经历')
  assert.ok(withNewOrg.reasons.some((reason) => reason.includes('某大厂')))

  const withNewNumber = checkNoFabrication(
    original,
    {
      ...original,
      basics: { ...original.basics, title: 'Kubernetes 运维工程师' },
      summary: '五年后端经验，做过 Kubernetes，服务可用性 99.99%。',
    },
    { allowTech: jobKeywords },
  )
  assert.equal(withNewNumber.ok, false, '把数字写大是最致命的失真')
  assert.ok(withNewNumber.addedNumbers.includes('99.99%'))
})

// ─────────────────────────────────────────────────────────────────────
// 文件命名（R4）
// ─────────────────────────────────────────────────────────────────────

test('resumeFileName：形如 姓名-方向-年限.pdf', () => {
  assert.equal(resumeFileName(baseContent(), 'pdf'), '张三-后端开发-5年.pdf')
  assert.equal(
    resumeFileName({ ...baseContent(), basics: { name: '张三', title: '后端开发' } }, 'docx'),
    '张三-后端开发.docx',
    '没填年限就不占一段',
  )
})

test('resumeFileName：去掉 Windows 非法字符，且绝不给出空文件名', () => {
  const dirty = resumeFileName(
    { ...baseContent(), basics: { name: '张\\三/:*?"<>|', title: '前/端' } },
    'pdf',
  )
  assert.equal(/[\\/:*?"<>|]/.test(dirty), false, `文件名里还留着非法字符：${dirty}`)
  assert.ok(dirty.endsWith('.pdf'))

  const allIllegal = resumeFileName({ ...emptyResumeContent(), basics: { name: '///', title: '' } }, 'pdf')
  assert.equal(allIllegal, 'resume.pdf', '一个字符都不剩时要退到一个可用名字，而不是空基名')
})

// ─────────────────────────────────────────────────────────────────────
// 事实原子
// ─────────────────────────────────────────────────────────────────────

test('factAtoms：抽出技术词、数字与组织，空简历不炸', () => {
  const atoms = factAtoms(baseContent())
  assert.ok(atoms.tech.has('java'))
  assert.ok(atoms.tech.has('mysql'))
  assert.equal(atoms.tech.has('kubernetes'), false, '没写过的技术词不该凭空出现')
  assert.ok(atoms.numbers.has('800ms'))
  assert.ok(atoms.numbers.has('60%'))
  assert.ok(atoms.orgs.has('杭州云启科技有限公司'))
  assert.ok(atoms.orgs.has('订单中台'))
  assert.ok(atoms.orgs.has('浙江大学'))

  const empty = factAtoms(emptyResumeContent())
  assert.deepEqual([...empty.tech], [])
  assert.deepEqual([...empty.numbers], [])
  assert.deepEqual([...empty.orgs], [], '空字符串不该混进组织集合')
})

test('techTokensOf：抽出技术词，空文本与无技术词文本都返回空数组', () => {
  const tokens = techTokensOf('熟悉 React 与 Kubernetes，了解 MySQL')
  for (const expected of ['react', 'kubernetes', 'mysql']) {
    assert.ok(tokens.includes(expected), `没抽出 ${expected}`)
  }
  assert.deepEqual(techTokensOf(''), [])
  assert.deepEqual(techTokensOf('负责订单系统，沟通能力强。'), [])
})
