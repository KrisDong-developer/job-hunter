#!/usr/bin/env node
/**
 * BOSS 直聘「字段覆盖」诊断探针 —— 回答"抓取漏了哪些字段"。
 *
 * 做法（全部走**生产路径**，不用手搓解析）：
 *   1. 用应用的真实 profile 打开搜索页（与采集完全同源）；
 *   2. `extractJobsInPage`（生产 DOM 解析）→ 得到**今天实际入库的形状**；
 *   3. 抓 `wapi/zpgeek/search/joblist.json`（页面自然发出的响应；没有就用生产
 *      `fetchJoblistInPage` 补一发）→ 得到**平台手里有的全部字段**；
 *   4. 按 `encryptJobId ↔ platformJobId` 连接，逐个字段统计覆盖率，
 *      输出"接口有、我们没存"的清单 + DOM 卡片结构对照。
 *
 * 用法（与应用同一份数据目录，复用登录态）：
 *   $env:DSH_JOB_HUNTER_DATA_DIR='<…>\dsh-desktop\harness\job-hunter'
 *   node scripts/run-ts.mjs test/tools/probe-zhipin-fields.ts
 *   环境变量：ZHIPIN_KEY / ZHIPIN_CITY_CODE / ZHIPIN_CHECK_PROFILE（同 probe-zhipin-check）
 *   ⚠️ 跑之前关掉插件弹出的浏览器窗口（同一 profile 不能双开）。
 */
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Response } from 'patchright'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import { resolveDataDir } from '../../src/host/store/db.js'
import { DEFAULT_ZHIPIN_CONFIG } from '../../src/host/platform/adapters/zhipin/config.js'
import { buildJoblistBody, buildZhipinSearchUrl } from '../../src/host/platform/adapters/zhipin/urls.js'
import { fetchJoblistInPage, salaryMapOf } from '../../src/host/platform/adapters/zhipin/api.js'
import { extractJobsInPage } from '../../src/host/platform/adapters/zhipin/page/list.js'
import type { RawJob } from '../../src/host/platform/types.js'

const PROFILE =
  process.env['ZHIPIN_CHECK_PROFILE'] ?? join(resolveDataDir(), 'browser-profile')
const KEYWORD = process.env['ZHIPIN_KEY'] ?? 'Java'
const CITY_CODE = process.env['ZHIPIN_CITY_CODE'] ?? '101280600'

function log(message: string): void {
  console.log(`[probe-zhipin-fields] ${new Date().toISOString()} ${message}`)
}

/** 接口里"有信息量、且我们当前没消费"的候选字段（人工圈定，逐个统计覆盖率）。 */
const API_CANDIDATES = [
  'skills',
  'welfareList',
  'jobLabels',
  'jobExperience',
  'jobDegree',
  'bossName',
  'bossTitle',
  'brandIndustry',
  'brandScaleName',
  'brandStageName',
  'areaDistrict',
  'businessDistrict',
  'cityName',
  'salaryDesc',
  'securityId',
  'gps',
] as const

type ApiJob = Record<string, unknown>

async function run(): Promise<void> {
  log(`profile：${PROFILE}`)
  log(`关键词：${KEYWORD} 城市码：${CITY_CODE}`)
  const executablePath = discoverExecutable(candidateExecutables())
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

  let apiBody: string | null = null
  page.on('response', (response: Response) => {
    if (response.url().includes('joblist.json')) {
      void response
        .text()
        .then((text) => {
          apiBody = text
        })
        .catch(() => undefined)
    }
  })

  const searchUrl = buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, {
    keyword: KEYWORD,
    city: '深圳',
  })
  log(`导航：${searchUrl ?? ''}`)
  await page.goto(searchUrl ?? 'https://www.zhipin.com/web/geek/job', { timeout: 30_000 })
  await page.waitForSelector(DEFAULT_ZHIPIN_CONFIG.selectors.card, { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(5_000)

  // ── ① 生产 DOM 解析：今天实际入库的形状 ────────────────────────────────────
  const domJobs: RawJob[] = await page.evaluate(extractJobsInPage, {
    selectors: DEFAULT_ZHIPIN_CONFIG.selectors,
    jobIdPattern: DEFAULT_ZHIPIN_CONFIG.jobIdPattern,
  })
  log(`① DOM 生产解析：${String(domJobs.length)} 条`)
  if (domJobs.length > 0) log(`   第 1 条（今天入库的样子）：${JSON.stringify(domJobs[0])}`)

  // ── ② 接口全量：优先用页面自然发出的响应，没有就走生产请求路径 ─────────────
  let payload: unknown = null
  if (apiBody !== null) {
    try {
      payload = JSON.parse(apiBody) as unknown
      log('② 接口来源：页面自然发出的 joblist.json 响应')
    } catch {
      payload = null
    }
  }
  if (payload === null) {
    payload = await page.evaluate(fetchJoblistInPage, {
      apiPath: DEFAULT_ZHIPIN_CONFIG.joblistApiPath,
      body: buildJoblistBody({
        query: KEYWORD,
        cityCode: CITY_CODE,
        page: 1,
        pageSize: DEFAULT_ZHIPIN_CONFIG.joblistPageSize,
      }),
    })
    log('② 接口来源：生产 fetchJoblistInPage（页面上下文 fetch）')
  }
  const rawList = (payload as { zpData?: { jobList?: unknown } } | null)?.zpData?.jobList
  const apiJobs: ApiJob[] = Array.isArray(rawList) ? (rawList as ApiJob[]) : []
  log(`   接口条数：${String(apiJobs.length)}`)

  if (apiJobs.length === 0) {
    log('✘ 接口一条都没拿到 —— 无法对比。检查登录态（probe-zhipin-check）。')
    await context.close()
    return
  }

  // ── ③ 连接与逐字段覆盖率 ───────────────────────────────────────────────────
  const byId = new Map(domJobs.map((job) => [job.platformJobId, job]))
  let matched = 0
  const coverage = new Map<string, number>(API_CANDIDATES.map((key) => [key, 0]))
  const filledExample = new Map<string, string>()
  for (const apiJob of apiJobs) {
    const id = typeof apiJob['encryptJobId'] === 'string' ? apiJob['encryptJobId'] : ''
    if (id === '' || !byId.has(id)) continue
    matched += 1
    for (const key of API_CANDIDATES) {
      const value = apiJob[key]
      const has =
        (typeof value === 'string' && value !== '') ||
        (Array.isArray(value) && value.length > 0) ||
        (value !== null && typeof value === 'object')
      if (has) {
        coverage.set(key, (coverage.get(key) ?? 0) + 1)
        if (!filledExample.has(key)) {
          const shown =
            typeof value === 'string' ? value : JSON.stringify(value)?.slice(0, 80) ?? ''
          filledExample.set(key, shown)
        }
      }
    }
  }
  log(`③ 连接：接口 ${String(apiJobs.length)} 条 ↔ DOM 命中 ${String(matched)} 条（encryptJobId ↔ href id）`)
  log('   字段覆盖率（接口里有值的条数 / 命中条数）：')
  for (const key of API_CANDIDATES) {
    log(`     ${key.padEnd(16)} ${String(coverage.get(key) ?? 0)}/${String(matched)}  例：${filledExample.get(key) ?? ''}`)
  }

  // ── ④ 今天的入库形状里，哪些 RawJob 字段全空（= 平台明明给了却没存）──────
  const emptyFields = ['tags', 'industry', 'companySize', 'companyNature', 'publishedAt'].filter(
    (field) =>
      domJobs.every((job) => {
        const value = (job as unknown as Record<string, unknown>)[field]
        return value === undefined || value === null || (Array.isArray(value) && value.length === 0)
      }),
  )
  log(`④ RawJob 里支持、但今天全空的字段：${emptyFields.join(', ')}`)

  // 薪资回填后的最终形状（readListPage 的另一段生产逻辑）
  const salaries = salaryMapOf(payload)
  const withSalary = domJobs.filter((job) => salaries.has(job.platformJobId)).length
  log(`   薪资回填：${String(withSalary)}/${String(domJobs.length)} 条能拿到明文 salaryDesc`)

  // ── ⑤ DOM 卡片结构对照：肉眼看还有什么是页面上有、解析没拿的 ─────────────
  const cardHtml = await page.evaluate((selector: string) => {
    const el = document.querySelector(selector)
    return el === null ? '' : el.outerHTML
  }, DEFAULT_ZHIPIN_CONFIG.selectors.card)
  log(`⑤ 第 1 张卡片 DOM（截 2200 字）：`)
  log(cardHtml.slice(0, 2200))

  await context.close()
  log('✔ 完成 —— 对比结论由助手按上面 ③④⑤ 汇总。')
}

run().catch((error: unknown) => {
  log(`未捕获异常：${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
