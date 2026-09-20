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
 *    采会话列表 DOM 与 `im.c.chat.*` 接口；**再点开第一行会话**（同样是只读：打开一条
 *    已存在的会话，不发任何消息）→ 采**会话面板的输入面**（`textarea` + placeholder
 *    「按Enter键发送」）。输入面只在"打开会话之后"才渲染，不点进去这一格永远没有证据；
 * ④ 全程采 `api-c.liepin.com` 等接口，**记 method + postData**（`.probe-liepin-capture/`）。
 *
 * ⚠️ **默认不点任何会产生对外动作的按钮**（沟通 / 打招呼 / 投递 / 发送）。
 *    要点头得显式开：`LIEPIN_ALLOW_CHAT=1`（沟通类）、`LIEPIN_ALLOW_APPLY=1`（投递类）。
 *    这条护栏是被智联那次"误投一份简历"逼出来的 —— 详见 `PLATFORM-ZHAOPIN.md` §8.4。
 *    「打开我的沟通」与「点开会话行」**不在**这条护栏内：它们只读自己的会话，
 *    与「聊一聊」（会触发 `open-chat`、给对方建会话）是两件事。
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
 *     / `imSurface`（IM 抽屉与会话面板的选择器命中数 + 输入面 + 消息条目类名）
 *     / `contactRows[]`（会话行摘要：未读 / `direction` / `extType` / 最后一条 `msg` / `jobId`）
 *
 * ⚠️ **IM 类接口的响应体不按 4000 字符截断**（`IM_BODY_CAP`）：一条会话行的 `lastPayload`
 *    就可能上千字符，截断会把后面几行挤掉 —— 而"方向怎么判"全在**行**里。
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
 *   LIEPIN_ALLOW_SEND  `1` = 发送实验：在抽屉第一行会话里真键盘打一句测试话术并回车
 *                       （**会真的发出一条消息**，默认禁止；文案 LIEPIN_SEND_TEXT 可改）
 *   LIEPIN_AUTO_WALK   `0` = 只录制、由你手动走
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { humanPress, humanType } from '../../src/host/platform/humanize.js'
// ⚠️ **直接用适配器自己那套**（42/42 校准过的）选择器与 URL 构造器。
// 第一版探针在这里栽过：卡片选择器与"登录标记"都是我现编的，结果**登录着也判成未登录、
// 卡片数恒为 0** —— 白白等了一轮登录超时。探针的价值恰恰是"用适配器的眼睛看页面"，
// 现编一套等于同时维护两份真相，还会让人误以为线上选择器坏了。
import {
  DEFAULT_LIEPIN_CONFIG,
  LIEPIN_API_HEADERS,
  LIEPIN_JOB_ID_PATTERN,
  LIEPIN_SALARY_PATTERN,
  type LiepinConfig,
} from '../../src/host/platform/adapters/liepin/config.js'
import {
  buildLiepinSearchUrl,
  buildSearchRequestBody,
} from '../../src/host/platform/adapters/liepin/urls.js'
import {
  fetchListInPage,
  parseSearchApiResponse,
} from '../../src/host/platform/adapters/liepin/api.js'

const KEYWORD = process.env['LIEPIN_KEY'] ?? 'Java'
const PROFILE = process.env['LIEPIN_PROFILE'] ?? join(process.cwd(), '.probe-liepin-profile')
const CAPTURE_DIR = process.env['LIEPIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-liepin-capture')
const REPORT_PATH = join(CAPTURE_DIR, 'liepin-chat-report.json')
const AUTO_WALK = process.env['LIEPIN_AUTO_WALK'] !== '0'
const ALLOW_CHAT = process.env['LIEPIN_ALLOW_CHAT'] === '1'
const ALLOW_APPLY = process.env['LIEPIN_ALLOW_APPLY'] === '1'
/**
 * 发送实验（默认禁止）：在抽屉第一行会话里用真键盘打一句测试话术并回车。
 *
 * 这是 `sayHello`/`reply` 落地前**唯一没真跑过的一步**（打字 + 回车 + 送达回读）。
 * ⚠️ **会真的给会话对面的真人发出一条消息**（默认「测试，请忽略。」，LIEPIN_SEND_TEXT 可改）。
 */
const ALLOW_SEND = process.env['LIEPIN_ALLOW_SEND'] === '1'
/**
 * IM 类接口的响应体留多长。
 *
 * 页面级默认 4000 字符，对会话列表太短：一条会话行的 `lastPayload` 就可能上千字符，
 * 两三行就把后面几行挤掉 —— 而"会话行有哪些字段、方向怎么判"全在**行**里，
 * 截断等于把证据采废（2026-09-19 那次 2 行约 2600 字符，属于侥幸没截断）。
 */
const IM_BODY_CAP = 40_000

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
  /**
   * **适配器自己那套静态头**（`LIEPIN_API_HEADERS`）—— 用来验证"适配器能不能自建请求调这个接口"。
   *
   * 为什么这一维必须单独验：搜索接口的门是 `x-fscp-*` 一族的**完整性**（少一项就 `-1400`，
   * 见那份实测表），但 IM 接口是**另一个后端应用段**，门槛没理由假设相同。
   * 不验就只能把页面那 20 个头（含 `user-agent` / `sec-ch-ua` 这类随环境变的）整份抄进配置 ——
   * 那既不可维护，也会把"环境指纹"写死。
   */
  adapterHeaders: Record<string, string>
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

  /** 请求体里 imId 的三种写法：空串 / 整个参数不要 / 带真实值（对照）。 */
  const bodyOf = (imId: string | null): string =>
    imId === null
      ? `imUserType=0&imApp=1&pageSize=${String(arg.pageSize)}&curPage=0`
      : `imUserType=0&imId=${imId}&imApp=1&pageSize=${String(arg.pageSize)}&curPage=0`

  // ⚠️ 这个接口的体是**表单**（`imUserType=0&...`），所以 content-type 必须是 urlencoded ——
  //    而 `LIEPIN_API_HEADERS` 里那份是给**JSON 体**的搜索接口准备的（application/json），
  //    照抄会送出"JSON 头 + 表单体"的错配组合。这一格也是本次要验的东西之一。
  const formHeaders = (base: Record<string, string>): Record<string, string> => ({
    ...base,
    'content-type': 'application/x-www-form-urlencoded',
  })

  const variants: Array<{ name: string; body: string; headers: Record<string, string> }> = [
    { name: '空 imId（页面头，对照组）', body: bodyOf(''), headers: formHeaders(arg.headers) },
    { name: '不带 imId 参数（页面头）', body: bodyOf(null), headers: formHeaders(arg.headers) },
  ]
  if (arg.realImId !== '') {
    variants.push({
      name: '对照组：带真实 imId（页面头）',
      body: bodyOf(arg.realImId),
      headers: formHeaders(arg.headers),
    })
  }
  if (Object.keys(arg.adapterHeaders).length > 0) {
    // 与 `fetchListInPage` 同构：三项遥测在页面里现造（UUID / 当前页 URL / 空串）
    const uuid = ((): string => {
      const cryptoImpl = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID()
      const hex = (length: number): string => {
        let out = ''
        while (out.length < length) out += Math.floor(Math.random() * 16).toString(16)
        return out.slice(0, length)
      }
      return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
    })()
    const adapted = formHeaders({
      ...arg.adapterHeaders,
      'x-fscp-trace-id': uuid,
      'x-fscp-bi-stat': JSON.stringify({
        location: (globalThis as { location?: { href?: string } }).location?.href ?? '',
      }),
      'x-fscp-fe-version': '',
    })
    variants.push({ name: '空 imId（适配器头：六项静态 + 现造遥测）', body: bodyOf(''), headers: adapted })
    // 反向对照：**只给静态头**。若它失败而上面那条成功，说明门同样在 `x-fscp-*` 一族；
    // 若它成功，说明这个接口连遥测都不需要（实现可以更简单）。
    variants.push({ name: '空 imId（适配器头：仅六项静态）', body: bodyOf(''), headers: formHeaders(arg.adapterHeaders) })
  }

  const results: Array<{ name: string; ok: boolean; note: string; rows: number; raw: string }> = []
  for (const variant of variants) {
    try {
      const response = await globalThis.fetch(arg.api, {
        method: 'POST',
        headers: variant.headers,
        body: variant.body,
        credentials: 'include',
      })
      const text = await response.text()
      let rows = -1
      let flag = '?'
      try {
        const parsed = JSON.parse(text) as { flag?: unknown; data?: { list?: unknown[] } }
        flag = String(parsed.flag)
        rows = Array.isArray(parsed.data?.list) ? parsed.data.list.length : -1
      } catch {
        /* 不是 JSON 就把原文留着 */
      }
      results.push({
        name: variant.name,
        ok: response.ok,
        note: `HTTP ${String(response.status)} · flag=${flag}`,
        rows,
        raw: text.slice(0, 300),
      })
    } catch (error) {
      results.push({
        name: variant.name,
        ok: false,
        note: error instanceof Error ? error.message : String(error),
        rows: -1,
        raw: '',
      })
    }
  }
  return { cookieHasImId: cookieImIdNames.length > 0, cookieImIdNames, variants: results }
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

/**
 * **在页面上下文里**量 IM 侧的选择器命中数（抽屉里的会话列表 + 会话面板里的输入面）。
 *
 * 为什么单独一个函数：`scanLiepinPageInPage` 量的是**搜索/详情**那套适配器选择器，
 * 而 IM 是**另一个前端应用**（`feim.liepin.com/lp-manifest.json` → `lp_fe_im_pc` 微前端），
 * 它自带一套类名体系（`im-ui-*` / `ant-im-*`）—— 只能用**候选表**先量命中数，
 * 坐实了再往 `LiepinSelectors` 里搬（与当初 `imEntry` 同一条纪律）。
 *
 * 2026-09-19 捕获里已经见过的东西（这次是**复现**它们）：
 *   * 会话行 `div.im-ui-contact-list-item.im-ui-contact-item`，带
 *     `data-tlg-ext='{"unread":true,"to_imid":"…"}'`（未读与对方 imId 直接读得到）；
 *   * 未读徽章 `.ant-im-badge-count`（文本就是未读数）；
 *   * 输入面 `textarea.ant-im-input.im-ui-textarea`，placeholder 明写「按Enter键发送」；
 *   * 我方消息 `.im-ui-message-item-send` / 正文 `.im-ui-txt.send` /
 *     发送中图标 `.im-ui-message-item-loadingicon-send`。
 */
export function probeImSurfaceInPage(arg: { selectors: string[]; maxSamples: number }): {
  hits: Record<string, number>
  composer: { tag: string; cls: string; placeholder: string; rows: string } | null
  messageItemClasses: string[]
  contactFirst: { dataTlgExt: string; title: string; sub: string } | null
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
  const hits: Record<string, number> = {}
  for (const selector of arg.selectors) hits[selector] = q(selector).length

  const composerNode = q('textarea').find((el) => {
    const placeholder = el.getAttribute('placeholder') ?? ''
    return /Enter|发送/i.test(placeholder)
  })
  const composer =
    composerNode === undefined
      ? null
      : {
          tag: composerNode.tagName.toLowerCase(),
          cls: composerNode.getAttribute('class') ?? '',
          placeholder: composerNode.getAttribute('placeholder') ?? '',
          rows: composerNode.getAttribute('rows') ?? '',
        }

  const messageItemClasses: string[] = []
  for (const node of q('[class*="im-ui-message-item"]')) {
    const cls = node.getAttribute('class') ?? ''
    if (cls !== '' && !messageItemClasses.includes(cls)) messageItemClasses.push(cls)
    if (messageItemClasses.length >= arg.maxSamples) break
  }

  let contactFirst: { dataTlgExt: string; title: string; sub: string } | null = null
  const firstContact = q('.im-ui-contact-item')[0]
  if (firstContact !== undefined) {
    contactFirst = {
      dataTlgExt: firstContact.getAttribute('data-tlg-ext') ?? '',
      title: clean(firstContact.querySelector('.im-ui-contact-title-name')?.textContent),
      sub: clean(firstContact.querySelector('.im-ui-contact-title-sub')?.textContent),
    }
  }
  return { hits, composer, messageItemClasses, contactFirst }
}

/**
 * **在页面上下文里**读"我发出的消息"（自包含）：条数 / 文本列表 / 是否有发送中的。
 *
 * `messageLoading` 是消息条目内的 loading 图标（实测类名
 * `.im-ui-message-item-loadingicon-send`，空闲时带 `hide` 类）——「文本已上屏但
 * 还在转圈」就是 pending，转完才是 delivered。
 */
export function readMyMessagesInPage(arg: {
  selectors: { myMessage: string; messageText: string; messageLoading: string }
}): { count: number; texts: string[]; loading: boolean } {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selectors.myMessage))
  } catch {
    return { count: 0, texts: [], loading: false }
  }
  const texts: string[] = []
  let loading = false
  for (const node of nodes) {
    let text = ''
    try {
      const content = node.querySelector(arg.selectors.messageText)
      text = clean(content === null ? node.textContent : content.textContent)
    } catch {
      text = ''
    }
    texts.push(text)
    try {
      const icon = node.querySelector(arg.selectors.messageLoading)
      if (icon !== null && !(icon.getAttribute('class') ?? '').includes('hide')) loading = true
    } catch {
      /* 选择器非法就当不在转圈 */
    }
  }
  return { count: nodes.length, texts, loading }
}

/**
 * 把会话列表响应里的**行**整理成可读摘要（宿主侧纯函数）。
 *
 * 为什么要这一步而不是只存原文：`lastPayload` 是**一个 JSON 字符串**（要再解一层才看得到
 * 真正那句话与 `ext.extType`），方向判据全靠它。原文也留在 `network[]` 里，
 * 但摘要让"这一轮采到了什么"当场可见。
 */
export function summarizeContactRows(payload: unknown): Array<{
  id: string
  name: string
  company: string
  unReadCnt: string
  direction: string
  oppositeRead: string
  latestMsgTime: string
  latestMsgIsRevoke: string
  extType: string
  msg: string
  jobId: string
}> {
  const root = payload as { data?: { list?: unknown[] } } | null
  const list = root?.data?.list
  if (!Array.isArray(list)) return []
  const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value))
  return list.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>
    let payloadInner = row['lastPayload']
    if (typeof payloadInner === 'string') {
      try {
        payloadInner = JSON.parse(payloadInner) as unknown
      } catch {
        payloadInner = null
      }
    }
    const inner = (payloadInner ?? {}) as {
      bodies?: Array<{ msg?: unknown }>
      ext?: { extType?: unknown; extBody?: { bizData?: { jobId?: unknown } } }
    }
    return {
      id: text(row['id']),
      name: text(row['name']),
      company: text(row['company']),
      unReadCnt: text(row['unReadCnt']),
      direction: text(row['direction']),
      oppositeRead: text(row['oppositeRead']),
      latestMsgTime: text(row['latestMsgTime']),
      latestMsgIsRevoke: text(row['latestMsgIsRevoke']),
      extType: text(inner.ext?.extType),
      msg: text(inner.bodies?.[0]?.msg),
      jobId: text(inner.ext?.extBody?.bizData?.jobId),
    }
  })
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
  /**
   * IM 侧选择器的量测结果（抽屉 + 会话面板）。
   *
   * 落进报告而不是只打终端：`sayHello`/`reply` 的实现与否取决于"输入面到底有没有稳定选择器"，
   * 这是**决策依据**，必须能回头查。
   */
  let imSurface: ReturnType<typeof probeImSurfaceInPage> | null = null
  /** 会话行的可读摘要（`lastPayload` 解一层后的关键字段）—— 方向判据的证据。 */
  let contactRowSummary: ReturnType<typeof summarizeContactRows> = []
  /**
   * 发送实验的结果（LIEPIN_ALLOW_SEND=1 才有）：话术、textarea 上屏值、DOM 送达与否、
   * 送达后我方消息条数与 loading 态 —— `sayHello`/`reply` 实现的**直接依据**。
   */
  let sendExperiment: {
    text: string
    focusAfterClick: string
    typedVia: string
    typedValue: string
    domDelivered: boolean
    myMessageCountAfter: number
    loadingAfter: boolean | null
    lastTextsAfter: string[]
  } | null = null
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
            // IM 类响应体放宽（会话行的 lastPayload 很长，4000 字符会把后面几行挤掉）
            const cap = /get-contact-list|open-chat|unread-count|my-contact-list|socket/i.test(url)
              ? IM_BODY_CAP
              : 4_000
            entry.bodyHead = (await response.text()).slice(0, cap)
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
      // ⚠️ **无论 ALLOW_CHAT 与否都回搜索页**（2026-09-20 第二轮实测的教训）：
      //    详情页上 `#im-c-entry` 在、但内层 `.im-ui-basic-entry` 是**懒加载**的 ——
      //    快照实测：搜索页 basic-entry=1，详情页=0（这轮定位失败就断在这里）。
      //    搜索页稳定渲染；回搜索页也让 IM 微前端重新初始化、必发一遍
      //    `im.c.contact.get-contact-list`（刚打过招呼时拿到的才是"之后"的状态）。
      await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
      await page.waitForTimeout(6_000)
      // 入口轮询（最多 ~15s）：哪怕在搜索页上，微前端偶尔也晚几秒
      let imEntry: Awaited<ReturnType<typeof centerOfSelectorInPage>> | null = null
      for (let attempt = 0; attempt < 5; attempt += 1) {
        imEntry = await page
          .evaluate(centerOfSelectorInPage, { selector: IM_ENTRY_SELECTOR, maxTextLength: 12 })
          .catch(() => null)
        if (imEntry !== null && imEntry.found) break
        await page.waitForTimeout(3_000)
      }
      if (imEntry === null || !imEntry.found) {
        record('打开「我的沟通」', false, `没找到可见的 ${IM_ENTRY_SELECTOR}（轮询 15s 仍无 —— 微前端没加载？看截图/HTML）`)
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
        // ── IM 侧选择器复现：抽屉里的会话列表（只读）─────────────────────
        // 候选表先量命中数 —— 与当初 `imEntry` 同一条纪律（先见过、再搬进配置）。
        const IM_SURFACE_SELECTORS = [
          '.ant-im-drawer',
          '.im-ui-contact-list-wrapper',
          '.im-ui-contact-item',
          '.im-ui-contact-title-name',
          '.im-ui-contact-title-sub',
          '.ant-im-badge-count',
          '.im-ui-system-tip',
          '.im-ui-chat-modal-container',
          'textarea.im-ui-textarea',
          '.im-ui-message-item',
          '.im-ui-message-item-send',
          '.im-ui-message-item-body',
          '.im-ui-message-item-loadingicon',
          '.im-ui-txt.send',
        ]
        const drawerSurface = await page
          .evaluate(probeImSurfaceInPage, { selectors: IM_SURFACE_SELECTORS, maxSamples: 12 })
          .catch(() => null)
        if (drawerSurface === null) {
          record('IM 抽屉选择器', false, 'evaluate 失败')
        } else {
          record(
            'IM 抽屉选择器（会话列表侧）',
            (drawerSurface.hits['.im-ui-contact-item'] ?? 0) > 0,
            Object.entries(drawerSurface.hits)
              .filter(([, n]) => n > 0)
              .map(([s, n]) => `${s}:${String(n)}`)
              .join(' · ') || '(全 0 —— 抽屉没开或类名变了)',
          )
          if (drawerSurface.contactFirst !== null) {
            record(
              '  首个会话行',
              true,
              `data-tlg-ext=${drawerSurface.contactFirst.dataTlgExt} · 标题「${drawerSurface.contactFirst.title}」· 副标题「${drawerSurface.contactFirst.sub}」`,
            )
          }
        }

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
          // 行摘要：`lastPayload` 是**一个 JSON 字符串**（要再解一层），方向判据全靠它 ——
          // 直接把"这一轮采到了哪些行、每行是什么"落进报告，免得每次都要手写脚本挖。
          let parsedBody: unknown = null
          try {
            parsedBody = JSON.parse(latest.bodyHead ?? '')
          } catch {
            parsedBody = null
          }
          const rows = summarizeContactRows(parsedBody)
          if (rows.length > 0) {
            contactRowSummary = rows
            record('  会话行摘要', true, `共 ${String(rows.length)} 行`)
            for (const row of rows) {
              record(
                `    行 ${row.name}/${row.company.slice(0, 10)}`,
                true,
                `unread=${row.unReadCnt} direction=${row.direction} oppositeRead=${row.oppositeRead} ` +
                  `extType=${row.extType} revoke=${row.latestMsgIsRevoke} jobId=${row.jobId} msg=「${row.msg.slice(0, 60)}」`,
              )
            }
          }

          /* ── 4. imId 来源 + 请求头门槛（决定收件箱能否接口化）──────── */
          const realImId = /(?:^|&)imId=([^&]*)/.exec(latest.postData ?? '')?.[1] ?? ''
          const apiUrl = latest.url.split('?')[0] ?? ''
          const windowFrom = Date.now()
          const variants = await page
            .evaluate(probeContactListInPage, {
              api: apiUrl,
              pageSize: 30,
              realImId,
              headers: latest.headers,
              // 适配器将来要用的那一份（六项静态；遥测在页面里现造）
              adapterHeaders: LIEPIN_API_HEADERS,
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

        // ── IM 会话面板：点开**第一行会话**（只读：只是打开会话，不发任何消息）──
        // 为什么这一步是安全的、也是必要的：`.im-ui-chat-modal-container` 在抽屉打开时是**空的**，
        // 输入面（`textarea` + placeholder「按Enter键发送」）只在**打开某个会话之后**才渲染 ——
        // 不点进去，「打招呼/回复能不能做」这一格永远没有证据。点会话行 = 读一条已存在的会话，
        // 与「聊一聊」（会触发 `open-chat`、给 HR 建会话）是两件事，所以同样不需要开关。
        const contactSpot = await page
          .evaluate(centerOfSelectorInPage, { selector: '.im-ui-contact-item', maxTextLength: 40 })
          .catch(() => null)
        if (contactSpot === null || !contactSpot.found) {
          record('打开一条会话', false, '抽屉里没有可见的 .im-ui-contact-item（没有会话？类名变了？）')
        } else {
          await page.mouse.move(contactSpot.x, contactSpot.y, { steps: 8 })
          await page.waitForTimeout(200)
          await page.mouse.click(contactSpot.x, contactSpot.y)
          await page.waitForTimeout(6_000)
          record('打开一条会话', true, `真鼠标点击会话行「${contactSpot.text.slice(0, 30)}」（只读，未发任何消息）`)
          await capture(page, 'im-chat-panel', true)
          const panelSurface = await page
            .evaluate(probeImSurfaceInPage, { selectors: IM_SURFACE_SELECTORS, maxSamples: 20 })
            .catch(() => null)
          if (panelSurface === null) {
            record('IM 面板选择器', false, 'evaluate 失败')
          } else {
            imSurface = panelSurface
            record(
              'IM 面板选择器（会话侧）',
              panelSurface.composer !== null,
              Object.entries(panelSurface.hits)
                .filter(([, n]) => n > 0)
                .map(([s, n]) => `${s}:${String(n)}`)
                .join(' · ') || '(全 0)',
            )
            record(
              '  输入面',
              panelSurface.composer !== null,
              panelSurface.composer === null
                ? '没找到带「Enter/发送」placeholder 的 textarea ⇒ 会话面板没打开'
                : `<${panelSurface.composer.tag}> class="${panelSurface.composer.cls}" placeholder="${panelSurface.composer.placeholder}" rows=${panelSurface.composer.rows}`,
            )
            if (panelSurface.messageItemClasses.length > 0) {
              record('  消息条目类名', true, panelSurface.messageItemClasses.join(' | ').slice(0, 400))
            }
          }

          /* ── 5. 发送实验（LIEPIN_ALLOW_SEND=1）：给 `sayHello`/`reply` 补最后一块证据 ──
           *
           * 整条发送链路里**从未真跑过的只有"打字 + 回车"这一步**（此前探针只走到开面板）。
           * 这里在**当前打开的这条会话**里用真键盘打一句测试话术并回车，验证四件事：
           *   ① textarea 吃不吃 CDP 键盘事件（React 受控组件，理论上吃，要实证）；
           *   ② Enter 是否真的把消息发出去（placeholder 明写「按Enter键发送」）；
           *   ③ 发出后 `.im-ui-message-item-send` 是否出现同文本、loadingicon 是否归 `hide`；
           *   ④ `get-contact-list` 的 `lastPayload` 是否变成这句话（接口层交叉验证）。
           *
           * ⚠️ **这一步会给会话对面的真人发出一条消息**（默认文案「测试，请忽略。」），
           *    所以独立于 LIEPIN_ALLOW_CHAT 单独设开关，默认禁止。目标 = 刚点开的那条会话
           *    （抽屉第一行 = 最近会话）。要换文案用 LIEPIN_SEND_TEXT。
           */
          if (ALLOW_SEND) {
            const sendText = process.env['LIEPIN_SEND_TEXT'] ?? '测试，请忽略。'
            const composer = await page
              .evaluate(centerOfSelectorInPage, { selector: 'textarea.im-ui-textarea', maxTextLength: 10 })
              .catch(() => null)
            if (composer === null || !composer.found) {
              record('发送实验', false, '找不到可见的 textarea.im-ui-textarea —— 会话面板没开？')
            } else {
              // 发送前的我方消息基线（对比"新出现的那条"用）
              const before = await page
                .evaluate(readMyMessagesInPage, {
                  selectors: {
                    myMessage: '.im-ui-message-item-send',
                    messageText: '.im-ui-txt.send',
                    messageLoading: '.im-ui-message-item-loadingicon-send',
                  },
                })
                .catch(() => null)
              record(
                '发送实验（前态）',
                true,
                `我方消息 ${String(before?.count ?? -1)} 条：${(before?.texts ?? []).slice(-3).join(' | ').slice(0, 200)}` +
                  ` · loading=${String(before?.loading ?? '?')}`,
              )
              // 点击聚焦 → 验证焦点真的落进了输入框 → 拟人逐字符输入 → 回车。
              // ⚠️ 2026-09-20 第一次实验的教训：点击落在**动画中的弹窗**上、焦点没进输入框 ⇒
              //    `insertText` 全部落空（textarea.value 恒空、Enter 落空、什么都没发出）。
              //    第二次（焦点落定后）insertText 即正常上屏并送达 —— 根因是**焦点**，不是输入法。
              //    所以这一版：① 点击后先验证 document.activeElement；② value 不对就再聚焦并
              //    回退**真键盘逐键**（keyboard.type），把"哪条路能上屏"钉进证据。
              await page.mouse.move(composer.x, composer.y, { steps: 8 })
              await page.waitForTimeout(150)
              await page.mouse.click(composer.x, composer.y)
              await page.waitForTimeout(400)
              const focusAfterClick = await page.evaluate(() => {
                const el = document.activeElement
                if (el === null) return '(body)'
                const tag = el.tagName.toLowerCase()
                const cls = String(el.className).split(/\s+/).filter(Boolean).join('.')
                return cls === '' ? tag : `${tag}.${cls}`
              })
              record('发送实验（焦点）', focusAfterClick.includes('textarea'), `document.activeElement=${focusAfterClick}`)

              let typedValue = ''
              let typedVia = ''
              await humanType(page.keyboard, sendText, { wait: (ms) => page.waitForTimeout(ms) })
              await page.waitForTimeout(500)
              typedValue = await page.evaluate(() => {
                const el = document.querySelector('textarea.im-ui-textarea') as HTMLTextAreaElement | null
                return el === null ? '' : el.value
              })
              typedVia = 'insertText（拟人）'
              if (typedValue !== sendText) {
                // 回退一：真键盘逐键（keydown/keypress/input/keyup 全套事件）
                await page.mouse.click(composer.x, composer.y)
                await page.waitForTimeout(300)
                await page.keyboard.type(sendText, { delay: 55 })
                await page.waitForTimeout(500)
                typedValue = await page.evaluate(() => {
                  const el = document.querySelector('textarea.im-ui-textarea') as HTMLTextAreaElement | null
                  return el === null ? '' : el.value
                })
                typedVia = 'keyboard.type（真键盘逐键）'
              }
              const typed = typedValue
              record(
                '发送实验（上屏）',
                typed === sendText,
                `via=${typedVia} · textarea.value=${JSON.stringify(typed)}`,
              )
              // 护栏：只有**完整上屏**才按回车 —— 半截文本发出去就是给对面发了一条残句。
              if (typed !== sendText) {
                record('发送实验（中止）', false, '上屏失败，不按回车（不会发出任何消息），本轮实验结束')
                sendExperiment = {
                  text: sendText,
                  focusAfterClick,
                  typedVia,
                  typedValue: typed,
                  domDelivered: false,
                  myMessageCountAfter: before?.count ?? -1,
                  loadingAfter: before?.loading ?? null,
                  lastTextsAfter: (before?.texts ?? []).slice(-3),
                }
                await capture(page, 'im-chat-send-aborted', true)
              } else {
                await humanPress(page.keyboard, 'Enter', { wait: (ms) => page.waitForTimeout(ms) })

              // 轮询送达：同文本出现在我方消息节点 + loadingicon 归 hide
              let after = before
              let delivered = false
              for (let attempt = 0; attempt < 12; attempt += 1) {
                await page.waitForTimeout(1_000)
                after = await page
                  .evaluate(readMyMessagesInPage, {
                    selectors: {
                      myMessage: '.im-ui-message-item-send',
                      messageText: '.im-ui-txt.send',
                      messageLoading: '.im-ui-message-item-loadingicon-send',
                    },
                  })
                  .catch(() => null)
                if ((after?.texts ?? []).some((t) => t.includes(sendText))) {
                  delivered = true
                  break
                }
              }
              record(
                '发送实验（DOM 送达）',
                delivered,
                delivered
                  ? `我方消息节点出现同文本（共 ${String(after?.count ?? -1)} 条）· loading=${String(after?.loading ?? '?')}` +
                    ` · 末 3 条：${(after?.texts ?? []).slice(-3).join(' | ').slice(0, 240)}`
                  : `轮询 12 秒没看到同文本 —— 我方消息 ${String(after?.count ?? -1)} 条：` +
                    `${(after?.texts ?? []).slice(-3).join(' | ').slice(0, 240)}`,
              )
              await capture(page, 'im-chat-after-send', true)

              // 接口层交叉验证：get-contact-list 的第一行（发送后会跳到最前）lastPayload 是否就是这句话。
              // ⚠️ 必须在**页面里**解析完再带出来：会话行的 lastPayload 一条就可能上千字符，
              //    `probeContactListInPage` 的 `raw` 只留 300 字符（够看 flag、不够解析行）。
              const crossCheck = await page
                .evaluate(
                  async (arg: { api: string; headers: Record<string, string>; expectText: string }) => {
                    const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch
                    if (typeof fetchImpl !== 'function') return { ok: false, note: '页面没有 fetch', firstMsg: '' }
                    const uuid = ((): string => {
                      const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
                      if (typeof c?.randomUUID === 'function') return c.randomUUID()
                      const hex = (n: number): string => {
                        let out = ''
                        while (out.length < n) out += Math.floor(Math.random() * 16).toString(16)
                        return out.slice(0, n)
                      }
                      return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`
                    })()
                    try {
                      const response = await fetchImpl(arg.api, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                          ...arg.headers,
                          'content-type': 'application/x-www-form-urlencoded',
                          'x-fscp-trace-id': uuid,
                          'x-fscp-bi-stat': JSON.stringify({
                            location: (globalThis as { location?: { href?: string } }).location?.href ?? '',
                          }),
                          'x-fscp-fe-version': '',
                        },
                        body: 'imUserType=0&imId=&imApp=1&pageSize=30&curPage=0',
                      })
                      const text = await response.text()
                      const parsed = JSON.parse(text) as {
                        flag?: number
                        data?: { list?: Array<{ lastPayload?: string | { bodies?: Array<{ msg?: string }> } }> }
                      }
                      if (parsed.flag !== 1) return { ok: false, note: `flag=${String(parsed.flag)}`, firstMsg: '' }
                      const first = parsed.data?.list?.[0]
                      let firstMsg = ''
                      let payload: unknown = first?.lastPayload
                      if (typeof payload === 'string') {
                        try {
                          payload = JSON.parse(payload) as { bodies?: Array<{ msg?: string }> }
                        } catch {
                          payload = null
                        }
                      }
                      const bodies = (payload as { bodies?: Array<{ msg?: string }> } | null)?.bodies
                      firstMsg = bodies?.map((b) => String(b?.msg ?? '')).join(' ') ?? ''
                      return {
                        ok: true,
                        note: firstMsg.includes(arg.expectText) ? '第一行就是这句话' : '第一行不是这句话',
                        firstMsg,
                      }
                    } catch (error) {
                      return { ok: false, note: error instanceof Error ? error.message : String(error), firstMsg: '' }
                    }
                  },
                  {
                    api: 'https://api-c.liepin.com/api/com.liepin.im.c.contact.get-contact-list',
                    headers: LIEPIN_API_HEADERS,
                    expectText: sendText,
                  },
                )
                .catch(() => null)
              record(
                '发送实验（接口交叉验证）',
                crossCheck?.ok === true && crossCheck.firstMsg.includes(sendText),
                crossCheck === null
                  ? 'evaluate 失败'
                  : `${crossCheck.note} · get-contact-list 第一行 msg=${JSON.stringify(crossCheck.firstMsg.slice(0, 80))}`,
              )
                sendExperiment = {
                  text: sendText,
                  focusAfterClick,
                  typedVia,
                  typedValue: typed,
                  domDelivered: delivered,
                  myMessageCountAfter: after?.count ?? -1,
                  loadingAfter: after?.loading ?? null,
                  lastTextsAfter: (after?.texts ?? []).slice(-3),
                }
              }
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
          /** IM 侧选择器量测（抽屉/会话面板/输入面）—— `sayHello`/`reply` 的决策依据。 */
          imSurface,
          /** 会话行摘要（未读 / direction / extType / 最后一条 msg / jobId）。 */
          contactRows: contactRowSummary,
          /** 发送实验（LIEPIN_ALLOW_SEND=1）：打字+回车这条链路的实测结果。 */
          sendExperiment,
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
