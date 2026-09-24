import type { BrowserPage } from '../../../platform/browser.js'
import type { EnrichmentCandidateDto } from '../../../../shared/contract/dto/job.js'
import type { EnrichmentProvider, LookupOutcome } from '../../types.js'

/**
 * 天眼查浏览器操作（provider）—— 只管导航 / 输入 / 判墙 / 拿 HTML，
 * 解析在 extractor、匹配在 matcher，页面改版各改各的。
 *
 * ⚠️ 为什么必须走真实浏览器而不是 HTTP：2026-09-24 实测，裸请求（哪怕带上
 * 首页种的 5 个 Cookie + Referer）访问 /search 或 /company 一律 302 到登录页
 * ——服务器要求 JS 执行后种下的风控指纹（重定向里的 `_fccc`）。真实浏览器
 * + 正常导航是唯一通道，这正是本 provider 存在的意义。
 *
 * 导航序列是拟人的（用户要求的"点搜索框搜索"路径）：
 *   落地首页（种 Cookie）→ 聚焦搜索框 → CDP 键盘输入 → 回车 → 等结果。
 * 输入用 `keyboard.insertText`（CDP Input 域，isTrusted 事件）——绝不改 DOM value。
 */

const BASE = 'https://www.tianyancha.com'
/** 选择器纪律：只用语义锚点（placeholder / href 前缀 / 文本），绝不用 `_cc76e` 这类构建混淆类。 */
const SEARCH_INPUT = 'input[placeholder^="请输入公司名称"]'
const COMPANY_LINK = 'a[href^="/company/"]'
const WAIT_RESULT_MS = 10_000
const POLL_STEP_MS = 600

/** 撞墙判定用的页面文本特征（在页面上下文里取正文判断）。 */
const pageText = (page: BrowserPage): Promise<string> =>
  page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? '', null)

/** 判墙：登录页 URL / 人机验证文案。宁误报不硬闯 —— 撞墙就停，绝不绕过。 */
async function blockedOf(page: BrowserPage): Promise<{ kind: 'blocked'; reason: 'login-wall' | 'captcha' } | null> {
  if (page.url().includes('/login')) return { kind: 'blocked', reason: 'login-wall' }
  const text = await pageText(page)
  if (/滑动验证|拖动滑块|请完成验证|安全验证/.test(text)) return { kind: 'blocked', reason: 'captcha' }
  return null
}

/** 轮询等页面文本出现标志词（waitForSelector 只认选择器，文本标志自己轮）。 */
async function waitForMarker(page: BrowserPage, marker: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = await pageText(page)
    if (text.includes(marker)) return true
    await page.waitForTimeout(POLL_STEP_MS)
  }
  return false
}

/** 结果页 → 候选列表（页面上下文 evaluate：自包含函数，选择器从参数传）。 */
async function readCandidatesOf(page: BrowserPage): Promise<EnrichmentCandidateDto[]> {
  return await page.evaluate((selector: string) => {
    const out: Array<{ name: string; status: string | null; creditCode: string | null; url: string }> = []
    const seen = new Set<string>()
    for (const anchor of Array.from(document.querySelectorAll(selector)) as HTMLAnchorElement[]) {
      const href = anchor.getAttribute('href') ?? ''
      if (seen.has(href)) continue
      seen.add(href)
      const name = (anchor.innerText ?? '').split('\n')[0]?.trim() ?? ''
      if (name === '') continue
      // 状态 / 信用代码在结果卡片的邻近文本里，取卡片级文本再正则
      const card = anchor.closest('div, li, section')?.textContent ?? ''
      const status = card.match(/(存续|在业|注销|吊销|迁出|清算)/)?.[1] ?? null
      const creditCode = card.match(/[0-9A-Z]{18}/)?.[0] ?? null
      out.push({ name, status, creditCode, url: href })
      if (out.length >= 8) break
    }
    return out
  }, COMPANY_LINK)
}

export const tianyanchaProvider: EnrichmentProvider = {
  id: 'tianyancha',

  async search(name, page): Promise<LookupOutcome> {
    // ① 落地首页：让页面 JS 种下风控 Cookie（裸导航深链会被 302 的根因）
    await page.goto(BASE)
    const inputReady = (await page.waitForSelector?.(SEARCH_INPUT, 8_000)) ?? false
    if (!inputReady) {
      const blocked = await blockedOf(page)
      return blocked ?? { kind: 'blocked', reason: 'timeout' }
    }

    // ② 拟人输入：聚焦 + CDP 键盘（insertText 走 Input 域，isTrusted）。
    //    keyboard 缺失（离线夹具等）时降级为浏览器内直接导航 search?key=
    //    —— 读数据场景允许（不是发送类高危动作），且仍在真实浏览器上下文里。
    if (page.keyboard !== undefined) {
      await page.evaluate((selector: string) => {
        const input = document.querySelector(selector) as HTMLInputElement | null
        input?.focus()
        input?.select()
      }, SEARCH_INPUT)
      await page.keyboard.insertText(name)
      await page.keyboard.press('Enter')
    } else {
      await page.goto(`${BASE}/search?key=${encodeURIComponent(name)}`)
    }

    // ③ 等结果。**必须先等 URL 离开首页**：首页的推荐位/热搜榜本身就带
    //    /company/ 链接，直接查选择器会把首页推荐当成搜索结果 —— 那是最危险的
    //    一类错（张冠李戴的工商数据）。导航到 /search 后再等结果链接。
    const deadline = Date.now() + WAIT_RESULT_MS
    while (Date.now() < deadline) {
      const blocked = await blockedOf(page)
      if (blocked !== null) return blocked
      if (!page.url().includes('/search')) {
        await page.waitForTimeout(POLL_STEP_MS)
        continue
      }
      const hasResults = await page.evaluate(
        (selector: string) => document.querySelector(selector) !== null,
        COMPANY_LINK,
      )
      if (hasResults) {
        const items = await readCandidatesOf(page)
        return items.length === 0 ? { kind: 'empty' } : { kind: 'candidates', items }
      }
      await page.waitForTimeout(POLL_STEP_MS)
    }
    return { kind: 'blocked', reason: 'timeout' }
  },

  async readCandidates(page): Promise<EnrichmentCandidateDto[]> {
    return await readCandidatesOf(page)
  },

  async fetchDetail(path, page) {
    const url = path.startsWith('http') ? path : `${BASE}${path}`
    await page.goto(url)
    // 详情页标志：信用代码或"法定代表人"出现即认为正文就绪（hydration 混合页）
    const ready = await waitForMarker(page, '法定代表人', WAIT_RESULT_MS)
    if (!ready) {
      const blocked = await blockedOf(page)
      return blocked ?? { kind: 'blocked', reason: 'timeout' }
    }
    const html = await page.evaluate(() => document.documentElement.outerHTML, null)
    return { html, url: page.url() }
  },
}
