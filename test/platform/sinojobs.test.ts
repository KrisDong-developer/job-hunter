/**
 * SinoJobs 中欧招聘（sinojobs.com.cn）适配器的离线测试。
 *
 * 夹具来源：`POST /Recruitment/indexAjaxPage.html` 的**真实响应**
 * （2026-09-18 实测，15 条，见 `test/fixtures/sinojobs-list-payload.json`），
 * 外加一份与真页面同形的外壳 HTML 与一份详情页镜像。三条一起用才说明问题：
 *
 *   * 载荷保证**解析**与真接口同形；
 *   * 外壳保证**判墙 / 等待 / 卡片计数 / 登录态**在真实 DOM 上成立；
 *   * 详情页镜像保证 **P2 详情解析**（服务端渲染静态 HTML）逐项对得上。
 *
 * 这里**绝不访问真实招聘站**（§14）。
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createSinoJobsAdapter } from '../../src/host/platform/adapters/sinojobs/index.js'
import {
  DEFAULT_SINOJOBS_CONFIG,
  mergeSinoJobsConfig,
  SINOJOBS_MAX_PAGES,
  SINOJOBS_PAGE_SIZE,
  type SinoJobsConfig,
} from '../../src/host/platform/adapters/sinojobs/config.js'
import { buildSinoJobsRequestBody } from '../../src/host/platform/adapters/sinojobs/urls.js'
import { JsdomPage, type PageFetchStub } from '../support/jsdom-page.js'
import { PlatformBlockedError, type AdapterLogger, type PageLike } from '../../src/host/platform/types.js'

// 夹具目录：源码路径是 `test/fixtures`；`scripts/test.mjs` 会把整个 `fixtures/`
// 复制到产物目录（`.test-build/fixtures`），两种布局都要认。
const FIXTURES_SRC = join(import.meta.dirname, '..', 'fixtures')
const FIXTURES_BUILT = join(import.meta.dirname, 'fixtures')
const fixtureFile = (name: string): string => {
  const src = join(FIXTURES_SRC, name)
  const built = join(FIXTURES_BUILT, name)
  const path = existsSync(src) ? src : built
  return readFileSync(path, 'utf8')
}
const FIXTURE_HTML = fixtureFile('sinojobs-list.html')
const FIXTURE_DETAIL_HTML = fixtureFile('sinojobs-detail.html')
const FIXTURE_PAYLOAD = JSON.parse(fixtureFile('sinojobs-list-payload.json')) as unknown
const SEARCH_URL = 'https://sinojobs.com.cn/Recruitment/index.html?keywords=Java'
const DETAIL_URL = 'https://sinojobs.com.cn/Recruitment/content.html?id=4319'

/** 一个"接口正常"的 fetch 桩。 */
const okStub: PageFetchStub = () =>
  Promise.resolve({ json: () => Promise.resolve(FIXTURE_PAYLOAD), status: 200 })

/** 一个返回指定 status / info 的 stub。 */
function errorStub(status: number, message: string): PageFetchStub {
  return () => Promise.resolve({ json: () => Promise.resolve({ status, info: message, data: null }), status: 200 })
}

function page(options: { html?: string; fetchStub?: PageFetchStub; url?: string } = {}): JsdomPage {
  return new JsdomPage({
    html: options.html ?? FIXTURE_HTML,
    url: options.url ?? SEARCH_URL,
    ...(options.fetchStub === undefined ? {} : { fetchStub: options.fetchStub }),
  })
}

// ── 1. URL 与请求体：客户端能构造出平台认的请求 ─────────────────────────

test('筛选条件不在 URL 里：URL 只承载页面自己的 keywords', () => {
  const adapter = createSinoJobsAdapter()
  assert.equal(adapter.criteria.buildSearchUrl({}), 'https://sinojobs.com.cn/Recruitment/index.html')
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java' }),
    'https://sinojobs.com.cn/Recruitment/index.html?keywords=Java',
  )
})

test('未知地点返回 null —— 不猜地点 id（猜错会静默搜到别处 / 0 条）', () => {
  const adapter = createSinoJobsAdapter()
  assert.equal(adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '不存在的城市' }), null)
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '上海' }),
    'https://sinojobs.com.cn/Recruitment/index.html?keywords=Java',
  )
})

test('请求体：站点 onloadPage 发的五个筛选键全在，且只传用户配过的值', () => {
  const body = buildSinoJobsRequestBody(DEFAULT_SINOJOBS_CONFIG, { keyword: 'Java', city: '上海' }, 1)
  assert.equal(body['page'], '1')
  assert.equal(body['limit'], String(SINOJOBS_PAGE_SIZE))
  assert.equal(body['keywords'], 'Java')
  assert.equal(body['address_id'], '3') // 上海 = 3（实测自平台级联接口）
  assert.equal(body['job_type'], '')
  assert.equal(body['work_nature'], '')
  assert.equal(body['salary_range'], '')
  assert.equal(body['experience'], '')
})

test('请求体：平台特有维度（行业 / 性质 / 薪资 / 经验）能传下去', () => {
  const body = buildSinoJobsRequestBody(
    DEFAULT_SINOJOBS_CONFIG,
    {
      platform: { jobType: '574', workNature: '3', salaryRange: '26', experience: '4' },
    },
    2,
  )
  assert.equal(body['page'], '2')
  assert.equal(body['job_type'], '574') // IT/互联网
  assert.equal(body['work_nature'], '3') // 实习
  assert.equal(body['salary_range'], '26') // 25K+
  assert.equal(body['experience'], '4') // 5年以上
})

test('DB 覆盖能合并到默认配置上（ADR-19：配置以 DB 为权威）', () => {
  const merged = mergeSinoJobsConfig({
    fields: { title: 'positionName' },
    addressCodes: { 测试城: '999' },
    jobTypeList: [{ id: '999', name: '新行业' }],
    pageSize: 15,
  })
  assert.equal(merged.fields.title, 'positionName')
  assert.equal(merged.fields.company, DEFAULT_SINOJOBS_CONFIG.fields.company)
  assert.equal(merged.addressCodes['测试城'], '999')
  assert.equal(merged.addressCodes['上海'], '3')
  assert.deepEqual(merged.jobTypeList, [{ id: '999', name: '新行业' }])
  assert.equal(merged.pageSize, 15)
  assert.deepEqual(mergeSinoJobsConfig(null), DEFAULT_SINOJOBS_CONFIG)
})

// ── 2. 解析：离线夹具逐字段对得上 ─────────────────────────────────────

test('离线夹具：解析出 15 条岗位，关键字段逐项对得上', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, { keyword: 'Java', city: '上海' })
  const jobs = await adapter.crawl.readListPage(target)

  assert.equal(jobs.length, 15)

  const first = jobs[0]
  assert.ok(first)
  assert.equal(first.platformJobId, '4322')
  assert.equal(first.title, '公关传播项目经理-全职/兼职')
  assert.equal(first.salaryRaw, '面议')
  assert.equal(first.company, 'KleinS Marketing & Event GmbH')
  assert.equal(first.sourceUrl, 'https://sinojobs.com.cn/Recruitment/content.html?id=4322')
  assert.equal(first.city, '国外')
  assert.equal(first.expReq, '不限')
  assert.equal(first.eduReq, '不限')
  // release_time=1788513960（Unix 秒）→ +8h → 2026-09-04（北京时区日期）
  assert.equal(first.publishedAt, '2026-09-04')

  // 有真实薪资的岗位（驻外海外销售经理：25K+，经验 5年以上，学历 本科）
  const withSalary = jobs.find((job) => job.platformJobId === '4310')
  assert.ok(withSalary)
  assert.equal(withSalary.salaryRaw, '25K+')
  assert.equal(withSalary.expReq, '5年以上')
  assert.equal(withSalary.eduReq, '本科')

  // 每条都必须能拼出详情地址（source_url 是核心字段）
  assert.ok(jobs.every((job) => job.platformJobId !== '' && job.sourceUrl !== ''))
})

test('薪资：接口给了展示值就用展示值；没给才兜底"面议"并留 note', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  const jobs = await adapter.crawl.readListPage(target)

  // `salary_raw` 是核心字段：这个平台绝大多数岗位就是"面议"，这是真实展示值不是掩码。
  assert.ok(jobs.every((job) => job.salaryRaw !== ''), '不允许出现空薪资')
  const negotiable = jobs.filter((job) => job.salaryRaw === '面议')
  assert.ok(negotiable.length > 0, '夹具里应当有面议岗位')
  // 接口带了 salary_range 的岗位，不该被记成"薪资缺失"
  assert.ok(
    negotiable.every((job) => !job.notes?.includes('salary:absent')),
    '面议是接口给的真实值，不该带 salary:absent note',
  )
  assert.equal(jobs.find((job) => job.platformJobId === '4310')?.salaryRaw, '25K+')
})

test('详情页：P2 解析逐项对得上（标题/公司/薪资/城市/经验/性质/发布时间/JD）', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({ html: FIXTURE_DETAIL_HTML, url: DETAIL_URL })
  await adapter.crawl.gotoSearch(target, {})
  const detail = await adapter.detail?.extract(target)
  assert.ok(detail)

  assert.equal(detail.platformJobId, '4319')
  assert.equal(detail.title, '软件开发工程师（嵌入式方向）')
  assert.equal(detail.company, 'Kostal (Shanghai) Management Co., Ltd')
  assert.equal(detail.salaryRaw, '面议')
  assert.equal(detail.city, '上海')
  assert.equal(detail.expReq, '不限')
  assert.equal(detail.publishedAt, '2026-09-03')
  assert.ok(detail.tags?.includes('全职'))
  assert.ok(detail.jdText?.includes('开展嵌入式软件开发工作'))
  assert.ok(detail.jdText?.includes('工程相关专业本科或硕士学历'))
  assert.equal(detail.sourceUrl, 'https://sinojobs.com.cn/Recruitment/content.html?id=4319')
})

test('详情页锚点腐烂：标题回退 document.title；公司不误取正文小节标题；缺口全部以 notes 留痕', async () => {
  const adapter = createSinoJobsAdapter()
  // 概要区（.Resume-info1）整块缺失 —— 平台改版后的真实风险形态。
  const html =
    '<html><head><title>某岗位标题-全职/兼职 - SinoJobs</title></head><body>' +
    '<div class="Resume-info2"><h6>职位描述</h6><p>做点事。</p><h6>公司信息</h6><p>某公司介绍。</p></div>' +
    '</body></html>'
  const target = page({ html, url: DETAIL_URL })
  await adapter.crawl.gotoSearch(target, {})
  const detail = await adapter.detail?.extract(target)
  assert.ok(detail)

  // 标题兜底链：h5 没了 → document.title 去站名后缀；标题内文的连字符必须保留。
  assert.equal(detail.title, '某岗位标题-全职/兼职')
  // 公司：概要区缺失 → 留空，**绝不**把正文小节标题「职位描述」当公司名。
  assert.equal(detail.company, '')
  // 正文区还在 → JD 照常解析。
  assert.ok(detail.jdText?.includes('做点事。'))
  assert.ok(detail.jdText?.includes('某公司介绍。'))
  // 缺口留痕：每个未锚定的锚点都要能被看见（而不是静默给空值）。
  const notes = detail.notes ?? []
  assert.ok(notes.includes('概要区容器未锚定（headBox 待校准）'))
  assert.ok(notes.includes('详情公司名未锚定（h6 待校准）'))
  assert.ok(notes.includes('详情薪资未锚定，待校准'))
  // 正文容器在 → 不该有 JD 侧的误报。
  assert.ok(!notes.includes('JD 容器未锚定（bodyBox 待校准）'))
  assert.ok(!notes.includes('JD 未锚定（p 待校准）'))
})

// ── 3. 失败必须显式：绝不静默返回空数组 ───────────────────────────────

test('响应形状变了（rows 不是数组）→ 解析 0 条，但**不抛错**（主链记 NO_RECORDS）', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({
    fetchStub: () => Promise.resolve({ json: () => Promise.resolve({ status: 1, data: {} }), status: 200 }),
  })
  await adapter.crawl.gotoSearch(target, {})
  assert.deepEqual(await adapter.crawl.readListPage(target), [])
})

test('接口报错（status != 1）→ 抛错（主链记 PARSE_FAILED），不返回空数组', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({ fetchStub: errorStub(0, '系统繁忙，请稍后再试') })
  await adapter.crawl.gotoSearch(target, {})
  await assert.rejects(
    () => adapter.crawl.readListPage(target),
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      return text.includes('status=0') && text.includes('系统繁忙')
    },
  )
})

test('HTTP 错误页（非 JSON，429）→ 状态码抬进判读，按风控抛 PlatformBlockedError（不降级成 PARSE_FAILED）', async () => {
  const adapter = createSinoJobsAdapter()
  // 真实形态：限流时接口回的是 HTML 拦截页 —— response.json() 会抛 SyntaxError，
  // body 里没有任何可读的 status/info。此前这条路只能报"网络请求失败（SyntaxError）"。
  const target = page({
    fetchStub: () =>
      Promise.resolve({
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
        status: 429,
      }),
  })
  await adapter.crawl.gotoSearch(target, {})
  await assert.rejects(
    () => adapter.crawl.readListPage(target),
    (error: unknown) => error instanceof PlatformBlockedError && error.kind === 'rate-limited',
  )
})

test('HTTP 错误页（非 JSON，403 无风控文案）→ 仍抛错并带上 HTTP 状态码，不返回空数组', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({
    fetchStub: () =>
      Promise.resolve({ json: () => Promise.reject(new SyntaxError('Unexpected token <')), status: 403 }),
  })
  await adapter.crawl.gotoSearch(target, {})
  await assert.rejects(
    () => adapter.crawl.readListPage(target),
    (error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      return text.includes('status=403') && text.includes('HTTP 403')
    },
  )
})

test('页面上下文的 fetch 抛错（跨域 / 断网）→ 抛错，而不是"今天没有新岗位"', async () => {
  const adapter = createSinoJobsAdapter()
  // 故意不给 stub：夹具会装一个"必然 reject 的 fetch"，等价于真实环境里的请求失败。
  const target = page()
  await adapter.crawl.gotoSearch(target, {})
  await assert.rejects(() => adapter.crawl.readListPage(target), /列表接口未返回可用数据/)
})

test('地点码未配置 → 拒绝，而不是静默抓全国', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({ fetchStub: okStub })
  await assert.rejects(
    () => adapter.crawl.gotoSearch(target, { city: '不存在的城市' }),
    /地点 id 未配置/,
  )
})

// ── 4. 判墙 ────────────────────────────────────────────────────────────

test('正常页面不算撞墙', async () => {
  const adapter = createSinoJobsAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  assert.equal(await adapter.guard.detectBlock(target), null)
})

test('滑块 / 限流 / 登录弹窗 / 空白页能被区分出来', async () => {
  const adapter = createSinoJobsAdapter()
  const cases: Array<[string, string]> = [
    ['captcha', '<html><body><div class="geetest_panel">请完成验证</div></body></html>'],
    ['rate-limited', '<html><body><div>访问过于频繁，请稍后再试</div></body></html>'],
    ['login-required', '<html><body><div class="xcConfirm"><p>请先登录</p></div></body></html>'],
    ['blank', '<html><body></body></html>'],
  ]
  for (const [expected, html] of cases) {
    const target = page({ html, fetchStub: errorStub(0, '系统繁忙') })
    await adapter.crawl.gotoSearch(target, {})
    assert.equal(await adapter.guard.detectBlock(target), expected, html)
  }
})

test('登录态：只看 a.sign-out 这一个结构性信号（搜索匿名，登录不影响采集）', async () => {
  const adapter = createSinoJobsAdapter()
  // 未登录：顶部导航有登录链接
  const loggedOut = page()
  await adapter.crawl.gotoSearch(loggedOut, {})
  assert.equal(await adapter.auth?.isLoggedIn(loggedOut), false)
  // 已登录：登录链接被替换
  const loggedIn = page({ html: '<html><body><nav><div class="container"><a class="fl" href="/UserCenter/index.html">张三</a></div></nav></body></html>' })
  await adapter.crawl.gotoSearch(loggedIn, {})
  assert.equal(await adapter.auth?.isLoggedIn(loggedIn), true)
})

// ── 5. 能力声明与实际行为一致 ─────────────────────────────────────────

test('声明的能力：只承诺验证过的维度', () => {
  const adapter = createSinoJobsAdapter()
  assert.equal(adapter.id, 'sinojobs')
  assert.equal(adapter.displayName, 'SinoJobs 中欧招聘')
  assert.equal(adapter.maxPages, SINOJOBS_MAX_PAGES)
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  const keys = adapter.criteriaDimensions.map((dimension) => dimension.key)
  // 实测生效的维度都在；没验证过的一律不声明。
  for (const key of ['keyword', 'city', 'salaryRange', 'experience', 'workNature', 'jobType', 'maxPages']) {
    assert.ok(keys.includes(key), `缺少维度 ${key}`)
  }
  for (const dead of ['sort', 'postedWithinDays']) {
    assert.ok(!keys.includes(dead), `${dead} 没有验证过，不该声明`)
  }
  // 地点 / 行业维度必须给出取值域（否则界面会渲染成自由文本，用户会填出查不到的取值）。
  const city = adapter.criteriaDimensions.find((dimension) => dimension.key === 'city')
  assert.ok(city && city.values.length > 0)
  assert.ok(city.values.some((option) => option.value === '上海'))
  const jobType = adapter.criteriaDimensions.find((dimension) => dimension.key === 'jobType')
  assert.ok(jobType && jobType.values.length > 0)
  assert.ok(jobType.values.some((option) => option.value === '574'), '行业 seed 应含 IT/互联网(574)')
})

test('hasNextPage：以接口 total 为真判据（page × pageSize < total 才翻页）', async () => {
  const adapter = createSinoJobsAdapter()
  // 夹具 total=78，pageSize=20：第 1 页后应还有下一页，第 4 页后（80 ≥ 78）没有了。
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  await adapter.crawl.readListPage(target)
  assert.equal(await adapter.crawl.hasNextPage(target), true)

  const target4 = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target4, { page: 4 })
  await adapter.crawl.readListPage(target4)
  assert.equal(await adapter.crawl.hasNextPage(target4), false)
})

// ── 6. 真路径的回归护栏 ───────────────────────────────────────────────

/**
 * 像浏览器那样**只拿函数源码**重建：闭包一律不存在。
 *
 * 这是离线环境里唯一能复现「真路径 ReferenceError」的手段（51job 真的踩过，
 * 见 `docs/ADAPTERS.md` §2）。
 */
function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

/** 一个 evaluate 时会重建函数的页面（模拟 Playwright 的序列化）。 */
function browserLikePage(options: { html: string; url: string; fetchStub?: PageFetchStub }): PageLike {
  const inner = new JsdomPage({
    html: options.html,
    url: options.url,
    ...(options.fetchStub === undefined ? {} : { fetchStub: options.fetchStub }),
  })
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
  assert.throws(() => asSerialized(leaky)(), ReferenceError)
})

test('页面函数必须自包含：按源码重建后仍能取数、解析、判墙与登录判断', async () => {
  const adapter = createSinoJobsAdapter()
  const target = browserLikePage({ html: FIXTURE_HTML, url: SEARCH_URL, fetchStub: okStub })

  // readListPage / detectBlock / hasNextPage / isLoggedIn 都会走 page.evaluate，
  // 任何一个引用了模块作用域的变量，这里都会炸。
  await adapter.crawl.gotoSearch(target, { keyword: 'Java' })
  const jobs = await adapter.crawl.readListPage(target)
  assert.equal(jobs.length, 15)
  assert.equal(jobs[0]?.title, '公关传播项目经理-全职/兼职')
  assert.equal(jobs[0]?.sourceUrl, 'https://sinojobs.com.cn/Recruitment/content.html?id=4322')

  assert.equal(await adapter.guard.detectBlock(target), null)
  assert.equal(typeof (await adapter.crawl.hasNextPage(target)), 'boolean')
  assert.equal(typeof (await adapter.auth?.isLoggedIn(target)), 'boolean')
})

test('详情解析在「按源码重建」后同样成立', async () => {
  const adapter = createSinoJobsAdapter()
  const target = browserLikePage({ html: FIXTURE_DETAIL_HTML, url: DETAIL_URL })
  await adapter.crawl.gotoSearch(target, {})
  const detail = await adapter.detail?.extract(target)
  assert.ok(detail)
  assert.equal(detail.title, '软件开发工程师（嵌入式方向）')
  assert.equal(detail.jdText?.includes('任职要求') ?? false, false, 'JD 正文不该混入小节标题之外的杂讯')
  assert.ok(detail.jdText?.includes('工程相关专业本科或硕士学历'))
})

// ── 7. 配置坏掉时的表现（静默失败要留痕） ──────────────────────────────

test('字段映射被改坏时：接口成功但一条字段都解析不出来 → 返回 0 条（主链记 NO_RECORDS）', async () => {
  const broken: SinoJobsConfig = {
    ...DEFAULT_SINOJOBS_CONFIG,
    fields: {
      ...DEFAULT_SINOJOBS_CONFIG.fields,
      // 平台改版、字段改名，而配置没跟着改 —— 这正是 DB 覆盖存在的理由。
      id: 'nopeId',
      title: 'nopeTitle',
      company: 'nopeCompany',
      salaryRange: 'nopeSalary',
    },
  }
  const adapter = createSinoJobsAdapter({ config: broken })
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  const jobs = await adapter.crawl.readListPage(target)

  // ⚠️ 关键：**一条都不返回**（而不是返回 15 条空记录）。
  // id 拿不到 → 无法 upsert、也拼不出 source_url，这种记录进库只会污染数据。
  assert.equal(jobs.length, 0)
})

test('卡片选择器被改坏时：判墙仍然工作（解析不依赖 DOM）', async () => {
  const broken: SinoJobsConfig = {
    ...DEFAULT_SINOJOBS_CONFIG,
    selectors: { ...DEFAULT_SINOJOBS_CONFIG.selectors, card: '.nope-card' },
  }
  const adapter = createSinoJobsAdapter({ config: broken })
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})

  // 解析走接口，所以选择器坏掉**不影响取数** —— 这正是这个适配器的设计取舍。
  const jobs = await adapter.crawl.readListPage(target)
  assert.equal(jobs.length, 15)
  // 但判墙的 blank 判定会因卡片数为 0 而更敏感 —— 这里用正常页面验证不算撞墙。
  assert.equal(await adapter.guard.detectBlock(target), null)
})

test('形状漂移留痕：接口成功且 total>0 但解析 0 条 → logger.warn（这种坏法不报警，日志是唯一出口）', async () => {
  const warnings: string[] = []
  const infos: string[] = []
  const logger: AdapterLogger = {
    info: (message) => infos.push(message),
    warn: (message) => warnings.push(message),
  }
  const adapter = createSinoJobsAdapter({ logger })
  // 平台自报 total=78，但 rows 没了（层级改名 / 字段漂移的真实形态）。
  const target = page({
    fetchStub: () =>
      Promise.resolve({
        json: () => Promise.resolve({ status: 1, info: '数据获取成功', data: { total: '78' } }),
        status: 200,
      }),
  })
  await adapter.crawl.gotoSearch(target, {})
  assert.deepEqual(await adapter.crawl.readListPage(target), [])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0] ?? '', /total=78/)

  // 正常路径不打扰 logger：同样的适配器解析正常载荷，一条 warn 都不该有。
  const healthy = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(healthy, {})
  const jobs = await adapter.crawl.readListPage(healthy)
  assert.equal(jobs.length, 15)
  assert.equal(warnings.length, 1)
  assert.deepEqual(infos, [])
})
