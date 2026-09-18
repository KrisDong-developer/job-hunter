#!/usr/bin/env node
/**
 * 拉勾「动作契约」探针 —— 抓取已登录详情页上「立即沟通 / 投递简历」按钮的真实 DOM。
 *
 * 目的：拉勾适配器的 `actions.sayHello / sendResume` 目前刻意 fail-closed（src/host/platform/
 * adapters/lagou.ts），因为没有**真机契约证据** —— 投递/沟通需要登录态 + 页面会话 anti-forge，
 * 且按钮层级未知。本探针把手动登录后的这块 DOM 抓下来，供校准出可靠选择器，之后才实现动作。
 *
 * 流程（复用 probe-zhipin 的登录等待套路 + 本仓 D-17a 三件套）：
 *   1. patchright **启动式** + 系统 Chrome + stealth 注入，打开一个岗位详情页；
 *   2. 未登录 → 弹窗指导手动登录（profile 记住登录态）；WAF 滑块页同理提示手动过；
 *   3. 登录且停留在详情页后，扫描「立即沟通 / 投递简历 / 收藏」等按钮，
 *      为每个按钮生成**候选选择器**（class/id/data-* + 最短唯一路径）；
 *   4. 落盘两份产物：
 *      - `test/fixtures/lagou-job-detail-logged.html`（登录态详情页快照）
 *      - `test/fixtures/lagou-action-contract.json`（按钮契约报告，含候选选择器）
 *
 * 用法：npm run probe:lagou-login
 * 环境变量：LAGOU_JOB_ID（详情 id，默认取调研里的 12888540）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const JOB_ID = process.env['LAGOU_JOB_ID'] ?? '12888540'
const PROFILE = process.env['LAGOU_LOGIN_PROFILE'] ?? join(process.cwd(), '.probe-lagou-login-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
const DETAIL_URL = `https://www.lagou.com/wn/jobs/${JOB_ID}.html`
const HTML_FIXTURE = join(FIXTURE_DIR, 'lagou-job-detail-logged.html')
const CONTRACT_FIXTURE = join(FIXTURE_DIR, 'lagou-action-contract.json')

const WAIT_TIMEOUT_MS = 4 * 60 * 1000
const POLL_MS = 3_000

function log(message: string): void {
  console.log(`[probe-lagou-login] ${new Date().toISOString()} ${message}`)
}

async function main(): Promise<void> {
  log(`详情 id：${JOB_ID} · profile：${PROFILE}`)
  log(`探测地址：${DETAIL_URL}`)

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

  // ── 1. 导航 ───────────────────────────────────────────────────────────
  log('导航到详情页…')
  try {
    await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(4_000)

  // ── 2. 登录 / WAF 等待（首次运行：手动在窗口里登录并完成滑块） ────────
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const url = page.url()
    if (/\bs\/list_/.test(url) || url.includes('verify')) {
      log('⛔ 检测到 WAF 滑块验证页 —— 请在浏览器窗口里手动完成滑块（探针会继续等待）')
    } else if (/login|passport|signin|reg/i.test(url)) {
      log('⏳ 当前在登录/注册页 —— 请在窗口里手动登录拉勾（最长等 4 分钟）')
    } else {
      // 详情页：已登录时常驻「立即沟通/投递」按钮；没登录会被引导到登录弹窗。
      const jobTitle = await page
        .evaluate(() => document.querySelector('.name h1, h1')?.textContent ?? '')
        .catch(() => '')
      if (jobTitle !== '') break
      log(`已在详情页但标题为空，等待渲染 / 登录（${url.slice(0, 100)}）`)
    }
    await page.waitForTimeout(POLL_MS)
  }
  const finalUrl = page.url()
  log(`当前地址：${finalUrl.slice(0, 140)}`)

  await page.waitForTimeout(4_000)

  // ── 3. 按钮契约扫描（自包含函数，序列化进页面执行） ───────────────────
  const report = await page
    .evaluate(() => {
      const markers = ['立即沟通', '投递简历', '投递', '收藏', '分享', '我要沟通']
      const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()

      // 从一个元素造候选选择器：`tag.class1.class2`（稳定优先，不依赖 id 哈希）。
      const candidateSelector = (el: Element): string => {
        const tag = el.tagName.toLowerCase()
        const classes = (el.getAttribute('class') ?? '')
          .split(/\s+/)
          .map((c) => c.trim())
          .filter((c) => c !== '')
        // 优先 id（站内唯一）；没 id 才退到 class 组合。
        const id = el.getAttribute('id')
        if (id !== null && id !== '') return `${tag}#${id}`
        return classes.length === 0 ? tag : `${tag}.${classes.join('.')}`
      }

      // 从元素一路向父级拼 `tag(#id)` 的路径，最长 6 段，便于人工判断唯一性。
      const cssPath = (el: Element): string => {
        const parts: string[] = []
        let node: Element | null = el
        while (node !== null && node !== document.documentElement && parts.length < 6) {
          const tag = node.tagName.toLowerCase()
          const id = node.getAttribute('id')
          parts.unshift(id !== null && id !== '' ? `${tag}#${id}` : tag)
          node = node.parentElement
        }
        return parts.join(' > ')
      }

      const found: Array<Record<string, unknown>> = []
      const all = Array.from(document.querySelectorAll('button, a, [role="button"], [class*="btn"], li'))
      for (const el of all) {
        const t = text(el)
        const marker = markers.find((m) => t.includes(m))
        if (marker === undefined) continue
        // 去重：父元素文本一样就不重复记录。
        const hasParentWithMarker = el.parentElement !== null && text(el.parentElement).includes(marker)
        if (hasParentWithMarker) continue
        const outer = el.outerHTML.length > 400 ? el.outerHTML.slice(0, 400) : el.outerHTML
        found.push({
          marker,
          text: t.slice(0, 40),
          tag: el.tagName.toLowerCase(),
          candidates: candidateSelector(el),
          cssPath: cssPath(el),
          dataAttrs: Object.fromEntries(
            Array.from(el.attributes)
              .filter((a) => a.name.startsWith('data-'))
              .map((a) => [a.name, a.value]),
          ),
          outerHTML: outer,
        })
      }
      return {
        loggedIn: document.querySelector('.user-nav, [class*="user-avatar"], [class*="head-avatar"], .avatar-box') !== null,
        isWaf: /请滑动滑块进行验证|为了更好的访问体验/.test(document.body?.textContent ?? ''),
        buttons: found,
      }
    })
    .catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }))

  log(`按钮契约报告：${JSON.stringify(report)}`)

  // ── 4. 落盘 ───────────────────────────────────────────────────────────
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const html = await page.content()
  writeFileSync(HTML_FIXTURE, html, 'utf8')
  log(`登录态详情页快照已保存：${HTML_FIXTURE}（${String(html.length)} 字符）`)

  writeFileSync(CONTRACT_FIXTURE, JSON.stringify({ url: page.url(), report }, null, 2), 'utf8')
  log(`动作契约已保存：${CONTRACT_FIXTURE}`)

  log('✔ 探针完成 —— 把这份契约里的候选选择器校准进适配器的 actions 配置后，sayHello/sendResume 才有真机依据。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})