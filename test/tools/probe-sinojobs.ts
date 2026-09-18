#!/usr/bin/env node
/**
 * SinoJobs 中欧招聘（sinojobs.com.cn）探针 —— 接口契约逐条复核 + 带日期的夹具采集。
 *
 * ## 为什么需要它
 *
 * `platform-facts.ts` 里 sinojobs 的两处已知缺口，本探针就是为它们写的：
 *   * 现有三份夹具**都没标注抓取日期**（notes 原文），"这份结构是哪天的"无从判断；
 *   * 适配器文件头那张「接口契约（全部实测）」表 —— `page` / `limit` / `keywords` /
 *     `job_type` / `work_nature` / `address_id` / `salary_range` / `experience`
 *     八项语义 —— 没有任何东西在复核。平台改一个参数名或一个值域，只有用户某天
 *     发现"这个平台抓不到"才会暴露（正是本项目一直在修的那类静默失败）。
 *
 * 本探针把那张表**逐条变成 PASS/FAIL**，并把这一次的原始响应与页面落盘成
 * **文件名带日期**的夹具 —— 于是"夹具是哪天的"永远写在文件名里。
 *
 * ## 用法
 *
 *   npm run probe:sinojobs                      # 关键词默认 Java，城市默认上海
 *   $env:SINOJOBS_KEY='工程师'; npm run probe:sinojobs
 *   $env:SINOJOBS_CITY='北京'; npm run probe:sinojobs
 *   $env:SINOJOBS_OFFLINE='1'; npm run probe:sinojobs    # 只离线复跑上一份抓取，不碰网络
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-sinojobs-capture/list-<日期>.html            列表页外壳
 *   .probe-sinojobs-capture/list-payload-<日期>.json    列表接口原始响应
 *   .probe-sinojobs-capture/detail-<id>-<日期>.html     第一条岗位的详情页
 *
 * ⚠️ **刻意不覆盖 `test/fixtures/` 里被测试钉住的夹具**：那些文件的首条记录标题、
 *    源地址与条数被 `test/platform/sinojobs.test.ts` 硬编码断言，静默替换只会让测试
 *    红在与本次校准无关的地方。要重新钉住，人工复制 + 同步改用例里的期望值。
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点。
 *    列表接口匿名可读（不需要登录、不需要浏览器），请求之间带少量延时代以示礼貌。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  createSinoJobsAdapter,
  SINOJOBS_ADDRESS_CODES,
  SINOJOBS_API_PATH,
  SINOJOBS_DETAIL_URL_TEMPLATE,
  SINOJOBS_LIST_URL,
  SINOJOBS_PAGE_SIZE,
  SINOJOBS_WEB_BASE,
} from '../../src/host/platform/adapters/sinojobs.js'
import { JsdomPage, type PageFetchStub } from '../support/jsdom-page.js'

const KEYWORD = process.env['SINOJOBS_KEY'] ?? 'Java'
const CITY = process.env['SINOJOBS_CITY'] ?? '上海'
const CAPTURE_DIR = process.env['SINOJOBS_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-sinojobs-capture')
/** 只离线复跑已抓到的夹具（不访问真实站点）。 */
const OFFLINE_ONLY = process.env['SINOJOBS_OFFLINE'] === '1'
/** 接口真实入口（与适配器 `config.webBase + config.apiPath` 同源，不另写一份常量）。 */
const API_URL = `${SINOJOBS_WEB_BASE}${SINOJOBS_API_PATH}`
const TODAY = new Date().toISOString().slice(0, 10)

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-sinojobs] ${new Date().toISOString()} ${message}`)
}

// ── 接口 ────────────────────────────────────────────────────────────────────

interface ListResponse {
  status?: unknown
  info?: unknown
  data?: { total?: unknown; rows?: unknown }
}

/** 表单编码 POST（与站点脚本、适配器 `fetchListInPage` 发送的完全一致）。 */
async function list(body: Record<string, string>): Promise<ListResponse | null> {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) form.set(key, value)
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(25_000),
    })
    return (await response.json()) as ListResponse
  } catch (error) {
    log(`接口请求失败：${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/** 站点脚本始终提交这五个空键（值为空串 = 不筛），与适配器请求体同形。 */
function bodyOf(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    page: '1',
    limit: String(SINOJOBS_PAGE_SIZE),
    keywords: '',
    job_type: '',
    work_nature: '',
    salary_range: '',
    experience: '',
    address_id: '',
    ...overrides,
  }
}

const rowsOf = (response: ListResponse | null): Array<Record<string, unknown>> => {
  const rows = response?.data?.rows
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
}

const totalOf = (response: ListResponse | null): number => {
  const raw = response?.data?.total
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : -1
}

const idsOf = (response: ListResponse | null): string[] =>
  rowsOf(response).map((row) => String(row['id'] ?? ''))

/** 适配器 `extractJobsInPage` 依赖的字段键 —— 少一个就会静默解析成空。 */
const REQUIRED_ROW_FIELDS = ['id', 'job_title', 'company', 'work_city', 'release_time', 'salary_range']

/** 一条 HTML（列表页 / 详情页）用 GET 抓下来。 */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 job-hunter-probe' },
      signal: AbortSignal.timeout(25_000),
    })
    check(`GET ${url} → 200`, response.status === 200, `status=${String(response.status)}`)
    return response.status === 200 ? await response.text() : null
  } catch (error) {
    check(`GET ${url} → 200`, false, error instanceof Error ? error.message : String(error))
    return null
  }
}

// ── 在线：把适配器文件头那张契约表逐条跑一遍 ────────────────────────────────

async function probeOnline(): Promise<{ listHtml: string | null; payload: ListResponse | null; detailHtml: string | null; detailUrl: string | null }> {
  const base = await list(bodyOf())
  check('基线 status=1 且 rows 非空', base?.status !== undefined && Number(base.status) === 1 && rowsOf(base).length > 0, `status=${String(base?.status)} rows=${String(rowsOf(base).length)} total=${String(totalOf(base))}`)
  INFO.push(`基线：total=${String(totalOf(base))} rows=${String(rowsOf(base).length)}（limit=${String(SINOJOBS_PAGE_SIZE)}）`)
  const baseTotal = totalOf(base)
  const baseIds = idsOf(base)

  // 每行必备字段：适配器解析全靠这些键
  const missing = new Set<string>()
  for (const row of rowsOf(base)) {
    for (const field of REQUIRED_ROW_FIELDS) {
      const value = row[field]
      if (value === undefined || value === null || String(value) === '') missing.add(field)
    }
  }
  check(`每行都带适配器依赖的 ${String(REQUIRED_ROW_FIELDS.length)} 个字段键`, missing.size === 0, missing.size === 0 ? '' : `缺：${[...missing].join(',')}`)
  INFO.push(`单行字段：${Object.keys(rowsOf(base)[0] ?? {}).join(', ')}`)
  await sleep(400)

  // limit=100：站点自己用 15；文件头称实测 20/50/100 均正常（100 时一次返回全量）
  const big = await list(bodyOf({ limit: '100' }))
  check('limit=100 正常返回（一次拉全量）', big !== null && Number(big.status) === 1 && rowsOf(big).length >= rowsOf(base).length, `rows=${String(rowsOf(big).length)}`)
  await sleep(400)

  // page=2：文件头称"实测第 2 页与第 1 页零重叠"
  const p2 = await list(bodyOf({ page: '2' }))
  const p2Ids = idsOf(p2)
  const overlap = p2Ids.filter((id) => baseIds.includes(id))
  check('page=2 与 page=1 的 id 零重叠（真分页）', p2 !== null && Number(p2.status) === 1 && overlap.length === 0, `page2=${String(p2Ids.length)} 重叠=${String(overlap.length)}`)
  await sleep(400)

  // keywords：文件头称 工程师 → 78→17
  const kw = await list(bodyOf({ keywords: KEYWORD }))
  const kwTotal = totalOf(kw)
  check(`keywords=${KEYWORD} 生效（total < 基线 ${String(baseTotal)}）`, kwTotal >= 0 && baseTotal > 0 && kwTotal < baseTotal, `total=${String(kwTotal)}`)
  await sleep(400)

  // address_id：文件头称 address_id=3 → 只回上海岗
  const cityCode = SINOJOBS_ADDRESS_CODES[CITY]
  check(`城市表含「${CITY}」`, cityCode !== undefined, cityCode === undefined ? '→ addressCodes 里没有这个城市，先补表' : `address_id=${cityCode}`)
  if (cityCode !== undefined) {
    const byCity = await list(bodyOf({ address_id: cityCode }))
    const cities = rowsOf(byCity).map((row) => String(row['work_city'] ?? ''))
    const offCity = cities.filter((value) => !value.includes(CITY))
    check(`address_id=${cityCode} 只回「${CITY}」岗`, byCity !== null && Number(byCity.status) === 1 && cities.length > 0 && offCity.length === 0, `rows=${String(cities.length)} 非${CITY}=${String(offCity.length)}${offCity.length > 0 ? `（如 ${offCity.slice(0, 3).join('/')}）` : ''}`)
    await sleep(400)
  }

  // 其余三个筛选维度的值域：只要求接口仍收得下（值域失效会以 status!=1 或 0 条暴露）
  const natures = await list(bodyOf({ work_nature: '3' }))
  check('work_nature=3（实习）仍被接受', natures !== null && Number(natures.status) === 1, `status=${String(natures?.status)} rows=${String(rowsOf(natures).length)}`)
  await sleep(400)
  const salary = await list(bodyOf({ salary_range: '26' }))
  check('salary_range=26（25K+）仍被接受', salary !== null && Number(salary.status) === 1, `status=${String(salary?.status)} rows=${String(rowsOf(salary).length)}`)
  await sleep(400)
  const exp = await list(bodyOf({ experience: '2' }))
  check('experience=2（1年～3年）仍被接受', exp !== null && Number(exp.status) === 1, `status=${String(exp?.status)} rows=${String(rowsOf(exp).length)}`)
  await sleep(400)

  // 列表页外壳（判墙 / 卡片计数 / 登录态判据都在这个 DOM 上）
  const listHtml = await fetchHtml(SINOJOBS_LIST_URL)
  await sleep(400)

  // 详情页：拿基线第一条的 id
  const firstId = baseIds[0] ?? ''
  let detailHtml: string | null = null
  let detailUrl: string | null = null
  if (firstId === '') {
    log('⚠️ 基线里没拿到岗位 id，跳过详情页采集')
  } else {
    detailUrl = SINOJOBS_DETAIL_URL_TEMPLATE.split('{jobId}').join(firstId)
    detailHtml = await fetchHtml(detailUrl)
  }

  return { listHtml, payload: base, detailHtml, detailUrl }
}

// ── 离线：与 npm test 走同一条解析代码 ──────────────────────────────────────

async function analyzeCapture(files: {
  listHtml: string
  payload: unknown
  detailHtml?: string
  detailUrl?: string
}): Promise<void> {
  const adapter = createSinoJobsAdapter()
  const fetchStub: PageFetchStub = () =>
    Promise.resolve({ json: () => Promise.resolve(files.payload), status: 200 })

  // 走真实适配器路径：gotoSearch → readListPage（页面里 fetch + 解析）→ hasNextPage → detectBlock
  const page = new JsdomPage({
    html: files.listHtml,
    url: `${SINOJOBS_LIST_URL}?keywords=${encodeURIComponent(KEYWORD)}`,
    fetchStub,
  })
  await adapter.crawl.gotoSearch(page, { keyword: KEYWORD })
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)

  const withId = jobs.filter((job) => job.platformJobId !== '').length
  const withSalary = jobs.filter((job) => job.salaryRaw !== '').length
  const withCompany = jobs.filter((job) => job.company !== '').length
  const withCity = jobs.filter((job) => (job.city ?? '') !== '').length
  const withPublished = jobs.filter((job) => job.publishedAt != null).length

  check('离线解析：与接口 rows 条数一致', jobs.length === rowsOf(files.payload as ListResponse).length, `jobs=${String(jobs.length)}`)
  check('离线解析：四核心字段无空缺（标题/薪资/公司/城市）', jobs.length > 0 && withId === jobs.length && withSalary === jobs.length && withCompany === jobs.length && withCity === jobs.length, `id=${String(withId)} 薪资=${String(withSalary)} 公司=${String(withCompany)} 城市=${String(withCity)}`)
  check('判墙：正常列表页不误报', block === null, `detectBlock=${block === null ? '无' : block}`)
  INFO.push(`解析：发布时间命中 ${String(withPublished)}/${String(jobs.length)} · hasNextPage=${String(hasNext)}（page1 且 total>pageSize 时应为 true）`)
  const sample = jobs[0]
  if (sample !== undefined) {
    INFO.push(`样本：${sample.title} | ${sample.city ?? ''} | exp=${sample.expReq ?? ''} edu=${sample.eduReq ?? ''} | ${sample.company} | ${sample.salaryRaw} | ${sample.sourceUrl}`)
  }

  if (files.detailHtml !== undefined && files.detailUrl !== undefined) {
    const detailPage = new JsdomPage({ html: files.detailHtml, url: files.detailUrl })
    const detail = await adapter.detail?.extract(detailPage)
    check('详情页：标题与 JD 正文都锚到', detail !== undefined && detail.title !== '' && (detail.jdText ?? '') !== '', `title=${detail?.title ?? '(空)'} jd=${String((detail?.jdText ?? '').length)} 字`)
    check('详情页：从地址里取到岗位 id', (detail?.platformJobId ?? '') !== '', `id=${detail?.platformJobId ?? '(空)'}`)
    if (detail !== undefined) {
      INFO.push(`详情样本：${detail.title} | ${detail.city ?? ''} | ${detail.salaryRaw} | exp=${detail.expReq ?? ''} | tags=${(detail.tags ?? []).join('/')} | 发布=${detail.publishedAt ?? '-'}`)
    }
  }
}

/** 离线复跑：从抓取目录里挑最新的一份（文件名带日期，排序即最新）。 */
async function offlineFiles(): Promise<{ listHtml: string; payload: unknown; detailHtml?: string; detailUrl?: string } | null> {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    log(`⚠️ 没有抓取目录：${CAPTURE_DIR} —— 先在线跑一次`)
    return null
  }
  const payloadName = names.filter((name) => /^list-payload-.*\.json$/.test(name)).sort().pop()
  if (payloadName === undefined) {
    log(`⚠️ 抓取目录里没有 list-payload-*.json：${CAPTURE_DIR}`)
    return null
  }
  const date = payloadName.replace(/^list-payload-/, '').replace(/\.json$/, '')
  const listHtmlName = `list-${date}.html`
  const detailName = names.filter((name) => /^detail-.*\.html$/.test(name)).sort().pop()
  const files: { listHtml: string; payload: unknown; detailHtml?: string; detailUrl?: string } = {
    listHtml: readFileSync(join(CAPTURE_DIR, listHtmlName), 'utf8'),
    payload: JSON.parse(readFileSync(join(CAPTURE_DIR, payloadName), 'utf8')) as unknown,
  }
  if (detailName !== undefined) {
    files.detailHtml = readFileSync(join(CAPTURE_DIR, detailName), 'utf8')
    const idMatch = /^detail-(\d+)-/.exec(detailName)
    files.detailUrl = SINOJOBS_DETAIL_URL_TEMPLATE.split('{jobId}').join(idMatch?.[1] ?? '0')
  }
  INFO.push(`离线复跑夹具：${payloadName} + ${listHtmlName}${detailName === undefined ? '' : ` + ${detailName}`}`)
  return files
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · 城市：${CITY} · 抓取目录：${CAPTURE_DIR}`)

  if (OFFLINE_ONLY) {
    const files = await offlineFiles()
    if (files === null) {
      process.exitCode = 1
      return
    }
    await analyzeCapture(files)
  } else {
    const captured = await probeOnline()
    if (captured.payload === null || captured.listHtml === null) {
      log('✗ 在线抓取没拿到可用数据，跳过离线复跑')
    } else {
      mkdirSync(CAPTURE_DIR, { recursive: true })
      const payloadPath = join(CAPTURE_DIR, `list-payload-${TODAY}.json`)
      const listPath = join(CAPTURE_DIR, `list-${TODAY}.html`)
      writeFileSync(payloadPath, JSON.stringify(captured.payload, null, 2), 'utf8')
      writeFileSync(listPath, captured.listHtml, 'utf8')
      log(`夹具已保存：${payloadPath}`)
      log(`夹具已保存：${listPath}`)
      let detailHtml: string | undefined
      let detailUrl: string | undefined
      if (captured.detailHtml !== null && captured.detailUrl !== null) {
        const firstId = /[?&]id=(\d+)/.exec(captured.detailUrl)?.[1] ?? '0'
        const detailPath = join(CAPTURE_DIR, `detail-${firstId}-${TODAY}.html`)
        writeFileSync(detailPath, captured.detailHtml, 'utf8')
        log(`夹具已保存：${detailPath}`)
        detailHtml = readFileSync(detailPath, 'utf8')
        detailUrl = captured.detailUrl
      }
      await analyzeCapture({
        listHtml: readFileSync(listPath, 'utf8'),
        payload: JSON.parse(readFileSync(payloadPath, 'utf8')) as unknown,
        ...(detailHtml === undefined || detailUrl === undefined ? {} : { detailHtml, detailUrl }),
      })
    }
  }

  console.log('\n========== 探针汇总 ==========')
  console.log(`PASS ${String(PASS.length)} · FAIL ${String(FAIL.length)}`)
  for (const item of INFO) console.log(`  ℹ️ ${item}`)
  console.log('\n-- PASS --')
  for (const item of PASS) console.log(`  ✓ ${item}`)
  console.log('\n-- FAIL（需要改适配器/文档/城市表） --')
  for (const item of FAIL) console.log(`  ✗ ${item}`)
  console.log(`\n退出码：${FAIL.length === 0 ? '0（全部断言通过，适配器无需改动）' : '1'}`)
  process.exitCode = FAIL.length === 0 ? 0 : 1
}

void main().catch((error: unknown) => {
  console.error('探针异常：', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
