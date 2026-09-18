import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildHiredChinaSearchUrl,
  createHiredChinaAdapter,
  DEFAULT_HIREDCHINA_CONFIG,
  mergeHiredChinaConfig,
} from '../../src/host/platform/adapters/hiredchina.js'
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

test('搜索 URL：type（实测）+ page（实测），城市未实现则拒绝', () => {
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { platform: { type: 'marketing' } }),
    'https://www.hiredchina.com/en/jobs?type=marketing',
  )
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { keyword: 'teacher' }),
    'https://www.hiredchina.com/en/jobs',
    '关键词参数未确证 —— v1 不拼 keyword（诚实，不臆造参数）',
  )
  assert.equal(
    buildHiredChinaSearchUrl(DEFAULT_HIREDCHINA_CONFIG, { platform: { type: 'marketing' }, page: 2 }),
    'https://www.hiredchina.com/en/jobs?type=marketing&page=2',
  )
  // 城市筛选未实现 → 返回 null（不猜）
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
  assert.equal(adapter.detail, undefined, '详情选择器未用夹具验证 → 不声明')
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
  assert.ok((first.tags ?? []).includes('Full-time'), '雇佣类型进 tags')
  assert.ok((first.tags ?? []).includes('On-site'), '工作模式进 tags')
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

  // 无额外含 "·" 的纯城市名：第三张是单段 "Shanghai"
  const third = jobs[2] as (typeof jobs)[number]
  assert.equal(third.city, 'Shanghai')

  // hasNextPage：分页容器里存在 page=2 > 当前页 1
  assert.equal(await adapter.crawl.hasNextPage(page), true)
})

test('hasNextPage：当前页已是末页时返回 false', async () => {
  const adapter = createHiredChinaAdapter()
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