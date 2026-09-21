/**
 * Indeed 的**页面上下文函数**：由 `page.evaluate` 序列化后送进浏览器里执行 ——
 * 列表页解析、翻页判断、登录态判定与详情页解析。
 *
 * 完整实测记录（JCS 结构、"同卡"向上爬的锚点策略、下一页的 `aria-disabled` 禁用态、
 * 登录态载荷判据、详情页四锚点 + 载荷 age 日期）见 `./index.ts` 文件头。
 *
 * ⚠️ **自包含警告**：这些函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 所以本文件**不得新增任何模块级的值**（常量 / 工具函数）供它们引用 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 */
import type { RawJob, RawJobDetail } from '../../types.js'
import type { IndeedSelectors } from './config.js'

/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export function extractJobsInPage(arg: {
  selectors: IndeedSelectors
  host: string
  jobKeyPattern: string
  salaryPattern: string
}): RawJob[] {
  const out: RawJob[] = []
  let links: NodeListOf<Element> | null = null
  try {
    links = document.querySelectorAll(arg.selectors.titleLink)
  } catch {
    return out
  }
  if (links === null) return out

  const compile = (source: string): RegExp | null => {
    try {
      return new RegExp(source)
    } catch {
      return null
    }
  }
  const keyRe = compile(arg.jobKeyPattern)
  const salaryRe = compile(arg.salaryPattern)

  const textOf = (selector: string, scope: Element): string => {
    try {
      const el = scope.querySelector(selector)
      if (el === null) return ''
      return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      return ''
    }
  }

  for (const link of Array.from(links)) {
    const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (title === '') continue

    const rawHref = link.getAttribute('href') ?? ''
    if (rawHref === '') continue

    const keyMatch = keyRe !== null ? keyRe.exec(rawHref) : null
    const platformJobId = keyMatch !== null ? (keyMatch[1] ?? '') : ''
    // 有 jk 就用规范详情地址（viewjob 比 /rc/clk 点击追踪链接干净、可幂等）。
    const sourceUrl =
      platformJobId !== '' ? `https://${arg.host}/viewjob?jk=${platformJobId}` : new URL(rawHref, location.origin).href

    // 找"同卡"做字段锚点：真页面上公司/地点/薪资是标题锚点的**兄弟节点**（都在卡片容器内）。
    // 从链接往上爬，找到第一个包含公司节点的祖先当作卡片容器；找不到就退化为链接自身。
    let card: Element = link
    try {
      let node = link
      while (node.parentElement !== null && node.parentElement !== document.body) {
        node = node.parentElement
        if (node.querySelector(arg.selectors.company) !== null) {
          card = node
          break
        }
      }
    } catch {
      /* 保持 card = link */
    }

    const salaryRaw = salaryRe !== null ? (salaryRe.exec((card.textContent ?? '').replace(/\s+/g, ' '))?.[0] ?? '') : ''
    const company = textOf(arg.selectors.company, card)
    const city = textOf(arg.selectors.location, card)
    const dateRaw = textOf(arg.selectors.date, card)

    const notes: string[] = []
    if (platformJobId === '') notes.push('jobKeyPattern 未命中，待校准')
    if (salaryRaw === '') notes.push('薪资未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    out.push({
      platformJobId,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(notes.length === 0 ? {} : { notes }),
      ...(dateRaw === '' ? {} : { publishedAt: dateRaw }),
    })
  }
  return out
}

/** **在页面上下文里**看「下一页」是否可用（被禁用时打 `aria-disabled`）。 */
export function hasNextPageInPage(arg: {
  pagination: string
  nextPage: string
  disabledAttr: string
}): boolean {
  try {
    const nav = document.querySelector(arg.pagination)
    if (nav === null) return false
    const next = nav.querySelector(arg.nextPage)
    if (next === null) return false
    if (String(next.getAttribute(arg.disabledAttr)).toLowerCase() === 'true') return false
    if (next.hasAttribute('disabled')) return false
    return true
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**判登录态（自包含）。
 *
 * 2026-09-21 `probe:indeed-login` 两侧实测的判据（同一条搜索页，匿名 vs 已登录）：
 *   * **权威**：页面内嵌载荷 `"isLoggedIn":true|false` —— 匿名搜索页与
 *     `secure.indeed.com/auth` 登录页都是 `false`，已登录搜索页是 `true`；
 *   * **回落**（载荷缺失时）：匿名侧登录入口链接只在未登录时渲染
 *     （`a[href*="account.indeed.com"]`：匿名 2 命中 / 已登录 0）—— 有它即未登录；
 *     没有它按已登录处理（真实 Indeed 页面都带载荷，走到回落的只有改版/异常页，
 *     语义交给调用方结合判墙读数决定）。
 *   * 正文过短的页（挑战页/错误页）直接按未登录处理，不拿残页猜。
 */
export function isLoggedInInPage(arg: { loginLinkSelector: string }): boolean {
  try {
    const body = document.body
    if (body === null) return false
    const text = body.textContent ?? ''
    if (text.replace(/\s+/g, ' ').trim().length < 500) return false
    const match = /"isLoggedIn"\s*:\s*(true|false)/.exec(text)
    if (match !== null) return match[1] === 'true'
    return body.querySelector(arg.loginLinkSelector) === null
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**解析详情页（`/viewjob?jk=`，自包含）。
 *
 * 2026-09-21 `probe:indeed-detail` 三页实测（Nike / Apple / Expressions，产物
 * `.probe-indeed-capture/indeed-detail-report-2026-09-21.json`）：
 *   * 标题 `h1[data-testid="jobsearch-JobInfoHeader-title"]`、公司
 *     `[data-testid="inlineHeader-companyName"]`、地点
 *     `[data-testid="inlineHeader-companyLocation"]`、JD 全文 `#jobDescriptionText`
 *     —— 全部 **3/3 命中**；
 *   * **无 JSON-LD JobPosting、无日期/薪资 DOM 节点**：发布日期唯一来源是内嵌载荷
 *     `"hiringInsightsModel":{"age":"30+天前"}`（`jobMetadataFooterModel.age` 同值回落）；
 *   * `jk` 从 `location.href` 抠（与列表侧同一套规范化 → `viewjob?jk=` 地址幂等）。
 * 锚不中的字段留空 + notes，不编。
 */
export function extractDetailInPage(arg: {
  selectors: { title: string; company: string; location: string; description: string }
  host: string
  jobKeyPattern: string
  postedAgePattern: string
}): RawJobDetail {
  const clean = (value: string | null | undefined): string =>
    (value ?? '').replace(/\s+/g, ' ').trim()
  const pick = (selector: string): string => {
    try {
      return clean(document.querySelector(selector)?.textContent)
    } catch {
      return ''
    }
  }

  const title = pick(arg.selectors.title)
  const company = pick(arg.selectors.company)
  const city = pick(arg.selectors.location)
  let jdText: string | null = null
  try {
    const node = document.querySelector(arg.selectors.description)
    jdText = node === null ? null : clean(node.textContent)
    if (jdText === '') jdText = null
  } catch {
    jdText = null
  }

  let platformJobId = ''
  try {
    const match = new RegExp(arg.jobKeyPattern).exec(location.href)
    platformJobId = match !== null && match[1] !== undefined ? match[1] : ''
  } catch {
    platformJobId = ''
  }

  // 发布日期：内嵌载荷的 hiringInsightsModel.age（无 JSON-LD，这是唯一来源 —— 见函数头）。
  let postedAge = ''
  try {
    const ageRe = new RegExp(arg.postedAgePattern)
    const match = ageRe.exec(document.body?.textContent ?? '')
    if (match !== null) postedAge = match[1] ?? match[2] ?? ''
  } catch {
    postedAge = ''
  }

  const notes: string[] = []
  if (title === '') notes.push('详情标题未锚定，待校准')
  if (company === '') notes.push('详情公司未锚定，待校准')
  if (jdText === null) notes.push('JD 全文未锚定，待校准')
  if (postedAge === '') notes.push('发布日期（载荷 age）未命中，待校准')

  return {
    platformJobId,
    title,
    company,
    salaryRaw: '',
    sourceUrl:
      platformJobId !== '' ? `https://${arg.host}/viewjob?jk=${platformJobId}` : location.href,
    ...(city === '' ? {} : { city }),
    ...(notes.length === 0 ? {} : { notes }),
    ...(postedAge === '' ? {} : { publishedAt: postedAge }),
    jdText,
  }
}
