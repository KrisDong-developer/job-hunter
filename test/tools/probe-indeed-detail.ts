#!/usr/bin/env node
/**
 * Indeed（cn.indeed.com）「详情页」探针 —— 补 `platform-facts` 里记的缺口：详情页未测、日期锚点无源。
 *
 * ## 背景（2026-09-21 登录态探针的遗留缺口）
 *
 * `probe:indeed-login` 已定案：cn 站可用、列表锚点全中、`auth.isLoggedIn` 落地。但两件事没证据：
 *   * **详情页（`/viewjob?jk=`）结构一无所知** → `detail.extract` 不存在（fail-closed）；
 *   * **列表页日期 0 命中**（`jobListingDate` 在那批页面不存在）—— 发布日期唯一的希望
 *     是详情页（Indeed 详情页有 JSON-LD `JobPosting` 载荷的话，`datePosted` /
 *     `validThrough` / `baseSalary` 都是结构化字段，比 DOM 稳得多）。
 *
 * ## 它怎么取证（只读，不点任何投递/沟通入口）
 *
 *   1. 复用登录态 profile（`.probe-indeed-profile`，登录探针已登录 + cf_clearance）；
 *   2. 打开搜索页（默认 = 用户证据 URL），从 `a.jcs-JobTitle` 的 href 里抠 `jk=`
 *      拼 `https://{host}/viewjob?jk=<key>`（与适配器列表解析同一套规范化）；
 *   3. 依次打开前 N 个详情页（默认 3），每页采三类证据：
 *      - **JSON-LD**：`script[type="application/ld+json"]` → `JobPosting` 的结构化字段
 *        （datePosted / validThrough / baseSalary / hiringOrganization / jobLocation）；
 *      - **结构发现**（权威证据，不猜）：全页 data-testid 聚合 + 标题层级（h1/h2/h3）+
 *        testid/class/id 含 title|company|location|salary|date|description 的节点清单；
 *      - **候选锚点**（公开稳定形态的假设，命中数跨页对比，以结构发现为准）。
 *      另跑一遍适配器自己的 `detectBlockWithSignals`（详情页也在 expectedHost 上，判墙口径同一条）。
 *   4. 落盘 `.probe-indeed-capture/`（`.probe*` 已 gitignore）：
 *      - `indeed-detail-<NN>-<日期>.html`   每个详情页整页快照
 *      - `indeed-detail-report-<日期>.json` 逐页证据 + 跨页候选命中汇总
 *
 * ⚠️ 只读取证：不点「申请」/「投递」/任何沟通入口（Indeed actions 无契约，与登录探针同边界）。
 *
 * ## 用法
 *
 *   npm run probe:indeed-detail
 *   $env:INDEED_URL='https://cn.indeed.com/jobs?...'   # 换搜索页（默认 = 用户证据 URL）
 *   $env:INDEED_KEY='Java'; $env:INDEED_CITY='广州'     # 或按关键词/地点构造
 *   $env:INDEED_DETAIL_COUNT='5'                        # 打开几个详情页（默认 3）
 *   $env:INDEED_PROFILE / INDEED_CAPTURE_DIR
 *
 * ⚠️ 手动跑一次的校准工具（§14）：访问真实站点，别连打（§P5）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import {
  DEFAULT_INDEED_CONFIG,
  INDEED_BLOCK_SIGNALS,
  indeedBlockFlags,
} from '../../src/host/platform/adapters/indeed/config.js'
import type { IndeedConfig } from '../../src/host/platform/adapters/indeed/config.js'
import { buildIndeedSearchUrl } from '../../src/host/platform/adapters/indeed/urls.js'
import { detectBlockWithSignals, signalsOf } from '../../src/host/platform/block-signals.js'

/** 用户 2026-09-21 提供的证据 URL（与登录探针同一条，保真原样）。 */
const USER_EVIDENCE_URL =
  'https://cn.indeed.com/jobs?q=&l=%E5%B9%BF%E5%B7%9E%E5%B8%82&from=searchOnHP%2Cwhereautocomplete&vjk=6544fa41aeb898dc'

const HOST = process.env['INDEED_HOST'] ?? DEFAULT_INDEED_CONFIG.host
const CONFIG: IndeedConfig = { ...DEFAULT_INDEED_CONFIG, host: HOST }
const KEYWORD = process.env['INDEED_KEY'] ?? ''
const CITY = process.env['INDEED_CITY'] ?? ''
const SEARCH_URL =
  process.env['INDEED_URL'] !== undefined && process.env['INDEED_URL'] !== ''
    ? process.env['INDEED_URL']
    : KEYWORD !== '' || CITY !== ''
      ? buildIndeedSearchUrl(CONFIG, { keyword: KEYWORD, city: CITY, page: 1 })
      : USER_EVIDENCE_URL
/** 复用登录探针的 profile：已登录 + cf_clearance（登一次，两个探针都受益）。 */
const PROFILE = process.env['INDEED_PROFILE'] ?? join(process.cwd(), '.probe-indeed-profile')
const CAPTURE_DIR = process.env['INDEED_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-indeed-capture')
const DETAIL_COUNT = Math.min(6, Math.max(1, Number(process.env['INDEED_DETAIL_COUNT'] ?? '3')))
const TODAY = new Date().toISOString().slice(0, 10)
const MAX_HTML_CHARS = 6_000_000

function log(message: string): void {
  console.log(`[probe-indeed-detail] ${new Date().toISOString()} ${message}`)
}

/* ── 页面上下文探针（自包含：必须能被序列化送进浏览器） ─────────────── */

interface NodeInfo {
  tag: string
  cls: string
  testid: string | null
  id: string
  textHead: string
}

interface DetailPageProbe {
  url: string
  title: string
  bodyTextLength: number
  headings: NodeInfo[]
  /** testid/class/id 命中字段关键词的节点（结构发现的主体 —— 定锚点的第一手证据）。 */
  keywordNodes: NodeInfo[]
  testids: Array<{ id: string; count: number }>
  /** JSON-LD 载荷（Indeed 详情页若带 JobPosting，datePosted/salary 都在这里 —— 比 DOM 稳）。 */
  jsonLd: Array<{
    type: string
    title: string
    datePosted: string
    validThrough: string
    employmentType: string
    companyName: string
    locationText: string
    salaryText: string
    descriptionLength: number
    descriptionHead: string
    otherKeys: string[]
    parseError: string | null
  }>
  candidateHits: Array<{ selector: string; count: number; sample: string }>
}

/**
 * 候选锚点 = Indeed 详情页公开多年稳定形态的**假设**，命中数跨页对比用；
 * 真正定锚以 keywordNodes / testids / jsonLd 的证据为准（ADAPTERS.md §6：不编）。
 */
const DETAIL_CANDIDATES = [
  'h1',
  'h2[data-testid="jobsearch-JobInfoHeader-title"]',
  '[data-testid="jobsearch-JobInfoHeader-title"]',
  '[data-testid="inlineHeader-companyName"]',
  '[data-testid="inlineHeader-companyLocation"]',
  '[data-testid="company-name"]',
  '[data-testid="text-location"]',
  '[data-testid="attribute_snippet_testid"]',
  '[data-testid="jobListingDate"]',
  '#jobDescriptionText',
  '[data-testid="jobDescriptionText"]',
  '.jobsearch-JobMetadataHeader-item',
]

const probeDetailPage = (arg: { candidates: string[]; keywordRe: string }): DetailPageProbe => {
  const clean = (value: string | null | undefined): string =>
    value === null || value === undefined ? '' : value.replace(/\s+/g, ' ').trim()
  const describe = (el: Element): NodeInfo => ({
    tag: el.tagName.toLowerCase(),
    cls: clean(el.getAttribute('class')).slice(0, 120),
    testid: el.getAttribute('data-testid'),
    id: clean(el.getAttribute('id')).slice(0, 80),
    textHead: clean(el.textContent).slice(0, 160),
  })

  const headings: NodeInfo[] = []
  try {
    for (const el of Array.from(document.querySelectorAll('h1, h2, h3'))) {
      if (headings.length >= 30) break
      headings.push(describe(el))
    }
  } catch {
    /* ignore */
  }

  let keywordRe: RegExp | null = null
  try {
    keywordRe = new RegExp(arg.keywordRe, 'i')
  } catch {
    keywordRe = null
  }
  const keywordNodes: NodeInfo[] = []
  if (keywordRe !== null) {
    try {
      for (const el of Array.from(document.querySelectorAll('[data-testid], [id], [class]'))) {
        if (keywordNodes.length >= 80) break
        const hay = `${el.getAttribute('data-testid') ?? ''} ${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`
        if (!keywordRe.test(hay)) continue
        const text = clean(el.textContent)
        if (text === '') continue
        keywordNodes.push(describe(el))
      }
    } catch {
      /* ignore */
    }
  }

  const testidCounts = new Map<string, number>()
  try {
    for (const el of Array.from(document.querySelectorAll('[data-testid]'))) {
      const id = el.getAttribute('data-testid') ?? ''
      if (id === '') continue
      testidCounts.set(id, (testidCounts.get(id) ?? 0) + 1)
    }
  } catch {
    /* ignore */
  }

  const jsonLd: DetailPageProbe['jsonLd'] = []
  try {
    for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      const raw = clean(script.textContent)
      if (raw === '') continue
      let data: unknown = null
      let parseError: string | null = null
      try {
        data = JSON.parse(raw)
      } catch (error) {
        parseError = error instanceof Error ? error.message.slice(0, 100) : 'parse error'
      }
      const record = (node: unknown): void => {
        const obj = node as Record<string, unknown> | null
        if (obj === null || typeof obj !== 'object') return
        const readText = (key: string): string => {
          const value = obj[key]
          if (typeof value === 'string') return clean(value)
          if (typeof value === 'number') return String(value)
          return ''
        }
        const org = obj['hiringOrganization'] as Record<string, unknown> | undefined
        const loc = obj['jobLocation'] as Record<string, unknown> | undefined
        const address = loc?.['address'] as Record<string, unknown> | undefined
        const salary = obj['baseSalary'] as Record<string, unknown> | undefined
        const salaryValue = salary?.['value'] as Record<string, unknown> | undefined
        const description = readText('description')
        jsonLd.push({
          type: readText('@type'),
          title: readText('title'),
          datePosted: readText('datePosted'),
          validThrough: readText('validThrough'),
          employmentType: readText('employmentType'),
          companyName:
            typeof org?.['name'] === 'string' ? clean(org['name'] as string) : '',
          locationText:
            typeof address?.['addressLocality'] === 'string'
              ? clean(`${String(address['addressLocality'] ?? '')} ${String(address['addressRegion'] ?? '')} ${String(address['addressCountry'] ?? '')}`)
              : typeof loc === 'object' && loc !== null
                ? clean(JSON.stringify(loc).slice(0, 120))
                : '',
          salaryText:
            salary === undefined
              ? ''
              : clean(
                  `${String(salary['currency'] ?? '')} ${String(salaryValue?.['minValue'] ?? salary['value'] ?? '')}-${String(salaryValue?.['maxValue'] ?? '')} ${String(salary['unitText'] ?? '')}`,
                ).slice(0, 120),
          descriptionLength: description.length,
          descriptionHead: description.slice(0, 200),
          otherKeys: Object.keys(obj)
            .filter(
              (key) =>
                ![
                  '@type',
                  'title',
                  'datePosted',
                  'validThrough',
                  'employmentType',
                  'hiringOrganization',
                  'jobLocation',
                  'baseSalary',
                  'description',
                ].includes(key),
            )
            .slice(0, 30),
          parseError: null,
        })
      }
      if (parseError !== null) {
        jsonLd.push({
          type: '',
          title: '',
          datePosted: '',
          validThrough: '',
          employmentType: '',
          companyName: '',
          locationText: '',
          salaryText: '',
          descriptionLength: 0,
          descriptionHead: '',
          otherKeys: [],
          parseError: parseError === null ? null : `${parseError}；原文头：${raw.slice(0, 120)}`,
        })
        continue
      }
      // JSON-LD 可能是数组或含 @graph
      if (Array.isArray(data)) {
        for (const item of data) record(item)
      } else if (data !== null && typeof data === 'object') {
        const graph = (data as Record<string, unknown>)['@graph']
        if (Array.isArray(graph)) {
          for (const item of graph) record(item)
        }
        record(data)
      }
      if (jsonLd.length >= 8) break
    }
  } catch {
    /* ignore */
  }

  const candidateHits: DetailPageProbe['candidateHits'] = []
  for (const selector of arg.candidates) {
    let nodes: Element[] = []
    try {
      nodes = Array.from(document.querySelectorAll(selector))
    } catch {
      nodes = []
    }
    if (nodes.length === 0) continue
    candidateHits.push({
      selector,
      count: nodes.length,
      sample: clean(nodes[0]?.textContent).slice(0, 120),
    })
  }

  return {
    url: location.href,
    title: document.title,
    bodyTextLength: clean(document.body?.textContent).length,
    headings,
    keywordNodes,
    testids: Array.from(testidCounts.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 80),
    jsonLd,
    candidateHits,
  }
}

/** 从搜索列表页取前 N 个详情地址（自包含；与适配器同款 jk= 规范化）。 */
const collectDetailUrls = (arg: { titleLink: string; host: string; jobKeyPattern: string; limit: number }): string[] => {
  const out: string[] = []
  let keyRe: RegExp | null = null
  try {
    keyRe = new RegExp(arg.jobKeyPattern)
  } catch {
    keyRe = null
  }
  try {
    for (const link of Array.from(document.querySelectorAll(arg.titleLink))) {
      if (out.length >= arg.limit) break
      const href = link.getAttribute('href') ?? ''
      if (href === '') continue
      const match = keyRe !== null ? keyRe.exec(href) : null
      const key = match !== null && match[1] !== undefined ? match[1] : ''
      if (key === '') continue
      const url = `https://${arg.host}/viewjob?jk=${key}`
      if (!out.includes(url)) out.push(url)
    }
  } catch {
    /* ignore */
  }
  return out
}

/* ── 宿主侧 ─────────────────────────────────────────────────────────── */

interface NetworkEntry {
  at: string
  method: string
  url: string
  resourceType: string
  status: number | null
  bodyHead: string | null
}

interface DetailCapture {
  index: number
  detailUrl: string
  snapshotFile: string
  probe: DetailPageProbe | null
  block: string | null
}

async function main(): Promise<void> {
  log(`搜索页：${SEARCH_URL}`)
  log(`profile：${PROFILE}（复用登录探针的登录态）· 详情页数：${String(DETAIL_COUNT)}`)
  log('⚠️ 只读取证：不点申请/投递/沟通入口。')

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

  const network: NetworkEntry[] = []
  const networkSeen = new Set<string>()
  const attachNetwork = (page: Page): void => {
    page.on('response', (response: Response) => {
      try {
        const url = response.url()
        let host = ''
        try {
          host = new URL(url).hostname
        } catch {
          return
        }
        if (!/(^|\.)indeed\.com$/.test(host)) return
        if (host.startsWith('account.') || host.startsWith('secure.')) return // 凭据域：不采样
        if (!['xhr', 'fetch'].includes(response.request().resourceType())) return
        const key = `${response.request().method()} ${url}`
        if (networkSeen.has(key) || network.length >= 150) return
        networkSeen.add(key)
        const contentType = response.headers()['content-type'] ?? ''
        const entry: NetworkEntry = {
          at: new Date().toISOString(),
          method: response.request().method(),
          url: url.slice(0, 300),
          resourceType: response.request().resourceType(),
          status: response.status(),
          bodyHead: null,
        }
        network.push(entry)
        if (/json|text/.test(contentType)) {
          void response
            .text()
            .then((body: string) => {
              entry.bodyHead = body === '' ? null : body.slice(0, 6_000)
            })
            .catch(() => undefined)
        }
      } catch {
        /* ignore */
      }
    })
  }
  for (const page of context.pages()) attachNetwork(page)
  context.on('page', (page) => {
    attachNetwork(page)
  })
  const page: Page = context.pages()[0] ?? (await context.newPage())

  /* ── 1. 搜索页 → 取真实详情链接 ─────────────────────────────────────── */
  log('打开搜索页取详情链接…')
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: unknown) => {
    log(`导航失败：${error instanceof Error ? error.message : String(error)}`)
  })
  await page.waitForTimeout(8_000)

  const searchBlock = await page
    .evaluate(detectBlockWithSignals, {
      signals: signalsOf(INDEED_BLOCK_SIGNALS),
      card: CONFIG.selectors.titleLink,
      flags: indeedBlockFlags(CONFIG.host),
    })
    .catch((): null => null)
  if (searchBlock !== null) {
    log(`✘ 搜索页判墙（${String(searchBlock)}）—— 详情取证终止。请先跑 probe:indeed-login 恢复登录态/过 Cloudflare。`)
    await context.close().catch(() => undefined)
    process.exitCode = 1
    return
  }

  const detailUrls = await page
    .evaluate(collectDetailUrls, {
      titleLink: CONFIG.selectors.titleLink,
      host: CONFIG.host,
      jobKeyPattern: CONFIG.jobKeyPattern,
      limit: DETAIL_COUNT,
    })
    .catch((): string[] => [])
  if (detailUrls.length === 0) {
    log('✘ 列表页没抠到 jk= 链接 —— 终止。')
    await context.close().catch(() => undefined)
    process.exitCode = 1
    return
  }
  log(`取得 ${String(detailUrls.length)} 个详情地址：${detailUrls.map((url) => url.slice(0, 60)).join(' | ')}`)

  /* ── 2. 逐个详情页取证 ─────────────────────────────────────────────── */
  const captures: DetailCapture[] = []
  for (const [index, detailUrl] of detailUrls.entries()) {
    log(`打开详情 #${String(index + 1)}：${detailUrl}`)
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch((error: unknown) => {
      log(`详情页导航失败：${error instanceof Error ? error.message : String(error)}`)
    })
    await page.waitForTimeout(7_000)

    const block = await page
      .evaluate(detectBlockWithSignals, {
        signals: signalsOf(INDEED_BLOCK_SIGNALS),
        card: CONFIG.selectors.titleLink,
        flags: indeedBlockFlags(CONFIG.host),
      })
      .catch((): string => 'evaluate-error')
    const probe = await page
      .evaluate(probeDetailPage, {
        candidates: DETAIL_CANDIDATES,
        keywordRe: 'title|company|location|salary|date|description|header|posted',
      })
      .catch((): null => null)

    let snapshotFile = '(未取到 HTML)'
    let html = ''
    try {
      html = await page.content()
    } catch {
      html = ''
    }
    if (html !== '') {
      const truncated = html.length > MAX_HTML_CHARS
      mkdirSync(CAPTURE_DIR, { recursive: true })
      snapshotFile = `indeed-detail-${String(index + 1).padStart(2, '0')}-${TODAY}.html`
      writeFileSync(
        join(CAPTURE_DIR, snapshotFile),
        truncated ? html.slice(0, MAX_HTML_CHARS) : html,
        'utf8',
      )
    }

    captures.push({
      index: index + 1,
      detailUrl,
      snapshotFile,
      probe,
      block: block === null ? null : String(block),
    })
    const ld = probe?.jsonLd.find((item) => item.type === 'JobPosting') ?? null
    log(
      `✔ #${String(index + 1)} 判墙=${block === null ? '无' : String(block)} · ` +
        `h1/h2=${String(probe?.headings.slice(0, 2).map((h) => `${h.tag}:${h.textHead.slice(0, 30)}`).join(' / ') ?? '')} · ` +
        `JSON-LD=${ld === null ? '无' : `${ld.title.slice(0, 30)} · datePosted=${ld.datePosted} · salary=${ld.salaryText.slice(0, 24)}`}`,
    )
  }

  /* ── 3. 跨页候选命中汇总 + 落盘 ───────────────────────────────────── */
  const crossPage = DETAIL_CANDIDATES.map((selector) => {
    const hits = captures
      .map((capture) => capture.probe?.candidateHits.find((hit) => hit.selector === selector)?.count ?? 0)
    return { selector, perPage: hits, pagesHit: hits.filter((n) => n > 0).length }
  })

  const report = {
    updatedAt: new Date().toISOString(),
    searchUrl: SEARCH_URL,
    detailCount: detailUrls.length,
    captures,
    /** 跨页稳定候选（pagesHit = 详情页数 → 可作为锚点；以 captures[].probe.keywordNodes 为准绳）。 */
    crossPage,
    network,
    nextSteps: [
      '挑「crossPage.pagesHit = 全部页」且样本文本正确的选择器实现 detail.extract；',
      'JSON-LD JobPosting 若存在，datePosted/validThrough/baseSalary 优先走结构化字段（比 DOM 稳）；',
      '把某一份快照钉成 test/fixtures/indeed-detail.html 并写用例；platform-facts 的 detail 缺口按证据补。',
    ],
  }
  mkdirSync(CAPTURE_DIR, { recursive: true })
  const reportPath = join(CAPTURE_DIR, `indeed-detail-report-${TODAY}.json`)
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  log(`详情报告已保存：${reportPath}`)
  for (const row of crossPage.filter((item) => item.pagesHit > 0)) {
    log(`  候选 ${row.selector} → 命中 ${String(row.pagesHit)}/${String(detailUrls.length)} 页（${row.perPage.join(',')}）`)
  }

  await context.close().catch(() => undefined)
  log('✔ 探针完成（只读取证）。')
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
