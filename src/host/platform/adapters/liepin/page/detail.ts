/**
 * 猎聘的**详情页页面上下文函数**：解析 JD / 薪资 / 关键信息行 / 公司名。
 *
 * 完整实测记录见 `../index.ts` 文件头。
 *
 * ⚠️ 本函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 */
import type { RawJobDetail } from '../../../types.js'
import type { LiepinSelectors } from '../config.js'

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
