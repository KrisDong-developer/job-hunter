/**
 * 神仙外企的**页面上下文函数** —— 会被 `page.evaluate` 序列化后送进浏览器执行。
 *
 * ## 页面全局「写 / 读」协议（两者必须同文件同改）
 *
 * `fetchListInPage` 把列表响应挂到 `globalThis.__WAIQI_LIST_PAYLOAD__`，
 * 随后 `extractJobsInPage` 在**同一次 evaluate 的后续调用**里把它读出来 ——
 * 写入与读取的**顺序由宿主在 `readListPage` 里保证**（写 → 解析）。
 * 写的一半与读的一半是**同一个页面上下文协议**，不许拆到不同文件。
 *
 * ⚠️ 本文件的函数在真机上**脱离模块作用域**执行（`evaluate` 只序列化源码，闭包不存在）：
 * 不得引用本文件的任何模块级**值**（常量 / 工具函数）；需要就**内联进函数体内**。
 * 离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就是整页解析失败（本仓库踩过）。
 *
 * 完整实测记录（记录字段实测原文、接口 code 语义）见 `./index.ts` 文件头。
 */
import type { BlockKind } from '../../../../shared/contract/enums/crawl.js'
import type { BlockSignalSet } from '../../block-signals.js'
import type { RawJob } from '../../types.js'
import type { WaiqiConfig, WaiqiFields } from './config.js'

/**
 * **在页面上下文里**解析列表。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字）都会变成 `ReferenceError`（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。所以薪资拼接、日期截取这些逻辑在函数体内**各写一遍**，
 * 并由 `test/platform/waiqi.test.ts` 的「按源码重建函数」护栏守住。
 *
 * @param config 选择器与字段配置（由宿主序列化传入）
 */
export function extractJobsInPage(config: WaiqiConfig): RawJob[] {
  // 下面这段是**同步**的：真正的网络请求在 `fetchListInPage` 里。
  // 这样"解析"与"取数"分开，解析逻辑可以被 jsdom 直接喂一段 JSON 验证。
  const maxCards = 200 // 异常页面兜底：最多解析多少条
  const clean = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
  const asNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  const queryAll = (scope: Element | Document, selector: string): Element[] => {
    try {
      return Array.prototype.slice.call(scope.querySelectorAll(selector)) as Element[]
    } catch {
      return []
    }
  }

  const fields = config.fields
  // 数据来源优先级：接口载荷（`window.__WAIQI_LIST_PAYLOAD__`，由 fetchListInPage 写入）
  //   → 内联夹具载荷（离线测试用 `<script id="waiqi-fixture-payload">`）
  // 两者都没有时返回空数组 —— 上层会把它判成"没解析出记录"。
  const globalScope = globalThis as unknown as { __WAIQI_LIST_PAYLOAD__?: unknown }
  let payload: unknown = globalScope.__WAIQI_LIST_PAYLOAD__
  if (payload === undefined || payload === null) {
    const holder = queryAll(document, '#waiqi-fixture-payload')[0] ?? null
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
  const positionVo = (data['positionVO'] ?? {}) as Record<string, unknown>
  const rawRecords = positionVo['records']
  if (!Array.isArray(rawRecords)) return []
  const records = rawRecords.slice(0, maxCards)

  const out: RawJob[] = []
  for (const item of records) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = (key: string): string => clean(record[fields[key as keyof WaiqiFields] ?? key])

    const id = text('id')
    // 广告卡片没有 id —— 直接跳过（needAd=1 时它们与岗位混在同一数组里）。
    if (id === '') continue

    const notes: string[] = []

    // ── 薪资：平台的展示规则是 `{min}-{max}K`，`coefficient>12` 时挂 `*{n}薪` ──
    // `salary_raw` 是**核心字段**，空串会被 `partitionByRequiredFields` 拦下；
    // 这个平台大量岗位薪资为 null，所以必须给"面议"这个可读兜底，
    // 否则整轮抓取会全部进 `pending_repair`，看起来像适配器坏了。
    const min = asNumber(record[fields.salaryMin])
    const max = asNumber(record[fields.salaryMax])
    const months = asNumber(record[fields.salaryMonths])
    const negotiable = record[fields.negotiable] === 1
    let salaryRaw = '面议'
    if (!negotiable && (min !== null || max !== null)) {
      salaryRaw = `${String(min ?? 0)}-${String(max ?? min ?? 0)}K`
      if (months !== null && months > 12) salaryRaw = `${salaryRaw}*${String(months)}薪`
    } else if (min === null && max === null) {
      notes.push('salary:absent')
    }

    const title = text('title')
    const titleEn = text('titleEn')
    if (title === '' && titleEn === '') notes.push('title:missing')
    if (title === '' && titleEn !== '') notes.push('title:from-en')

    // ── 标签：`tagNameList`（数组）+ `attribute`（逗号分隔的另一套） ──
    const tags: string[] = []
    const tagList = record[fields.tags]
    if (Array.isArray(tagList)) {
      for (const tag of tagList) {
        const value = clean(tag)
        if (value !== '' && !tags.includes(value)) tags.push(value)
      }
    }
    const attribute = text('attribute')
    if (attribute !== '') {
      for (const part of attribute.split(/[,，、]/)) {
        const value = clean(part)
        if (value !== '' && !tags.includes(value)) tags.push(value)
      }
    }
    // 外企国别是"神仙外企"最有信息量的一个标签，单独缀到标签里（原始字段仍在记录里）。
    const foreignTag = text('foreignTag')
    if (foreignTag !== '') tags.push(`外企·${foreignTag}`)
    // 岗位职能分类（`posCategoryName`，如 人事/行政 / IT技术）—— 与行业 `industry` 互补，
    // 单独缀一个便于按"岗位性质"识别与检索。
    const posCategory = text('posCategory')
    if (posCategory !== '') tags.push(`职能·${posCategory}`)

    // ── 来源与投递方式（给后续"哪些要走官网 ATS"用） ──
    const sourceCode = text('source')
    if (sourceCode !== '') notes.push(`source:${sourceCode}`)
    const outsideUrl = text('outsideUrl')
    if (outsideUrl !== '') notes.push('apply:external-site')
    // `informationSource` 更具体：不只看是否外投，还指名背后是哪套渠道 / ATS
    // （`workday` / `successfactors` / `oraclecloud` / `万豪官网招聘`……）。实测常驻、很有信息量。
    const ats = text('informationSource')
    if (ats !== '') notes.push(`ats:${ats}`)

    const positionType = text('positionType')
    const posType = positionType === '' ? config.defaultPosType : positionType

    // ── 发布时间：平台给的是 `YYYY-MM-DD HH:mm:ss`（本地时、无时区） ──
    // **只取日期段**：`new Date("2026-09-17 11:18:51")` 在不同引擎上按本地时解析，
    // 跨时区会前后漂一天；而我们只需要"哪一天发的"。
    const createTime = text('publishedAt')
    const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(createTime)

    out.push({
      platformJobId: id,
      title: title !== '' ? title : titleEn,
      salaryRaw,
      company: text('company'),
      sourceUrl: config.detailUrlTemplate
        .split('{jobId}')
        .join(id)
        .split('{posType}')
        .join(posType),
      city: text('city'),
      // 有的岗位 `districtName` 为空，但 `address` 有真实办公地点（如"深圳龙岗区…"）。
      // 用 address 兜底落到 district，让用户至少知道岗位在哪儿。
      district: text('district') === '' ? text('address') : text('district'),
      expReq: text('exp'),
      eduReq: text('edu'),
      tags,
      publishedAt: dateMatch === null ? null : dateMatch[1],
      industry: text('industry') === '' ? null : text('industry'),
      companySize: text('companySize') === '' ? null : text('companySize'),
      companyNature: text('companyNature') === '' ? null : text('companyNature'),
      notes,
    })
  }

  return out
}

/** 接口响应的最小形状（页面上下文里没法 import 类型，只能就地描述）。 */
interface WaiqiResponse {
  code?: unknown
  message?: unknown
  data?: {
    count?: unknown
    totalCount?: unknown
    positionVO?: { records?: unknown }
  }
}

/**
 * **在页面上下文里**发请求、把响应挂到全局，再交给 `extractJobsInPage` 解析。
 *
 * 为什么分两步而不是一个 async 函数干完：`extractJobsInPage` 因此保持**纯同步**，
 * 离线测试可以直接喂一段真实响应 JSON 断言解析结果，不必给 jsdom 装 fetch。
 *
 * ⚠️ 同样必须自包含（不得引用模块作用域变量）。
 */
export async function fetchListInPage(arg: {
  url: string
  body: Record<string, unknown>
}): Promise<{ ok: boolean; code: number | null; message: string; status: number }> {
  // ⚠️ 不写 `window.fetch`：真浏览器里 `fetch` 挂在 `window`（= globalThis）上，
  // 而离线夹具里 `window` 是 jsdom 的 window、**没有** fetch（见 `test/support/jsdom-page.ts`）。
  // `globalThis` 在两条路径上都拿得到"当前上下文"的东西，是唯一两边都成立的说法。
  const scope = globalThis as unknown as {
    __WAIQI_LIST_PAYLOAD__?: unknown
    __WAIQI_FETCH__?: unknown
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{
      json(): Promise<unknown>
      status?: number
    }>
  }
  // ⚠️ 只认**页面上下文自己的** fetch —— 也就是"上一次 evaluate 时装上的那个"
  // （真浏览器里是 `window.fetch`）。绝不回退到宿主 Node 的 fetch：
  // 那会让一次本该走浏览器登录态的采集，变成宿主直连接口；
  // 在离线测试里更糟 —— 它会**真的打到线上**（这条是被 `test/platform/waiqi.test.ts`
  // 的「页面上下文没有 fetch」用例逼出来的：当时它没抛错，而是把真实接口抓回来了）。
  if (scope.__WAIQI_FETCH__ !== scope.fetch || typeof scope.fetch !== 'function') {
    return { ok: false, code: null, message: 'fetch 不可用（页面上下文异常）', status: 0 }
  }

  let payload: unknown = null
  let status = 0
  try {
    const response = await scope.fetch(arg.url, {
      method: 'POST',
      // 带上同源 Cookie / 登录态 —— 与用户自己在页面上翻列表走同一条链路。
      credentials: 'include',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        accept: 'application/json, text/plain, */*',
        // 前端 axios 拦截器固定带 `source: 24`；缺了它服务端会走另一套分支。
        source: '24',
      },
      body: JSON.stringify(arg.body),
    })
    status = typeof response.status === 'number' ? response.status : 0
    payload = await response.json()
  } catch (error) {
    const name =
      error !== null && typeof error === 'object' && 'name' in error
        ? String((error as { name: unknown }).name)
        : 'Error'
    return { ok: false, code: null, message: `网络请求失败（${name}）`, status }
  }

  // 把响应交给 `extractJobsInPage` —— 它在**同一次 evaluate 的后续调用**里读这个全局。
  scope.__WAIQI_LIST_PAYLOAD__ = payload
  const parsed = payload as WaiqiResponse | null
  const code =
    parsed !== null && parsed !== undefined && typeof parsed.code === 'number' ? parsed.code : null
  const message =
    parsed !== null && parsed !== undefined && typeof parsed.message === 'string' ? parsed.message : ''
  // 实测成功码：1000。0/200 一并容忍（不同网关层的写法）。
  const ok = code === 1000 || code === 0 || code === 200
  return { ok, code, message, status }
}

export function detectBlockInPage(arg: {
  cardCount: number
  /** 最近一次列表接口返回的 code；`null` = 还没发过请求。 */
  code: number | null
  /** 通用词表（宿主侧用 `signalsOf(...)` 组装后传进来）。见 `block-signals.ts`。 */
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

  if (arg.code === 1022) return 'login-required'

  // 实时探针触发过：匿名接口短时间高频访问 → `code=429 访问行为异常，请稍后再试`。
  // 判成 rate-limited，主链据此**停手退避**，而不是按 PARSE_FAILED 继续撞卷这堵墙。
  if (arg.code === 429) return 'rate-limited'

  // 阈值来自共享词表（80，比通用的 120 更严）
  if (arg.cardCount === 0 && compact.length < arg.signals.blankTextLength) return 'blank'
  return null
}

/** 在页面上下文里找「下一页」是否可用。**注意**：真正的闸门是 `maxPages=1`。 */
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
 * 这个平台**搜索不需要登录**（列表接口匿名可读），"登录"只影响投递、收藏、订阅。
 * 所以这里只看一个结构性信号：页面上是否有用户头像（未登录时是"登录"按钮）。
 *
 * ⚠️ **不认"页面上有没有『登录』两个字"**：正常结果页右上角一直有登录入口，
 * 拿它判断会导致"永远判定为未登录"，定时任务就永远不跑了（那是个很隐蔽的死锁）。
 */
export function isLoggedInInPage(): boolean {
  return (
    document.querySelector('.head-avatar') !== null || document.querySelector('[class*="user-icon"]') !== null
  )
}

/** 在页面上下文里数卡片（只用于 blank 判定，不用于解析）。 */
export function countCardsInPage(arg: { selector: string }): number {
  try {
    return document.querySelectorAll(arg.selector).length
  } catch {
    return 0
  }
}
