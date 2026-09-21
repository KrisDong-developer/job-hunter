import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createIndeedAdapter } from '../../src/host/platform/adapters/indeed/index.js'
import { DEFAULT_INDEED_CONFIG, mergeIndeedConfig } from '../../src/host/platform/adapters/indeed/config.js'
import { buildIndeedSearchUrl } from '../../src/host/platform/adapters/indeed/urls.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://cn.indeed.com/jobs?q=Java&l=北京&start=0'
const FIXTURES = join(process.cwd(), 'test/fixtures')

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

/** 真实夹具（2026-09-21 广州市搜索页，probe:indeed-login 未登录侧快照钉成）。 */
const REAL_SEARCH_URL =
  'https://cn.indeed.com/jobs?q=&l=%E5%B9%BF%E5%B7%9E%E5%B8%82&from=searchOnHP%2Cwhereautocomplete&vjk=6544fa41aeb898dc'

/** 登录态用例的正文填充：isLoggedInInPage 有「正文 ≥500 字」的残页门槛，填充必须过线。 */
const PAYLOAD_PAGE_FILLER = '<p>岗位卡片占位文本，用于把正文撑过 500 字的残页判定门槛。</p>'.repeat(20)

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
  assert.equal(page2, `https://cn.indeed.com/jobs?q=Java&l=${encodeURIComponent('北京')}&start=10`)
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

// ── 判墙（实测信号：跨域（www 站 302 / secure 登录墙）→ blank；Cloudflare 墙 → captcha） ──

test('判墙：被 302 重定向到别的域（cn → www.indeed.com）→ blank', async () => {
  const adapter = createIndeedAdapter()
  // 页面 URL 已是别的域，hostname 与配置 host 不一致 → 判 blank（站点把我们挪走了）
  const redirected = browserLikePage('<html><body><p>下一份工作，由此启程</p></body></html>', 'https://www.indeed.com/jobs?q=Java')
  assert.equal(await adapter.guard.detectBlock(redirected), 'blank')
})

test('判墙（2026-09-21 实测形态）：被送到 secure.indeed.com 登录墙 → blank', async () => {
  const adapter = createIndeedAdapter()
  const loginWall = browserLikePage(
    '<html><body><h1>登录</h1><p>登录以继续您的操作</p></body></html>',
    'https://secure.indeed.com/auth?hl=zh_CN&co=CN&continue=https%3A%2F%2Fcn.indeed.com%2Fjobs',
  )
  assert.equal(await adapter.guard.detectBlock(loginWall), 'blank')
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
  <nav aria-label="pagination">
    <a data-testid="pagination-page-next" href="/jobs?q=Java&l=北京&start=10">下一页</a>
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
    '<html><body><nav aria-label="pagination"><a data-testid="pagination-page-next" aria-disabled="true">下一页</a></nav></body></html>',
  )
  assert.equal(await adapter.crawl.hasNextPage(disabled), false)

  const absent = browserLikePage('<html><body><div>没有分页区</div></body></html>')
  assert.equal(await adapter.crawl.hasNextPage(absent), false)
})

test('翻页（真实形态回归）：页头 gnav 的 nav 排在前面也不能抓错分页容器', async () => {
  // 2026-09-21 真实页实测：页头有 <nav class="gnav" aria-label="主要国家">，分页是
  // <nav aria-label="pagination">。宽泛的 nav[aria-label] 会先抓到 gnav → hasNext 恒 false。
  const adapter = createIndeedAdapter()
  const html = `<html><body>
    <nav class="gnav" aria-label="主要国家"><a href="https://account.indeed.com/">登录</a></nav>
    <nav aria-label="pagination"><a data-testid="pagination-page-next" href="/jobs?start=10">下一页</a></nav>
  </body></html>`
  assert.equal(await adapter.crawl.hasNextPage(browserLikePage(html)), true)
})

test('护栏本身有效：引用闭包的函数重建后必然 ReferenceError', () => {
  const moduleScoped = 42
  const leaky = (): number => moduleScoped
  assert.throws(() => asSerialized(leaky)(), ReferenceError)
})

test('适配器声明符合平台事实：antiBot=high、免登录可搜、fieldCompleteness=medium、无动作', () => {
  const adapter = createIndeedAdapter()
  assert.equal(adapter.id, 'indeed')
  assert.equal(adapter.displayName, 'Indeed')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.antiBot, 'high', 'Cloudflare 风控站，界面要如实展示')
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium', '2026-09-21 真实夹具：核心字段全中，薪资/日期无源')
  assert.equal(adapter.capabilities.supportsGreeting, false)
  assert.equal(adapter.actions, undefined)
  assert.equal(adapter.maxPages, 5)
  // 薪资无源 → 不进必需字段（hiredchina/zhipin 同款取舍）
  assert.deepEqual(adapter.requiredFields, ['title', 'company', 'source_url'])
  // auth 已落地（2026-09-21 载荷 isLoggedIn 判据，两侧实测）
  assert.ok(adapter.auth !== undefined, 'auth 已落地')
  assert.equal(adapter.auth?.loginUrl, 'https://secure.indeed.com/auth?hl=zh_CN&co=CN')
  assert.equal(adapter.auth?.checkUrl, 'https://cn.indeed.com/jobs')
  // detail 已落地（2026-09-21 probe:indeed-detail 三页 3/3）
  assert.ok(adapter.detail !== undefined, 'detail.extract 已落地')
})

// ── 登录态判定（2026-09-21 probe:indeed-login 两侧实测的判据） ───────────

test('登录态：载荷 isLoggedIn=false（匿名侧/登录页形态）→ 未登录', async () => {
  const adapter = createIndeedAdapter()
  assert.ok(adapter.auth !== undefined)
  const filler = PAYLOAD_PAGE_FILLER
  const anon = browserLikePage(
    `<html><body><script>{"webVitalsEnabled":true,"isLoggedIn":false,"userAgent":{}}</script>${filler}</body></html>`,
  )
  assert.equal(await adapter.auth?.isLoggedIn(anon), false)
})

test('登录态：载荷 isLoggedIn=true（已登录侧形态）→ 已登录', async () => {
  const adapter = createIndeedAdapter()
  assert.ok(adapter.auth !== undefined)
  const filler = PAYLOAD_PAGE_FILLER
  const logged = browserLikePage(
    `<html><body><script>{"webVitalsEnabled":true,"isLoggedIn":true,"userAgent":{}}</script>${filler}</body></html>`,
  )
  assert.equal(await adapter.auth?.isLoggedIn(logged), true)
})

test('登录态（回落）：无载荷时，匿名侧登录入口链接存在 → 未登录；不存在 → 已登录；残页 → 未登录', async () => {
  const adapter = createIndeedAdapter()
  assert.ok(adapter.auth !== undefined)
  const filler = PAYLOAD_PAGE_FILLER
  const withLoginLink = browserLikePage(
    `<html><body><a href="https://account.indeed.com/">登录</a>${filler}</body></html>`,
  )
  assert.equal(await adapter.auth?.isLoggedIn(withLoginLink), false)

  const withoutLoginLink = browserLikePage(`<html><body>${filler}</body></html>`)
  assert.equal(await adapter.auth?.isLoggedIn(withoutLoginLink), true)

  const stub = browserLikePage('<html><body><div>挑战页</div></body></html>')
  assert.equal(await adapter.auth?.isLoggedIn(stub), false, '正文过短（挑战/错误页）按未登录处理')
})

// ── 真实夹具（2026-09-21 广州市搜索页，未登录侧快照） ──────────────────────

test('真实夹具：解析 16 条、jobKey/标题/公司全中、薪资无源留空、城市为广州市', async () => {
  const adapter = createIndeedAdapter()
  const page = browserLikePage(fixture('indeed-search.html'), REAL_SEARCH_URL)

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 16, '首屏 16 张标题卡（2026-09-21 实测读数）')
  assert.ok(jobs.every((job) => job.platformJobId !== ''), 'jk= jobKey 16/16 全中')
  assert.ok(jobs.every((job) => job.title !== ''), '标题 16/16')
  assert.ok(jobs.every((job) => job.company !== ''), '公司 16/16')
  assert.ok(jobs.every((job) => job.city !== undefined && job.city !== ''), '城市 16/16 非空（radius=50 可能含周边城市，不硬钉全等广州市）')
  assert.ok(jobs.every((job) => job.salaryRaw === ''), '该批页面薪资节点 0 命中（数据无源）→ 留空不编')
  assert.ok(jobs.every((job) => (job.notes ?? []).some((note) => note.includes('薪资未锚定'))), '无源要记进 notes')

  const first = jobs[0]
  assert.ok(first !== undefined)
  assert.equal(first.title, 'Specialist 专家: 繁忙季,全职,兼职及实习生')
  assert.equal(first.company, 'Apple')
  assert.ok(first.sourceUrl.startsWith('https://cn.indeed.com/viewjob?jk='), '规范 viewjob 详情地址')
})

test('真实夹具：不判墙、有下一页、未登录（载荷 isLoggedIn=false）', async () => {
  const adapter = createIndeedAdapter()
  const page = browserLikePage(fixture('indeed-search.html'), REAL_SEARCH_URL)

  assert.equal(await adapter.guard.detectBlock(page), null, '真实列表页不判墙')
  assert.equal(await adapter.crawl.hasNextPage(page), true, 'pagination-page-next 真实存在且可用（共约 1000 条）')
  assert.equal(await adapter.auth?.isLoggedIn(page), false, '未登录侧快照：载荷 isLoggedIn=false')
})

// ── 真实详情夹具（2026-09-21 Apple 岗 /viewjob?jk=cd47d8bc64e3d0e5，probe:indeed-detail #2） ──

test('真实详情夹具：标题/公司/地点/JD 全文四锚点 + 载荷 age 发布日期 + jk 幂等地址', async () => {
  const adapter = createIndeedAdapter()
  assert.ok(adapter.detail !== undefined, 'detail.extract 已落地')
  const page = browserLikePage(
    fixture('indeed-detail.html'),
    'https://cn.indeed.com/viewjob?jk=cd47d8bc64e3d0e5',
  )

  const detail = await adapter.detail?.extract(page)
  assert.ok(detail !== undefined)
  assert.equal(detail.platformJobId, 'cd47d8bc64e3d0e5', 'jk 从 URL 抠出')
  assert.equal(detail.title, 'Specialist 专家: 繁忙季,全职,兼职及实习生')
  assert.equal(detail.company, 'Apple')
  assert.equal(detail.city, '广州市')
  assert.ok((detail.jdText ?? '').includes('Apple Store'), 'JD 全文来自 #jobDescriptionText')
  assert.ok((detail.jdText ?? '').length > 500, 'JD 是全文不是截断')
  assert.equal(detail.publishedAt, '30+天前', '发布日期来自内嵌载荷 hiringInsightsModel.age（无 JSON-LD）')
  assert.equal(detail.salaryRaw, '', '详情页薪资同样无源 → 留空不编')
  assert.ok(detail.sourceUrl.startsWith('https://cn.indeed.com/viewjob?jk=cd47d8bc64e3d0e5'), '规范 viewjob 地址')
  assert.ok((detail.notes ?? []).length === 0, '四锚点 + 日期全中 → 无待校准 notes')
})