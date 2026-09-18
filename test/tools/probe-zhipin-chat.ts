#!/usr/bin/env node
/**
 * BOSS 直聘「会话页 + 岗位详情页」登录态探针 —— 为 `adapters/zhipin.ts` 的
 * `sayHello` / `readInbox` / `sendResume` / `detail.extract` 补**我们自己的**实测证据。
 *
 * ## 为什么还缺这一份
 *
 * `probe:zhipin-login` 只采了**搜索结果页**（分页契约 + 薪资可见性）。而打招呼/收件箱/
 * 附件投递的选择器目前唯一依据是 BossHunter 的求职者端生产代码
 * （`executor/sender.py`、`executor/monitor.py`）—— 那是**别人写的、别人的账号**，
 * 不是本仓库的实测。本探针把这几个断点补齐：
 *
 *   ① 会话列表行结构与真实选择器（`li[role=listitem]` / `.name-text` / `.name-box` /
 *      `.last-msg-text` / 未读标记 / **时间节点到底存不存在**）；
 *   ② 会话页输入区（`#chat-input` 的现行 tag/class、`.btn-send`、`.chat-record`
 *      以及 `.message-status` 的类名枚举）；
 *   ③ 「发简历」入口与 `.choose-resume-dialog` 是否仍是现行结构（**默认只探测不点击**，
 *      设 `ZHIPIN_PROBE_RESUME=1` 才打开弹窗，且**绝不点确认** —— 不发任何东西）；
 *   ④ 岗位详情页各字段选择器 + 8 条「立即沟通」候选的命中情况。
 *
 * ## 只读保证
 *
 * 全程**不发送任何消息、不投递任何简历**。唯一可能改变页面状态的是 ③ 里那次
 * "打开简历选择弹窗"（默认关闭），而且它打开后立刻按 Esc 退出、不点确认。
 *
 * 用法：npm run probe:zhipin-chat
 * 环境变量：
 *   ZHIPIN_PROFILE（默认与 probe:zhipin / probe:zhipin-login 共用同一份 profile）
 *   ZHIPIN_WAIT_MIN（等待手动登录的分钟数，默认 10）
 *   ZHIPIN_DETAIL_URL（指定要采的岗位详情页；不填就从搜索页取第一条）
 *   ZHIPIN_KEY / ZHIPIN_CITY_CODE（取详情页用的搜索条件，默认 Java / 深圳）
 *   ZHIPIN_PROBE_RESUME=1（打开简历选择弹窗做探测；仍然不会点确认发送）
 *   ZHIPIN_CAPTURE_DIR（产物目录覆盖，默认 `.probe-zhipin-capture`）
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-zhipin-capture/chat-list-<日期>.html          会话列表快照
 *   .probe-zhipin-capture/chat-conversation-<日期>.html  会话详情快照（输入区/消息列表）
 *   .probe-zhipin-capture/detail-<日期>.html             岗位详情页快照
 *   .probe-zhipin-capture/chat-report-<日期>.json        逐选择器命中报告（校准依据）
 *
 * ⚠️ **刻意不写 `test/fixtures/`**：那里是被用例钉住的夹具（标题/条数/源地址写死在断言里），
 *    静默替换只会让测试红在与本次校准无关的地方。要固化成夹具，人工复制过去并同步改用例期望值。
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const KEYWORD = process.env['ZHIPIN_KEY'] ?? 'Java'
const CITY_CODE = process.env['ZHIPIN_CITY_CODE'] ?? '101280600'
const PROFILE = process.env['ZHIPIN_PROFILE'] ?? join(process.cwd(), '.probe-zhipin-profile')
const WAIT_TIMEOUT_MS = Math.max(1, Number(process.env['ZHIPIN_WAIT_MIN'] ?? '10')) * 60 * 1000
const PROBE_RESUME = process.env['ZHIPIN_PROBE_RESUME'] === '1'
const CAPTURE_DIR = process.env['ZHIPIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-zhipin-capture')
/** 产物按天命名：选择器哪天腐烂，与上一天的快照一比就知道。 */
const TODAY = new Date().toISOString().slice(0, 10)

const CHAT_URL = 'https://www.zhipin.com/web/geek/chat'
const SEARCH_URL = `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(KEYWORD)}&city=${CITY_CODE}`

const CAPTURE_CHAT_LIST = join(CAPTURE_DIR, `chat-list-${TODAY}.html`)
const CAPTURE_CHAT_CONV = join(CAPTURE_DIR, `chat-conversation-${TODAY}.html`)
const CAPTURE_DETAIL = join(CAPTURE_DIR, `detail-${TODAY}.html`)
const CAPTURE_REPORT = join(CAPTURE_DIR, `chat-report-${TODAY}.json`)

function log(message: string): void {
  console.log(`[probe-zhipin-chat] ${new Date().toISOString()} ${message}`)
}

/** 会话列表行候选选择器（第 1 个是适配器现值，其余是待确认的备选）。 */
const INBOX_SELECTOR_CANDIDATES: Record<string, readonly string[]> = {
  row: ['li[role=listitem]', '.chat-list-wrap li', '.user-list li'],
  name: ['.name-text', '.geek-name', '[class*="name"]'],
  nameBox: ['.name-box', '.name-contet', '[class*="name-box"]'],
  lastMessage: ['.last-msg-text', '.push-text', '[class*="last-msg"]'],
  status: ['.message-status', '[class*="message-status"]'],
  unread: ['.unread-count', '.badge-count', '.notice-badge', '[class*="unread"]', '.red-dot'],
  time: ['.time', '.time-shadow', '[class*="time"]', '.message-time'],
}

/** 适配器当前用的会话行选择器（第一个候选）。 */
const INBOX_ROW_SELECTOR = INBOX_SELECTOR_CANDIDATES['row']?.[0] ?? ''

/** 会话输入区候选。 */
const CHAT_SELECTOR_CANDIDATES: Record<string, readonly string[]> = {
  chatInput: ['#chat-input', '#boss-chat-editor-input', '.chat-input', '[contenteditable="true"]'],
  sendButton: ['.btn-send', '.submit-content .submit', '.send-btn', '[class*="send"]'],
  messageList: ['.chat-record', '.chat-message-list', '.message-list'],
  myMessage: ['.message-item.item-myself', '.item-myself', '[class*="item-my"]'],
  messageText: ['.message-content', '.text', '.message-text', '[class*="text"]'],
  messageStatus: ['.message-status', '[class*="message-status"]'],
}

/** 「发简历 / 更多」工具条候选（按文案识别，类名只是旁证）。 */
const RESUME_SELECTOR_CANDIDATES: Record<string, readonly string[]> = {
  resumeButton: ['.operate-btn', '.operate-icon-item', '.toolbar-box .operate-btn', '[class*="toolbar"] [class*="btn"]'],
  resumeDialog: ['.choose-resume-dialog', '.choose-resume', '[class*="resume-dialog"]'],
  fileInput: ['input[type=file]'],
}

/** 详情页候选。 */
const DETAIL_SELECTOR_CANDIDATES: Record<string, readonly string[]> = {
  title: ['.info-primary .name h1', '.name h1'],
  salary: ['.info-primary .salary', '.salary'],
  tags: ['.info-primary .tag-list span'],
  jdText: ['.job-sec-text', '.job-detail-section .text', '[class*="job-sec"]'],
  companyLink: ['.sider-company .company-info a', '[class*="company-info"] a'],
  companyTags: ['.sider-company .res-industry-item', '.company-info-item'],
}

/**
 * 「立即沟通 / 继续沟通」8 条候选（与适配器 `ZhipinChatSelectors.chatButton` 同源）。
 * 逐条统计命中，用于确认哪几条在现行版本上仍然有效。
 */
const CHAT_ENTRY_CANDIDATES: readonly string[] = [
  'a[redirect-url*="/web/geek/chat"]',
  'a[data-url*="/friend/add"]',
  'a.btn-startchat',
  '[ka="job_detail_chat"]',
  '[ka^="go_chat"]',
  '[ka*="gochat"]',
  '.op-btn-chat',
  '.btn-startchat-wrap',
]

/**
 * 在页面上下文里统计一组选择器的命中数，并给出首个命中节点的形状。
 *
 * `groups` 是**两层**映射：分组名 → 字段名 → 候选选择器列表（例如 `chat.messageList`）。
 * ⚠️ 必须完全自包含（会被序列化送进浏览器执行）。
 */
function scanSelectorsInPage(arg: {
  groups: Record<string, Record<string, readonly string[]>>
}): {
  url: string
  title: string
  groups: Record<
    string,
    Record<string, { selector: string; count: number; sample: string; className: string; tag: string }>
  >
} {
  const out: Record<
    string,
    Record<string, { selector: string; count: number; sample: string; className: string; tag: string }>
  > = {}
  for (const groupName of Object.keys(arg.groups)) {
    const fields = arg.groups[groupName] ?? {}
    const group: Record<
      string,
      { selector: string; count: number; sample: string; className: string; tag: string }
    > = {}
    for (const fieldName of Object.keys(fields)) {
      const selectors = fields[fieldName] ?? []
      for (const selector of selectors) {
        let nodes: Element[] = []
        try {
          nodes = Array.from(document.querySelectorAll(selector))
        } catch {
          nodes = []
        }
        const first = nodes[0]
        // 同一个字段可能有多个候选：只记**第一个命中的**那个，够用来判断哪条仍然有效
        if (nodes.length > 0 && group[fieldName] === undefined) {
          group[fieldName] = {
            selector,
            count: nodes.length,
            sample: first === undefined ? '' : (first.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
            className: first === undefined ? '' : first.getAttribute('class') ?? '',
            tag: first === undefined ? '' : first.tagName.toLowerCase(),
          }
        }
      }
      // 全部候选都没命中 → 明确记 0，别让报告里"这个字段消失"
      if (group[fieldName] === undefined) {
        group[fieldName] = { selector: '', count: 0, sample: '', className: '', tag: '' }
      }
    }
    out[groupName] = group
  }
  return { url: location.href, title: document.title, groups: out }
}

/**
 * 会话列表行样本（含子节点 class 统计）—— 用来判断「时间节点到底存不存在」。
 * ⚠️ 必须完全自包含。
 */
function scanInboxRowsInPage(arg: { row: string; limit: number }): Array<Record<string, string>> {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let rows: Element[] = []
  try {
    rows = Array.from(document.querySelectorAll(arg.row))
  } catch {
    return []
  }
  return rows.slice(0, arg.limit).map((row, index) => {
    const classCounts: Record<string, number> = {}
    try {
      for (const node of Array.from(row.querySelectorAll('[class]'))) {
        const cls = node.getAttribute('class') ?? ''
        if (cls !== '') classCounts[cls] = (classCounts[cls] ?? 0) + 1
      }
    } catch {
      /* ignore */
    }
    return {
      index: String(index),
      id: row.getAttribute('id') ?? '',
      nameText: norm(row.querySelector('.name-text')?.textContent),
      nameBoxSpans: String(row.querySelectorAll('.name-box span').length),
      nameBoxText: norm(row.querySelector('.name-box')?.textContent),
      lastMsg: norm(row.querySelector('.last-msg-text')?.textContent),
      statusClass: (row.querySelector('.message-status')?.getAttribute('class') ?? '').toLowerCase(),
      unreadHit: String(row.querySelector('.unread-count, .badge-count, .notice-badge, .red-dot') !== null),
      classCounts: Object.entries(classCounts)
        .map(([cls, n]) => `${cls}×${String(n)}`)
        .join(' | ')
        .slice(0, 400),
    }
  })
}

/** 会话输入区细节（输入框的现行 tag/class + 工具条文案）。⚠️ 必须完全自包含。 */
function scanConversationDetailInPage(arg: { chatInput: string }): Record<string, unknown> {
  const pick = (selector: string): Record<string, string | number> => {
    try {
      const node = document.querySelector(selector)
      return {
        count: document.querySelectorAll(selector).length,
        tag: node === null ? '' : node.tagName.toLowerCase(),
        className: node === null ? '' : node.getAttribute('class') ?? '',
        placeholder: node === null ? '' : node.getAttribute('placeholder') ?? '',
      }
    } catch {
      return { count: 0, tag: '', className: '', placeholder: '' }
    }
  }
  const toolbarTexts: string[] = []
  try {
    for (const node of Array.from(document.querySelectorAll('.operate-btn, .operate-icon-item'))) {
      const text = (node.textContent ?? '').replace(/\s+/g, '').trim()
      if (text !== '' && !toolbarTexts.includes(text)) toolbarTexts.push(text)
    }
  } catch {
    /* ignore */
  }
  return { chatInput: pick(arg.chatInput), toolbarTexts: toolbarTexts.slice(0, 20) }
}

/** 详情页：字段选择器 + 沟通入口候选命中。⚠️ 必须完全自包含。 */
function scanDetailInPage(arg: {
  groups: Record<string, readonly string[]>
  chatEntry: readonly string[]
}): {
  url: string
  detail: Record<string, { selector: string; count: number; sample: string }>
  chatEntry: Array<{ selector: string; count: number; sample: string }>
} {
  const scanOne = (selector: string): { selector: string; count: number; sample: string } => {
    let count = 0
    let sample = ''
    try {
      const nodes = Array.from(document.querySelectorAll(selector))
      count = nodes.length
      const first = nodes[0]
      sample =
        first === undefined
          ? ''
          : ((first as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    } catch {
      /* ignore */
    }
    return { selector, count, sample }
  }
  // 每个字段只留**第一个命中的候选**（与 scanSelectorsInPage 同一口径）
  const detail: Record<string, { selector: string; count: number; sample: string }> = {}
  for (const fieldName of Object.keys(arg.groups)) {
    for (const selector of arg.groups[fieldName] ?? []) {
      const hit = scanOne(selector)
      if (hit.count > 0) {
        detail[fieldName] = hit
        break
      }
    }
    if (detail[fieldName] === undefined) detail[fieldName] = { selector: '', count: 0, sample: '' }
  }
  return { url: location.href, detail, chatEntry: arg.chatEntry.map((selector) => scanOne(selector)) }
}

/** 在页面上下文里点第一个命中元素（仅探针用；DOM 点击，不改平台状态）。⚠️ 必须完全自包含。 */
function clickFirstInPage(arg: { selector: string; textIncludes?: string }): boolean {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selector))
  } catch {
    return false
  }
  const wanted = norm(arg.textIncludes)
  const target = nodes.find((el) => wanted === '' || norm(el.textContent).includes(wanted))
  if (target === undefined) return false
  try {
    target.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* ignore */
  }
  ;(target as HTMLElement).click()
  return true
}

/** 统计某选择器的节点数（登录就绪判定用）。⚠️ 必须完全自包含。 */
function countInPage(arg: { selector: string }): number {
  try {
    return document.querySelectorAll(arg.selector).length
  } catch {
    return 0
  }
}

async function main(): Promise<void> {
  log(`关键词/城市：${KEYWORD} · ${CITY_CODE} · 简历弹窗探测：${PROBE_RESUME ? '开' : '关'}`)
  log(`profile：${PROFILE}`)

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
  const page: Page = await context.newPage()

  const report: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    note: '只读探针：不动消息、不投递；简历弹窗仅在 ZHIPIN_PROBE_RESUME=1 时打开且不确认。',
  }

  // ── 1. 会话页 + 登录等待 ─────────────────────────────────────────────
  log('打开会话页…')
  try {
    await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(4_000)

  const deadline = Date.now() + WAIT_TIMEOUT_MS
  let ready = false
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('verify-slider') || url.includes('safe/verify')) {
      log('⛔ 检测到滑块验证页 —— 请在浏览器窗口里手动完成滑块')
    } else if (/\/web\/user\//.test(url)) {
      log('⏳ 在登录页 —— 请在窗口里登录 BOSS（探针会继续等）')
    } else {
      const rows = await page.evaluate(countInPage, { selector: INBOX_ROW_SELECTOR }).catch(() => 0)
      if (rows > 0) {
        ready = true
        log(`✔ 会话列表就位：${String(rows)} 行`)
        break
      }
    }
    await page.waitForTimeout(3_000)
  }
  if (!ready) {
    log('✘ 等待登录/会话列表超时 —— 夹具未采集。profile 已保留，登录后重跑即可。')
    await context.close()
    process.exitCode = 1
    return
  }

  await page.waitForTimeout(4_000)
  mkdirSync(FIXTURE_DIR, { recursive: true })

  // ── 2. 会话列表：夹具 + 选择器报告 + 行样本 ─────────────────────────
  const chatListHtml = await page.content()
  writeFileSync(FIXTURE_CHAT_LIST, chatListHtml, 'utf8')
  report['chatList'] = {
    scan: await page.evaluate(scanSelectorsInPage, {
      groups: { inbox: INBOX_SELECTOR_CANDIDATES, chat: CHAT_SELECTOR_CANDIDATES, resume: RESUME_SELECTOR_CANDIDATES },
    }),
    rows: await page.evaluate(scanInboxRowsInPage, { row: INBOX_ROW_SELECTOR, limit: 8 }),
  }
  log(`会话列表夹具已保存：${FIXTURE_CHAT_LIST}（${String(chatListHtml.length)} 字符）`)
  log(`会话列表选择器命中：${JSON.stringify((report['chatList'] as { scan: unknown }).scan)}`)

  // ── 3. 打开第一条会话 → 会话输入区夹具与报告 ────────────────────────
  const opened = await page.evaluate(clickFirstInPage, { selector: INBOX_ROW_SELECTOR })
  log(opened ? '已点击第一条会话…' : '⚠️ 点第一条会话失败（选择器可能已变）')
  await page.waitForTimeout(5_000)
  report['conversation'] = {
    scan: await page.evaluate(scanSelectorsInPage, {
      groups: { chat: CHAT_SELECTOR_CANDIDATES, resume: RESUME_SELECTOR_CANDIDATES },
    }),
    detail: await page.evaluate(scanConversationDetailInPage, {
      chatInput: CHAT_SELECTOR_CANDIDATES.chatInput?.[0] ?? '',
    }),
  }
  const conversationHtml = await page.content()
  writeFileSync(FIXTURE_CHAT_CONV, conversationHtml, 'utf8')
  log(`会话详情夹具已保存：${FIXTURE_CHAT_CONV}（${String(conversationHtml.length)} 字符）`)

  // ── 4. 简历弹窗探测（默认关闭；开了也绝不点确认）────────────────────
  if (PROBE_RESUME) {
    const clicked = await page.evaluate(clickFirstInPage, {
      selector: RESUME_SELECTOR_CANDIDATES.resumeButton?.[0] ?? '',
      textIncludes: '简历',
    })
    log(clicked ? '已点「发简历」入口，等弹窗…（不会点确认）' : '⚠️ 没找到「发简历」入口')
    await page.waitForTimeout(3_000)
    report['resumeDialog'] = await page.evaluate(scanSelectorsInPage, {
      groups: { resume: RESUME_SELECTOR_CANDIDATES },
    })
    // 关掉弹窗：Esc；**不点确认**
    await page.keyboard.press('Escape').catch(() => undefined)
    await page.waitForTimeout(1_000)
    log(`简历弹窗探测结果：${JSON.stringify(report['resumeDialog'])}`)
  } else {
    report['resumeDialog'] = {
      skipped: '默认不打开简历弹窗（ZHIPIN_PROBE_RESUME=1 才开）。工具条文案见 conversation.detail.toolbarTexts。',
    }
  }

  // ── 5. 岗位详情页：夹具 + 选择器 + 沟通入口候选 ──────────────────────
  let detailUrl = process.env['ZHIPIN_DETAIL_URL'] ?? ''
  if (detailUrl === '') {
    log('从搜索页取第一条岗位详情链接…')
    try {
      await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForSelector('.job-card-wrap', { timeout: 20_000 }).catch(() => undefined)
      await page.waitForTimeout(4_000)
      detailUrl = await page.evaluate(() => {
        const link = document.querySelector("a[href*='/job_detail/']")
        return link === null ? '' : link.getAttribute('href') ?? ''
      })
    } catch (error) {
      log(`搜索页取链接失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (detailUrl !== '') {
    const target = detailUrl.startsWith('http') ? detailUrl : `https://www.zhipin.com${detailUrl}`
    log(`打开岗位详情页：${target.slice(0, 120)}`)
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(5_000)
      const detailHtml = await page.content()
      writeFileSync(FIXTURE_DETAIL, detailHtml, 'utf8')
      report['detail'] = await page.evaluate(scanDetailInPage, {
        groups: DETAIL_SELECTOR_CANDIDATES,
        chatEntry: CHAT_ENTRY_CANDIDATES,
      })
      log(`详情页夹具已保存：${FIXTURE_DETAIL}（${String(detailHtml.length)} 字符）`)
      log(`详情页选择器：${JSON.stringify((report['detail'] as { detail?: unknown }).detail)}`)
      log(`沟通入口候选：${JSON.stringify((report['detail'] as { chatEntry?: unknown }).chatEntry)}`)
    } catch (error) {
      log(`详情页采集失败：${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    log('⚠️ 没拿到岗位详情链接 —— 详情页未采集（可设 ZHIPIN_DETAIL_URL 直接指定）')
  }

  writeFileSync(FIXTURE_REPORT, JSON.stringify(report, null, 2), 'utf8')
  log(`报告已保存：${FIXTURE_REPORT}`)
  log('✔ 采集完成 —— 接下来按这份报告核对 adapters/zhipin.ts 的 chat/inbox/detail 选择器。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
