/**
 * BOSS 直聘的**详情页页面上下文函数**：解析岗位详情（JD / 经验学历 / 公司侧栏事实）。
 *
 * ⚠️ 本函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { RawJobDetail } from '../../../types.js'
import type { ZhipinDetailSelectors } from '../config.js'

/**
 * **在页面上下文里**解析详情页（2026-09-18 由真实登录态快照 `probe:zhipin-chat` 校准）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
 *
 * 快照实证的真实结构（深圳·Java 岗，2026-09-18）：
 *
 *   div.job-primary.detail-box
 *     └ div.info-primary
 *         ├ .name h1（标题） / .salary（薪资）
 *         └ p → a.text-city（城市，未解析：地址以列表那条为准）+ span.text-experiece（经验）
 *              + span.text-degree（学历）
 *   div.detail-content-header h3（「职位描述」）
 *   ul.job-keyword-list li（技能标签）
 *   div.job-sec-text（**JD 正文**）
 *   div.job-detail-section.job-detail-company
 *     └ div.job-sec-text.fold-text（**公司介绍** —— 必须排除，否则会把公司简介当成 JD）
 *   div.sider-company
 *     ├ .company-info a（第一个是 logo 链接、文本空；第二个才是公司名）
 *     └ p × 3：i.icon-stage（融资阶段）/ i.icon-scale（规模）/ i.icon-industry（行业）
 */
export function extractDetailInPage(arg: { selectors: ZhipinDetailSelectors }): RawJobDetail {
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryOne = (selector: string): Element | null => {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }
  const queryAll = (selector: string): Element[] => {
    try {
      return Array.from(document.querySelectorAll(selector))
    } catch {
      return []
    }
  }
  const inside = (el: Element, selector: string): boolean => {
    if (selector === '') return false
    try {
      return el.closest(selector) !== null
    } catch {
      return false
    }
  }

  // 标题：`.info-primary .name h1` → `.name h1` → 文档标题去后缀（兜底链）
  let title = textOf(queryOne(arg.selectors.title))
  if (title === '') {
    const documentTitle = clean(document.title)
    const head = documentTitle.split('-')[0]
    title = head === undefined ? '' : clean(head)
  }
  // ⚠️ 薪资数字是**字体混淆**的私有区码点（见文件头「薪资混淆」）——
  //    详情页实测形如「14-15K」是登录态下**人眼看到的**样子；一旦文本里出现私有区码点，
  //    说明这次渲染走的是混淆字体，取到的就是乱码 ⇒ 置空，绝不当薪资写库。
  let salaryRaw = textOf(queryOne(arg.selectors.salary)).replace(/\s+/g, '')
  if (/[\uE000-\uF8FF]/.test(salaryRaw)) salaryRaw = ''

  // 经验/学历：新版走 `.text-experiece` / `.text-degree`；旧版 `.tag-list span` 按顺序兜底
  let expReq = textOf(queryOne(arg.selectors.experience))
  let eduReq = textOf(queryOne(arg.selectors.degree))
  if (expReq === '' || eduReq === '') {
    const legacyTags = queryAll(arg.selectors.tags)
      .map((tag) => clean(tag.textContent))
      .filter((text) => text !== '')
    if (expReq === '') expReq = legacyTags[0] ?? ''
    if (eduReq === '') eduReq = legacyTags[1] ?? ''
  }

  // 技能标签（`.job-keyword-list li`）
  const keywords = queryAll(arg.selectors.keywordList)
    .map((node) => clean(node.textContent))
    .filter((text) => text !== '')

  // JD 正文：跳过「公司介绍」区块（那里有第二份 `.job-sec-text`）
  let jdText = ''
  for (const node of queryAll(arg.selectors.jdText)) {
    if (inside(node, arg.selectors.jdExclude)) continue
    const text = textOf(node)
    if (text !== '') {
      jdText = text
      break
    }
  }

  // 公司名：跳过 logo 链接（文本为空），取第一个有文本的；再兜底 a 的 title，最后用文档标题
  let company = ''
  for (const link of queryAll(arg.selectors.companyLink)) {
    const text = clean(link.textContent)
    if (text !== '' && !text.includes('http')) {
      company = text
      break
    }
    if (company === '') {
      const attrTitle = clean(link.getAttribute('title'))
      if (attrTitle !== '') company = attrTitle
    }
  }
  if (company === '') {
    const match = /_(.+?)招聘/.exec(clean(document.title))
    company = match === null ? '' : clean(match[1])
  }

  // 公司侧栏事实行：**按行内图标类名**区分（`.icon-scale` / `.icon-industry` / `.icon-stage`）——
  // 不能用"文本里有没有『人』"去猜：侧栏第一行是标题「公司基本信息」，猜法会把它当成行业。
  let companySize = ''
  let industry = ''
  let companyNature = ''
  for (const line of queryAll(arg.selectors.companyFacts)) {
    const text = clean(line.textContent)
    if (text === '') continue
    if (line.querySelector('.icon-scale') !== null) companySize = text
    else if (line.querySelector('.icon-industry') !== null) industry = text
    else if (line.querySelector('.icon-stage') !== null) companyNature = text
  }
  // 旧版标签兜底（`.res-industry-item` / `.company-info-item`）
  if (companySize === '' || industry === '') {
    for (const tag of queryAll(arg.selectors.companyTags)) {
      const text = clean(tag.textContent)
      if (text === '') continue
      if (companySize === '' && text.includes('人')) companySize = text
      else if (industry === '') industry = text
    }
  }

  const notes: string[] = []
  if (jdText === '') notes.push('JD 未锚定（job-sec-text 待校准）')
  if (title === '') notes.push('详情标题未锚定，待校准')
  if (company === '') notes.push('详情公司名未锚定，待校准')
  if (salaryRaw === '') notes.push('详情薪资未锚定，待校准')
  if (expReq === '' && eduReq === '') notes.push('经验/学历未锚定（text-experiece / text-degree 待校准）')

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company,
    // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
    sourceUrl: location.href,
    ...(expReq === '' ? {} : { expReq }),
    ...(eduReq === '' ? {} : { eduReq }),
    ...(keywords.length === 0 ? {} : { tags: keywords }),
    ...(industry === '' ? {} : { industry }),
    ...(companySize === '' ? {} : { companySize }),
    ...(companyNature === '' ? {} : { companyNature }),
    ...(jdText === '' ? {} : { jdText }),
    ...(notes.length === 0 ? {} : { notes }),
  }
}
