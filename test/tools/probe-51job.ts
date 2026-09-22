#!/usr/bin/env node
/**
 * 前程无忧（51job）探针 —— 真机复核「选择器没腐烂」+ 落盘带日期的页面快照。
 *
 * ## 为什么需要它
 *
 * 51job 是唯一 `stable` 且**解析全靠 DOM**（`.joblist-item` 卡片 + `sensorsname="JobShortExposure"`
 * 跟踪载荷）的平台 —— 它的字段（jobId / 发布时间 / 经验 / 学历）**只能**从跟踪载荷的
 * `sensorsdata` 属性里取，而那是埋点属性：站点换一次埋点，`platformJobId` 与 `sourceUrl`
 * 会一起变空，而**卡片容器还在、四项核心字段里只有后三项悄悄空掉**
 * （`test/platform/fiftyone.test.ts` 那条"卡片容器没坏 → 仍看到 20 张卡"的用例说的就是它）。
 *
 * 本探针把适配器**驱动到真实页面上**跑一遍（`readListPage` / `detectBlock` / `hasNextPage` /
 * `detail.extract` 都是生产代码本身），给出逐字段命中率读数，并把这一天的页面落盘 ——
 * 选择器哪天腐烂，把 `npm run probe:51job` 的输出与上一天的快照一比就知道。
 *
 * ## 2026-09-21 重构：从「只测列表」升级为「全链路采证 + 锚点命中表」
 *
 * 旧版只会 goto 搜索深链 → 读列表，撞 WAF 滑块就 20s 超时了事。这次按真机走查
 * （www.51job.com → 搜索 → jobs.51job.com 详情，中途实测撞上阿里云滑块）补齐四块：
 *
 *   1. **滑块/登录的人工等待**（`FIFTYONE_WAIT_MIN`，默认 3 分钟）：判到 captcha /
 *      登录墙就轮询等人工处理，不再傻等超时 —— 与 `probe:zhipin-chat` 的
 *      `ZHIPIN_WAIT_MIN` 同款机制；
 *   2. **详情页采集**（默认开，`FIFTYONE_SKIP_DETAIL=1` 关）：取第一条岗位的
 *      `sourceUrl`（即跟踪载荷拼出的 `jobs.51job.com/all/<id>.html`）导航过去，
 *      采 `detail-<日期>.html`，跑生产代码 `detail.extract`，并打印
 *      **detailSelectors 候选逐条命中表** —— 校准 = 照着表写 DB 覆盖；
 *   3. **消息中心采集**（`FIFTYONE_LOGIN=1` 开）：真机实测消息入口不在页头，在
 *      「我的51job」（`we.51job.com/pc/my/myjob`）。探针先等人工登录，再从 myjob
 *      收割「消息/沟通/im」链接 → 进消息页采 `msgcenter-<日期>.html` + 打印
 *      **inboxSelectors 候选命中表**（校准 `chatUrl` / 收件箱选择器）；
 *   4. **登录锚点 + 排序栏实况**：打印 `loginSelectors.loggedIn` 候选在真机上的
 *      命中数（已登录侧此前从未实测），记录排序栏当前文案（2026-09-21 真机已见
 *      「距离优先」出现在栏里 —— 与 2026-09 探针"未启用"的结论有出入，待复核实值）。
 *
 * ## 用法
 *
 *   npm run probe:51job                                    # 关键词 Java / 城市 深圳
 *   $env:FIFTYONE_KEY='前端'; npm run probe:51job
 *   $env:FIFTYONE_CITY='北京'; npm run probe:51job
 *   $env:FIFTYONE_LOGIN='1'; npm run probe:51job           # 顺带采消息中心（窗口里登录一次）
 *   $env:FIFTYONE_WAIT_MIN='10'; npm run probe:51job       # 给滑块/登录更长的等待窗口（分钟）
 *   $env:FIFTYONE_SKIP_DETAIL='1'; npm run probe:51job     # 只测列表
 *   $env:FIFTYONE_OFFLINE='1'; npm run probe:51job         # 只离线复跑上一次的快照，不访问真实站点
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-51job-capture/search-<日期>.html         列表页快照
 *   .probe-51job-capture/search-api-<日期>.json     搜索接口请求采样（sortType / issueDate 的证据）
 *   .probe-51job-capture/detail-<日期>.html         详情页快照（2026-09-21 起）
 *   .probe-51job-capture/detail-url-<日期>.txt      对应详情页地址（离线复跑要靠它还原 location）
 *   .probe-51job-capture/msgcenter-<日期>.html      消息中心快照（FIFTYONE_LOGIN=1 时）
 *
 * ⚠️ **刻意不覆盖 `test/fixtures/51job-sz.html`**：它是被 `fiftyone.test.ts` 与
 *    `npm run crawl:fixture` 钉住的夹具（首条记录标题、20 条、首条 detail id 都写死在用例里）。
 *    静默替换只会让测试红在与本次校准无关的地方。
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点。
 *    阿里云 WAF 会出滑块 —— 弹出窗口被拦时**先人工过一次**，别连打（C12）。
 *    全程只读：导航与快照，**不点「投递 / 去聊聊」，不发任何消息**。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Request } from 'patchright'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job/index.js'
import {
  DEFAULT_FIFTYONE_CONFIG,
  SORT_OPTIONS,
  type FiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job/config.js'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import type { BlockKind } from '../../src/shared/contract/enums/crawl.js'
import type { PageLike, RawJob, RawJobDetail } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const KEYWORD = process.env.FIFTYONE_KEY ?? 'Java'
const CITY = process.env.FIFTYONE_CITY ?? '深圳'
const PROFILE = process.env.FIFTYONE_PROFILE ?? join(process.cwd(), '.probe-51job-profile')
const CAPTURE_DIR = process.env.FIFTYONE_CAPTURE_DIR ?? join(process.cwd(), '.probe-51job-capture')
const OFFLINE_ONLY = process.env.FIFTYONE_OFFLINE === '1'
const SKIP_DETAIL = process.env.FIFTYONE_SKIP_DETAIL === '1'
/** 消息中心采集（要人工在窗口里登录一次）。 */
const WITH_LOGIN = process.env.FIFTYONE_LOGIN === '1'
/** 滑块/登录墙的人工等待窗口（分钟）。 */
const WAIT_MINUTES = Number.parseInt(process.env.FIFTYONE_WAIT_MIN ?? '3', 10)
const TODAY = new Date().toISOString().slice(0, 10)
/** 搜索接口标记（URL 参数映射的实测来源，见适配器 `SORT_OPTIONS` 注释）。 */
const SEARCH_API_MARKER = '/api/job/search-pc'
/** 真机实测（2026-09-21）：消息入口不在页头，在「我的51job」。 */
const MYJOB_URL = 'https://we.51job.com/pc/my/myjob'
const CONFIG: FiftyOneConfig = DEFAULT_FIFTYONE_CONFIG

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-51job] ${new Date().toISOString()} ${message}`)
}

/**
 * 把 patchright 的 `Page` 接成采集层的 `PageLike`。
 *
 * 为什么要显式包一层：`PageLike.waitForSelector` 约定**超时返回 false**，
 * 而 Playwright 的 `waitForSelector` 超时**抛错**（见 types.ts 的注释）。
 * 生产路径靠一个 `as` 强转绕过类型差（`browser.ts` 的页面池），探针这里把它写清楚。
 */
function asPageLike(page: Page): PageLike {
  return {
    goto: async (url: string): Promise<void> => {
      await page.goto(url)
    },
    url: (): string => page.url(),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> =>
      (await page.evaluate(fn as never, arg)) as R,
    waitForTimeout: (ms: number): Promise<void> => page.waitForTimeout(ms),
    waitForSelector: async (selector: string, timeoutMs: number): Promise<boolean> => {
      try {
        await page.waitForSelector(selector, { timeout: timeoutMs })
        return true
      } catch {
        return false
      }
    },
  }
}

const hitRate = (jobs: readonly RawJob[], pick: (job: RawJob) => string): string =>
  jobs.length === 0 ? '0/0' : `${String(jobs.filter((job) => pick(job) !== '').length)}/${String(jobs.length)}`

/** 逐字段命中率读数（探针的核心产出：哪一列空了，一眼可见）。 */
function reportFields(label: string, jobs: readonly RawJob[]): void {
  INFO.push(
    `${label}字段命中：条数 ${String(jobs.length)} · id ${hitRate(jobs, (job) => job.platformJobId)} · ` +
      `详情地址 ${hitRate(jobs, (job) => job.sourceUrl)} · 标题 ${hitRate(jobs, (job) => job.title)} · ` +
      `薪资 ${hitRate(jobs, (job) => job.salaryRaw)} · 公司 ${hitRate(jobs, (job) => job.company)} · ` +
      `城市 ${hitRate(jobs, (job) => job.city ?? '')} · 经验 ${hitRate(jobs, (job) => job.expReq ?? '')} · ` +
      `学历 ${hitRate(jobs, (job) => job.eduReq ?? '')} · 发布 ${hitRate(jobs, (job) => job.publishedAt ?? '')}`,
  )
  const sample = jobs[0]
  if (sample !== undefined) {
    INFO.push(
      `样本：${sample.title} | ${sample.salaryRaw} | ${sample.company} | ${sample.city}${sample.district ?? ''} | ${sample.sourceUrl}`,
    )
  }
}

/** 详情页逐字段读数：锚不到的字段 = 待校准候选清单（这是 detail 探针的核心产出）。 */
function reportDetailFields(detail: RawJobDetail): void {
  const hit = (value: string | null | undefined): string =>
    value === undefined || value === null || value === '' ? '✗未锚定' : `✓${value.slice(0, 40)}`
  const jd = detail.jdText ?? ''
  INFO.push(
    `详情页字段：标题 ${hit(detail.title)} · 薪资 ${hit(detail.salaryRaw)} · 公司 ${hit(detail.company)} · ` +
      `经验 ${hit(detail.expReq)} · 学历 ${hit(detail.eduReq)} · ` +
      `行业 ${hit(detail.industry)} / ${hit(detail.companyNature)} / ${hit(detail.companySize)} · ` +
      `JD ${jd === '' ? '✗未锚定' : `✓${String(jd.length)} 字`}`,
  )
  if ((detail.notes ?? []).length > 0) {
    INFO.push(`详情页 notes（= 待校准清单）：${(detail.notes ?? []).join('；')}`)
  }
}

/**
 * **在页面上下文里**数一组选择器各命中几个元素（候选命中表用）。⚠️ 必须自包含。
 * 返回按入参顺序的命中数；非法选择器记 -1（区分"没命中"与"选择器写坏了"）。
 */
function countSelectorHitsInPage(arg: { selectors: string[] }): number[] {
  return arg.selectors.map((selector) => {
    try {
      return document.querySelectorAll(selector).length
    } catch {
      return -1
    }
  })
}

/** 打一张「候选 → 真机命中数」表：校准 = 照着表写 DB 覆盖。 */
async function reportCandidateHits(
  page: PageLike,
  label: string,
  groups: Array<{ name: string; chain: string }>,
): Promise<void> {
  const entries: Array<{ name: string; chain: string }> = []
  for (const group of groups) {
    for (const candidate of group.chain.split(',').map((item) => item.trim()).filter((item) => item !== '')) {
      entries.push({ name: group.name, chain: candidate })
    }
  }
  const counts = await page
    .evaluate(countSelectorHitsInPage, { selectors: entries.map((entry) => entry.chain) })
    .catch(() => [] as number[])
  const lines = entries.map((entry, index) => {
    const count = counts[index]
    const mark = count === undefined ? '?' : count <= 0 ? '·' : '✓'
    return `${mark} ${entry.name}: ${entry.chain} → ${String(count ?? '?')}`
  })
  INFO.push(`${label}候选命中表：\n    ${lines.join('\n    ')}`)
}

/** 用真实适配器解析一份 HTML（与 npm test 走同一条解析代码）。 */
async function analyzeHtml(html: string, url: string, label: string): Promise<{
  jobs: RawJob[]
  block: string | null
  hasNext: boolean
}> {
  const adapter = createFiftyOneAdapter({ config: CONFIG })
  const page = new JsdomPage({ html, url })
  await adapter.crawl.gotoSearch(page, { keyword: KEYWORD, city: CITY })
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)
  reportFields(label, jobs)
  return { jobs, block: block === null ? null : String(block), hasNext }
}

/** 用真实适配器解析一份详情 HTML（离线复核 / 快照当回归夹具用）。 */
async function analyzeDetailHtml(html: string, url: string): Promise<RawJobDetail | null> {
  const adapter = createFiftyOneAdapter({ config: CONFIG })
  const page = new JsdomPage({ html, url })
  return (await adapter.detail?.extract(page)) ?? null
}

interface OnlineReading {
  html: string | null
  url: string
  api: Array<{ url: string; body: string | null }>
  jobs: RawJob[]
  block: string | null
  hasNext: boolean
  /** 详情页快照（列表首条 sourceUrl）：detailSelectors 候选链的校准证据。 */
  detailHtml: string | null
  detailUrl: string
  detail: RawJobDetail | null
  detailBlock: string | null
  /** 消息中心快照（FIFTYONE_LOGIN=1 时）：inboxSelectors / chatUrl 的校准证据。 */
  msgcenterHtml: string | null
  msgcenterUrl: string
}

/**
 * 判到滑块/登录墙时，把窗口留给人工：每 30 秒复判一次，直到墙消失或窗口耗尽。
 * 与 `probe:zhipin-chat` 的 `ZHIPIN_WAIT_MIN` 同款机制（C12：别连打）。
 */
async function waitIfBlocked(page: PageLike, scene: string): Promise<BlockKind | null> {
  const deadline = Date.now() + Math.max(0, Number.isFinite(WAIT_MINUTES) ? WAIT_MINUTES : 3) * 60_000
  const adapter = createFiftyOneAdapter({ config: CONFIG })
  for (;;) {
    const kind = await adapter.guard.detectBlock(page).catch(() => null)
    if (kind === null || Date.now() >= deadline) return kind
    log(`⏳ ${scene}：看到 ${kind} —— 请在浏览器窗口里人工处理（剩余等待窗口 ${String(Math.max(0, Math.round((deadline - Date.now()) / 60_000)))} 分钟）`)
    await page.waitForTimeout(30_000)
  }
}

/** 打开真实搜索页 → 用适配器解析 → 落盘快照，返回读数。 */
async function probeOnline(url: string): Promise<OnlineReading> {
  log(`探测地址：${url}`)

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath === undefined) {
    log('⚠️ 没找到系统 Chrome/Edge，交给 patchright 自行解析（指纹较弱，可能影响结果）')
  } else {
    log(`浏览器：${executablePath}`)
  }

  const context: BrowserContext = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(executablePath === undefined ? {} : { executablePath }),
  })
  // D-17a 环境一致性三件套之二：stealth 注入
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
  const rawPage: Page = await context.newPage()

  // 搜索接口采样：URL 参数映射（sortType / issueDate）只能从真实请求里读出来
  const api: Array<{ url: string; body: string | null }> = []
  rawPage.on('request', (request: Request) => {
    try {
      if (!request.url().includes(SEARCH_API_MARKER)) return
      api.push({ url: request.url(), body: request.postData() })
    } catch {
      /* 监听本身不许炸 */
    }
  })

  log('导航中（domcontentloaded，30s 超时）…')
  try {
    await rawPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  // SPA：load 时列表还没渲染 —— 等卡片锚点（与适配器 gotoSearch 同款姿势）+ 一点余量
  try {
    await rawPage.waitForSelector(CONFIG.selectors.card, { timeout: 20_000 })
  } catch {
    log('⚠️ 20s 内没等到卡片容器 —— 可能被 WAF 拦、或列表渲染更慢')
  }
  await rawPage.waitForTimeout(4_000)

  const page = asPageLike(rawPage)
  const adapter = createFiftyOneAdapter({ config: CONFIG })

  // 滑块/登录墙的人工等待（2026-09-21 真机走查撞上过阿里云滑块）
  const wall = await waitIfBlocked(page, '搜索页')
  const finalUrl = rawPage.url()
  log(`final URL：${finalUrl}`)

  // 登录锚点实况：已登录侧候选此前从未实测 —— 命中数就是校准 `loginSelectors` 的依据
  await reportCandidateHits(page, '登录锚点', [
    { name: 'loggedIn', chain: CONFIG.loginSelectors.loggedIn },
    { name: 'notLoggedIn', chain: CONFIG.loginSelectors.notLoggedIn },
  ])
  // 排序栏实况：2026-09-21 真机已见「距离优先」出现在栏里 —— 与旧结论有出入，如实记录待复核
  {
    const labels = SORT_OPTIONS.map((option) => option.label)
    const content = await rawPage.content()
    const seen = labels.filter((label) => label !== '' && content.includes(label))
    INFO.push(`排序栏当前可见文案：${seen.join(' / ')}${seen.length === 0 ? '（未读到 —— 栏可能未渲染）' : ''}`)
  }

  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)
  reportFields('在线', jobs)
  if (wall !== null) {
    log(`⚠️ 搜索页最终仍判 ${String(wall)} —— 列表读数可能不可信`)
  }

  const html = await rawPage.content()

  // ── 详情页快照（detailSelectors 候选链的校准证据）────────────────────
  // 只读动作：打开列表首条的 sourceUrl，采下原文 + 跑一遍适配器自己的
  // `detail.extract` 逐字段读数 + 候选命中表。锚不到的字段就是「待校准候选」
  // 的清单 —— 拿这份快照对类名，改 DB 覆盖（detailSelectors 段）即可，不必发版。
  let detailHtml: string | null = null
  let detailUrl = ''
  let detail: RawJobDetail | null = null
  let detailBlock: string | null = null
  const first = jobs.find((job) => job.sourceUrl !== '')
  if (SKIP_DETAIL) {
    log('（FIFTYONE_SKIP_DETAIL=1 —— 跳过详情页快照）')
  } else if (first === undefined) {
    log('（列表里没有可打开的 sourceUrl —— 跳过详情页快照）')
  } else {
    detailUrl = first.sourceUrl
    log(`打开详情页（列表首条）：${detailUrl}`)
    try {
      await rawPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await rawPage.waitForTimeout(4_000)
      await waitIfBlocked(page, '详情页')
      detailBlock = await adapter.guard.detectBlock(page)
      detail = (await adapter.detail?.extract(page)) ?? null
      await reportCandidateHits(page, '详情页', [
        { name: 'title', chain: CONFIG.detailSelectors.title },
        { name: 'salary', chain: CONFIG.detailSelectors.salary },
        { name: 'tags', chain: CONFIG.detailSelectors.tags },
        { name: 'jdText', chain: CONFIG.detailSelectors.jdText },
        { name: 'company', chain: CONFIG.detailSelectors.company },
        { name: 'companyMeta', chain: CONFIG.detailSelectors.companyMeta },
      ])
      detailHtml = await rawPage.content()
    } catch (error) {
      log(`详情页采集失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // ── 消息中心快照（inboxSelectors / chatUrl 的校准证据）───────────────
  // 真机实测（2026-09-21）：消息入口不在页头，在「我的51job」。先等人工登录，
  // 再从 myjob 收割「消息/沟通/im」链接 → 进消息页采样。全程只读。
  let msgcenterHtml: string | null = null
  let msgcenterUrl = ''
  if (!WITH_LOGIN) {
    log('（未开 FIFTYONE_LOGIN=1 —— 跳过消息中心采集）')
  } else {
    log(`等待登录（在窗口里登录 51job），入口页：${MYJOB_URL}`)
    try {
      await rawPage.goto(MYJOB_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      const deadline = Date.now() + Math.max(0, Number.isFinite(WAIT_MINUTES) ? WAIT_MINUTES : 3) * 60_000
      // 未登录会被顶到登录页：页头登录锚点消失即视为已登录
      for (;;) {
        const verdict = await page.evaluate(
          (arg: { loggedIn: string; notLoggedIn: string }) => {
            const has = (selector: string): boolean => {
              try {
                return document.querySelector(selector) !== null
              } catch {
                return false
              }
            }
            if (has(arg.loggedIn)) return 'in'
            if (has(arg.notLoggedIn)) return 'out'
            return 'unknown'
          },
          CONFIG.loginSelectors,
        )
        if (verdict === 'in' || Date.now() >= deadline) {
          log(`登录态判定：${verdict}`)
          break
        }
        await page.waitForTimeout(30_000)
      }
      // 收割「消息/沟通/im」链接（自包含函数，避免闭包）
      const links = (await page.evaluate(
        (arg: { keywords: string[] }) => {
          const out: Array<{ text: string; href: string }> = []
          for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
            const text = (anchor.textContent ?? '').replace(/\s+/g, ' ').trim()
            const href = anchor.getAttribute('href') ?? ''
            if (text === '' || href === '') continue
            if (arg.keywords.some((word) => text.includes(word) || href.toLowerCase().includes(word))) {
              out.push({ text, href })
            }
          }
          return out
        },
        { keywords: ['消息', '沟通', 'im', 'message'] },
      )) as Array<{ text: string; href: string }>
      INFO.push(`myjob 侧消息入口候选：${links.map((l) => `${l.text} → ${l.href}`).join(' · ') || '（一个都没收到）'}`)
      const target = links[0]
      if (target === undefined) {
        log('⚠️ myjob 页没有可点的消息入口 —— chatUrl 仍待校准')
      } else {
        msgcenterUrl = target.href.startsWith('http') ? target.href : new URL(target.href, MYJOB_URL).href
        log(`进入消息页：${msgcenterUrl}`)
        await rawPage.goto(msgcenterUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await rawPage.waitForTimeout(4_000)
        await waitIfBlocked(page, '消息页')
        await reportCandidateHits(page, '收件箱', [
          { name: 'listContainer', chain: CONFIG.inboxSelectors.listContainer },
          { name: 'row', chain: CONFIG.inboxSelectors.row },
          { name: 'name', chain: CONFIG.inboxSelectors.name },
          { name: 'lastMessage', chain: CONFIG.inboxSelectors.lastMessage },
          { name: 'unread', chain: CONFIG.inboxSelectors.unread },
        ])
        msgcenterHtml = await rawPage.content()
      }
    } catch (error) {
      log(`消息中心采集失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  await context.close()
  return {
    html,
    url: finalUrl,
    api,
    jobs,
    block: block === null ? null : String(block),
    hasNext,
    detailHtml,
    detailUrl,
    detail,
    detailBlock: detailBlock === null ? null : String(detailBlock),
    msgcenterHtml,
    msgcenterUrl,
  }
}

/** 离线复跑：挑最新的一份快照（文件名带日期，排序即最新）。 */
function latestCapture(): { path: string; url: string } | null {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    log(`⚠️ 没有抓取目录：${CAPTURE_DIR} —— 先在线跑一次`)
    return null
  }
  const name = names.filter((item) => /^search-\d{4}-\d{2}-\d{2}\.html$/.test(item)).sort().pop()
  if (name === undefined) {
    log(`⚠️ 抓取目录里没有 search-<日期>.html：${CAPTURE_DIR}`)
    return null
  }
  return { path: join(CAPTURE_DIR, name), url: buildUrl() }
}

/** 离线复跑（详情页）：最新的 detail-<日期>.html + 配套的地址文件（还原 location 用）。 */
function latestDetailCapture(): { path: string; url: string } | null {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    return null
  }
  const name = names.filter((item) => /^detail-\d{4}-\d{2}-\d{2}\.html$/.test(item)).sort().pop()
  if (name === undefined) return null
  const date = (/\d{4}-\d{2}-\d{2}/.exec(name) ?? [''])[0]
  let url = 'https://jobs.51job.com/all/0.html'
  try {
    url = readFileSync(join(CAPTURE_DIR, `detail-url-${date}.txt`), 'utf8').trim() || url
  } catch {
    /* 地址文件缺失就用兜底地址 —— 只影响 platformJobId 的反解读数 */
  }
  return { path: join(CAPTURE_DIR, name), url }
}

function buildUrl(): string {
  return createFiftyOneAdapter({ config: CONFIG }).criteria.buildSearchUrl({ keyword: KEYWORD, city: CITY }) ?? ''
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 城市：${CITY} · profile：${PROFILE}`)

  const url = buildUrl()
  if (url === '') {
    check(`城市「${CITY}」有城市码`, false, '→ cityCodes 里没有它，先补表（buildSearchUrl 返回 null）')
  } else if (OFFLINE_ONLY) {
    const capture = latestCapture()
    if (capture === null) {
      process.exitCode = 1
      return
    }
    INFO.push(`离线复跑快照：${capture.path}`)
    const offline = await analyzeHtml(readFileSync(capture.path, 'utf8'), capture.url, '离线')
    check('离线解析出卡片（选择器仍命中）', offline.jobs.length > 0, `${String(offline.jobs.length)} 条`)
    check('离线判墙未误报', offline.block === null, `detectBlock=${offline.block ?? '无'}`)
    const detailCapture = latestDetailCapture()
    if (detailCapture === null) {
      log('（没有详情页快照可复跑 —— 在线跑一次就会落一份）')
    } else {
      const offlineDetail = await analyzeDetailHtml(readFileSync(detailCapture.path, 'utf8'), detailCapture.url)
      if (offlineDetail === null) {
        check('离线详情解析有结果', false, 'adapter.detail?.extract 没有返回')
      } else {
        reportDetailFields(offlineDetail)
        check('离线详情 JD 锚定', (offlineDetail.jdText ?? '') !== '', '未锚定 → DB 覆盖 detailSelectors（不必发版）')
      }
    }
  } else {
    const online = await probeOnline(url)
    if (online.html === null) {
      log('✗ 没拿到页面快照')
    } else {
      mkdirSync(CAPTURE_DIR, { recursive: true })
      const htmlPath = join(CAPTURE_DIR, `search-${TODAY}.html`)
      writeFileSync(htmlPath, online.html, 'utf8')
      log(`快照已保存：${htmlPath}（${String(online.html.length)} 字符）`)
      if (online.api.length > 0) {
        const apiPath = join(CAPTURE_DIR, `search-api-${TODAY}.json`)
        writeFileSync(apiPath, JSON.stringify(online.api, null, 2), 'utf8')
        log(`接口采样已保存：${apiPath}（${String(online.api.length)} 条）`)
        INFO.push(`搜索接口请求：${online.api[0]?.url ?? ''} · body=${online.api[0]?.body ?? '(空)'}`)
      } else {
        log('（没捕获到搜索接口 —— SPA 可能走了别的端点，或命中了风控降级；不影响 HTML 快照）')
      }

      check(
        '列表页存活（无验证码/登录墙/空白）',
        online.block === null,
        online.block === null ? '' : `detectBlock=${online.block} —— 人工过一次滑块/登录后再跑，别连打（C12）`,
      )
      check('解析出卡片', online.jobs.length > 0, `${String(online.jobs.length)} 条（站点每页 20 条）`)
      check(
        '四核心字段无空缺（id/标题/薪资/公司）',
        online.jobs.length > 0 &&
          online.jobs.every((job) => job.platformJobId !== '' && job.title !== '' && job.salaryRaw !== '' && job.company !== ''),
        `id ${hitRate(online.jobs, (job) => job.platformJobId)} · 标题 ${hitRate(online.jobs, (job) => job.title)} · 薪资 ${hitRate(online.jobs, (job) => job.salaryRaw)} · 公司 ${hitRate(online.jobs, (job) => job.company)}`,
      )
      check(
        '跟踪载荷可解析（jobId → 详情地址）',
        online.jobs.every((job) => job.sourceUrl !== ''),
        hitRate(online.jobs, (job) => job.sourceUrl),
      )
      check('分页按钮「下一页」可用', online.hasNext, `hasNextPage=${String(online.hasNext)}`)
      INFO.push(
        `tracking 派生字段：经验 ${hitRate(online.jobs, (job) => job.expReq ?? '')} · ` +
          `学历 ${hitRate(online.jobs, (job) => job.eduReq ?? '')} · 发布 ${hitRate(online.jobs, (job) => job.publishedAt ?? '')}`,
      )

      // 同一份快照再离线跑一遍：证明"在线读数 == 离线读数"，也证明快照本身能当回归夹具
      const offline = await analyzeHtml(online.html, online.url, '离线复核')
      check(
        '离线复核条数与在线一致',
        offline.jobs.length === online.jobs.length,
        `在线 ${String(online.jobs.length)} · 离线 ${String(offline.jobs.length)}`,
      )

      // ── 详情页快照：detailSelectors 候选链的校准证据 ──────────────────
      if (online.detailHtml === null) {
        if (!SKIP_DETAIL) check('详情页快照采到', false, '打开列表首条 sourceUrl 失败 —— 见上方日志')
      } else {
        const detailPath = join(CAPTURE_DIR, `detail-${TODAY}.html`)
        writeFileSync(detailPath, online.detailHtml, 'utf8')
        writeFileSync(join(CAPTURE_DIR, `detail-url-${TODAY}.txt`), online.detailUrl, 'utf8')
        log(`详情页快照已保存：${detailPath}（${String(online.detailHtml.length)} 字符）`)

        check(
          '详情页未被风控接管',
          online.detailBlock === null,
          online.detailBlock === null ? '' : `detectBlock=${online.detailBlock}`,
        )
        const detail = online.detail
        if (detail === null) {
          check('详情解析有结果', false, 'adapter.detail?.extract 没有返回')
        } else {
          reportDetailFields(detail)
          check(
            '详情 JD 锚定（jdText 候选链）',
            (detail.jdText ?? '') !== '',
            '未锚定 → 拿快照对类名，DB 覆盖 detailSelectors.jdText（不必发版）',
          )
          check('详情标题锚定', detail.title !== '', 'title 候选与 document.title 兜底都没给到')
          const offlineDetail = await analyzeDetailHtml(online.detailHtml, online.detailUrl)
          check(
            '详情离线复核与在线一致',
            offlineDetail !== null &&
              offlineDetail.title === detail.title &&
              (offlineDetail.jdText ?? '') === (detail.jdText ?? ''),
            `在线 JD ${String((detail.jdText ?? '').length)} 字 · 离线 ${String((offlineDetail?.jdText ?? '').length)} 字`,
          )
        }
      }

      // ── 消息中心快照：inboxSelectors / chatUrl 的校准证据 ──────────────
      if (WITH_LOGIN) {
        if (online.msgcenterHtml === null) {
          check('消息中心快照采到', false, '入口收割或导航失败 —— 见上方日志')
        } else {
          const msgPath = join(CAPTURE_DIR, `msgcenter-${TODAY}.html`)
          writeFileSync(msgPath, online.msgcenterHtml, 'utf8')
          log(`消息中心快照已保存：${msgPath}（${String(online.msgcenterHtml.length)} 字符）`)
          INFO.push(`chatUrl 校准依据：消息页实测地址 ${online.msgcenterUrl}`)
        }
      }
    }
  }

  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${String(PASS.length)} · FAIL ${String(FAIL.length)}`)
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  console.log('\n-- PASS --')
  for (const item of PASS) console.log(`  ✓ ${item}`)
  console.log('\n-- FAIL（需要改适配器/文档） --')
  for (const item of FAIL) console.log(`  ✗ ${item}`)
  console.log(`\n退出码：${FAIL.length === 0 ? '0（全部断言通过，适配器无需改动）' : '1'}`)
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch((error: unknown) => {
  console.error('探针异常：', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
