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
 *   ZHIPIN_WAIT_MIN（等待手动登录/人工处理站点门槛的分钟数，默认 10；
 *     被引导页挡住时把窗口留给人操作，例如 `ZHIPIN_WAIT_MIN=25`）
 *   ZHIPIN_DETAIL_URL（指定要采的岗位详情页；不填就从搜索页取第一条）
 *   ZHIPIN_KEY / ZHIPIN_CITY_CODE（取详情页用的搜索条件，默认 Java / 深圳）
 *   ZHIPIN_PROBE_RESUME=1（打开简历选择弹窗做探测；仍然不会点确认发送）
 *   ZHIPIN_PROBE_SKIP_CHAT=1（只采岗位详情页、跳过会话页）
 *   ZHIPIN_CAPTURE_DIR（产物目录覆盖，默认 `.probe-zhipin-capture`）
 *
 * ## 两块采集互不连坐
 *
 * 会话页与详情页是**两条独立路径**，所以实现上拆成 `captureChat` + 详情段：
 *   * 会话页被站点门槛挡住时（**实测**：账号资料未完善 → BOSS 把 `/web/geek/*` 全部
 *     重定向到简历完善引导页 `/web/geek/guide`），详情页仍会照采；
 *   * 只要**会话页没采到**，退出码就是非零（哪怕详情页采到了）—— "没采全"必须可见；
 *     报告里的 `chatNotCaptured.reason` 会写清是三种里的哪一种，不会把"跑完了"伪装成"采全了"：
 *       - `inbox-empty`：会话页**打开了**但这个账号一条会话都没有（页面自报「暂无联系人」）。
 *         此时 `li[role=listitem]` 命中 0 **不是选择器腐烂** —— 空壳（筛选 tab / 空态 / 容器候选）
 *         照采，会话级选择器只能等有真实会话后再采；
 *       - `redirected-away-from-chat`：被强制重定向到资料完善引导页（人要去填）；
 *       - `login-or-list-timeout`：一直没登录（人要去登录）。
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
/**
 * 只采岗位详情页、跳过会话页。
 *
 * 用在**站点门槛挡住会话页**时：BOSS 对资料未完善的账号会把 `/web/geek/*` 全部重定向到
 * 简历完善引导页，此时会话页采不到，但详情页仍可采 —— 别让一半被挡拖死另一半。
 */
const SKIP_CHAT = process.env['ZHIPIN_PROBE_SKIP_CHAT'] === '1'
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

/**
 * 会话列表行与行内字段候选。
 *
 * ⚠️ 2026-09-18 空列表实测结论：容器是 `.chat-content .user-list`（求职者端），
 * **招聘者端**的 `.geek-item-wrap` / `.chat-message-filter-left` 在这里**全线命中 0**。
 * 但行元素本身当时看不到（账号一条会话都没有），所以 `row` 先用容器锚定的结构式写法。
 */
const INBOX_SELECTOR_CANDIDATES: Record<string, readonly string[]> = {
  listContainer: ['.chat-content .user-list', '.user-list', '.chat-list-wrap'],
  emptyState: ['.user-list .no-data', '.no-data', '.chat-no-data .no-data-text'],
  filterTabs: ['.label-list', '.chat-message-filter-left'],
  row: [
    // ✅ 2026-09-18 实测（真实会话行）：行就是 `li[role=listitem]`，在
    //    `.user-list > .user-list-content > ul[role=group]` 里 —— 注意它**不是** `.user-list` 的直接子级，
    //    "容器直接子级"那种结构式写法会漏（我先前就是这么漏掉的）。
    'li[role=listitem]',
    '.user-list-content > ul[role="group"] > li',
    '.chat-content .user-list li',
  ],
  name: ['.name-text', '.user-name', '.geek-name', '[class*="name"]'],
  nameBox: ['.name-box', '.name-contet', '[class*="name-box"]'],
  lastMessage: ['.last-msg-text', '.push-text'],
  status: ['.message-status', '[class*="message-status"]'],
  unread: ['.unread-count', '.badge-count', '.notice-badge', '.red-dot', '[class*="unread"]'],
  /** 时间节点：✅ 2026-09-18 实测存在，就是 `.time`（此前一直没着落）。 */
  time: ['.time', '.time-shadow', '.message-time'],
}

/** 适配器当前用的会话行选择器（第一个候选）。 */
const INBOX_ROW_SELECTOR = INBOX_SELECTOR_CANDIDATES['row']?.[0] ?? ''

/**
 * 会话页「外壳」候选 —— 列表为空时**唯一能采到**的东西。
 *
 * ⚠️ 2026-09-18 实测：账号一条会话都没有时，页面只显示
 * 「30天内暂无联系人 / 当前暂无消息」＋ 筛选 tab「全部 未读 新招呼 仅沟通 更多」。
 * 此时 `li[role=listitem]` 命中 0 **不代表选择器腐烂** —— 是**真的空**。
 * 这两件事必须分开记，否则以后看到 0 会误判成选择器坏了而乱改。
 */
const INBOX_SHELL_CANDIDATES: Record<string, readonly string[]> = {
  // ✅ 已实测（2026-09-18 空列表外壳）
  listContainer: ['.chat-content .user-list'],
  filterTabs: ['.label-list'],
  emptyState: ['.user-list .no-data', '.chat-no-data .no-data-text'],
  // 左栏/右栏骨架（用来确认页面确实是会话页、以及以后容器改名时能快速定位）
  chatWrap: ['.chat-wrap', '.list-warp', '.chat-user', '.chat-content'],
  conversationPane: ['.chat-conversation', '.chat-no-data'],
  // ⚠️ 招聘者端的容器（BossHunter 的取证对象）—— 留着扫是为了**持续证明它在求职者端命中 0**
  recruiterSideContainers: ['.chat-list-wrap', '.chat-message-filter-left'],
}

/** 读会话页外壳：筛选 tab 文案 + 空态文案 + 页面开头。⚠️ 必须完全自包含。 */
function scanInboxShellInPage(arg: {
  filterTabs: readonly string[]
  emptyState: readonly string[]
}): { tabTexts: string[]; emptyText: string; bodyHead: string } {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const tabTexts: string[] = []
  for (const selector of arg.filterTabs) {
    try {
      const box = document.querySelector(selector)
      if (box === null) continue
      for (const node of Array.from(box.querySelectorAll('span, a, li'))) {
        const text = norm(node.textContent).replace(/^\d+/, '')
        if (text !== '' && text.length <= 8 && !tabTexts.includes(text)) tabTexts.push(text)
      }
      if (tabTexts.length > 0) break
    } catch {
      /* ignore */
    }
  }
  let emptyText = ''
  for (const selector of arg.emptyState) {
    try {
      const node = document.querySelector(selector)
      const text = norm(node?.textContent)
      if (text !== '') {
        emptyText = text.slice(0, 160)
        break
      }
    } catch {
      /* ignore */
    }
  }
  return {
    tabTexts,
    emptyText,
    bodyHead: norm(document.body?.innerText).slice(0, 200),
  }
}

/**
 * 会话页里是否出现了「空列表」文案。
 *
 * ⚠️ 判据用**文案**而不是行数：行数 0 既可能是空、也可能是选择器腐烂或还没渲染完；
 * 只有页面自己说「暂无联系人/暂无消息」时，才能断言"这里是空的"。
 * ⚠️ 必须完全自包含。
 */
function hasEmptyInboxInPage(): boolean {
  const text = (document.body?.innerText ?? '').replace(/\s+/g, '')
  return text.includes('暂无联系人') || text.includes('暂无消息') || text.includes('暂无沟通')
}

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

/**
 * 详情页候选（**与 `adapters/zhipin.ts` 的 `detailSelectors` 保持一致** ——
 * 报告要能直接回答"适配器现在这几条还命中吗"，否则校准完就脱节了）。
 *
 * 2026-09-18 实测：`tags`(旧) 与 `companyTags`(旧) 命中 **0**，已改名为
 * `text-experiece` / `text-degree` / `.job-keyword-list li` / `.icon-*` 三行；
 * 旧的留着扫，是为了让报告持续显示"它们确实是死的"。
 */
const DETAIL_SELECTOR_CANDIDATES: Record<string, readonly string[]> = {
  title: ['.info-primary .name h1', '.name h1'],
  salary: ['.info-primary .salary', '.salary'],
  experience: ['.info-primary .text-experiece'],
  degree: ['.info-primary .text-degree'],
  keywordList: ['.job-keyword-list li'],
  jdText: ['.job-sec-text'],
  jdExclude: ['.job-detail-company'],
  companyLink: ['.sider-company .company-info a'],
  companyFacts: ['.sider-company p'],
  tagsLegacy: ['.info-primary .tag-list span'],
  companyTagsLegacy: ['.sider-company .res-industry-item', '.company-info-item'],
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
      time: norm(row.querySelector('.time')?.textContent),
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

/**
 * 采会话「操作区」：编辑器候选、工具条按钮文案、上传弹窗与 file input 的真实形态。
 *
 * 用途（2026-09-18 实测驱动）：`sendResume` 之前假设"BOSS 不能上传本地文件"，
 * 而快照里明明有 `.upload-resume-dialog` + `input[type=file]`（文案「上传附件简历」）——
 * 所以要把**触发入口**与**弹窗真实结构**采清楚，别再靠猜。
 * ⚠️ 必须完全自包含。
 */
function scanConversationToolbarInPage(arg: { editorSelector: string }): {
  editor: Array<{ selector: string; count: number; tag: string; className: string }>
  toolbarTexts: Array<{ text: string; tag: string; className: string; ka: string }>
  uploadDialog: {
    present: boolean
    className: string
    display: string
    fileInputs: Array<{ accept: string; className: string; display: string }>
  }
  bodyTail: string
} {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const editor = arg.editorSelector
    .split(',')
    .map((selector) => selector.trim())
    .filter((selector) => selector !== '')
    .map((selector) => {
      try {
        const nodes = Array.from(document.querySelectorAll(selector))
        const first = nodes[0]
        return {
          selector,
          count: nodes.length,
          tag: first === undefined ? '' : first.tagName.toLowerCase(),
          className: first === undefined ? '' : first.getAttribute('class') ?? '',
        }
      } catch {
        return { selector, count: 0, tag: '', className: '' }
      }
    })

  const toolbarTexts: Array<{ text: string; tag: string; className: string; ka: string }> = []
  try {
    for (const node of Array.from(document.querySelectorAll('[class*="operate"], [class*="toolbar"], [class*="tool"]'))) {
      const text = norm(node.textContent)
      const className = node.getAttribute('class') ?? ''
      if (text === '' || text.length > 12) continue
      if (toolbarTexts.some((item) => item.text === text && item.className === className)) continue
      toolbarTexts.push({ text, tag: node.tagName.toLowerCase(), className, ka: node.getAttribute('ka') ?? '' })
      if (toolbarTexts.length >= 40) break
    }
  } catch {
    /* ignore */
  }

  let present = false
  let className = ''
  let display = ''
  let fileInputs: Array<{ accept: string; className: string; display: string }> = []
  try {
    const dialog = document.querySelector('[class*="resume-dialog"], [class*="upload-resume"]')
    if (dialog !== null) {
      present = true
      className = dialog.getAttribute('class') ?? ''
      display = window.getComputedStyle(dialog).display
    }
  } catch {
    /* ignore */
  }
  try {
    fileInputs = Array.from(document.querySelectorAll('input[type=file]')).map((node) => ({
      accept: node.getAttribute('accept') ?? '',
      className: node.getAttribute('class') ?? '',
      display: window.getComputedStyle(node).display,
    }))
  } catch {
    fileInputs = []
  }

  return {
    editor,
    toolbarTexts,
    uploadDialog: { present, className, display, fileInputs },
    bodyTail: norm(document.body?.innerText).slice(-240),
  }
}

/** 取元素中心坐标（给"真鼠标点击"用）。⚠️ 必须完全自包含。 */
function centerOfInPage(arg: { selector: string }): { found: boolean; x: number; y: number } {
  const empty = { found: false, x: 0, y: 0 }
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selector))
  } catch {
    return empty
  }
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    } catch {
      return false
    }
  }
  const chosen = nodes.find(visible)
  if (chosen === undefined) return empty
  try {
    chosen.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* ignore */
  }
  const rect = chosen.getBoundingClientRect()
  const width = typeof window.innerWidth === 'number' ? window.innerWidth : 1024
  const height = typeof window.innerHeight === 'number' ? window.innerHeight : 768
  return {
    found: true,
    x: Math.min(Math.max(rect.x + rect.width / 2, 0), Math.max(0, width - 1)),
    y: Math.min(Math.max(rect.y + rect.height / 2, 0), Math.max(0, height - 1)),
  }
}

/** 统计某选择器的节点数（登录就绪判定用）。⚠️ 必须完全自包含。 */
function countInPage(arg: { selector: string }): number {
  try {
    return document.querySelectorAll(arg.selector).length
  } catch {
    return 0
  }
}

/**
 * 采会话页（会话列表 + 会话详情 + 简历弹窗探测）。
 *
 * 单独成函数是因为**站点门槛只挡其中一半**：BOSS 对资料未完善的账号会把
 * `/web/geek/*` 全部重定向到简历完善引导页（实测 `/web/geek/guide`），
 * 会话页进不去 —— 但岗位详情页（`/job_detail/...`）另在一条路径上，仍可采。
 * 两块互不连坐，才不会"会话页被挡 → 详情页也白跑一趟"。
 *
 * @returns 是否采到会话列表（false = 被登录/门槛挡住，调用方据此收尾）
 */
async function captureChat(page: Page, report: Record<string, unknown>): Promise<boolean> {
  // ── 1. 会话页 + 登录等待 ─────────────────────────────────────────────
  log('打开会话页…')
  try {
    await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(4_000)

  const deadline = Date.now() + WAIT_TIMEOUT_MS
  /** 当前会话行数（0 = 还没采到列表，见下面的三种"没采全"原因）。 */
  let rows = 0
  let shellCaptured = false
  let emptySeen = false
  /**
   * 心跳：BOSS 未登录时**不一定会跳到 `/web/user/`** —— 也可能原地渲染登录弹层，
   * 于是"URL 既不是登录页、会话行又是 0"这种状态会静默轮询到超时（实测踩到）。
   * 每 15 秒把 URL 与页面开头打出来，人才知道该不该去窗口里登录。
   */
  let lastHintAt = 0
  /**
   * 登录后被"弹到别的 `/web/geek/*` 页"的应对。
   *
   * 两种情形都发生在这里：① 登录成功后被带去新手引导 `/web/geek/guide`；
   * ② 账号**资料/简历未完善**时，BOSS 会把会话页**强制重定向**到引导页。
   * ② 需要**人在窗口里动手**，不是探针能解决的 —— 所以这里**不早退**（早退会把窗口关掉，
   * 人就来不及填了），而是：窗口一直留着 + 每 `retryMs` 重试一次会话页 +
   * 每 15 秒提示一次"该去窗口里做什么"；一旦填完，下一次重试就会成功并**自动继续采集**。
   * 只有等到等待窗口耗尽（`ZHIPIN_WAIT_MIN`）才放弃。
   */
  const retryMs = 30_000
  let lastRetryAt = 0
  let awayUrl = ''

  /**
   * 采会话页快照 + 选择器报告。**空列表也采** —— 空壳里的筛选 tab 与列表容器
   * 是"列表为空时唯一能拿到的证据"，而且能把"真的空"和"选择器腐烂"分开。
   */
  const captureChatShell = async (note: string): Promise<void> => {
    const html = await page.content()
    writeFileSync(CAPTURE_CHAT_LIST, html, 'utf8')
    report['chatList'] = {
      captureNote: note,
      rows,
      scan: await page.evaluate(scanSelectorsInPage, {
        groups: { inbox: INBOX_SELECTOR_CANDIDATES, chat: CHAT_SELECTOR_CANDIDATES, resume: RESUME_SELECTOR_CANDIDATES },
      }),
      rowSamples: await page.evaluate(scanInboxRowsInPage, { row: INBOX_ROW_SELECTOR, limit: 8 }),
      shellSelectors: await page.evaluate(scanSelectorsInPage, { groups: { shell: INBOX_SHELL_CANDIDATES } }),
      shell: await page.evaluate(scanInboxShellInPage, {
        filterTabs: INBOX_SHELL_CANDIDATES['filterTabs'] ?? [],
        emptyState: INBOX_SHELL_CANDIDATES['emptyState'] ?? [],
      }),
    }
    log(`会话页快照已保存：${CAPTURE_CHAT_LIST}（${String(html.length)} 字符 · ${note}）`)
  }

  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('verify-slider') || url.includes('safe/verify')) {
      log('⛔ 检测到滑块验证页 —— 请在浏览器窗口里手动完成滑块（探针会继续等）')
    } else if (/\/web\/user\//.test(url)) {
      log('⏳ 在登录页 —— 请在窗口里登录 BOSS（探针会继续等）')
    } else if (/\/web\/geek\//.test(url) && !url.startsWith(CHAT_URL)) {
      awayUrl = url
      const now = Date.now()
      if (now - lastRetryAt >= retryMs) {
        lastRetryAt = now
        log(`↩ 当前不在会话页（${url.slice(0, 90)}）—— 主动导航回会话页再试一次`)
        await page.goto(CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
        await page.waitForTimeout(5_000)
        continue
      }
      if (now - lastHintAt > 15_000) {
        lastHintAt = now
        log(
          `⏳ 会话页被 ${url.slice(0, 80)} 挡着 —— 请在浏览器窗口里**把它填完**（通常是简历/资料完善引导）。` +
            '我每 30 秒重试一次，填完会自动继续采集；否则等到等待窗口耗尽就放弃。',
        )
      }
    } else {
      rows = await page.evaluate(countInPage, { selector: INBOX_ROW_SELECTOR }).catch(() => 0)
      if (!shellCaptured) {
        shellCaptured = true
        await captureChatShell(rows > 0 ? `含 ${String(rows)} 条会话行` : '列表为空/尚未渲染，先存外壳')
      }
      if (rows > 0) {
        await captureChatShell(`含 ${String(rows)} 条会话行`)
        log(`✔ 会话列表就位：${String(rows)} 行`)
        break
      }
      const empty = await page.evaluate(hasEmptyInboxInPage).catch(() => false)
      if (empty) emptySeen = true
      if (Date.now() - lastHintAt > 15_000) {
        lastHintAt = Date.now()
        const head = await page
          .evaluate(() => (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 140))
          .catch(() => '')
        log(
          empty
            ? '⏳ 会话页是**空的**（页面自报「暂无联系人/暂无消息」）—— 这个账号还没和任何 HR 聊过。' +
              '请在窗口里对任意岗位点一次「立即沟通」建立一条会话，我会自动接着采会话详情；' +
              '否则 `#chat-input` / 消息列表 / 发简历弹窗这几项采不到。'
            : `⏳ 在会话页但还没有会话行（URL ${url.slice(0, 90)} · 页面开头「${head}」）—— 若停在登录弹层请在窗口里登录。`,
        )
      }
    }
    await page.waitForTimeout(3_000)
  }

  if (rows === 0) {
    // ⚠️ 三种"没采全"必须分开记 —— 它们要做的事完全不同：
    //   空列表 → 去建立一条会话；被重定向 → 去填资料；超时 → 去登录。
    const reason =
      awayUrl !== '' ? 'redirected-away-from-chat' : emptySeen ? 'inbox-empty' : 'login-or-list-timeout'
    report['chatNotCaptured'] = {
      reason,
      rows,
      ...(awayUrl === '' ? {} : { redirectedTo: awayUrl }),
      ...(shellCaptured ? { shellCaptured: true } : {}),
    }
    log(
      reason === 'inbox-empty'
        ? '✘ 会话列表为空：会话页外壳（筛选 tab / 空态 / 容器候选）已采，' +
            '但**会话级选择器采不到** —— 至少需要一条真实会话。见报告 chatNotCaptured。'
        : reason === 'redirected-away-from-chat'
          ? `✘ 一直停在 ${awayUrl.slice(0, 90)}，会话页打不开（多半是资料未完善被强制重定向）。`
          : '✘ 等待登录超时 —— 会话页快照未采集。profile 已保留，登录后重跑即可。',
    )
    return false
  }
  await page.waitForTimeout(4_000)

  // ── 3. 打开第一条会话 → 会话输入区快照与报告 ────────────────────────
  //
  // ⚠️ 必须用**真鼠标点击**（CDP 级 `page.mouse.click`）。先前用 DOM `el.click()` 时
  // Vue 的点击处理器没被触发 → 右栏一直是空态，`#chat-input` / `.chat-record` / 工具条
  // 全部命中 0，白白以为"这些选择器都不对"（2026-09-18 实测踩到）。
  const rowCenter = await page.evaluate(centerOfInPage, { selector: INBOX_ROW_SELECTOR })
  if (rowCenter.found) {
    await page.mouse.click(rowCenter.x, rowCenter.y)
    log(`已用真鼠标点击第一条会话（${String(Math.round(rowCenter.x))},${String(Math.round(rowCenter.y))}）…`)
  } else {
    log('⚠️ 找不到可见的会话行（选择器可能已变）')
  }
  // 等右栏渲染出编辑器/消息列表，再快照 —— 否则拍到的是空态
  const editorSelector =
    '#chat-input, #boss-chat-editor-input, .chat-record, [contenteditable="true"], .conversation-editor'
  let editorSeen = false
  for (let attempt = 0; attempt < 20 && !editorSeen; attempt += 1) {
    await page.waitForTimeout(1_000)
    editorSeen = (await page.evaluate(countInPage, { selector: editorSelector }).catch(() => 0)) > 0
  }
  log(editorSeen ? '✔ 会话输入区已渲染' : '⚠️ 等 20 秒仍没等到会话输入区（右栏可能没打开）')
  report['conversation'] = {
    editorSeen,
    scan: await page.evaluate(scanSelectorsInPage, {
      groups: { chat: CHAT_SELECTOR_CANDIDATES, resume: RESUME_SELECTOR_CANDIDATES },
    }),
    detail: await page.evaluate(scanConversationDetailInPage, {
      chatInput: CHAT_SELECTOR_CANDIDATES.chatInput?.[0] ?? '',
    }),
    // 工具条/上传入口的真实文案与结构（`sendResume` 要用它）
    toolbar: await page.evaluate(scanConversationToolbarInPage, {
      editorSelector,
    }),
  }
  const conversationHtml = await page.content()
  writeFileSync(CAPTURE_CHAT_CONV, conversationHtml, 'utf8')
  log(`会话详情快照已保存：${CAPTURE_CHAT_CONV}（${String(conversationHtml.length)} 字符）`)
  log(`工具条文案：${JSON.stringify((report['conversation'] as { toolbar: unknown }).toolbar)}`)

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
  return true
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

  // ── 1~4. 会话页采集（会话列表 / 会话详情 / 简历弹窗探测）──────────────
  //
  // ⚠️ 与详情页**互不连坐**：BOSS 对资料未完善的账号会把 `/web/geek/*` 全重定向到
  // 简历完善引导页，会话页进不去 —— 但岗位详情页在另一条路径上，仍应采到。
  mkdirSync(CAPTURE_DIR, { recursive: true })
  let chatOk = true
  if (SKIP_CHAT) {
    log('⏭ 跳过会话页采集（ZHIPIN_PROBE_SKIP_CHAT=1）—— 只采岗位详情页')
    report['chatBlocked'] = { reason: 'skipped-by-env' }
  } else {
    chatOk = await captureChat(page, report)
  }

  // ── 5. 岗位详情页：快照 + 选择器 + 沟通入口候选 ──────────────────────
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
      writeFileSync(CAPTURE_DETAIL, detailHtml, 'utf8')
      report['detail'] = await page.evaluate(scanDetailInPage, {
        groups: DETAIL_SELECTOR_CANDIDATES,
        chatEntry: CHAT_ENTRY_CANDIDATES,
      })
      log(`详情页快照已保存：${CAPTURE_DETAIL}（${String(detailHtml.length)} 字符）`)
      log(`详情页选择器：${JSON.stringify((report['detail'] as { detail?: unknown }).detail)}`)
      log(`沟通入口候选：${JSON.stringify((report['detail'] as { chatEntry?: unknown }).chatEntry)}`)
    } catch (error) {
      log(`详情页采集失败：${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    log('⚠️ 没拿到岗位详情链接 —— 详情页未采集（可设 ZHIPIN_DETAIL_URL 直接指定）')
  }

  writeFileSync(CAPTURE_REPORT, JSON.stringify(report, null, 2), 'utf8')
  log(`报告已保存：${CAPTURE_REPORT}`)
  if (!chatOk) {
    // 会话页没采到就是**没采到**：退出码非零，别让"跑完了"看起来像"采全了"
    log(
      '⚠️ 本次**会话页未采集**（原因见报告里的 chatNotCaptured）—— 详情页部分仍然可用；' +
        '会话页那几项选择器仍缺实测证据。',
    )
  }
  log('✔ 采集完成 —— 接下来按这份报告核对 adapters/zhipin.ts 的 chat/inbox/detail 选择器。')
  await context.close()
  if (!chatOk) process.exitCode = 1
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
