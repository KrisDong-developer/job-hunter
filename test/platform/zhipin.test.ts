import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildZhipinSearchUrl,
  createZhipinAdapter,
  DEFAULT_ZHIPIN_CONFIG,
} from '../../src/host/platform/adapters/zhipin.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.zhipin.com/web/geek/job?query=Java&city=101280600'
const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'zhipin-search.html')
/** 登录态夹具（`npm run probe:zhipin-login` 采集）：薪资可见 + 滚动加载后的多屏列表。 */
const LOGGED_FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'zhipin-search-logged-in.html',
)
const SCROLL_FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'fixtures',
  'zhipin-search-logged-in-scroll.html',
)

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

test('搜索 URL：query + city（BossHunter 同款形态）', () => {
  assert.equal(
    buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, { keyword: 'Java', city: '深圳' }),
    'https://www.zhipin.com/web/geek/job?query=Java&city=101280600',
  )
  assert.ok(
    (buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, { keyword: 'Java' }) ?? '').includes('city=') === false,
  )
  // 城市码未知 → null（不猜）
  assert.equal(buildZhipinSearchUrl(DEFAULT_ZHIPIN_CONFIG, { keyword: 'Java', city: '火星' }), null)
})

test('适配器声明符合平台事实：未登录可搜、薪资隐藏（medium）、antiBot=high', () => {
  const adapter = createZhipinAdapter()
  assert.equal(adapter.id, 'zhipin')
  assert.equal(adapter.displayName, 'BOSS直聘')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium')
  assert.equal(adapter.capabilities.antiBot, 'high')
  assert.equal(adapter.maxPages, 1, '无可寻址的第 N 页（&page=2 实测无效）—— 深度走 scrollRounds')
  assert.ok(
    !adapter.requiredFields.includes('salary_raw' as never),
    '未登录薪资隐藏，salary_raw 不得进必需字段（否则全部被隔离）',
  )
  // 2026-09-18：打招呼/收件箱/附件投递已按 BossHunter 求职者端生产选择器实现（见 zhipin-actions.test.ts）
  assert.ok(adapter.actions !== undefined, 'zhipin 是第一个实现 actions 的适配器')
  assert.equal(adapter.capabilities.supportsGreeting, true)
  assert.equal(adapter.capabilities.supportsInbox, true)
  assert.equal(adapter.capabilities.supportsAttachment, true)
  assert.ok(adapter.detail !== undefined, '详情选择器有 BossHunter 验证证据，应声明')
})

test('scrollRounds 维度：声明平台自报的 300 条上限（= 20 轮 × 15 条）', () => {
  const adapter = createZhipinAdapter()
  const dimension = adapter.criteriaDimensions.find((item) => item.key === 'scrollRounds')
  assert.ok(dimension !== undefined, '滚动加载是 BOSS 唯一的翻页手段，必须声明为维度')
  assert.equal(dimension.max, 20, '上限来自 joblist.json 的 totalCount=300 / 15')
  assert.ok(dimension.values.length === 0, '自由数值输入，不是取值域')
  assert.ok(dimension.hint.includes('滚动加载'), '提示要说清"只能滚动加载"这个平台事实')
})

test('滚动加载：静态夹具上不挂死，返回当前卡片数即收手', async (t) => {
  if (!existsSync(SCROLL_FIXTURE_PATH)) {
    t.skip(`夹具不存在（${SCROLL_FIXTURE_PATH}）—— 先跑一次 npm run probe:zhipin-login`)
    return
  }
  const adapter = createZhipinAdapter({
    // 离线夹具永远等不到"新卡片"，把超时压到几十毫秒，否则每个用例白等十几秒
    config: { ...DEFAULT_ZHIPIN_CONFIG, scrollStepTimeoutMs: 50 },
  })
  const page = browserLikePage(readFileSync(SCROLL_FIXTURE_PATH, 'utf8'))
  const before = await adapter.crawl.readListPage(page)
  // rounds=3 → 内部滚动 2 次；夹具是静态 DOM，两次都超时收手
  await adapter.crawl.gotoSearch(page, {
    keyword: 'Java',
    city: '深圳',
    platform: { scrollRounds: '3' },
  })
  const after = await adapter.crawl.readListPage(page)
  assert.equal(after.length, before.length, '静态夹具不会长出卡片，读到的条数必须不变')
  assert.ok(after.length > 0, 'gotoSearch 不能把已有的列表弄没')
})

test('详情页解析：标题/薪资/经验学历/公司/规模行业/JD（BossHunter JS_EXTRACT_DETAIL 对齐）', async () => {
  const adapter = createZhipinAdapter()
  const html = `
  <html><head><title>Java工程师_某某科技有限公司招聘</title></head><body>
    <div class="job-detail">
      <div class="info-primary">
        <div class="name"><h1>Java工程师</h1></div>
        <span class="salary">20-35K</span>
        <ul class="tag-list"><span>3-5年</span><span>本科</span></ul>
      </div>
      <div class="job-sec-text">负责后端服务的设计与开发，熟悉 Spring Boot 与 MySQL。</div>
    </div>
    <div class="sider-company">
      <div class="company-info"><a href="/gongsi/xxx.html">某某科技有限公司</a></div>
      <div class="res-industry-item">互联网</div>
      <div class="res-industry-item">500-999人</div>
    </div>
  </body></html>`
  const page = browserLikePage(html, 'https://www.zhipin.com/job_detail/abc123.html?securityId=xyz')

  const detail = await adapter.detail?.extract(page)

  assert.equal(detail?.title, 'Java工程师')
  assert.equal(detail?.salaryRaw, '20-35K')
  assert.equal(detail?.expReq, '3-5年', 'tag-list 顺序固定：先经验')
  assert.equal(detail?.eduReq, '本科', 'tag-list 顺序固定：后学历')
  assert.equal(detail?.company, '某某科技有限公司', '公司名取 sider-company 的第一个非链接文本')
  assert.equal(detail?.industry, '互联网')
  assert.equal(detail?.companySize, '500-999人', '含「人」的标签是规模')
  assert.equal(detail?.jdText, '负责后端服务的设计与开发，熟悉 Spring Boot 与 MySQL。')
})

test('判墙：BOSS 滑块页 URL → captcha；频控/配额文案', async () => {
  const adapter = createZhipinAdapter()
  const slider = browserLikePage(
    '<html><body>滑块验证</body></html>',
    'https://www.zhipin.com/web/user/safe/verify-slider?seed=xyz',
  )
  assert.equal(await adapter.guard.detectBlock(slider), 'captcha')

  const rateLimited = browserLikePage('<html><body><div>您访问过于频繁，请稍后再试</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(rateLimited), 'rate-limited')

  const quota = browserLikePage('<html><body><div>今日沟通次数过多，休息一下明天再来</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(quota), 'quota-exhausted')
})

test('真实夹具解析（probe:zhipin 保存后启用）：未登录视图的字段形态', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:zhipin`)
    return
  }
  const adapter = createZhipinAdapter()
  const page = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))

  const block = await adapter.guard.detectBlock(page)
  assert.equal(block, null, `夹具不该被判墙（实际：${String(block)}）`)

  const jobs = await adapter.crawl.readListPage(page)
  assert.ok(jobs.length >= 10, `夹具应解析出 ≥10 条（实测 15），实际 ${String(jobs.length)}`)

  for (const job of jobs) {
    assert.ok(job.title.length > 0)
    assert.ok(job.sourceUrl.startsWith('https://www.zhipin.com/job_detail/'), `详情链接形态：${job.sourceUrl}`)
    assert.ok(job.platformJobId.length > 0, '加密 id 必须抠出（幂等键）')
    // 未登录事实：薪资隐藏、boss-name 是公司名
    assert.ok(job.company.length > 0, 'boss-name 必须解析为公司名')
  }
  const first = jobs[0]
  assert.ok((first?.notes ?? []).some((note) => note.includes('薪资隐藏')), '薪资缺失要记 notes 说明原因')

  const hit = (pick: (job: (typeof jobs)[number]) => unknown): number =>
    jobs.filter((job) => pick(job) !== undefined && pick(job) !== '').length
  console.log(
    `[zhipin-fixture] ${String(jobs.length)} 张卡片 · ` +
      `city ${String(hit((j) => j.city))} · district ${String(hit((j) => j.district))} · ` +
      `exp ${String(hit((j) => j.expReq))} · edu ${String(hit((j) => j.eduReq))} · ` +
      `salary ${String(hit((j) => j.salaryRaw))}（未登录隐藏属预期）`,
  )

  // 未登录无分页区 → hasNextPage 恒 false
  assert.equal(await adapter.crawl.hasNextPage(page), false)
})

test('登录态夹具：薪资可见、滚动加载后一页装 100+ 条', async (t) => {
  if (!existsSync(LOGGED_FIXTURE_PATH)) {
    t.skip(`夹具不存在（${LOGGED_FIXTURE_PATH}）—— 先跑一次 npm run probe:zhipin-login`)
    return
  }
  const adapter = createZhipinAdapter()
  const page = browserLikePage(readFileSync(LOGGED_FIXTURE_PATH, 'utf8'))

  const block = await adapter.guard.detectBlock(page)
  assert.equal(block, null, `夹具不该被判墙（实际：${String(block)}）`)

  const jobs = await adapter.crawl.readListPage(page)
  assert.ok(jobs.length >= 10, `第一屏应解析出 ≥10 条（实测 15），实际 ${String(jobs.length)}`)

  // 登录态与未登录态的分界就在这里：薪资**有文本**（未登录时元素在、文本空）
  const withSalary = jobs.filter((job) => job.salaryRaw !== '')
  assert.ok(
    withSalary.length >= Math.ceil(jobs.length * 0.9),
    `登录后薪资应基本可见（实测 15/15），实际 ${String(withSalary.length)}/${String(jobs.length)}`,
  )
  assert.ok(
    !(jobs[0]?.notes ?? []).some((note) => note.includes('薪资隐藏')),
    '薪资拿得到时不该再记"薪资隐藏"这条说明',
  )

  // 滚动加载后的夹具：一页装下多屏（实测 105 条），且 id 不重复（幂等键的唯一性前提）
  if (existsSync(SCROLL_FIXTURE_PATH)) {
    const scrolled = browserLikePage(readFileSync(SCROLL_FIXTURE_PATH, 'utf8'))
    const many = await adapter.crawl.readListPage(scrolled)
    assert.ok(many.length >= 100, `滚动后应解析出 ≥100 条（实测 105），实际 ${String(many.length)}`)
    const ids = new Set(many.map((job) => job.platformJobId))
    assert.equal(ids.size, many.length, '同一页内岗位 id 不该重复')
    const salaryRatio =
      many.filter((job) => job.salaryRaw !== '').length / Math.max(1, many.length)
    assert.ok(salaryRatio >= 0.95, `滚动加载的 100+ 条里薪资可见率应 ≥95%，实际 ${salaryRatio.toFixed(2)}`)
    console.log(
      `[zhipin-logged-fixture] 第一屏 ${String(jobs.length)} 条 · 滚动后 ${String(many.length)} 条 · ` +
        `薪资可见率 ${(salaryRatio * 100).toFixed(0)}%`,
    )
  }
})
