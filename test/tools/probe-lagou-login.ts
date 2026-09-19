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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'

const JOB_ID = process.env['LAGOU_JOB_ID'] ?? '12888540'
/**
 * ⚠️ **与 `probe:lagou` 共用同一份 profile**（2026-09-19 改）。
 * 以前是 `.probe-lagou-login-profile`，于是"过 WAF + 登录"这件事要**做两遍**：
 * 列表探针在 A 里过一次，登录探针在 B 里还得再登一次。同一个人两个 profile，
 * 白白多花一次人工操作（而人工操作正是这两个探针里最贵的一环）。
 */
const PROFILE = process.env['LAGOU_PROFILE'] ?? join(process.cwd(), '.probe-lagou-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
/** 与 `probe:lagou` 共写的锚点证据（只记 tag/class，不记文案）。 */
const AUTH_MARKERS_PATH = join(FIXTURE_DIR, 'lagou-auth-markers.json')
const DETAIL_URL = `https://www.lagou.com/wn/jobs/${JOB_ID}.html`
/**
 * 列表页 URL —— **锚点扫描必须在这一页做**。
 *
 * 为什么：`probe:lagou` 采的"未登录侧"是在**列表页**上扫的（页头在那一页）。
 * 如果在详情页上扫"已登录侧"，就是拿**两个不同页面**的页头做对比 ——
 * 拉勾详情页和列表页的页头未必同一套 DOM，那样比出来的"判别式"是假的。
 * 关键词/城市与 `probe:lagou` 保持同一组默认值。
 */
const LIST_URL = `https://www.lagou.com/jobs/list_${process.env['LAGOU_KEY'] ?? 'Java'}?city=${encodeURIComponent(
  process.env['LAGOU_CITY'] ?? '北京',
)}&px=new`
/**
 * "登录已完成"的**存在性探针**。
 *
 * ⚠️ 这组选择器是**未登录侧实测为 0** 的那几个（见 `lagou-auth-markers.json` 的
 * anonymous.hits：`.user-nav`/`.avatar`/`.username`/`.user-name` 全 0）。
 * 用它当等待条件，而不是用"详情页标题非空" —— 后者**未登录时也非空**
 * （刚采的匿名详情页 929KB、标题齐全），照着等会在用户登录**之前**就往下走，
 * 然后把**未登录态**写成"已登录侧"锚点。
 */
const LOGIN_PRESENCE_PROBE =
  'a[href*="logout"], .user-nav, .username, .user-name, img[class*="avatar"]'
/**
 * 登录页地址 —— **实测得来，不是猜的**。
 *
 * 2026-09-19 那次跑：点列表页的 `<a class="login">登录</a>`（它**没有 href**，由 JS 跳转）
 * 之后，页面落到这个地址：
 * `https://passport.lagou.com/login/login.html?service=https%3A%2F%2Fwww.lagou.com%2F&action=login`
 * `service` 参数是登录成功后的回跳目标。既然有了真实地址，就直接导航过去 ——
 * 用户少一步点击，而且不用依赖那个 `<a>` 的可点性。
 */
const LOGIN_URL =
  'https://passport.lagou.com/login/login.html?service=https%3A%2F%2Fwww.lagou.com%2F&action=login'
const HTML_FIXTURE = join(FIXTURE_DIR, 'lagou-job-detail-logged.html')
const CONTRACT_FIXTURE = join(FIXTURE_DIR, 'lagou-action-contract.json')

const WAIT_TIMEOUT_MS = Math.max(1, Number(process.env['LAGOU_WAIT_MIN'] ?? '12')) * 60 * 1000
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

  // ── 1. 导航：直接打开**登录页**（地址实测得来，见 LOGIN_URL） ──────────
  //
  // 已登录时 passport 会按 `service` 参数回跳（不会停在登录页），所以这一步对两种状态都安全：
  // 已登录 ⇒ 直接进下一段（标记检查立即通过）；未登录 ⇒ 停在登录页等你操作。
  log(`导航到登录页…${LOGIN_URL}`)
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(6_000)
  log(`当前地址：${page.url().slice(0, 140)}`)

  // ── 2. 登录 / WAF 等待（首次运行：手动在窗口里登录并完成滑块） ────────
  //
  // ⚠️ 这条循环改过两次，两个坑都值得留着：
  //   ① 等待条件**不能**是"详情页标题非空" —— 未登录时标题照样齐全（匿名详情页 929KB），
  //      于是第一次循环就 break，把**未登录态**写成"已登录侧"锚点。现在等的是**登录标记**。
  //   ② 早先的写法把"查标记"放在了 `else` 分支里（只有不在登录页时才查）⇒
  //      用户在登录页时**永远不查标记**，只能等登录成功后站点自己跳回 www 才可能 break；
  //      一旦跳转慢或被拦，登录成功了也照样超时。现在**每轮都查**，URL 只用来打提示。
  let sawLoginMarker = false
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const url = page.url()
    const state = await page
      .evaluate(
        (selector: string) => {
          let loggedIn = false
          try {
            loggedIn = document.querySelector(selector) !== null
          } catch {
            loggedIn = false
          }
          return { loggedIn }
        },
        LOGIN_PRESENCE_PROBE,
      )
      .catch(() => ({ loggedIn: false }))
    if (state.loggedIn) {
      sawLoginMarker = true
      log('✔ 看到登录标记 —— 认为已登录')
      break
    }
    const remainSec = Math.round((deadline - Date.now()) / 1000)
    const hint =
      /\bs\/list_/.test(url) || url.includes('verify')
        ? '⛔ WAF 滑块页 —— 请在窗口里完成滑块'
        : /login|passport|signin|reg/i.test(url)
          ? '⏳ 登录页 —— 请在窗口里完成登录（扫码/账号密码）'
          : '⏳ 等登录标记出现'
    log(`${hint} · 还剩 ${String(remainSec)}s · ${url.slice(0, 90)}`)
    await page.waitForTimeout(POLL_MS)
  }
  if (!sawLoginMarker) {
    log(
      `⚠️ 等满 ${String(Math.round(WAIT_TIMEOUT_MS / 60_000))} 分钟仍未看到登录标记 ⇒ ` +
        '后面**不写**"已登录侧"锚点（宁可缺证据，也不能把未登录态记成已登录）',
    )
  }
  const finalUrl = page.url()
  log(`当前地址：${finalUrl.slice(0, 140)}`)

  // 从列表页切到详情页做契约扫描（第 1 步现在从列表页起步，所以这里要显式跳一次）。
  // 只在登录成功后才跳：契约（「立即沟通」候选）只有在登录态才有意义。
  if (sawLoginMarker) {
    log(`切到详情页做按钮契约扫描…${DETAIL_URL}`)
    try {
      await page.goto(DETAIL_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(6_000)
    } catch (error) {
      log(`详情页导航失败：${error instanceof Error ? error.message : String(error)}`)
    }
  } else {
    log('⚠️ 未登录 ⇒ 停在列表页，不跳详情页（契约与快照都不写）')
  }

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

  // ── 3.5 登录态锚点扫描（**已登录侧**）────────────────────────────────
  // 候选表从 `probe:lagou` 写的 `lagou-auth-markers.json` 里读 —— **一处定义、两处使用**，
  // 免得两个探针各写一份候选而漂移。
  // ⚠️ 扫描函数在这里**就地内联**而不是 import 另一个探针：`probe-lagou.ts` 末尾就是
  //    `void main()`，import 它会直接把那个浏览器的 main 也跑起来。
  try {
    const previous = ((): { candidates?: string[] } => {
      try {
        return JSON.parse(readFileSync(AUTH_MARKERS_PATH, 'utf8')) as { candidates?: string[] }
      } catch {
        return {}
      }
    })()
    const candidates = previous.candidates ?? []
    if (!sawLoginMarker) {
      log('⚠️ 没等到登录标记 ⇒ **跳过**已登录侧锚点扫描（不写假的"已登录"证据）')
    } else if (candidates.length === 0) {
      log('⚠️ 读不到候选表（先跑一次 npm run probe:lagou）—— 跳过已登录侧锚点扫描')
    } else {
      // **回到列表页再扫** —— 未登录侧是在列表页扫的，两侧必须同一页型才可比。
      log(`回到列表页扫锚点：${LIST_URL}`)
      try {
        await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForTimeout(8_000)
      } catch (error) {
        log(`列表页导航失败：${error instanceof Error ? error.message : String(error)}`)
      }
      const markers = await page
        .evaluate(
          (arg: { candidates: string[] }) => {
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
          },
          { candidates },
        )
        .catch(() => null)
      if (markers !== null) {
        writeFileSync(
          AUTH_MARKERS_PATH,
          JSON.stringify(
            { ...previous, loggedIn: markers, updatedAt: new Date().toISOString() },
            null,
            2,
          ),
          'utf8',
        )
        log(
          `已登录侧锚点：${markers.hits.map((hit) => `${hit.selector}=${String(hit.count)}`).join(' ') || '(一个都没命中)'}`,
        )
      }
    }
  } catch (error) {
    log(`锚点扫描失败：${error instanceof Error ? error.message : String(error)}`)
  }

  // ── 4. 落盘（**只在真的登录了之后**）──────────────────────────────────
  //
  // ⚠️ 这两个文件的名字都带"logged"。2026-09-19 第一次跑时超时未登录，却照样把它们写了 ——
  //    结果是**名不副实**的证据：`lagou-job-detail-logged.html` 其实是未登录快照，
  //    而测试会把它当"已登录夹具"用。所以现在**没登录就什么都不写**。
  mkdirSync(FIXTURE_DIR, { recursive: true })
  if (!sawLoginMarker) {
    log('⚠️ 未登录 ⇒ 不写 `lagou-job-detail-logged.html` / `lagou-action-contract.json`（写了就是假证据）')
  } else {
    const html = await page.content()
    writeFileSync(HTML_FIXTURE, html, 'utf8')
    log(`登录态详情页快照已保存：${HTML_FIXTURE}（${String(html.length)} 字符）`)

    writeFileSync(CONTRACT_FIXTURE, JSON.stringify({ url: page.url(), report }, null, 2), 'utf8')
    log(`动作契约已保存：${CONTRACT_FIXTURE}`)
  }

  log('✔ 探针完成 —— 把这份契约里的候选选择器校准进适配器的 actions 配置后，sayHello/sendResume 才有真机依据。')
  await context.close()
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})