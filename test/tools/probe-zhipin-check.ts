#!/usr/bin/env node
/**
 * BOSS 直聘「检测登录」诊断探针 —— 复刻 session.check() 的真实路径，抓误判证据。
 *
 * 背景：采集页点「检测登录」恒报未登录，但账号实际已登录。本探针回答：
 *   ① 应用那份持久 profile（$DSH_JOB_HUNTER_DATA_DIR/browser-profile）里到底有没有登录态？
 *      —— 用**地面真值**判：登录态下搜索页薪资非空 / 岗位链接带 securityId，
 *      这与适配器文件头记录的平台事实一致（未登录：薪资空、无 securityId）。
 *   ② `auth.isLoggedIn` 的两个锚点（a[ka="header-username"] / a[ka="header-login"]）
 *      在**真实搜索页**上到底命不命中？goto 刚返回时（旧代码行为）与等锚点后（新代码行为）各是什么样？
 *   ③ 页面最终停在哪（有没有被重定向到 guide / 登录页 / 滑块）？
 *
 * 用法（指向应用真实数据目录，与运行中的插件同一份 profile）：
 *   PowerShell:
 *     $env:DSH_JOB_HUNTER_DATA_DIR='C:\Users\<you>\AppData\Roaming\dsh-desktop\harness\job-hunter'
 *     node scripts/run-ts.mjs test/tools/probe-zhipin-check.ts
 *   环境变量：ZHIPIN_CHECK_PROFILE（直接给 profile 目录，优先于数据目录推导）
 *   ⚠️ 跑之前先关掉插件弹出的浏览器窗口（同一 profile 不能同时开两个实例）。
 */
import { chromium, type BrowserContext, type Page } from 'patchright'
import { join } from 'node:path'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { resolveDataDir } from '../../src/host/store/db.js'
import { DEFAULT_ZHIPIN_CONFIG } from '../../src/host/platform/adapters/zhipin/config.js'
import { isLoggedInByMarkersInPage } from '../../src/host/platform/adapters/zhipin/page/list.js'

const PROFILE =
  process.env['ZHIPIN_CHECK_PROFILE'] ?? join(resolveDataDir(), 'browser-profile')
/** 与适配器 auth.checkUrl 同源：搜索页（判据校准页）。 */
const CHECK_URL = 'https://www.zhipin.com/web/geek/job'
const LOGIN_URL = 'https://www.zhipin.com/web/user/'
const MARKER_LOGGED_IN = DEFAULT_ZHIPIN_CONFIG.loginSelectors.loggedIn
const MARKER_NOT_LOGGED_IN = DEFAULT_ZHIPIN_CONFIG.loginSelectors.notLoggedIn
const WAIT_MARKERS_MS = 15_000

function log(message: string): void {
  console.log(`[probe-zhipin-check] ${new Date().toISOString()} ${message}`)
}

/** 页面体检：锚点命中数 + 登录态地面真值（自包含，序列化进页面）。 */
async function scan(page: Page): Promise<{
  url: string
  title: string
  markerLoggedIn: number
  markerNotLoggedIn: number
  cards: number
  salaryFilled: number
  securityIdLinks: number
  bodyHead: string
  kaAttrs: string[]
}> {
  return await page.evaluate(
    (arg) => {
      const countOf = (selector: string): number => {
        try {
          return document.querySelectorAll(selector).length
        } catch {
          return -1
        }
      }
      let salaryFilled = 0
      try {
        for (const el of Array.from(document.querySelectorAll('.job-salary'))) {
          if ((el.textContent ?? '').replace(/\s+/g, ' ').trim() !== '') salaryFilled += 1
        }
      } catch {
        /* ignore */
      }
      const links = Array.from(document.querySelectorAll("a[href*='/job_detail/']"))
      return {
        url: location.href,
        title: document.title,
        markerLoggedIn: countOf(arg.markerLoggedIn),
        markerNotLoggedIn: countOf(arg.markerNotLoggedIn),
        cards: countOf('.job-card-wrap'),
        salaryFilled,
        securityIdLinks: links.filter((a) => (a.getAttribute('href') ?? '').includes('securityId'))
          .length,
        bodyHead: (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
        kaAttrs: Array.from(document.querySelectorAll('[ka]'))
          .slice(0, 40)
          .map((el) => `${el.tagName.toLowerCase()}[ka="${el.getAttribute('ka') ?? ''}"]`),
      }
    },
    { markerLoggedIn: MARKER_LOGGED_IN, markerNotLoggedIn: MARKER_NOT_LOGGED_IN },
  )
}

/** 与适配器同一份判据跑一遍（三态：true/false/null）。 */
async function verdictOf(page: Page): Promise<boolean | null> {
  return await page.evaluate(isLoggedInByMarkersInPage, {
    loggedIn: MARKER_LOGGED_IN,
    notLoggedIn: MARKER_NOT_LOGGED_IN,
  })
}

async function main(): Promise<void> {
  log(`profile：${PROFILE}`)
  log(`检测页：${CHECK_URL}`)
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

  // cookie 名单（不打印值）：登录态最硬的证据之一（wt2 / zp_user / __zp_stoken__ …）
  const cookies = await context.cookies('https://www.zhipin.com')
  log(`zhipin cookie 共 ${String(cookies.length)} 个：${cookies.map((c) => c.name).sort().join(', ')}`)

  // ── 1. 复刻 check()：goto 检测页（默认 waitUntil，与 PageLike.goto 一致）────────
  try {
    await page.goto(CHECK_URL, { timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // ① 旧代码行为：goto 一返回就判
  const t0 = await scan(page)
  log(`① goto 返回瞬间：url=${t0.url}`)
  log(`   锚点 loggedIn=${String(t0.markerLoggedIn)} notLoggedIn=${String(t0.markerNotLoggedIn)} → 判据=${String(await verdictOf(page))}`)

  // ② 新代码行为：等两个锚点任一出现（最多 15s），再判
  const found = await page
    .waitForSelector(`${MARKER_LOGGED_IN}, ${MARKER_NOT_LOGGED_IN}`, { timeout: WAIT_MARKERS_MS })
    .then(() => true)
    .catch(() => false)
  const t1 = await scan(page)
  log(`② 等锚点 ${found ? '命中' : `超时(${String(WAIT_MARKERS_MS)}ms)`} 后：url=${t1.url} title=${t1.title}`)
  log(
    `   锚点 loggedIn=${String(t1.markerLoggedIn)} notLoggedIn=${String(t1.markerNotLoggedIn)} → 判据=${String(await verdictOf(page))}`,
  )

  // ③ 地面真值：登录态的平台事实（薪资非空 / securityId / 卡片）
  log(
    `③ 地面真值：卡片=${String(t1.cards)} 薪资非空=${String(t1.salaryFilled)} securityId链接=${String(t1.securityIdLinks)}`,
  )
  log(`   正文开头：${t1.bodyHead}`)
  log(`   页面上全部 [ka] 属性（前 40 个）：${t1.kaAttrs.join(' ')}`)

  // ── 2. 对照：登录页上同样的判据（旧 bug 的现场）──────────────────────────────
  try {
    await page.goto(LOGIN_URL, { timeout: 30_000 })
  } catch {
    /* 登录页打不开就算了 */
  }
  const t2 = await scan(page)
  log(
    `④ 对照·登录页：url=${t2.url} 锚点 loggedIn=${String(t2.markerLoggedIn)} notLoggedIn=${String(t2.markerNotLoggedIn)} → 判据=${String(await verdictOf(page))}`,
  )

  // ── 3. 结论 ────────────────────────────────────────────────────────────────
  const groundTruth = t1.salaryFilled > 0 || t1.securityIdLinks > 0
  const adapterVerdict = await verdictOf(page).then(() => t1.markerLoggedIn > 0)
  log('──────── 结论 ────────')
  log(`地面真值（按平台事实）：${groundTruth ? '已登录' : '未登录'}`)
  log(`check() 在检测页上的结论：${adapterVerdict ? '已登录' : '未登录'}（锚点 loggedIn=${String(t1.markerLoggedIn)}）`)
  if (groundTruth && !adapterVerdict) {
    log('⛔ 复现了误判：真实已登录但 check() 判未登录 —— 用上面第 ②③ 步的证据定位锚点为什么不在。')
  } else if (!groundTruth) {
    log('⚠️ profile 里确实没有登录态：请在插件弹出的登录引导窗口里登录后重跑。')
  } else {
    log('✔ 判定与真值一致，问题不在这一层。')
  }

  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
