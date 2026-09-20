/**
 * HiredChina 的**详情侧页面上下文函数**：JD / 薪资 / 公司 / 行业 / 徽章行归一。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行（`page.evaluate` 序列化后送进浏览器）：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `../index.ts` 的文件头。
 *
 * 详情页与列表页相反，是 **SSR 直出 DOM**（2026-09-20 真实详情页夹具
 * `hiredchina-detail.html` 校准）：h1 / 公司名 / 薪资 / 徽章行 / JD 全在 HTML 里，
 * 不需要等客户端渲染。
 */
import type { RawJobDetail } from '../../../types.js'
import type { HiredChinaDetailSelectors } from '../config.js'

/**
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器由真实详情页夹具校准（见 `config.ts` 的结构图）。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。
 *
 * JD 按**标题锚定**拼接：夹具里 `div.prose.prose-sm` 有两段 —— `Job Description`
 * 与 `Requirements`（各挂在 `h3` 标题之后）。只取第一段会丢任职要求，而下游的
 * 打分与技能差距分析恰恰要读 Requirements 里的技能词。标题词表在
 * `jdSectionTitles`（en/zh 双语，可 DB 覆盖）；一个标题都锚不到时回退取第一段。
 *
 * 字段锚不到时**记 note 而不是静默留空**（与 `zhipin` 的 `page/detail.ts` 同款口径）。
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
  const pickAll = (selector: string): Element[] => {
    try {
      return Array.from(document.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  const title = pick(arg.selectors.title)
  const salaryRaw = pick(arg.selectors.salary)
  const company = pick(arg.selectors.company)
  const industry = pick(arg.selectors.industry)

  /** 这个 prose 段的标题（前一个兄弟 h3）是否命中词表。 */
  const sectionMatched = (node: Element): boolean => {
    if (arg.selectors.jdSectionTitles.length === 0) return false
    let heading = ''
    try {
      heading = clean(node.previousElementSibling?.textContent)
    } catch {
      heading = ''
    }
    if (heading === '') return false
    return arg.selectors.jdSectionTitles.some((word) => heading.includes(word))
  }

  /**
   * JD 正文：按标题锚定的段落优先（JD + Requirements 拼接）；一个都锚不到
   * （标题改版）就回退第一段 prose —— 宁可只有 JD 段，不要整条留空。
   */
  const jdTextOf = (): string => {
    const sections = pickAll(arg.selectors.jdText)
    if (sections.length === 0) return ''
    const matched = sections.filter((node) => sectionMatched(node))
    const chosen = matched.length > 0 ? matched : [sections[0] as Element]
    return chosen
      .map((node) => clean(node.textContent))
      .filter((text) => text !== '')
      .join('\n')
  }
  const jdText = jdTextOf()

  // 徽章行：SSR 已把 i18n key 翻成展示文本（夹具实测 "Malaysia · 吉隆玻 | IT | Full-time |
  // On-site | …"），按内容词表归一（en/zh 双兼容，与列表 payload 通道同一套口径）。
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

  const notes: string[] = []
  if (title === '') notes.push('详情标题未锚定（h1 待校准）')
  if (salaryRaw === '') notes.push('详情薪资未锚定（items-start/shrink-0 金额元素待校准）')
  if (company === '') notes.push('详情公司名未锚定（渐变卡 p.font-medium 待校准）')
  if (jdText === '') notes.push('JD 未锚定（div.prose.prose-sm 待校准）')

  return {
    platformJobId: '',
    title,
    salaryRaw,
    company,
    sourceUrl: location.href,
    jdText,
    ...(expReq === '' ? {} : { expReq }),
    ...(industry === '' ? {} : { industry }),
    tags,
    ...(notes.length === 0 ? {} : { notes }),
  }
}
