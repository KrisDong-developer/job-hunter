/**
 * 智联**详情页**（`/jobdetail/{id}.htm`）的页面上下文函数。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行：整段自包含，**不得**引用本文件里新增的
 * 任何模块级值（常量 / 工具函数）—— 需要共享的值必须内联进函数体。离线 jsdom 测不出
 * 这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `./index.ts` 文件头。
 */
import type { RawJobDetail } from '../../../types.js'
import type { ZhaopinConfig } from '../config.js'

/**
 * **在页面上下文里**解析职位详情页，返回完整 `RawJobDetail`（列表扫码的字段 + `jdText`）。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，闭包不存在。只依赖
 * `config`、`document`、`location` —— 任何模块级符号都会 `ReferenceError`。
 *
 * ⚠️ **关键掩码事实（2026-09-18 实测）**：详情页未登录时 **DOM 层薪资/地址被掩码**
 * （`**-**元` / `深圳**********`），但 `__INITIAL_STATE__.jobDetail.detailedPosition` 里
 * 是真实值（`salary: "1-1.1万"`）。所以薪资/JD 正文等**以载荷为准**，DOM 只兜底公司名
 * 这类页面本体就暴露的东西。
 *
 * 载荷字段名（平台自己的，不是 `RawJob` 的）：`positionName`（标题）、`salary`、
 * `positionWorkingExp`、`education`、`description`（JD 纯文本）、`welfareTags`。
 */
export function extractJobDetailInPage(config: ZhaopinConfig): RawJobDetail {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
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
      return Array.prototype.slice.call(document.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  // ── 载荷：__INITIAL_STATE__.jobDetail.detailedPosition（自包含内联解析） ──
  let pos: Record<string, unknown> | null = null
  {
    const scripts = Array.prototype.slice.call(document.querySelectorAll('script')) as Element[]
    for (const script of scripts) {
      const text = script.textContent ?? ''
      const marker = text.indexOf('__INITIAL_STATE__')
      if (marker < 0) continue
      const braceStart = text.indexOf('{', marker)
      if (braceStart < 0) continue
      // 大括号配平取整份 JSON（只有配平能处理嵌套与字符串里的括号）。
      let depth = 0
      let inString = false
      let escaped = false
      let stop = -1
      for (let i = braceStart; i < text.length; i += 1) {
        const ch = text.charAt(i)
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }
        if (ch === '"') inString = true
        else if (ch === '{') depth += 1
        else if (ch === '}') {
          depth -= 1
          if (depth === 0) {
            stop = i
            break
          }
        }
      }
      if (stop < 0) continue
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(text.slice(braceStart, stop + 1)) as Record<string, unknown>
      } catch {
        continue
      }
      const detail = parsed['jobDetail']
      if (detail !== null && typeof detail === 'object') {
        const dp = (detail as Record<string, unknown>)['detailedPosition']
        if (dp !== null && typeof dp === 'object') pos = dp as Record<string, unknown>
      }
      break
    }
  }
  const posText = (key: string): string => {
    if (pos === null) return ''
    const value = pos[key]
    if (typeof value === 'string') return clean(value)
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return ''
  }

  // 岗位 id：从当前 URL 抽，`.../jobdetail/{id}.htm`
  const helmet = /jobdetail\/([A-Za-z0-9]+)\.htm/.exec(location.href)
  const jobId = helmet === null || helmet[1] === undefined ? '' : helmet[1]

  const ds = config.detailSelectors
  // 薪资/JD 正文以载荷为准（DOM 层被掩码）；载荷缺失时才退 DOM。
  const salary = posText('salary')
  const jdText = posText('description') || textOf(queryOne(ds.jdText))

  // 技能/福利标签：载荷 welfareTags（字符串数组）。
  const tags: string[] = []
  const welfare = pos === null ? null : pos['welfareTags']
  if (Array.isArray(welfare)) {
    for (const w of welfare) {
      const s = typeof w === 'string' ? clean(w) : ''
      if (s !== '' && tags.indexOf(s) < 0) tags.push(s)
    }
  }

  // 公司标签（li 顺序固定：[融资, 规模, 行业]）→ size/industry；融资即"性质/融资状态"。
  const companyLis = queryAll(ds.companyTags)
  const companySize = companyLis[1] === undefined ? '' : textOf(companyLis[1])
  const industry = companyLis[2] === undefined ? '' : textOf(companyLis[2])
  const companyNature = companyLis[0] === undefined ? '' : textOf(companyLis[0])

  return {
    platformJobId: jobId,
    title: posText('positionName') || textOf(queryOne(ds.title)),
    salaryRaw: salary,
    company: textOf(queryOne(ds.companyName)),
    sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
    expReq: posText('positionWorkingExp'),
    eduReq: posText('education'),
    tags,
    jdText: jdText === '' ? null : jdText,
    companySize: companySize === '' ? null : companySize,
    industry: industry === '' ? null : industry,
    companyNature: companyNature === '' ? null : companyNature,
  }
}
