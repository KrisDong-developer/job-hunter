#!/usr/bin/env node
/**
 * BOSS 直聘「登录态」夹具探针 —— 为分页契约与薪资字段补证据。
 *
 * 背景（`adapters/zhipin.ts` 文件头记的未登录形态）：
 *   * 未登录视图**没有分页区**（`hasNextPage` 只能恒 false）、**薪资隐藏**（元素在、文本空）、
 *     岗位链接**不带 securityId** —— 于是适配器被限死在单页 15 条。
 *   本探针把登录态下的真实结构抓下来，用于校准：
 *     ① 分页区选择器 + 「下一页」真实 href（`buildZhipinSearchUrl` 的 page 参数形态）；
 *     ② 薪资是否真的可见（决定 `requiredFields` / `fieldCompleteness` 能不能升级）；
 *     ③ 岗位链接是否带 securityId（详情抓取的前提）。
 *
 * 流程（复用 probe-zhipin / probe-lagou-login 的登录等待套路 + D-17a 三件套）：
 *   1. patchright **启动式** + 系统 Chrome + stealth 注入，打开 Java + 深圳 的搜索页；
 *   2. 若未登录 → 在**弹出的窗口里手动登录**（profile 记住登录态，与 probe:zhipin 共用一份）；
 *   3. 等到登录信号（薪资非空 或 分页区出现）后落盘：
 *      - `test/fixtures/zhipin-search-logged-in.html`        登录态第 1 页快照
 *      - `test/fixtures/zhipin-search-logged-in-scroll.html` 滚动加载后的快照（只在真加载出新数据时写）
 *      - `test/fixtures/zhipin-pagination-report.json`      翻页契约报告（URL 翻页 / 滚动加载实测结论）
 *      - `test/fixtures/zhipin-search-api.json`             `/wapi/` 接口采样（含 page 参数证据）
 *
 * 用法：npm run probe:zhipin-login
 * 环境变量：ZHIPIN_KEY / ZHIPIN_CITY_CODE / ZHIPIN_PROFILE / ZHIPIN_WAIT_MIN（等待登录的分钟数）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const KEYWORD = process.env['ZHIPIN_KEY'] ?? 'Java'
/** 城市码来自 BossHunter 的 boss_cities.json（第一方：zhipin 官方 cityGroup 接口）。深圳 = 101280600。 */
const CITY_CODE = process.env['ZHIPIN_CITY_CODE'] ?? '101280600'
/** 与 probe:zhipin 共用同一份 profile —— 登录一次，两个探针都受益。 */
const PROFILE = process.env['ZHIPIN_PROFILE'] ?? join(process.cwd(), '.probe-zhipin-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const BASE_URL = 'https://www.zhipin.com/web/geek/job'
const PROBE_URL = `${BASE_URL}?query=${encodeURIComponent(KEYWORD)}&city=${CITY_CODE}`
const CARD_SELECTOR = '.job-card-wrap'
/**
 * 抓**所有** `/wapi/` 响应：BOSS 的 geek 搜索列表走 `wapi/zpgeek/search/joblist.json`，
 * 而"翻页到底靠 URL 参数还是靠滚动加载"这个问题，接口 URL 里的 `page` 参数是最硬的证据。
 */
const API_URL_MARKER = '/wapi/'

const WAIT_TIMEOUT_MS = Math.max(1, Number(process.env['ZHIPIN_WAIT_MIN'] ?? '10')) * 60 * 1000
const POLL_MS = 3_000

const FIXTURE_P1 = join(FIXTURE_DIR, 'zhipin-search-logged-in.html')
/** 滚动加载后的快照（一页装 30+ 张卡片时才写）。 */
const FIXTURE_SCROLL = join(FIXTURE_DIR, 'zhipin-search-logged-in-scroll.html')
const FIXTURE_PAGINATION = join(FIXTURE_DIR, 'zhipin-pagination-report.json')
const FIXTURE_API = join(FIXTURE_DIR, 'zhipin-search-api.json')

function log(message: string): void {
  console.log(`[probe-zhipin-login] ${new Date().toISOString()} ${message}`)
}

/** 页面体检结果（登录态判定的依据都在这里）。 */
interface PageScan {
  url: string
  title: string
  cards: number
  salaryFilled: number
  companyFilled: number
  tagsFilled: number
  securityIdLinks: number
  loginMarkers: Record<string, number>
  bodyHead: string
}

/**
 * 页面体检（自包含，序列化进页面执行）。
 *
 * `ready` 的判定刻意**不**看"当前 URL 是不是搜索页" —— 未登录时也停在搜索页，
 * 只是薪资全空、没有分页区。看那两个信号才是登录与否的真实分界。
 */
async function scanPage(page: Page): Promise<PageScan> {
  return await page.evaluate((arg) => {
    const countOf = (selector: string): number => {
      try {
        return document.querySelectorAll(selector).length
      } catch {
        return 0
      }
    }
    const filled = (selector: string): number => {
      let n = 0
      try {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if ((el.textContent ?? '').replace(/\s+/g, ' ').trim() !== '') n += 1
        }
      } catch {
        /* 选择器非法 → 0 */
      }
      return n
    }
    const links = Array.from(document.querySelectorAll("a[href*='/job_detail/'], a[href*='/job/']"))
    const loginMarkers: Record<string, number> = {}
    for (const selector of arg.loginMarkers) {
      const n = countOf(selector)
      if (n > 0) loginMarkers[selector] = n
    }
    return {
      url: location.href,
      title: document.title,
      cards: countOf(arg.card),
      salaryFilled: filled(arg.salary),
      companyFilled: filled(arg.company),
      tagsFilled: filled(arg.tagList),
      securityIdLinks: links.filter((a) => (a.getAttribute('href') ?? '').includes('securityId')).length,
      loginMarkers,
      bodyHead: (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    }
  }, {
    card: CARD_SELECTOR,
    salary: '.job-salary',
    company: '.boss-name, .company-name',
    tagList: '.tag-list li',
    loginMarkers: [
      '.user-nav',
      '.nav-figure',
      '[class*="user-avatar"]',
      '[class*="header-user"]',
      '[class*="user-info"]',
    ],
  })
}

/** 分页契约报告（自包含）。 */
interface PaginationScan {
  containers: Array<{ selector: string; count: number; className: string; text: string }>
  nextCandidates: Array<{
    text: string
    tag: string
    actionSelector: string
    href: string | null
    disabled: boolean
    ariaDisabled: string | null
    className: string
    parentClassName: string
    outerHTML: string
  }>
  pageNumberTexts: string[]
  totalHints: string[]
}

async function scanPagination(page: Page, containerSelectors: readonly string[]): Promise<PaginationScan> {
  return await page.evaluate((arg) => {
    const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const actionSelector = (el: Element): string => {
      const tag = el.tagName.toLowerCase()
      const id = el.getAttribute('id')
      if (id !== null && id !== '') return `${tag}#${id}`
      const classes = (el.getAttribute('class') ?? '')
        .split(/\s+/)
        .map((c) => c.trim())
        .filter((c) => c !== '')
      return classes.length === 0 ? tag : `${tag}.${classes.slice(0, 3).join('.')}`
    }

    const containers: PaginationScan['containers'] = []
    for (const selector of arg.containerSelectors) {
      let nodes: Element[] = []
      try {
        nodes = Array.from(document.querySelectorAll(selector))
      } catch {
        continue
      }
      const first = nodes[0]
      if (first === undefined) continue
      containers.push({
        selector,
        count: nodes.length,
        className: first.getAttribute('class') ?? '',
        text: text(first).slice(0, 100),
      })
    }

    // 「下一页」候选：按文本找，比猜类名稳（类名是构建产物）。
    const NEXT_TEXTS = ['下一页', '下页', '›', '»', '>']
    const nextCandidates: PaginationScan['nextCandidates'] = []
    for (const el of Array.from(document.querySelectorAll('a, li, button, span'))) {
      const t = text(el)
      if (!NEXT_TEXTS.includes(t)) continue
      nextCandidates.push({
        text: t,
        tag: el.tagName.toLowerCase(),
        actionSelector: actionSelector(el),
        href: el.getAttribute('href'),
        disabled:
          el.getAttribute('disabled') !== null ||
          el.getAttribute('aria-disabled') === 'true' ||
          /disabled|disable/.test(el.getAttribute('class') ?? ''),
        ariaDisabled: el.getAttribute('aria-disabled'),
        className: el.getAttribute('class') ?? '',
        parentClassName: el.parentElement?.getAttribute('class') ?? '',
        outerHTML: el.outerHTML.length > 300 ? el.outerHTML.slice(0, 300) : el.outerHTML,
      })
    }

    const pageNumberTexts: string[] = []
    for (const selector of arg.containerSelectors) {
      try {
        for (const el of Array.from(document.querySelectorAll(`${selector} a, ${selector} li`))) {
          const t = text(el)
          if (/^\d+$/.test(t)) pageNumberTexts.push(t)
        }
      } catch {
        /* ignore */
      }
    }

    const body = (document.body?.textContent ?? '').replace(/\s+/g, ' ')
    const totalHints = (body.match(/共\s*\d+\s*[页个条][^\s，。]{0,6}/g) ?? []).slice(0, 5)

    return { containers, nextCandidates, pageNumberTexts, totalHints }
  }, { containerSelectors: [...containerSelectors] })
}

/** 当前列表里的卡片数（自包含）。 */
async function countCards(page: Page): Promise<number> {
  return await page.evaluate((selector) => {
    try {
      return document.querySelectorAll(selector).length
    } catch {
      return 0
    }
  }, CARD_SELECTOR)
}

/** 前 3 张卡片的岗位 id（自包含）—— 用来判断"翻页后是不是换了一批数据"。 */
async function firstJobIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const pattern = /\/job_detail\/([0-9a-zA-Z~_-]+)\.html/
    const out: string[] = []
    for (const link of Array.from(document.querySelectorAll("a[href*='/job_detail/']"))) {
      const match = pattern.exec(link.getAttribute('href') ?? '')
      if (match === null || match[1] === undefined) continue
      if (!out.includes(match[1])) out.push(match[1])
      if (out.length >= 3) break
    }
    return out
  }, undefined as never)
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 城市码：${CITY_CODE}`)
  log(`profile：${PROFILE}`)
  log(`探测地址：${PROBE_URL}`)
  log(`等待登录上限：${String(WAIT_TIMEOUT_MS / 60_000)} 分钟（可在窗口里慢慢登录）`)

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

  /** 接口采样：/wapi/ 全抓（翻页策略的证据在 URL 的 page 参数里）。 */
  const apiCaptures: Array<{ url: string; status: number; body: string | null }> = []
  page.on('response', (response: Response) => {
    try {
      if (!response.url().includes(API_URL_MARKER)) return
      const status = response.status()
      void response
        .text()
        .then((body: string) => {
          apiCaptures.push({ url: response.url(), status, body: body === '' ? null : body.slice(0, 200_000) })
        })
        .catch(() => {
          apiCaptures.push({ url: response.url(), status, body: null })
        })
    } catch {
      /* 监听本身不许炸 */
    }
  })

  // ── 1. 导航 ───────────────────────────────────────────────────────────
  log('导航中…')
  try {
    await page.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(4_000)

  // ── 2. 登录等待 ───────────────────────────────────────────────────────
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  let loggedIn = false
  let lastHintAt = 0
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('verify-slider') || url.includes('safe/verify')) {
      log('⛔ 检测到滑块验证页 —— 请在浏览器窗口里手动完成滑块（探针会继续等待）')
    } else {
      const scan = await scanPage(page).catch(() => null)
      if (scan !== null) {
        // 登录成功常被带到别的页面（新手引导 `/web/geek/guide/`、首页）——
        // 那种页面上永远等不到薪资/分页信号，必须主动回到搜索页再看。
        const onSearch = url.startsWith(BASE_URL)
        const inLoggedArea = /\/web\/geek\//.test(url) || Object.keys(scan.loginMarkers).length > 0
        if (!onSearch && inLoggedArea) {
          log(`↩ 已登录但当前不在搜索页（${url.slice(0, 80)}）—— 主动导航回搜索页`)
          await page.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined)
          await page.waitForTimeout(5_000)
          continue
        }
        // 登录信号：薪资可见 或 有分页区。两者任一出现就说明登录态生效。
        const paginationProbe = await scanPagination(page, ['.options-pages']).catch(() => null)
        const hasPagination = (paginationProbe?.containers ?? []).some((item) => item.count > 0)
        if (scan.salaryFilled > 0 || hasPagination) {
          loggedIn = true
          log(
            `✔ 登录态就位：${String(scan.cards)} 张卡片 · 薪资可见 ${String(scan.salaryFilled)} 条 · ` +
              `分页区 ${hasPagination ? '有' : '无'}`,
          )
          break
        }
        if (Date.now() - lastHintAt > 15_000) {
          lastHintAt = Date.now()
          log(
            `⏳ 等待登录中（当前：列表 ${String(scan.cards)} 张 · 薪资可见 ${String(scan.salaryFilled)} 条 · ` +
              `URL ${url.slice(0, 90)}）—— 请在窗口里登录 BOSS`,
          )
        }
      }
    }
    await page.waitForTimeout(POLL_MS)
  }

  if (!loggedIn) {
    log('✘ 等待登录超时 —— 夹具未采集。profile 已保留，登录后重跑本探针即可。')
    await context.close()
    process.exitCode = 1
    return
  }

  // 等列表稳定（SPA 渲染 + 分页区挂载）
  await page.waitForTimeout(5_000)

  // ── 3. 第 1 页：体检 + 分页契约 + 落盘 ────────────────────────────────
  const scan1 = await scanPage(page)
  log(`第 1 页体检：${JSON.stringify(scan1)}`)
  log(
    `登录标记命中：${
      Object.keys(scan1.loginMarkers).length === 0 ? '（无）' : JSON.stringify(scan1.loginMarkers)
    }`,
  )

  const pagination1 = await scanPagination(page, [
    '.options-pages',
    '.ui-pagination',
    '.pagination',
    '[class*="pagination"]',
    '[class*="page-"]',
    '.job-list-box + div',
  ])
  log(`第 1 页分页契约：${JSON.stringify(pagination1)}`)

  mkdirSync(FIXTURE_DIR, { recursive: true })
  const html1 = await page.content()
  writeFileSync(FIXTURE_P1, html1, 'utf8')
  log(`第 1 页夹具已保存：${FIXTURE_P1}（${String(html1.length)} 字符）`)

  // ── 4. 翻页策略探测 ───────────────────────────────────────────────────
  //
  // BOSS 的 geek 搜索页**没有页码分页区**（第 1 页实测：`nextCandidates: []`）。
  // 于是只剩两种可能，都要实测而不是猜：
  //   4a. URL 参数翻页 —— `&page=2` 换一批数据（那就能走 crawl.ts 的既有翻页回路）；
  //   4b. 滚动加载 —— 滚到底部自动追加（那只能在**一页之内**把列表读厚）。
  const firstIds = await firstJobIds(page)
  log(`第 1 页前 3 个岗位 id：${JSON.stringify(firstIds)}`)

  let urlPaging: { testedUrl: string; ids: string[]; changed: boolean } | null = null
  try {
    const testedUrl = `${PROBE_URL}&page=2`
    await page.goto(testedUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForSelector(CARD_SELECTOR, { timeout: 20_000 }).catch(() => undefined)
    await page.waitForTimeout(5_000)
    const ids = await firstJobIds(page)
    const changed = ids.length > 0 && firstIds.length > 0 && ids.join(',') !== firstIds.join(',')
    urlPaging = { testedUrl, ids, changed }
    log(`4a URL 翻页测试（&page=2）：${JSON.stringify(urlPaging)} → ${changed ? '有效' : '无效（页面忽略该参数）'}`)
  } catch (error) {
    log(`4a URL 翻页测试失败：${error instanceof Error ? error.message : String(error)}`)
  }

  /** 回到第 1 页再测滚动加载（URL 参数那一步已经把页面带走了）。 */
  let scrollResult: {
    before: number
    rounds: Array<{ round: number; cards: number; apiUrls: string[] }>
    after: number
  } | null = null
  try {
    await page.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForSelector(CARD_SELECTOR, { timeout: 20_000 }).catch(() => undefined)
    await page.waitForTimeout(5_000)
    const before = await countCards(page)
    const rounds: Array<{ round: number; cards: number; apiUrls: string[] }> = []
    let seenApi = apiCaptures.length
    for (let round = 1; round <= 6; round += 1) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight)
      })
      await page.waitForTimeout(3_500)
      const cards = await countCards(page)
      const apiUrls = apiCaptures.slice(seenApi).map((item) => item.url)
      seenApi = apiCaptures.length
      rounds.push({ round, cards, apiUrls })
      const previous = rounds[rounds.length - 2]
      if (previous !== undefined && previous.cards === cards) break
    }
    const after = rounds.at(-1)?.cards ?? before
    scrollResult = { before, rounds, after }
    log(`4b 滚动加载测试：${String(before)} 张 → ${String(after)} 张；${JSON.stringify(rounds)}`)
    if (after > before) {
      const html = await page.content()
      writeFileSync(FIXTURE_SCROLL, html, 'utf8')
      log(`滚动后快照已保存：${FIXTURE_SCROLL}（${String(html.length)} 字符）`)
    }
  } catch (error) {
    log(`4b 滚动加载测试失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // ── 5. 报告与接口采样落盘 ─────────────────────────────────────────────
  const report = {
    capturedAt: new Date().toISOString(),
    keyword: KEYWORD,
    cityCode: CITY_CODE,
    searchUrl: PROBE_URL,
    page1Url: scan1.url,
    page1: scan1,
    pagination1,
    firstJobIds: firstIds,
    urlPaging,
    scrollLoading: scrollResult,
    apiUrls: apiCaptures.map((item) => ({ url: item.url, status: item.status })),
  }
  writeFileSync(FIXTURE_PAGINATION, JSON.stringify(report, null, 2), 'utf8')
  log(`翻页契约报告已保存：${FIXTURE_PAGINATION}`)

  if (apiCaptures.length > 0) {
    writeFileSync(FIXTURE_API, JSON.stringify(apiCaptures, null, 2), 'utf8')
    log(`接口采样已保存：${FIXTURE_API}（${String(apiCaptures.length)} 条）`)
  } else {
    log('⚠️ 没抓到任何 /wapi/ 响应 —— 列表可能完全由服务端渲染')
  }

  log('✔ 采集完成 —— 接下来由助手按这份契约校准适配器（翻页方式 / maxPages / 字段）。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
