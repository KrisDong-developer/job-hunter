/**
 * 神仙外企（waiqi.com）适配器的离线测试。
 *
 * 夹具来源：`POST {WAIQI_API_BASE}/social-position/foreign/page-list` 的**真实响应**
 * （2026-09 实测，24 条，见 `test/fixtures/waiqi-position-payload.json`），
 * 外加一份与真页面同形的外壳 HTML；详情侧同款一对（2026-09-21 实测，
 * `test/fixtures/waiqi-detail-payload.json`，Cognex 岗）。两条一起用才说明问题：
 *
 *   * 载荷保证**解析**与真接口同形；
 *   * 外壳保证**判墙 / 等待 / 卡片计数**在真实 DOM 上成立。
 *
 * 这里**绝不访问真实招聘站**（§14）。
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createWaiqiAdapter } from '../../src/host/platform/adapters/waiqi-job/index.js'
import {
  DEFAULT_WAIQI_CONFIG,
  mergeWaiqiConfig,
  WAIQI_MAX_PAGES,
  WAIQI_MAX_PAGE_SIZE,
  type WaiqiConfig,
} from '../../src/host/platform/adapters/waiqi-job/config.js'
import { buildWaiqiRequestBody } from '../../src/host/platform/adapters/waiqi-job/urls.js'
import { JsdomPage, type PageFetchStub } from '../support/jsdom-page.js'
import { PlatformBlockedError, type PageLike } from '../../src/host/platform/types.js'

// 夹具目录：源码路径是 `test/fixtures`；`scripts/test.mjs` 会把整个 `fixtures/`
// 复制到产物目录（`.test-build/fixtures`），两种布局都要认。
const FIXTURES_SRC = join(import.meta.dirname, '..', 'fixtures')
const FIXTURES_BUILT = join(import.meta.dirname, 'fixtures')
const FIXTURE_HTML = readFileSync(
  existsSync(join(FIXTURES_SRC, 'waiqi-position-sz.html'))
    ? join(FIXTURES_SRC, 'waiqi-position-sz.html')
    : join(FIXTURES_BUILT, 'waiqi-position-sz.html'),
  'utf8',
)
const FIXTURE_PAYLOAD = JSON.parse(
  readFileSync(
    existsSync(join(FIXTURES_SRC, 'waiqi-position-payload.json'))
      ? join(FIXTURES_SRC, 'waiqi-position-payload.json')
      : join(FIXTURES_BUILT, 'waiqi-position-payload.json'),
    'utf8',
  ),
) as unknown
/** 详情接口的真实响应（2026-09-21 匿名抓取，岗位 257761 = Cognex 高级光学设计工程师）。 */
const DETAIL_PAYLOAD = JSON.parse(
  readFileSync(
    existsSync(join(FIXTURES_SRC, 'waiqi-detail-payload.json'))
      ? join(FIXTURES_SRC, 'waiqi-detail-payload.json')
      : join(FIXTURES_BUILT, 'waiqi-detail-payload.json'),
    'utf8',
  ),
) as unknown
const SEARCH_URL = 'https://www.waiqi.com/position?keyword=Java'
const DETAIL_URL = 'https://www.waiqi.com/position/detail?id=257761&posType=1'

/** 一个"接口正常"的 fetch 桩。 */
const okStub: PageFetchStub = () =>
  Promise.resolve({ json: () => Promise.resolve(FIXTURE_PAYLOAD), status: 200 })

/** 详情接口的"正常"fetch 桩（真实响应夹具，岗位 257761）。 */
const okDetailStub: PageFetchStub = () =>
  Promise.resolve({ json: () => Promise.resolve(DETAIL_PAYLOAD), status: 200 })

/** 一个返回指定 code 的 stub。 */
function errorStub(code: number, message: string): PageFetchStub {
  return () => Promise.resolve({ json: () => Promise.resolve({ code, message, data: null }), status: 200 })
}

function page(options: { html?: string; fetchStub?: PageFetchStub } = {}): JsdomPage {
  return new JsdomPage({
    html: options.html ?? FIXTURE_HTML,
    url: SEARCH_URL,
    ...(options.fetchStub === undefined ? {} : { fetchStub: options.fetchStub }),
  })
}

// ── 1. URL 与请求体：客户端能构造出平台认的请求 ─────────────────────────

test('筛选条件不在 URL 里：URL 只承载页面自己的 keyword / posType', () => {
  const adapter = createWaiqiAdapter()
  assert.equal(adapter.criteria.buildSearchUrl({}), 'https://www.waiqi.com/position')
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java' }),
    'https://www.waiqi.com/position?keyword=Java',
  )
  // type=2 是平台默认值，**不写进 URL**（写了会改变"什么都没配"时的语义）。
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', platform: { type: '2' } }),
    'https://www.waiqi.com/position?keyword=Java',
  )
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', platform: { type: '1' } }),
    'https://www.waiqi.com/position?keyword=Java&posType=1',
  )
})

test('未知城市返回 null —— 不猜城市 id（猜错会静默搜到别处 / 0 条）', () => {
  const adapter = createWaiqiAdapter()
  assert.equal(adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '不存在的城市' }), null)
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '深圳' }),
    'https://www.waiqi.com/position?keyword=Java',
  )
})

test('多城市：逗号分隔，一次请求按多个城市过滤；任一城市未配则拒绝', () => {
  const adapter = createWaiqiAdapter()
  const body = buildWaiqiRequestBody({ city: '深圳,广州' }, DEFAULT_WAIQI_CONFIG.cityCodes, 1)
  assert.equal(body['cityIds'], '248,247')
  // 中文顿号 / 去空白 / 去重也都要认
  assert.equal(
    buildWaiqiRequestBody({ city: '深圳，广州、深圳 ' }, DEFAULT_WAIQI_CONFIG.cityCodes, 1)['cityIds'],
    '248,247',
  )
  // URL 层面：全配则放行，任一城市没配 → null（不猜）
  assert.equal(adapter.criteria.buildSearchUrl({ city: '深圳,广州' }), 'https://www.waiqi.com/position')
  assert.equal(adapter.criteria.buildSearchUrl({ city: '深圳,不存在的城市' }), null)
})

test('请求体：关键词的键是 name（实测 keyword/positionName 都无效）', () => {
  const body = buildWaiqiRequestBody({ keyword: 'Java', city: '深圳' }, DEFAULT_WAIQI_CONFIG.cityCodes, 1)
  assert.equal(body['name'], 'Java')
  assert.equal(body['cityIds'], '248') // 深圳 = 248（实测）
  assert.equal(body['page'], 1)
  assert.equal(body['size'], WAIQI_MAX_PAGE_SIZE)
  assert.equal(body['type'], 2) // 平台默认：只看外企
  assert.equal(body['needAd'], 1)
  // 实测无效的键**一个都不能出现**：出现了会被服务端忽略，用户以为筛了其实没筛。
  for (const dead of ['keyword', 'positionName', 'searchKey', 'cityName', 'city', 'foreignCompanyTag']) {
    assert.equal(body[dead], undefined, `${dead} 不应出现在请求体里`)
  }
})

test('请求体：平台特有维度（经验 / 学历 / 职位范围 / 行业 / 职能 / 排序）能传下去', () => {
  const body = buildWaiqiRequestBody(
    {
      platform: { workExp: '3', education: '2', type: '1', businessCategory: '26', posInfo: '323' },
      sort: '1',
    },
    DEFAULT_WAIQI_CONFIG.cityCodes,
    2,
  )
  assert.equal(body['workExp'], '3')
  assert.equal(body['education'], '2')
  assert.equal(body['type'], 1)
  assert.equal(body['posIds'], '323') // 职能（算法工程师）
  assert.equal(body['businessCategoryIdList'], '26') // 行业（IT/互联网/游戏，2026-09-21 探针实测）
  assert.equal(body['sort'], 1)
  assert.equal(body['page'], 2)
})

test('请求体：公司类型（companyTypeList）是**数组**、可多选 —— 2026-09-21 探针实测', () => {
  const adapter = createWaiqiAdapter()
  const dimension = adapter.criteriaDimensions.find((item) => item.key === 'companyType')
  assert.ok(dimension !== undefined, '公司类型维度必须声明 —— 站点请求体里一直有这个参数')
  assert.equal(dimension?.multi, true, '平台这个参数是数组（可多选），界面按多选渲染')
  assert.ok(
    (dimension?.values.length ?? 0) >= 45,
    `实测 45 项标签，实际 ${String(dimension?.values.length)} 项`,
  )

  const body = buildWaiqiRequestBody(
    { platform: { companyType: '28,31' } },
    DEFAULT_WAIQI_CONFIG.cityCodes,
    1,
  )
  assert.deepEqual(body['companyTypeList'], [28, 31], '多选 → number[]（平台要数组，不是字符串）')

  // 不配时保持站点初始请求里的空数组："没配"与"配了"在请求指纹上分得开。
  const empty = buildWaiqiRequestBody({}, DEFAULT_WAIQI_CONFIG.cityCodes, 1)
  assert.deepEqual(empty['companyTypeList'], [])
})

test('DB 覆盖能合并到默认配置上（ADR-19：配置以 DB 为权威）', () => {
  const merged = mergeWaiqiConfig({
    fields: { title: 'positionName' },
    cityCodes: { 测试城: 999 },
    posInfoList: [{ id: 1, name: '新职能' }],
    businessCategoryList: [{ id: 2, name: '新行业' }],
  })
  assert.equal(merged.fields.title, 'positionName')
  assert.equal(merged.fields.company, DEFAULT_WAIQI_CONFIG.fields.company)
  assert.equal(merged.cityCodes['测试城'], 999)
  assert.equal(merged.cityCodes['深圳'], 248)
  assert.deepEqual(merged.posInfoList, [{ id: 1, name: '新职能' }])
  assert.deepEqual(merged.businessCategoryList, [{ id: 2, name: '新行业' }])
  assert.deepEqual(mergeWaiqiConfig(null), DEFAULT_WAIQI_CONFIG)
})

test('合并边界拦下脏条目：seed 表逐条校验、城市码归一（zhipin 同款纪律）', () => {
  const merged = mergeWaiqiConfig({
    // id 非数值 / name 空 / 非对象条目 —— 一律丢弃，好条目保留
    posInfoList: [{ id: 1, name: '好职能' }, { id: 'x', name: '坏id' }, { id: 2 }, null, 'junk'],
    // 字符串数值 id 归一成 number；空白 name 丢弃
    businessCategoryList: [{ id: '33', name: '字符串id也认' }, { id: 5, name: '   ' }],
    // 城市码：字符串数值归一；非数值丢弃（这个平台对错参数是**静默忽略**，脏码会变成"抓了全国"）
    cityCodes: { 测试城: 999, 坏城: 'abc', 深圳: '248', '': 100 },
  })
  assert.deepEqual(merged.posInfoList, [{ id: 1, name: '好职能' }])
  assert.deepEqual(merged.businessCategoryList, [{ id: 33, name: '字符串id也认' }])
  assert.equal(merged.cityCodes['测试城'], 999)
  assert.equal(merged.cityCodes['坏城'], undefined, '非数值城市码必须被丢弃')
  assert.equal(merged.cityCodes['深圳'], 248, '字符串数值城市码应归一保留')
})

// ── 2. 解析：离线夹具逐字段对得上 ─────────────────────────────────────

test('离线夹具：解析出 24 条岗位，关键字段逐项对得上', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, { keyword: 'Java', city: '深圳' })
  const jobs = await adapter.crawl.readListPage(target)

  assert.equal(jobs.length, 24)

  const first = jobs[0]
  assert.ok(first)
  assert.equal(first.platformJobId, '256050')
  assert.equal(first.title, '前台主管')
  assert.equal(first.salaryRaw, '4-5K')
  assert.equal(first.company, 'MAR 万豪国际集团')
  assert.equal(first.sourceUrl, 'https://www.waiqi.com/position/detail?id=256050&posType=1')
  assert.equal(first.city, '厦门市')
  assert.equal(first.expReq, '不限经验')
  assert.equal(first.eduReq, '大专')
  assert.equal(first.industry, '生活服务业')
  assert.equal(first.companySize, '10000人以上')
  assert.equal(first.companyNature, '外企')
  assert.equal(first.publishedAt, '2026-09-18')
  assert.ok(first.tags?.includes('女性友好'))
  assert.ok(first.tags?.includes('外企·美企'), '外企国别是这家平台最有信息量的标签')
  assert.ok(first.tags?.includes('职能·人事/行政'), '岗位职能分类应缀进标签（posCategoryName）')

  // `districtName` 为空但 `address` 有真实办公地点时，用 address 兜底落进 district。
  const withAddr = jobs.find((job) => job.platformJobId === '139584')
  assert.ok(withAddr, '夹具里应有带 address 的岗位')
  assert.ok(withAddr?.district?.includes('龙岗区'), 'districtName 为空时应用 address 兜底')

  // 每条都必须能拼出详情地址（source_url 是核心字段）
  assert.ok(jobs.every((job) => job.platformJobId !== '' && job.sourceUrl !== ''))
})

test('薪资：面议不给空串（空串会被字段级断言整批拦下）', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  const jobs = await adapter.crawl.readListPage(target)

  // `salary_raw` 是核心字段：这个平台大量岗位薪资为 null，必须落到"面议"可读值。
  assert.ok(jobs.every((job) => job.salaryRaw !== ''), '不允许出现空薪资')
  const negotiable = jobs.filter((job) => job.salaryRaw === '面议')
  assert.ok(negotiable.length > 0, '夹具里应当有面议岗位')
  assert.ok(
    negotiable.every((job) => job.notes?.includes('salary:absent')),
    '薪资缺失要留下可读 note，不能静默',
  )

  // 年发薪月数 > 12 时按平台展示规则挂 `*N薪`（KX POWER 那条 coefficient=13）
  const months13 = jobs.find((job) => job.platformJobId === '210801')
  assert.ok(months13)
  assert.equal(months13.salaryRaw, '10-20K*13薪')
})

test('英文职位名兜底 + 投递方式落进 tags/notes', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  const jobs = await adapter.crawl.readListPage(target)

  // 夹具里的第一条是「中文名 + 英文名」都有；这里断言"值取到了英文名"的那条路径。
  const withEn = jobs.find((job) => job.platformJobId === '256050')
  assert.ok(withEn?.notes?.includes('source:3'))

  // informationSource（后台渠道 / ATS 名，如 successfactors / workday / 各企业官网招聘）
  // 实测常驻，应落进 notes 供下游判断"投递走哪套渠道"。
  const withAts = jobs.find((job) => job.notes?.some((note) => note.startsWith('ats:')))
  assert.ok(withAts, 'informationSource（ATS 名）应落进 notes')
})

// ── 3. 失败必须显式：绝不静默返回空数组 ───────────────────────────────

test('响应形状变了（records 不是数组）→ 解析 0 条，但**不抛错**（主链记 NO_RECORDS）', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({
    fetchStub: () => Promise.resolve({ json: () => Promise.resolve({ code: 1000, data: {} }), status: 200 }),
  })
  await adapter.crawl.gotoSearch(target, {})
  assert.deepEqual(await adapter.crawl.readListPage(target), [])
})

test('接口报错 → 抛错（主链记 PARSE_FAILED），不返回空数组', async () => {
  const adapter = createWaiqiAdapter()
  for (const [code, message] of [
    [1010, 'size最大为50'],
    [999, '系统数据异常'],
  ] as const) {
    const target = page({ fetchStub: errorStub(code, message) })
    await adapter.crawl.gotoSearch(target, {})
    await assert.rejects(
      () => adapter.crawl.readListPage(target),
      (error: unknown) => {
        const text = error instanceof Error ? error.message : String(error)
        return text.includes(String(code)) && text.includes(message)
      },
    )
  }
})

test('页面上下文的 fetch 抛错（跨域 / 断网）→ 抛错，而不是"今天没有新岗位"', async () => {
  const adapter = createWaiqiAdapter()
  // 故意不给 stub：夹具会装一个"必然 reject 的 fetch"，等价于真实环境里的请求失败。
  const target = page()
  await adapter.crawl.gotoSearch(target, {})
  await assert.rejects(() => adapter.crawl.readListPage(target), /列表接口未返回可用数据/)
})

test('城市码未配置 → 拒绝，而不是静默抓全国', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: okStub })
  await assert.rejects(
    () => adapter.crawl.gotoSearch(target, { city: '不存在的城市' }),
    /城市 id 未配置/,
  )
})

// ── 4. 判墙 ────────────────────────────────────────────────────────────

test('正常页面不算撞墙', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  assert.equal(await adapter.guard.detectBlock(target), null)
})

test('滑块 / 登录墙 / 空白页 / 限流能被区分出来', async () => {
  const adapter = createWaiqiAdapter()
  const cases: Array<[string, string]> = [
    ['captcha', '<html><body><div class="geetest_panel">请完成验证</div></body></html>'],
    ['rate-limited', '<html><body><div>访问过于频繁，请稍后再试</div></body></html>'],
    ['blank', '<html><body></body></html>'],
  ]
  for (const [expected, html] of cases) {
    const target = page({ html, fetchStub: errorStub(999, '系统数据异常') })
    await adapter.crawl.gotoSearch(target, {})
    assert.equal(await adapter.guard.detectBlock(target), expected, html)
  }
})

test('接口 code=1022 → 判为需要登录（下一次判墙时生效）', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: errorStub(1022, '请先登录') })
  await adapter.crawl.gotoSearch(target, {})
  // 第一次判墙发生在 readListPage 之前：还没有接口应答，只看页面信号。
  assert.equal(await adapter.guard.detectBlock(target), null)
  await assert.rejects(() => adapter.crawl.readListPage(target), /1022/)
  // 记下了接口应答之后，判墙就能认出登录墙。
  assert.equal(await adapter.guard.detectBlock(target), 'login-required')
})

test('接口 code=429 → 判为限流（停手退避，不硬重试）', async () => {
  const adapter = createWaiqiAdapter()
  const target = page({ fetchStub: errorStub(429, '访问行为异常，请稍后再试') })
  await adapter.crawl.gotoSearch(target, {})
  // 第一次判墙发生在 readListPage 之前：还没有接口应答，只看页面信号。
  assert.equal(await adapter.guard.detectBlock(target), null)
  await assert.rejects(() => adapter.crawl.readListPage(target), /429/)
  // 记下接口应答之后，判墙就能认出平台的频控墙 —— 与 1022 走同一套「记下再判」契约。
  assert.equal(await adapter.guard.detectBlock(target), 'rate-limited')
})

test('登录检测：先等 SPA 挂载（卡片）再判，夹具无头像 → false，等待超时也不抛错', async () => {
  const adapter = createWaiqiAdapter()
  assert.ok(adapter.auth, 'auth 槽位应已声明')
  // 夹具里有卡片（应用挂载完成的信号）但没有 .head-avatar → 未登录。
  const target = page({ fetchStub: okStub })
  assert.equal(await adapter.auth?.isLoggedIn(target), false)
  // 卡片都没渲染出来（等待落空）也要按原样判，不能抛错 —— 判不出时保守算未登录。
  const blank = page({ html: '<html><body></body></html>', fetchStub: errorStub(999, '系统数据异常') })
  assert.equal(await adapter.auth?.isLoggedIn(blank), false)
})

// ── 5. 能力声明与实际行为一致 ─────────────────────────────────────────

test('声明的能力：只承诺验证过的维度，且页数上限是 1', () => {
  const adapter = createWaiqiAdapter()
  assert.equal(adapter.id, 'waiqi')
  assert.equal(adapter.maxPages, WAIQI_MAX_PAGES)
  assert.equal(adapter.maxPages, 1)
  const keys = adapter.criteriaDimensions.map((dimension) => dimension.key)
  // 实测生效的维度都在；没验证过的一律不声明。
  for (const key of ['keyword', 'city', 'workExp', 'education', 'businessCategory', 'posInfo', 'type', 'maxPages']) {
    assert.ok(keys.includes(key), `缺少维度 ${key}`)
  }
  // `companyType` 原来是"没验证过"所以不声明；2026-09-21 探针实测到站点请求体里
  // 恒定带 `companyTypeList`（45 项标签）→ 已按实测补上（见下面的专项用例）。
  // `sort` 站点请求体里也有，但它的**取值域**还没探测出来（页面交互待跑）—— 先不声明。
  for (const dead of ['sort', 'postedWithinDays']) {
    assert.ok(!keys.includes(dead), `${dead} 没有验证过，不该声明`)
  }
  // 行业 / 职能维度必须给出来自 config seed 的取值域（否则界面会渲染成自由文本）。
  const business = adapter.criteriaDimensions.find((dimension) => dimension.key === 'businessCategory')
  assert.ok(business && business.values.length > 0, '行业维度应有 seed 取值域')
  // ⚠️ 2026-09-21 探针实测纠正：行业字典里 26=IT/互联网/游戏、33=**不限**。
  // 旧 seed 抄的是**职能**的 id 空间（33=IT技术），两套码混用 → "选行业"发出去的是职能码。
  assert.ok(
    business?.values.some((option) => option.value === '26' && option.label === 'IT/互联网/游戏'),
    `行业 seed 应含 26=IT/互联网/游戏：${business?.values.slice(0, 5).map((o) => `${o.value}=${o.label}`).join(' ')}`,
  )
  assert.equal(
    business?.values.some((option) => option.value === '33'),
    false,
    '"不限"不列进取值域 —— 不选就是不限（与界面上的空值同一件事）',
  )
  assert.ok(
    (business?.values.length ?? 0) >= 29,
    `行业应当是实测全量（30 项去掉"不限"=29），实际 ${String(business?.values.length)} 项`,
  )
  const posInfo = adapter.criteriaDimensions.find((dimension) => dimension.key === 'posInfo')
  assert.ok(posInfo && posInfo.values.length > 0, '职能维度应有 seed 取值域')
  assert.ok(posInfo?.values.some((option) => option.value === '323'), '职能 seed 应含 算法工程师(323)')
  // 城市维度必须给出取值域（否则界面会渲染成自由文本，用户会填出查不到的城市）
  const city = adapter.criteriaDimensions.find((dimension) => dimension.key === 'city')
  assert.ok(city && city.values.length > 0)
  assert.ok(city.values.some((option) => option.value === '深圳'))
  // 2026-09-21 修正：没有实现 readInbox、也没有平台证据 → 不承认有收件箱（能力矩阵对用户说实话）。
  assert.equal(adapter.capabilities.supportsInbox, false)
  // detail 已落地（JD 走 details 接口）；关掉开关后槽位必须消失（实现度如实派生）。
  assert.ok(adapter.detail, 'detail 槽位应已声明（detailApiEnabled 默认开）')
  const disabled = createWaiqiAdapter({
    config: { ...DEFAULT_WAIQI_CONFIG, detailApiEnabled: false },
  })
  assert.equal(disabled.detail, undefined, 'detailApiEnabled=false 时不应声明 detail')
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
function browserLikePage(html: string, fetchStub: PageFetchStub, url: string = SEARCH_URL): PageLike {
  const inner = new JsdomPage({ html, url, fetchStub })
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

test('页面函数必须自包含：按源码重建后仍能取数、解析与判墙', async () => {
  const adapter = createWaiqiAdapter()
  const target = browserLikePage(FIXTURE_HTML, okStub)

  // readListPage / detectBlock / hasNextPage / isLoggedIn 都会走 page.evaluate，
  // 任何一个引用了模块作用域的变量，这里都会炸。
  await adapter.crawl.gotoSearch(target, { keyword: 'Java' })
  const jobs = await adapter.crawl.readListPage(target)
  assert.equal(jobs.length, 24)
  assert.equal(jobs[0]?.title, '前台主管')
  assert.equal(jobs[0]?.sourceUrl, 'https://www.waiqi.com/position/detail?id=256050&posType=1')

  assert.equal(await adapter.guard.detectBlock(target), null)
  assert.equal(typeof (await adapter.crawl.hasNextPage(target)), 'boolean')
  assert.equal(typeof (await adapter.auth?.isLoggedIn(target)), 'boolean')

  // 详情那一对页面函数（fetchDetailInPage / extractDetailInPage）同样必须自包含。
  const detailTarget = browserLikePage(FIXTURE_HTML, okDetailStub, DETAIL_URL)
  const detail = await adapter.detail?.extract(detailTarget)
  assert.equal(detail?.platformJobId, '257761')
  assert.ok(detail?.jdText?.includes('【平台中文翻译】'))
})

test('撞墙判定在「按源码重建」后同样成立', async () => {
  const adapter = createWaiqiAdapter()
  const target = browserLikePage(
    '<html><body><div class="geetest_panel">请完成验证</div></body></html>',
    errorStub(999, '系统数据异常'),
  )
  await adapter.crawl.gotoSearch(target, {})
  assert.equal(await adapter.guard.detectBlock(target), 'captcha')
})

// ── 7. 配置坏掉时的表现（静默失败要留痕） ──────────────────────────────

test('字段映射被改坏时：卡片仍在，但一条字段都解析不出来', async () => {
  const broken: WaiqiConfig = {
    ...DEFAULT_WAIQI_CONFIG,
    fields: {
      ...DEFAULT_WAIQI_CONFIG.fields,
      // 平台改版、字段改名，而配置没跟着改 —— 这正是 DB 覆盖存在的理由。
      title: 'nopeTitle',
      company: 'nopeCompany',
      salaryMin: 'nopeSalaryMin',
      salaryMax: 'nopeSalaryMax',
      city: 'nopeCity',
      publishedAt: 'nopeTime',
      id: 'nopeId',
    },
  }
  const adapter = createWaiqiAdapter({ config: broken })
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})
  const jobs = await adapter.crawl.readListPage(target)

  // ⚠️ 关键：**一条都不返回**（而不是返回 24 条空记录）。
  // id 拿不到 → 无法 upsert、也拼不出 source_url，这种记录进库只会污染数据。
  // 主链会因此把本轮记成 `NO_RECORDS`（partial），让"抓不到"变成可见状态。
  assert.equal(jobs.length, 0)
})

test('卡片选择器被改坏时：判墙仍然工作（解析不依赖 DOM）', async () => {
  const broken: WaiqiConfig = {
    ...DEFAULT_WAIQI_CONFIG,
    selectors: { ...DEFAULT_WAIQI_CONFIG.selectors, card: '.nope-card' },
  }
  const adapter = createWaiqiAdapter({ config: broken })
  const target = page({ fetchStub: okStub })
  await adapter.crawl.gotoSearch(target, {})

  // 解析走接口，所以选择器坏掉**不影响取数** —— 这正是这个适配器的设计取舍。
  const jobs = await adapter.crawl.readListPage(target)
  assert.equal(jobs.length, 24)
})

// ── 8. 详情补抓（2026-09-21：JD 走 details 接口，不解析详情页 DOM）──────

/** 一个停留在详情页 URL 上的夹具页面（主链 fetchNewJobDetails 会先 goto(sourceUrl)）。 */
function detailPage(fetchStub: PageFetchStub): JsdomPage {
  return new JsdomPage({ html: FIXTURE_HTML, url: DETAIL_URL, fetchStub })
}

test('详情：从 URL 取 id、请求形态带 source:24、逐字段对得上', async () => {
  const adapter = createWaiqiAdapter()
  assert.ok(adapter.detail, 'detail 槽位应已声明')
  const target = detailPage(okDetailStub)
  const detail = await adapter.detail.extract(target)

  // id 以**当前页 URL** 为准（与列表侧 upsert 的 platformJobId 同键）
  assert.equal(detail.platformJobId, '257761')
  assert.equal(detail.title, '高级光学设计工程师')
  assert.equal(detail.company, 'Cognex 康耐视')
  // negotiable=1 且薪资为 null → 面议兜底（与列表同一条展示规则）
  assert.equal(detail.salaryRaw, '面议')
  assert.ok(detail.notes?.includes('salary:absent'))
  assert.equal(detail.city, '深圳市')
  assert.equal(detail.expReq, '5-10年')
  assert.equal(detail.eduReq, '本科')
  assert.equal(detail.industry, '智能硬件')
  assert.equal(detail.companySize, '10000人以上')
  assert.equal(detail.companyNature, '外企')
  assert.equal(detail.publishedAt, '2026-09-20')
  // 福利（welfareList）进 tags
  assert.ok(detail.tags?.includes('带薪年假'))
  assert.ok(detail.tags?.includes('五险一金'))
  // 投递渠道线索（workday ATS + 官网外投）落 notes —— 与列表同款口径
  assert.ok(detail.notes?.includes('ats:workday'))
  assert.ok(detail.notes?.includes('apply:external-site'))
  assert.equal(detail.sourceUrl, DETAIL_URL)

  // 请求形态：GET {apiBase}/social-position/details?id=…，带 source:24（缺它服务端走另一套分支）
  const request = target.requests[0]
  assert.ok(request, '应发出一次详情请求')
  assert.equal(request.url, 'https://backservice.offerxiansheng.com/api/position-service/social-position/details?id=257761')
  assert.equal(request.init?.method, 'GET')
  const headers = request.init?.headers as Record<string, string> | undefined
  assert.equal(headers?.['source'], '24')
})

test('详情 JD：原文（常为英文）+ 平台中文翻译拼接，译文兜底时留痕', async () => {
  const adapter = createWaiqiAdapter()
  const base = DETAIL_PAYLOAD as { data: Record<string, unknown> }

  // 真实夹具：原文与译文都在 → 拼接（下游按中文关键词打分，纯英文 JD 会系统性漏配）
  const both = detailPage(okDetailStub)
  const withBoth = await adapter.detail?.extract(both)
  assert.ok(withBoth?.jdText?.includes('Senior Optical Design Engineer'))
  assert.ok(withBoth?.jdText?.includes('【平台中文翻译】'))
  assert.ok(withBoth?.jdText?.includes('光学设计软件'))

  // 原文缺失、译文在 → 用译文兜底并记 note
  const translateOnly = detailPage(() =>
    Promise.resolve({
      json: () => Promise.resolve({ ...base, data: { ...base.data, description: null } }),
      status: 200,
    }),
  )
  const withTranslate = await adapter.detail?.extract(translateOnly)
  assert.ok(withTranslate?.jdText?.includes('光学设计软件'))
  assert.ok(!withTranslate?.jdText?.includes('Senior Optical'))
  assert.ok(withTranslate?.notes?.includes('jd:from-translate'))

  // 两者都缺 → jdText 空 + note（主链按"没解析出 JD"记日志，不谎报）
  const neither = detailPage(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve({ ...base, data: { ...base.data, description: null, translateDescription: null } }),
      status: 200,
    }),
  )
  const withNone = await adapter.detail?.extract(neither)
  assert.equal(withNone?.jdText ?? '', '')
  assert.ok(withNone?.notes?.includes('jd:absent'))
})

test('详情接口 code=1022 / 429 → 抛 PlatformBlockedError（主链按风控停手，不记成单条失败）', async () => {
  const adapter = createWaiqiAdapter()
  const detail = adapter.detail
  assert.ok(detail)
  for (const [code, message, kind] of [
    [1022, '请先登录', 'login-required'],
    [429, '访问行为异常，请稍后再试', 'rate-limited'],
  ] as const) {
    const target = detailPage(errorStub(code, message))
    await assert.rejects(
      () => detail.extract(target),
      (error: unknown) => error instanceof PlatformBlockedError && error.kind === kind,
    )
  }
})

test('详情接口报错 → 抛错（记解析失败），URL 没有 id → 拒绝', async () => {
  const adapter = createWaiqiAdapter()
  const detail = adapter.detail
  assert.ok(detail)
  const target = detailPage(errorStub(1010, '参数错误'))
  await assert.rejects(() => detail.extract(target), /详情接口未返回可用数据/)
  // 当前页不是详情页形态（主链 goto 失败 / URL 被改写）→ 明确报错，不猜
  const noId = page({ fetchStub: okDetailStub })
  await assert.rejects(() => detail.extract(noId), /没有岗位 id/)
})
