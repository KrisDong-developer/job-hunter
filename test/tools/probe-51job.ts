#!/usr/bin/env node
/**
 * 前程无忧（51job）探针 —— 真机复核「选择器没腐烂」+ 落盘带日期的页面快照。
 *
 * ## 为什么需要它
 *
 * 51job 是唯一 `stable` 且**解析全靠 DOM**（`.joblist-item` 卡片 + `sensorsname="JobShortExposure"`
 * 跟踪载荷）的平台 —— 它的字段（jobId / 发布时间 / 经验 / 学历）**只能**从跟踪载荷的
 * `sensorsdata` 属性里取，而那是埋点属性：站点换一次埋点，`platformJobId` 与 `sourceUrl`
 * 会一起变空，而**卡片容器还在、四项核心字段里只有后三项悄悄空掉**
 * （`test/platform/fiftyone.test.ts` 那条"卡片容器没坏 → 仍看到 20 张卡"的用例说的就是它）。
 *
 * 本探针把适配器**驱动到真实页面上**跑一遍（`readListPage` / `detectBlock` / `hasNextPage`
 * 都是生产代码本身），给出逐字段命中率读数，并把这一天的页面落盘 —— 选择器哪天腐烂，
 * 把 `npm run probe:51job` 的输出与上一天的快照一比就知道。
 *
 * ## 用法
 *
 *   npm run probe:51job                      # 关键词 Java / 城市 深圳
 *   $env:FIFTYONE_KEY='前端'; npm run probe:51job
 *   $env:FIFTYONE_CITY='北京'; npm run probe:51job
 *   $env:FIFTYONE_OFFLINE='1'; npm run probe:51job   # 只离线复跑上一次的快照，不访问真实站点
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-51job-capture/search-<日期>.html         列表页快照
 *   .probe-51job-capture/search-api-<日期>.json     搜索接口请求采样（sortType / issueDate 的证据）
 *
 * ⚠️ **刻意不覆盖 `test/fixtures/51job-sz.html`**：它是被 `fiftyone.test.ts` 与
 *    `npm run crawl:fixture` 钉住的夹具（首条记录标题、20 条、首条 detail id 都写死在用例里）。
 *    静默替换只会让测试红在与本次校准无关的地方。
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点。
 *    阿里云 WAF 会出滑块 —— 弹出窗口被拦时**先人工过一次**，别连打（C12）。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Request } from 'patchright'
import {
  createFiftyOneAdapter,
  DEFAULT_FIFTYONE_CONFIG,
  type FiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job.js'
import { candidateExecutables, discoverExecutable } from '../../src/host/platform/browser.js'
import { STEALTH_INIT_SCRIPT } from '../../src/host/platform/stealth.js'
import type { PageLike, RawJob } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const KEYWORD = process.env['FIFTYONE_KEY'] ?? 'Java'
const CITY = process.env['FIFTYONE_CITY'] ?? '深圳'
const PROFILE = process.env['FIFTYONE_PROFILE'] ?? join(process.cwd(), '.probe-51job-profile')
const CAPTURE_DIR = process.env['FIFTYONE_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-51job-capture')
const OFFLINE_ONLY = process.env['FIFTYONE_OFFLINE'] === '1'
const TODAY = new Date().toISOString().slice(0, 10)
/** 搜索接口标记（URL 参数映射的实测来源，见适配器 `SORT_OPTIONS` 注释）。 */
const SEARCH_API_MARKER = '/api/job/search-pc'
const CONFIG: FiftyOneConfig = DEFAULT_FIFTYONE_CONFIG

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-51job] ${new Date().toISOString()} ${message}`)
}

/**
 * 把 patchright 的 `Page` 接成采集层的 `PageLike`。
 *
 * 为什么要显式包一层：`PageLike.waitForSelector` 约定**超时返回 false**，
 * 而 Playwright 的 `waitForSelector` 超时**抛错**（见 types.ts 的注释）。
 * 生产路径靠一个 `as` 强转绕过类型差（`browser.ts` 的页面池），探针这里把它写清楚。
 */
function asPageLike(page: Page): PageLike {
  return {
    goto: async (url: string): Promise<void> => {
      await page.goto(url)
    },
    url: (): string => page.url(),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> =>
      (await page.evaluate(fn as never, arg)) as R,
    waitForTimeout: (ms: number): Promise<void> => page.waitForTimeout(ms),
    waitForSelector: async (selector: string, timeoutMs: number): Promise<boolean> => {
      try {
        await page.waitForSelector(selector, { timeout: timeoutMs })
        return true
      } catch {
        return false
      }
    },
  }
}

const hitRate = (jobs: readonly RawJob[], pick: (job: RawJob) => string): string =>
  jobs.length === 0 ? '0/0' : `${String(jobs.filter((job) => pick(job) !== '').length)}/${String(jobs.length)}`

/** 逐字段命中率读数（探针的核心产出：哪一列空了，一眼可见）。 */
function reportFields(label: string, jobs: readonly RawJob[]): void {
  INFO.push(
    `${label}字段命中：条数 ${String(jobs.length)} · id ${hitRate(jobs, (job) => job.platformJobId)} · ` +
      `详情地址 ${hitRate(jobs, (job) => job.sourceUrl)} · 标题 ${hitRate(jobs, (job) => job.title)} · ` +
      `薪资 ${hitRate(jobs, (job) => job.salaryRaw)} · 公司 ${hitRate(jobs, (job) => job.company)} · ` +
      `城市 ${hitRate(jobs, (job) => job.city ?? '')} · 经验 ${hitRate(jobs, (job) => job.expReq ?? '')} · ` +
      `学历 ${hitRate(jobs, (job) => job.eduReq ?? '')} · 发布 ${hitRate(jobs, (job) => job.publishedAt ?? '')}`,
  )
  const sample = jobs[0]
  if (sample !== undefined) {
    INFO.push(
      `样本：${sample.title} | ${sample.salaryRaw} | ${sample.company} | ${sample.city}${sample.district ?? ''} | ${sample.sourceUrl}`,
    )
  }
}

/** 用真实适配器解析一份 HTML（与 npm test 走同一条解析代码）。 */
async function analyzeHtml(html: string, url: string, label: string): Promise<{
  jobs: RawJob[]
  block: string | null
  hasNext: boolean
}> {
  const adapter = createFiftyOneAdapter({ config: CONFIG })
  const page = new JsdomPage({ html, url })
  await adapter.crawl.gotoSearch(page, { keyword: KEYWORD, city: CITY })
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)
  reportFields(label, jobs)
  return { jobs, block: block === null ? null : String(block), hasNext }
}

interface OnlineReading {
  html: string | null
  url: string
  api: Array<{ url: string; body: string | null }>
  jobs: RawJob[]
  block: string | null
  hasNext: boolean
}

/** 打开真实搜索页 → 用适配器解析 → 落盘快照，返回读数。 */
async function probeOnline(url: string): Promise<OnlineReading> {
  log(`探测地址：${url}`)

  const executablePath = discoverExecutable(candidateExecutables())
  if (executablePath === undefined) {
    log('⚠️ 没找到系统 Chrome/Edge，交给 patchright 自行解析（指纹较弱，可能影响结果）')
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
  // D-17a 环境一致性三件套之二：stealth 注入
  await context.addInitScript({ content: STEALTH_INIT_SCRIPT })
  const rawPage: Page = await context.newPage()

  // 搜索接口采样：URL 参数映射（sortType / issueDate）只能从真实请求里读出来
  const api: Array<{ url: string; body: string | null }> = []
  rawPage.on('request', (request: Request) => {
    try {
      if (!request.url().includes(SEARCH_API_MARKER)) return
      api.push({ url: request.url(), body: request.postData() })
    } catch {
      /* 监听本身不许炸 */
    }
  })

  log('导航中（domcontentloaded，30s 超时）…')
  try {
    await rawPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  } catch (error) {
    log(`goto 失败：${error instanceof Error ? error.message : String(error)}`)
  }
  // SPA：load 时列表还没渲染 —— 等卡片锚点（与适配器 gotoSearch 同款姿势）+ 一点余量
  try {
    await rawPage.waitForSelector(CONFIG.selectors.card, { timeout: 20_000 })
  } catch {
    log('⚠️ 20s 内没等到卡片容器 —— 可能被 WAF 拦、或列表渲染更慢')
  }
  await rawPage.waitForTimeout(4_000)

  const finalUrl = rawPage.url()
  log(`final URL：${finalUrl}`)

  const page = asPageLike(rawPage)
  const adapter = createFiftyOneAdapter({ config: CONFIG })
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)
  reportFields('在线', jobs)

  const html = await rawPage.content()
  await context.close()
  return { html, url: finalUrl, api, jobs, block: block === null ? null : String(block), hasNext }
}

/** 离线复跑：挑最新的一份快照（文件名带日期，排序即最新）。 */
function latestCapture(): { path: string; url: string } | null {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    log(`⚠️ 没有抓取目录：${CAPTURE_DIR} —— 先在线跑一次`)
    return null
  }
  const name = names.filter((item) => /^search-\d{4}-\d{2}-\d{2}\.html$/.test(item)).sort().pop()
  if (name === undefined) {
    log(`⚠️ 抓取目录里没有 search-<日期>.html：${CAPTURE_DIR}`)
    return null
  }
  return { path: join(CAPTURE_DIR, name), url: buildUrl() }
}

function buildUrl(): string {
  return createFiftyOneAdapter({ config: CONFIG }).criteria.buildSearchUrl({ keyword: KEYWORD, city: CITY }) ?? ''
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 城市：${CITY} · profile：${PROFILE}`)

  const url = buildUrl()
  if (url === '') {
    check(`城市「${CITY}」有城市码`, false, '→ cityCodes 里没有它，先补表（buildSearchUrl 返回 null）')
  } else if (OFFLINE_ONLY) {
    const capture = latestCapture()
    if (capture === null) {
      process.exitCode = 1
      return
    }
    INFO.push(`离线复跑快照：${capture.path}`)
    const offline = await analyzeHtml(readFileSync(capture.path, 'utf8'), capture.url, '离线')
    check('离线解析出卡片（选择器仍命中）', offline.jobs.length > 0, `${String(offline.jobs.length)} 条`)
    check('离线判墙未误报', offline.block === null, `detectBlock=${offline.block ?? '无'}`)
  } else {
    const online = await probeOnline(url)
    if (online.html === null) {
      log('✗ 没拿到页面快照')
    } else {
      mkdirSync(CAPTURE_DIR, { recursive: true })
      const htmlPath = join(CAPTURE_DIR, `search-${TODAY}.html`)
      writeFileSync(htmlPath, online.html, 'utf8')
      log(`快照已保存：${htmlPath}（${String(online.html.length)} 字符）`)
      if (online.api.length > 0) {
        const apiPath = join(CAPTURE_DIR, `search-api-${TODAY}.json`)
        writeFileSync(apiPath, JSON.stringify(online.api, null, 2), 'utf8')
        log(`接口采样已保存：${apiPath}（${String(online.api.length)} 条）`)
        INFO.push(`搜索接口请求：${online.api[0]?.url ?? ''} · body=${online.api[0]?.body ?? '(空)'}`)
      } else {
        log('（没捕获到搜索接口 —— SPA 可能走了别的端点，或命中了风控降级；不影响 HTML 快照）')
      }

      check(
        '列表页存活（无验证码/登录墙/空白）',
        online.block === null,
        online.block === null ? '' : `detectBlock=${online.block} —— 人工过一次滑块/登录后再跑，别连打（C12）`,
      )
      check('解析出卡片', online.jobs.length > 0, `${String(online.jobs.length)} 条（站点每页 20 条）`)
      check(
        '四核心字段无空缺（id/标题/薪资/公司）',
        online.jobs.length > 0 &&
          online.jobs.every((job) => job.platformJobId !== '' && job.title !== '' && job.salaryRaw !== '' && job.company !== ''),
        `id ${hitRate(online.jobs, (job) => job.platformJobId)} · 标题 ${hitRate(online.jobs, (job) => job.title)} · 薪资 ${hitRate(online.jobs, (job) => job.salaryRaw)} · 公司 ${hitRate(online.jobs, (job) => job.company)}`,
      )
      check(
        '跟踪载荷可解析（jobId → 详情地址）',
        online.jobs.every((job) => job.sourceUrl !== ''),
        hitRate(online.jobs, (job) => job.sourceUrl),
      )
      check('分页按钮「下一页」可用', online.hasNext, `hasNextPage=${String(online.hasNext)}`)
      INFO.push(
        `tracking 派生字段：经验 ${hitRate(online.jobs, (job) => job.expReq ?? '')} · ` +
          `学历 ${hitRate(online.jobs, (job) => job.eduReq ?? '')} · 发布 ${hitRate(online.jobs, (job) => job.publishedAt ?? '')}`,
      )

      // 同一份快照再离线跑一遍：证明"在线读数 == 离线读数"，也证明快照本身能当回归夹具
      const offline = await analyzeHtml(online.html, online.url, '离线复核')
      check(
        '离线复核条数与在线一致',
        offline.jobs.length === online.jobs.length,
        `在线 ${String(online.jobs.length)} · 离线 ${String(offline.jobs.length)}`,
      )
    }
  }

  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${String(PASS.length)} · FAIL ${String(FAIL.length)}`)
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  console.log('\n-- PASS --')
  for (const item of PASS) console.log(`  ✓ ${item}`)
  console.log('\n-- FAIL（需要改适配器/文档） --')
  for (const item of FAIL) console.log(`  ✗ ${item}`)
  console.log(`\n退出码：${FAIL.length === 0 ? '0（全部断言通过，适配器无需改动）' : '1'}`)
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch((error: unknown) => {
  console.error('探针异常：', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
