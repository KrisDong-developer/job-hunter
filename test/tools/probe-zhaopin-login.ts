#!/usr/bin/env node
/**
 * 智联招聘「登录态 + 高危动作」走查式取证探针。
 *
 * ## 为什么需要它（这次调研的问题定义）
 *
 * `adapters/zhaopin.ts` 的列表与详情已有真实夹具，但 **打招呼 / 收件箱 / 附件投递**
 * 三件事**全部要登录态**，而仓库里连一份智联登录态的 DOM 都没有 ——
 * 所以它们至今是刻意 fail-closed（`capabilities.supportsGreeting = false`）。
 *
 * 按 `docs/ADAPTERS.md` §6 的铁律：**不编选择器**。要打开这三项，必须先拿到
 * 已登录页面上的**真实契约**。本探针就是那份证据的唯一来源。
 *
 * ## 它怎么取证（两种模式）
 *
 * 智联这三件事的入口**必须登录后点才出现**，而且**点下去就可能产生对外动作**
 * （「立即沟通」可能直接发出一句招呼语、投递不可逆）。所以取证方式必须可审计：
 *
 *   1. **自动走查（默认）**：探针自己按顺序走（2026-09-18 首次实测后按真实契约改过）：
 *      ① 详情页的沟通入口 **只取证不点**（它会不会自动发招呼语尚未验证）；
 *      ② 点页头的消息入口（`a.im-message-entry`，`href=javascript:;`，只能点不能导航）→ 采会话列表；
 *      ③ 详情页的投递入口 **只看不点**（见下面的 ⚠️）。
 *      想要 ① 或 ③ 真的点，得显式开 `ZHAOPIN_ALLOW_CHAT=1` / `ZHAOPIN_ALLOW_APPLY=1`。
 *      ⚠️ **「立即投递」绝不可点**：智联的投递**没有二级确认** —— 点一下就简历投出去 +
 *      平台自动发一条招呼语（`deliver-greeting-modal`「已向对方发送简历和打招呼语」）。
 *      本探针第一版按**词面**挡"提交/确认/发送"、误以为它会先弹选简历的窗，结果**真的投了一份**。
 *      现在按**语义**分组挡（沟通 / 投递各一个开关），默认一律不点。
 *      ⚠️ 必须用真鼠标：DOM `el.click()` 触发不了前端框架的处理器
 *      （zhipin 那次实测踩过：会话页一直是空态，会让人误判"选择器全错了"）。
 *   2. **手动走查（`ZHAOPIN_AUTO_WALK=0`）**：探针只导航 + 录制，走查完全由你完成，
 *      直到关掉浏览器窗口（或到总时限）才落盘。
 *
 * 两种模式都全程录制：每个页面状态的整页 HTML + zhaopin 域下的 XHR/fetch/WebSocket 采样。
 *
 * ## 产物
 *
 *   * `.probe-zhaopin-capture/zhaopin-walk-<NN>-<kind>.html`  每个去重后的页面状态一份整页 HTML
 *     （`kind` 由 URL 与页面特征判定：detail / im / inbox / apply-dialog / other）
 *   * `.probe-zhaopin-capture/zhaopin-actions-report.json`     契约报告：
 *       - `snapshots[]`：每份快照的 URL / 标题 / 交互元素清单（含 class 与 href）
 *         —— 找「发送」「投递」「上传附件」按钮的**唯一依据**；
 *       - `network[]`：所有 zhaopin 域下的 XHR/fetch/WebSocket 采样
 *         （URL / 方法 / 请求体 / 状态 / 响应片段）—— 接口化实现比 DOM 选择器稳得多，
 *           智联的沟通/投递很可能有直接可用的 HTTP 接口；
 *       - `login`：登录态判定命中的信号（校准 `isLoggedInInPage` 用）；
 *       - `autoWalk.steps[]`：自动走查逐步结果（哪步点到、哪步没找到）—— 报告要能自证。
 *
 *   ⚠️ 产物**刻意不写 `test/fixtures/`**：那里是被用例硬编码钉住的夹具
 *   （首条记录标题/条数/源地址都写死），静默替换只会让测试红在与本次校准无关的地方。
 *   要钉住某一份，人工复制进 `test/fixtures/` 并同步改用例里的期望值。
 *
 * 用法：npm run probe:zhaopin-login
 * 环境变量：
 *   ZHAOPIN_PROFILE   持久化 profile 目录（默认 `.probe-zhaopin-profile`）
 *   ZHAOPIN_CAPTURE_DIR 产物目录（默认 `.probe-zhaopin-capture`）
 *   ZHAOPIN_AUTO_WALK `0` = 手动走查（默认自动走查；自动走查默认**不点任何对外动作入口**）
 *   ZHAOPIN_ALLOW_CHAT `1` = 允许点沟通入口（「先聊聊」；可能触发平台自动发招呼语）
 *   ZHAOPIN_ALLOW_APPLY `1` = 允许点「立即投递」（**会真的投出一份简历**）
 *   ZHAOPIN_JOB_ID    指定详情页岗位 id（默认从搜索结果里取第一条真实岗位）
 *   ZHAOPIN_LOGIN_MIN 等待登录上限（分钟，默认 12）
 *   ZHAOPIN_WALK_MIN  走查总时限（分钟，默认 20）
 *   ZHAOPIN_MAX_SNAPSHOTS 最多落盘多少份快照（默认 30，防止长时间挂着撑爆仓库）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const PROFILE = process.env['ZHAOPIN_PROFILE'] ?? join(process.cwd(), '.probe-zhaopin-profile')
/**
 * 产物落点：`.probe-zhaopin-capture/`（`.gitignore` 的 `.probe*` 覆盖它）。
 * 刻意**不写 `test/fixtures/`** —— 见文件头。
 */
const CAPTURE_DIR = process.env['ZHAOPIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-zhaopin-capture')
const REPORT_PATH = join(CAPTURE_DIR, 'zhaopin-actions-report.json')
/** 自动走查（默认开）。`ZHAOPIN_AUTO_WALK=0` 回到"只录制、你自己走"的老模式。 */
const AUTO_WALK = process.env['ZHAOPIN_AUTO_WALK'] !== '0'
/** 起手页：公开搜索页（未登录也能出数，用来取一条真实岗位链接）。 */
const SEARCH_URL = 'https://www.zhaopin.com/sou/jl765'
/** 兜底详情页（夹具里那条岗位；搜不到链接时才用）。 */
const FALLBACK_JOB_ID = process.env['ZHAOPIN_JOB_ID'] ?? 'CC320762410J40890686210'

const LOGIN_WAIT_MS = Math.max(1, Number(process.env['ZHAOPIN_LOGIN_MIN'] ?? '12')) * 60 * 1000
const WALK_MS = Math.max(1, Number(process.env['ZHAOPIN_WALK_MIN'] ?? '20')) * 60 * 1000
const MAX_SNAPSHOTS = Math.max(3, Number(process.env['ZHAOPIN_MAX_SNAPSHOTS'] ?? '30'))
/** 单份 HTML 落盘上限：真实整页可能 2–3 MB，超了截断（截断处会记进报告）。 */
const MAX_HTML_CHARS = 6_000_000

function log(message: string): void {
  console.log(`[probe-zhaopin-login] ${new Date().toISOString()} ${message}`)
}

/* ── 页面上下文探针（自包含：必须能被序列化送进浏览器） ─────────────── */

interface ControlInfo {
  tag: string
  text: string
  className: string
  href: string | null
  type: string | null
  placeholder: string | null
  accept: string | null
  contentEditable: boolean
  visible: boolean
}

interface PageProbe {
  url: string
  title: string
  bodyTextLength: number
  textHead: string
  controls: ControlInfo[]
  inputs: ControlInfo[]
  /** 覆盖层（弹窗/抽屉）候选：投递弹窗与简历选择器的证据。 */
  overlays: Array<{ className: string; textHead: string }>
  /** 可疑信号命中数（登录态与页面种类的辅助判据）。 */
  markers: Record<string, number>
}

/**
 * 页面体检 + 交互元素清点。
 *
 * 为什么要**列出所有** a/button/input/[contenteditable]/[role=button] 而不只查已知选择器：
 * 我们此刻**还不知道**智联的沟通/投递按钮叫什么（这正是本次调研要回答的问题）。
 * 把"页面上所有可交互东西 + 它们的 class/href/placeholder"整批带回来，
 * 才能在离线状态下手握证据去定选择器 —— 而不是先编一个再上线赌。
 */
async function probePage(page: Page): Promise<PageProbe> {
  return await page.evaluate(() => {
    const clean = (value: string | null | undefined): string =>
      value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
    const visible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return false
      const style = getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    }
    const describe = (el: Element): ControlInfo => ({
      tag: el.tagName.toLowerCase(),
      text: clean(el.textContent).slice(0, 80),
      className: clean(el.getAttribute('class')),
      href: el.getAttribute('href'),
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder') ?? el.getAttribute('data-placeholder'),
      accept: el.getAttribute('accept'),
      contentEditable: el.getAttribute('contenteditable') === 'true' || (el as HTMLElement).isContentEditable,
      visible: visible(el),
    })

    const controls: ControlInfo[] = []
    const seen = new Set<Element>()
    const selector =
      "a, button, [role='button'], input, textarea, select, [contenteditable='true'], [class*='send'], [class*='chat'], [class*='im-']"
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if (seen.has(el)) continue
      seen.add(el)
      // 只留可见的：隐藏的模板节点会把清单撑爆，且不是"页面上真实存在的东西"。
      if (!visible(el)) continue
      controls.push(describe(el))
      if (controls.length >= 600) break
    }

    const inputs: ControlInfo[] = []
    for (const el of Array.from(
      document.querySelectorAll("input, textarea, [contenteditable='true']"),
    )) {
      if (!visible(el)) continue
      inputs.push(describe(el))
      if (inputs.length >= 120) break
    }

    const overlays: PageProbe['overlays'] = []
    for (const el of Array.from(
      document.querySelectorAll("[class*='dialog'], [class*='modal'], [class*='popup'], [class*='drawer']"),
    )) {
      if (!visible(el)) continue
      const text = clean(el.textContent)
      if (text.length < 4) continue
      overlays.push({ className: clean(el.getAttribute('class')), textHead: text.slice(0, 200) })
      if (overlays.length >= 20) break
    }

    const markers: Record<string, number> = {}
    const markerSelectors = [
      '.header-user',
      '[class*="avatar"]',
      '[class*="user-name"]',
      '.joblist-box__item-unlogin',
      '.positionlist__list-unlogin',
      '[class*="login"]',
      '[class*="message"]',
      '[class*="inbox"]',
      '[class*="resume"]',
      '[class*="attach"]',
      '[class*="upload"]',
      '[type="file"]',
      'iframe',
    ]
    for (const sel of markerSelectors) {
      try {
        const n = document.querySelectorAll(sel).length
        if (n > 0) markers[sel] = n
      } catch {
        /* 选择器非法就跳过 */
      }
    }

    return {
      url: location.href,
      title: document.title,
      bodyTextLength: clean(document.body?.textContent).length,
      textHead: clean(document.body?.textContent).slice(0, 400),
      controls,
      inputs,
      overlays,
      markers,
    }
  }, undefined as never)
}

/** 登录态判定（自包含）。返回命中的信号名，便于离线校准 `isLoggedInInPage`。 */
async function detectLogin(page: Page): Promise<{ loggedIn: boolean; signals: string[] }> {
  return await page.evaluate(() => {
    const signals: string[] = []
    const has = (selector: string): boolean => {
      try {
        return document.querySelector(selector) !== null
      } catch {
        return false
      }
    }

    let isLoggedFlag: boolean | null = null
    for (const script of Array.from(document.querySelectorAll('script'))) {
      const text = script.textContent ?? ''
      if (text.indexOf('__INITIAL_STATE__') < 0) continue
      const m = /"isLogged"\s*:\s*(true|false)/.exec(text)
      if (m !== null) isLoggedFlag = m[1] === 'true'
      break
    }
    if (isLoggedFlag === true) signals.push('payload.isLogged=true')
    if (isLoggedFlag === false) signals.push('payload.isLogged=false')

    // 结构与文案信号：不管成不成立都记下来 —— 校准登录判定时要看的是"哪条真的可靠"。
    for (const sel of ['.header-user', '[class*="user-avatar"]', '[class*="head-avatar"]', '[class*="userInfo"]']) {
      if (has(sel)) signals.push(`dom:${sel}`)
    }
    if (has('.joblist-box__item-unlogin') || has('.positionlist__list-unlogin')) signals.push('dom:unlogin-class')

    const body = (document.body?.textContent ?? '').replace(/\s+/g, '')
    for (const word of ['我的简历', '我的', '退出登录', '消息', '投递记录']) {
      if (body.includes(word)) signals.push(`text:${word}`)
    }

    // 判定：载荷 isLogged 为 true 直接算已登录；为 false 直接算未登录（智联的权威标记）；
    // 没有该字段时才看结构类名。与适配器 isLoggedInInPage 的口径一致。
    const loggedIn =
      isLoggedFlag === true
        ? true
        : isLoggedFlag === false
          ? false
          : !(has('.joblist-box__item-unlogin') || has('.positionlist__list-unlogin'))
    return { loggedIn, signals }
  }, undefined as never)
}

/** 取搜索结果里第一条真实岗位详情链接（自包含）。 */
async function firstJobDetailUrl(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    for (const a of Array.from(document.querySelectorAll("a[href*='/jobdetail/']"))) {
      const href = a.getAttribute('href') ?? ''
      const m = /jobdetail\/[A-Za-z0-9]+\.htm/.exec(href)
      if (m === null) continue
      return href.startsWith('http') ? href : `https://www.zhaopin.com/${href.replace(/^\//, '')}`
    }
    return null
  }, undefined as never)
}

/**
 * 按可见文本找一个可点元素，返回它的中心坐标（自包含）。
 *
 * 为什么只**定位**、不由页面自己点：DOM `el.click()` 产生 `isTrusted=false`，
 * 智联的前端处理器不响应它 —— zhipin 那次实测踩过（会话页一直是空态，
 * 会让人误判"选择器全错了"）。所以点击一律由 host 侧的真鼠标完成。
 *
 * 「最内层」那一步是必须的：按文本匹配会把容器（`li`/`div`）一起选进来，
 * 而容器的中心点可能落在空白处。只认"没有同样匹配的子元素"的那个候选。
 */
export function findClickableByTextInPage(arg: {
  patterns: string[]
  maxTextLength: number
  excludes?: string[]
  /** 只认 class 里含这个片段的元素（按语义定位，比纯文本稳）。 */
  requireClass?: string
}): { found: boolean; x: number; y: number; text: string; tag: string } {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const visible = (el: Element): boolean => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) return false
    const style = getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
  }
  const excludes = arg.excludes ?? []
  let matched: Element[] = []
  try {
    matched = Array.from(document.querySelectorAll('a, button, [role="button"], span, div, li, i')).filter(
      (el) => {
        if (arg.requireClass !== undefined && !el.getAttribute('class')?.includes(arg.requireClass)) {
          return false
        }
        if (!visible(el)) return false
        const text = clean(el.textContent)
        if (text === '' || text.length > arg.maxTextLength) return false
        if (!arg.patterns.some((pattern) => text.includes(pattern))) return false
        return !excludes.some((word) => text.includes(word))
      },
    )
  } catch {
    return { found: false, x: 0, y: 0, text: '', tag: '' }
  }
  const innermost = matched.find(
    (el) => !matched.some((other) => other !== el && el.contains(other)),
  )
  const chosen = innermost ?? matched[matched.length - 1]
  if (chosen === undefined) return { found: false, x: 0, y: 0, text: '', tag: '' }
  try {
    chosen.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* 忽略：没有布局引擎也不该让探针崩 */
  }
  const rect = chosen.getBoundingClientRect()
  return {
    found: true,
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
    text: clean(chosen.textContent),
    tag: chosen.tagName.toLowerCase(),
  }
}

/** 列出页面里 href 命中给定模式的链接（自包含）。用于**发现**「消息」页的地址，而不是猜 URL。 */
export function findHrefsInPage(arg: { patterns: string[] }): string[] {
  const out: string[] = []
  try {
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href') ?? ''
      if (href === '' || href.startsWith('javascript') || href === '#') continue
      if (!arg.patterns.some((pattern) => href.includes(pattern))) continue
      // ⚠️ 协议相对地址（`//i.zhaopin.com/...`）**不能**当普通相对路径拼 —— 拼出来是
      // `https://www.zhaopin.com//i.zhaopin.com/...`（第一版真踩了，打开的是首页）。
      const absolute = href.startsWith('//')
        ? `https:${href}`
        : href.startsWith('http')
          ? href
          : `https://www.zhaopin.com/${href.replace(/^\//, '')}`
      if (!out.includes(absolute)) out.push(absolute)
      if (out.length >= 40) break
    }
  } catch {
    /* ignore */
  }
  return out
}

/**
 * 在**页面上下文**里试调「会话列表」接口，找出最小可行调用形式（自包含）。
 *
 * 为什么必须试：观察到的真实请求带着 `at`/`rt`（query）、`x-zp-page-request-id`、
 * `x-zp-client-id` 等一整套参数，而**哪些是必需的、哪些是前端顺手带的**没人知道。
 * 直接照抄一版就上线 = 上线一个可能永远 401 的实现。所以这里把变体逐个试一遍，
 * 报告里会留下"哪个变体拿到了数据"。
 *
 * ⚠️ 只读：这是 GET 会话列表，不发送任何东西。返回值刻意**不包含**消息正文与 HR 姓名，
 * 只给字段名（`keys`），避免把私人会话内容落进仓库。
 */
export async function probeTalkListInPage(arg: { baseUrl: string }): Promise<{
  tokens: { at: boolean; rt: boolean; clientId: boolean }
  tries: Array<{ name: string; status: number; code: number | null; rows: number; note: string }>
  keys: string[]
}> {
  const scope = globalThis as unknown as {
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{
      status?: number
      text(): Promise<string>
    }>
  }
  const readCookie = (name: string): string => {
    try {
      const m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(document.cookie)
      return m === null || m[1] === undefined ? '' : decodeURIComponent(m[1])
    } catch {
      return ''
    }
  }
  const at = readCookie('at')
  const rt = readCookie('rt')
  const clientId = readCookie('x-zp-client-id')
  const withTokens = (url: string): string =>
    at === '' || rt === '' ? url : `${url}&at=${encodeURIComponent(at)}&rt=${encodeURIComponent(rt)}`
  const base = `${arg.baseUrl}?pageNo=1&PageSize=20&pageSize=20&sessionType=1&imMessageListType=1&communicateStatusType=0`
  const variants: Array<{ name: string; url: string; headers: Record<string, string> }> = [
    { name: '仅 cookie', url: base, headers: { accept: 'application/json, text/plain, */*' } },
    {
      name: 'cookie + x-zp-client-id',
      url: base,
      headers: { accept: 'application/json, text/plain, */*', 'x-zp-client-id': clientId },
    },
    {
      name: 'query at/rt',
      url: withTokens(base),
      headers: { accept: 'application/json, text/plain, */*' },
    },
    {
      name: 'query at/rt + client-id + page-request-id',
      url: withTokens(base),
      headers: {
        accept: 'application/json, text/plain, */*',
        'x-zp-client-id': clientId,
        'x-zp-page-request-id': `${Math.random().toString(36).slice(2)}-${String(Date.now())}`,
      },
    },
  ]

  const tries: Array<{ name: string; status: number; code: number | null; rows: number; note: string }> = []
  let keys: string[] = []
  for (const variant of variants) {
    const record = (status: number, code: number | null, rows: number, note: string): void => {
      tries.push({ name: variant.name, status, code, rows, note })
    }
    if (typeof scope.fetch !== 'function') {
      record(0, null, -1, '页面上下文没有 fetch')
      continue
    }
    try {
      const response = await scope.fetch(variant.url, {
        method: 'GET',
        credentials: 'include',
        headers: variant.headers,
      })
      const text = await response.text()
      let payload: unknown = null
      try {
        payload = JSON.parse(text)
      } catch {
        payload = null
      }
      const record_ = payload as { code?: unknown; message?: unknown; data?: unknown } | null
      const code = typeof record_?.code === 'number' ? record_.code : null
      const data = record_?.data
      const rows = Array.isArray(data) ? data.length : -1
      record(
        response.status ?? 0,
        code,
        rows,
        typeof record_?.message === 'string' ? record_.message.slice(0, 80) : text.slice(0, 80),
      )
      if (rows > 0 && keys.length === 0 && Array.isArray(data)) {
        const first = data[0] as Record<string, unknown>
        keys = Object.keys(first).slice(0, 60)
      }
    } catch (error) {
      record(0, null, -1, error instanceof Error ? error.message.slice(0, 100) : String(error))
    }
  }
  return { tokens: { at: at !== '', rt: rt !== '', clientId: clientId !== '' }, tries, keys }
}

/**
 * 翻页语义 + 阶段字段探测（自包含，**只读**）。
 *
 * 为什么必须测：`readInbox` 现在只读第 1 页（20 条），会话多于 20 条时第 21 条起的未读读不到 ——
 * 但"加 pageNo=2 就能拿到下一页"是**假设**，不验证就写进适配器是不合格的。
 *
 * 同时把每行的阶段字段（未读/对端已读/对端已回/我方已读/我方已回）**值**dump 出来 ——
 * `oppositeRead`/`oppositeReply` 至今**没有真实样本**（都是 0），一旦出现非 0 的组合，
 * 报告里就能直接看出"哪种组合对应 replied/read"。刻意只记**索引与数值、不记会话内容与 HR 姓名**。
 */
export async function probeTalkListPagesInPage(arg: { baseUrl: string }): Promise<{
  pages: Array<{ pageNo: number; rows: number; overlapWithFirst: number }>
  /** 用**小页长**再测一次翻页 —— 只有它能在"会话数 < 默认页长"时给出决定性结论。 */
  smallPage: Array<{ pageNo: number; pageSize: number; rows: number; overlapWithFirst: number }>
  flags: Array<{
    i: number
    unread: number
    oppositeRead: number
    oppositeReply: number
    selfRead: number
    selfReply: number
  }>
}> {
  const scope = globalThis as unknown as {
    fetch?: (input: string, init?: Record<string, unknown>) => Promise<{ text(): Promise<string> }>
  }
  const query = (pageNo: number, pageSize: number): string =>
    `${arg.baseUrl}?pageNo=${String(pageNo)}&PageSize=${String(pageSize)}&pageSize=${String(pageSize)}` +
    '&sessionType=1&imMessageListType=1&communicateStatusType=0'
  const load = async (pageNo: number, pageSize: number): Promise<Array<Record<string, unknown>>> => {
    if (typeof scope.fetch !== 'function') return []
    try {
      const response = await scope.fetch(query(pageNo, pageSize), {
        method: 'GET',
        credentials: 'include',
        headers: { accept: 'application/json, text/plain, */*' },
      })
      const payload = JSON.parse(await response.text()) as { data?: unknown } | null
      const data = payload?.data
      if (!Array.isArray(data)) return []
      return data.filter(
        (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
      )
    } catch {
      return []
    }
  }
  const num = (row: Record<string, unknown>, key: string): number =>
    typeof row[key] === 'number' && Number.isFinite(row[key] as number) ? (row[key] as number) : -1

  const first = await load(1, 20)
  const firstIds = new Set(first.map((row) => String(row['sessionid'] ?? '')))
  const pages: Array<{ pageNo: number; rows: number; overlapWithFirst: number }> = [
    { pageNo: 1, rows: first.length, overlapWithFirst: first.length },
  ]
  for (const pageNo of [2, 3]) {
    const rows = await load(pageNo, 20)
    if (rows.length === 0) {
      pages.push({ pageNo, rows: 0, overlapWithFirst: 0 })
      continue
    }
    const ids = rows.map((row) => String(row['sessionid'] ?? ''))
    pages.push({
      pageNo,
      rows: rows.length,
      overlapWithFirst: ids.filter((id) => firstIds.has(id)).length,
    })
  }

  // ⚠️ 决定性实验：默认页长 20 而会话可能只有 11 条 —— 那时"第 2 页空"**不能**证明翻页无效
  //    （本来就该空）。所以再用 pageSize=5 测一遍：若翻页有效，第 2 页应给出另外 5 条（重叠 0）。
  const smallPage: Array<{ pageNo: number; pageSize: number; rows: number; overlapWithFirst: number }> = []
  const smallFirst = await load(1, 5)
  const smallIds = new Set(smallFirst.map((row) => String(row['sessionid'] ?? '')))
  smallPage.push({ pageNo: 1, pageSize: 5, rows: smallFirst.length, overlapWithFirst: smallFirst.length })
  const smallSecond = await load(2, 5)
  smallPage.push({
    pageNo: 2,
    pageSize: 5,
    rows: smallSecond.length,
    overlapWithFirst: smallSecond
      .map((row) => String(row['sessionid'] ?? ''))
      .filter((id) => smallIds.has(id)).length,
  })

  return {
    pages,
    smallPage,
    flags: first.slice(0, 20).map((row, index) => ({
      i: index + 1,
      unread: num(row, 'unreadCount'),
      oppositeRead: num(row, 'oppositeRead'),
      oppositeReply: num(row, 'oppositeReply'),
      selfRead: num(row, 'selfRead'),
      selfReply: num(row, 'selfReply'),
    })),
  }
}

/* ── 宿主侧：走查录制器 ─────────────────────────────────────────────── */
interface NetworkEntry {
  at: string
  page: string
  method: string
  url: string
  resourceType: string
  status: number | null
  /** POST 请求体（截断）—— 沟通/投递的接口契约主要看这里。 */
  postData: string | null
  /** 响应片段（JSON 截断）—— 消息列表 / 投递结果的结构。 */
  bodyHead: string | null
}

interface Snapshot {
  index: number
  at: string
  kind: string
  pageUrl: string
  file: string
  truncated: boolean
  probe: PageProbe
}

/** 页面种类（给快照起名用，纯启发式；最终判断靠人工看 HTML）。 */
function kindOf(probe: PageProbe): string {
  const url = probe.url
  const text = probe.textHead
  if (/\/jobdetail\//.test(url)) {
    return probe.overlays.some((o) => /投递|简历|附件/.test(o.textHead)) ? 'apply-dialog' : 'detail'
  }
  if (/chat|im\b|im\/|message|session/i.test(url)) return /message|inbox/i.test(url) ? 'inbox' : 'im'
  if (/投递简历|选择简历|附件简历/.test(text)) return 'apply-dialog'
  if (/消息|沟通|聊天/.test(text)) return 'im-or-inbox'
  return 'other'
}

/** 快照去重签名：URL + 标题 + 正文长度 + 控件数。 */
function signatureOf(probe: PageProbe): string {
  return `${probe.url}|${probe.title}|${String(probe.bodyTextLength)}|${String(probe.controls.length)}|${String(probe.overlays.length)}`
}

function slugifyKind(kind: string): string {
  return kind.replace(/[^a-z0-9-]/gi, '-')
}

async function main(): Promise<void> {
  log('── 智联招聘登录态走查取证 ──')
  log(`profile：${PROFILE}`)
  log(`产物目录：${CAPTURE_DIR}`)
  log(`等待登录上限：${String(LOGIN_WAIT_MS / 60_000)} 分钟；走查上限：${String(WALK_MS / 60_000)} 分钟`)
  log(
    AUTO_WALK
      ? '模式：**自动走查** —— 会自己走「详情页 → 消息页 → 会话列表接口探测」；' +
        '**沟通入口与投递入口默认都不点**（它们是"对外动作"入口）。' +
        '要点头加 ZHAOPIN_ALLOW_CHAT=1 / ZHAOPIN_ALLOW_APPLY=1（后者会真的投出一份简历）。'
      : '模式：手动走查（ZHAOPIN_AUTO_WALK=0）—— 探针只录制，走查由你完成，关掉窗口即落盘。',
  )

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath === undefined) log('⚠️ 没找到系统 Chrome/Edge，交给 patchright 自行解析')
  else log(`浏览器：${executablePath}`)

  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath === undefined ? {} : { executablePath }),
  })
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })

  /* 接口采样：**所有** zhaopin 域的 xhr/fetch/document 都记一笔。
     沟通/收件箱/投递的实现优先走接口（比 class 名稳），所以这份流量是最值钱的证据。 */
  const network: NetworkEntry[] = []
  const networkSeen = new Set<string>()
  const websockets: Array<{ at: string; url: string }> = []

  const attachNetwork = (page: Page): void => {
    const pageTag = (): string => {
      try {
        return page.url().slice(0, 120)
      } catch {
        return '(closed)'
      }
    }
    page.on('request', (request) => {
      try {
        const url = request.url()
        if (!/zhaopin\.com/.test(url)) return
        const type = request.resourceType()
        // 静态资源（图片/字体/CSS）不是契约证据，只会把报告撑爆。
        if (!['xhr', 'fetch', 'document', 'websocket'].includes(type)) return
        const postData = request.postData() ?? null
        const key = `${request.method()} ${url} ${postData ?? ''}`
        if (networkSeen.has(key)) return
        networkSeen.add(key)
        network.push({
          at: new Date().toISOString(),
          page: pageTag(),
          method: request.method(),
          url,
          resourceType: type,
          status: null,
          postData: postData === null ? null : postData.slice(0, 4_000),
          bodyHead: null,
        })
      } catch {
        /* 监听本身不许炸 */
      }
    })
    page.on('response', (response: Response) => {
      try {
        const url = response.url()
        if (!/zhaopin\.com/.test(url)) return
        const type = response.request().resourceType()
        if (!['xhr', 'fetch'].includes(type)) return
        const status = response.status()
        const contentType = response.headers()['content-type'] ?? ''
        const entry = network.find((item) => item.url === url && item.status === null)
        const finish = (body: string | null): void => {
          if (entry !== undefined) {
            entry.status = status
            entry.bodyHead = body === null ? null : body.slice(0, 20_000)
            return
          }
          network.push({
            at: new Date().toISOString(),
            page: pageTag(),
            method: response.request().method(),
            url,
            resourceType: type,
            status,
            postData: response.request().postData()?.slice(0, 4_000) ?? null,
            bodyHead: body === null ? null : body.slice(0, 20_000),
          })
        }
        if (/json|text/.test(contentType)) {
          void response
            .text()
            .then((body: string) => finish(body === '' ? null : body))
            .catch(() => finish(null))
        } else {
          finish(null)
        }
      } catch {
        /* ignore */
      }
    })
    page.on('websocket', (socket) => {
      try {
        websockets.push({ at: new Date().toISOString(), url: socket.url() })
      } catch {
        /* ignore */
      }
    })
  }

  const snapshots: Snapshot[] = []
  const capturedPages = new WeakSet<object>()

  const capture = async (page: Page, force = false): Promise<void> => {
    if (snapshots.length >= MAX_SNAPSHOTS && !force) return
    let probe: PageProbe
    try {
      probe = await probePage(page)
    } catch {
      return
    }
    if (probe.bodyTextLength < 20 && !force) return
    const signature = signatureOf(probe)
    if (!force && snapshots.some((item) => signatureOf(item.probe) === signature)) return
    if (snapshots.length > 0 && !force) {
      const last = snapshots[snapshots.length - 1]
      if (last !== undefined && signatureOf(last.probe) === signature) return
    }

    const index = snapshots.length + 1
    const kind = kindOf(probe)
    const name = `zhaopin-walk-${String(index).padStart(2, '0')}-${slugifyKind(kind)}.html`
    let html = ''
    try {
      html = await page.content()
    } catch {
      html = ''
    }
    const truncated = html.length > MAX_HTML_CHARS
    if (html !== '') {
      mkdirSync(CAPTURE_DIR, { recursive: true })
      writeFileSync(join(CAPTURE_DIR, name), truncated ? html.slice(0, MAX_HTML_CHARS) : html, 'utf8')
    }
    snapshots.push({
      index,
      at: new Date().toISOString(),
      kind,
      pageUrl: probe.url,
      file: html === '' ? '(未取到 HTML)' : name,
      truncated,
      probe,
    })
    log(
      `✔ 快照 #${String(index)} [${kind}] ${probe.url.slice(0, 100)} ` +
        `(正文 ${String(probe.bodyTextLength)} 字 · 控件 ${String(probe.controls.length)} 个` +
        `${probe.overlays.length > 0 ? ` · 覆盖层 ${String(probe.overlays.length)}` : ''})`,
    )
  }

  /**
   * 持续录制：每 4 秒体检一次当前所有页面。
   * 不用 waitForNavigation —— 智联大量使用 SPA 路由，URL 变化不一定伴随导航事件。
   */
  const watchPage = (page: Page): void => {
    if (capturedPages.has(page)) return
    capturedPages.add(page)
    attachNetwork(page)
    log(`👀 开始录制新页面：${page.url().slice(0, 100) || '(空白)'}`)
  }

  /**
   * 最终提交类的文案 —— **一律拒绝点击**。
   *
   * 这是自动走查的硬边界：取证需要点开入口，但"话说出去"与"简历投出去"必须由人决定。
   */
  const FORBIDDEN_CLICK_TEXT = ['提交', '确认', '确定', '发送'] as const

  /**
   * **不可逆 / 未验证**的对外动作入口 —— 按语义分组，各配一个显式开关，默认一律不点。
   *
   * ⚠️ 2026-09-18 实测教训（本探针第一版真踩了）：智联的「立即投递」**没有二级确认** ——
   * 一次点击就把简历投出去**并**自动发一条招呼语，页面弹 `deliver-greeting-modal`
   * 「已向对方发送简历和打招呼语」；接口链是
   * `application/preparation` → `bdp/interceptService/intercept` → `jobs/application` →
   * `imapi/imV2/getUserPrologueNew`（平台自己生成的那句话术）。
   *
   * 第一版只按**词面**挡了"提交/确认/发送"，而真正的提交按钮叫「立即投递」—— 于是被放行，
   * 真的投了一份简历出去。所以改成按**语义**分组挡，且"沟通入口会不会也自动发招呼语"
   * **尚未验证**，因此它同样默认不点。
   */
  const RISKY_CLICK_TEXT: Record<'chat' | 'apply', readonly string[]> = {
    chat: ['先聊聊', '立即沟通', '在线沟通', '继续沟通'],
    apply: ['投递', '申请职位', '立即申请', '一键投递'],
  }
  const ALLOW_CHAT = process.env['ZHAOPIN_ALLOW_CHAT'] === '1'
  const ALLOW_APPLY = process.env['ZHAOPIN_ALLOW_APPLY'] === '1'
  const allowed = (group: 'chat' | 'apply'): boolean => (group === 'chat' ? ALLOW_CHAT : ALLOW_APPLY)

  /** 用**真鼠标**点一个"按文本找到"的可见元素（DOM click 触发不了前端框架 —— 见文件头）。 */
  const clickByText = async (
    page: Page,
    patterns: string[],
    options: {
      maxTextLength?: number
      excludes?: string[]
      requireClass?: string
      /** 这次点击属于哪一类危险动作；命中该组文案而开关没开时**拒绝点击**。 */
      allow?: 'chat' | 'apply'
    } = {},
  ): Promise<{ ok: boolean; text: string; note: string }> => {
    const spot = await page
      .evaluate(findClickableByTextInPage, {
        patterns,
        maxTextLength: options.maxTextLength ?? 12,
        ...(options.excludes === undefined ? {} : { excludes: options.excludes }),
        ...(options.requireClass === undefined ? {} : { requireClass: options.requireClass }),
      })
      .catch(() => null)
    if (spot === null || !spot.found) {
      return { ok: false, text: '', note: `没找到文本含「${patterns.join(' / ')}」的可见可点元素` }
    }
    const hit = FORBIDDEN_CLICK_TEXT.find((word) => spot.text.includes(word))
    if (hit !== undefined) {
      return {
        ok: false,
        text: spot.text,
        note: `拒绝点击（文案含「${hit}」，属最终提交类）：「${spot.text}」`,
      }
    }
    for (const group of ['chat', 'apply'] as const) {
      const risky = RISKY_CLICK_TEXT[group].find((word) => spot.text.includes(word))
      if (risky === undefined) continue
      if (options.allow === group && allowed(group)) break
      return {
        ok: false,
        text: spot.text,
        note:
          `拒绝点击（文案含「${risky}」，属 ${group === 'chat' ? '沟通' : '投递'}类对外动作；` +
          `需 ZHAOPIN_ALLOW_${group.toUpperCase()}=1 才放行）：「${spot.text}」`,
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

  /** 体检并采集当前**所有**页面（点击前后各来一次，好对照"点了之后 DOM 多了什么"）。 */
  const captureAll = async (force = false): Promise<void> => {
    for (const page of context.pages().filter((item) => !item.isClosed())) {
      watchPage(page)
      await capture(page, force)
    }
  }

  context.on('page', (page) => {
    watchPage(page)
  })
  for (const page of context.pages()) watchPage(page)

  const startPage: Page = context.pages()[0] ?? (await context.newPage())
  watchPage(startPage)

  /* ── 1. 起点：公开搜索页 ─────────────────────────────────────────── */
  log('导航到搜索页（取一条真实岗位链接）…')
  await startPage.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((error: unknown) => {
    log(`goto 搜索页失败：${error instanceof Error ? error.message : String(error)}`)
  })
  await startPage.waitForTimeout(4_000)

  /* ── 2. 登录等待 ─────────────────────────────────────────────────── */
  log('⚠️ 请在弹出的浏览器窗口里登录智联（探针只等待，不代填任何凭据）')
  const loginDeadline = Date.now() + LOGIN_WAIT_MS
  let loggedIn = false
  let lastHintAt = 0
  let loginSignals: string[] = []
  while (Date.now() < loginDeadline) {
    const check = await detectLogin(startPage).catch(() => null)
    if (check !== null && check.loggedIn) {
      loggedIn = true
      loginSignals = check.signals
      log(`✔ 登录态就位（命中信号：${check.signals.join(' / ')}）`)
      break
    }
    if (check !== null) loginSignals = check.signals
    if (Date.now() - lastHintAt > 20_000) {
      lastHintAt = Date.now()
      const url = startPage.url()
      log(`⏳ 等待登录中（URL ${url.slice(0, 90)}；信号 ${loginSignals.join(' / ') || '无'}）`)
    }
    await startPage.waitForTimeout(3_000)
  }

  if (!loggedIn) {
    log('✘ 等待登录超时 —— 未取证。profile 已保留，登录一次后重跑本探针即可。')
    await context.close()
    process.exitCode = 1
    return
  }

  /* ── 3. 打开一个真实岗位详情页（登录态） ───────────────────────────── */
  log('回到搜索页并取一条真实岗位链接…')
  await startPage.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
  await startPage.waitForTimeout(4_000)
  const detailUrl =
    (await firstJobDetailUrl(startPage).catch(() => null)) ??
    `https://www.zhaopin.com/jobdetail/${FALLBACK_JOB_ID}.htm`
  log(`打开详情页（登录态）：${detailUrl}`)
  await startPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch((error: unknown) => {
    log(`goto 详情页失败：${error instanceof Error ? error.message : String(error)}`)
  })
  await startPage.waitForTimeout(6_000)
  await capture(startPage, true)

  /* ── 4. 走查 ─────────────────────────────────────────────────────── */
  type TalkListProbe = Awaited<ReturnType<typeof probeTalkListInPage>>
  /** 会话列表接口探测结果（哪一变体真的拿到了数据）—— 落进报告，实现 readInbox 时照它写。 */
  let talkListProbe: TalkListProbe | null = null
  /** 翻页语义 + 每行的阶段字段值（`oppositeRead`/`oppositeReply` 有没有真实样本就看它）。 */
  let talkPagesProbe: Awaited<ReturnType<typeof probeTalkListPagesInPage>> | null = null
  const steps: Array<{ name: string; ok: boolean; note: string }> = []
  const record = (name: string, ok: boolean, note: string): void => {
    steps.push({ name, ok, note })
    log(`${ok ? '✔' : '✘'} [${name}] ${note}`)
  }

  const walkDeadline = Date.now() + WALK_MS
  let closed = false
  context.on('close', () => {
    closed = true
  })

  if (AUTO_WALK) {
    log('')
    log('──── 自动走查开始（真鼠标；**任何对外动作入口默认都不点**）────')
    log(`目标岗位：${detailUrl}`)
    log(
      ALLOW_CHAT
        ? '⚠️ ZHAOPIN_ALLOW_CHAT=1 —— 会点沟通入口（可能触发平台自动发一句招呼语）'
        : '沟通入口只**取证不点**（要点头加 ZHAOPIN_ALLOW_CHAT=1）',
    )

    /* ── ① 详情页 → 沟通入口（实测：文案是「先聊聊」，不是 BOSS 那套「立即沟通」）──
       默认只取证不点：它**会不会也自动发招呼语**尚未验证，所以按"未验证的对外动作"处理。 */
    await captureAll(true)
    const chat = await clickByText(startPage, ['先聊聊', '立即沟通', '在线沟通'], {
      maxTextLength: 12,
      allow: 'chat',
    })
    record('沟通入口（先聊聊）', chat.ok, chat.note)
    if (chat.ok) {
      await startPage.waitForTimeout(6_000)
      await captureAll(true)
      // 沟通可能弹窗、也可能**另开标签页** —— 新页面也要采（页面句柄不同，快照不会合并）
      const newest = context.pages().filter((item) => !item.isClosed()).slice(-1)[0]
      if (newest !== undefined && newest !== startPage) {
        await newest.waitForTimeout(3_000)
        record('新标签页（会话）', true, `新页面：${newest.url().slice(0, 100)}`)
        await captureAll(true)
      }
    }

    /* ── ② 消息 / 收件箱页 ───────────────────────────────────────────
       实测：页头的消息入口是 `a.im-message-entry`（文案「消息 13」），而 href 是
       `javascript:;` —— 没有 URL 可导航，只能真鼠标点；页面里那条
       `//i.zhaopin.com/im/greeting/setting` 是「打招呼设置」，不是收件箱。 */
    const entry = await clickByText(startPage, ['消息'], {
      maxTextLength: 12,
      requireClass: 'im-message-entry',
    })
    record('点消息入口（im-message-entry）', entry.ok, entry.note)
    if (entry.ok) {
      await startPage.waitForTimeout(7_000)
      await captureAll(true)
    } else {
      const hrefs = await startPage
        .evaluate(findHrefsInPage, { patterns: ['message', 'chat', 'im/', 'im?', 'conversation', 'notify'] })
        .catch((): string[] => [])
      const inboxUrl = hrefs[0]
      if (inboxUrl === undefined) {
        record('找「消息」页地址', false, '页面里没有 href 含 message/chat/im 的链接')
      } else {
        record('找「消息」页地址', true, `${inboxUrl}（候选 ${String(hrefs.length)} 个）`)
        await startPage.goto(inboxUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
        await startPage.waitForTimeout(6_000)
        await captureAll(true)
      }
    }

    /* ── ③ 会话列表接口探测（只读 GET；找出最小可行的调用形式）────────── */
    if (/i\.zhaopin\.com/.test(startPage.url())) {
      const probed = await startPage
        .evaluate(probeTalkListInPage, { baseUrl: 'https://cgate.zhaopin.com/imapi/imV2/getTalkList' })
        .catch(() => null)
      if (probed === null) {
        record('会话列表接口探测', false, '页面上下文探测抛错（见 network[] 里的尝试）')
      } else {
        talkListProbe = probed
        const best = probed.tries.find((item) => item.rows > 0)
        record(
          '会话列表接口探测',
          best !== undefined,
          `tokens=${JSON.stringify(probed.tokens)}；` +
            probed.tries
              .map((item) => `${item.name}→${String(item.status)}/code ${String(item.code)}/rows ${String(item.rows)}`)
              .join('；'),
        )
        // 翻页语义 + 阶段字段（只读）
        talkPagesProbe = await startPage
          .evaluate(probeTalkListPagesInPage, {
            baseUrl: 'https://cgate.zhaopin.com/imapi/imV2/getTalkList',
          })
          .catch(() => null)
        if (talkPagesProbe !== null) {
          const page1 = talkPagesProbe.pages.find((item) => item.pageNo === 1)
          const page2 = talkPagesProbe.pages.find((item) => item.pageNo === 2)
          const small1 = talkPagesProbe.smallPage.find((item) => item.pageNo === 1)
          const small2 = talkPagesProbe.smallPage.find((item) => item.pageNo === 2)
          record(
            '会话列表翻页 + 阶段字段',
            true,
            `页长 20：第 1 页 ${String(page1?.rows ?? -1)} 条 · 第 2 页 ${String(page2?.rows ?? -1)} 条；` +
              `页长 5（决定性）：第 1 页 ${String(small1?.rows ?? -1)} · 第 2 页 ${String(small2?.rows ?? -1)}` +
              `（与第 1 页重叠 ${String(small2?.overlapWithFirst ?? -1)}）· ` +
              `字段样本 ${JSON.stringify(talkPagesProbe.flags.slice(0, 4))}`,
          )
        }
      }
    } else {
      record('会话列表接口探测', false, `当前不在 IM 页（${startPage.url().slice(0, 80)}），跳过`)
    }

    /* ── ④ 详情页：投递入口 **只看不点** ──────────────────────────────
       ⚠️ 实测：智联的「立即投递」**没有二级确认** —— 点一下 = 简历投出去 + 平台自动发一条招呼语
       （`deliver-greeting-modal`「已向对方发送简历和打招呼语」）。所以默认**不点**，
       只把入口的文案/类名记进报告；要那份弹窗证据得显式设 `ZHAOPIN_ALLOW_APPLY=1`。 */
    await startPage
      .goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(() => undefined)
    await startPage.waitForTimeout(5_000)
    const applySpot = await startPage
      .evaluate(findClickableByTextInPage, { patterns: ['投递'], maxTextLength: 8 })
      .catch(() => null)
    record(
      '投递入口取证（不点）',
      applySpot !== null && applySpot.found,
      applySpot === null || !applySpot.found
        ? '详情页上没有文本含「投递」的可见按钮 —— 记下来（可能是未登录/已投递/改版）'
        : `入口是 <${applySpot.tag}>「${applySpot.text}」，**按实测它一步到底，默认不点**` +
          `（要弹窗证据设 ZHAOPIN_ALLOW_APPLY=1）`,
    )
    if (ALLOW_APPLY) {
      log('⚠️ ZHAOPIN_ALLOW_APPLY=1 —— 将真的点「立即投递」，这会**投出一份真实简历**')
      const apply = await clickByText(startPage, ['立即投递'], { maxTextLength: 8, allow: 'apply' })
      record('点「立即投递」（已授权）', apply.ok, apply.note)
      if (apply.ok) {
        await startPage.waitForTimeout(6_000)
        await captureAll(true)
      }
    }
    log('──── 自动走查结束（未提交任何东西）────')
  } else {
    log('')
    log('════════ 现在请在浏览器里按顺序走这四步（探针在后台持续录制）════════')
    log('  ① 详情页点「立即沟通」或「在线沟通」→ 进到会话页后停住（可以打一句话但**不要发送**）')
    log('  ② 打开「消息 / 收件箱」页（会话列表 / HR 消息），停住')
    log('  ③ 回到某个岗位点「立即投递」→ 弹窗里切到「附件简历」→ **停在提交之前**')
    log('  ④ 全部看完后**关闭浏览器窗口**（探针据此立刻落盘退出）')
    log('注意：探针不代点任何按钮；「立即沟通」本身可能触发平台自动发一句招呼语，请知悉。')
    log('═══════════════════════════════════════════════════════════════')
    log('')

    while (Date.now() < walkDeadline && !closed) {
      const pages = context.pages().filter((page) => !page.isClosed())
      if (pages.length === 0) break
      for (const page of pages) {
        watchPage(page)
        await capture(page)
      }
      await startPage.waitForTimeout(4_000).catch(() => undefined)
    }
    if (Date.now() >= walkDeadline) log('⏱ 录制到达时限，开始落盘')
  }

  /* ── 5. 落盘 ─────────────────────────────────────────────────────── */
  const report = {
    capturedAt: new Date().toISOString(),
    profile: PROFILE,
    login: { loggedIn, signals: loginSignals },
    detailUrl,
    /** 自动走查逐步结果 —— 报告要能自证"哪一步真的做到了"，而不是靠人回忆。 */
    autoWalk: { enabled: AUTO_WALK, steps },
    /**
     * 会话列表接口探测：`tries[]` 里 **rows > 0 的那一条**就是 `readInbox` 该照抄的调用形式。
     * `keys[]` 是接口返回的字段名（**不含**消息正文与 HR 姓名 —— 别把私人会话落进仓库）。
     */
    talkListProbe,
    /**
     * 翻页语义 + 第 1 页每行的阶段字段**值**（只有索引与数值，没有会话内容/HR 姓名）。
     * `pages[]` 里第 2 页与第 1 页的**重叠数**就是"翻页到底有没有用"的答案。
     */
    talkPagesProbe,
    snapshots,
    network,
    websockets,
    notes: [
      'controls[] 是全量交互元素清单（class/href/placeholder/accept），找「发送/投递/上传附件」按钮的依据。',
      'network[] 是本域下 xhr/fetch 的请求与响应片段 —— 优先按接口实现，DOM 选择器只作兜底。',
      'overlays[] 是弹窗/抽屉（投递弹窗、简历选择器）。',
      AUTO_WALK
        ? '自动走查只点了入口（立即沟通 / 立即投递 / 附件简历），**没有点任何最终提交按钮**；' +
          'autoWalk.steps[] 记着每步点到没点到，失败的就是"页面上没有那个文案"的证据。'
        : '本探针未代点任何按钮；快照对应人工走查时页面真实呈现的状态。',
    ],
  }
  mkdirSync(CAPTURE_DIR, { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
  log(`契约报告已保存：${REPORT_PATH}`)
  log(`快照 ${String(snapshots.length)} 份 · 接口采样 ${String(network.length)} 条 · WebSocket ${String(websockets.length)} 条`)
  for (const snapshot of snapshots) {
    log(`  #${String(snapshot.index)} [${snapshot.kind}] ${snapshot.file} ← ${snapshot.pageUrl.slice(0, 90)}`)
  }
  if (steps.length > 0) {
    log('自动走查逐步结果：')
    for (const step of steps) log(`  ${step.ok ? '✔' : '✘'} ${step.name} —— ${step.note}`)
  }
  if (snapshots.length <= 1) {
    log('⚠️ 只录到起手页 —— 走查可能没发生（会话页/收件箱/投递弹窗都没打开过）。')
  }
  await context.close().catch(() => undefined)
  log('✔ 取证结束 —— 接下来由助手按这份报告实现 actions 与详情解析。')
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
