/**
 * 国聘网的**详情页页面上下文函数**：`/job/detail?id=` 页的解析。
 *
 * 结构由 2026-09-20 登录态快照 `.probe-guopin-capture/guopin-detail-2026-09-20.html` 实证
 * （此前是语义锚点，本轮校准为真实类名）：
 *
 * ```
 * div.job-banner > div.container
 *   div.title-box > div.title-wrap
 *     div.title-section > div.title                    ← 标题（页面无 h1）
 *     img.icon-time + span.update-time「更新于 2026-09-12」← publishedAt
 * div.job-container > div.container > div.job-content
 *   div.left
 *     div.job-overview-section > div.overview-item × N  ← 键值对（顺序不固定，按 title 文本归类）
 *       span.overview-title「报名截止：」+ span.overview-desc「2026-12-31 23:59:59」
 *       （实测项：职位性质 / 最低学历 / 报名截止；WebFetch 版本另见 招聘人数 / 工作经验 /
 *         专业要求 / 行业要求 —— 不同岗位项数不同，按词归类、认不出的进 tags）
 *     div.job-intro-section
 *       div.section-title「职位介绍」
 *       div.section-content
 *         div.intro-tag-wrap > span.intro-tag × N       ← 职能标签（进 tags）
 *         div.job-duty                                   ← JD 全文
 *   div.right
 *     div.job-company-wrap
 *       div.job-company-top > div.job-company-desc
 *         a[href="/company?id=…"] > div.company-title    ← 公司名（logo 那个 a 里没有文本）
 *       div.job-company-tag > span.company-tag × 4       ← 服务类型/性质/行业/规模（顺序不固定）
 * ```
 *
 * ⚠️ 本函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 不得引用任何模块级的值 —— 需要就把值内联进函数体。
 */
import type { RawJobDetail } from '../../../types.js'
import type { GuopinConfig } from '../config.js'

/**
 * **在页面上下文里**解析详情页（自包含）。
 *
 * 快照样本（引才计划岗）**没有薪资节点** —— 薪资不是每个详情页都有，
 * `detailSalary` 保留语义候选，读到就过 `salaryPattern` 校验（宁空勿脏）。
 */
export function extractDetailInPage(arg: {
  selectors: GuopinConfig['selectors']
  jobIdPattern: string
  deadlinePattern: string
  salaryPattern: string
  eduPattern: string
  expPattern: string
  naturePattern: string
  companyNaturePattern: string
  companySizePattern: string
}): RawJobDetail {
  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const salaryRe = compile(arg.salaryPattern)
  const eduRe = compile(arg.eduPattern)
  const expRe = compile(arg.expPattern)
  const natureRe = compile(arg.naturePattern)
  const natureCompanyRe = compile(arg.companyNaturePattern)
  const sizeRe = compile(arg.companySizePattern)
  const deadlineRe = compile(arg.deadlinePattern)

  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const pick = (selector: string): string => {
    try {
      return textOf(document.querySelector(selector))
    } catch {
      return ''
    }
  }

  const idMatch = new RegExp(arg.jobIdPattern).exec(location.href)
  const platformJobId = idMatch !== null && idMatch[1] !== undefined ? (idMatch[1] as string) : ''

  // 标题：`.title-section .title`；兜底 document.title 第一段（「岗位-公司-国聘」）。
  let title = pick(arg.selectors.detailTitle)
  if (title === '') {
    const head = clean(document.title.split('-')[0])
    title = head
  }

  // 薪资：语义候选（本快照无此节点）；文本要过 salaryPattern 才收，宁空勿脏。
  let salaryRaw = pick(arg.selectors.detailSalary).replace(/\s+/g, '')
  if (salaryRaw !== '' && (salaryRe === null || !salaryRe.test(salaryRaw))) salaryRaw = ''

  // ── overview 键值对：按 overview-title 的**文本**归类（顺序不固定，认不出进 tags）──
  let applyDeadline: string | null = null
  let eduReq = ''
  let expReq = ''
  const tags: string[] = []
  try {
    for (const item of Array.from(document.querySelectorAll(arg.selectors.detailOverviewItems))) {
      const key = textOf(item.querySelector('.overview-title')).replace(/[：:]\s*$/, '')
      const value = textOf(item.querySelector('.overview-desc'))
      if (key === '' || value === '') continue
      if (key.includes('报名截止')) {
        applyDeadline = value
        continue
      }
      if (key.includes('学历')) {
        eduReq = value
        continue
      }
      if (key.includes('经验')) {
        expReq = value
        continue
      }
      // 职位性质（校招/社招…）：裸值进 tags —— 与列表侧 tags 的口径一致
      // （列表把性质/经验/学历的裸值都放 tags）。
      if (natureRe !== null && natureRe.test(value)) {
        if (!tags.includes(value)) tags.push(value)
        continue
      }
      // 招聘人数 / 专业要求 / 行业要求 …：没有对应字段，带 key 前缀进 tags 保信息量。
      if (eduRe !== null && eduRe.test(value)) {
        if (eduReq === '') eduReq = value
        continue
      }
      if (expRe !== null && expRe.test(value)) {
        if (expReq === '') expReq = value
        continue
      }
      if (!tags.includes(`${key}：${value}`.slice(0, 30))) tags.push(`${key}：${value}`.slice(0, 30))
    }
  } catch {
    /* overview 解析失败不影响其余字段 */
  }

  // 报名截止兜底：overview 没给时，从正文抠「报名截止：<时间>」（老路径，保 DB 覆盖兼容）。
  if (applyDeadline === null) {
    try {
      const m = deadlineRe === null ? null : deadlineRe.exec(document.body?.textContent ?? '')
      if (m !== null && m[1] !== undefined) {
        const raw = (m[1] as string).trim()
        if (raw !== '') applyDeadline = raw
      }
    } catch {
      applyDeadline = null
    }
  }

  // 职能标签（`.intro-tag`，进 tags，与 overview 挤进来的键值对共存去重）。
  try {
    for (const tag of Array.from(document.querySelectorAll(arg.selectors.detailIntroTags))) {
      const t = textOf(tag)
      if (t !== '' && !tags.includes(t)) tags.push(t)
    }
  } catch {
    /* 留空 */
  }

  // JD 全文（`.job-duty`）。
  const jdText = pick(arg.selectors.detailJdText)

  // 公司名（`.company-title`；logo 链接的 a 里没有文本，之前 `a[href*="/company"]` 会先命中它）。
  const company = pick(arg.selectors.detailCompany)

  // 公司标签 ×4：顺序不固定（服务类型/性质/行业/规模），按词表归类性质与规模；
  // 行业不猜（「公共招聘服务 / 汽车制造业」分不出谁是行业，列表侧 company-info-item 已有行业）。
  let companyNature = ''
  let companySize = ''
  try {
    for (const tag of Array.from(document.querySelectorAll(arg.selectors.detailCompanyTags))) {
      const t = textOf(tag)
      if (t === '') continue
      if (natureCompanyRe !== null && natureCompanyRe.test(t) && companyNature === '') companyNature = t
      else if (sizeRe !== null && sizeRe.test(t) && companySize === '') companySize = t
    }
  } catch {
    /* 留空 */
  }

  // 更新时间（「更新于 2026-09-12」→ publishedAt 只留日期）。
  let publishedAt: string | null = null
  const updateTime = pick(arg.selectors.detailUpdateTime)
  if (updateTime !== '') {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(updateTime)
    if (m !== null && m[1] !== undefined) publishedAt = m[1]
  }

  return {
    platformJobId,
    title,
    salaryRaw,
    company,
    sourceUrl: location.href,
    jdText,
    tags,
    ...(expReq === '' ? {} : { expReq }),
    ...(eduReq === '' ? {} : { eduReq }),
    ...(companyNature === '' ? {} : { companyNature }),
    ...(companySize === '' ? {} : { companySize }),
    ...(publishedAt === null ? {} : { publishedAt }),
    ...(applyDeadline === null ? {} : { applyDeadline }),
  }
}
