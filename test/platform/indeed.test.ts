import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildIndeedSearchUrl,
  createIndeedAdapter,
  DEFAULT_INDEED_CONFIG,
  mergeIndeedConfig,
} from '../../src/host/platform/adapters/indeed.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://cn.indeed.com/jobs?q=Java&l=北京&start=0'

/** 序列化重建：模拟 Playwright 把函数送进浏览器的真实路径（闭包不存在）。 */
function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

function browserLikePage(html: string, url = SEARCH_URL): PageLike {
  const inner = new JsdomPage({ html, url })
  return {
    goto: (target) => inner.goto(target),
    url: () => inner.url(),
    waitForTimeout: (ms) => inner.waitForTimeout(ms),
    waitForSelector: (selector, timeoutMs) => inner.waitForSelector(selector, timeoutMs),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> => {
      const rebuilt = asSerialized(fn as unknown as (...args: never[]) => unknown)
      return await inner.evaluate(rebuilt as unknown as (value: A) => R, arg)
    },
  }
}

// ── URL 构造 ───────────────────────────────────────────────────────────

test('搜索 URL：q/l/start；第一页 start=0；第二页 start=pageSize', () => {
  const url = buildIndeedSearchUrl(DEFAULT_INDEED_CONFIG, { keyword: 'Java', city: '北京', page: 1 })
  assert.equal(url, `https://cn.indeed.com/jobs?q=Java&l=${encodeURIComponent('北京')}&start=0`)
  const page2 = buildIndeedSearchUrl(DEFAULT_INDEED_CONFIG, { keyword: 'Java', city: '北京', page: 2 })
  assert.equal(page2, `https://cn.indeed.com/jobs?q=Java&l=${encodeURIComponent('北京')}&start=15`)
})

test('地点为自由文本：城市值直接进 l=，不需要城市码映射', () => {
  const url = buildIndeedSearchUrl(DEFAULT_INDEED_CONFIG, { keyword: 'Java', city: '深圳市' })
  assert.equal(url, `https://cn.indeed.com/jobs?q=Java&l=${encodeURIComponent('深圳市')}&start=0`)
  // 无城市：不带 l=
  const noCity = buildIndeedSearchUrl(DEFAULT_INDEED_CONFIG, { keyword: 'Java' })
  assert.equal(noCity, 'https://cn.indeed.com/jobs?q=Java&start=0')
})

test('host 可被 DB 覆盖：换仍运营的域（如 sg/de）', () => {
  const config = mergeIndeedConfig({ host: 'sg.indeed.com' })
  const url = buildIndeedSearchUrl(config, { keyword: 'Java', city: 'Singapore', page: 1 })
  assert.equal(url, 'https://sg.indeed.com/jobs?q=Java&l=Singapore&start=0')
})

test('pageSize 可被 DB 覆盖：page=2 的 start 随之变化', () => {
  const config = mergeIndeedConfig({ pageSize: 10 })
  const url = buildIndeedSearchUrl(config, { keyword: 'Java', page: 2 })
  assert.equal(url, 'https://cn.indeed.com/jobs?q=Java&start=10')
})

test('空条件也给出合法 URL（start=0 兜底）', () => {
  assert.equal(buildIndeedSearchUrl(DEFAULT_INDEED_CONFIG, {}), 'https://cn.indeed.com/jobs?start=0')
})

// ── 判墙（Indeed.cn 停运的实测信号：重定向 + Cloudflare 墙） ───────────────

test('判墙：被 302 重定向到别的域（cn → www.indeed.com）→ blank', async () => {
  const adapter = createIndeedAdapter()
  // 页面 URL 已是别的域，hostname 与配置 host 不一致 → 判 blank（站点把我们挪走了）
  const redirected = browserLikePage('<html><body><p>下一份工作，由此启程</p></body></html>', 'https://www.indeed.com/jobs?q=Java')
  assert.equal(await adapter.guard.detectBlock(redirected), 'blank')
})

test('判墙：Cloudflare 验证墙（实测文案「需要进行其他验证」）→ captcha', async () => {
  const adapter = createIndeedAdapter()
  const cf = browserLikePage(
    '<html><body><h3>需要进行其他验证</h3><p>您本次请求的 Ray ID 为 a3cf3cbf1c5d8c4f</p></body></html>',
  )
  assert.equal(await adapter.guard.detectBlock(cf), 'captcha')
})

test('判墙：验证码 / 频控文案', async () => {
  const adapter = createIndeedAdapter()
  const captcha = browserLikePage('<html><body><div class="captcha">请完成安全验证</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(captcha), 'captcha')

  const rate = browserLikePage('<html><body><div>访问过于频繁，请稍后再试</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(rate), 'rate-limited')

  const wiped = browserLikePage('<html><body><div> </div></body></html>')
  assert.equal(await adapter.guard.detectBlock(wiped), 'blank')
})

test('判墙：正常结果页不判墙（有卡片）', async () => {
  const adapter = createIndeedAdapter()
  const normal = browserLikePage(SYNTHETIC_LIST)
  assert.equal(await adapter.guard.detectBlock(normal), null)
})

// ── 解析（合成样本：按 Indeed JCS 公开描述的稳定结构构造，验证解析代码路径） ──

const SYNTHETIC_LIST = `<html><body>
  <nav aria-label="分页">
    <a data-testid="pagination-page-next" href="/jobs?q=Java&l=北京&start=15">下一页</a>
  </nav>
  <div id="job_1">
    <a class="jcs-JobTitle" href="/rc/clk?jk=AbCdEf123&amp;fccid=xyz">Java 后端工程师</a>
    <div data-testid="company-name">某科技</div>
    <div data-testid="text-location">北京</div>
    <div data-testid="attribute_snippet_testid">15k-30k 元/月</div>
    <div data-testid="jobListingDate">2 天前</div>
  </div>
  <div id="job_2">
    <a class="jcs-JobTitle" href="https://www.indeed.com/viewjob?jk=ZzYyXx987">高级前端</a>
    <div data-testid="company-name">某互联网</div>
    <div data-testid="text-location">上海</div>
    <div data-testid="attribute_snippet_testid">30万/年</div>
    <div data-testid="jobListingDate">4 天前</div>
  </div>
  <div class="job_seen_beacon">
    <a class="jcs-JobTitle" href="/viewjob?jk=NoNameCo999">没有公司的岗位（应留空）</a>
  </div>
</body></html>`

test('解析（合成样本）：jcs-JobTitle 锚点、jk= 平台 id、公司/地点/薪资/日期', async () => {
  const adapter = createIndeedAdapter()
  const page = browserLikePage(SYNTHETIC_LIST)

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 3)

  const first = jobs[0]
  assert.ok(first !== undefined)
  assert.equal(first?.platformJobId, 'AbCdEf123')
  assert.equal(first?.title, 'Java 后端工程师')
  assert.equal(first?.company, '某科技')
  assert.equal(first?.city, '北京')
  assert.ok((first?.salaryRaw ?? '').includes('15k-30k'), `薪资锚定失败：${String(first?.salaryRaw)}`)
  assert.ok((first?.publishedAt ?? '').includes('2 天前'), '日期进 publishedAt（原样保留，不做天数换算）')
  assert.ok(
    first?.sourceUrl.startsWith('https://cn.indeed.com/viewjob?jk=AbCdEf123'),
    '有 jk 就用规范 viewjob 地址，而不是 /rc/clk 点击追踪链接',
  )

  const second = jobs[1]
  assert.ok(second !== undefined)
  assert.equal(second?.platformJobId, 'ZzYyXx987')
  assert.equal(second?.company, '某互联网')
  assert.equal(second?.city, '上海')
  assert.ok((second?.sourceUrl ?? '').includes('viewjob?jk=ZzYyXx987'))

  const third = jobs[2]
  assert.ok(third !== undefined)
  assert.equal(third?.company, '', '公司锚点不命中就留空，交给字段断言隔离 —— 不编')
  assert.ok((third?.notes ?? []).some((note) => note.includes('公司未锚定')), '缺失要记进 notes')
})

test('翻页（合成样本）：下一页可用为 true；aria-disabled 后为 false；缺分页区为 false', async () => {
  const adapter = createIndeedAdapter()
  assert.equal(await adapter.crawl.hasNextPage(browserLikePage(SYNTHETIC_LIST)), true)

  const disabled = browserLikePage(
    '<html><body><nav aria-label="分页"><a data-testid="pagination-page-next" aria-disabled="true">下一页</a></nav></body></html>',
  )
  assert.equal(await adapter.crawl.hasNextPage(disabled), false)

  const absent = browserLikePage('<html><body><div>没有分页区</div></body></html>')
  assert.equal(await adapter.crawl.hasNextPage(absent), false)
})

test('护栏本身有效：引用闭包的函数重建后必然 ReferenceError', () => {
  const moduleScoped = 42
  const leaky = (): number => moduleScoped
  assert.throws(() => asSerialized(leaky)(), ReferenceError)
})

test('适配器声明符合平台事实：antiBot=high、免登录可搜、fieldCompleteness=low、无动作', () => {
  const adapter = createIndeedAdapter()
  assert.equal(adapter.id, 'indeed')
  assert.equal(adapter.displayName, 'Indeed')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.antiBot, 'high', 'Cloudflare 风控站，界面要如实展示')
  assert.equal(adapter.capabilities.fieldCompleteness, 'low', '无可信中国大陆夹具，锚点未校准，不夸大')
  assert.equal(adapter.capabilities.supportsGreeting, false)
  assert.equal(adapter.actions, undefined)
  assert.equal(adapter.maxPages, 5)
  assert.equal(adapter.auth, undefined)
})