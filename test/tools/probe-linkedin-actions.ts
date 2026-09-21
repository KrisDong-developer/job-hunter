#!/usr/bin/env node
/**
 * LinkedIn 动作契约探针 —— 采集登录态下「投递入口 / Messaging 收件箱 / 我的申请」的
 * 真实 DOM，为 `actions`（readInbox / detectStage 等）补真机证据。
 *
 * ## 为什么需要它（对照 zhipin 的调研深度）
 *
 * LinkedIn 适配器的 `actions` 至今 fail-closed，缺的不是代码而是**契约证据**：
 * 游客版详情页点「申请」只弹注册登录模态（`contextual-sign-in-modal`，已从 v2 快照证实），
 * 真实的 Easy Apply 入口、Messaging 收件箱、「已申请」状态都只在**登录态**出现。
 * 本探针把这三块 DOM 抓下来（zhipin 的 `probe:zhipin-chat` 同款路线）。
 *
 * ## 采集目标
 *
 *   1. **登录态详情页**：Easy Apply / 站外申请按钮、保存按钮、「已申请」标记 ——
 *      `sendResume` / `detectStage` 的入口契约（**只扫不点**）；
 *   2. **Messaging 收件箱**（/messaging/）：会话列表结构（行元素、对方名、摘要、时间、
 *      未读徽章）—— `readInbox` 的契约；
 *   3. **我的申请**（/my-items/applications/）：申请卡片与状态字段 —— `detectStage` 的契约。
 *
 * ## 语义护栏（与 zhipin 探针同款）
 *
 *   * **全程只读**：绝不点「申请/Easy Apply」（不可逆：会真的投出简历）、
 *     绝不发消息、不保存岗位 —— 只导航 + 扫描 + 存快照；
 *   * 每页导航后判墙（authwall / checkpoint 记录进报告）；
 *   * 页面间隔 6s（LinkedIn 风控纪律，别调小）；
 *   * 崩溃路径也关浏览器（孤儿 Chrome 会占住 profile，本仓探针踩过）。
 *
 * ## 用法
 *
 *   npm run probe:linkedin-actions
 *   $env:LINKEDIN_JOB_ID='4430405159'      # 详情页动作入口用哪个岗位（默认 v2 采过的那个）
 *   $env:LINKEDIN_WAIT_MIN='15'            # 登录等待上限（分钟，默认 12）
 *
 * ## 产物（`.probe-linkedin-capture/`）
 *
 *   actions-detail-<日期>.html        登录态详情页快照（含 Easy Apply 入口）
 *   actions-messaging-<日期>.html     Messaging 收件箱快照
 *   actions-myitems-<日期>.html       「我的申请」快照
 *   actions-report-<日期>.json        逐选择器命中数 + 样本文本（分析的正身）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { DEFAULT_LINKEDIN_CONFIG } from '../../src/host/platform/adapters/linkedin/config.js'

/** 与 `probe:linkedin-login` 共用同一份 profile（人工登录一次，多个探针复用）。 */
const PROFILE = process.env['LINKEDIN_PROFILE'] ?? join(process.cwd(), '.probe-linkedin-profile')
const CAPTURE_DIR = process.env['LINKEDIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-linkedin-capture')
const JOB_ID = process.env['LINKEDIN_JOB_ID'] ?? '4430405159'
/** 「搜索页面板」路用的搜索条件（与其它 linkedin 探针同一组默认值）。 */
const KEYWORD = process.env['LINKEDIN_KEY'] ?? 'Software Engineer'
const CITY = process.env['LINKEDIN_CITY'] ?? 'China'
const TODAY = new Date().toISOString().slice(0, 10)
const HOST = DEFAULT_LINKEDIN_CONFIG.host

const WAIT_TIMEOUT_MS = Math.max(1, Number(process.env['LINKEDIN_WAIT_MIN'] ?? '12')) * 60 * 1000
const POLL_MS = 3_000
const GAP_MS = 6_000

const INFO: string[] = []
const DETAIL_URL = `https://${HOST}/jobs/view/${JOB_ID}`
const MESSAGING_URL = `https://${HOST}/messaging/`
const MY_ITEMS_URL = `https://${HOST}/my-items/applications/`

/**
 * 动作契约的候选选择器（扫描命中数 + 样本文本，人工挑判据 —— 与 lagou-login 的
 * 按钮契约扫描、zhipin-chat 的逐选择器报告同一套路）。**只扫不点。**
 */
const APPLY_CANDIDATES = [
  // Easy Apply（站内投递）——登录态才出现的形态
  '.jobs-apply-button',
  'button[data-tracking-control-name*="jobs-apply"]',
  '.jobs-apply-button--offsite',
  '.jobs-apply-button--applied',
  // 游客版顶栏申请（点了只弹登录模态 —— 作为「游客态 vs 登录态」的对照锚点）
  '#topbar-apply',
]
const SAVE_CANDIDATES = [
  '.jobs-save-button',
  'button[data-tracking-control-name*="job-details-save"]',
  '.job-details-jobs-unified-top-card__save-button',
]
const APPLIED_STATE_CANDIDATES = [
  '.jobs-apply-button--applied',
  '.job-details-jobs-unified-top-card__applied-state',
]
const MESSAGING_CANDIDATES = [
  '.msg-conversation-card',
  'li[data-control-name^="conversation"]',
  '.msg-conversation-list__card',
  'a[href*="/messaging/thread/"]',
  '.msg-conversation-card__participant-names',
  '.msg-conversation-card__message-snippet-body',
  '.msg-conversation-card__time-badge',
  '.msg-conversation-card__is-unread',
  '.notification-badge',
]
const MY_ITEMS_CANDIDATES = [
  '.jobs-applied-job-list__list-item',
  '.jobs-my-items-list-item',
  '[data-control-name*="applied"]',
  '.jobs-my-items-section',
]

function log(message: string): void {
  console.log(`[probe-linkedin-actions] ${new Date().toISOString()} ${message}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 崩溃路径也要关浏览器 —— 否则孤儿 Chrome 占住 profile，下次启动秒退（本仓探针踩过）。 */
let activeContext: BrowserContext | undefined

/** 扫候选选择器（自包含，序列化进浏览器）：命中数 + 首个样本文本。 */
const scanMarkers = (arg: { candidates: string[] }): Array<{ selector: string; count: number; sample: string }> => {
  const out: Array<{ selector: string; count: number; sample: string }> = []
  for (const selector of arg.candidates) {
    let nodes: Element[] = []
    try {
      nodes = Array.from(document.querySelectorAll(selector))
    } catch {
      nodes = []
    }
    if (nodes.length === 0) continue
    const first = (nodes[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()
    out.push({ selector, count: nodes.length, sample: first.slice(0, 50) })
  }
  return out
}

/** 页面文本里找「已申请 / Applied」一类状态词（detectStage 的文案侧证据）。 */
const scanAppliedTexts = (arg: { words: string[] }): string[] => {
  const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ')
  return arg.words.filter((word) => text.includes(word))
}

/**
 * 导航 + 判墙 + 扫描一页（返回 null 表示被墙，报告里如实记录）。
 *
 * `waitOn`：等**渲染信号**而不是固定 sleep —— 登录态页面是 BIGPIPE 流式渲染，
 * 上一轮（2026-09-21 第一次跑）固定等 9s 没等出 Easy Apply 按钮（详情页只剩 JS 引导壳），
 * 这一轮起用 waitForSelector 等动作区出现（30s，等不到也照存快照 —— 如实记录「未渲染」）。
 */
async function scanPage(
  page: Page,
  url: string,
  label: string,
  saveName: string,
  groups: Array<{ group: string; candidates: string[] }>,
  textWords: string[] = [],
  waitOn = '',
): Promise<Record<string, Array<{ selector: string; count: number; sample: string }>> | null> {
  log(`导航 ${label}：${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: unknown) => {
    log(`${label} 导航失败：${error instanceof Error ? error.message : String(error)}`)
  })
  if (waitOn !== '') {
    try {
      await page.waitForSelector(waitOn, { timeout: 30_000 })
      log(`${label}：等到了渲染信号（${waitOn.slice(0, 60)}）`)
    } catch {
      log(`⚠️ ${label}：30s 未等到渲染信号（${waitOn.slice(0, 60)}）—— 照存快照，如实记录`)
    }
  } else {
    await page.waitForTimeout(6_000)
  }
  const finalUrl = page.url()
  if (finalUrl.includes('/authwall') || finalUrl.includes('/checkpoint') || finalUrl.includes('/login')) {
    INFO.push(`${label}：⛔ 被墙（落点 ${finalUrl.slice(0, 90)}）—— 该页证据缺失，报告如实记录`)
    return null
  }
  const html = await page.content()
  writeFileSync(join(CAPTURE_DIR, `${saveName}-${TODAY}.html`), html, 'utf8')
  log(`${label} 快照已保存（${String(html.length)} 字符）`)

  const result: Record<string, Array<{ selector: string; count: number; sample: string }>> = {}
  for (const { group, candidates } of groups) {
    const hits = await page.evaluate(scanMarkers, { candidates }).catch(() => [])
    result[group] = hits
    INFO.push(
      `${label}[${group}]：${hits.map((hit) => `${hit.selector}=${String(hit.count)}`).join(' ') || '(一个候选都没命中)'}`,
    )
  }
  if (textWords.length > 0) {
    const words = await page.evaluate(scanAppliedTexts, { words: textWords }).catch(() => [] as string[])
    INFO.push(`${label}[状态文案]：${words.join(' | ') || '(无)'}`)
  }
  return result
}

async function main(): Promise<void> {
  log(`profile：${PROFILE} · 详情岗位 id：${JOB_ID} · 等待上限 ${String(Math.round(WAIT_TIMEOUT_MS / 60_000))} 分钟`)

  const executablePath = discoverExecutable(candidateExecutables())
  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath === undefined ? {} : { executablePath }),
  })
  activeContext = context
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
  const page: Page = await context.newPage()

  // ── 1. 登录（复用 profile；未登录则导航登录页，窗口里人工完成） ──────────
  await page
    .goto(`https://${HOST}/jobs/`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    .catch(() => undefined)
  await page.waitForTimeout(6_000)
  let loggedIn = await page
    .evaluate(
      (selector: string) => {
        try {
          return document.querySelector(selector) !== null
        } catch {
          return false
        }
      },
      DEFAULT_LINKEDIN_CONFIG.loggedInSelector,
    )
    .catch(() => false)

  if (!loggedIn) {
    log('未登录 —— 导航到登录页，请在窗口里手动登录（账密 / 邮箱验证码 / checkpoint 验证）…')
    await page.goto(`https://${HOST}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(5_000)
    const deadline = Date.now() + WAIT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const url = page.url()
      const state = await page
        .evaluate(
          (selector: string) => {
            try {
              return document.querySelector(selector) !== null
            } catch {
              return false
            }
          },
          DEFAULT_LINKEDIN_CONFIG.loggedInSelector,
        )
        .catch(() => false)
      // 第二信号：登录成功后 LinkedIn 会跳 feed。⚠️ 真机两种形态都见过：
      // `/feed/`（带尾斜杠）与 `/feed`（不带）—— 判据必须两者都收（第一轮探针
      // 就是被不带斜杠的形态卡住空等了 12 分钟）。
      if (state || /\/feed\/?$/.test(url)) {
        loggedIn = true
        log('✔ 已登录')
        break
      }
      const remainSec = Math.round((deadline - Date.now()) / 1000)
      log(`⏳ 等登录 · 还剩 ${String(remainSec)}s · ${url.slice(0, 90)}`)
      await page.waitForTimeout(POLL_MS)
    }
    if (!loggedIn) {
      log('⚠️ 等满仍未登录 ⇒ 没有登录态就没有动作契约，本次不采（宁可缺证据，也不采游客态冒充）')
      process.exitCode = 1
      await context.close()
      activeContext = undefined
      return
    }
  } else {
    log('✔ profile 已带登录态')
  }

  mkdirSync(CAPTURE_DIR, { recursive: true })
  await sleep(GAP_MS)

  // ── 2. 登录态详情页：投递入口 / 保存 / 已申请标记（只扫不点） ────────────
  // 等渲染信号：动作区（Easy Apply 按钮或顶栏申请）出现才扫 —— BIGPIPE 上一轮
  // 固定 9s 只等到 JS 壳，这一轮等 30s。
  const detailResult = await scanPage(
    page,
    DETAIL_URL,
    '详情页',
    'actions-detail',
    [
      { group: 'apply', candidates: APPLY_CANDIDATES },
      { group: 'save', candidates: SAVE_CANDIDATES },
      { group: 'appliedState', candidates: APPLIED_STATE_CANDIDATES },
    ],
    ['已申请', '已递交', 'Applied', 'Easy Apply', '立即申请'],
    '.jobs-apply-button, .jobs-unified-top-card, .job-details-jobs-unified-top-card, #topbar-apply, h1',
  )
  await sleep(GAP_MS)

  // ── 2.5 登录态搜索页 + currentJobId 详情面板（2026-09-21 第三轮新增） ────
  //
  // 为什么加这一路：直连 /jobs/view/{id} 两轮都不渲染（JS 壳），但 LinkedIn 现行
  // 求职 UI 的动作入口在**搜索页右侧详情面板**（?currentJobId= 打开对应岗位）——
  // Easy Apply 按钮与**薪资**（「薪资无源」结论的翻案机会）都在那里。
  // 等渲染信号 40s（比详情页更宽松 —— 搜索页本身要先渲染列表再拉面板）。
  const searchPanelUrl = `https://${HOST}/jobs/search/?keywords=${encodeURIComponent(KEYWORD)}&location=${encodeURIComponent(CITY)}&currentJobId=${JOB_ID}`
  const panelResult = await scanPage(
    page,
    searchPanelUrl,
    '搜索页面板',
    'actions-search-panel',
    [
      { group: 'apply', candidates: APPLY_CANDIDATES },
      { group: 'save', candidates: SAVE_CANDIDATES },
      // 登录态详情面板的薪资候选（jobs-unified 一族）
      {
        group: 'panelFields',
        candidates: [
          '.jobs-unified-top-card__salary',
          '.jobs-unified-top-card__bullet',
          '.job-details-jobs-unified-top-card__job-insight',
          '.jobs-unified-top-card__primary-description',
          '.jobs-details',
          '.jobs-search-two-pane__detail-panel',
        ],
      },
    ],
    ['已申请', 'Applied', 'Easy Apply', '立即申请', '申请'],
    '.jobs-apply-button, .jobs-unified-top-card, .jobs-details, .jobs-search-two-pane__detail-panel, .jobs-search-results-list',
  )
  await sleep(GAP_MS)

  // ── 3. Messaging 收件箱（readInbox 契约） ─────────────────────────────
  const messagingResult = await scanPage(
    page,
    MESSAGING_URL,
    'Messaging',
    'actions-messaging',
    [{ group: 'conversations', candidates: MESSAGING_CANDIDATES }],
    [],
    'ul.msg-conversations-container__conversations-list',
  )
  await sleep(GAP_MS)

  // ── 4. 我的申请（detectStage 契约；空态也算证据） ──────────────────────
  const myItemsResult = await scanPage(
    page,
    MY_ITEMS_URL,
    '我的申请',
    'actions-myitems',
    [{ group: 'applications', candidates: MY_ITEMS_CANDIDATES }],
    ['已申请', '已查看', '已关闭', 'Applied', 'Viewed'],
    '.jobs-my-items-section, .artdeco-empty-state',
  )

  // ── 5. 报告 ────────────────────────────────────────────────────────────
  const report = {
    updatedAt: new Date().toISOString(),
    jobId: JOB_ID,
    urls: { detail: DETAIL_URL, searchPanel: searchPanelUrl, messaging: MESSAGING_URL, myItems: MY_ITEMS_URL },
    detail: detailResult,
    searchPanel: panelResult,
    messaging: messagingResult,
    myItems: myItemsResult,
    info: INFO,
    nextStep:
      '若「搜索页面板」路拿到了 jobs-unified 一族锚点：Easy Apply 入口候选与（若有）薪资节点 ' +
      '可写进配置注释与未来 sendResume 的入口锚点 —— 提交链路仍需真实投递一次取证，' +
      '在此之前 sendResume 保持 fail-closed。readInbox 已落地（见 adapters/linkedin/page/inbox.ts）。',
  }
  writeFileSync(join(CAPTURE_DIR, `actions-report-${TODAY}.json`), JSON.stringify(report, null, 2), 'utf8')
  log(`报告已保存：${join(CAPTURE_DIR, `actions-report-${TODAY}.json`)}`)

  console.log('\n========== 动作契约探针汇总（全程只读：未点申请 / 未发消息） ==========')
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  log('✔ 完成')

  await context.close()
  activeContext = undefined
}

void main().catch(async (error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  await activeContext?.close().catch(() => undefined)
  process.exitCode = 1
})
