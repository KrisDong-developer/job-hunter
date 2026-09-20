import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHiredChinaAdapter } from '../../src/host/platform/adapters/hiredchina/index.js'
import {
  DEFAULT_HIREDCHINA_CONFIG,
  mergeHiredChinaConfig,
} from '../../src/host/platform/adapters/hiredchina/config.js'
import { buildHiredChinaSearchUrl } from '../../src/host/platform/adapters/hiredchina/urls.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

/**
 * 夹具：按 2026-09-18 浏览器探针实测的卡片 DOM 结构还原（见 hiredchina.ts 文件头）。
 * 卡片 = 详情链接 `<a href="/en/job/<uuid>?returnTo=...">`，内部 `div[data-slot="card"]`，
 * h3 标题 + building 图标公司行 + 五个按底色区分的徽章（emerald薪资/gray地点/blue雇佣/orange工作模式/slate经验）。
 */
function card(
  id: string,
  title: string,
  company: string,
  salary: string,
  location: string,
  employment: string,
  workMode: string,
  experience: string,
): string {
  return `<a class="block w-full h-full" href="/en/job/${id}?returnTo=%2Fjobs">
    <div data-slot="card" class="text-card-foreground flex flex-row p-3 sm:p-5 rounded-2xl border bg-white w-full">
      <div class="flex-1">
        <div class="flex items-center gap-1"><svg class="size-4 lucide-building-2"></svg><span class="truncate">${company}</span></div>
        <h3 class="text-emerald-600 font-bold">${title}</h3>
        <div class="inline-flex bg-emerald-50 text-emerald-700"><svg></svg><span class="truncate">${salary}</span></div>
        <div class="inline-flex bg-gray-50 text-gray-600"><svg></svg><span class="truncate">${location}</span></div>
        <div class="inline-flex bg-blue-50 text-blue-600"><svg class="lucide-briefcase"></svg><span class="truncate">${employment}</span></div>
        <div class="inline-flex bg-orange-50 text-orange-600"><svg class="lucide-globe"></svg><span class="truncate">${workMode}</span></div>
        <div class="inline-flex bg-slate-50 text-slate-500"><svg></svg><span class="truncate">${experience}</span></div>
        <div class="flex items-center justify-between mt-auto border-t">2h ago</div>
      </div>
    </div>
  </a>`
}

const LIST_HTML = `<!doctype html><html><body>
${card(
  '555bb318-bce8-4bf5-9678-7f58097751fa',
  'English Reading Coach',
  'Shanghai Huidushu Culture',
  '20K - 25K RMB per month',
  'China · Shanghai',
  'Full-time',
  'On-site',
  '1～3 years',
)}
${card(
  'a0ecf347-77df-448d-802f-dcb2420690f5',
  'Russian After-Sales Engineer',
  'Techik Instrument (Shanghai)',
  'Negotiable',
  'Russia · Moscow-Tula',
  'Full-time',
  'On-site',
  '1～3 years',
)}
${card(
  '3418d6eb-f0fc-4084-babb-7276a3929d61',
  'Overseas Brand Anchor',
  'ONYX',
  'Under 10K RMB per month',
  'Shanghai',
  'Part-time',
  'Remote',
  'Unlimited experience',
)}
<div><nav aria-label="pagination">
  <a href="/en/jobs?page=1">1</a>
  <a href="/en/jobs?page=2">2</a>
</nav></div>
</body></html>`

function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

function browserLikePage(html: string, url: string): PageLike {
  const inner = new JsdomPage({ html, url })
  return {
    goto: (target) => inner.goto(target),
    url: () => inner.url(),
    waitForTimeout: (ms) => inner.waitForTimeout(ms),
    waitForSelector: (selector, timeoutMs) => inner.waitForSelector(selector, timeoutMs),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> => {
      // 按源码重建函数（切断模块闭包）—— 验证真路径序列化后也能跑（见 docs/ADAPTERS.md §2）
      const rebuilt = asSerialized(fn as unknown as (...args: never[]) => unknown)
      return await inner.evaluate(rebuilt as unknown as (value: A) => R, arg)
    },
  }
}

const DEFAULT_URL = 'https://www.hiredchina.com/en/jobs'

test('搜索 URL：kw + type + employmentId + isOnline + page（全部已实测），城市缺失则拒绝', () => {
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { platform: { type: 'marketing' } }),
    'https://www.hiredchina.com/en/jobs?type=marketing',
  )
  // 关键词实测键名是 kw
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { keyword: 'teacher' }),
    'https://www.hiredchina.com/en/jobs?kw=teacher',
  )
  // 雇佣类型 employmentId / 工作模式 isOnline
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { keyword: 'teacher', platform: { employment: '1', workMode: '1' } }),
    'https://www.hiredchina.com/en/jobs?kw=teacher&employmentId=1&isOnline=1',
  )
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { platform: { type: 'marketing' }, page: 2 }),
    'https://www.hiredchina.com/en/jobs?type=marketing&page=2',
  )
  // 本平台没有城市 URL 筛选 → 返回 null（不猜，绝不静默搜全国）
  assert.equal(buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { city: '深圳' }), null)
})

test('适配器声明符合平台事实：公共可搜、薪资常在（完整核心字段）、antiBot=medium', () => {
  const adapter = createHiredChinaAdapter()
  assert.equal(adapter.id, 'hiredchina')
  assert.equal(adapter.displayName, 'HiredChina')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium')
  assert.equal(adapter.capabilities.antiBot, 'medium')
  assert.equal(adapter.maxPages, 5, '翻页已实测；上限是对 Cloudflare 主站的保守取舍')
  assert.ok(adapter.requiredFields.includes('salary_raw' as never), '薪资常在（含 Negotiable 合法值）→ 进必需字段')
  assert.equal(adapter.actions, undefined, '投递契约未验证 → fail-closed')
  assert.ok(adapter.detail !== undefined, '详情页有探针注明锚点（h1 / 渐变薪资 / prose JD）→ 声明 detail')
})

test('判墙：Cloudflare 挑战 → captcha；频控文案 → rate-limited', async () => {
  const adapter = createHiredChinaAdapter()
  // Cloudflare managed challenge（raw HTTP 实测命中 www.hiredchina.com 的形式）
  const cf = browserLikePage('<!doctype html><html><body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>Just a moment...</body></html>', DEFAULT_URL)
  assert.equal(await adapter.guard.detectBlock(cf), 'captcha')

  const rateLimited = browserLikePage('<html><body><div>您访问过于频繁，请稍后再试</div></body></html>', DEFAULT_URL)
  assert.equal(await adapter.guard.detectBlock(rateLimited), 'rate-limited')
})

test('真实结构夹具解析：按底色徽章区分字段，逐条符合平台事实', async () => {
  const adapter = createHiredChinaAdapter()
  const page = browserLikePage(LIST_HTML, DEFAULT_URL)

  const block = await adapter.guard.detectBlock(page)
  assert.equal(block, null, '夹具不该被判墙')

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 3)

  const first = jobs[0] as (typeof jobs)[number]
  assert.equal(first.title, 'English Reading Coach')
  assert.equal(first.company, 'Shanghai Huidushu Culture')
  assert.equal(first.salaryRaw, '20K - 25K RMB per month')
  assert.equal(first.city, 'Shanghai', '地点 "China · Shanghai" 取最后段为城市')
  assert.equal(first.expReq, '1～3 years')
  assert.ok((first.tags ?? []).includes('全职'), '雇佣类型归一为中文标签（Full-time → 全职）')
  assert.ok((first.tags ?? []).includes('现场'), '工作模式归一为中文标签（On-site → 现场）')
  assert.equal(
    first.platformJobId,
    '555bb318-bce8-4bf5-9678-7f58097751fa',
    '必须抠出 UUID（幂等键）',
  )
  assert.ok(
    first.sourceUrl.startsWith('https://www.hiredchina.com/en/job/555bb318-bce8-4bf5-9678-7f58097751fa'),
    '详情链接绝对化后的形态',
  )

  // 面议即 "Negotiable" 是合法值，不该被当缺失
  const second = jobs[1] as (typeof jobs)[number]
  assert.equal(second.salaryRaw, 'Negotiable')
  assert.equal(second.city, 'Moscow-Tula')

  // 无额外含 "·" 的纯城市名：第三张是单段 "Shanghai"；Part-time/Remote → 兼职/远程
  const third = jobs[2] as (typeof jobs)[number]
  assert.equal(third.city, 'Shanghai')
  assert.ok((third.tags ?? []).includes('兼职'))
  assert.ok((third.tags ?? []).includes('远程'))

  // hasNextPage：分页容器里存在 page=2 > 当前页 1
  assert.equal(await adapter.crawl.hasNextPage(page), true)
})

test('en/zh 词表归一：中文站卡片同样归一到 全职/现场/远程（自包含护栏随函数一起重建）', async () => {
  const adapter = createHiredChinaAdapter()
  // zh 站：全职 / 现场；第三张 兼职 / 远程 —— 与 en 站归一结果一致
  const zhHtml = `<!doctype html><html><body>
  ${card('555bb318-bce8-4bf5-9678-7f58097751fa', '英语阅读教练', '上海会读书', '2万 - 2.5万RMB/月', '中国 · 上海', '全职', '现场', '1～3年')}
  ${card('3418d6eb-f0fc-4084-babb-7276a3929d61', '海外主播', 'ONYX', '面议', '中国 · 上海', '兼职', '远程', '经验不限')}
  </body></html>`
  const page = browserLikePage(zhHtml, 'https://www.hiredchina.com/zh/jobs')
  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 2)
  assert.ok((jobs[0]?.tags ?? []).includes('全职'))
  assert.ok((jobs[0]?.tags ?? []).includes('现场'))
  assert.ok((jobs[1]?.tags ?? []).includes('兼职'))
  assert.ok((jobs[1]?.tags ?? []).includes('远程'))
})

test('详情页 extract：h1 / 渐变卡片薪资 / 徽章行归一 / prose JD 全文', async () => {
  const adapter = createHiredChinaAdapter()
  const detailUrl = 'https://www.hiredchina.com/en/job/555bb318-bce8-4bf5-9678-7f58097751fa'
  const DETAIL_HTML = `<!doctype html><html><body>
    <div class="rounded-xl bg-gradient-to-br from-primary/5 via-background to-background border p-6 md:p-8">
      <h1 class="text-2xl md:text-3xl font-bold tracking-tight text-foreground">English Teacher</h1>
      <div class="flex flex-col items-start shrink-0"><span class="text-3xl font-bold">20K - 25K RMB per month</span></div>
    </div>
    <div class="flex flex-wrap gap-2">
      <span class="inline-flex items-center justify-center rounded-full border">China · Shanghai</span>
      <span class="inline-flex items-center justify-center rounded-full border">Education</span>
      <span class="inline-flex items-center justify-center rounded-full border">Full-time</span>
      <span class="inline-flex items-center justify-center rounded-full border">On-site</span>
      <span class="inline-flex items-center justify-center rounded-full border">English</span>
    </div>
    <div class="space-y-4">
      <h3 class="text-xl font-semibold">Job Description</h3>
      <div class="prose prose-sm max-w-none text-muted-foreground">Teach English in Shanghai. Candidates must hold TEFL and have 2 years experience.</div>
    </div>
  </body></html>`
  const page = browserLikePage(DETAIL_HTML, detailUrl)
  const detailApi = adapter.detail
  assert.ok(detailApi !== undefined, '适配器应声明 detail')
  const detail = await detailApi.extract(page)
  assert.equal(detail.title, 'English Teacher')
  assert.equal(detail.salaryRaw, '20K - 25K RMB per month')
  assert.ok(detail.jdText != null && detail.jdText.includes('Teach English in Shanghai'), 'JD 全文应解析出')
  assert.ok((detail.tags ?? []).includes('全职'), '徽章行 "Full-time" 归一到 全职')
  assert.ok((detail.tags ?? []).includes('现场'), '徽章行 "On-site" 归一到 现场')
  assert.equal(detail.sourceUrl, detailUrl)
})

test('hasNextPage：当前页已是末页时返回 false', async () => {
  const lastPageHtml = `<!doctype html><html><body>${card(
    '555bb318-bce8-4bf5-9678-7f58097751fa',
    'x',
    'y',
    'Negotiable',
    'China · Beijing',
    'Full-time',
    'On-site',
    'Unlimited experience',
  )}<nav aria-label="pagination"><a href="/en/jobs?page=2">2</a></nav></body></html>`
  const page = browserLikePage(lastPageHtml, 'https://www.hiredchina.com/en/jobs?page=2')
  // emulate gotoSearch recording page: currentPage reads from pending WeakMap set by gotoSearch.
  const adapterWithPage = createHiredChinaAdapter()
  await adapterWithPage.crawl.gotoSearch(page, { platform: { type: 'marketing' }, page: 2 })
  assert.equal(await adapterWithPage.crawl.hasNextPage(page), false, '分页容器只有"当前页 2"，无更大页码')
})

test('mergeHiredChinaConfig：DB 覆盖合并到代码默认', () => {
  const merged = mergeHiredChinaConfig({
    webBase: 'https://hcweb.gicexpat.com',
    selectors: { title: 'h2' },
    maxPages: 10,
  })
  assert.equal(merged.webBase, 'https://hcweb.gicexpat.com')
  assert.equal(merged.selectors.title, 'h2')
  // 未覆盖的字段保留默认
  assert.equal(merged.selectors.salaryBadge, '[class*="bg-emerald-50"]')
  assert.equal(merged.maxPages, 10)
})