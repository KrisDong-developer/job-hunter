/**
 * SinoJobs 的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ## 页面全局「写 / 读」协议（三者必须同文件同改）
 *
 * `fetchListInPage` 把列表响应挂到 `globalThis.__SINOJOBS_LIST_PAYLOAD__`，
 * 随后 `extractJobsInPage` 与 `readTotalInPage` 在**同一次 evaluate 的后续调用**里
 * 把它读出来 —— 写入与读取的**顺序由宿主在 `readListPage` 里保证**（写 → 解析 → 读 total）。
 * 写的一半与读的两半是**同一个页面上下文协议**，不许拆到不同文件。
 *
 * ⚠️ 本文件的函数在真机上**脱离模块作用域**执行（`evaluate` 只序列化源码，闭包不存在）：
 * 不得引用本文件的任何模块级**值**（常量 / 工具函数）；需要就**内联进函数体内**。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败（本仓库踩过）。
 *
 * 完整实测记录（详情页 DOM 结构、接口响应形状）见 `./index.ts` 文件头。
 */
import type { BlockKind } from '../../../../shared/contract/enums/crawl.js'
import type { BlockSignalSet } from '../../block-signals.js'
import type { RawJob, RawJobDetail } from '../../types.js'
import type { SinoJobsConfig, SinoJobsFields } from './config.js'

/**
 * **在页面上下文里**解析列表响应。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以日期换算这类逻辑在函数体内**各写一遍**。
 *
 * @param config 字段配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: SinoJobsConfig): RawJob[] {
  const maxCards = 200 // 异常页面兜底：最多解析多少条
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  const fields = config.fields
  // 数据来源优先级：接口载荷（`__SINOJOBS_LIST_PAYLOAD__`，由 fetchListInPage 写入）
  //   → 内联夹具载荷（离线测试用 `<script id="sinojobs-fixture-payload">`）
  // 两者都没有时返回空数组 —— 上层会把它判成"没解析出记录"。
  const globalScope = globalThis as unknown as { __SINOJOBS_LIST_PAYLOAD__?: unknown }
  let payload: unknown = globalScope.__SINOJOBS_LIST_PAYLOAD__
  if (payload === undefined || payload === null) {
    const holder = queryAll(document, '#sinojobs-fixture-payload')[0] ?? null
    if (holder !== null) {
      try {
        payload = JSON.parse(holder.textContent ?? '')
      } catch {
        payload = null
      }
    }
  }

  const root = payload as { data?: unknown } | null | undefined
  const data = (root?.data ?? {}) as Record<string, unknown>
  const rawRows = data['rows']
  if (!Array.isArray(rawRows)) return []
  const rows = rawRows.slice(0, maxCards)

  const out: RawJob[] = []
  for (const item of rows) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = (key: string): string => clean(record[fields[key as keyof SinoJobsFields] ?? key])

    const id = text('id')
    if (id === '') continue

    const notes: string[] = []

    // ── 薪资：接口的 `salary_range` 就是展示值（`面议` / `25K+`…）。
    // `salary_raw` 是**核心字段**，空串会被 `partitionByRequiredFields` 拦下；
    // 万一字段缺失，给"面议"这个可读兜底（这个平台"面议"本就是真实值，不是掩码）。
    let salaryRaw = text('salaryRange')
    if (salaryRaw === '') {
      salaryRaw = '面议'
      notes.push('salary:absent')
    }

    const title = text('title')
    if (title === '') notes.push('title:missing')

    // ── 标签：置顶岗（`top_time` 非空）是平台的高优先级信号 ──
    const tags: string[] = []
    if (text('topTime') !== '') tags.push('置顶')

    // ── 发布时间：平台给的是 **Unix 秒**（`release_time`，实测 `1788424680`）。
    // 页面显示的是北京时区日期（Asia/Shanghai）—— 这里用 +8h 再取 UTC 日期段，
    // 避免 `new Date(sec*1000)` 在其它时区机器上漂移一天。
    const releaseSecs = Number(text('releaseTime'))
    let publishedAt: string | null = null
    if (Number.isFinite(releaseSecs) && releaseSecs > 0) {
      publishedAt = new Date(releaseSecs * 1000 + 8 * 3600 * 1000).toISOString().slice(0, 10)
    }

    out.push({
      platformJobId: id,
      title,
      salaryRaw,
      company: text('company'),
      sourceUrl: config.detailUrlTemplate.split('{jobId}').join(id),
      city: text('workCity'),
      expReq: text('experience'),
      eduReq: text('education'),
      tags,
      publishedAt,
      notes,
    })
  }

  return out
}

/** 接口响应的最小形状（页面上下文里没法 import 类型，只能就地描述）。 */
interface SinoJobsResponse {
  status?: unknown
  info?: unknown
  data?: { rows?: unknown }
}

/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 与神仙外企同款的两步拆分：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export async function fetchListInPage(arg: {
  url: string
  body: Record<string, string>
}): Promise<{ ok: boolean; statusCode: number | null; message: string; rawStatus: number }> {
  // ⚠️ 不写 `window.fetch`：真浏览器里 `fetch` 挂在 `window`（= globalThis）上，
  // 而离线夹具里 `window` 是 jsdom 的 window、**没有** fetch（见 `test/support/jsdom-page.ts`）。
  // `globalThis` 在两条路径上都拿得到"当前上下文"的东西，是唯一两边都成立的说法。
  const scope = globalThis as unknown as {
    __SINOJOBS_LIST_PAYLOAD__?: unknown
    /** 共享的"页面上下文 fetch"标记（jsdom-page.ts 会装；真浏览器不装，见下）。 */
    __WAIQI_FETCH__?: unknown
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{
      json(): Promise<unknown>
      status?: number
    }>
  }
  // 页面上下文里 fetch **一定存在**（真浏览器如此）。这里只防两种异常：
  //   1) fetch 根本不存在（页面上下文被破坏）；
  //   2) 标记在、但当前 fetch 不是装进去的那个 —— 那多半是宿主 Node 的 fetch 漏了进来。
  //      注意标记只有在**离线夹具**里才存在（jsdom-page.ts 每次 evaluate 都装），
  //      真浏览器路径标记是 undefined —— 所以"标记缺失"不能当错误。
  if (typeof scope.fetch !== 'function') {
    return { ok: false, statusCode: null, message: 'fetch 不可用（页面上下文异常）', rawStatus: 0 }
  }
  if (scope.__WAIQI_FETCH__ !== undefined && scope.__WAIQI_FETCH__ !== scope.fetch) {
    return {
      ok: false,
      statusCode: null,
      message: 'fetch 不是页面上下文的（拒绝回退宿主 fetch）',
      rawStatus: 0,
    }
  }

  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(arg.body)) form.set(key, value)

  let payload: unknown = null
  let rawStatus = 0
  try {
    const response = await scope.fetch(arg.url, {
      method: 'POST',
      // 带上同源 Cookie / 登录态 —— 与用户自己在页面上翻列表走同一条链路。
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        // ⚠️ 站内脚本自己用的是 jQuery `$.ajax`，它会**默认带上** `X-Requested-With`。
        // 缺了它，服务端若按"是不是 AJAX"分支处理，就会走到非 AJAX 那一支
        // （当前实测不带也能读，属潜在隐患 —— 补上它才是"同一种请求"）。
        'X-Requested-With': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body: form.toString(),
    })
    rawStatus = typeof response.status === 'number' ? response.status : 0
    payload = await response.json()
  } catch (error) {
    const name =
      error !== null && typeof error === 'object' && 'name' in error
        ? String((error as { name: unknown }).name)
        : 'Error'
    return { ok: false, statusCode: null, message: `网络请求失败（${name}）`, rawStatus }
  }

  // 把响应交给 `extractJobsInPage` —— 它在**同一次 evaluate 的后续调用**里读这个全局。
  scope.__SINOJOBS_LIST_PAYLOAD__ = payload
  const parsed = payload as SinoJobsResponse | null
  const statusValue = parsed?.status
  const statusCode =
    typeof statusValue === 'number' ? statusValue : typeof statusValue === 'string' && statusValue !== ''
      ? Number(statusValue)
      : null
  const message =
    parsed !== null && parsed !== undefined && typeof parsed.info === 'string' ? parsed.info : ''
  // 实测成功码：1（`{"status":1,"info":"数据获取成功"}`）。
  const ok = statusCode === 1
  return { ok, statusCode, message, rawStatus }
}

/**
 * **在页面上下文里**判断是否撞上风控 / 登录墙 / 空白页。
 *
 * 与神仙外企同理：列表不是 DOM 渲染的，"卡片数"只能当佐证，**接口返回**才是主判据 ——
 * 但接口侧的错误（`status != 1`）已经在 `readListPage` 处以抛错暴露成 `PARSE_FAILED`，
 * 这里只处理**页面结构信号**（实测该平台未观察到接口侧的专门风控码）。
 */
export function detectBlockInPage(arg: {
  cardCount: number
  /** 通用词表（宿主侧用 `signalsOf(...)` 组装后传进来）。 */
  signals: BlockSignalSet
}): BlockKind | null {
  const body = document.body
  const text = body === null ? '' : String(body.textContent ?? '')
  const compact = text.replace(/\s+/g, '')

  for (const selector of arg.signals.captchaSelectors) {
    try {
      if (document.querySelector(selector) !== null) return 'captcha'
    } catch {
      // 单个选择器非法不影响其它判据
    }
  }
  for (const word of arg.signals.rateText) {
    if (compact.includes(word)) return 'rate-limited'
  }
  // 平台侧"额度用完"≠ 频控：退避重试没用，今天就此打住。
  for (const word of arg.signals.quotaText) {
    if (compact.includes(word)) return 'quota-exhausted'
  }

  // 站内错误弹窗（xcConfirm，`window.wxc.xcConfirm`）：接口失败时页面会弹。
  // 弹窗里带登录字样 → 登录墙；否则只按页面文本继续往下判，**不硬猜**风控类型。
  if (document.querySelector('.xcConfirm') !== null) {
    if (/登录|请先登录|未登录/.test(compact)) return 'login-required'
  }

  // 阈值来自共享词表（80，比通用的 120 更严）
  if (arg.cardCount === 0 && compact.length < arg.signals.blankTextLength) return 'blank'
  return null
}

/** 在页面上下文里找「下一页」是否可用（UI 信号；真正的闸门是 `maxPages` + 接口 total）。 */
export function hasNextPageInPage(arg: { selector: string }): boolean {
  try {
    return document.querySelector(arg.selector) !== null
  } catch {
    return false
  }
}

/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递（`/UserCenter/...`）。
 * 未登录时顶部导航是 `<a class="sign-out" href="/Ucenter/login.html">登录</a>`（实测）；
 * 已登录时该链接被用户菜单替换。所以这里只看一个结构性信号：**登录链接是否还在**。
 */
export function isLoggedInInPage(): boolean {
  return document.querySelector('a.sign-out') === null
}

/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export function countCardsInPage(arg: { selector: string }): number {
  try {
    return document.querySelectorAll(arg.selector).length
  } catch {
    return 0
  }
}

/**
 * **在页面上下文里**解析详情页（服务端渲染的静态 HTML，实测结构）：
 *
 *   * 职位名：`h5`；
 *   * 公司名：第一个 `h6`；
 *   * 信息列表（`ul li`）：`[薪资, 城市, 经验 X, 全职/兼职/实习, 发布于YYYY-MM-DD]`；
 *   * JD 正文：`h6`（职位描述/任职要求/联系方式/公司信息）+ 随后的 `p`。
 *
 * 信息列表**按文案模式分类而不是按下标**：平台字段增减时按位置读会错位。
 */
export function extractDetailInPage(config: SinoJobsConfig): RawJobDetail {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const textOf = (node: Element | null): string => (node === null ? '' : clean(node.textContent))
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  const detail = config.detail
  // 岗位 id 从当前地址取（`/Recruitment/content.html?id=4319`）；两条路径都有 location。
  const idMatch = /[?&]id=(\d+)/.exec(String(location.href))
  const jobId = idMatch === null || idMatch[1] === undefined ? '' : idMatch[1]

  const title = textOf(queryAll(document, detail.title)[0] ?? null)
  const company = textOf(queryAll(document, detail.company)[0] ?? null)

  // ── 信息列表：按文案模式分类，不按下标 ──
  let salaryRaw = ''
  let city = ''
  let expReq = ''
  let publishedAt: string | null = null
  const tags: string[] = []
  for (const li of queryAll(document, detail.infoList)) {
    const value = clean(li.textContent)
    if (value === '') continue
    if (/^发布于/.test(value)) {
      const m = /^发布于(\d{4}-\d{2}-\d{2})/.exec(value)
      publishedAt = m === null || m[1] === undefined ? null : m[1]
      continue
    }
    if (/^经验\s*/.test(value)) {
      expReq = value.replace(/^经验\s*/, '').trim()
      continue
    }
    if (/^(全职|兼职|实习)$/.test(value)) {
      tags.push(value)
      continue
    }
    if (salaryRaw === '' && /(K|薪|元|万|面议)/.test(value)) {
      salaryRaw = value
      continue
    }
    // 兜底：还没拿到城市且这行不像薪资（既无 K/元/万/面议 也不是已分类项）→ 城市。
    if (city === '' && salaryRaw !== '' && /[\u4e00-\u9fff]/.test(value)) {
      city = value
    }
  }

  // ── JD 正文：拼接所有段落的可读文本（去重、去首尾空行） ──
  const paragraphs: string[] = []
  const seen = new Set<string>()
  for (const block of queryAll(document, detail.jdBlocks)) {
    const value = clean(block.textContent)
    if (value === '' || seen.has(value)) continue
    seen.add(value)
    paragraphs.push(value)
  }
  const jdText = paragraphs.length === 0 ? null : paragraphs.join('\n')

  return {
    platformJobId: jobId,
    title,
    salaryRaw,
    company,
    sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
    city: city === '' ? undefined : city,
    expReq: expReq === '' ? undefined : expReq,
    tags,
    publishedAt,
    jdText,
  }
}

/** 在页面上下文里读最近一次列表响应的 total（没抓到就 0）。 */
export function readTotalInPage(): number {
  const payload = (globalThis as unknown as { __SINOJOBS_LIST_PAYLOAD__?: unknown })
    .__SINOJOBS_LIST_PAYLOAD__
  const data = (payload as { data?: unknown } | null | undefined)?.data
  if (data === null || data === undefined || typeof data !== 'object') return 0
  const raw = (data as Record<string, unknown>)['total']
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}
