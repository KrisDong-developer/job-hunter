#!/usr/bin/env node
/**
 * 拉勾网探针 v1 —— 复用猎聘 v8 / BOSS 验证过的路线：
 * patchright **启动式** + 系统 Chrome + stealth 注入（D-17a 三件套）。
 *
 * 拉勾与 BOSS 的差异（见 adapters/lagou/index.ts 文件头）：
 *   * 列表页公开可爬（未登录可拿职位与薪资明文），但 **WAF 滑块（CF_APP_WAF）** 会
 *     对自动化流量高频弹验证页（URL 变 `/s/list_<hex>`）—— 探针检测到弹窗就提示手动
 *     完成滑块（最多等 3 分钟），过了之后列表才会渲染；
 *   * 关键词**进路径段**：`/jobs/list_<关键词>?city=<中文城市名>`（城市用中文名，全国省参）；
 *   * 详情 URL 是 `/wn/jobs/<纯数字id>.html`；
 *   * 翻页是 `/<城市拼音>-zhaopin/<关键词>/<页>/`，拼音 slug 只能读站点生成的分页链接。
 *
 * 一次运行完成：环境验证 + WAF/登录等待 + **列表夹具**（test/fixtures/lagou-search.html）
 * + **详情页夹具**（test/fixtures/lagou-detail.html）+ 分页链接采样
 * + **未登录侧登录态锚点**（test/fixtures/lagou-auth-markers.json，与 `probe:lagou-login`
 *   写的"已登录侧"合起来才能定出 `auth.isLoggedIn` 判据）。用法：npm run probe:lagou
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const KEYWORD = process.env['LAGOU_KEY'] ?? 'Java'
/** 城市参数是**中文名**（全国省参）。 */
const CITY = process.env['LAGOU_CITY'] ?? '北京'
const PROFILE = process.env['LAGOU_PROFILE'] ?? join(process.cwd(), '.probe-lagou-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const FIXTURE_PATH = join(FIXTURE_DIR, 'lagou-search.html')
/** 详情页夹具（2026-09-19 补）：从列表第一张卡进去存一份**匿名**详情页。 */
const DETAIL_FIXTURE_PATH = join(FIXTURE_DIR, 'lagou-detail.html')
/** 登录态锚点证据（只记选择器命中与元素标签/类名，**不记文案** —— 会含用户名）。 */
const AUTH_MARKERS_PATH = join(FIXTURE_DIR, 'lagou-auth-markers.json')
const PROBE_URL =
  `https://www.lagou.com/jobs/list_${encodeURIComponent(KEYWORD)}` +
  `${CITY === '全国' || CITY === '' ? '' : '?city=' + encodeURIComponent(CITY)}&px=new`

const WAIT_TIMEOUT_MS = 3 * 60 * 1000
const POLL_MS = 3_000

function log(message: string): void {
  console.log(`[probe-lagou] ${new Date().toISOString()} ${message}`)
}

/**
 * 登录态锚点候选（自包含，`page.evaluate` 里跑）。
 *
 * 为什么把这件事放进探针：`auth.isLoggedIn` 的判据必须是**结构性**的，而"哪个锚点是
 * 判别式"只有在**两种状态**下各测一次才知道（只出现于一侧的那个才是）。
 * 拉勾适配器现在的 `isLoggedIn` 还标着"待含登录夹具校准" —— 跑一遍这个扫描就能定案，
 * 不用肉眼翻 500KB HTML。
 *
 * ⚠️ 只记 `tag` / `class`，**不记文本**：页头文案里有真实用户名，而这份产物会进版本库。
 */
export const LAGOU_AUTH_CANDIDATES: string[] = [
  'a[href*="login"]',
  'a[href*="passport"]',
  'a[href*="logout"]',
  '.login',
  '.header-login',
  '.unlogin',
  '.not-login',
  '.user-nav',
  '.user-info',
  '.header-user',
  '.nav-user',
  '.username',
  '.user-name',
  '.avatar',
  'img[class*="avatar"]',
]

export function scanAuthMarkersInPage(arg: { candidates: string[] }): {
  url: string
  hits: Array<{ selector: string; count: number; samples: Array<{ tag: string; cls: string }> }>
} {
  const hits: Array<{ selector: string; count: number; samples: Array<{ tag: string; cls: string }> }> = []
  for (const selector of arg.candidates) {
    let nodes: Element[] = []
    try {
      nodes = Array.from(document.querySelectorAll(selector))
    } catch {
      nodes = []
    }
    if (nodes.length === 0) continue
    hits.push({
      selector,
      count: nodes.length,
      samples: nodes
        .slice(0, 3)
        .map((el) => ({ tag: el.tagName.toLowerCase(), cls: el.getAttribute('class') ?? '' })),
    })
  }
  return { url: location.href, hits }
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 城市：${CITY}`)
  log(`profile：${PROFILE}`)
  log(`探测地址：${PROBE_URL}`)

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath === undefined) {
    log('⚠️ 没找到系统 Chrome/Edge，交给 patchright 自行解析')
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
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
  const page: Page = await context.newPage()

  // 捕获 positionAjax 接口响应（v2 双通道校准样本）。
  const apiCaptures: Array<{ url: string; body: string | null }> = []
  page.on('response', (response: Response) => {
    try {
      if (!response.url().includes('positionAjax')) return
      if (response.status() !== 200) return
      void response
        .text()
        .then((text: string) => {
          apiCaptures.push({ url: response.url(), body: text === '' ? null : text })
        })
        .catch(() => undefined)
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

  // ── 2. WAF 滑块 / 登录 等待（拉勾的反爬就是进门这一关） ───────────────
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const url = page.url()
    if (/\bs\/list_/.test(url) || url.includes('verify')) {
      log('⛔ 检测到 WAF 滑块验证页 —— 请在浏览器窗口里手动完成滑块（探针会继续等待）')
    } else if (/login|passport|verify/i.test(url)) {
      log('⏳ 当前在登录/验证页 —— 请手动完成（最多等 3 分钟）')
    } else if (url.includes('/jobs/list_')) {
      // 留在列表页 = 过了滑块（WAF 完成前 URL 是 /s/list_）
      const cards = await page.evaluate(() => document.querySelectorAll('.con_list_item, [class*="job-list"], [class*="list_item"]').length).catch(() => 0)
      if (cards > 0) break
      log(`已到列表页但卡片数为 ${String(cards)} —— SceneJS 渲染中，继续等`)
    } else {
      log(`当前未知页面：${url.slice(0, 120)} —— 继续等列表`)
    }
    await page.waitForTimeout(POLL_MS)
  }
  const finalUrl = page.url()
  if (!finalUrl.includes('/jobs/list_')) {
    log(`✘ 等待列表超时 / 被重定向：${finalUrl.slice(0, 120)}（profile 已保留，人工过验证后重跑）`)
    await context.close()
    process.exitCode = 1
    return
  }
  log(`已就位：${finalUrl}`)

  // 等列表渲染（SPA）
  await page.waitForTimeout(5_000)

  // ── 3. 指纹与页面快照 ───────────────────────────────────────────────
  const snapshot = await page.evaluate(() => {
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const hits: Record<string, number> = {}
    for (const selector of ['.con_list_item', '.position_link', '.position_name', '.money', '.company_name', '.li_b_l', '.list_item_bot', '.format-time', '.pager_container', '.pager_next', 'a[href*="/wn/jobs/"]']) {
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch {
        /* ignore */
      }
    }
    const jobLinks = Array.from(document.querySelectorAll("a[href*='/wn/jobs/'], a[href*='/jobs/']"))
      .slice(0, 3)
      .map((a) => a.getAttribute('href') ?? '')
    return JSON.stringify({
      webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
      title: document.title,
      bodyLength: text.length,
      bodyHead: text.slice(0, 160),
      cardHits: hits,
      isWaf: /请滑动滑块进行验证|为了更好的访问体验/.test(text),
      jobLinkSamples: jobLinks.map((href) => href.slice(0, 120)),
    })
  })
  log(`页面快照：${snapshot}`)
  const parsed = JSON.parse(snapshot) as { webdriver?: unknown; isWaf: boolean; cardHits: Record<string, number> }
  log(`navigator.webdriver = ${String(parsed.webdriver)}${parsed.webdriver === true ? ' ⚠️ 引擎未生效' : '（与真人一致）'}`)
  if (parsed.isWaf) log('⚠️ 页面仍含滑块文案 —— 可能刚过了一次又被弹，需人工确认')
  log(`选择器命中：${JSON.stringify(parsed.cardHits)}`)

  // ── 4. 分页链接采样 ────────────────────────────────────────────────
  const pagerSample = await page.evaluate(() => {
    const pager = document.querySelector('.pager_container')
    if (pager === null) return 'no-pager'
    const links = Array.from(pager.querySelectorAll('a'))
      .slice(0, 6)
      .map((a) => `${a.textContent ?? ''}→${a.getAttribute('href') ?? ''}`)
    return links.join(' | ')
  }).catch(() => 'eval-err')
  log(`分页链接：${pagerSample}`)

  // ── 5. 落盘夹具 ─────────────────────────────────────────────────────
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const html = await page.content()
  writeFileSync(FIXTURE_PATH, html, 'utf8')
  log(`夹具已保存：${FIXTURE_PATH}（${String(html.length)} 字符）`)

  if (apiCaptures.length > 0) {
    const apiPath = join(FIXTURE_DIR, 'lagou-search-api.json')
    writeFileSync(apiPath, JSON.stringify(apiCaptures, null, 2), 'utf8')
    log(`接口采样已保存：${apiPath}（${String(apiCaptures.length)} 条）—— 供 parseSearchApiResponse 校准`)
  }

  // ── 6. 登录态锚点扫描（**未登录侧**）────────────────────────────────
  // 与 `probe:lagou-login` 写的"已登录侧"合起来才能定出 `auth.isLoggedIn` 的判据：
  // 只有"只出现于一侧"的锚点才是判别式。这一步**必须在未登录时做**，所以放在这里。
  try {
    const markers = await page.evaluate(scanAuthMarkersInPage, { candidates: LAGOU_AUTH_CANDIDATES })
    const existing = ((): Record<string, unknown> => {
      try {
        return JSON.parse(readFileSync(AUTH_MARKERS_PATH, 'utf8')) as Record<string, unknown>
      } catch {
        return {}
      }
    })()
    writeFileSync(
      AUTH_MARKERS_PATH,
      JSON.stringify(
        {
          ...existing,
          anonymous: markers,
          candidates: LAGOU_AUTH_CANDIDATES,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
    log(
      `未登录侧锚点：${markers.hits.map((hit) => `${hit.selector}=${String(hit.count)}`).join(' ') || '(一个都没命中)'}`,
    )
  } catch (error) {
    log(`锚点扫描失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // ── 7. 详情页夹具（匿名；从列表第一张卡进去）──────────────────────────
  // 适配器声明了 `detail`，但平台事实标着"夹具缺失、选择器自称待校准" ——
  // 没有详情页夹具，那条解析就等于没被验证过。列表里就有现成的详情链接，顺手抓一份。
  const detailHref = await page
    .evaluate(() => {
      for (const anchor of Array.from(document.querySelectorAll("a[href*='/wn/jobs/']"))) {
        const href = anchor.getAttribute('href') ?? ''
        if (!/\/wn\/jobs\/\d+\.html/.test(href)) continue
        return href.startsWith('http') ? href : `https://www.lagou.com${href}`
      }
      return ''
    })
    .catch(() => '')
  if (detailHref === '') {
    log('⚠️ 列表里没找到 /wn/jobs/<id>.html 链接 —— 跳过详情页夹具')
  } else {
    try {
      log(`详情页：${detailHref}`)
      await page.goto(detailHref, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(6_000)
      const detailHtml = await page.content()
      writeFileSync(DETAIL_FIXTURE_PATH, detailHtml, 'utf8')
      log(`详情页夹具已保存：${DETAIL_FIXTURE_PATH}（${String(detailHtml.length)} 字符）`)
    } catch (error) {
      log(`详情页抓取失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  log('✔ 探测完成 —— 跑 npm test，lagou 的离线解析用例会自动用上夹具。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})