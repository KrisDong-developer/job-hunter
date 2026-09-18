#!/usr/bin/env node
/**
 * BOSS 直聘探针 v1 —— 复用猎聘 v8 验证过的路线：
 * patchright **启动式** + 系统 Chrome + stealth 注入（D-17a 三件套）。
 *
 * BOSS 与猎聘的差异（docs/ADAPTERS.md §7.1）：
 *   * BOSS 检测 CDP 痕迹，但强度低于猎聘 —— BossHunter 用 CDP attach 日常 Chrome
 *     都能跑完整发送流；patchright 启动式理应更稳；
 *   * 未登录访问 /web/geek/job 会跳登录页 → 本探针**等待手动登录**（最长 3 分钟）；
 *   * 风控滑块 URL：https://www.zhipin.com/web/user/safe/verify-slider（get_jobs 实证）
 *     → 提示手动完成，等 URL 离开滑块页；
 *   * 站点规则：岗位链接必须带完整 securityId 参数（BossHunter site-patterns）。
 *
 * 一次运行完成：环境验证 + 登录等待 + 夹具保存（test/fixtures/zhipin-search.html）
 * + 列表接口采样（positionlist）。用法：npm run probe:zhipin
 * 首次运行请在弹出的浏览器里手动登录 BOSS（profile 会记住登录态）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const KEYWORD = process.env['ZHIPIN_KEY'] ?? 'Java'
/** 城市码来自 BossHunter 的 boss_cities.json（第一方：zhipin 官方 cityGroup 接口）。 */
const CITY_CODE = process.env['ZHIPIN_CITY_CODE'] ?? '101280600'
const PROFILE = process.env['ZHIPIN_PROFILE'] ?? join(process.cwd(), '.probe-zhipin-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const PROBE_URL = `https://www.zhipin.com/web/geek/job?query=${encodeURIComponent(KEYWORD)}&city=${CITY_CODE}`
/** BOSS 列表接口（BossHunter/get_jobs 经验：列表数据走 wapi positionlist）。 */
const SEARCH_API_MARKER = 'positionlist'

const LOGIN_TIMEOUT_MS = 3 * 60 * 1000
const POLL_MS = 3_000

function log(message: string): void {
  console.log(`[probe-zhipin] ${new Date().toISOString()} ${message}`)
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 城市码：${CITY_CODE}`)
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

  const apiCaptures: Array<{ url: string; body: string | null }> = []
  page.on('response', (response: Response) => {
    try {
      if (!response.url().includes(SEARCH_API_MARKER)) return
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

  // ── 1. 导航（未登录会被重定向到登录页） ─────────────────────────────
  log('导航中…')
  try {
    await page.goto(PROBE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(4_000)

  // ── 2. 登录等待（首次运行：手动在弹出的窗口里登录） ─────────────────
  const deadline = Date.now() + LOGIN_TIMEOUT_MS
  while (Date.now() < deadline) {
    const url = page.url()
    if (url.includes('verify-slider') || url.includes('safe/verify')) {
      log('⛔ 检测到滑块验证页 —— 请在浏览器窗口里手动完成滑块（探针会继续等待）')
    } else if (/\/web\/user\/|signin|\/login/.test(url)) {
      log('⏳ 当前在登录页 —— 请在浏览器窗口里手动登录 BOSS（最长等 3 分钟）')
    } else if (url.includes('/web/geek/job')) {
      break
    }
    await page.waitForTimeout(POLL_MS)
  }
  if (!page.url().includes('/web/geek/job')) {
    log('✘ 等待登录超时 / 被重定向到未知页面，本次探测中止（profile 已保留，登录后重跑即可）')
    await context.close()
    process.exitCode = 1
    return
  }
  log(`已就位：${page.url()}`)

  // 等列表渲染（SPA）
  await page.waitForTimeout(6_000)

  // ── 3. 指纹与页面快照 ───────────────────────────────────────────────
  const snapshot = await page.evaluate(() => {
    const text = (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    const hits: Record<string, number> = {}
    for (const selector of ['.job-card-wrap', '.job-card-box', '.job-name', '.job-salary', '.company-name', '.boss-name', '.job-card-left']) {
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch {
        /* ignore */
      }
    }
    // securityId 检查（BossHunter 站点规则：岗位链接必须带完整 securityId）
    const jobLinks = Array.from(document.querySelectorAll("a[href*='/job_detail/'], a[href*='/job/']"))
      .slice(0, 3)
      .map((a) => a.getAttribute('href') ?? '')
    const withSecurityId = jobLinks.filter((href) => href.includes('securityId')).length
    return JSON.stringify({
      webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
      title: document.title,
      bodyLength: text.length,
      bodyHead: text.slice(0, 160),
      cardHits: hits,
      jobLinkSamples: jobLinks.map((href) => href.slice(0, 120)),
      securityIdHit: `${String(withSecurityId)}/${String(jobLinks.length)}`,
    })
  })
  log(`页面快照：${snapshot}`)
  const parsed = JSON.parse(snapshot) as { webdriver?: unknown; securityIdHit?: string }
  log(`navigator.webdriver = ${String(parsed.webdriver)}${parsed.webdriver === true ? ' ⚠️ 引擎未生效' : '（与真人一致）'}`)
  log(`岗位链接带 securityId：${parsed.securityIdHit ?? '?'}（BossHunter 规则：必须带全）`)

  // ── 4. 落盘夹具 ─────────────────────────────────────────────────────
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const html = await page.content()
  const fixturePath = join(FIXTURE_DIR, 'zhipin-search.html')
  writeFileSync(fixturePath, html, 'utf8')
  log(`夹具已保存：${fixturePath}（${String(html.length)} 字符）`)

  await page.waitForTimeout(2_000)
  if (apiCaptures.length > 0) {
    const apiPath = join(FIXTURE_DIR, 'zhipin-search-api.json')
    writeFileSync(apiPath, JSON.stringify(apiCaptures, null, 2), 'utf8')
    log(`接口采样已保存：${apiPath}（${String(apiCaptures.length)} 条）`)
  }

  log('✔ 探测完成 —— 跑 npm test，zhipin 的离线解析用例会自动用上夹具。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
