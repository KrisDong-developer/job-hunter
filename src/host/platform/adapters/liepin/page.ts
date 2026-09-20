/**
 * 猎聘的**页面上下文函数**：这些函数会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * 完整实测记录见 `./index.ts` 文件头。
 *
 * ⚠️ 它们在真机上**脱离模块作用域**执行 —— 本文件**不得**新增任何模块级的值
 * （常量 / 工具函数 / 其它函数）供它们引用；若某个页面函数需要模块私有的值，
 * 必须把那个值**内联进该函数体内**。离线 jsdom 测不出这个错（Node 里闭包还在），
 * 一上真机就整页解析失败 —— 本仓库踩过这个坑。
 */
import type { RawJob, RawJobDetail } from '../../types.js'
import type { LiepinSelectors } from './config.js'

/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上会被序列化送进浏览器执行，闭包不存在）。
 * 卡片结构（夹具实测）：
 *
 *   div.job-card-pc-container
 *     └ a[data-nick=job-detail-job-info]                 ← 职位链接（广告卡没有）
 *         ├ div[title="招聘Java工程师"] → Java工程师      ← 标题
 *         ├ 【佛山-顺德区】                               ← 城市
 *         ├ 15-30k·14薪                                  ← 薪资（文本模式）
 *         └ 5年以上 / 本科                                ← 经验/学历（词表）
 *     └ [data-nick=job-detail-company-info]
 *         └ span × 3：库卡机器人 / 工业自动化 / 2000-5000人
 *
 * 解析失败的字段留空/记 notes，由字段级断言隔离 —— **不编**。
 */
export function extractJobsInPage(arg: {
  selectors: LiepinSelectors
  salaryPattern: string
  jobIdPattern: string
  cityPattern: string
  expPattern: string
  eduPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    return out
  }
  if (cards === null) return out

  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const salaryRe = compile(arg.salaryPattern)
  const idRe = compile(arg.jobIdPattern)
  const cityRe = compile(arg.cityPattern)
  const expRe = compile(arg.expPattern)
  const eduRe = compile(arg.eduPattern)

  for (const card of Array.from(cards)) {
    let link: Element | null = null
    try {
      link = card.querySelector(arg.selectors.jobLink)
    } catch {
      link = null
    }
    // 广告/推荐卡没有职位链接 → 跳过（夹具实测 42 卡中 5 张属于此类）。
    if (link === null) continue

    const href = link.getAttribute('href') ?? ''
    if (href === '') continue
    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 相对路径拼不成就原样给，字段断言会兜 */
    }

    const linkText = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    const cardText = (card.textContent ?? '').replace(/\s+/g, ' ').trim()

    // 标题：优先链接内带 title 属性的节点（文本比 title 属性干净——后者带"招聘"前缀）。
    let title = ''
    try {
      const titleNode = link.querySelector(arg.selectors.titleNode)
      if (titleNode !== null) {
        title = (titleNode.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (title === '') title = (titleNode.getAttribute('title') ?? '').trim()
      }
    } catch {
      title = ''
    }
    if (title === '') {
      // 兜底：链接文本截到第一个【或数字（薪资/城市）之前。
      const head = /[【\d]/.exec(linkText)
      title = head !== null ? linkText.slice(0, head.index).trim() : linkText.slice(0, 40).trim()
    }
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null
    const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : ''

    const cityMatch = cityRe !== null ? cityRe.exec(linkText) : null
    const city = cityMatch !== null ? (cityMatch[1] ?? '').trim() : ''

    const salaryMatch = salaryRe !== null ? salaryRe.exec(cardText) : null
    const salaryRaw = salaryMatch !== null ? salaryMatch[0].replace(/\s+/g, '') : ''

    const expMatch = expRe !== null ? expRe.exec(linkText) : null
    const expReq = expMatch !== null ? (expMatch[1] ?? '') : ''
    const eduMatch = eduRe !== null ? eduRe.exec(linkText) : null
    const eduReq = eduMatch !== null ? (eduMatch[1] ?? '') : ''

    // 公司盒：span 文本按顺序是 公司名 / 行业 / 规模（夹具实测；logo 是 img 不干扰）。
    let company = ''
    let industry: string | null = null
    let companySize: string | null = null
    try {
      const box = card.querySelector(arg.selectors.companyInfoBox)
      if (box !== null) {
        const spans = Array.from(box.querySelectorAll('span'))
          .map((span) => (span.textContent ?? '').replace(/\s+/g, ' ').trim())
          .filter((text) => text !== '')
        company = spans[0] ?? ''
        industry = spans[1] ?? null
        companySize = spans[2] ?? null
      }
    } catch {
      company = ''
    }

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobIdPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(expReq === '' ? {} : { expReq }),
      ...(eduReq === '' ? {} : { eduReq }),
      ...(industry === null ? {} : { industry }),
      ...(companySize === null ? {} : { companySize }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export function hasNextPageInPage(arg: {
  pagination: string
  nextPage: string
  disabledClass: string
}): boolean {
  try {
    const box = document.querySelector(arg.pagination)
    if (box === null) return false
    const next = box.querySelector(arg.nextPage)
    if (next === null) return false
    const cls = next.getAttribute('class') ?? ''
    return !cls.includes(arg.disabledClass)
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**解析职位详情页（2026-09-18 探针真实夹具校准）。
 *
 * ⚠️ 必须完全自包含（会被序列化送进浏览器执行）。
 *
 * 与其它平台的关键差别：猎聘详情页是 **SSR 直出** —— JD 正文就在 DOM 里
 * （`section.job-intro-container` 中 `dt=职位介绍` 那块 `dd`，实测 1074 字），
 * **未登录也读得到**，不需要像智联那样从 `__INITIAL_STATE__` 挖载荷。
 * 薪资也**不做正则匹配**：详情页有明确的 `.salary` 节点（列表页才需要文本模式）。
 *
 * 为什么用 `dt` 的**文案**当锚点：同一个容器里有多个 `dl`，只有「职位介绍」
 * 那块是正文，其余是「其他信息」（语言/行业/部门要求）—— 按类名取会取错块。
 */
export function extractJobDetailInPage(arg: {
  selectors: LiepinSelectors
  expPattern: string
  eduPattern: string
}): RawJobDetail {
  const clean = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryOne = (selector: string): Element | null => {
    try {
      return document.querySelector(selector)
    } catch {
      return null
    }
  }
  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }

  const title = textOf(queryOne(arg.selectors.detailTitle))
  const salaryRaw = textOf(queryOne(arg.selectors.detailSalary)).replace(/\s+/g, '')

  // 关键信息行：「佛山-顺德区 5年以上 本科 招5人 9月17日更新」
  const properties = textOf(queryOne(arg.selectors.detailProperties))
  const city = properties.split(/\s+/)[0] ?? ''
  const expMatch = compile(arg.expPattern)?.exec(properties) ?? null
  const eduMatch = compile(arg.eduPattern)?.exec(properties) ?? null

  // 公司名：详情页的「公司信息」卡片（列表页那套三段式公司盒在详情页只出现在推荐位）
  const company = textOf(queryOne(arg.selectors.detailCompany))

  // JD 正文：遍历「职位介绍」那块 dl 的 dd，排除 .ellipsis-1（那是「其他信息」的条目）
  let jdText = ''
  const section = queryOne(arg.selectors.detailIntroSection)
  if (section !== null) {
    for (const dl of Array.from(section.querySelectorAll('dl'))) {
      const dt = dl.querySelector('dt')
      if (clean(dt === null ? '' : dt.textContent) !== arg.selectors.detailIntroTitleText) continue
      const parts: string[] = []
      for (const dd of Array.from(dl.querySelectorAll('dd'))) {
        if ((dd.getAttribute('class') ?? '').includes('ellipsis-1')) continue
        const text = clean(dd.textContent)
        if (text !== '') parts.push(text)
      }
      if (parts.length > 0) {
        jdText = parts.join('\n')
        break
      }
    }
  }

  const notes: string[] = []
  if (jdText === '') notes.push('JD 未锚定（detailIntroSection / detailIntroTitleText 待校准）')
  if (title === '') notes.push('详情标题未锚定，待校准')
  if (company === '') notes.push('详情公司名未锚定，待校准')

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company,
    // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
    sourceUrl: location.href,
    ...(city === '' ? {} : { city }),
    ...(expMatch === null ? {} : { expReq: expMatch[1] ?? '' }),
    ...(eduMatch === null ? {} : { eduReq: eduMatch[1] ?? '' }),
    ...(jdText === '' ? {} : { jdText }),
    ...(notes.length === 0 ? {} : { notes }),
  }
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据来自两份真实快照的对比（2026-09-19）——
 * 匿名夹具（`test/fixtures/liepin-search.html`，全新 profile 抓的）
 * vs 登录态捕获（`.probe-liepin-capture/liepin-walk-01-search.html`）：
 *
 * | 信号 | 未登录 | 已登录 |
 * |---|---|---|
 * | `#header-quick-menu-user-info`（`loggedInMarker`） | 无 | **有** |
 * | `.header-quick-menu-not-login-item`（`notLoggedInMarker`） | **有** | 无 |
 *
 * ⚠️ 两个都**不能**用文案判：「登录/注册」在匿名页出现 2 次、登录页 0 次，看着也能用，
 * 但文案一变就静默失效（本仓库有明文纪律：只认结构性信号）。
 *
 * 两个标记都不在 ⇒ 返回 `null`（**判不出来**），由调用方决定怎么落地 ——
 * 适配器里按 `false` 处理（保守：宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
 */
export function isLoggedInInPage(arg: { loggedInMarker: string; notLoggedInMarker: string }): boolean | null {
  const has = (selector: string): boolean => {
    if (selector === '') return false
    try {
      return document.querySelector(selector) !== null
    } catch {
      return false
    }
  }
  if (has(arg.loggedInMarker)) return true
  if (has(arg.notLoggedInMarker)) return false
  return null
}
