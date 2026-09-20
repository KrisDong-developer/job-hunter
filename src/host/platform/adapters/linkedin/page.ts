/**
 * LinkedIn 的**页面上下文函数**：由 `page.evaluate` 序列化后送进浏览器里执行 ——
 * 列表卡片解析（活 DOM）、详情页解析、地址级判墙、登录检测。
 *
 * ⚠️ **自包含警告**：这些函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 所以本文件**不得新增任何模块级的值**（常量 / 工具函数）供它们引用 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 *
 * ⚠️ **Trusted Types 红线**（2026-09-20 v2 探针两次真机实测）：LinkedIn 的 CSP 启用
 * Trusted Types，本文件的函数**不得**出现 `innerHTML = 字符串`、`outerHTML =`、
 * `DOMParser.parseFromString` 一类的注入 sink —— 真实页面上会直接抛
 * 「requires TrustedHTML」，而且离线 jsdom 测不出（没有 CSP）。
 * 所有解析都只做**读**（querySelector / getAttribute / textContent）。
 *
 * 完整调研记录见 `./index.ts` 文件头。
 */
import type { RawJob, RawJobDetail } from '../../types.js'
import type { LinkedInDetailSelectors, LinkedInSelectors } from './config.js'

/** 卡片解析的入参（解析**当前文档** —— guest 端点经顶层导航后，片段已是活 DOM）。 */
export interface ExtractCardsArg {
  selectors: LinkedInSelectors
  host: string
  jobUrnPattern: string
  jobIdFromUrlPattern: string
  salaryPattern: string
}

/**
 * **在页面上下文里**解析岗位卡片（当前文档）。
 *
 * 卡片锚点：`div.base-card`；平台 id 优先取 `data-entity-urn`（`urn:li:jobPosting:{id}`），
 * 没有再从标题链接 href 抠（`/jobs/view/{slug}-{id}`）。sourceUrl 一律规范成
 * `https://{host}/jobs/view/{id}`（LinkedIn 的岗位 URL 不带 securityId 一类的会话参数，
 * 规范形可幂等 —— 与 BOSS「绝不重构 URL」的规则不冲突）。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export function extractJobsInPage(arg: ExtractCardsArg): RawJob[] {
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
  const urnRe = compile(arg.jobUrnPattern)
  const urlRe = compile(arg.jobIdFromUrlPattern)
  const salaryRe = compile(arg.salaryPattern)

  const textOf = (selector: string, scopeEl: Element): string => {
    try {
      const el = scopeEl.querySelector(selector)
      if (el === null) return ''
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  for (const card of Array.from(cards)) {
    let link: Element | null = null
    try {
      link = card.querySelector(arg.selectors.titleLink)
    } catch {
      link = null
    }
    if (link === null) continue

    // 标题优先用标题节点（链接文本有时带尾随装饰字符），锚不中再退链接文本。
    let title = textOf(arg.selectors.title, card)
    if (title === '') title = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') continue

    const rawHref = link.getAttribute('href') ?? ''
    const urn = card.getAttribute(arg.selectors.entityUrnAttr) ?? ''
    let platformJobId = ''
    if (urnRe !== null) {
      const m = urnRe.exec(urn)
      if (m !== null) platformJobId = m[1] ?? ''
    }
    if (platformJobId === '' && urlRe !== null && rawHref !== '') {
      const m = urlRe.exec(rawHref)
      if (m !== null) platformJobId = m[1] ?? ''
    }

    const company = textOf(arg.selectors.company, card)
    const city = textOf(arg.selectors.location, card)
    const salaryRaw = textOf(arg.selectors.salary, card)
    const salary =
      salaryRaw !== ''
        ? salaryRaw
        : salaryRe !== null
          ? (salaryRe.exec((card.textContent ?? '').replace(/\s+/g, ' '))?.[0] ?? '')
          : ''

    // 发布时间：time 元素的 datetime 属性是 ISO 日期（比「2 days ago」的相对文本更有用）。
    let publishedAt = ''
    try {
      const timeEl = card.querySelector(arg.selectors.time)
      if (timeEl !== null) publishedAt = timeEl.getAttribute('datetime') ?? ''
      if (publishedAt === '' && timeEl !== null) {
        publishedAt = (timeEl.textContent ?? '').replace(/\s+/g, ' ').trim()
      }
    } catch {
      publishedAt = ''
    }

    // id 未命中时退回链接原始地址（source_url 是核心字段，不能给空串）。
    let sourceUrl = ''
    if (platformJobId !== '') {
      sourceUrl = `https://${arg.host}/jobs/view/${platformJobId}`
    } else if (rawHref !== '') {
      try {
        sourceUrl = new URL(rawHref, location.origin).href
      } catch {
        sourceUrl = rawHref
      }
    }

    const notes: string[] = []
    if (platformJobId === '') notes.push('岗位 id 未锚定（urn 与 URL 双通道都没命中），待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title,
      salaryRaw: salary,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(publishedAt === '' ? {} : { publishedAt }),
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析详情页（已导航到 `/jobs/view/{id}` 的活 DOM）。
 *
 * 锚点由 2026-09-20 `probe:linkedin-v2` 的真机快照逐项证实（见 config.ts 的
 * `LinkedInDetailSelectors` 文档注释）。详情页对游客 SSR 直出（真机：匿名打开
 * 落点无 authwall、JD/criteria 全在）—— 不需要登录态。
 *
 * 字段映射：criteria 里「职位级别」→ expReq；「职能类别 / 行业」→ tags；
 * JD 全文（`.show-more-less-html__markup` 的 textContent —— clamp 折叠是 CSS 层
 * 的事，textContent 一定是全文）→ jdText。
 */
export function extractDetailInPage(arg: { selectors: LinkedInDetailSelectors }): RawJobDetail {
  const clean = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const textOf = (selector: string): string => {
    try {
      const el = document.querySelector(selector)
      return el === null ? '' : clean(el.textContent)
    } catch {
      return ''
    }
  }

  const title = textOf(arg.selectors.title)
  const company = textOf(arg.selectors.company)
  const city = textOf(arg.selectors.location)
  const postedAt = textOf(arg.selectors.postedTime)
  const jdText = textOf(arg.selectors.jd)

  // criteria 列表：h3 标题 + span 值，按标题文本分发字段。
  let expReq = ''
  const tags: string[] = []
  try {
    const items = Array.from(document.querySelectorAll(arg.selectors.criteriaItem))
    for (const item of items) {
      const headerEl = item.querySelector(arg.selectors.criteriaHeader)
      const textEl = item.querySelector(arg.selectors.criteriaText)
      const header = clean(headerEl?.textContent)
      const value = clean(textEl?.textContent)
      if (header === '' || value === '') continue
      if (header === arg.selectors.expHeader) {
        expReq = value
        continue
      }
      // 其余维度（职位性质/职能类别/行业）进 tags —— 不猜专字段，语义留给下游。
      tags.push(`${header}：${value}`)
    }
  } catch {
    /* criteria 列表缺了不该带倒整页 */
  }

  return {
    platformJobId: '',
    title,
    salaryRaw: '',
    company,
    sourceUrl: '',
    ...(city === '' ? {} : { city }),
    jdText,
    ...(expReq === '' ? {} : { expReq }),
    ...(postedAt === '' ? {} : { publishedAt: postedAt }),
    ...(tags.length === 0 ? {} : { tags }),
  }
}

/**
 * **在页面上下文里**读地址级的墙信号（结构性判据，比文案可靠）。
 *
 *   * `/authwall`（或被 302 到登录页）→ `'authwall'` → 调用方判 `login-required`；
 *   * `/checkpoint`、`/captcha` → `'checkpoint'` → 调用方判 `captcha`。
 *
 * 为什么不放 `detectBlockWithSignals` 的 urlPatterns：那里的 URL 特征**一律判 captcha**，
 * 而 authwall 是登录墙 —— 语义错了会把用户引去「重试/等待」而不是「登录」。
 */
export function wallKindInPage(): 'authwall' | 'checkpoint' | null {
  let path = ''
  let href = ''
  try {
    path = location.pathname
    href = location.href
  } catch {
    return null
  }
  if (path.startsWith('/authwall') || path.startsWith('/login') || path.startsWith('/uas/login')) {
    return 'authwall'
  }
  if (path.startsWith('/checkpoint') || path.startsWith('/captcha')) return 'checkpoint'
  // href 兜底：某些风控处置不换 pathname（历史路由 / hash 路由）。
  if (href.includes('/authwall')) return 'authwall'
  if (href.includes('/checkpoint/challenge')) return 'checkpoint'
  return null
}

/**
 * **在页面上下文里**判登录态：页头 global-nav 的「我」区（头像）在不在。
 *
 * 判据由 2026-09-20 `probe:linkedin-login` 的两侧对比定案（选择器由宿主机传入，
 * 见 `LinkedInConfig.loggedInSelector`）：`.global-nav__me-photo` / `.global-nav__me`
 * 已登录侧各 1 命中、未登录侧 0。⚠️ 判据按**正常页面**校准 —— 登录页上没有
 * global-nav，在那儿判会恒「未登录」，所以 `auth.checkUrl` 用搜索页。
 */
export function isLoggedInInPage(arg: { selector: string }): boolean {
  try {
    return document.querySelector(arg.selector) !== null
  } catch {
    return false
  }
}
