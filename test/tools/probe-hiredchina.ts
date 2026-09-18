#!/usr/bin/env node
/**
 * HiredChina（hiredchina.com）探针 —— 用**不受 Cloudflare 拦的子域**做真实页面校准。
 *
 * ## 为什么需要它
 *
 * 适配器 `hiredchina.ts` 里有三处写着「待 probe:hiredchina 校准」：
 *   * 卡片 UUID 锚点（`notes: 卡片未锚定岗位 UUID，待 probe:hiredchina 校准`）；
 *   * 详情页选择器（`h1` / 渐变卡片薪资 / `div.prose.prose-sm`，只注明、未校准）；
 *   * `platform-facts.ts` 的 notes：现有测试用的是**按探针结构还原的内联合成 HTML**，
 *     "不是保存的真实页面" —— 选择器是否真的长在真页面上，没有任何证据。
 *
 * 关键事实（适配器文件头实测）：`www.hiredchina.com` 的 raw HTTP 会被 Cloudflare
 * managed challenge 拦下，而**同一套应用的子域 `hcweb.gicexpat.com` 不被拦**
 * （实测 200 + 430KB SSR 页面）—— 所以本探针默认走它，把这些"待校准"变成实测读数。
 *
 * ## 用法
 *
 *   npm run probe:hiredchina                      # 关键词默认 Java
 *   $env:HIREDCHINA_KEY='marketing'; npm run probe:hiredchina
 *   $env:HIREDCHINA_HOST='www.hiredchina.com'; ...  # 换回主站（预期命中 Cloudflare → 判 captcha）
 *   $env:HIREDCHINA_OFFLINE='1'; npm run probe:hiredchina   # 只离线复跑上一份抓取
 *
 * ## 产物（`.probe*` 已被 .gitignore 忽略，不进版本库）
 *
 *   .probe-hiredchina-capture/list-<日期>.html            列表页（第 1 页）
 *   .probe-hiredchina-capture/list-p2-<日期>.html         列表页（第 2 页，翻页证据）
 *   .probe-hiredchina-capture/detail-<uuid>-<日期>.html   第一条岗位的详情页
 *
 * ⚠️ 本平台**没有**被测试钉住的真实夹具（用例用的是内联 HTML），所以这里不存在
 *    "覆盖夹具"的风险；校准完成后人工把 capture 里的真实页面复制进 `test/fixtures/`
 *    并改用例即可。
 *
 * ⚠️ 这是**手动跑一次**的校准工具，不是自动化的一部分（§14）：它访问真实站点。
 *    平台有 Cloudflare 层，**别连打**（§P5 保守优先）；请求之间带少量延时。
 *    列表**匿名可读**（不需要登录、不需要浏览器），所以本探针纯 HTTP。
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  createHiredChinaAdapter,
  DEFAULT_HIREDCHINA_CONFIG,
  extractDetailInPage,
  hasNextPageInPage,
  type HiredChinaConfig,
} from '../../src/host/platform/adapters/hiredchina.js'
import type { RawJob, SearchCriteria } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const KEYWORD = process.env['HIREDCHINA_KEY'] ?? 'Java'
/** 默认走**不被 Cloudflare 拦**的同源子域；换主站会命中挑战层（那正是要观测的事）。 */
const HOST = process.env['HIREDCHINA_HOST'] ?? 'hcweb.gicexpat.com'
const CAPTURE_DIR = process.env['HIREDCHINA_CAPTURE_DIR'] ?? join(process.cwd(), '.probe-hiredchina-capture')
const OFFLINE_ONLY = process.env['HIREDCHINA_OFFLINE'] === '1'
const TODAY = new Date().toISOString().slice(0, 10)

const PASS: string[] = []
const FAIL: string[] = []
const INFO: string[] = []

function check(name: string, ok: boolean, detail = ''): void {
  ;(ok ? PASS : FAIL).push(`${name}${detail === '' ? '' : ` → ${detail}`}`)
}

function log(message: string): void {
  console.log(`[probe-hiredchina] ${new Date().toISOString()} ${message}`)
}

/**
 * 用探针的 host 造一份配置 —— 于是 URL 仍然由**适配器自己**拼（单一事实来源），
 * 探针不另写一遍 `?kw= / ?page=` 的拼装逻辑。
 */
function configFor(host: string): HiredChinaConfig {
  return { ...DEFAULT_HIREDCHINA_CONFIG, webBase: `https://${host}` }
}

/** 真人浏览器 UA —— 默认的 Node UA 会被 CDN 直接拦，那样测的就不是站点本身了。 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'

async function fetchHtml(url: string, label: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9', 'user-agent': UA },
      signal: AbortSignal.timeout(30_000),
    })
    check(`${label} GET 200`, response.status === 200, `status=${String(response.status)} url=${url}`)
    return response.status === 200 ? await response.text() : null
  } catch (error) {
    check(`${label} GET 200`, false, `${error instanceof Error ? error.message : String(error)} url=${url}`)
    return null
  }
}

/** 用真实适配器解析一份 HTML（与 npm test 走同一条解析代码）。 */
async function readList(html: string, url: string, config: HiredChinaConfig): Promise<{
  jobs: RawJob[]
  block: string | null
  hasNext: boolean
}> {
  const adapter = createHiredChinaAdapter({ config })
  const page = new JsdomPage({ html, url })
  // gotoSearch 只记 criteria（夹具里不真导航出网），readListPage/hasNextPage/detectBlock 才是解析
  await adapter.crawl.gotoSearch(page, { keyword: KEYWORD })
  const jobs = await adapter.crawl.readListPage(page)
  const block = await adapter.guard.detectBlock(page)
  const hasNext = await adapter.crawl.hasNextPage(page)
  return { jobs, block: block === null ? null : String(block), hasNext }
}

function hitRate<T>(items: readonly T[], pick: (item: T) => string): string {
  if (items.length === 0) return '0/0'
  const hit = items.filter((item) => pick(item) !== '').length
  return `${String(hit)}/${String(items.length)}`
}

// ── 在线 ────────────────────────────────────────────────────────────────────

async function probeOnline(): Promise<{
  listHtml: string | null
  listUrl: string
  p2Html: string | null
  p2Url: string
  detailHtml: string | null
  detailUrl: string | null
}> {
  const config = configFor(HOST)
  const adapter = createHiredChinaAdapter({ config })
  const listUrl = adapter.criteria.buildSearchUrl({ keyword: KEYWORD, page: 1 }) ?? ''
  const p2Url = adapter.criteria.buildSearchUrl({ keyword: KEYWORD, page: 2 }) ?? ''
  check('列表 URL 由适配器拼得出来（关键词 + 翻页）', listUrl !== '' && p2Url !== '', `list=${listUrl} p2=${p2Url}`)

  const listHtml = await fetchHtml(listUrl, '列表页 1')
  check('列表页是 SSR 直出（HTML 体积 > 50KB）', (listHtml?.length ?? 0) > 50_000, `${String(listHtml?.length ?? 0)} 字符`)
  await sleep(600)

  if (listHtml === null) return { listHtml, listUrl, p2Html: null, p2Url, detailHtml: null, detailUrl: null }

  const page1 = await readList(listHtml, listUrl, config)
  check('列表页存活：判墙未命中（Cloudflare / 登录墙 / 空白都没有）', page1.block === null, `detectBlock=${page1.block ?? '无'}`)
  check('卡片锚点命中（a[href^="/<lang>/job/"]）', page1.jobs.length > 0, `解析出 ${String(page1.jobs.length)} 条`)
  check('岗位 UUID 全部锚定（卡片身份锚）', page1.jobs.length > 0 && page1.jobs.every((job) => job.platformJobId !== ''), hitRate(page1.jobs, (job) => job.platformJobId))
  check('薪资徽章锚定（平台绝大多数卡片有薪资）', page1.jobs.some((job) => job.salaryRaw !== ''), hitRate(page1.jobs, (job) => job.salaryRaw))
  check('公司锚定（building 图标所在行）', page1.jobs.some((job) => job.company !== ''), hitRate(page1.jobs, (job) => job.company))
  check('分页容器里存在「页码 > 当前页」的链接', page1.hasNext, `hasNextPage=${String(page1.hasNext)}`)
  INFO.push(`第 1 页字段命中：id ${hitRate(page1.jobs, (job) => job.platformJobId)} · 薪资 ${hitRate(page1.jobs, (job) => job.salaryRaw)} · 公司 ${hitRate(page1.jobs, (job) => job.company)} · 城市 ${hitRate(page1.jobs, (job) => job.city ?? '')} · 经验 ${hitRate(page1.jobs, (job) => job.expReq ?? '')}`)
  const sample = page1.jobs[0]
  if (sample !== undefined) {
    INFO.push(`第 1 页样本：${sample.title} | ${sample.city ?? ''} | ${sample.salaryRaw} | ${sample.company} | tags=${(sample.tags ?? []).join('/')} | ${sample.sourceUrl}`)
  }
  await sleep(600)

  // 第 2 页：验证 ?page=N 真换数据（适配器文件头称已实测，这里复核）
  const p2Html = await fetchHtml(p2Url, '列表页 2')
  if (p2Html !== null) {
    const page2 = await readList(p2Html, p2Url, config)
    const first1 = page1.jobs[0]?.platformJobId ?? ''
    const first2 = page2.jobs[0]?.platformJobId ?? ''
    check('?page=2 真换数据（两页首条 UUID 不同）', first1 !== '' && first2 !== '' && first1 !== first2, `p1=${first1.slice(0, 8)} p2=${first2.slice(0, 8)}`)
  }
  await sleep(600)

  // 筛选值域复核：这些是适配器 `criteriaDimensions` 里对外承诺的取值
  const variants: Array<{ label: string; criteria: SearchCriteria }> = [
    { label: 'employment=1（全职）', criteria: { keyword: KEYWORD, platform: { employment: '1' } } },
    { label: 'workMode=1（远程）', criteria: { keyword: KEYWORD, platform: { workMode: '1' } } },
    { label: 'type=marketing', criteria: { keyword: KEYWORD, platform: { type: 'marketing' } } },
  ]
  for (const variant of variants) {
    const url = adapter.criteria.buildSearchUrl(variant.criteria)
    if (url === null) {
      check(`${variant.label} 能构造出 URL`, false, 'buildSearchUrl 返回 null')
      continue
    }
    const html = await fetchHtml(url, variant.label)
    if (html !== null) {
      const parsed = await readList(html, url, config)
      check(`${variant.label} 有结果且判墙未命中`, parsed.jobs.length > 0 && parsed.block === null, `${String(parsed.jobs.length)} 条 block=${parsed.block ?? '无'}`)
    }
    await sleep(600)
  }

  // 详情页：拿第 1 页第一条卡片的链接
  const firstHref = page1.jobs[0]?.sourceUrl ?? ''
  let detailHtml: string | null = null
  let detailUrl: string | null = firstHref === '' ? null : firstHref.split(config.webBase).join(`https://${HOST}`)
  if (detailUrl !== null) {
    detailHtml = await fetchHtml(detailUrl, '详情页')
  } else {
    log('⚠️ 第 1 页没拿到岗位链接，跳过详情页采集')
  }
  return { listHtml, listUrl, p2Html, p2Url, detailHtml, detailUrl }
}

// ── 离线：与 npm test 走同一条解析代码 ──────────────────────────────────────

async function analyzeCapture(files: {
  listHtml: string
  listUrl: string
  detailHtml?: string
  detailUrl?: string
}): Promise<void> {
  const config = configFor(HOST)
  const page1 = await readList(files.listHtml, files.listUrl, config)
  check('离线解析：条数与在线读数一致（> 0）', page1.jobs.length > 0, `${String(page1.jobs.length)} 条`)

  if (files.detailHtml !== undefined && files.detailUrl !== undefined) {
    const detailPage = new JsdomPage({ html: files.detailHtml, url: files.detailUrl })
    const detail = await detailPage.evaluate(extractDetailInPage, { selectors: config.detailSelectors })
    check('详情页：标题锚到（h1）', detail.title !== '', `title=${detail.title === '' ? '(空)' : detail.title}`)
    check('详情页：JD 正文锚到（div.prose.prose-sm）', (detail.jdText ?? '') !== '', `jd=${String((detail.jdText ?? '').length)} 字`)
    check('详情页：薪资锚到（渐变卡片内的金额）', detail.salaryRaw !== '', `salary=${detail.salaryRaw === '' ? '(空)' : detail.salaryRaw}`)
    INFO.push(`详情样本：${detail.title} | ${detail.salaryRaw} | tags=${(detail.tags ?? []).join('/')} | exp=${detail.expReq ?? '-'}${detail.company === '' ? '（公司名按设计留空：详情页无稳定锚点，调用方用列表兜底）' : ''}`)
  }

  // hasNextPageInPage 单独复核一次（适配器拿它当翻页闸门）
  const hasNext = await new JsdomPage({ html: files.listHtml, url: files.listUrl }).evaluate(hasNextPageInPage, {
    selector: config.selectors.pagination,
    currentPage: 1,
  })
  INFO.push(`离线复核 hasNextPageInPage(currentPage=1)=${String(hasNext)}`)
}

/** 离线复跑：挑最新的一份抓取（文件名带日期，排序即最新）。 */
async function offlineFiles(): Promise<{ listHtml: string; listUrl: string; detailHtml?: string; detailUrl?: string } | null> {
  let names: string[] = []
  try {
    names = readdirSync(CAPTURE_DIR)
  } catch {
    log(`⚠️ 没有抓取目录：${CAPTURE_DIR} —— 先在线跑一次`)
    return null
  }
  const listName = names.filter((name) => /^list-\d{4}-\d{2}-\d{2}\.html$/.test(name)).sort().pop()
  if (listName === undefined) {
    log(`⚠️ 抓取目录里没有 list-<日期>.html：${CAPTURE_DIR}`)
    return null
  }
  const config = configFor(HOST)
  const adapter = createHiredChinaAdapter({ config })
  const files: { listHtml: string; listUrl: string; detailHtml?: string; detailUrl?: string } = {
    listHtml: readFileSync(join(CAPTURE_DIR, listName), 'utf8'),
    listUrl: adapter.criteria.buildSearchUrl({ keyword: KEYWORD, page: 1 }) ?? '',
  }
  const detailName = names.filter((name) => /^detail-.*\.html$/.test(name)).sort().pop()
  if (detailName !== undefined) {
    files.detailHtml = readFileSync(join(CAPTURE_DIR, detailName), 'utf8')
    const uuid = /^detail-(.+?)-\d{4}-\d{2}-\d{2}\.html$/.exec(detailName)?.[1] ?? ''
    // 详情页地址是 `/<lang>/job/<uuid>`（单数 job，与列表的 /jobs 不同 —— 见适配器文件头）
    files.detailUrl = `${config.webBase}/${config.lang}/job/${uuid}`
  }
  INFO.push(`离线复跑夹具：${listName}${detailName === undefined ? '' : ` + ${detailName}`}`)
  return files
}

async function main(): Promise<void> {
  log(`关键词：${KEYWORD} · host：${HOST} · 抓取目录：${CAPTURE_DIR}`)

  if (OFFLINE_ONLY) {
    const files = await offlineFiles()
    if (files === null) {
      process.exitCode = 1
      return
    }
    await analyzeCapture(files)
  } else {
    const captured = await probeOnline()
    if (captured.listHtml === null) {
      log('✗ 在线抓取没拿到列表页，跳过落盘与离线复跑')
    } else {
      // 抓到的是别的 host 时，夹具里的相对链接仍按该 host 解析 —— 目录名带上 host 以免混淆
      mkdirSync(CAPTURE_DIR, { recursive: true })
      const listPath = join(CAPTURE_DIR, `list-${TODAY}.html`)
      writeFileSync(listPath, captured.listHtml, 'utf8')
      log(`夹具已保存：${listPath}`)
      if (captured.p2Html !== null) {
        const p2Path = join(CAPTURE_DIR, `list-p2-${TODAY}.html`)
        writeFileSync(p2Path, captured.p2Html, 'utf8')
        log(`夹具已保存：${p2Path}`)
      }
      let detailHtml: string | undefined
      let detailUrl: string | undefined
      if (captured.detailHtml !== null && captured.detailUrl !== null) {
        const uuid = /\/job\/([0-9a-f-]{36})/.exec(captured.detailUrl)?.[1] ?? 'unknown'
        const detailPath = join(CAPTURE_DIR, `detail-${uuid}-${TODAY}.html`)
        writeFileSync(detailPath, captured.detailHtml, 'utf8')
        log(`夹具已保存：${detailPath}`)
        detailHtml = readFileSync(detailPath, 'utf8')
        detailUrl = captured.detailUrl
      }
      await analyzeCapture({
        listHtml: readFileSync(listPath, 'utf8'),
        listUrl: captured.listUrl,
        ...(detailHtml === undefined || detailUrl === undefined ? {} : { detailHtml, detailUrl }),
      })
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
