#!/usr/bin/env node
/**
 * 猎聘探针 v8 —— patchright **启动式**（launchPersistentContext），不是 attach。
 *
 * 探针演进（结论详见 docs/ADAPTERS.md §7.1）：
 *   v5 CDP attach 日常 Chrome + 端口守卫 → 被识别
 *   v6 只读 attach（不导航）→ 仍被 about:blank 销毁 ⇒ 猎聘检测"CDP 控制页面"本身
 *   v7 patchright attach 日常 Chrome → 未验证成功
 *   v8（本探针）patchright **自己启动**真实 Chrome：pipe 传输（无 TCP 调试端口）、
 *      隐藏 CDP 自动化痕迹 + stealth 注入 —— 环境与真人手动一致（D-17a）
 *
 * 一次运行完成四件事：
 *   1. 环境一致性验证：页面是否存活（没被 about:blank 销毁）；
 *   2. 指纹自检：navigator.webdriver 应为 undefined；
 *   3. 夹具采集：保存列表页 HTML → test/fixtures/liepin-search.html
 *      （离线测试 test/platform/liepin.test.ts 检测到它才跑解析用例）；
 *   4. 接口采样：捕获 com.liepin.searchfront4c.pc-search-job 的请求体与响应
 *      JSON → test/fixtures/liepin-search-api.json（v2 接口化解析的校准数据）。
 *
 * 用法：
 *   npm run probe:liepin                    # 关键词默认 Java
 *   $env:LIEPIN_KEY='前端'; npm run probe:liepin
 *   $env:LIEPIN_PROFILE='D:\somewhere'; ... # 默认用仓库里的 .probe-liepin-profile
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：
 *   * 首次运行请在弹出的浏览器里手动登录猎聘（profile 会记住登录态）；
 *   * 被风控命中时**不要立刻重跑** —— 间隔拉长（≥30 分钟），并先在真人浏览器里
 *     正常访问一次猎聘确认账号状态（C12：命中即停，交人）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Request, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const KEYWORD = process.env['LIEPIN_KEY'] ?? 'Java'
/** 0 起（猎聘口径）。设 1 可验证 URL 翻页是否真换数据（对比 jobId 重叠）。 */
const PAGE = Math.max(0, Number.parseInt(process.env['LIEPIN_PAGE'] ?? '0', 10) || 0)
const PROFILE =
  process.env['LIEPIN_PROFILE'] ?? join(process.cwd(), '.probe-liepin-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const SEARCH_API_MARKER = 'com.liepin.searchfront4c.pc-search-job'

const PROBE_URL = `https://www.liepin.com/zhaopin/?key=${encodeURIComponent(KEYWORD)}&currentPage=${String(PAGE)}`

/** 探针 v7 用过的候选卡片选择器（统计命中率，辅助校准）。 */
const CARD_CANDIDATES = [
  "div[class*='job-card-pc-container']",
  '.job-card',
  '.job-card-pc-container',
  '.job-detail-card',
  '.position-card',
  '.job-card-wrapper',
  '.job-list-item',
  '.job-card-box',
  '.job-card-item',
]

function log(message: string): void {
  console.log(`[probe-liepin-v8] ${new Date().toISOString()} ${message}`)
}

interface ApiCapture {
  url: string
  method: string
  requestBody: string | null
  responseBody: string | null
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD}`)
  log(`profile：${PROFILE}`)
  log(`探测地址：${PROBE_URL}`)

  // 与主链同款发现逻辑：**系统真实 Chrome 优先**（patchright 自带的 Playwright
  // 发行版 Chromium 指纹库薄弱，且本机未必装过 —— 环境一致性要用真实 Chrome）。
  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath === undefined) {
    log('⚠️ 没找到系统 Chrome/Edge，交给 patchright 自行解析（可能退到发行版 Chromium，指纹较弱）')
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

  // D-17a 环境一致性三件套之二：stealth 注入（引擎本身是三件套之一）。
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })

  const page: Page = await context.newPage()

  // 接口采样：监听器必须挂在 goto **之前**（猎聘首屏就发搜索请求）。
  const apiCaptures: ApiCapture[] = []
  const pendingBodies = new Map<Request, string | null>()
  page.on('request', (request: Request) => {
    try {
      if (!request.url().includes(SEARCH_API_MARKER)) return
      if (request.url().includes('pc-search-job-cond-init')) return
      let body: string | null = null
      try {
        body = request.postData()
      } catch {
        body = null
      }
      pendingBodies.set(request, body)
    } catch {
      /* 监听本身不许炸 */
    }
  })
  page.on('response', (response: Response) => {
    try {
      if (!response.url().includes(SEARCH_API_MARKER)) return
      if (response.url().includes('pc-search-job-cond-init')) return
      if (response.status() !== 200) return
      const request = response.request()
      const captured: ApiCapture = {
        url: response.url(),
        method: request.method(),
        requestBody: pendingBodies.get(request) ?? null,
        responseBody: null,
      }
      pendingBodies.delete(request)
      void response
        .text()
        .then((text: string) => {
          captured.responseBody = text === '' ? null : text
          apiCaptures.push(captured)
        })
        .catch(() => {
          apiCaptures.push(captured)
        })
    } catch {
      /* 同上 */
    }
  })

  // ── 1. 导航 ─────────────────────────────────────────────────────────
  log('导航中（domcontentloaded，30s 超时）…')
  try {
    await page.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(6_000)

  const finalUrl = page.url()
  log(`final URL：${finalUrl}`)
  if (finalUrl.startsWith('about:')) {
    log('✘ 页面被销毁成 about:blank —— 环境一致性仍不够，猎聘识别出了自动化痕迹。')
    log('  下一步：不要立刻重跑；先用真人浏览器正常访问猎聘确认账号状态，间隔 ≥30 分钟再试。')
    log('  可排查项：patchright 版本、profile 是否被之前的风控标记（换个新 profile 试试）。')
    await context.close()
    process.exitCode = 1
    return
  }

  // ── 2. 指纹与页面状态 ───────────────────────────────────────────────
  const snapshot = await page.evaluate((cardCandidates: string[]) => {
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const hits: Record<string, number> = {}
    for (const selector of cardCandidates) {
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch {
        /* ignore */
      }
    }
    // 职位链接形态统计（适配器 jobIdPattern 的校准依据）
    const jobLinks: string[] = []
    for (const a of Array.from(document.querySelectorAll("a[href*='/job/']")).slice(0, 5)) {
      jobLinks.push(a.getAttribute('href') ?? '')
    }
    const companyLinks: string[] = []
    for (const a of Array.from(document.querySelectorAll("a[href*='/company/']")).slice(0, 5)) {
      companyLinks.push((a.textContent ?? '').replace(/\s+/g, ' ').trim())
    }
    return JSON.stringify({
      webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
      title: document.title,
      bodyLength: text.length,
      bodyHead: text.slice(0, 160),
      cardHits: hits,
      jobLinkSamples: jobLinks,
      companyLinkSamples: companyLinks,
      initialStateKeys:
        typeof (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__ === 'object'
          ? Object.keys(
              (window as unknown as { __INITIAL_STATE__: Record<string, unknown> }).__INITIAL_STATE__,
            )
          : null,
    })
  }, CARD_CANDIDATES)
  log(`页面快照：${snapshot}`)

  const webdriver = JSON.parse(snapshot)['webdriver'] as unknown
  // 真人手动 Chrome 里 navigator.webdriver === false（不是 undefined）；
  // 只有 === true 才说明自动化标志没藏住。
  if (webdriver === true) {
    log('⚠️ navigator.webdriver === true —— 引擎/stealth 未生效')
  } else {
    log(`navigator.webdriver = ${String(webdriver)}（与真人手动一致）`)
  }

  // ── 3. 落盘夹具 ─────────────────────────────────────────────────────
  // 文件名带页标记：第 1 页（currentPage=0）保持原名，后续页 -p2/-p3…，
  // 方便对比 jobId 重叠来验证 URL 翻页。
  const pageSuffix = PAGE === 0 ? '' : `-p${String(PAGE + 1)}`
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const html = await page.content()
  const fixturePath = join(FIXTURE_DIR, `liepin-search${pageSuffix}.html`)
  writeFileSync(fixturePath, html, 'utf8')
  log(`夹具已保存：${fixturePath}（${String(html.length)} 字符）`)

  await page.waitForTimeout(2_000) // 等迟到的接口响应文本收齐
  if (apiCaptures.length > 0) {
    const apiPath = join(FIXTURE_DIR, `liepin-search-api${pageSuffix}.json`)
    writeFileSync(apiPath, JSON.stringify(apiCaptures, null, 2), 'utf8')
    log(`接口采样已保存：${apiPath}（${String(apiCaptures.length)} 条）`)
  } else {
    log('（没捕获到搜索接口 —— 可能页面是 SSR 直出，或命中了风控降级；不影响 HTML 夹具）')
  }

  // ── 4. 结论 ─────────────────────────────────────────────────────────
  const cardCount = Number(JSON.parse(snapshot)['bodyLength'] ?? 0) > 0 ? 1 : 0
  log(cardCount > 0 ? '✔ 页面存活：环境一致性验证通过（D-17a 路线成立）' : '⚠️ 页面存活但正文为空，人工确认是否被降级')
  log('下一步：跑 npm test —— liepin 的离线解析用例会自动用上刚保存的夹具。')

  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
