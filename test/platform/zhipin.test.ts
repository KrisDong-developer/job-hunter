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

test('详情页解析：真实结构 2026-09-18（标题/薪资/经验学历/技能标签/公司三行事实/JD）', async () => {
  const adapter = createZhipinAdapter()
  // 结构照真实登录态快照（`.probe-zhipin-capture/detail-*.html`）还原。
  // ⚠️ 刻意把**公司介绍区块放在 JD 区块之前**：真实页面里它在后面（文档顺序刚好安全），
  //    但页面上有**两个** `.job-sec-text`，顺序一变就会把公司简介当 JD —— 这条用来钉住排除逻辑。
  const html = `
  <html><head><title>Java工程师_睿服科技招聘</title></head><body>
    <div class="job-detail-section job-detail-company">
      <div class="detail-section-item company-info-box">
        <h3>公司介绍</h3>
        <div class="job-sec-text fold-text">深圳市睿服科技有限公司成立于2017年，是一家为客户提供软件技术服务的高新技术企业。</div>
      </div>
    </div>
    <div class="job-primary detail-box">
      <div class="info-primary">
        <div class="name"><h1 title="Java  多名线上1面定结果">Java  多名线上1面定结果</h1><span class="salary">14-15K</span></div>
        <p>
          <a class="text-desc text-city" href="/shenzhen/">深圳</a>
          <span class="text-desc text-experiece">3-5年</span>
          <span class="text-desc text-degree">本科</span>
        </p>
      </div>
    </div>
    <div class="job-detail-section job-detail-info">
      <div class="detail-content-header"><h3>职位描述</h3></div>
      <ul class="job-keyword-list"><li>Java</li><li>SpringCloud</li><li>MySQL</li></ul>
      <div class="job-sec-text">1、熟练掌握 SpringBoot 技术栈<br>2、熟练掌握关系型数据库、redis</div>
    </div>
    <div class="sider-company">
      <p class="title">公司基本信息</p>
      <div class="company-info">
        <a ka="job-detail-company-logo_custompage" href="/gongsi/x.html" title="睿服科技"><img src="logo.png" alt=""></a>
        <a ka="job-detail-company_custompage" href="/gongsi/x.html" title="睿服科技">睿服科技</a>
      </div>
      <p><i class="icon-stage"></i>不需要融资</p>
      <p><i class="icon-scale"></i>1000-9999人</p>
      <p><i class="icon-industry"></i><a href="/i100021/">计算机软件</a></p>
    </div>
  </body></html>`
  const page = browserLikePage(html, 'https://www.zhipin.com/job_detail/359917ab761105ae0nN_39-9EFZX.html')

  const detail = await adapter.detail?.extract(page)

  // 真实标题里是两个空格（快照原文），`clean()` 会把连续空白折成一个
  assert.equal(detail?.title, 'Java 多名线上1面定结果')
  assert.equal(detail?.salaryRaw, '14-15K')
  assert.equal(detail?.expReq, '3-5年', '经验走 .text-experiece（注意官方就是这个拼写）')
  assert.equal(detail?.eduReq, '本科', '学历走 .text-degree')
  assert.deepEqual(detail?.tags, ['Java', 'SpringCloud', 'MySQL'], '技能标签走 .job-keyword-list li')
  assert.equal(
    detail?.jdText,
    '1、熟练掌握 SpringBoot 技术栈2、熟练掌握关系型数据库、redis',
    'JD 必须是职位描述，**不能**是公司介绍（页面上有两个 .job-sec-text）',
  )
  assert.equal(detail?.company, '睿服科技', '公司名跳过 logo 链接（文本为空）取第二个')
  assert.equal(detail?.companySize, '1000-9999人', '规模走 .icon-scale 那一行')
  assert.equal(detail?.industry, '计算机软件', '行业走 .icon-industry 那一行')
  assert.equal(detail?.companyNature, '不需要融资', '融资阶段走 .icon-stage 那一行')
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

  // 登录态与未登录态的分界就在这里：薪资**有文本**（未登录时元素在、文本空）。
  // ⚠️ 但"有文本"**不等于**"薪资可用"：登录态的文本是**私有区码点**（字体混淆，见下），
  //    所以这一档只当"登录了"的信号用，真正的判据是下面那条**数据卫生**断言。
  const withText = jobs.filter((job) => (job.notes ?? []).includes('salary:obfuscated'))
  assert.ok(
    withText.length >= Math.ceil(jobs.length * 0.9),
    `登录后薪资元素应有文本（实测 15/15，且都是混淆码点），实际 ${String(withText.length)}/${String(jobs.length)}`,
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

    // ⚠️ BOSS 的薪资数字是**字体混淆**的：10 个私有区码点（U+E031–U+E03A）一码一数字，
    //    靠外部 CSS 的 `@font-face` 画成人眼看到的数字。以前这里断言"薪资文本可见率 ≥95%"
    //    —— 那是个**假绿灯**：私有区字符打到终端就是空白，`-K·薪` 也算"非空"，
    //    于是乱码被当成了"薪资可见"。现在的口径是**数据卫生**：乱码一律不许进 salaryRaw。
    const puaLeft = many.filter((job) => /[\uE000-\uF8FF]/.test(job.salaryRaw))
    const obfuscated = many.filter((job) => (job.notes ?? []).includes('salary:obfuscated'))
    assert.equal(puaLeft.length, 0, '私有区乱码绝不能留在 salaryRaw 里（下游会当成一份"读到的薪资"）')
    assert.ok(
      many.every((job) => job.salaryRaw === ''),
      '混淆字体下拿不到薪资 ⇒ 一律留空（空值会被如实当成"没读到"，乱码不会）',
    )
    assert.ok(
      obfuscated.length / Math.max(1, many.length) >= 0.95,
      `登录态夹具里应几乎全是混淆字体（实测 15/15），实际 ${String(obfuscated.length)}/${String(many.length)}`,
    )
    console.log(
      `[zhipin-logged-fixture] 第一屏 ${String(jobs.length)} 条 · 滚动后 ${String(many.length)} 条 · ` +
        `薪资：**拿不到**（${String(obfuscated.length)}/${String(many.length)} 是字体混淆，已置空并记 note）— ` +
        '明文在 `wapi/zpgeek/search/joblist.json` 的 `salaryDesc`，但该接口的 method/参数还没探明（见适配器头注释）',
    )
  }
})
