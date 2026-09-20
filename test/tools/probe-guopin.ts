#!/usr/bin/env node
/**
 * 国聘网探针 —— 校准国聘适配器（`adapters/guopin/index.ts`）的真实线上夹具。
 *
 * 国聘是政府背景平台（antiBot=low，见适配器文件头），风控强度低，用 patchright
 * 启动式 + 系统真实 Chrome 即可（与主题一致但不需猎聘那种端口守卫/stealth 排查）。
 *
 * 一次运行完成四件事：
 *   1. **夹具采集**：访问 `https://www.iguopin.com/jobList?keyword=<kw>`，
 *      保存列表页 HTML → `test/fixtures/guopin-search.html`；
 *      设置 `GUOPIN_PAGE=2`（或任意 >1 的页码猜测）再跑一次会存 `guopin-search-pN.html`，
 *      对比 jobId 重叠即可**验证分页参数**（适配器目前 `hasNextPage=false` 正卡在这里）。
 *   2. **选择器校准输出**：统计候选卡片 class 的命中数（帮助把 `container` 那段宽松
 *      `closest()` 收紧成精确 class），并采样岗位详情链接与公司链接 href 形态。
 *   3. **解析 CLI**：用 jsdom 离线加载刚保存的夹具，跑 `extractJobsInPage` 与
 *      `detectBlockWithSignals`（共享判墙函数），打印命中统计（与 `npm test` 走同一条解析代码）。
 *   4. **结论**：给出「页面是否存活 / 解析到几条 / 组件该往哪修」的读数。
 *
 * 用法：
 *   npm run probe:guopin                      # 关键词默认 Java
 *   $env:GUOPIN_KEY='前端'; npm run probe:guopin
 *   $env:GUOPIN_PAGE='2'; ...                # 验证分页参数是否真换数据（存 -p2 夹具）
 *   $env:GUOPIN_PROFILE='D:\somewhere'; ...  # 默认用仓库 .probe-guopin-profile
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化测试的一部分（§14）：
 *   它会访问真实国聘网。别对着线上频繁连打，间隔拉长即可（国聘无强风控）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { detectBlockWithSignals, signalsOf } from '../../src/host/platform/block-signals.js'
import {
  DEFAULT_GUOPIN_CONFIG,
  GUOPIN_BLOCK_SIGNALS,
} from '../../src/host/platform/adapters/guopin/config.js'
import { extractJobsInPage } from '../../src/host/platform/adapters/guopin/page.js'
import { JsdomPage } from '../support/jsdom-page.js'

const KEYWORD = process.env['GUOPIN_KEY'] ?? 'Java'
/** 页码猜测（验证分页用；1 起）。适配器目前单页，只在确证参数后改为可传。 */
const PAGE = Math.max(1, Number.parseInt(process.env['GUOPIN_PAGE'] ?? '1', 10) || 1)
const PROFILE = process.env['GUOPIN_PROFILE'] ?? join(process.cwd(), '.probe-guopin-profile')
const FIXTURE_DIR = join(process.cwd(), 'test', 'fixtures')
/** 只离线分析已存夹具（`GUOPIN_OFFLINE=1`），不访问真实站点、不校验选择器更新后的命中。 */
const OFFLINE_ONLY = process.env['GUOPIN_OFFLINE'] === '1'

/* 列表卡片 class 候选 —— 帮收紧 `GuopinSelectors.container`。 */
const CARD_CANDIDATES = [
  'li[class*="job"]',
  'li[class*="item"]',
  'div[class*="job-card"]',
  'div[class*="job-item"]',
  'div[class*="list-item"]',
  'div[class*="position"]',
]

function log(message: string): void {
  console.log(`[probe-guopin] ${new Date().toISOString()} ${message}`)
}

/** 对一份已落盘的夹具跑一遍离线「判墙+解析」（与 npm test 走同一条解析代码）。 */
async function analyzeFixture(fixturePath: string): Promise<void> {
  log(`离线解析夹具：${fixturePath}`)
  const url = `${DEFAULT_GUOPIN_CONFIG.urlParams.base}?${DEFAULT_GUOPIN_CONFIG.urlParams.keywordParam}=${encodeURIComponent(KEYWORD)}`
  const jsdomPage = new JsdomPage({ html: readFileSync(fixturePath, 'utf8'), url })

  // 判墙走**共享函数**（P17）：通用词表 + 国聘自己那几条，在宿主侧组装好再送进页面
  const block = await jsdomPage.evaluate(detectBlockWithSignals, {
    signals: signalsOf(GUOPIN_BLOCK_SIGNALS),
    card: DEFAULT_GUOPIN_CONFIG.selectors.card,
  })
  log(`detectBlock → ${block === null ? '无（页面正常）' : block}`)

  const jobs = await jsdomPage.evaluate(extractJobsInPage, DEFAULT_GUOPIN_CONFIG)
  const withId = jobs.filter((job) => job.platformJobId !== '').length
  const withSalary = jobs.filter((job) => job.salaryRaw !== '').length
  const withCompany = jobs.filter((job) => job.company !== '').length
  log(
    `extractJobs → ${String(jobs.length)} 条 · 命中 id ${String(withId)} · 命中薪资 ${String(withSalary)} · ` +
      `命中公司 ${String(withCompany)}（薪资命中本该 0：列表卡片无薪资）`,
  )
  const sample = jobs[0]
  if (sample !== undefined) {
    log(
      `  样本：${sample.title} | ${sample.city}${sample.district ?? ''} | exp=${sample.expReq ?? ''} edu=${sample.eduReq ?? ''} | ` +
        `company=${sample.company} | info=${(sample.companyNature ?? '')}/${(sample.companySize ?? '')}/${(sample.industry ?? '')}`,
    )
  }
  jsdomPage.close()
}

async function main(): Promise<void> {
  const pageSuffix = PAGE === 1 ? '' : `-p${String(PAGE)}`
  const fixturePath = join(FIXTURE_DIR, `guopin-search${pageSuffix}.html`)
  if (OFFLINE_ONLY) {
    await analyzeFixture(fixturePath)
    return
  }

  log(`关键词：${KEYWORD} · 页码猜测：${String(PAGE)}`)
  log(`profile：${PROFILE}`)
  const keywordParam = PAGE === 1 ? KEYWORD : `_page${String(PAGE)}_${KEYWORD}`
  const probeUrl = `https://www.iguopin.com/jobList?keyword=${encodeURIComponent(keywordParam)}`
  log(`探测地址：${probeUrl}`)

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath !== undefined) log(`浏览器：${executablePath}`)

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

  log('导航中（domcontentloaded，30s 超时）…')
  try {
    await page.goto(probeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  await page.waitForTimeout(5_000)
  log(`final URL：${page.url()}`)

  // ── 1. 选择器校准快照 ─────────────────────────────────────────────────
  const snapshot = await page.evaluate((cardCandidates: string[]) => {
    const hits: Record<string, number> = {}
    for (const selector of cardCandidates) {
      try {
        const count = document.querySelectorAll(selector).length
        if (count > 0) hits[selector] = count
      } catch {
        /* ignore */
      }
    }
    const detailLinks: string[] = []
    for (const a of Array.from(document.querySelectorAll('a[href*="job/detail"], a[href*="/job?"]')).slice(0, 5)) {
      detailLinks.push(a.getAttribute('href') ?? '')
    }
    const companyLinks: string[] = []
    for (const a of Array.from(document.querySelectorAll('a[href*="/company"]')).slice(0, 5)) {
      companyLinks.push((a.textContent ?? '').replace(/\s+/g, ' ').trim())
    }
    // 公司性质/规模/行业行样本（`国企1000-2000人XX业`）。
    const metaLines: string[] = []
    const bodyText = document.body?.textContent ?? ''
    for (const m of Array.from(bodyText.matchAll(/招聘信息|(国企|民营|事业单位|上市公司)[\s\S]{0,30}?人[\s\S]{0,20}?业/g)).slice(0, 5)) {
      metaLines.push((m[0] ?? '').replace(/\s+/g, ' ').trim())
    }
    return JSON.stringify({
      title: document.title,
      bodyLength: bodyText.replace(/\s+/g, '').length,
      cardHits: hits,
      detailLinkSamples: detailLinks,
      companyLinkSamples: companyLinks,
      metaLineSamples: metaLines,
    })
  }, CARD_CANDIDATES)
  log(`页面快照：${snapshot}`)

  // ── 2. 落盘夹具 ───────────────────────────────────────────────────────
  mkdirSync(FIXTURE_DIR, { recursive: true })
  const html = await page.content()
  writeFileSync(fixturePath, html, 'utf8')
  log(`夹具已保存：${fixturePath}（${String(html.length)} 字符）`)

  await context.close()

  // ── 3. 离线解析 + 判墙 CLI（与 npm test 走同一条解析代码）──────────────
  await analyzeFixture(fixturePath)
}

void main().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})