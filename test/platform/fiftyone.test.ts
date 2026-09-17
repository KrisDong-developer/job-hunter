import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  createFiftyOneAdapter,
  DEFAULT_FIFTYONE_CONFIG,
  mergeFiftyOneConfig,
  type FiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job.js'
import { JsdomPage } from '../support/jsdom-page.js'
import { fixtureHtmlPath } from '../support/store.js'
import type { PageLike } from '../../src/host/platform/types.js'

const SEARCH_URL = 'https://we.51job.com/pc/search?keyword=Java&jobArea=040000'
const FIXTURE_HTML = readFileSync(fixtureHtmlPath(), 'utf8')

function page(html: string = FIXTURE_HTML): JsdomPage {
  return new JsdomPage({ html, url: SEARCH_URL })
}

test('字段 → URL 参数映射：城市码是人工维护的配置', () => {
  const adapter = createFiftyOneAdapter()
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '深圳' }),
    'https://we.51job.com/pc/search?keyword=Java&jobArea=040000',
  )
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '北京', page: 3 }),
    'https://we.51job.com/pc/search?keyword=Java&jobArea=010000&pageNum=3',
  )
})

test('未知城市返回 null —— 不猜城市码', () => {
  const adapter = createFiftyOneAdapter()
  assert.equal(adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '不存在的城市' }), null)
})

test('DB 覆盖能合并到默认配置上（ADR-19：配置以 DB 为权威）', () => {
  const merged = mergeFiftyOneConfig({ selectors: { title: '.custom-title' } })
  assert.equal(merged.selectors.title, '.custom-title')
  assert.equal(merged.selectors.card, DEFAULT_FIFTYONE_CONFIG.selectors.card)
  assert.equal(merged.urlParams.base, DEFAULT_FIFTYONE_CONFIG.urlParams.base)
  assert.deepEqual(mergeFiftyOneConfig(null), DEFAULT_FIFTYONE_CONFIG)
})

test('离线夹具：解析出 20 条岗位，关键字段逐项对得上', async () => {
  const adapter = createFiftyOneAdapter()
  const jobs = await adapter.crawl.readListPage(page())

  assert.equal(jobs.length, 20)

  const first = jobs[0]
  assert.ok(first)
  assert.equal(first.platformJobId, '173674707')
  assert.equal(first.title, '全栈开发工程师')
  assert.equal(first.salaryRaw, '1.3-1.8万')
  assert.equal(first.company, '深圳市明泰海科技术有限公司')
  assert.equal(first.sourceUrl, 'https://jobs.51job.com/all/173674707.html')
  assert.equal(first.city, '深圳')
  assert.equal(first.district, '南山区')
  assert.equal(first.expReq, '5年及以上')
  assert.equal(first.eduReq, '本科')
  assert.equal(first.industry, '船舶/航空/航天')
  assert.equal(first.companyNature, '民营')
  assert.equal(first.companySize, '少于50人')
  assert.ok(first.tags?.includes('react'))
  assert.ok(first.publishedAt?.startsWith('2026-09-16'))

  // 每条都必须能拼出详情地址（source_url 是核心字段）
  assert.ok(jobs.every((job) => job.platformJobId !== '' && job.sourceUrl !== ''))
})

test('正常页面不算撞墙', async () => {
  const adapter = createFiftyOneAdapter()
  assert.equal(await adapter.guard.detectBlock(page()), null)
})

test('滑块 / 登录墙 / 空白页能被区分出来', async () => {
  const adapter = createFiftyOneAdapter()
  assert.equal(
    await adapter.guard.detectBlock(page('<html><body><div class="geetest_panel">请完成验证</div></body></html>')),
    'captcha',
  )
  assert.equal(
    await adapter.guard.detectBlock(page('<html><body><div>登录 / 注册 扫码登录</div></body></html>')),
    'login-required',
  )
  assert.equal(await adapter.guard.detectBlock(page('<html><body></body></html>')), 'blank')
  assert.equal(
    await adapter.guard.detectBlock(page('<html><body><div>访问过于频繁，请稍后再试</div></body></html>')),
    'rate-limited',
  )
})

test('选择器被改坏时：一条字段都解析不出来，并留下可读的 notes', async () => {
  const broken: FiftyOneConfig = {
    ...DEFAULT_FIFTYONE_CONFIG,
    selectors: {
      ...DEFAULT_FIFTYONE_CONFIG.selectors,
      title: '.nope-title',
      salary: '.nope-salary',
      company: '.nope-company',
      tracking: '[sensorsname="NopeNever"]',
    },
  }
  const adapter = createFiftyOneAdapter({ config: broken })
  const jobs = await adapter.crawl.readListPage(page())

  // 卡片容器没坏 → 仍然「看到」20 张卡，这正是 §4.2.4 要抓的那种静默失败
  assert.equal(jobs.length, 20)
  assert.ok(jobs.every((job) => job.title === '' && job.salaryRaw === '' && job.company === ''))
  assert.ok(jobs.every((job) => job.sourceUrl === ''), '拿不到 jobId 就拼不出详情地址')
  assert.ok(jobs[0]?.notes?.includes('tracking:missing-element'))
})

// ── 真路径的回归护栏 ──────────────────────────────────────────────────

/**
 * 像浏览器那样**只拿函数源码**重建：闭包一律不存在。
 *
 * 这是离线环境里唯一能复现「真路径 ReferenceError」的手段。
 * 这条护栏是被真事逼出来的：`extractJobsInPage` 里原本引用了模块级常量 `MAX_CARDS`，
 * jsdom 测试全绿（Node 里闭包还在），一上真浏览器就整页解析失败。
 */
function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

/** 一个 evaluate 时会重建函数的页面（模拟 Playwright 的序列化）。 */
function browserLikePage(html: string): PageLike {
  const inner = new JsdomPage({ html, url: SEARCH_URL })
  return {
    goto: (url) => inner.goto(url),
    url: () => inner.url(),
    waitForTimeout: (ms) => inner.waitForTimeout(ms),
    waitForSelector: (selector, timeoutMs) => inner.waitForSelector(selector, timeoutMs),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> => {
      const rebuilt = asSerialized(fn as unknown as (...args: never[]) => unknown)
      return await inner.evaluate(rebuilt as unknown as (value: A) => R, arg)
    },
  }
}

test('护栏本身有效：引用闭包的函数重建后必然 ReferenceError', () => {
  const moduleScoped = 42
  const leaky = (): number => moduleScoped
  const rebuilt = asSerialized(leaky)
  assert.throws(() => rebuilt(), ReferenceError)
})

test('页面函数必须自包含：按源码重建后仍能正常解析与判墙', async () => {
  const adapter = createFiftyOneAdapter()
  const browserPage = browserLikePage(FIXTURE_HTML)

  // readListPage / detectBlock / hasNextPage 都会走 page.evaluate，
  // 任何一个引用了模块作用域的变量，这里都会炸。
  const jobs = await adapter.crawl.readListPage(browserPage)
  assert.equal(jobs.length, 20)
  assert.equal(jobs[0]?.title, '全栈开发工程师')
  assert.equal(jobs[0]?.sourceUrl, 'https://jobs.51job.com/all/173674707.html')

  assert.equal(await adapter.guard.detectBlock(browserPage), null)
  assert.equal(typeof (await adapter.crawl.hasNextPage(browserPage)), 'boolean')
})

test('撞墙判定在「按源码重建」后同样成立', async () => {
  const adapter = createFiftyOneAdapter()
  const captcha = browserLikePage('<html><body><div class="geetest_panel">请完成验证</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(captcha), 'captcha')
})
