/**
 * Indeed 的**页面上下文函数**：由 `page.evaluate` 序列化后送进浏览器里执行 —— 列表页解析与翻页判断。
 *
 * 完整实测记录（JCS 结构、"同卡"向上爬的锚点策略、下一页的 `aria-disabled` 禁用态）见 `./index.ts` 文件头。
 *
 * ⚠️ **自包含警告**：这些函数在真机上**脱离模块作用域**执行（`evaluate` 只带走函数源码），
 * 所以本文件**不得新增任何模块级的值**（常量 / 工具函数）供它们引用 —— 需要就把值内联进函数体。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败 —— 本仓库踩过这个坑。
 */
import type { RawJob } from '../../types.js'
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
