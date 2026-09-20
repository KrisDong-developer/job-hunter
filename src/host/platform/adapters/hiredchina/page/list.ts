/**
 * HiredChina 的**列表侧页面上下文函数**：从 Next.js RSC 流里解析岗位列表。
 *
 * ⚠️ 这些函数在真机上**脱离模块作用域**执行（`page.evaluate` 序列化后送进浏览器）：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败。
 * 完整实测记录见 `../index.ts` 的文件头。
 *
 * ## 为什么解析 RSC 流而不是 DOM（2026-09-20 实测定案）
 *
 * 列表卡片是**客户端组件**（`JobsClientWrapper`）渲染的：raw HTML 里没有任何
 * `/job/` 链接、没有 `data-slot="card"`（真实夹具 `test/fixtures/hiredchina-search.html`
 * 是证据）。岗位数据整包躺在 `self.__next_f.push([1,"f:…"])` 的流里 —— 本函数
 * 就是把那段流拼出来、抽出 `initialData.list`、映射成 `RawJob`。
 *
 * 流的真实形态（夹具原文节选）：
 *
 * ```
 * <script>self.__next_f.push([1,"f:[\"$\",\"$L2a\",null,{\"initialData\":{\"list\":[
 *   {\"line\":\"<uuid>\",\"name\":\"…\",\"company\":{\"line\":\"…\",\"name\":\"Hank Times\",…},
 *    \"salaryKey\":\"support.salarie.20k.-.25k\",\"location\":\"support.nationalitie.malaysia\",
 *    \"isOnline\":0,\"employmentKey\":\"support.employment.full-time\",
 *    \"workingYearsKey\":\"support.workingyears.1～3.years\",\"refreshAt\":\"2026-09-03T01:52:00.000Z\",…}
 * ]}…"])</script>
 * ```
 *
 * ⚠️ 一个 JSON 对象可能被**切成多个 push 分片** —— 必须先拼接全部分片再提取，
 * 不能假设 `initialData` 完整地待在某一个分片里。
 *
 * ⚠️ 字段值大量是 **i18n key**（`support.salarie.*` / `support.nationalitie.*` …），
 * 页面里**没有**配套字典（实测：`support.*` 键只作为数据出现）—— 按 key 的构词规则
 * 还原成可读文本（见函数体内的 `pretty` / `salaryText`），这是"从平台自己的 key
 * 规则还原"，不是编数据。
 */
import type { RawJob } from '../../../types.js'
import type { HiredChinaPayloadAnchors } from '../config.js'

/**
 * **在页面上下文里**解析列表页（RSC 流 → `initialData.list` → `RawJob[]`）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param arg `anchors` = RSC 流锚点（dataKey/listKey/detailPathPattern，可 DB 覆盖）；
 *   `lang` = 语言路径段（`en`/`zh`，详情 URL 的 `/<lang>/job/<uuid>` 前缀）。
 */
export function extractJobsFromPayloadInPage(arg: {
  anchors: HiredChinaPayloadAnchors
  lang: string
}): RawJob[] {
  const out: RawJob[] = []
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')

  // ── i18n key → 可读文本（全部自包含；规则见文件头）──────────────────────
  /** key 去掉 `support.<域>.` 前缀后按构词还原：`.-.` → ' - '，`.` → ' '，词首大写，k/RMB 特判。 */
  const pretty = (key: string): string => {
    if (key === '') return ''
    const tail = key
      .split('.')
      .slice(2)
      .join(' ')
      .replace(/\s+-\s+/g, ' - ')
    if (tail === '') return ''
    return tail
      .split(' ')
      .map((word) => {
        if (word === 'rmb') return 'RMB'
        if (/^\d+k$/i.test(word)) return word.slice(0, -1) + 'K'
        return word === '' ? word : word.charAt(0).toUpperCase() + word.slice(1)
      })
      .join(' ')
  }
  /**
   * 薪资 key 还原。`keep.secret` 是平台的"薪资保密"态 —— 还原成 "Negotiable"
   * （面议，与平台 UI 文案一致，也是 validate.ts 认可的合法非空值）。
   */
  const salaryText = (key: string): string => {
    if (key === '') return ''
    if (key.endsWith('keep.secret')) return 'Negotiable'
    return pretty(key)
  }
  /** 雇佣类型 key（`support.employment.full-time`）→ 中文归一（与站点 en/zh 文案双兼容）。 */
  const employmentNorm = (key: string): string => {
    const v = key.toLowerCase()
    if (v.includes('full-time') || v.includes('fulltime')) return '全职'
    if (v.includes('part-time') || v.includes('parttime')) return '兼职'
    return ''
  }

  // ── 第 1 步：扫全部 <script>，把 __next_f 的分片拼成完整 RSC 流 ──────────
  let flight = ''
  try {
    const pushRe = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]/g
    for (const script of Array.from(document.querySelectorAll('script'))) {
      const text = script.textContent ?? ''
      if (text.indexOf('self.__next_f.push') === -1) continue
      let match: RegExpExecArray | null
      while ((match = pushRe.exec(text)) !== null) {
        const literal = match[1] ?? ''
        try {
          flight += JSON.parse(literal) as string
        } catch {
          /* 单个坏分片跳过，不吃掉整条流 */
        }
      }
    }
  } catch {
    return out
  }
  if (flight === '') return out

  // ── 第 2 步：定位 dataKey，括号配对切出 JSON 对象（跳过字符串字面量）─────
  const keyAt = flight.indexOf(`"${arg.anchors.dataKey}":`)
  if (keyAt === -1) return out
  const braceAt = flight.indexOf('{', keyAt)
  if (braceAt === -1) return out
  let depth = 0
  let inString = false
  let escaped = false
  let endAt = -1
  for (let i = braceAt; i < flight.length; i += 1) {
    const ch = flight[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) {
        endAt = i + 1
        break
      }
    }
  }
  if (endAt === -1) return out

  let data: unknown
  try {
    data = JSON.parse(flight.slice(braceAt, endAt))
  } catch {
    return out
  }
  const record = (data ?? {}) as Record<string, unknown>
  const listRaw = record[arg.anchors.listKey]
  if (!Array.isArray(listRaw)) return out

  // ── 第 3 步：list → RawJob ─────────────────────────────────────────────
  for (const item of listRaw) {
    const job = (item ?? {}) as Record<string, unknown>
    const line = str(job['line'])
    const title = clean(job['name'])
    if (line === '' || title === '') continue

    const companyRecord = (job['company'] ?? {}) as Record<string, unknown>
    const company = clean(companyRecord['name'])

    const salaryRaw = salaryText(str(job['salaryKey']))
    const expReq = pretty(str(job['workingYearsKey']))

    // 地点：location/country 是 i18n key，overseasArea 是中文地名（兜底）
    const city = pretty(str(job['location'])) || pretty(str(job['country'])) || clean(job['overseasArea'])

    const employment = employmentNorm(str(job['employmentKey']))
    // isOnline 实测只有 0/1（现场/远程）；"混合"没有证据，不编
    const workMode = job['isOnline'] === 1 ? '远程' : job['isOnline'] === 0 ? '现场' : ''

    const tags: string[] = []
    if (employment !== '') tags.push(employment)
    if (workMode !== '') tags.push(workMode)

    const notes: string[] = []
    if (salaryRaw === '') notes.push('薪资 key 未锚定，待校准')
    if (company === '') notes.push('公司未锚定，待校准')

    const path = `/${arg.lang}${arg.anchors.detailPathPattern.replace('{id}', line)}`
    let sourceUrl = path
    try {
      sourceUrl = new URL(path, location.origin).href
    } catch {
      /* 原样给，字段断言会兜 */
    }

    out.push({
      platformJobId: line,
      title,
      salaryRaw,
      company,
      sourceUrl,
      ...(city === '' ? {} : { city }),
      ...(expReq === '' ? {} : { expReq }),
      // payload 给的是绝对 ISO 时间戳（DOM 时代只能拿到 "2d ago" 这种相对文案）
      ...(str(job['refreshAt']) === '' ? {} : { publishedAt: str(job['refreshAt']) }),
      tags,
      ...(notes.length === 0 ? {} : { notes }),
    })
  }
  return out
}
