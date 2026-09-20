#!/usr/bin/env node
/**
 * LinkedIn 探针 —— 校准 guest 匿名端点与 base-card 锚点（适配器目前是 experimental）。
 *
 * ## 为什么这样设计（先读适配器文件头）
 *
 * LinkedIn 适配器的锚点来自多来源社区文档交叉验证的稳定结构（base-card 族），
 * **没有本仓自己的真机夹具**。这个探针要回答三件事：
 *
 *   1. **guest 端点还活着吗**：`/jobs-guest/jobs/api/seeMoreJobPostings/search`
 *      匿名可读是整个适配器的前提 —— 探针直接请求它（999/429/302→authwall 都会现形）；
 *   2. **锚点还灵不灵**：用真实响应走一遍适配器的解析代码（卡片数、urn id 命中率、
 *      公司/地点/时间/薪资命中率）—— 这正是升档 calibrated 的证据；
 *   3. **搜索页 authwall 现状**：手动跟跳搜索页 URL，把落点记录下来（INFO）——
 *      DOM 兜底通道依赖搜索页对游客 SSR 直出，落点若是 authwall 就只剩 guest 通道。
 *
 * ## 用法
 *
 *   npm run probe:linkedin
 *   $env:LINKEDIN_KEY='Frontend Engineer'; $env:LINKEDIN_CITY='China'
 *   $env:LINKEDIN_OFFLINE='1'; npm run probe:linkedin     # 只离线复跑上一次的抓取
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-linkedin-capture/guest-<日期>.html             guest 端点的卡片片段
 *   .probe-linkedin-capture/search-hops-<日期>.txt         搜索页跳转链
 *
 * ⚠️ 校准完成后，人工把 capture 里的片段复制为 `test/fixtures/linkedin-search.html`
 *    并把用例从合成样本换成真实夹具，才是"升档"那一步。
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）。LinkedIn 风控激进，
 *    **别连打**（§P5 保守优先）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLinkedInAdapter } from '../../src/host/platform/adapters/linkedin/index.js'
import { DEFAULT_LINKEDIN_CONFIG, type LinkedInConfig } from '../../src/host/platform/adapters/linkedin/config.js'
import { buildLinkedInGuestApiUrl, buildLinkedInSearchUrl } from '../../src/host/platform/adapters/linkedin/urls.js'
import { platformFacts } from '../../src/host/platform/platform-facts.js'
import type { RawJob } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const KEYWORD = process.env['LINKEDIN_KEY'] ?? 'Software Engineer'
const CITY = process.env['LINKEDIN_CITY'] ?? 'China'
const CAPTURE_DIR = process.env['LINKEDIN_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-linkedin-capture')
const OFFLINE_ONLY = process.env['LINKEDIN_OFFLINE'] === '1'
const TODAY = new Date().toISOString().slice(0, 10)

const CONFIG: LinkedInConfig = DEFAULT_LINKEDIN_CONFIG
const CRITERIA = { keyword: KEYWORD, city: CITY, page: 1 }

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-linkedin] ${new Date().toISOString()} ${message}`)
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

interface Hop {
  url: string
  status: number
  location: string | null
}

/** 手动跟跳：跳转链本身就是证据（302 → authwall 是地址级事实）。 */
async function follow(url: string): Promise<{ hops: Hop[]; finalUrl: string; finalHtml: string | null; finalStatus: number }> {
  const hops: Hop[] = []
  let current = url
  let finalHtml: string | null = null
  let finalStatus = 0

  for (let i = 0; i <= 5; i += 1) {
    let status = 0
    let location: string | null = null
    let body: string | null = null
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        headers: { accept: 'text/html,*/*', 'accept-language': 'en-US,en;q=0.9', 'user-agent': UA },
        signal: AbortSignal.timeout(30_000),
      })
      status = response.status
      location = response.headers.get('location')
      if (status >= 200 && status < 300) body = await response.text()
    } catch (error) {
      hops.push({ url: current, status: -1, location: error instanceof Error ? `请求异常：${error.message}` : '请求异常' })
      break
    }
    hops.push({ url: current, status, location })
    if (location === null || location === '' || status < 300 || status >= 400) {
      finalStatus = status
      finalHtml = body
      break
    }
    current = new URL(location, current).href
  }

  return { hops, finalUrl: current, finalHtml, finalStatus }
}

/**
 * 用真实适配器解析一份 guest 片段（与 npm test 走同一条解析代码）。
 *
 * 适配器是**导航式**（v2 结论：LinkedIn 的 CSP Trusted Types 让「fetch 回字符串再
 * 注入解析」在真机必抛错）—— 夹具页用 loader 在 gotoSearch 导航到 guest URL 时
 * 把片段换成文档内容，与真路径「浏览器渲染片段成文档」同构。
 */
async function analyze(fragment: string): Promise<{ jobs: RawJob[] }> {
  const adapter = createLinkedInAdapter({ config: CONFIG })
  const page = new JsdomPage({
    html: '<html><body></body></html>',
    url: 'about:blank',
    loader: () => fragment,
  })
  await adapter.crawl.gotoSearch(page, CRITERIA)
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)

  const withId = jobs.filter((job) => job.platformJobId !== '').length
  const withCompany = jobs.filter((job) => job.company !== '').length
  const withCity = jobs.filter((job) => job.city !== undefined && job.city !== '').length
  const withDate = jobs.filter((job) => job.publishedAt !== undefined && job.publishedAt !== '').length
  const withSalary = jobs.filter((job) => job.salaryRaw !== '').length
  INFO.push(
    `guest 片段：条数 ${String(jobs.length)} · id ${String(withId)}/${String(jobs.length)} · ` +
      `公司 ${String(withCompany)}/${String(jobs.length)} · 地点 ${String(withCity)}/${String(jobs.length)} · ` +
      `日期 ${String(withDate)}/${String(jobs.length)} · 薪资 ${String(withSalary)}/${String(jobs.length)}（可选展示，低是正常的）· ` +
      `hasNextPage=${String(hasNext)} · detectBlock=${block === null ? '无' : String(block)}`,
  )
  const sample = jobs[0]
  if (sample !== undefined) {
    INFO.push(`样本：${sample.title} | ${sample.company} | ${sample.city ?? ''} | ${sample.salaryRaw} | ${sample.sourceUrl}`)
  }
  return { jobs }
}

/** 离线复跑：挑最新的一份 guest 抓取。 */
function latestCapture(): string | null {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    log(`⚠️ 没有抓取目录：${CAPTURE_DIR} —— 先在线跑一次`)
    return null
  }
  const name = names.filter((item) => item.startsWith('guest-') && item.endsWith('.html')).sort().pop()
  if (name === undefined) {
    log(`⚠️ 抓取目录里没有 guest-<日期>.html：${CAPTURE_DIR}`)
    return null
  }
  return join(CAPTURE_DIR, name)
}

async function main(): Promise<void> {
  const facts = platformFacts('linkedin')
  log(`host：${CONFIG.host} · 关键词：${KEYWORD} · 地点：${CITY} · 当前成熟度：${facts.maturity.level}`)

  if (OFFLINE_ONLY) {
    const capture = latestCapture()
    if (capture === null) {
      process.exitCode = 1
      return
    }
    INFO.push(`离线复跑快照：${capture}`)
    const offline = await analyze(readFileSync(capture, 'utf8'))
    check('离线复跑：解析读数可用（条数见上）', offline.jobs.length >= 0)
  } else {
    // ── ① guest 端点（主通道前提） ─────────────────────────────────────
    const guestUrl = buildLinkedInGuestApiUrl(CONFIG, CRITERIA)
    log(`guest 端点：${guestUrl}`)
    const guest = await follow(guestUrl)

    const hitAuthwall = guest.hops.some((hop) => hop.url.includes('/authwall'))
    const blocked = guest.finalStatus === 999 || guest.finalStatus === 429 || hitAuthwall || guest.finalHtml === null
    INFO.push(
      `guest 端点：status=${String(guest.finalStatus)} · 跳数=${String(guest.hops.length)} · ` +
        `落点=${guest.finalUrl.slice(0, 110)}${hitAuthwall ? '（authwall）' : ''}`,
    )

    if (guest.finalHtml !== null) {
      mkdirSync(CAPTURE_DIR, { recursive: true })
      const path = join(CAPTURE_DIR, `guest-${TODAY}.html`)
      writeFileSync(path, guest.finalHtml, 'utf8')
      log(`快照已保存：${path}（${String(guest.finalHtml.length)} 字符）`)

      const reading = await analyze(guest.finalHtml)
      check('guest 端点匿名可读（适配器的前提）', !blocked)
      check('base-card 锚点命中（解析出岗位）', reading.jobs.length > 0, `${String(reading.jobs.length)} 条`)
      check(
        '岗位 id 全部命中（urn:li:jobPosting 或 /jobs/view/）',
        reading.jobs.length > 0 && reading.jobs.every((job) => job.platformJobId !== ''),
        `${String(reading.jobs.filter((job) => job.platformJobId !== '').length)}/${String(reading.jobs.length)}`,
      )
      check('sourceUrl 规范形态（/jobs/view/{id}）', reading.jobs.every((job) => !job.sourceUrl.includes('?')))
    } else {
      check(
        'guest 端点匿名可读（适配器的前提）',
        false,
        `status=${String(guest.finalStatus)} —— 若持续如此，需要改用带登录态的通道并更新 platform-facts`,
      )
    }

    // ── ② 搜索页（DOM 兜底通道的现状，只记录不判定） ────────────────────
    const searchUrl = buildLinkedInSearchUrl(CONFIG, CRITERIA)
    const search = await follow(searchUrl)
    const hopsText = search.hops
      .map((hop, index) => `跳 ${String(index + 1)}：${hop.url.slice(0, 120)} status=${String(hop.status)}`)
      .join('\n')
    mkdirSync(CAPTURE_DIR, { recursive: true })
    writeFileSync(join(CAPTURE_DIR, `search-hops-${TODAY}.txt`), `${searchUrl}\n\n${hopsText}\n`, 'utf8')
    INFO.push(
      `搜索页落点：${search.finalUrl.slice(0, 110)} status=${String(search.finalStatus)}` +
        (search.finalUrl.includes('/authwall') ? '（authwall —— DOM 兜底通道当前不可用，guest 通道是唯一依赖）' : '（未撞墙）'),
    )
  }

  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${String(PASS.length)} · FAIL ${String(FAIL.length)}`)
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  console.log('\n-- PASS --')
  for (const item of PASS) console.log(`  ✓ ${item}`)
  console.log('\n-- FAIL（需要改适配器/文档） --')
  for (const item of FAIL) console.log(`  ✗ ${item}`)
  console.log(
    `\n升档指引：全绿后把 ${join(CAPTURE_DIR, `guest-${TODAY}.html`)} 复制为 test/fixtures/linkedin-search.html，` +
      '换掉用例里的合成样本，再把 platform-facts 的 linkedin 升为 calibrated。',
  )
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch((error: unknown) => {
  console.error('探针异常：', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
