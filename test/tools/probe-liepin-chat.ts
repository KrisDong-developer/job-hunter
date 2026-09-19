/**
 * 猎聘「登录态走查」探针 —— 为 `actions`（收件箱 / 阶段探测 / 沟通）补证据。
 *
 * ## 为什么必须有它
 *
 * 猎聘已经是 `stable`（列表 + 详情 + 42/42 校准），但 **`actions` 一个都没实现**，
 * 而 `platform-facts` 里只留了一条间接线索：「聊天按钮需 hover」。
 * 也就是说：**我们从来没看过猎聘登录态下的沟通入口与消息页长什么样** ——
 * 仓库里 7 个 `probe-liepin-*` 全在解决"能不能自动化"（CDP 检测 / 端口守卫 / patchright 启动式），
 * 没有一个碰过沟通与消息。
 *
 * 按本仓库的纪律：**没有实测证据不写选择器**。所以先采，再实现。
 *
 * ## 它怎么走（默认全自动，危险入口按语义挡）
 *
 * ① 登录态搜索页：卡片数 / 薪资是否**明文**（猎聘夹具里是 `23-30k` 明文，不像 BOSS 那种字体混淆）
 *    / 页头有没有「消息」入口（顺带**发现** IM 的真实地址，不猜 URL）；
 * ② 详情页：**hover** 沟通入口（`mouse.move` 只移动，不算点击）→ 采浮层/按钮契约；
 *    投递入口只取证不点；
 * ③ 我的沟通：真鼠标点侧边栏 `#im-c-entry`（默认允许 —— 只读导航，不发任何消息），
 *    采会话列表 DOM 与 `im.c.chat.*` 接口；
 * ④ 全程采 `api-c.liepin.com` 等接口，**记 method + postData**（`.probe-liepin-capture/`）。
 *
 * ⚠️ **默认不点任何会产生对外动作的按钮**（沟通 / 打招呼 / 投递 / 发送）。
 *    要点头得显式开：`LIEPIN_ALLOW_CHAT=1`（沟通类）、`LIEPIN_ALLOW_APPLY=1`（投递类）。
 *    这条护栏是被智联那次"误投一份简历"逼出来的 —— 详见 `PLATFORM-ZHAOPIN.md` §8.4。
 * ⚠️ 猎聘的风控比 BOSS/智联都硬：`security.min.js` 会检测"CDP 控制页面"并主动探测调试端口
 *    （v6 实测：只导航也会被 `about:blank` 销毁）⇒ **必须 patchright 启动式 + stealth 注入**，
 *    不能用 attach。本探针与 `probe-liepin-v8` 同一条路线。
 *
 * ## 产物
 *
 * `.probe-liepin-capture/`
 *   * `liepin-walk-<NN>-<kind>.html`  每个去重后的页面状态一份整页 HTML
 *   * `liepin-chat-report.json`       `snapshots[]`（含控件清单 + hover 前后对比）/ `network[]`
 *     （url/method/status/postData/body 片段）/ `login`（闸门 = 渲染，**不下登录结论**）/ `autoWalk.steps[]`
 *
 * ⚠️ 刻意**不写 `test/fixtures/`**（那里是被用例硬编码钉住的夹具）。要钉住某一份就人工复制并同步期望值。
 *
 * ## 用法
 *
 * ```bash
 * npm run probe:liepin-chat
 * ```
 *
 * 环境变量：
 *   LIEPIN_PROFILE     profile 目录（默认 `.probe-liepin-profile`，与 `probe:liepin` 共用）
 *   LIEPIN_KEY         关键词（默认 `Java`）
 *   LIEPIN_RENDER_SEC  等待卡片渲染上限（秒，默认 60）—— **不是**等登录
 *   LIEPIN_ALLOW_CHAT  `1` = 允许点沟通类入口（**可能真的发出招呼**，默认禁止）
 *   LIEPIN_ALLOW_APPLY `1` = 允许点投递类入口（**会真的投出简历**，默认禁止）
 *   LIEPIN_AUTO_WALK   `0` = 只录制、由你手动走
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
// ⚠️ **直接用适配器自己那套**（42/42 校准过的）选择器与 URL 构造器。
// 第一版探针在这里栽过：卡片选择器与"登录标记"都是我现编的，结果**登录着也判成未登录、
// 卡片数恒为 0** —— 白白等了一轮登录超时。探针的价值恰恰是"用适配器的眼睛看页面"，
// 现编一套等于同时维护两份真相，还会让人误以为线上选择器坏了。
import {
  buildLiepinSearchUrl,
  buildSearchRequestBody,
  DEFAULT_LIEPIN_CONFIG,
  fetchListInPage,
  LIEPIN_API_HEADERS,
  LIEPIN_JOB_ID_PATTERN,
  LIEPIN_SALARY_PATTERN,
  parseSearchApiResponse,
  type LiepinConfig,
} from '../../src/host/platform/adapters/liepin.js'

const KEYWORD = process.env['LIEPIN_KEY'] ?? 'Java'
const PROFILE = process.env['LIEPIN_PROFILE'] ?? join(process.cwd(), '.probe-liepin-profile')
const CAPTURE_DIR = process.env['LIEPIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-liepin-capture')
const REPORT_PATH = join(CAPTURE_DIR, 'liepin-chat-report.json')
const AUTO_WALK = process.env['LIEPIN_AUTO_WALK'] !== '0'
const ALLOW_CHAT = process.env['LIEPIN_ALLOW_CHAT'] === '1'
const ALLOW_APPLY = process.env['LIEPIN_ALLOW_APPLY'] === '1'

const CONFIG: LiepinConfig = DEFAULT_LIEPIN_CONFIG
const SEARCH_URL =
  buildLiepinSearchUrl(CONFIG, { keyword: KEYWORD, page: 1 }) ??
  `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(KEYWORD)}`
/** 等页面渲染出卡片的上限（**不是**等登录 —— 见下面的说明）。 */
const RENDER_WAIT_MS = Math.max(10, Number(process.env['LIEPIN_RENDER_SEC'] ?? '60')) * 1_000
const POLL_MS = 3_000
const MAX_SNAPSHOTS = 40
const MAX_HTML_CHARS = 3_000_000

function log(message: string): void {
  console.log(`[probe-liepin-chat] ${new Date().toISOString()} ${message}`)
}

/* ── 页面侧（自包含，全部只读）──────────────────────────────────────── */

/** 一页观察到的东西（自包含；选择器全部来自适配器）。 */
export function scanLiepinPageInPage(arg: {
  /** 适配器自己的选择器逐个量命中数（探针的眼睛 = 适配器的眼睛）。 */
  probeSelectors: Record<string, string>
  /** 卡片容器（来自适配器配置）—— 列表薪资要在这个范围内按模式数。 */
  cardSelector: string
  salaryPattern: string
  chatWords: string[]
  hrefPatterns: string[]
  /** 未登录时页面上会出现的按钮文案（**只作为观察记录，不拿来当闸门**）。 */
  loginWords: string[]
}): {
  url: string
  title: string
  /** 每个适配器选择器的命中数。 */
  selectorHits: Record<string, number>
  /** 含数字的薪资节点数（列表页：在卡片文本里按模式匹配；详情页：直接数节点）。 */
  salaryPlain: number
  chatCandidates: Array<{ text: string; tag: string; cls: string }>
  links: Array<{ text: string; href: string }>
  /** 页面上是否出现了"未登录"字样（观察项，不作闸门）。 */
  loginWordsSeen: string[]
  bodyHead: string
} {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const q = (selector: string): Element[] => {
    try {
      return Array.from(document.querySelectorAll(selector))
    } catch {
      return []
    }
  }
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      if (rect.width < 4 || rect.height < 4) return false
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    } catch {
      return false
    }
  }

  const selectorHits: Record<string, number> = {}
  for (const [name, selector] of Object.entries(arg.probeSelectors)) {
    selectorHits[name] = q(selector).length
  }

  let salaryPattern: RegExp | null = null
  try {
    salaryPattern = new RegExp(arg.salaryPattern)
  } catch {
    salaryPattern = null
  }
  const salaryPlain =
    salaryPattern === null
      ? 0
      : q(arg.cardSelector).filter((el) => salaryPattern.test(clean(el.textContent))).length

  const chatCandidates: Array<{ text: string; tag: string; cls: string }> = []
  for (const el of q('a, button, [role="button"], div, span')) {
    const text = clean(el.textContent)
    if (text === '' || text.length > 14) continue
    if (!arg.chatWords.some((word) => text.includes(word))) continue
    if (!visible(el)) continue
    chatCandidates.push({ text, tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') ?? '' })
    if (chatCandidates.length >= 30) break
  }

  const links: Array<{ text: string; href: string }> = []
  for (const a of q('a[href]')) {
    const href = a.getAttribute('href') ?? ''
    if (href === '' || href.startsWith('javascript') || href === '#') continue
    if (!arg.hrefPatterns.some((pattern) => href.includes(pattern))) continue
    links.push({ text: clean(a.textContent).slice(0, 40), href })
    if (links.length >= 30) break
  }

  const bodyText = clean(document.body?.textContent)
  const loginWordsSeen = arg.loginWords.filter((word) => bodyText.includes(word))

  return {
    url: location.href,
    title: document.title,
    selectorHits,
    salaryPlain,
    chatCandidates,
    links,
    loginWordsSeen,
    bodyHead: bodyText.slice(0, 240),
  }
}

/**
 * 找文本含给定词的**可见**元素中心（自包含）。只定位 —— 点击/hover 由 host 侧真鼠标做。
 *
 * 「最内层」那一步是必须的：按文本匹配会把容器一起选进来，而容器中心点可能落在空白处
 * （zhipin / zhaopin 都踩过同一个坑）。
 */
export function findElementCenterInPage(arg: {
  words: string[]
  maxTextLength: number
  /**
   * 文本含这些词的一律排除（可选）。
   *
   * 为什么必须有：详情页上既有岗位自己的「聊一聊」(`a.btn-chat`)，也有页头侧边栏的
   * 「我的沟通」—— 按文档顺序取第一个命中的话，会 hover 到侧边栏标题上（第一次实测就是这样，
   * 白采了一份跟沟通无关的前后快照）。
   */
  excludeWords?: string[]
}): {
  found: boolean
  x: number
  y: number
  text: string
  tag: string
  cls: string
} {
  const empty = { found: false, x: 0, y: 0, text: '', tag: '', cls: '' }
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      if (rect.width < 4 || rect.height < 4) return false
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    } catch {
      return false
    }
  }
  let matched: Element[] = []
  const excluded = arg.excludeWords ?? []
  try {
    matched = Array.from(document.querySelectorAll('a, button, [role="button"], span, div, li, i')).filter(
      (el) => {
        const text = clean(el.textContent)
        if (text === '' || text.length > arg.maxTextLength) return false
        if (!arg.words.some((word) => text.includes(word))) return false
        if (excluded.some((word) => text.includes(word))) return false
        return visible(el)
      },
    )
  } catch {
    return empty
  }
  const innermost = matched.find((el) => !matched.some((other) => other !== el && el.contains(other)))
  const chosen = innermost ?? matched[matched.length - 1]
  if (chosen === undefined) return empty
  try {
    chosen.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* 没布局引擎也不该炸 */
  }
  const rect = chosen.getBoundingClientRect()
  return {
    found: true,
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    text: clean(chosen.textContent),
    tag: chosen.tagName.toLowerCase(),
    cls: chosen.getAttribute('class') ?? '',
  }
}

/**
 * 按**选择器**取可见元素的中心（自包含）。用于那些"文案不可靠、只能按选择器定位"的入口
 * —— 典型是猎聘的收件箱入口 `#im-c-entry`：它是侧边栏的 `<div>`（不是 `<a>`），
 * 按 href 找命中 0 条、按文案「消息」也找不到（它叫「我的沟通」）。
 */
export function centerOfSelectorInPage(arg: { selector: string; maxTextLength: number }): {
  found: boolean
  x: number
  y: number
  text: string
  tag: string
  cls: string
} {
  const empty = { found: false, x: 0, y: 0, text: '', tag: '', cls: '' }
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      if (rect.width < 4 || rect.height < 4) return false
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    } catch {
      return false
    }
  }
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selector))
  } catch {
    return empty
  }
  // 取**最小**的那个可见命中：`#im-c-entry .im-ui-basic-entry` 会把外层容器一并选进来，
  // 容器中心可能落在空白处（zhipin / zhaopin 都踩过）。
  const visibleOnes = nodes.filter(visible).filter((el) => clean(el.textContent).length <= arg.maxTextLength)
  const pool = visibleOnes.length > 0 ? visibleOnes : nodes.filter(visible)
  let chosen: Element | undefined
  for (const el of pool) {
    const rect = el.getBoundingClientRect()
    const area = rect.width * rect.height
    if (chosen === undefined) {
      chosen = el
      continue
    }
    const chosenRect = chosen.getBoundingClientRect()
    if (area < chosenRect.width * chosenRect.height) chosen = el
  }
  if (chosen === undefined) return empty
  try {
    chosen.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* 没布局引擎也不该炸 */
  }
  const rect = chosen.getBoundingClientRect()
  return {
    found: true,
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    text: clean(chosen.textContent),
    tag: chosen.tagName.toLowerCase(),
    cls: chosen.getAttribute('class') ?? '',
  }
}

/**
 * 会话列表接口的**可调用变体**探测（自包含）。
 *
 * 为什么必须做：请求体里的 `imId` 是**页面自己知道**的（我们只看到它出现在请求里），
 * 来源不明 —— 可能来自 cookie、可能是 `__INITIAL_STATE__`、也可能服务端靠 cookie 推断、
 * `imId` 其实可以留空。**适配器要接口化就必须先知道这一格**：
 * 拿不到 `imId` 就只能退回 DOM 解析。三个变体里必须带一个**对照组**（带真实 imId），
 * 否则"空 imId 失败"也可能是我们的 fetch 形态压根不对（跨域/头/编码）—— 那结论就反了。
 */
export async function probeContactListInPage(arg: {
  api: string
  pageSize: number
  /** 从页面自己的请求里抄下来的真实 imId（对照组；为空就不跑这条）。 */
  realImId: string
  /** 页面自己那次请求的头（**同一份**）；不带头时实测连对照组都失败。 */
  headers: Record<string, string>
}): Promise<{
  cookieHasImId: boolean
  /** 页面 JS 能看到的 imId 型 cookie 名（httpOnly 的看不到 —— 这本身就是结论）。 */
  cookieImIdNames: string[]
  variants: Array<{ name: string; ok: boolean; note: string; rows: number; raw: string }>
}> {
  const cookie = (() => {
    try {
      return document.cookie
    } catch {
      return ''
    }
  })()
  const cookieImIdNames = cookie
    .split(';')
    .map((part) => part.trim().split('=')[0] ?? '')
    .filter((name) => /^imId/i.test(name))

  const bodies: Array<{ name: string; body: string }> = [
    { name: '空 imId', body: `imUserType=0&imId=&imApp=1&pageSize=${String(arg.pageSize)}&curPage=0` },
    { name: '不带 imId 参数', body: `imUserType=0&imApp=1&pageSize=${String(arg.pageSize)}&curPage=0` },
  ]
  if (arg.realImId !== '') {
    bodies.push({
      name: '对照组：带真实 imId',
      body: `imUserType=0&imId=${arg.realImId}&imApp=1&pageSize=${String(arg.pageSize)}&curPage=0`,
    })
  }

  const variants: Array<{ name: string; ok: boolean; note: string; rows: number; raw: string }> = []
  for (const variant of bodies) {
    try {
      const response = await globalThis.fetch(arg.api, {
        method: 'POST',
        headers: { ...arg.headers, 'content-type': 'application/x-www-form-urlencoded' },
        body: variant.body,
        credentials: 'include',
      })
      const text = await response.text()
      let rows = -1
      try {
        const parsed = JSON.parse(text) as { data?: { list?: unknown[] } }
        rows = Array.isArray(parsed.data?.list) ? parsed.data.list.length : -1
      } catch {
        /* 不是 JSON 就把原文留着 */
      }
      variants.push({ name: variant.name, ok: true, note: `HTTP ${String(response.status)}`, rows, raw: text.slice(0, 400) })
    } catch (error) {
      variants.push({
        name: variant.name,
        ok: false,
        note: error instanceof Error ? error.message : String(error),
        rows: -1,
        raw: '',
      })
    }
  }
  return { cookieHasImId: cookieImIdNames.length > 0, cookieImIdNames, variants }
}

/**
 * 搜索接口的**请求头门坎**复验（自包含）。
 *
 * 为什么留着它：适配器的 `readListPage` 是**双通道**（接口优先、失败**静默**回退 DOM）。
 * 接口一旦调不通，表现是"一切正常"，只是永远拿不到 `publishedAt`/`industry`/`companySize` ——
 * 这条通道曾经就是这样**静默死了很久**（只带 `content-type` ⇒ `{"flag":0,"code":"-1400"}`，HTTP 还是 200）。
 *
 * 所以：真正的生产路径由下面的 `page.evaluate(fetchListInPage, ...)` 在线复验；
 * 这里保留一条**预期失败**的反例，把"门 = `x-fscp-*` 那一族的完整性"钉在日志里 ——
 * 这件事反直觉（少一项就全废，而且状态码看不出来），删了它下次还会有人重新踩。
 *
 * 2026-09-19 定这份头集时的完整削减表见 `LIEPIN_API_HEADERS` 的注释。
 */
export async function probeSearchHeadersInPage(arg: {
  api: string
  /** 页面自己那次请求的 body（原文）。 */
  pageBody: string
  /** 页面自己那次请求的头。 */
  headers: Record<string, string>
}): Promise<
  Array<{
    name: string
    ok: boolean
    note: string
    cards: number
    flag: string
    chattedTrue: number
    chattedSamples: string[]
  }>
> {
  const telemetry = ['x-fscp-trace-id', 'x-fscp-bi-stat', 'x-fscp-fe-version'] as const
  const withoutTelemetry: Record<string, string> = { ...arg.headers }
  for (const name of telemetry) delete withoutTelemetry[name]
  const variants: Array<{ name: string; body: string; headers: Record<string, string> }> = [
    { name: 'A 对照组：页面原样（应当成功）', body: arg.pageBody, headers: arg.headers },
    {
      name: 'B 反例：去掉遥测三项（**预期失败**）',
      body: arg.pageBody,
      headers: withoutTelemetry,
    },
  ]
  const out: Array<{ name: string; ok: boolean; note: string; cards: number; flag: string; chattedTrue: number; chattedSamples: string[] }> = []
  for (const variant of variants) {
    try {
      const response = await globalThis.fetch(arg.api, {
        method: 'POST',
        headers: variant.headers,
        body: variant.body,
        credentials: 'include',
      })
      const text = await response.text()
      let cards = -1
      let flag = '?'
      let chattedTrue = -1
      const chattedSamples: string[] = []
      try {
        const parsed = JSON.parse(text) as {
          flag?: unknown
          data?: { data?: { jobCardList?: unknown[] }; jobCardList?: unknown[] }
        }
        flag = String(parsed.flag)
        const list = parsed.data?.data?.jobCardList ?? parsed.data?.jobCardList
        cards = Array.isArray(list) ? list.length : -1
        // `recruiter.chatted` 是"**是否已经和这个招聘者沟通过**" —— 列表接口里就有的
        // **按岗位的阶段信号**（不需要会话样本）。这里量它的取值分布，找正向样本。
        if (Array.isArray(list)) {
          chattedTrue = 0
          for (const entry of list) {
            const item = entry as { job?: Record<string, unknown>; recruiter?: Record<string, unknown> }
            if (item?.recruiter?.['chatted'] !== true) continue
            chattedTrue += 1
            if (chattedSamples.length < 5) {
              chattedSamples.push(
                `${String(item.job?.['jobId'] ?? '?')} / ${String(item.recruiter?.['recruiterName'] ?? '?')} / ${String(item.job?.['title'] ?? '?').slice(0, 24)}`,
              )
            }
          }
        }
      } catch {
        /* 不是 JSON 就把原文留着 */
      }
      out.push({
        name: variant.name,
        ok: response.ok,
        note: `HTTP ${String(response.status)} · flag=${flag} · ${text.slice(0, 90)}`,
        cards,
        flag,
        chattedTrue,
        chattedSamples,
      })
    } catch (error) {
      out.push({
        name: variant.name,
        ok: false,
        note: error instanceof Error ? error.message : String(error),
        cards: -1,
        flag: '?',
        chattedTrue: -1,
        chattedSamples: [],
      })
    }
  }
  return out
}

/**
 * 把页面上**所有**筛选码表选项扒出来（自包含）—— 包括刚点开、才渲染出来的那些。
 *
 * 为什么这么写：猎聘的筛选区把码表**直接渲在 DOM 属性里**
 * （`<li data-key="dq" data-code="010" data-name="北京">`），包括热门城市那一行；
 * 完整城市树要点开 `#filter-option-other-city` 才加载。所以"扒属性"比"抠文案"稳得多
 * （文案会重复、会带样式；`data-code` 是给前端自己用的，语义不会漂）。
 *
 * 同时也把 picker 容器的 `innerHTML` 头部带回来 —— 万一完整城市树**不用同一套属性**
 * （比如换成 `data-dq-code`），那片段就是下一步该怎么写的依据。
 */
export function dumpCodeOptionsInPage(arg: { pickerSelector: string; maxText: number; maxHtml: number }): {
  items: Array<{ key: string; code: string; name: string }>
  pickerFound: boolean
  pickerText: string
  pickerHtmlHead: string
  /** 页面上现存的浮层容器（城市树很可能是 popper，挂在 body 下面而不是原容器里）。 */
  overlays: Array<{ cls: string; textHead: string; htmlHead: string }>
} {
  const items: Array<{ key: string; code: string; name: string }> = []
  try {
    for (const el of Array.from(document.querySelectorAll('[data-code][data-name]'))) {
      const key = el.getAttribute('data-key') ?? ''
      const code = el.getAttribute('data-code') ?? ''
      const name = el.getAttribute('data-name') ?? ''
      if (key === '' || code === '' || name === '') continue
      items.push({ key, code, name })
    }
  } catch {
    /* 选择器坏了也不许炸 */
  }
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  let pickerFound = false
  let pickerText = ''
  let pickerHtmlHead = ''
  for (const selector of [arg.pickerSelector, '.antd-lp-city']) {
    let el: Element | null = null
    try {
      el = document.querySelector(selector)
    } catch {
      el = null
    }
    if (el === null) continue
    pickerFound = true
    pickerText = clean(el.textContent).slice(0, arg.maxText)
    pickerHtmlHead = el.innerHTML.slice(0, arg.maxHtml)
    break
  }
  const overlays: Array<{ cls: string; textHead: string; htmlHead: string }> = []
  try {
    const selector =
      '[class*="popover"],[class*="popper"],[class*="dropdown"],[class*="lp-city"],[class*="city-picker"],[class*="modal"]'
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const rect = el.getBoundingClientRect()
      if (rect.width < 20 || rect.height < 20) continue
      const text = clean(el.textContent)
      if (text === '') continue
      overlays.push({ cls: el.getAttribute('class') ?? '', textHead: text.slice(0, 120), htmlHead: el.innerHTML.slice(0, arg.maxHtml) })
      if (overlays.length >= 6) break
    }
  } catch {
    /* 同上 */
  }
  return { items, pickerFound, pickerText, pickerHtmlHead, overlays }
}

/**
 * 读「请选择城市」弹窗里的城市码表（自包含）。
 *
 * 结构（2026-09-19 实测）：
 *   `<li class="ant-menu-item ant-menu-item-only-child code_050" data-code="050">
 *      <span class="ant-menu-title-content"><span class="ant-menu-text">广东</span></span></li>`
 * —— **省级是 3 位码**（050 广东 / 180 湖南 / 110 广西）、**市级是 6 位码**
 * （050020 广州 / 050090 深圳，前 3 位正好是省的码）。名字统一取 `.ant-menu-text`。
 *
 * `codePattern` 用来按码长区分省级/市级 —— 比按列位置猜稳（弹窗有"省 / 市 / 区"多列）。
 */
export function cityModalItemsInPage(arg: {
  modalSelector: string
  codePattern: string
  scroll: boolean
}): Array<{ code: string; name: string; x: number; y: number }> {
  const out: Array<{ code: string; name: string; x: number; y: number }> = []
  let regex: RegExp | null = null
  try {
    regex = new RegExp(arg.codePattern)
  } catch {
    regex = null
  }
  let modal: Element | null = null
  try {
    modal = document.querySelector(arg.modalSelector)
  } catch {
    modal = null
  }
  const collect = (scope: Element | Document): Element[] => {
    try {
      return Array.from(scope.querySelectorAll('li[data-code]'))
    } catch {
      return []
    }
  }
  const pick = (scope: Element | Document): Array<{ code: string; name: string; node: Element }> => {
    const found: Array<{ code: string; name: string; node: Element }> = []
    for (const node of collect(scope)) {
      const code = node.getAttribute('data-code') ?? ''
      if (regex !== null && !regex.test(code)) continue
      const nameNode = node.querySelector('.ant-menu-text') ?? node
      const name = (nameNode.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (name === '') continue
      found.push({ code, name, node })
    }
    return found
  }
  // ⚠️ **按"过滤后有没有匹配"决定要不要退回整篇文档** —— 不是按"有没有 li[data-code]"。
  // 2026-09-19 实测：点开一个省之后**市级那一列不在 `.ant-modal.city-modal` 里**
  // （modal 内始终只有 33 项 = 历史/热门 + 港澳台 + 31 省，一个 6 位码都没有），
  // 只看"modal 里有没有 li[data-code]"会拿到 33 个省级项就以为找到了，从而得出"点省没用"的错结论。
  // 多列弹窗把列渲在兄弟容器里是常见做法。
  let matches = modal === null ? [] : pick(modal)
  if (matches.length === 0) matches = pick(document)
  for (const match of matches) {
    if (arg.scroll) {
      try {
        match.node.scrollIntoView({ block: 'center', inline: 'nearest' })
      } catch {
        /* 没布局引擎也不该炸 */
      }
    }
    const rect = match.node.getBoundingClientRect()
    out.push({
      code: match.code,
      name: match.name,
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
    })
  }
  return out
}

/**
 * 读「请选择城市」弹窗里**当前显示的那一列市级项**（自包含）。
 *
 * 结构（2026-09-19 实测，踩过两次坑才看清）：
 *   `<div class="data-container">
 *      <p class="step-content"><span class="step-text last-step">贵州</span></p>
 *      <div class="data-list"><ul class="data-list-ul clearfix">
 *        <li><span class="ant-tag ant-tag-checkable">全贵州</span></li>          ← 无 id，跳过
 *        <li id="code_120020"><span class="ant-tag ant-tag-checkable">贵阳</span></li>
 *        ...
 *
 * ⚠️ 坑 1：市级项的码在 **`id="code_<6 位>"`** 上，**没有 `data-code`**（省级才有）
 *    —— 按 `li[data-code]` 找市级项会得到 0，看起来像"点省没用"。
 * ⚠️ 坑 2：市级那一列**不在 `.ant-modal.city-modal` 里**（在兄弟容器 `.data-container`），
 *    所以 modal 内永远只有 33 项（历史/热门 + 港澳台 + 31 省）。查询范围必须放宽。
 *
 * 另外返回**当前列的省名**（`.step-text`）—— 调用方拿它和"刚点的那个省"对一下，
 * 这样"点了没切换"会立刻暴露，而不是安静地把上一个省的城市记到这一个省头上。
 */
export function cityColumnInPage(arg: { modalSelector: string }): {
  provinceName: string
  cities: Array<{ code: string; name: string }>
} {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  let modal: Element | null = null
  try {
    modal = document.querySelector(arg.modalSelector)
  } catch {
    modal = null
  }
  const scope: Element | Document = modal ?? document
  let provinceName = ''
  try {
    provinceName = clean(scope.querySelector('.data-container .step-text')?.textContent)
  } catch {
    provinceName = ''
  }
  const cities: Array<{ code: string; name: string }> = []
  try {
    for (const li of Array.from(scope.querySelectorAll('.data-list-ul li[id]'))) {
      const matched = /^code_(\d{6})$/.exec(li.getAttribute('id') ?? '')
      if (matched === null) continue
      const name = clean(li.textContent)
      if (name === '') continue
      cities.push({ code: matched[1] ?? '', name })
    }
  } catch {
    /* 选择器坏了也不许炸 */
  }
  return { provinceName, cities }
}

/**
 * 只定位**一个**省级项并返回它的当前坐标（自包含）。
 *
 * ⚠️ 为什么不能复用"一次列出全部省份"的那个函数：那个函数会对**每个**项调
 * `scrollIntoView` 再取它的 rect —— 于是先算的坐标在后续滚动之后**已经失效**，
 * 点下去会落到别的省份上。2026-09-19 实测就是这个：点北京却显示贵州、点上海显示云南……
 * （偏移恒定 ≈ 列表被滚下去的那么多行）。所以定位与点击之间**不能有任何其它滚动**：
 * 一次只定位一个目标、立刻点。
 */
export function cityProvinceSpotInPage(arg: { modalSelector: string; code: string }): {
  found: boolean
  x: number
  y: number
  name: string
} {
  const empty = { found: false, x: 0, y: 0, name: '' }
  let modal: Element | null = null
  try {
    modal = document.querySelector(arg.modalSelector)
  } catch {
    modal = null
  }
  let node: Element | null = null
  try {
    node = (modal ?? document).querySelector(`li[data-code="${arg.code}"]`)
  } catch {
    node = null
  }
  if (node === null) return empty
  try {
    node.scrollIntoView({ block: 'center', inline: 'nearest' })
  } catch {
    /* 没布局引擎也不该炸 */
  }
  const name = ((node.querySelector('.ant-menu-text') ?? node).textContent ?? '').replace(/\s+/g, ' ').trim()
  const rect = node.getBoundingClientRect()
  return {
    found: true,
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    name,
  }
}

/** 浮层/弹窗清单（自包含）：hover 之后新出现或刚显示出来的块。 */
export function overlaysInPage(arg: { selectors: string[] }): Array<{
  selector: string
  cls: string
  textHead: string
}> {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const out: Array<{ selector: string; cls: string; textHead: string }> = []
  for (const selector of arg.selectors) {
    let nodes: Element[] = []
    try {
      nodes = Array.from(document.querySelectorAll(selector))
    } catch {
      continue
    }
    for (const node of nodes) {
      const rect = (() => {
        try {
          return node.getBoundingClientRect()
        } catch {
          return null
        }
      })()
      if (rect === null || rect.width < 8 || rect.height < 8) continue
      out.push({
        selector,
        cls: node.getAttribute('class') ?? '',
        textHead: clean(node.textContent).slice(0, 160),
      })
      if (out.length >= 20) break
    }
    if (out.length >= 20) break
  }
  return out
}

/* ── 宿主侧 ─────────────────────────────────────────────────────────── */

/**
 * 危险入口按**语义**分组，各配一个显式开关，默认一律不点。
 *
 * 智联的教训：按**词面**只挡"提交/确认/发送"是不够的 —— 那边真正的提交按钮叫「立即投递」，
 * 结果探针真的投出去一份简历（`PLATFORM-ZHAOPIN.md` §8.4）。
 */
const RISKY_CLICK_TEXT: Record<'chat' | 'apply', readonly string[]> = {
  chat: ['沟通', '聊一聊', '聊天', '打招呼', '发消息', '联系'],
  apply: ['投递', '申请', '立即应聘'],
}
const FORBIDDEN_CLICK_TEXT = ['发送', '提交', '确认', '确定'] as const

async function main(): Promise<void> {
  const executable = discoverExecutable(candidateExecutables())
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executable === null ? {} : { executablePath: executable }),
  })
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })

  const snapshots: Array<{ index: number; kind: string; file: string; pageUrl: string; scan: unknown; overlays: unknown }> = []
  const network: Array<{
    at: string
    url: string
    method: string
    status: number
    postData: string | null
    /**
     * 请求头（**必须记**）。
     *
     * 2026-09-19 实测教训：会话列表接口用 `fetch` 在页面上下文里重放时，
     * **连"带真实 imId"的对照组都返回 `{"flag":0,"code":"-1400","msg":"出错了（400）！"}`**
     * ⇒ 光有 method + body 复现不了调用形态，还缺请求头（这类网关通常要 `x-*` 自定义头）。
     * 只记 url/status 时，一个失败的实验会被当成"接口不可用"的结论 —— 那是错的。
     */
    headers: Record<string, string>
    bodyHead: string | null
  }> = []
  const spentUrls = new Set<string>()
  const watched = new Set<Page>()
  const steps: Array<{ name: string; ok: boolean; note: string }> = []
  /**
   * **我们自己的 fetch 也会被采到** —— `page.on('response')` 不管是谁发的。
   *
   * 2026-09-19 实测踩过：分析"页面自己的请求头"时取到最后一条，拿到的是**探针变体 E** 的
   * 极简头（只有 content-type），差点得出"页面的搜索请求也不带 x-fscp 头"的反结论。
   * 现在把跑变体那段时间打上标记，报告里每条 `synthetic: true` 的就是我们自己发的，不是页面的。
   */
  const syntheticWindows: Array<{ from: number; to: number }> = []
  /**
   * 遍历城市弹窗采到的**完整城市码表**（省→市），最后写进报告 ——
   * 它是把 `DEFAULT_LIEPIN_CONFIG.cityCodes` 从「只有全国」填起来的数据来源，
   * 所以必须落到文件里（不能只打在终端里）。
   */
  let cityCodeTable: Array<{ code: string; name: string }> = []
  const isSynthetic = (at: string): boolean => {
    const t = new Date(at).getTime()
    return syntheticWindows.some((window_) => t >= window_.from && t <= window_.to)
  }
  const record = (name: string, ok: boolean, note: string): void => {
    steps.push({ name, ok, note })
    log(`${ok ? '✔' : '✘'} [${name}] ${note}`)
  }

  const attachNetwork = (page: Page): void => {
    page.on('response', (response: Response) => {
      try {
        const url = response.url()
        if (!/liepin\.com|api-c\.liepin|xiaomi|luban/i.test(url)) return
        if (!/\/api|json|search|chat|im\b|message|job/i.test(url)) return
        const request = response.request()
        // ⚠️ method + postData 必须记：只记 url/status/body 时，接口的调用形态无从复现
        //    （zhipin 的薪资接口就因为缺这两项卡住过一次，见 ADAPTERS §7.2）。
        let postData: string | null = null
        try {
          postData = request.postData() ?? null
        } catch {
          postData = null
        }
        const entry = {
          at: new Date().toISOString(),
          url,
          method: request.method(),
          status: response.status(),
          postData: postData === null ? null : postData.slice(0, 4_000),
          headers: {} as Record<string, string>,
          bodyHead: null as string | null,
        }
        void (async () => {
          // 记请求头：**fetch 的 header 名字会被规范化成小写**。丢掉几个不能/不该重放的：
          // cookie 交给 `credentials:'include'` 自己带，其余是 fetch 自己会拒绝设置的。
          try {
            const all = await request.allHeaders()
            const skip = new Set(['cookie', 'content-length', 'host', 'connection', 'accept-encoding'])
            entry.headers = Object.fromEntries(
              Object.entries(all).filter(([name]) => !skip.has(name.toLowerCase())),
            )
          } catch {
            /* 拿不到头也不许炸 */
          }
          try {
            entry.bodyHead = (await response.text()).slice(0, 4_000)
          } catch {
            /* 读不到 body 也不许炸 */
          }
          network.push(entry)
        })()
      } catch {
        /* 监听不许炸 */
      }
    })
  }

  const scan = async (page: Page) =>
    await page
      .evaluate(scanLiepinPageInPage, {
        // ⚠️ 逐个量**适配器自己的**选择器命中数 —— 探针的产出要能直接回答
        //    "线上选择器还有效吗"，而不是另起一套。
        probeSelectors: {
          card: CONFIG.selectors.card,
          jobLink: CONFIG.selectors.jobLink,
          companyInfoBox: CONFIG.selectors.companyInfoBox,
          titleNode: CONFIG.selectors.titleNode,
          pagination: CONFIG.selectors.pagination,
          nextPage: CONFIG.selectors.nextPage,
          detailTitle: CONFIG.selectors.detailTitle,
          detailSalary: CONFIG.selectors.detailSalary,
          detailProperties: CONFIG.selectors.detailProperties,
          detailCompany: CONFIG.selectors.detailCompany,
          detailIntroSection: CONFIG.selectors.detailIntroSection,
          // 这一条**不来自适配器**（适配器还没有 IM 选择器）：先在这里量命中数，
          // 实测坐实了再往 `LiepinSelectors` 里搬。
          imEntry: '#im-c-entry .im-ui-basic-entry-title',
        },
        cardSelector: CONFIG.selectors.card,
        salaryPattern: LIEPIN_SALARY_PATTERN,
        chatWords: ['沟通', '聊一聊', '聊天', '打招呼', '消息'],
        hrefPatterns: ['/im', 'chat', 'message', 'xiaoxi', 'letter', 'contact'],
        // 观察项：未登录时页面上会出现这些字样（**不作闸门** —— 猎聘适配器自己没有登录检测，
        // 我第一版现编了一套「用户头像/用户名」标记，结果登录着也被判成未登录）。
        loginWords: ['登录/注册', '立即登录', '登录后查看'],
      })
      .catch(() => null)

  const capture = async (page: Page, kind: string, force = false): Promise<void> => {
    const key = `${kind}|${page.url()}`
    if (!force && spentUrls.has(key)) return
    if (snapshots.length >= MAX_SNAPSHOTS) return
    spentUrls.add(key)
    watched.add(page)
    const pageScan = await scan(page)
    if (pageScan === null) return
    const overlays = await page
      .evaluate(overlaysInPage, {
        selectors: ['[class*="modal"]', '[class*="dialog"]', '[class*="popup"]', '[class*="popover"]', '[class*="drawer"]'],
      })
      .catch(() => [])
    const index = snapshots.length + 1
    const file = `liepin-walk-${String(index).padStart(2, '0')}-${kind}.html`
    snapshots.push({ index, kind, file, pageUrl: page.url(), scan: pageScan, overlays })
    const html = await page.content().catch(() => '')
    if (html !== '') {
      mkdirSync(CAPTURE_DIR, { recursive: true })
      writeFileSync(join(CAPTURE_DIR, file), html.slice(0, MAX_HTML_CHARS), 'utf8')
    }
    log(
      `📸 #${String(index)} [${kind}] 卡片 ${String(pageScan.selectorHits['card'] ?? 0)} · ` +
        `薪资含数字 ${String(pageScan.salaryPlain)} · 沟通候选 ${String(pageScan.chatCandidates.length)} · ` +
        `命中链接 ${String(pageScan.links.length)} · 适配器选择器命中 ` +
        `{${Object.entries(pageScan.selectorHits)
          .filter(([, n]) => n > 0)
          .map(([name, n]) => `${name}:${String(n)}`)
          .join(' ')}} · ${page.url().slice(0, 80)}`,
    )
    if (pageScan.loginWordsSeen.length > 0) {
      log(`     ⚠️ 登录线索：${pageScan.loginWordsSeen.join('、')}`)
    }
    if (pageScan.chatCandidates.length > 0) {
      for (const c of pageScan.chatCandidates.slice(0, 8)) {
        log(`     沟通候选：<${c.tag}>「${c.text}」.${c.cls.slice(0, 70)}`)
      }
    }
    for (const l of pageScan.links.slice(0, 8)) log(`     链接：「${l.text}」→ ${l.href.slice(0, 110)}`)
    for (const o of (overlays as Array<{ selector: string; cls: string; textHead: string }>).slice(0, 6)) {
      log(`     浮层：${o.selector} .${o.cls.slice(0, 60)} :: ${o.textHead.slice(0, 90)}`)
    }
  }

  /** 真鼠标点击（只定位 + CDP 点击）。命中危险词而开关没开 ⇒ **拒绝点击**。 */
  const clickByText = async (
    page: Page,
    words: string[],
    allow?: 'chat' | 'apply',
    excludeWords: string[] = [],
  ): Promise<{ ok: boolean; text: string; note: string }> => {
    const spot = await page
      .evaluate(findElementCenterInPage, { words, maxTextLength: 14, excludeWords })
      .catch(() => null)
    if (spot === null || !spot.found) {
      return { ok: false, text: '', note: `没找到文本含「${words.join(' / ')}」的可见可点元素` }
    }
    const forbidden = FORBIDDEN_CLICK_TEXT.find((word) => spot.text.includes(word))
    if (forbidden !== undefined) {
      return { ok: false, text: spot.text, note: `拒绝点击（文案含「${forbidden}」，属最终提交类）` }
    }
    for (const group of ['chat', 'apply'] as const) {
      const risky = RISKY_CLICK_TEXT[group].find((word) => spot.text.includes(word))
      if (risky === undefined) continue
      const opened = group === 'chat' ? ALLOW_CHAT : ALLOW_APPLY
      if (allow === group && opened) break
      return {
        ok: false,
        text: spot.text,
        note:
          `拒绝点击（文案含「${risky}」，属${group === 'chat' ? '沟通' : '投递'}类对外动作；` +
          `需 LIEPIN_ALLOW_${group.toUpperCase()}=1 才放行）：「${spot.text}」`,
      }
    }
    await page.mouse.move(spot.x, spot.y, { steps: 8 })
    await page.waitForTimeout(150)
    await page.mouse.click(spot.x, spot.y)
    return {
      ok: true,
      text: spot.text,
      note: `真鼠标点击 <${spot.tag}>「${spot.text}」@(${String(spot.x)},${String(spot.y)})`,
    }
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage())
    attachNetwork(page)
    context.on('page', (fresh: Page) => {
      attachNetwork(fresh)
      log(`👀 新页面：${fresh.url().slice(0, 90) || '(空白)'}`)
    })

    log('── 猎聘登录态走查取证 ──')
    log(`profile：${PROFILE}（与 probe:liepin 共用）`)
    log(`产物：${CAPTURE_DIR}`)
    log('⚠️ 全程只读；沟通/投递入口按语义护栏默认**不点**。')

    /* ── 1. 搜索页：等**渲染**（不猜登录标记）───────────────────────── */
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    // ⚠️ 这里**不拿"登录标记"当闸门**：猎聘适配器自己就没有登录检测（详情页未登录也能读），
    //    而"登录没登录"在交互式探针里由**你的眼睛**最权威。所以只等"卡片渲染出来"，
    //    再把观察到的登录线索打出来。
    //    第一版拿现编的「头像/用户名」标记当闸门 ⇒ 登录着也被判未登录，白白等到超时。
    let rendered = false
    let observed: Awaited<ReturnType<typeof scan>> = null
    const renderDeadline = Date.now() + RENDER_WAIT_MS
    let lastHint = 0
    while (Date.now() < renderDeadline) {
      observed = await scan(page)
      if ((observed?.selectorHits['card'] ?? 0) > 0) {
        rendered = true
        break
      }
      if (Date.now() - lastHint > 15_000) {
        lastHint = Date.now()
        log(`⏳ 还没渲染出卡片（URL ${page.url().slice(0, 80)}）—— 窗口里若要登录就登录；已登录会自动继续`)
      }
      await page.waitForTimeout(POLL_MS)
    }
    record(
      '搜索页渲染',
      rendered,
      rendered
        ? `卡片 ${String(observed?.selectorHits['card'] ?? 0)} 张（选择器 ${CONFIG.selectors.card}）`
        : `等了 ${String(RENDER_WAIT_MS / 1000)} 秒仍没有卡片 —— 可能是未登录/被风控/选择器已烂`,
    )
    const loginHints = observed?.loginWordsSeen ?? []
    record(
      '登录线索（观察项，非闸门）',
      loginHints.length === 0,
      loginHints.length === 0
        ? '页面上没有「登录/注册」之类字样 ⇒ 大概率是登录态'
        : `页面上出现：${loginHints.join('、')} ⇒ 可能是未登录（也可能是页脚文案，请自行核对）`,
    )
    await capture(page, 'search', true)

    /* ── 适配器那条"接口通道"到底活着吗 ─────────────────────────────── */
    // `readListPage` 是双通道且**失败静默回退 DOM** ⇒ 接口这条要是调不通，
    // 生产环境里它是死代码，却一点声音都没有（丢的是 publishedAt/industry/companySize）。
    const searchCall = network
      .filter((entry) => entry.url.includes('pc-search-job') && !entry.url.includes('cond-init'))
      .at(-1)
    if (searchCall === undefined) {
      record('搜索接口变体', false, '没采到页面自己的 pc-search-job 请求 —— 没有对照组就不能下结论')
    } else {
      const windowFrom = Date.now()
      // ── 生产路径：**直接跑适配器自己的页面函数与常量** ──────────────────
      // 这才是"接口通道到底活着吗"的真答案 —— 变体实验只能告诉我们"头重要"，
      // 只有跑 `fetchListInPage` 才能证明**修复真的生效**、以及接口独有的字段确实回来了。
      const payload = await page
        .evaluate(fetchListInPage, {
          apiPath: `${CONFIG.searchApiOrigin}${CONFIG.searchApiPath}`,
          body: buildSearchRequestBody({ keyword: KEYWORD, page: 1 }, '410'),
          headers: LIEPIN_API_HEADERS,
        })
        .catch(() => null)
      const jobs = parseSearchApiResponse(payload)
      const withPublished = jobs.filter((job) => job.publishedAt != null).length
      const withIndustry = jobs.filter((job) => job.industry != null).length
      record(
        '生产路径（适配器 fetchListInPage + LIEPIN_API_HEADERS）',
        jobs.length > 0,
        jobs.length === 0
          ? `解析出 0 条 ⇒ 接口通道**仍然是死的**（DOM 会兜底，所以线上看不出来）`
          : `RawJob ${String(jobs.length)} 条 · publishedAt 有值 ${String(withPublished)} 条 · ` +
            `industry 有值 ${String(withIndustry)} 条（这两个字段 DOM 通道拿不到）· ` +
            `首条：${jobs[0]?.title ?? ''} / ${jobs[0]?.company ?? ''} / ${jobs[0]?.publishedAt ?? ''}`,
      )

      const variants = await page
        .evaluate(probeSearchHeadersInPage, {
          api: searchCall.url.split('?')[0] ?? '',
          pageBody: searchCall.postData ?? '',
          headers: searchCall.headers,
        })
        .catch(() => null)
      await page.waitForTimeout(800)
      syntheticWindows.push({ from: windowFrom, to: Date.now() })
      if (variants === null) {
        record('搜索接口变体', false, '页面上下文里调不通（evaluate 失败）')
      } else {
        for (const item of variants) {
          record(`搜索接口 ${item.name}`, item.cards > 0, `${item.note} · jobCardList=${String(item.cards)}`)
          if (item.chattedTrue >= 0) {
            record(
              `  chatted 分布（${item.name}）`,
              item.chattedTrue > 0,
              `42 张卡里 recruiter.chatted=true 的有 ${String(item.chattedTrue)} 条` +
                (item.chattedSamples.length === 0
                  ? '（**没有正向样本** ⇒ 这个字段的含义本轮仍没证实）'
                  : `：${item.chattedSamples.join(' | ')}`),
            )
          }
        }
      }
    }

    /* ── 城市码表：筛选区的 `dq` 行 + 点开「其他」拿完整城市树 ────────── */
    // 只读：点开一个下拉不产生任何对外动作（不是「聊一聊」那类）。
    const CITY_PICKER = '#filter-option-other-city'
    const dump = async () =>
      await page
        .evaluate(dumpCodeOptionsInPage, { pickerSelector: CITY_PICKER, maxText: 400, maxHtml: 1500 })
        .catch(() => null)
    const line = (items: Array<{ code: string; name: string }>): string =>
      items.map((item) => `${item.name}/${item.code}`).join(' ')

    const opened = await dump()
    const dqOpened = (opened?.items ?? []).filter((item) => item.key === 'dq')
    if (opened === null) {
      record('城市码表（未展开）', false, '页面上下文里扒不到码表（evaluate 失败）')
    } else {
      record(
        '城市码表（未展开，筛选区自带）',
        dqOpened.length > 0,
        `data-key=dq 有 ${String(dqOpened.length)} 项：${line(dqOpened)}`,
      )
      const counts = new Map<string, number>()
      for (const item of opened.items) counts.set(item.key, (counts.get(item.key) ?? 0) + 1)
      record(
        '  筛选区全部码表',
        counts.size > 0,
        [...counts].map(([key, n]) => `${key}:${String(n)}`).join(' · ') || '(一个都没有)',
      )
    }

    const citySpot = await page
      .evaluate(centerOfSelectorInPage, { selector: CITY_PICKER, maxTextLength: 12 })
      .catch(() => null)
    if (citySpot === null || !citySpot.found) {
      record('点开城市选择器', false, `没找到可见的 ${CITY_PICKER}（DOM 变了？看快照 HTML）`)
    } else {
      // AntD 的 popover 有 hover / click 两种触发。**两种都试**，并且分开记录结果 ——
      // 2026-09-19 实测：只 click 时 `.antd-lp-city` 是**空的**（dq 项 14→14），
      // 很可能就是"hover 打开、click 反而关掉"。
      const reportOverlays = (tag: string, result: Awaited<ReturnType<typeof dump>>): void => {
        if (result === null) {
          record(`  ${tag} 后`, false, 'evaluate 失败')
          return
        }
        const dq = result.items.filter((item) => item.key === 'dq')
        record(
          `  ${tag} 后`,
          dq.length > dqOpened.length || result.overlays.length > 0,
          `dq=${String(dq.length)}（基线 ${String(dqOpened.length)}）· picker 文案「${result.pickerText.slice(0, 60)}」· ` +
            `浮层 ${String(result.overlays.length)} 个` +
            (result.overlays.length === 0
              ? ''
              : `：${result.overlays.map((o) => `.${o.cls.split(' ')[0]}「${o.textHead.slice(0, 40)}」`).join(' | ')}`),
        )
        for (const overlay of result.overlays.slice(0, 2)) {
          record(`    ${tag} 浮层结构`, true, overlay.htmlHead.slice(0, 400))
        }
      }

      await page.mouse.move(citySpot.x, citySpot.y, { steps: 10 })
      await page.waitForTimeout(2_500)
      reportOverlays('hover', await dump())
      await capture(page, 'city-picker-hover', true)

      await page.mouse.click(citySpot.x, citySpot.y)
      await page.waitForTimeout(2_500)
      const afterClick = await dump()
      reportOverlays('click', afterClick)
      await capture(page, 'city-picker-click', true)

      // 把"完整城市树"和基线做差：新出现的 dq 项才是我们还没拿到的码
      const dqAfter = (afterClick?.items ?? []).filter((item) => item.key === 'dq')
      const added = dqAfter.filter((item) => !dqOpened.some((known) => known.code === item.code))
      record(
        '城市树新增码',
        added.length > 0,
        added.length === 0
          ? '`[data-code][data-name]` 那套属性里没有新增（城市弹窗用的是 ant-menu 另一套结构，见下）'
          : `${String(added.length)} 个：${added.map((item) => `${item.name}/${item.code}`).join(' ')}`,
      )

      // ── 遍历省份，把**完整城市码表**采下来 ──────────────────────────
      // 实测：点开「其他」= 开一个 `.ant-modal.city-modal`「请选择城市」，
      // 左列是省级（3 位码）、点一个省右列出市级（6 位码，前 3 位=省码）。
      // 所以要把 34 个省逐个点一遍才拿得到全表 —— 每次点击都**重新定位**，
      // 因为点开一个省会让弹窗重排（缓存的坐标会失效）。
      const CITY_MODAL = '.ant-modal.city-modal'
      const PROVINCE_PATTERN = '^\\d{3}$'
      const provinces = await page
        .evaluate(cityModalItemsInPage, { modalSelector: CITY_MODAL, codePattern: PROVINCE_PATTERN, scroll: false })
        .catch(() => [])
      if (provinces.length === 0) {
        record('城市弹窗（省级列表）', false, `没读到 ${CITY_MODAL} 里的省级项（弹窗没开？结构变了？）`)
      } else {
        record(
          '城市弹窗（省级列表）',
          true,
          `${String(provinces.length)} 个：${provinces.map((p) => `${p.name}/${p.code}`).join(' ')}`,
        )
        const cityTable: Array<{ code: string; name: string }> = []
        let emptyProvinces = 0
        let capturedProvince = false
        for (const province of provinces) {
          // 一次只定位这一个省、**立刻点**（中间不能有其它滚动，见 cityProvinceSpotInPage 的说明）
          const spot = await page
            .evaluate(cityProvinceSpotInPage, { modalSelector: CITY_MODAL, code: province.code })
            .catch(() => null)
          if (spot === null || !spot.found) {
            record(`  省 ${province.name}(${province.code})`, false, '定位失败')
            continue
          }
          const target = spot
          await page.mouse.move(target.x, target.y, { steps: 4 })
          await page.mouse.click(target.x, target.y)
          await page.waitForTimeout(700)
          const column = await page.evaluate(cityColumnInPage, { modalSelector: CITY_MODAL }).catch(() => null)
          const cities = column?.cities ?? []
          // **校验"点的省"和"显示的省"是否是同一个** —— 不校验的话，一旦点击不生效，
          // 就会把上一个省的城市安静地记到这个省头上（这份表是要写进配置的）。
          if (column !== null && column.provinceName !== '' && column.provinceName !== province.name) {
            record(
              `  ⚠️ 省名不符 ${province.name}(${province.code})`,
              false,
              `点了「${province.name}」，但列头显示「${column.provinceName}」⇒ 这一列的城市**不能**记在它头上`,
            )
            continue
          }
          if (cities.length === 0) emptyProvinces += 1
          if (!capturedProvince) {
            capturedProvince = true
            await capture(page, `city-province-${province.code}`, true)
          }
          for (const city of cities) {
            if (!cityTable.some((known) => known.code === city.code)) cityTable.push({ code: city.code, name: city.name })
          }
          record(`  省 ${province.name}(${province.code})`, cities.length > 0, `${String(cities.length)} 个市`)
        }
        cityCodeTable = cityTable
        record(
          '城市全表',
          cityTable.length > 14,
          `共 ${String(cityTable.length)} 个市级码（基线只有热门 14 个，空省级 ${String(emptyProvinces)} 个）；` +
            `前 24 个：${cityTable.slice(0, 24).map((c) => `${c.name}/${c.code}`).join(' ')}`,
        )
        // 关掉弹窗，别影响后面的走查步骤
        await page.keyboard.press('Escape').catch(() => undefined)
        await page.waitForTimeout(500)
      }
    }

    if (AUTO_WALK) {
      /* ── 2. 详情页：hover 沟通入口（只移鼠标，不点）────────────────── */
      // 用**适配器自己的**岗位 id 正则找详情链接（`LIEPIN_JOB_ID_PATTERN`），
      // 不另编一套 —— 与上面选择器的教训同源。
      const jobLinkSelector = CONFIG.selectors.jobLink
      const jobIdPattern = LIEPIN_JOB_ID_PATTERN
      const firstJobHref = await page
        .evaluate(
          (arg: { selector: string; pattern: string }) => {
            let regex: RegExp | null = null
            try {
              regex = new RegExp(arg.pattern)
            } catch {
              regex = null
            }
            for (const a of Array.from(document.querySelectorAll(arg.selector))) {
              const href = a.getAttribute('href') ?? ''
              if (href.startsWith('javascript') || href === '#') continue
              if (regex !== null && !regex.test(href)) continue
              return href.startsWith('http')
                ? href
                : `https://www.liepin.com${href.startsWith('/') ? href : `/${href}`}`
            }
            return ''
          },
          { selector: jobLinkSelector, pattern: jobIdPattern },
        )
        .catch(() => '')
      if (firstJobHref === '') {
        record('详情页', false, '列表里没找到 /job/<id> 链接，跳过详情走查')
      } else {
        await page.goto(firstJobHref, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
        await page.waitForTimeout(8_000)
        await capture(page, 'detail-before-hover', true)

        // hover 不产生任何对外动作，是**安全**的取证方式（平台事实说"聊天按钮需 hover"）
        // ⚠️ 必须排除「我的沟通」：那是页头侧边栏的收件箱入口（`#im-c-entry`），
        //    不是这个岗位的沟通按钮。第一次实测就 hover 到了它。
        const spot = await page
          .evaluate(findElementCenterInPage, {
            words: ['聊一聊', '沟通'],
            maxTextLength: 14,
            excludeWords: ['我的沟通', '我的投递'],
          })
          .catch(() => null)
        if (spot === null || !spot.found) {
          record('hover 沟通入口', false, '详情页上没有含「沟通/聊一聊」的可见元素（可能要先登录，或入口在别处）')
        } else {
          await page.mouse.move(spot.x, spot.y, { steps: 12 })
          await page.waitForTimeout(2_500)
          record('hover 沟通入口', true, `已把鼠标移到 <${spot.tag}>「${spot.text}」.${spot.cls.slice(0, 60)} 上`)
          await capture(page, 'detail-after-hover', true)
          if (ALLOW_CHAT) {
            // ⚠️ 排除侧边栏的「我的沟通」：它含「沟通」二字，不排除就会点到收件箱抽屉上
            //    （那不是"给这个岗位打招呼"，白点一次还采不到打招呼契约）。
            const clicked = await clickByText(page, ['聊一聊', '沟通'], 'chat', ['我的沟通', '我的投递'])
            record('点沟通入口（已授权）', clicked.ok, clicked.note)
            await page.waitForTimeout(7_000)
            await capture(page, 'chat-after-click', true)
            // ⚠️ **点到了 ≠ 发出去了**：必须回读 `im.c.chat.open-chat` 的**业务返回码**。
            //    实测（2026-09-19）：这一次点击被平台拒绝 ——
            //      `{"flag":0,"code":"30011","msg":"简历完整度不足"}`
            //    同时页面弹出 `.complete-resume-modal`。HTTP 是 200，所以**只看状态码会误判成成功**。
            //    探针绝不能把"点到了按钮"记成"已送达"（智联误投那次教训的反面）。
            //    另：点击后按钮文案会立刻从「聊一聊」翻成「继续聊」，**即使被拒也翻**，
            //    刷新后回到「聊一聊」⇒ 文案是乐观假象，**不能当阶段判据**。
            const openChat = network.filter((entry) => entry.url.includes('chat.open-chat')).at(-1)
            if (openChat === undefined) {
              record('打招呼结果', false, '点击后没有出现 im.c.chat.open-chat 请求 —— 可能只开了个弹层，没真发起沟通')
            } else {
              let verdict = (openChat.bodyHead ?? '').slice(0, 200)
              try {
                const parsed = JSON.parse(openChat.bodyHead ?? '{}') as {
                  flag?: unknown
                  code?: unknown
                  msg?: unknown
                }
                verdict =
                  parsed.flag === 1
                    ? '平台已受理（flag=1）—— 会话应已建立'
                    : `平台**拒绝**了这次沟通（flag=${String(parsed.flag)} code=${String(parsed.code)} ` +
                      `msg=${String(parsed.msg)}）—— 一个字都没发出去`
              } catch {
                /* 解析不了就把原文打出来 */
              }
              record('打招呼结果', true, `POST im.c.chat.open-chat → ${verdict}`)
            }
          } else {
            record('点沟通入口', false, '默认不点（需 LIEPIN_ALLOW_CHAT=1）—— 先看 hover 前后的差异')
          }
        }
        // 投递入口只取证
        // ⚠️ 同样要排除侧边栏的「我的投递」（`sider-bar-item-box`）—— 第一次实测取到的就是它，
        //    那是"我的投递"列表入口，跟当前岗位的投递按钮不是一回事。
        const applySpot = await page
          .evaluate(findElementCenterInPage, {
            words: ['投递', '投简历', '申请'],
            maxTextLength: 12,
            excludeWords: ['我的投递'],
          })
          .catch(() => null)
        record(
          '投递入口取证（不点）',
          applySpot !== null && applySpot.found,
          applySpot === null || !applySpot.found
            ? '详情页上没有含「投递/申请」的可见按钮'
            : `入口是 <${applySpot.tag}>「${applySpot.text}」.${applySpot.cls.slice(0, 60)}，默认不点` +
              '（需 LIEPIN_ALLOW_APPLY=1；猎聘的投递是否有二级确认**未实测**）',
        )
      }

      /* ── 3. 我的沟通：点侧边栏入口（只读导航，白名单放行）──────────── */
      // 实测事实（第一版在这里全错）：这个入口**不是 `<a>`**（按 href 找命中 0 条），
      // 文案也不叫「消息」而叫「我的沟通」，DOM 是
      //   `<div id="im-c-entry">` → `.im-ui-basic-entry`（气泡图标）+ `.im-ui-basic-entry-title`
      // ⇒ 只能按**选择器**定位 + 真鼠标点击。
      //
      // ⚠️ 为什么这个点击**不需要配开关**：它只打开我自己的消息列表（只读），
      //    不产生任何对外动作 —— 与「聊一聊」（会给 HR 发消息）是两件事。
      //    所以这里的护栏形状是**白名单选择器**，而不是上面那套按文案的黑名单。
      const IM_ENTRY_SELECTOR = '#im-c-entry .im-ui-basic-entry, #im-c-entry .im-ui-basic-entry-title'
      // ⚠️ 刚打过招呼（`LIEPIN_ALLOW_CHAT=1`）时**必须回搜索页重来一次**：
      //    目的是让 IM 微前端重新初始化，从而一定再发一遍
      //    `im.c.contact.get-contact-list` —— 这次拿到的 `totalCount` / `list`
      //    才是"打过招呼之后"的状态，**会话行的字段形状就在这一份里**。
      //    不刷新的话抽屉可能走缓存，采到的是打招呼之前的空列表。
      if (ALLOW_CHAT) {
        await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
        await page.waitForTimeout(6_000)
      }
      const imEntry = await page
        .evaluate(centerOfSelectorInPage, { selector: IM_ENTRY_SELECTOR, maxTextLength: 12 })
        .catch(() => null)
      if (imEntry === null || !imEntry.found) {
        record('打开「我的沟通」', false, `没找到可见的 ${IM_ENTRY_SELECTOR}（入口可能在别的 DOM 里，看截图/HTML）`)
      } else {
        const beforeUrl = page.url()
        await page.mouse.move(imEntry.x, imEntry.y, { steps: 8 })
        await page.waitForTimeout(200)
        await page.mouse.click(imEntry.x, imEntry.y)
        await page.waitForTimeout(8_000)
        record(
          '打开「我的沟通」',
          true,
          `真鼠标点击 <${imEntry.tag}>「${imEntry.text}」.${imEntry.cls.slice(0, 50)}；` +
            (page.url() === beforeUrl ? '没有换页（大概率是弹层）' : `已跳到 ${page.url().slice(0, 100)}`),
        )
        await capture(page, 'im-entry', true)
        // 把**最新一次** `get-contact-list` 原文打出来：这是判断"打招呼有没有造出会话"、
        // 以及拿会话行字段形状的唯一依据（见 ADAPTERS §7.2 猎聘条）。
        const contactCalls = network.filter((entry) => entry.url.includes('get-contact-list'))
        const latest = contactCalls[contactCalls.length - 1]
        if (latest === undefined) {
          record('会话列表接口', false, '这次点击没有触发 get-contact-list（抽屉可能走了前端缓存）')
        } else {
          record(
            '会话列表接口',
            true,
            `POST ${latest.url.split('?')[0]} · 请求体 ${latest.postData ?? '(空)'} · 响应 ${(latest.bodyHead ?? '').slice(0, 400)}`,
          )

          /* ── 4. imId 来源：空着能不能调（决定收件箱能否接口化）──────── */
          const realImId = /(?:^|&)imId=([^&]*)/.exec(latest.postData ?? '')?.[1] ?? ''
          const apiUrl = latest.url.split('?')[0] ?? ''
          const windowFrom = Date.now()
          const variants = await page
            .evaluate(probeContactListInPage, {
              api: apiUrl,
              pageSize: 30,
              realImId,
              headers: latest.headers,
            })
            .catch(() => null)
          await page.waitForTimeout(800)
          syntheticWindows.push({ from: windowFrom, to: Date.now() })
          if (variants === null) {
            record('imId 来源变体', false, '页面上下文里调不通（evaluate 失败）')
          } else {
            record(
              'imId 来源变体',
              true,
              `页面 JS 可见的 imId cookie：${variants.cookieImIdNames.length === 0 ? '没有（httpOnly，读不到）' : variants.cookieImIdNames.join('、')}`,
            )
            record(
              '  重放的请求头',
              Object.keys(latest.headers).length > 0,
              Object.keys(latest.headers).join('、') || '(一个都没记到)',
            )
            for (const item of variants.variants) {
              record(
                `  ${item.name}`,
                item.ok && item.rows >= 0,
                `${item.note} · list.length=${String(item.rows)} · ${item.raw.slice(0, 220)}`,
              )
            }
          }
        }
      }
    } else {
      log('手动模式：请在窗口里自己走（详情页 hover 沟通入口 / 打开消息页），看完关掉窗口。')
      let closed = false
      context.on('close', () => {
        closed = true
      })
      while (!closed) {
        for (const open of context.pages().filter((item) => !item.isClosed())) {
          attachNetwork(open)
          await capture(open, 'manual')
        }
        await page.waitForTimeout(4_000).catch(() => undefined)
      }
    }

    /* ── 4. 落盘 ─────────────────────────────────────────────────── */
    mkdirSync(CAPTURE_DIR, { recursive: true })
    writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          profile: PROFILE,
          keyword: KEYWORD,
          // ⚠️ 这里**故意不下"登录/未登录"的结论**：猎聘适配器自己没有登录检测，
          //    探针也不该现编一套判定（第一版就是那样 —— 明明登录着也被判成未登录）。
          //    只如实报"闸门是什么 + 观察到了哪些登录字样"，登录与否以你在窗口里看到的为准。
          login: {
            gate: 'render',
            rendered,
            renderWaitMs: RENDER_WAIT_MS,
            loginWordsSeen: loginHints,
            note: '探针不以登录标记为闸门，只等卡片渲染；未登录与否请人工核对',
          },
          autoWalk: { enabled: AUTO_WALK, allowChat: ALLOW_CHAT, allowApply: ALLOW_APPLY, steps },
          snapshots,
          // `synthetic: true` = 这条是**探针自己的变体 fetch**，不是页面发的。
          // 分析"页面自己的请求头/体"时必须先把它排除掉（踩过：差点把变体 E 的极简头当成页面的）。
          network: network.map((entry) => ({ ...entry, synthetic: isSynthetic(entry.at) })),
          /** 城市弹窗遍历出来的完整城市码表（市级，6 位码）—— 填 `cityCodes` 的数据来源。 */
          cityCodeTable,
          notes: [
            'scan.chatCandidates 是页面上含「沟通/聊一聊/消息」的可见元素（找入口的依据）。',
            'network[] 记了 method + postData —— 接口化实现的前提（只有 url/body 时调用形态无从复现）。',
            'hover 前后各一份快照：平台事实说"聊天按钮需 hover"，比对这两份就知道浮层里有什么。',
            '投递/沟通入口默认没点；要证据得显式开 LIEPIN_ALLOW_CHAT / LIEPIN_ALLOW_APPLY。',
          ],
        },
        null,
        2,
      ),
      'utf8',
    )
    log(`报告已保存：${REPORT_PATH}`)
    log(`快照 ${String(snapshots.length)} 份 · 接口采样 ${String(network.length)} 条`)
    for (const step of steps) log(`  ${step.ok ? '✔' : '✘'} ${step.name} —— ${step.note}`)
  } finally {
    await context.close().catch(() => undefined)
  }
}

await main()
