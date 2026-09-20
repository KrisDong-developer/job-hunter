/**
 * HiredChina 的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJob, RawJobDetail } from '../../types.js'
import type { HiredChinaConfig, HiredChinaDetailSelectors } from './config.js'

/**
 * **在页面上下文里**解析列表页 —— 按「卡片身份锚 + 字段底色」策略（见文件头）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param config 由宿主序列化传入
 */
export function extractJobsInPage(arg: HiredChinaConfig): RawJob[] {
  const out: RawJob[] = []
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()

  // ⚠️ 这两个词表归一必须在函数体内（自包含）：真路径上 `extractJobsInPage` 会连同它
  // 一起被序列化送进浏览器，"按源码重建"护栏从源码层面切断对模块作用域的引用。
  const normalizeEmployment = (value: string): string => {
    const v = value.toLowerCase().replace(/\s+/g, '')
    if (/全职|fulltime|full[-\s]?time/.test(v)) return '全职'
    if (/兼职|parttime|part[-\s]?time/.test(v)) return '兼职'
    return ''
  }
  const normalizeWorkMode = (value: string): string => {
    const v = value.toLowerCase().replace(/\s+/g, '')
    if (/远程|remote|在家办公|fullyremote/.test(v)) return '远程'
    if (/现场|onsite|on[-\s]?site|实地/.test(v)) return '现场'
    if (/混合|hybrid/.test(v)) return '混合'
    return ''
  }

  let idRe: RegExp | null = null
  try {
    idRe = new RegExp(arg.jobIdPattern)
  } catch {
    idRe = null
  }

  let cards: NodeListOf<Element> | null = null
  try {
    cards = document.querySelectorAll(arg.selectors.card)
  } catch {
    cards = null
  }
  if (cards === null || cards.length === 0) return out

  /** 取卡片内某底色徽章下的 `span.truncate` 文本；没有返回空串。 */
  const badgeText = (box: Element, selector: string): string => {
    try {
      return clean(box.querySelector(`${selector} span.truncate`)?.textContent)
    } catch {
      return ''
    }
  }

  for (const card of Array.from(cards)) {
    const href = card.getAttribute('href') ?? ''
    if (href === '') continue

    let box: Element = card
    try {
      box = card.querySelector(arg.selectors.cardBox) ?? card
    } catch {
      box = card
    }

    let title = ''
    try {
      title = clean(box.querySelector(arg.selectors.title)?.textContent)
    } catch {
      title = ''
    }
    if (title === '') continue

    const idMatch = idRe !== null ? idRe.exec(href) : null
    const platformJobId = idMatch !== null && idMatch[1] !== undefined ? (idMatch[1] as string) : ''

    // ── 薪资：平台绝大多数卡片都有（"20K - 25K RMB per month" / "Under 10K…"），
    //    面议即 "Negotiable"（非空 = 合法值，见 validate.ts）。留空只发生在解析跑偏时。
    const salaryRaw = badgeText(box, arg.selectors.salaryBadge)

    // ── 公司：取 building 图标所在行的文本（探针：该行内的 span.truncate）。
    let company = ''
    try {
      const icon = box.querySelector(arg.selectors.companyRow)
      if (icon !== null && icon.parentElement !== null) {
        company = clean(icon.parentElement.textContent)
      }
    } catch {
      company = ''
    }

    // ── 地点 "Country · City" 或纯 "City"：取最后一个 "·" 段作城市名。
    const locationText = badgeText(box, arg.selectors.locationBadge)
    const locParts = locationText
      .split('·')
      .map((part) => part.trim())
      .filter((part) => part !== '')
    const city = locParts.length === 0 ? '' : locParts[locParts.length - 1]

    const employment = badgeText(box, arg.selectors.employmentBadge)
    const workMode = badgeText(box, arg.selectors.workModeBadge)
    const expReq = badgeText(box, arg.selectors.experienceBadge)

    // ── 雇佣类型 / 工作模式的 en/zh 词表归一（自包含，不能引用模块常量）──
    // 平台有两个语言站，卡片文案随 lang 切换（如 Full-time/全职、Remote/现场）。
    // 归一到中文稳定值，避免"同一字段两个看似不同标签"污染去重/统计。
    const employmentNorm = normalizeEmployment(employment)
    const workModeNorm = normalizeWorkMode(workMode)

    const tags: string[] = []
    if (employmentNorm !== '') tags.push(employmentNorm)
    if (workModeNorm !== '') tags.push(workModeNorm)

    const notes: string[] = []
    if (platformJobId === '') notes.push('卡片未锚定岗位 UUID，待 probe:hiredchina 校准')
    if (salaryRaw === '') notes.push('薪资徽章未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    let sourceUrl = href
    try {
      sourceUrl = new URL(href, location.origin).href
    } catch {
      /* 原样给，字段断言会兜 */
    }

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(expReq === '' ? {} : { expReq }),
      tags,
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}

/**
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器（`h1` / 渐变卡片薪资 / `div.prose.prose-sm` JD）探针注明，待详情夹具校准。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。company 也仅从徽章行外的
 * 常用锚点 best-effort，捞不到就留空（调用方用列表的公司兜底）。
 */
export function extractDetailInPage(arg: { selectors: HiredChinaDetailSelectors }): RawJobDetail {
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const pick = (selector: string): string => {
    try {
      return clean(document.querySelector(selector)?.textContent)
    } catch {
      return ''
    }
  }

  const title = pick(arg.selectors.title)
  const salaryRaw = pick(arg.selectors.salary)

  let employment = ''
  let workMode = ''
  let expReq = ''
  try {
    const row = document.querySelector(arg.selectors.badgeRow)
    if (row !== null) {
      const badges = Array.from(row.querySelectorAll('span'))
        .map((span) => clean(span.textContent))
        .filter((text) => text !== '')
      for (const badge of badges) {
        const v = badge.toLowerCase().replace(/\s+/g, '')
        if (employment === '' && /全职|兼职|fulltime|full[-\s]?time|parttime|part[-\s]?time/.test(v)) {
          employment = /兼职|parttime|part[-\s]?time/.test(v) ? '兼职' : '全职'
        } else if (workMode === '' && /远程|remote|现场|onsite|on[-\s]?site|混合|hybrid/.test(v)) {
          if (/远程|remote|在家办公/.test(v)) workMode = '远程'
          else if (/混合|hybrid/.test(v)) workMode = '混合'
          else workMode = '现场'
        } else if (expReq === '' && /\d+\s*[-～~]\s*\d+\s*(?:年|years?)|\d+\s*(?:年|years?)|experience|经验不限/i.test(v)) {
          expReq = badge
        }
      }
    }
  } catch {
    /* 徽章行解析失败不影响其余字段 */
  }

  const tags: string[] = []
  if (employment !== '') tags.push(employment)
  if (workMode !== '') tags.push(workMode)

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company: '',
    sourceUrl: location.href,
    jdText: pick(arg.selectors.jdText),
    ...(expReq === '' ? {} : { expReq }),
    tags,
  }
}

/**
 * **在页面上下文里**判断是否还有下一页：分页容器里是否存在「页码 > 当前页」的链接。
 * ⚠️ 自包含。`currentPage` 由宿主传入（真实路径上记录在 pending WeakMap 里）。
 */
export function hasNextPageInPage(arg: { selector: string; currentPage: number }): boolean {
  let nav: Element | null = null
  try {
    nav = document.querySelector(arg.selector)
  } catch {
    nav = null
  }
  if (nav === null) return false
  const current = arg.currentPage > 0 ? arg.currentPage : 1
  let links: NodeListOf<Element> | null = null
  try {
    links = nav.querySelectorAll('a[href*="page="]')
  } catch {
    links = null
  }
  if (links === null) return false
  for (const link of Array.from(links)) {
    const m = /[?&]page=(\d+)/.exec(link.getAttribute('href') ?? '')
    if (m !== null && m[1] !== undefined) {
      const page = Number.parseInt(m[1], 10)
      if (Number.isFinite(page) && page > current) return true
    }
  }
  return false
}
