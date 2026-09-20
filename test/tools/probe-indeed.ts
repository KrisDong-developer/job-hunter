#!/usr/bin/env node
/**
 * Indeed 探针 —— 复核「默认 host 确实不可用」，并给仍运营的国家域提供锚点校准入口。
 *
 * ## 为什么这样设计（先读适配器文件头）
 *
 * Indeed 中国大陆站（`cn.indeed.com`）已停运，适配器因此是 `disabled`：
 * 它**没有**可信的中国大陆夹具，锚点来自公开描述的 JCS 稳定结构。于是这个探针要做的
 * 不是"再确认一次选择器对不对"，而是两件更有用的事：
 *
 *   1. **复核停运这个事实本身**：`cn.indeed.com` 会被 302 送到别的域（地址级事实），
 *      或被 Cloudflare 挑战拦住。这两条都写在 `platform-facts.ts` 的 notes 与
 *      `block-signals.ts` 的 `expectedHost` 判据里 —— 探针把它们变成 PASS/FAIL，
 *      于是"这个平台为什么是 disabled"永远有当天的证据；
 *   2. **给换域启用留一条可走的路**：`INDEED_HOST=de.indeed.com`（或 sg / uk…）时，
 *      探针改为回答"这个域的锚点还灵不灵" —— 卡片数、`jk=` jobKey 命中率、翻页锚点、
 *      判墙读数。这正是适配器文件头承诺的"换一个仍运营的域 + 跑探针校准锚点"。
 *
 * ## 用法
 *
 *   npm run probe:indeed                        # 默认 host = cn.indeed.com（已停运）
 *   $env:INDEED_HOST='de.indeed.com'; npm run probe:indeed     # 校准一个仍运营的域
 *   $env:INDEED_KEY='Java'; $env:INDEED_CITY='Berlin'
 *   $env:INDEED_OFFLINE='1'; npm run probe:indeed              # 只离线复跑上一次的抓取
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-indeed-capture/search-<host>-<日期>.html    最终落地的页面（含跳转后的页）
 *
 * ⚠️ `test/fixtures/indeed-search.html` **不存在**（没有可信夹具就别造），本探针也不写它 ——
 *    换域校准完成后，人工把 capture 里的页面复制成该文件名并改用例，才是"启用"那一步。
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点。
 *    Cloudflare 在，**别连打**（§P5 保守优先）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createIndeedAdapter } from '../../src/host/platform/adapters/indeed/index.js'
import {
  DEFAULT_INDEED_CONFIG,
  type IndeedConfig,
} from '../../src/host/platform/adapters/indeed/config.js'
import type { RawJob } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const KEYWORD = process.env['INDEED_KEY'] ?? 'Java'
const CITY = process.env['INDEED_CITY'] ?? '深圳'
const HOST = process.env['INDEED_HOST'] ?? DEFAULT_INDEED_CONFIG.host
const CAPTURE_DIR = process.env['INDEED_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-indeed-capture')
const OFFLINE_ONLY = process.env['INDEED_OFFLINE'] === '1'
const TODAY = new Date().toISOString().slice(0, 10)
/** 默认 host 就是那个已停运的中国站 —— 探针据此切换断言口径。 */
const IS_DEFAULT_HOST = HOST === DEFAULT_INDEED_CONFIG.host
/** 手动跟跳的上限（够看清 cn → www → Cloudflare 这条链）。 */
const MAX_HOPS = 5

const CONFIG: IndeedConfig = { ...DEFAULT_INDEED_CONFIG, host: HOST }

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-indeed] ${new Date().toISOString()} ${message}`)
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

interface Hop {
  url: string
  status: number
  location: string | null
}

/**
 * 手动跟跳（`redirect: 'manual'`）。
 *
 * 为什么不用 `redirect: 'follow'`：**跳转本身就是证据**。"cn.indeed.com 把我们挪到
 * 别的域"这条地址级事实，只有逐跳看 `Location` 才拿得到；自动跟随会把它藏起来。
 */
async function follow(url: string): Promise<{ hops: Hop[]; finalUrl: string; finalHtml: string | null; finalStatus: number }> {
  const hops: Hop[] = []
  let current = url
  let finalHtml: string | null = null
  let finalStatus = 0

  for (let i = 0; i <= MAX_HOPS; i += 1) {
    let status = 0
    let location: string | null = null
    let body: string | null = null
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9', 'user-agent': UA },
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

/** 用真实适配器解析一份 HTML（与 npm test 走同一条解析代码）。 */
async function analyze(html: string, url: string, label: string): Promise<{ jobs: RawJob[]; block: string | null; hasNext: boolean }> {
  const adapter = createIndeedAdapter({ config: CONFIG })
  const page = new JsdomPage({ html, url })
  await adapter.crawl.gotoSearch(page, { keyword: KEYWORD })
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)

  const withKey = jobs.filter((job) => job.platformJobId !== '').length
  const withTitle = jobs.filter((job) => job.title !== '').length
  const withSalary = jobs.filter((job) => job.salaryRaw !== '').length
  const withCompany = jobs.filter((job) => job.company !== '').length
  INFO.push(
    `${label}：条数 ${String(jobs.length)} · jobKey ${String(withKey)}/${String(jobs.length)} · ` +
      `标题 ${String(withTitle)}/${String(jobs.length)} · 薪资 ${String(withSalary)}/${String(jobs.length)} · ` +
      `公司 ${String(withCompany)}/${String(jobs.length)} · hasNextPage=${String(hasNext)} · ` +
      `detectBlock=${block === null ? '无' : String(block)}`,
  )
  const sample = jobs[0]
  if (sample !== undefined) {
    INFO.push(`样本：${sample.title} | ${sample.company} | ${sample.city ?? ''} | ${sample.salaryRaw} | ${sample.sourceUrl}`)
  }
  return { jobs, block: block === null ? null : String(block), hasNext }
}

/** 离线复跑：挑该 host 最新的一份抓取。 */
function latestCapture(): { path: string; url: string } | null {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    log(`⚠️ 没有抓取目录：${CAPTURE_DIR} —— 先在线跑一次`)
    return null
  }
  const prefix = `search-${HOST.replace(/\./g, '_')}-`
  const name = names.filter((item) => item.startsWith(prefix) && item.endsWith('.html')).sort().pop()
  if (name === undefined) {
    log(`⚠️ 抓取目录里没有 ${prefix}<日期>.html：${CAPTURE_DIR}`)
    return null
  }
  const adapter = createIndeedAdapter({ config: CONFIG })
  return {
    path: join(CAPTURE_DIR, name),
    url: adapter.criteria.buildSearchUrl({ keyword: KEYWORD, city: CITY }) ?? '',
  }
}

async function main(): Promise<void> {
  log(`host：${HOST}${IS_DEFAULT_HOST ? '（适配器默认值 = 已停运的中国站）' : '（自定义域：按"校准锚点"口径断言）'} · 关键词：${KEYWORD} · 地点：${CITY}`)

  if (OFFLINE_ONLY) {
    const capture = latestCapture()
    if (capture === null) {
      process.exitCode = 1
      return
    }
    INFO.push(`离线复跑快照：${capture.path}`)
    const offline = await analyze(readFileSync(capture.path, 'utf8'), capture.url, '离线')
    check('离线复跑：解析读数可用（条数见上）', true, `${String(offline.jobs.length)} 条`)
  } else {
    const adapter = createIndeedAdapter({ config: CONFIG })
    // Indeed 的 buildSearchUrl 从不返回 null（地点是自由文本、无城市码表）；这里只是满足签名
    const url = adapter.criteria.buildSearchUrl({ keyword: KEYWORD, city: CITY, page: 1 }) ?? ''
    log(`探测地址：${url}`)
    const result = await follow(url)

    for (const [index, hop] of result.hops.entries()) {
      const hopHost = hostOf(hop.url)
      const next = hop.location === null || hop.location === '' ? '' : ` → ${hop.location.slice(0, 120)}`
      INFO.push(`跳 ${String(index + 1)}：${hopHost} status=${String(hop.status)}${next}`)
    }

    const crossedHost = result.hops.length > 1
    /** 地址级/传输级就已经被挡下：跨了域，或首跳根本不是 200。 */
    const blockedAtHttp = crossedHost || (result.hops[0]?.status ?? 0) !== 200
    INFO.push(`跳数=${String(result.hops.length)} 最终=${result.finalUrl.slice(0, 120)} status=${String(result.finalStatus)}`)

    if (result.finalHtml === null) {
      INFO.push('最终一跳没有响应体（被拒 / 挑战 / 非 2xx）—— 这正是 disabled 的形态之一')
      check(
        IS_DEFAULT_HOST ? '默认 host 的停运状态与 platform-facts 一致（地址级拦下）' : '自定义域拿到了页面',
        IS_DEFAULT_HOST ? blockedAtHttp : false,
        IS_DEFAULT_HOST ? `跳数=${String(result.hops.length)} status=${String(result.hops[0]?.status ?? -1)}` : '自定义域没返回页面 —— 换一个域再试',
      )
    } else {
      const reading = await analyze(result.finalHtml, result.finalUrl, '在线')
      if (IS_DEFAULT_HOST) {
        // 停运的域：期望有明确结论（跨域/非 200/验证墙），而不是"看起来正常却 0 条"
        check(
          '默认 host 的停运状态与 platform-facts 一致（跨域跳转 / 非 200 / 验证墙）',
          blockedAtHttp || reading.block !== null,
          `detectBlock=${reading.block ?? '无'} · 解析出 ${String(reading.jobs.length)} 条 —— 若两者都"正常"，说明它已恢复可用，需人工复核 platform-facts`,
        )
      } else {
        check('自定义域解析出岗位（卡片锚点 a.jcs-JobTitle 命中）', reading.jobs.length > 0, `${String(reading.jobs.length)} 条`)
        check('自定义域判墙未误报', reading.block === null, `detectBlock=${reading.block ?? '无'}`)
        check(
          'jobKey 全部命中（jk= 平台 id）',
          reading.jobs.length > 0 && reading.jobs.every((job) => job.platformJobId !== ''),
          `${String(reading.jobs.filter((job) => job.platformJobId !== '').length)}/${String(reading.jobs.length)}`,
        )
        check('翻页锚点可用（a[data-testid=pagination-page-next]）', reading.hasNext, `hasNextPage=${String(reading.hasNext)}`)
      }

      mkdirSync(CAPTURE_DIR, { recursive: true })
      const path = join(CAPTURE_DIR, `search-${HOST.replace(/\./g, '_')}-${TODAY}.html`)
      writeFileSync(path, result.finalHtml, 'utf8')
      log(`快照已保存：${path}（${String(result.finalHtml.length)} 字符）`)
    }
  }

  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${String(PASS.length)} · FAIL ${String(FAIL.length)}`)
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  console.log('\n-- PASS --')
  for (const item of PASS) console.log(`  ✓ ${item}`)
  console.log('\n-- FAIL（需要改适配器/文档） --')
  for (const item of FAIL) console.log(`  ✗ ${item}`)
  console.log(`\n退出码：${FAIL.length === 0 ? '0（结论与文档一致）' : '1'}`)
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch((error: unknown) => {
  console.error('探针异常：', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
