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
 * ## 它怎么取证（与 probe-zhipin-login 的关键差别）
 *
 * zhipin 的探针只需要"看列表长什么样"，可以全自动。但智联这三件事的入口
 * **必须登录后点才出现**，而且**点下去就可能产生对外动作**（「立即沟通」可能直接
 * 发出一句招呼语、投递是不可逆的）。所以本探针**刻意不自动点击任何危险按钮**：
 *
 *   1. 探针只负责「**导航 + 录制**」：自动登录等待 → 自动打开一个真实岗位详情页
 *      → 之后**持续录制**（DOM 快照 + 接口流量），直到你关掉浏览器或到总时限；
 *   2. **走查由你手动完成**（探针不代劳，也不替你提交任何东西）：
 *      ① 在详情页点「立即沟通 / 在线沟通」，进到会话页后停住；
 *      ② 打开「消息 / 收件箱」页；
 *      ③ 点「立即投递」，在弹窗里切到「附件简历」，**停在提交之前**；
 *      ④ 关掉浏览器窗口（探针据此立刻落盘并退出）。
 *
 * 于是落盘的每一份快照都对应"你在页面上真实看到的那个状态"，而不是探针猜的。
 *
 * ## 产物
 *
 *   * `test/fixtures/zhaopin-walk-<NN>-<kind>.html`  每个去重后的页面状态一份整页 HTML
 *     （`kind` 由 URL 与页面特征判定：detail / im / inbox / apply-dialog / other）
 *   * `test/fixtures/zhaopin-actions-report.json`     契约报告：
 *       - `snapshots[]`：每份快照的 URL / 标题 / 交互元素清单（含 class 与 href）
 *         —— 找「发送」「投递」「上传附件」按钮的**唯一依据**；
 *       - `network[]`：所有 zhaopin 域下的 XHR/fetch/WebSocket 采样
 *         （URL / 方法 / 请求体 / 状态 / 响应片段）—— 接口化实现比 DOM 选择器稳得多，
 *           智联的沟通/投递很可能有直接可用的 HTTP 接口；
 *       - `login`：登录态判定命中的信号（校准 `isLoggedInInPage` 用）。
 *
 * 用法：npm run probe:zhaopin-login
 * 环境变量：
 *   ZHAOPIN_PROFILE   持久化 profile 目录（默认 `.probe-zhaopin-profile`）
 *   ZHAOPIN_JOB_ID    指定详情页岗位 id（默认从搜索结果里取第一条真实岗位）
 *   ZHAOPIN_LOGIN_MIN 等待登录上限（分钟，默认 12）
 *   ZHAOPIN_WALK_MIN  登录后的录制上限（分钟，默认 20）
 *   ZHAOPIN_MAX_SNAPSHOTS 最多落盘多少份快照（默认 30，防止长时间挂着撑爆仓库）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const PROFILE = process.env['ZHAOPIN_PROFILE'] ?? join(process.cwd(), '.probe-zhaopin-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const REPORT_PATH = join(FIXTURE_DIR, 'zhaopin-actions-report.json')
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
  log(`等待登录上限：${String(LOGIN_WAIT_MS / 60_000)} 分钟；登录后录制上限：${String(WALK_MS / 60_000)} 分钟`)
  log('说明：本探针**不会**替你点击沟通/投递，也不会提交任何东西 —— 走查由你手动完成。')

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
      mkdirSync(FIXTURE_DIR, { recursive: true })
      writeFileSync(join(FIXTURE_DIR, name), truncated ? html.slice(0, MAX_HTML_CHARS) : html, 'utf8')
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

  /* ── 4. 走查录制 ─────────────────────────────────────────────────── */
  log('')
  log('════════ 现在请在浏览器里按顺序走这四步（探针在后台持续录制）════════')
  log('  ① 详情页点「立即沟通」或「在线沟通」→ 进到会话页后停住（可以打一句话但**不要发送**）')
  log('  ② 打开「消息 / 收件箱」页（会话列表 / HR 消息），停住')
  log('  ③ 回到某个岗位点「立即投递」→ 弹窗里切到「附件简历」→ **停在提交之前**')
  log('  ④ 全部看完后**关闭浏览器窗口**（探针据此立刻落盘退出）')
  log('注意：本探针不代点任何按钮；「立即沟通」本身可能触发平台自动发一句招呼语，请知悉。')
  log('═══════════════════════════════════════════════════════════════')
  log('')

  const walkDeadline = Date.now() + WALK_MS
  let closed = false
  context.on('close', () => {
    closed = true
  })

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

  /* ── 5. 落盘 ─────────────────────────────────────────────────────── */
  const report = {
    capturedAt: new Date().toISOString(),
    profile: PROFILE,
    login: { loggedIn, signals: loginSignals },
    detailUrl,
    snapshots,
    network,
    websockets,
    notes: [
      'controls[] 是全量交互元素清单（class/href/placeholder/accept），找「发送/投递/上传附件」按钮的依据。',
      'network[] 是本域下 xhr/fetch 的请求与响应片段 —— 优先按接口实现，DOM 选择器只作兜底。',
      'overlays[] 是弹窗/抽屉（投递弹窗、简历选择器）。',
      '本探针未代点任何按钮；快照对应人工走查时页面真实呈现的状态。',
    ],
  }
  mkdirSync(FIXTURE_DIR, { recursive: true })
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
  log(`契约报告已保存：${REPORT_PATH}`)
  log(`快照 ${String(snapshots.length)} 份 · 接口采样 ${String(network.length)} 条 · WebSocket ${String(websockets.length)} 条`)
  for (const snapshot of snapshots) {
    log(`  #${String(snapshot.index)} [${snapshot.kind}] ${snapshot.file} ← ${snapshot.pageUrl.slice(0, 90)}`)
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
