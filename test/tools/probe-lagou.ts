#!/usr/bin/env node
/**
 * 拉勾网探针 v1 —— 复用猎聘 v8 / BOSS 验证过的路线：
 * patchright **启动式** + 系统 Chrome + stealth 注入（D-17a 三件套）。
 *
 * 拉勾与 BOSS 的差异（见 adapters/lagou.ts 文件头）：
 *   * 列表页公开可爬（未登录可拿职位与薪资明文），但 **WAF 滑块（CF_APP_WAF）** 会
 *     对自动化流量高频弹验证页（URL 变 `/s/list_<hex>`）—— 探针检测到弹窗就提示手动
 *     完成滑块（最多等 3 分钟），过了之后列表才会渲染；
 *   * 关键词**进路径段**：`/jobs/list_<关键词>?city=<中文城市名>`（城市用中文名，全国省参）；
 *   * 详情 URL 是 `/wn/jobs/<纯数字id>.html`；
 *   * 翻页是 `/<城市拼音>-zhaopin/<关键词>/<页>/`，拼音 slug 只能读站点生成的分页链接。
 *
 * 一次运行完成：环境验证 + WAF/登录等待 + 夹具保存（test/fixtures/lagou-search.html）
 * + 分页链接采样。用法：npm run probe:lagou
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const KEYWORD = process.env['LAGOU_KEY'] ?? 'Java'
/** 城市参数是**中文名**（全国省参）。 */
const CITY = process.env['LAGOU_CITY'] ?? '北京'
const PROFILE = process.env['LAGOU_PROFILE'] ?? join(process.cwd(), '.probe-lagou-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const FIXTURE_PATH = join(FIXTURE_DIR, 'lagou-search.html')
const PROBE_URL =
  `https://www.lagou.com/jobs/list_${encodeURIComponent(KEYWORD)}` +
  `${CITY === '全国' || CITY === '' ? '' : '?city=' + encodeURIComponent(CITY)}&px=new`

const WAIT_TIMEOUT_MS = 3 * 60 * 1000
const POLL_MS = 3_000

function log(message: string): void {
  console.log(`[probe-lagou] ${new Date().toISOString()} ${message}`)
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

  log('✔ 探测完成 —— 跑 npm test，lagou 的离线解析用例会自动用上夹具。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})