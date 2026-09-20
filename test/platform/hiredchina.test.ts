import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 * 夹具：2026-09-20 由 `npm run probe:hiredchina` 从 hcweb.gicexpat.com（不受
 * Cloudflare 拦的同源子域）抓取的**真实页面**（本平台此前用的是内联合成 HTML，
 * 真实抓取证明列表卡片根本不在 DOM 里 —— 数据在 RSC 流 `initialData.list`，
 * 见适配器文件头 2026-09-20 校准记录）。
 *
 *   hiredchina-search.html     列表第 1 页（?kw=Java，payload 10 条）
 *   hiredchina-search-p2.html  列表第 2 页（翻页证据：首条 UUID 与 p1 不同）
 *   hiredchina-detail.html     首条岗位详情页（SSR 直出 DOM）
 */
const FIXTURES = join(process.cwd(), 'test/fixtures')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

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

const HOST = 'https://hcweb.gicexpat.com'
const LIST_URL = `${HOST}/en/jobs?kw=Java`

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

test('适配器声明符合平台事实：公共可搜、薪资约四成保密（不含 salary_raw）、antiBot=medium', () => {
  const adapter = createHiredChinaAdapter()
  assert.equal(adapter.id, 'hiredchina')
  assert.equal(adapter.displayName, 'HiredChina')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium')
  assert.equal(adapter.capabilities.antiBot, 'medium')
  assert.equal(adapter.maxPages, 5, '翻页已实测；上限是对 Cloudflare 主站的保守取舍')
  assert.ok(
    !adapter.requiredFields.includes('salary_raw' as never),
    '真实夹具 10 条里 4 条 salaryKey=keep.secret（还原为 Negotiable）→ salary_raw 不进必需字段',
  )
  assert.ok(adapter.requiredFields.includes('title' as never))
  assert.ok(adapter.requiredFields.includes('company' as never))
  assert.equal(adapter.actions, undefined, '投递契约未验证 → fail-closed')
  assert.ok(adapter.detail !== undefined, '详情页选择器已由真实夹具校准 → 声明 detail')
})

test('判墙：Cloudflare 挑战 → captcha；频控文案 → rate-limited', async () => {
  const adapter = createHiredChinaAdapter()
  // Cloudflare managed challenge（raw HTTP 实测命中 www.hiredchina.com 的形式）
  const cf = browserLikePage('<!doctype html><html><body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script>Just a moment...</body></html>', 'https://www.hiredchina.com/en/jobs')
  assert.equal(await adapter.guard.detectBlock(cf), 'captcha')

  const rateLimited = browserLikePage('<html><body><div>您访问过于频繁，请稍后再试</div></body></html>', 'https://www.hiredchina.com/en/jobs')
  assert.equal(await adapter.guard.detectBlock(rateLimited), 'rate-limited')
})

test('真实夹具（列表 p1）：RSC payload 解析 10 条，首条逐字段符合页面事实', async () => {
  const adapter = createHiredChinaAdapter({ config: { ...DEFAULT_HIREDCHINA_CONFIG, webBase: HOST } })
  const page = browserLikePage(fixture('hiredchina-search.html'), LIST_URL)

  const block = await adapter.guard.detectBlock(page)
  assert.equal(block, null, '真实列表页不该被判墙（无卡片 DOM 是常态，数据在 RSC 流里）')

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 10, 'payload 每页 10 条（实测）')

  const first = jobs[0] as (typeof jobs)[number]
  assert.equal(first.platformJobId, '0acccd15-b98e-4031-ad78-9c262d09624c', 'payload 的 line 即岗位 UUID（幂等键）')
  assert.equal(first.title, 'Java Development Engineer (Fresh Graduates Accepted)Java开发工程师（可接受应届生）')
  assert.equal(first.salaryRaw, 'Negotiable', 'salaryKey=keep.secret → 还原为面议（合法值，不是缺失）')
  assert.equal(first.company, 'Hank Times')
  assert.equal(first.city, 'Malaysia', 'location key（support.nationalitie.malaysia）按构词规则还原')
  assert.equal(first.expReq, 'Unlimited Experience', 'workingYearsKey 还原')
  assert.equal(first.publishedAt, '2026-09-03T01:52:00.000Z', 'refreshAt 绝对时间戳（DOM 时代拿不到）')
  assert.deepEqual(first.tags, ['全职', '现场'], 'employmentKey/isOnline 归一：full-time → 全职、0 → 现场')
  assert.equal(
    first.sourceUrl,
    'https://hcweb.gicexpat.com/en/job/0acccd15-b98e-4031-ad78-9c262d09624c',
    '详情 URL = /<lang>/job/<uuid>（跟当前页同源绝对化）',
  )
  assert.equal((first.notes ?? []).length, 0, '首条各字段全锚定，无 note')
})

test('真实夹具（薪资分布）：keep.secret → Negotiable；区间 key 还原为可读文本', async () => {
  const adapter = createHiredChinaAdapter({ config: { ...DEFAULT_HIREDCHINA_CONFIG, webBase: HOST } })
  const page = browserLikePage(fixture('hiredchina-search.html'), LIST_URL)
  const jobs = await adapter.crawl.readListPage(page)

  // 实测分布：keep.secret ×4（Negotiable）+ 区间 ×6
  assert.equal(jobs.filter((job) => job.salaryRaw === 'Negotiable').length, 4)
  const salaries = jobs.map((job) => job.salaryRaw).sort()
  assert.ok(salaries.includes('10K - 15K'), `10k.-.15k 还原 → ${salaries.join(' / ')}`)
  assert.ok(salaries.includes('20K - 25K'))
  assert.ok(salaries.includes('25K - 30K'))
  assert.ok(salaries.includes('30K - 35K RMB Per Month'), '30k.-.35k.rmb.per.month → RMB 大写')
  assert.ok(salaries.includes('More Than 30K'), 'more.than.30k → 词首大写')
})

test('真实夹具（翻页）：p2 首条 UUID 与 p1 不同；满页判据 hasNextPage=true', async () => {
  const adapter = createHiredChinaAdapter({ config: { ...DEFAULT_HIREDCHINA_CONFIG, webBase: HOST } })

  const page1 = browserLikePage(fixture('hiredchina-search.html'), LIST_URL)
  const p1 = await adapter.crawl.readListPage(page1)
  assert.equal(await adapter.crawl.hasNextPage(page1), true, '本页 10 条 = pageSize → 有下一页（payload 无分页元信息）')

  const page2 = browserLikePage(fixture('hiredchina-search-p2.html'), `${LIST_URL}&page=2`)
  const p2 = await adapter.crawl.readListPage(page2)
  assert.equal(p2.length, 10)
  assert.notEqual(p2[0]?.platformJobId, p1[0]?.platformJobId, '?page=2 在 payload 层真换数据（翻页证据）')
  assert.equal(p2[0]?.platformJobId, 'e6ee58f2-c771-45ce-bd12-07826f45e62f')
})

test('满页判据：不满页（< pageSize）→ hasNextPage=false；没读过列表 → false', async () => {
  const adapter = createHiredChinaAdapter({ config: { ...DEFAULT_HIREDCHINA_CONFIG, webBase: HOST, pageSize: 10 } })
  // 内联合成：只有 3 条岗位的 RSC 流（payload 通道的最小样本）
  const job = (id: string): string =>
    `{\\"line\\":\\"${id}\\",\\"name\\":\\"Job ${id}\\",\\"company\\":{\\"name\\":\\"C\\"},\\"salaryKey\\":\\"\\",\\"isOnline\\":0}`
  const html = `<!doctype html><html><body><script>self.__next_f.push([1,"f:[\\"$\\",\\"$L2a\\",null,{\\"initialData\\":{\\"list\\":[${job('a')},${job('b')},${job('c')}]}]"])</script></body></html>`
  const page = browserLikePage(html, LIST_URL)
  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 3)
  assert.equal(await adapter.crawl.hasNextPage(page), false, '3 条 < pageSize 10 → 末页')

  const unread = browserLikePage('<html><body></body></html>', LIST_URL)
  assert.equal(await adapter.crawl.hasNextPage(unread), false, '没读过列表（无记录）→ false')
})

test('真实夹具（详情）：SSR 直出 DOM 全字段锚定 + JD 按标题拼接 Requirements', async () => {
  const adapter = createHiredChinaAdapter()
  const detailUrl = 'https://www.hiredchina.com/en/job/0acccd15-b98e-4031-ad78-9c262d09624c'
  const page = browserLikePage(fixture('hiredchina-detail.html'), detailUrl)
  const detailApi = adapter.detail
  assert.ok(detailApi !== undefined, '适配器应声明 detail')
  const detail = await detailApi.extract(page)

  assert.equal(detail.title, 'Java Development Engineer (Fresh Graduates Accepted)Java开发工程师（可接受应届生）')
  assert.equal(detail.salaryRaw, 'Negotiable', '薪资 = items-start/shrink-0 容器的金额元素（不是 text-3xl，那是 h1）')
  assert.equal(detail.company, 'Hank Times', '公司 = 渐变卡内 p.font-medium')
  assert.equal(detail.industry, 'IT', '行业 = 渐变卡内 p.text-sm（2026-09-20 校准新增锚点）')
  assert.deepEqual(detail.tags, ['全职', '现场'], '徽章行归一（避开骨架屏，锚定渐变卡内）')
  assert.equal(detail.sourceUrl, detailUrl)

  const jd = detail.jdText ?? ''
  assert.ok(jd.length > 500, `JD 应解析出全文（实测 977 字），得到 ${String(jd.length)}`)
  assert.ok(jd.includes('eCommerce'), 'Job Description 段在 jdText 里')
  assert.ok(
    jd.includes('Qualifications'),
    'Requirements 段也拼进了 jdText（只取第一段会丢任职要求 —— 下游打分要读技能词）',
  )
  assert.equal((detail.notes ?? []).length, 0, '全字段锚定，无 note')
})

test('合成负样本：RSC 流锚点漂移（initialData 不在）→ 0 条，不抛错', async () => {
  const adapter = createHiredChinaAdapter()
  const html = '<!doctype html><html><body><script>self.__next_f.push([1,"f:[\\"$\\",\\"div\\",null,{}]"])</script></body></html>'
  const page = browserLikePage(html, LIST_URL)
  assert.deepEqual(await adapter.crawl.readListPage(page), [], '解析不出就如实 0 条（主链按 NO_RECORDS 记 partial）')
})

test('mergeHiredChinaConfig：DB 覆盖合并到代码默认（含数组字段边界校验）', () => {
  const merged = mergeHiredChinaConfig({
    webBase: 'https://hcweb.gicexpat.com',
    selectors: { card: 'a[data-x]' },
    payloadAnchors: { dataKey: 'otherData' },
    detailSelectors: { salary: 'div.x', jdSectionTitles: 'not-an-array' },
    pageSize: 20,
    maxPages: 10,
  })
  assert.equal(merged.webBase, 'https://hcweb.gicexpat.com')
  assert.equal(merged.selectors.card, 'a[data-x]')
  assert.equal(merged.payloadAnchors.dataKey, 'otherData')
  assert.equal(merged.payloadAnchors.listKey, 'list', '未覆盖的 payload 锚点保留默认')
  assert.equal(merged.detailSelectors.salary, 'div.x')
  // 坏数组（字符串混入）在合并边界被吃掉 → 回落默认词表（否则页面上下文 for…of 会抛）
  assert.deepEqual(merged.detailSelectors.jdSectionTitles, DEFAULT_HIREDCHINA_CONFIG.detailSelectors.jdSectionTitles)
  assert.equal(merged.pageSize, 20)
  assert.equal(merged.maxPages, 10)
})
