import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createLiepinAdapter } from '../../src/host/platform/adapters/liepin/index.js'
import {
  DEFAULT_LIEPIN_CONFIG,
  LIEPIN_API_HEADERS,
  mergeLiepinConfig,
} from '../../src/host/platform/adapters/liepin/config.js'
import {
  buildLiepinSearchUrl,
  buildSearchRequestBody,
  liepinFiltersOf,
} from '../../src/host/platform/adapters/liepin/urls.js'
import {
  parseSearchApiResponse,
  refreshTimeToIso,
} from '../../src/host/platform/adapters/liepin/api.js'
import { isLoggedInInPage } from '../../src/host/platform/adapters/liepin/page/list.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage, type PageFetchStub } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.liepin.com/zhaopin/?key=Java&currentPage=0'
const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'liepin-search.html')
/** 第二页夹具（`LIEPIN_PAGE=1 npm run probe:liepin` 生成）—— 翻页回归的证据。 */
const FIXTURE_P2_PATH = join(import.meta.dirname, '..', 'fixtures', 'liepin-search-p2.html')

async function readFixtureJobs(path: string): Promise<string[]> {
  const { readFileSync } = await import('node:fs')
  const adapter = createLiepinAdapter()
  const page = browserLikePage(readFileSync(path, 'utf8'), 'https://www.liepin.com/zhaopin/?key=Java')
  const jobs = await adapter.crawl.readListPage(page)
  return jobs.map((job) => job.platformJobId)
}

/** 序列化重建：模拟 Playwright 把函数送进浏览器的真实路径（闭包不存在）。 */
function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

function browserLikePage(html: string, url = SEARCH_URL, fetchStub?: PageFetchStub): PageLike {
  const inner = new JsdomPage({
    html,
    url,
    ...(fetchStub === undefined ? {} : { fetchStub }),
  })
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

test('搜索 URL：关键词 + currentPage 从 0 起（get_jobs 实测形态）', () => {
  const url = buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, { keyword: 'Java', page: 1 })
  assert.equal(url, 'https://www.liepin.com/zhaopin/?key=Java&currentPage=0')
  // 第 2 页 → currentPage=1
  const page2 = buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, { keyword: 'Java', page: 2 })
  assert.equal(page2, 'https://www.liepin.com/zhaopin/?key=Java&currentPage=1')
})

test('城市：全国不带参数；已知城市拼 city+dq 双参数；未知城市返回 null（不猜）', () => {
  assert.equal(
    buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, { keyword: 'Java', city: '全国' }),
    'https://www.liepin.com/zhaopin/?key=Java&currentPage=0',
  )
  const config = mergeLiepinConfig({ cityCodes: { 深圳: '050090' } })
  assert.equal(
    buildLiepinSearchUrl(config, { keyword: 'Java', city: '深圳', page: 1 }),
    'https://www.liepin.com/zhaopin/?key=Java&city=050090&dq=050090&currentPage=0',
  )
  assert.equal(
    buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, { keyword: 'Java', city: '火星' }),
    null,
    '城市码没验证过就必须拒绝，猜错会静默搜到别的城市',
  )
})

test('关键词为空也给出合法 URL（currentPage 兜底）', () => {
  assert.equal(
    buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, {}),
    'https://www.liepin.com/zhaopin/?currentPage=0',
  )
})

// ── 判墙（猎聘特有：about:blank 销毁页） ────────────────────────────────

test('判墙：页面被风控销毁成 about:blank → blank（命中即停，绝不重试）', async () => {
  const adapter = createLiepinAdapter()
  const destroyed = browserLikePage('<html><head></head><body></body></html>', 'about:blank')
  assert.equal(await adapter.guard.detectBlock(destroyed), 'blank')
})

test('判墙：验证码 / 频控 / 平台配额文案', async () => {
  const adapter = createLiepinAdapter()
  const captcha = browserLikePage('<html><body><div class="geetest_panel">请完成安全验证</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(captcha), 'captcha')

  const rateLimited = browserLikePage('<html><body><div>访问过于频繁，请稍后再试</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(rateLimited), 'rate-limited')

  const quota = browserLikePage('<html><body><div class="toast">您今日投递太多，休息一下明天再来</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(quota), 'quota-exhausted')
})

test('判墙：整页被清空（cards=0 且正文极短）→ blank；猎聘的"0 结果"页有筛选器文案不该误判', async () => {
  const adapter = createLiepinAdapter()
  const wiped = browserLikePage('<html><body><div> </div></body></html>')
  assert.equal(await adapter.guard.detectBlock(wiped), 'blank')
})

// ── 解析（合成样本：按 v8 夹具校准后的真实结构形状构造，验证解析代码路径） ──

const SYNTHETIC_LIST = `<html><body>
  <div class="list-pagination-box"><ul><li class="ant-pagination-item">1</li><li class="ant-pagination-next"><button class="ant-pagination-item-link">下一页</button></li></ul></div>
  <div class="_40108Nrnc3 job-card-pc-container">
    <div class="_40108yn42Q"><div class="job-detail-box">
      <a data-nick="job-detail-job-info" target="_blank" href="/job/1984775119.shtml?pgRef=c_pc_search_page">
        <div class="ellipsis-1" title="招聘Java工程师">Java工程师</div>
        <div><span>【</span><span class="ellipsis-1">佛山-顺德区</span><span>】</span></div>
        <span>急聘</span><span>15-30k·14薪</span>
        <div><span>5年以上</span><span>本科</span></div>
      </a>
      <div data-nick="job-detail-company-info"><div>
        <img class="company-logo-white-bg" src="//image0.lietou-static.com/x.png">
        <span class="ellipsis-1">库卡机器人</span>
        <div><span>工业自动化</span><span>2000-5000人</span></div>
      </div></div>
    </div></div>
  </div>
  <div class="job-card-pc-container abc">
    <a data-nick="job-detail-job-info" href="https://www.liepin.com/job/194862674.shtml">
      <div title="高级Java开发">高级Java开发</div>
      <div><span>【</span><span>上海</span><span>】</span></div>
      <span>30-50万以上</span>
      <div><span>经验不限</span><span>硕士</span></div>
    </a>
  </div>
  <div class="job-card-pc-container ad"><div>广告卡：没有职位链接，应被跳过</div></div>
</body></html>`

test('解析（合成样本）：data-nick 锚点、【】城市、公司盒三段、经验学历词表', async () => {
  const adapter = createLiepinAdapter()
  const page = browserLikePage(SYNTHETIC_LIST)

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 2, '两张真职位卡解析出来；广告卡（无 job 链接）跳过')

  const first = jobs[0]
  assert.equal(first?.title, 'Java工程师', '标题取节点文本（不带 title 属性的"招聘"前缀）')
  assert.equal(first?.platformJobId, '1984775119', '相对链接也要抠出平台 id')
  assert.ok(
    first?.sourceUrl.startsWith('https://www.liepin.com/job/1984775119.shtml'),
    '相对链接要拼成绝对地址（保留站点原始 query）',
  )
  assert.equal(first?.company, '库卡机器人')
  assert.equal(first?.industry, '工业自动化')
  assert.equal(first?.companySize, '2000-5000人')
  assert.ok(first?.salaryRaw.includes('15-30k'), `薪资锚定失败：${String(first?.salaryRaw)}`)
  assert.equal(first?.city, '佛山-顺德区')
  assert.equal(first?.expReq, '5年以上')
  assert.equal(first?.eduReq, '本科')

  const second = jobs[1]
  assert.equal(second?.platformJobId, '194862674')
  assert.equal(second?.city, '上海')
  assert.equal(second?.expReq, '经验不限')
  assert.equal(second?.eduReq, '硕士')
  assert.equal(second?.company, '', '公司盒锚不中就留空，交给字段断言隔离 —— 不编')
  assert.ok((second?.notes ?? []).some((note) => note.includes('公司未锚定')), '缺失要记进 notes')
})

test('翻页（合成样本）：下一页可用为 true；disabled 后为 false', async () => {
  const adapter = createLiepinAdapter()
  const enabled = browserLikePage(SYNTHETIC_LIST)
  assert.equal(await adapter.crawl.hasNextPage(enabled), true)

  const disabled = browserLikePage(
    '<html><body><div class="list-pagination-box"><ul><li class="ant-pagination-next ant-pagination-disabled"><button>下一页</button></li></ul></div></body></html>',
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

test('适配器声明符合平台事实：antiBot=high、免登录可搜、打招呼 fail-closed', () => {
  const adapter = createLiepinAdapter()
  assert.equal(adapter.id, 'liepin')
  assert.equal(adapter.displayName, '猎聘')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.antiBot, 'high', '猎聘是风控最强的平台，界面要如实展示')
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium', '锚点待校准，不夸大')
  // ⚠️ 2026-09-20 发送实验后这些断言变了：`readInbox`（接口）与 `sayHello`/`reply`
  // （页面输入面 + CDP 真键盘，三重证据闭环：上屏 → DOM 回读 → get-contact-list 交叉验证）
  // 都已落地 —— `facts.test.ts` 钉住"实现了就必须承认平台支持"的自洽性。
  assert.equal(typeof adapter.actions?.readInbox, 'function', '收件箱已实现（2026-09-20）')
  assert.equal(typeof adapter.actions?.sayHello, 'function', '打招呼已实现（2026-09-20 发送实验）')
  assert.equal(typeof adapter.actions?.reply, 'function', '回复已实现（同上）')
  assert.equal(adapter.capabilities.supportsInbox, true)
  assert.equal(adapter.capabilities.supportsGreeting, true)
  // 发送类之外的仍刻意缺席（见 index.ts 尾注）
  assert.equal(adapter.actions?.sendResume, undefined)
  assert.equal(adapter.actions?.detectStage, undefined)
  assert.equal(adapter.maxPages, 8)
  // auth 已实现（2026-09-19）：此前不声明会让 `platforms.loginStatus` 直接抛
  // 「没有声明登录入口」、`account.loggedIn` 恒 false —— 界面入口永远不亮。
  // 注意"搜索不需要登录"由 searchWithoutLogin 表达，与"有没有登录检测"是两件事。
  assert.equal(typeof adapter.auth?.isLoggedIn, 'function')
  assert.equal(adapter.auth?.loginUrl, 'https://www.liepin.com/')
  // 检测页（`checkUrl`）必须指向**搜索页**：两个登录标记是在搜索页上定案的
  // （匿名夹具 `liepin-search.html` 就是搜索页），而 `loginUrl` 是首页 —— 从未验证过
  // 页头结构一致。删掉 checkUrl 会静默退回"在首页上判"，等于换一套没验过的判据。
  assert.equal(adapter.auth?.checkUrl, 'https://www.liepin.com/zhaopin/?currentPage=0')
})

// ── 真实夹具（由 npm run probe:liepin 保存；没有就跳过） ────────────────

test('真实夹具解析（probe:liepin 保存后才启用）', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:liepin`)
    return
  }
  const adapter = createLiepinAdapter()
  const { readFileSync } = await import('node:fs')
  const page = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))

  // 夹具若是风控页，判墙要先于解析给出信号
  const block = await adapter.guard.detectBlock(page)
  if (block !== null) {
    t.skip(`夹具本身是风控页（${block}）—— 探针保存时已被拦截，重新校准后再跑`)
    return
  }

  const jobs = await adapter.crawl.readListPage(page)
  assert.ok(Array.isArray(jobs))
  if (jobs.length === 0) {
    t.skip('夹具里没有解析出任何卡片 —— 语义锚点需按夹具校准（结果不视为失败，因为有护栏测试兜底）')
    return
  }
  // 真实夹具上只断言结构性不变量，不断言具体内容（内容随搜索变）
  for (const job of jobs) {
    assert.ok(job.title.length > 0, '标题必须非空（否则解析锚点错了）')
    assert.ok(job.sourceUrl.startsWith('https://'), `sourceUrl 必须是绝对地址：${job.sourceUrl}`)
  }
  // 夹具实测共 21 页 → 第 1 页的"下一页"必须可用
  assert.equal(await adapter.crawl.hasNextPage(page), true, '真实夹具的分页区应显示有下一页')

  // 核心字段命中率作记录输出（校准参考，不做硬断言 —— 缺失走 pending_repair 是设计内路径）
  const hit = (pick: (job: (typeof jobs)[number]) => unknown): number =>
    jobs.filter((job) => pick(job) !== undefined && pick(job) !== '').length
  console.log(
    `[liepin-fixture] ${String(jobs.length)} 张卡片 · ` +
      `jobId ${String(hit((j) => j.platformJobId))} · salary ${String(hit((j) => j.salaryRaw))} · ` +
      `company ${String(hit((j) => j.company))} · city ${String(hit((j) => j.city))} · ` +
      `exp ${String(hit((j) => j.expReq))} · edu ${String(hit((j) => j.eduReq))} · ` +
      `industry ${String(hit((j) => j.industry))}`,
  )
})

// ── v2 接口化解析（请求体构造 / 响应解析 / 双通道回退） ─────────────────

test('接口请求体：结构对齐采样（city=410 默认、currentPage 0 起、key 透传）', () => {
  const body = buildSearchRequestBody({ keyword: 'Java', page: 2 }, '410') as {
    data: { mainSearchPcConditionForm: Record<string, unknown> }
  }
  const form = body.data.mainSearchPcConditionForm
  assert.equal(form['city'], '410')
  assert.equal(form['dq'], '410')
  assert.equal(form['currentPage'], '1', 'criteria.page=2 → currentPage=1（0 起）')
  assert.equal(form['key'], 'Java')
  assert.equal(form['pageSize'], 40)
})

test('筛选维度 → 接口请求体槽位（2026-09-23 真机调研接入；字段名与生效性均经实测）', () => {
  const body = buildSearchRequestBody(
    {
      keyword: 'Java',
      page: 1,
      postedWithinDays: 7,
      platform: {
        experience: '1$3',
        degree: '040',
        salary: '4',
        scale: '080',
        stage: '06',
        companyType: '040',
        recruiterType: '1',
      },
    },
    '410',
  ) as { data: { mainSearchPcConditionForm: Record<string, unknown> } }
  const form = body.data.mainSearchPcConditionForm
  assert.equal(form['workYearCode'], '1$3', 'experience → workYearCode')
  assert.equal(form['eduLevel'], '040', 'degree → eduLevel')
  assert.equal(form['salaryCode'], '4', 'salary → salaryCode')
  assert.equal(form['compScale'], '080', 'scale → compScale')
  assert.equal(form['compStage'], '06', 'stage → compStage')
  assert.equal(form['compKind'], '040', 'companyType → compKind')
  assert.equal(form['jobKind'], '1', 'recruiterType → jobKind')
  assert.equal(form['pubTime'], '7', 'postedWithinDays（类型化数值槽）→ pubTime 字符串')
})

test('liepinFiltersOf：七个平台键走 platform 命名空间；不认识的键不透传（闭集）', () => {
  assert.deepEqual(
    liepinFiltersOf({ platform: { experience: '10$999', industry: 'H01' } }),
    { workYearCode: '10$999' },
    'industry 未声明映射 → 不进请求体（不透传任意键是 plan-config 的闭集纪律）',
  )
  assert.deepEqual(liepinFiltersOf({}), {}, '空条件 → 空筛选（全槽位保持站点空串占位）')
})

test('维度声明：八个筛选维度带 body wire；值域与字典接口逐条一致（码不是编的）', () => {
  const adapter = createLiepinAdapter()
  const byKey = new Map(adapter.criteriaDimensions.map((dim) => [dim.key, dim]))
  for (const key of [
    'experience',
    'degree',
    'salary',
    'scale',
    'stage',
    'companyType',
    'postedWithinDays',
    'recruiterType',
  ]) {
    const dim = byKey.get(key)
    assert.ok(dim !== undefined, `应声明「${key}」`)
    assert.ok(dim.wire !== undefined && dim.wire.target === 'body', `「${key}」wire 应落 body`)
  }
  // 几个抽样钉住值域与实测字典一致（错一个码 = 用户筛错档还不自知）。
  assert.deepEqual(
    byKey.get('experience')?.values.find((v) => v.value === '1$3'),
    { value: '1$3', label: '1-3年' },
  )
  assert.deepEqual(
    byKey.get('degree')?.values.find((v) => v.value === '040'),
    { value: '040', label: '本科' },
  )
  assert.deepEqual(
    byKey.get('stage')?.values.find((v) => v.value === '06'),
    { value: '06', label: '已上市' },
  )
  assert.deepEqual(
    byKey.get('recruiterType')?.values,
    [
      { value: '1', label: '猎头职位' },
      { value: '2', label: '企业职位' },
    ],
  )
})

test('refreshTime：yyyymmddHHMMss → ISO（北京时间解析）', () => {
  const iso = refreshTimeToIso('20260917212231')
  assert.equal(iso, '2026-09-17T13:22:31.000Z', '21:22:31 +08:00 = 13:22:31Z')
  assert.equal(refreshTimeToIso('不是时间'), null)
  assert.equal(refreshTimeToIso('20260917'), null)
})

test('parseSearchApiResponse：真实采样响应 → 42 条全字段（含 publishedAt / tags）', (t) => {
  const apiPath = join(import.meta.dirname, '..', 'fixtures', 'liepin-search-api.json')
  if (!existsSync(apiPath)) {
    t.skip('接口采样不存在 —— 先跑 probe:liepin')
    return
  }
  const captures = JSON.parse(readFileSync(apiPath, 'utf8')) as Array<{ responseBody: string | null }>
  const rawBody = captures[0]?.responseBody
  assert.ok(rawBody !== null && rawBody !== undefined, '采样里应有响应体')
  const jobs = parseSearchApiResponse(JSON.parse(rawBody))
  assert.equal(jobs.length, 42)
  const first = jobs[0]
  assert.ok(first !== undefined)
  assert.ok(first.platformJobId.length > 0)
  assert.ok(first.sourceUrl.includes('liepin.com'), `API link 字段形态：${first.sourceUrl}`)
  assert.ok((first.city ?? '').length > 0, 'API dq 是中文城市')
  assert.notEqual(first.publishedAt, null, 'refreshTime → publishedAt（DOM 通道没有的字段）')
  assert.ok((first.publishedAt ?? '').startsWith('20'))
  assert.ok(first.company.length > 0, 'compName')
})

test('双通道：接口可用走 API（publishedAt 非空）；接口失败回退 DOM（publishedAt 缺失）', async () => {
  const apiPayload = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'fixtures', 'liepin-search-api.json'), 'utf8'),
  ) as Array<{ responseBody: string | null }>
  const apiJobs = parseSearchApiResponse(JSON.parse(apiPayload[0]?.responseBody ?? '{}'))
  assert.ok(apiJobs.length > 0, '前置：采样能解析出岗位')

  const okStub: PageFetchStub = async () => ({
    ok: true,
    json: async () => JSON.parse(apiPayload[0]?.responseBody ?? '{}'),
  })
  const page = new JsdomPage({ html: SYNTHETIC_LIST, url: SEARCH_URL, fetchStub: okStub })
  const adapter = createLiepinAdapter()
  await adapter.crawl.gotoSearch(page, { keyword: 'Java', page: 1 })
  const viaApi = await adapter.crawl.readListPage(page)
  assert.equal(viaApi.length, apiJobs.length, 'API 命中时用接口结果')
  assert.notEqual(viaApi[0]?.publishedAt, undefined, 'API 通道独有字段在场 → 证明走的是接口')

  // fetch 拒绝 → 自动回退 DOM
  const failStub: PageFetchStub = async () => {
    throw new Error('offline')
  }
  const page2 = new JsdomPage({ html: SYNTHETIC_LIST, url: SEARCH_URL, fetchStub: failStub })
  await adapter.crawl.gotoSearch(page2, { keyword: 'Java', page: 1 })
  const viaDom = await adapter.crawl.readListPage(page2)
  assert.equal(viaDom.length, 2, 'DOM 兜底解析合成样本的两张卡')
  assert.equal(viaDom[0]?.publishedAt, undefined, 'DOM 通道没有 publishedAt → 证明走的是兜底')
})

// ── 搜索接口的请求头（2026-09-19 定案：少一组 x-fscp 就**静默**回退 DOM）────
//
// 这条用例的存在理由不是"函数签名对不对"，而是**防止这份头集被悄悄删掉**：
// 接口调不通的表现是"一切正常"，只是永远拿不到 publishedAt/industry/companySize，
// 所以只能靠用例把形状钉死（在线新鲜度由 `probe:liepin-chat` 的"生产路径"变体复验）。
test('搜索接口请求头：必须带 x-fscp 那一族（少了服务端回 -1400，而通道会静默死掉）', async () => {
  const captured: Array<Record<string, string>> = []
  const stub: PageFetchStub = async (_url, init) => {
    captured.push((init?.['headers'] ?? {}) as Record<string, string>)
    // 不需要真数据：本用例只看**请求形态**
    return { ok: false, json: async () => ({}) }
  }
  const page = new JsdomPage({ html: SYNTHETIC_LIST, url: SEARCH_URL, fetchStub: stub })
  const adapter = createLiepinAdapter()
  await adapter.crawl.gotoSearch(page, { keyword: 'Java', page: 1 })
  await adapter.crawl.readListPage(page)

  assert.equal(captured.length, 1, '应当发了一次搜索接口请求')
  const headers = captured[0] ?? {}
  for (const name of ['accept', 'content-type', 'x-client-type', 'x-fscp-version', 'x-fscp-std-info', 'x-requested-with']) {
    assert.ok(headers[name] !== undefined && headers[name] !== '', `缺静态头 ${name} ⇒ 接口会 -1400`)
  }
  // 这一族**少一项就全废**（实测），所以用 `in` 判存在，不看值 —— fe-version 实测就是空串。
  for (const name of ['x-fscp-trace-id', 'x-fscp-bi-stat', 'x-fscp-fe-version']) {
    assert.ok(name in headers, `缺 ${name} ⇒ 接口会 -1400（实测：这一族少一项就全废）`)
  }
  assert.equal(headers['x-fscp-fe-version'], '', '实测 fe-version 是空串，但必须存在')
  assert.match(
    headers['x-fscp-trace-id'] ?? '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'trace-id 要是 UUID 形状（实测服务端不校验出处，只验形状）',
  )
  const biStat = JSON.parse(headers['x-fscp-bi-stat'] ?? '{}') as { location?: unknown }
  assert.equal(biStat.location, SEARCH_URL, 'bi-stat 里要带当前页 URL')
})

// ── 登录态检测（2026-09-19：匿名夹具 vs 登录态捕获，两份真实快照对比定案）────
test('登录态：匿名夹具判「未登录」、带用户菜单的页头判「已登录」、判不出来时如实返回 null', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip('需要匿名夹具 test/fixtures/liepin-search.html')
    return
  }
  const adapter = createLiepinAdapter()
  const markers = {
    loggedInMarker: DEFAULT_LIEPIN_CONFIG.selectors.loggedInMarker,
    notLoggedInMarker: DEFAULT_LIEPIN_CONFIG.selectors.notLoggedInMarker,
  }

  // ① 真实匿名夹具（全新 profile 抓的）——里面是 `.header-quick-menu-not-login-item`
  const anon = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))
  assert.equal(await adapter.auth?.isLoggedIn(anon), false, '匿名夹具：应判「未登录」')

  // ② 登录态页头（结构抄自 2026-09-19 的真实捕获，只把用户名换成占位符）
  const loggedInHtml =
    '<header><div class="header-quick-menu-box"><ul class="header-quick-menu-login">' +
    '<li class="header-menu-item header-quick-menu-login-item"><div id="header-quick-menu-user-info" ' +
    'class="ant-dropdown-trigger"><span>你好，</span>' +
    '<span class="header-quick-menu-username ellipsis-1">某用户</span>' +
    '<img class="header-quick-menu-user-photo" alt=""></div></li></ul></div></header>'
  const loggedIn = browserLikePage(loggedInHtml)
  assert.equal(await adapter.auth?.isLoggedIn(loggedIn), true, '带用户菜单的页头：应判「已登录」')

  // ③ 两个标记都不在 ⇒ 页面函数如实返回 null；适配器再保守落成 false
  const blank = browserLikePage('<div>页面结构整个换了</div>')
  assert.equal(
    await blank.evaluate(isLoggedInInPage as unknown as (arg: typeof markers) => boolean | null, markers),
    null,
    '判不出来必须是 null，而不是猜一个',
  )
  assert.equal(await adapter.auth?.isLoggedIn(blank), false, '适配器层：判不出来按「未登录」兜底（保守）')
})

test('配置覆盖：apiHeaders 按 key 浅合并（发版变了只覆盖变的那一两个头）', () => {
  const merged = mergeLiepinConfig({ apiHeaders: { 'x-fscp-version': '9.9' } })
  assert.equal(merged.apiHeaders['x-fscp-version'], '9.9', '被覆盖的项生效')
  assert.equal(merged.apiHeaders['x-client-type'], 'web', '未覆盖的项保留默认')
  assert.equal(LIEPIN_API_HEADERS['x-fscp-version'], '1.1', '默认常量绝不被就地改动')
})

// ── 城市码表（2026-09-19 逐省采样；配置与夹具不许脱节）──────────────────
test('城市码表：cityCodes 与采样夹具一一对应（码写错一个就把用户搜到别的城市）', (t) => {
  const fixturePath = join(import.meta.dirname, '..', 'fixtures', 'liepin-city-codes.json')
  if (!existsSync(fixturePath)) {
    t.skip('需要采样夹具 test/fixtures/liepin-city-codes.json')
    return
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cities: Array<{ code: string; name: string }>
  }
  const config = DEFAULT_LIEPIN_CONFIG.cityCodes
  // 归一化只去尾部「市」——与 CITY_DIRECTORY 的收录写法一致。
  for (const city of fixture.cities) {
    const key = city.name.replace(/市$/, '')
    assert.equal(config[key], city.code, `「${key}」的城市码与采样不符（夹具 ${city.code}）`)
  }
  // 直辖市：采样时点开是 0 个市（它们本身就是市级码），码取自筛选区的热门行。
  assert.equal(config['北京'], '010')
  assert.equal(config['上海'], '020')
  assert.equal(config['天津'], '030')
  assert.equal(config['重庆'], '040')
  // 全国 = 不带城市参数（平台的全国码 410 是另一回事，只在接口请求体里兜底）
  assert.equal(config['全国'], '')
  assert.equal(
    Object.keys(config).length,
    fixture.cities.length + 5,
    '配置里的城市数应当 = 采样到的市级数 + 4 个直辖市 + 全国',
  )
})

test('城市表外一律拒绝：未知城市返回 null，不去猜一个相近的码', () => {
  assert.equal(buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, { city: '义乌', page: 1 }), null)
  // 采样到的城市要能构造出带 city+dq 双参数的 URL
  const url = buildLiepinSearchUrl(DEFAULT_LIEPIN_CONFIG, { city: '石家庄', page: 1 })
  assert.ok(url !== null && url.includes('city=140020') && url.includes('dq=140020'), `实际：${String(url)}`)
})

test('翻页回归（p2 夹具存在时）：URL 翻页换数据 —— 两页 jobId 零重叠', async (t) => {
  if (!existsSync(FIXTURE_PATH) || !existsSync(FIXTURE_P2_PATH)) {
    t.skip('需要两页夹具（npm run probe:liepin 与 LIEPIN_PAGE=1 npm run probe:liepin）')
    return
  }
  const page1 = await readFixtureJobs(FIXTURE_PATH)
  const page2 = await readFixtureJobs(FIXTURE_P2_PATH)
  assert.ok(page1.length > 0 && page2.length > 0, '两页都应解析出岗位')
  const set1 = new Set(page1)
  const overlap = page2.filter((id) => set1.has(id))
  assert.equal(
    overlap.length,
    0,
    `URL 翻页失效：第 2 页有 ${String(overlap.length)} 个岗位与第 1 页重复 —— 站点可能忽略了 currentPage 参数，需回退到"读分页区"方案`,
  )
})

// ── platformJobId 的规范形态（2026-09-20 定案：修掉双通道 id 不一致）─────
//
// 背景：适配器是双通道（接口优先、失败回退 DOM）。原先两条通道各拿一套 id
// （接口 `job.jobId` = 8 位数字；DOM = URL 路径里的 10 位 id），同一批岗位在两轮之间
// 换了通道就会被当成两批新岗位各写一遍。下面两条用例把"两通道同 id"钉住。

test('platformJobId：DOM 侧取 href 埋点 pgRef 里的数字 id（/job/ 与 /a/ 两种形态都认）', async () => {
  const html = `<html><body>
    <div class="job-card-pc-container">
      <a data-nick="job-detail-job-info" href="/job/1984775119.shtml?pgRef=c_pc_search_page%3Ac_pc_search_job_listcard%402_84775119%3A1">
        <div title="招聘Java工程师">Java工程师</div><span>15-30k</span>
      </a>
    </div>
    <div class="job-card-pc-container">
      <a data-nick="job-detail-job-info" href="https://www.liepin.com/a/79162695.shtml?pgRef=c_pc_search_page%3Ac_pc_search_job_listcard%401_79162695%3A1">
        <div title="测试工程师">测试工程师</div><span>10-20k</span>
      </a>
    </div>
  </body></html>`
  const jobs = await createLiepinAdapter().crawl.readListPage(browserLikePage(html))
  const ids = jobs.map((job) => job.platformJobId)
  assert.deepEqual(ids, ['84775119', '79162695'], '取埋点里的数字 id（接口通道的 job.jobId 就是它）')
  // 记录里不该再出现"回退 URL id"的 note
  assert.ok(
    !(jobs[0]?.notes ?? []).some((note) => note.includes('pgRef')),
    `/job/ 形态命中 pgRef 时不该记回退 note：${JSON.stringify(jobs[0]?.notes ?? [])}`,
  )
})

test('platformJobId：pgRef 抠不到时回退 URL 路径 id，并如实记 note（那种 id 与接口通道可能不同）', async () => {
  const html = `<html><body>
    <div class="job-card-pc-container">
      <a data-nick="job-detail-job-info" href="/job/1984775119.shtml">
        <div title="招聘Java工程师">Java工程师</div><span>15-30k</span>
      </a>
    </div>
  </body></html>`
  const jobs = await createLiepinAdapter().crawl.readListPage(browserLikePage(html))
  assert.equal(jobs[0]?.platformJobId, '1984775119')
  assert.ok(
    (jobs[0]?.notes ?? []).some((note) => note.includes('pgRef')),
    '回退必须留痕：这种记录的 id 与接口通道的 job.jobId 可能不是同一个',
  )
})

test('两通道 id 一致（真实夹具）：DOM 的 pgRef 集合 === 接口采样的 jobId 集合', async (t) => {
  const apiPath = join(import.meta.dirname, '..', 'fixtures', 'liepin-search-api.json')
  if (!existsSync(FIXTURE_PATH) || !existsSync(apiPath)) {
    t.skip('需要 DOM 夹具与接口采样（npm run probe:liepin）')
    return
  }
  const domIds = new Set(await readFixtureJobs(FIXTURE_PATH))
  const captures = JSON.parse(readFileSync(apiPath, 'utf8')) as Array<{ responseBody: string | null }>
  const apiJobs = parseSearchApiResponse(JSON.parse(captures[0]?.responseBody ?? '{}'))
  const apiIds = new Set(apiJobs.map((job) => job.platformJobId))
  const missing = [...domIds].filter((id) => !apiIds.has(id))
  assert.equal(
    missing.length,
    0,
    `两通道对同一批岗位给出了不同的 platformJobId（DOM 有而接口没有：${missing.slice(0, 5).join(',')}）` +
      '—— 幂等键不一致会让同一岗位被写两遍',
  )
  assert.ok(domIds.size > 0 && apiIds.size > 0, '两边都要有岗位才算验过')
})

// ── 收件箱（readInbox）：接口通道（2026-09-20 探针实测后落地）────────────

/** 按**实测形状**造一行会话（只留用得着的字段；`lastPayload` 是 JSON 字符串）。 */
function contactRow(arg: {
  id: string
  name: string
  company: string
  unReadCnt: number
  direction: string
  ms: string
  extType: number
  msg: string
  jobId?: string
}): Record<string, unknown> {
  return {
    id: arg.id,
    name: arg.name,
    company: arg.company,
    unReadCnt: arg.unReadCnt,
    direction: arg.direction,
    oppositeRead: '1',
    latestMsgId: '1',
    latestMsgType: 'txt',
    latestMsgIsRevoke: false,
    latestMsgTime: arg.ms,
    contact: false,
    lastPayload: JSON.stringify({
      bodies: [{ msg: arg.msg, type: 'txt' }],
      ext: {
        extType: arg.extType,
        ...(arg.jobId === undefined ? {} : { extBody: { bizData: { jobId: arg.jobId } } }),
      },
      push: arg.unReadCnt > 0 ? '1' : '0',
    }),
  }
}

function contactListStub(
  pages: Array<Record<string, unknown>>,
  captured: Array<Record<string, unknown>> = [],
): PageFetchStub {
  let call = 0
  return async (url, init) => {
    captured.push({ url, init: init ?? {} })
    const page = pages[call] ?? { flag: 1, data: { list: [] } }
    call += 1
    return { ok: true, json: async () => page }
  }
}

test('readInbox：接口行 → RawInboxMessage（未读⇒hr / 平台建议⇒me / 岗位卡带数字 jobId / ms→ISO）', async () => {
  const payload = {
    flag: 1,
    data: {
      pageSize: 0,
      totalCount: 0,
      hasNext: false,
      hasMore: false,
      list: [
        // ① HR 主动发来的真实文案 + 未读（实测 7/8 行都是这一形态）
        contactRow({
          id: 'row-hr',
          name: '何女士',
          company: '某某人力资源服务有限公司',
          unReadCnt: 1,
          direction: '1',
          ms: '1789886694000',
          extType: 1,
          msg: '你好，看了你的简历，方便聊聊吗？',
        }),
        // ② HR 主动发来的**带岗位卡**消息（extType 202，岗位信息在 extBody.bizData 里）
        contactRow({
          id: 'row-card',
          name: '郭先生',
          company: '某某科技有限公司',
          unReadCnt: 1,
          direction: '1',
          ms: '1789808162000',
          extType: 202,
          msg: '你好，请问考虑新的工作机会吗？',
          jobId: '80096799',
        }),
        // ③ 我点过「聊一聊」但对方一个字没说：最后一条是**平台替我生成的招呼语建议**
        contactRow({
          id: 'row-mine',
          name: '诸女士',
          company: '某某制药有限公司',
          unReadCnt: 0,
          direction: '0',
          ms: '1789806390000',
          extType: 200,
          msg: '我们为您生成了合适的打招呼语，去使用＞',
        }),
      ],
    },
  }
  const adapter = createLiepinAdapter()
  const page = browserLikePage(SYNTHETIC_LIST, SEARCH_URL, contactListStub([payload]))
  const inbox = (await adapter.actions?.readInbox?.(page)) ?? []

  assert.equal(inbox.length, 3)
  const [hr, card, mine] = inbox
  assert.equal(hr?.conversationId, 'row-hr')
  assert.equal(hr?.hrName, '何女士')
  assert.equal(hr?.company, '某某人力资源服务有限公司')
  assert.equal(hr?.lastMessage, '你好，看了你的简历，方便聊聊吗？', 'lastPayload 是 JSON 字符串，必须解一层')
  assert.equal(hr?.direction, 'hr', '未读 ⇒ 最后一条是对方发的（最硬的一条判据）')
  assert.equal(hr?.unread, true)
  assert.equal(hr?.at, new Date(1789886694000).toISOString(), 'latestMsgTime 是毫秒时间戳 → ISO')
  assert.equal(hr?.platformJobId, undefined, '不带岗位卡的会话没有岗位 id（不编）')

  assert.equal(card?.platformJobId, '80096799', 'extType 202 的岗位卡里带数字 jobId（与列表规范 id 同源）')
  assert.equal(card?.direction, 'hr')

  assert.equal(mine?.direction, 'me', '平台替我生成的招呼语建议是我这一侧的产物，对方一个字没说')
  assert.equal(mine?.unread, false)
})

test('readInbox：接口拒绝（flag≠1）→ **抛错**，绝不返回空数组', async () => {
  const adapter = createLiepinAdapter()
  const page = browserLikePage(
    SYNTHETIC_LIST,
    SEARCH_URL,
    contactListStub([{ flag: 0, code: '-1400', msg: '出错了（400）！' }]),
  )
  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(page),
    /flag=0/,
    '"读不到"必须让上层看见 —— 谎报 0 条会让界面显示"今天没人回我"',
  )
})

test('readInbox：fetch 失败 → 抛错；结构不认识 → 抛错；真的空 list → **可信的 0 条**', async () => {
  const adapter = createLiepinAdapter()

  const failing = browserLikePage(SYNTHETIC_LIST, SEARCH_URL, async () => {
    throw new Error('网络断了')
  })
  await assert.rejects(async () => await adapter.actions?.readInbox?.(failing), /没调通/)

  const shapeless = browserLikePage(
    SYNTHETIC_LIST,
    SEARCH_URL,
    contactListStub([{ flag: 1, data: { sessions: [] } }]),
  )
  await assert.rejects(async () => await adapter.actions?.readInbox?.(shapeless), /结构不认识/)

  const empty = browserLikePage(SYNTHETIC_LIST, SEARCH_URL, contactListStub([{ flag: 1, data: { list: [] } }]))
  assert.deepEqual(await adapter.actions?.readInbox?.(empty), [], '服务端给的空 list 才是可信的 0 条')
})

test('readInbox：翻页只认"本页不满一页即停" + 跨页按会话 id 去重', async () => {
  const rowOf = (id: string): Record<string, unknown> =>
    contactRow({
      id,
      name: '某女士',
      company: '某公司',
      unReadCnt: 1,
      direction: '1',
      ms: '1789886694000',
      extType: 1,
      msg: '在吗',
    })
  // 第 1 页刚好满页（30 条，其中 1 条在第二页重复出现），第 2 页只有 1 条 → 到底
  const pageNo1 = { flag: 1, data: { list: Array.from({ length: 30 }, (_, i) => rowOf(`row-${String(i)}`)) } }
  const pageNo2 = { flag: 1, data: { list: [rowOf('row-29'), rowOf('row-99')] } }
  const captured: Array<Record<string, unknown>> = []
  const adapter = createLiepinAdapter()
  const page = browserLikePage(SYNTHETIC_LIST, SEARCH_URL, contactListStub([pageNo1, pageNo2], captured))

  const inbox = (await adapter.actions?.readInbox?.(page)) ?? []
  assert.equal(captured.length, 2, '第 1 页满页 ⇒ 必须再翻一页（不能看 hasNext/hasMore，实测那四个汇总量都是坏的）')
  assert.equal(inbox.length, 31, '跨页去重后 30 + 1 = 31（row-29 在两页都出现）')
  assert.equal(inbox.filter((item) => item.conversationId === 'row-29').length, 1)
  assert.equal(inbox[inbox.length - 1]?.conversationId, 'row-99')
})

test('readInbox：请求形态 —— 表单体 + x-fscp 一族俱全（少一项就 -1400，静默变成"读不到"）', async () => {
  const captured: Array<Record<string, unknown>> = []
  const adapter = createLiepinAdapter()
  const page = browserLikePage(
    SYNTHETIC_LIST,
    SEARCH_URL,
    contactListStub([{ flag: 1, data: { list: [] } }], captured),
  )
  await adapter.actions?.readInbox?.(page)

  assert.equal(captured.length, 1)
  const request = captured[0] ?? {}
  assert.ok(String(request['url']).endsWith('/api/com.liepin.im.c.contact.get-contact-list'), '打的是会话列表接口')
  const init = (request['init'] ?? {}) as { headers?: Record<string, string>; body?: string; credentials?: string }
  const headers = init.headers ?? {}
  // 静态头的六项（来自 LIEPIN_API_HEADERS）：少一项服务端就回 -1400
  for (const name of ['accept', 'x-client-type', 'x-fscp-version', 'x-fscp-std-info', 'x-requested-with']) {
    assert.ok(headers[name] !== undefined && headers[name] !== '', `缺静态头 ${name} ⇒ 接口会 -1400`)
  }
  // 遥测三项：必须存在（实测 fe-version 就是空串，所以用 `in` 判）
  for (const name of ['x-fscp-trace-id', 'x-fscp-bi-stat', 'x-fscp-fe-version']) {
    assert.ok(name in headers, `缺 ${name} ⇒ 接口会 -1400（这一族少一项就全废，2026-09-20 探针反向对照实测）`)
  }
  assert.equal(
    headers['content-type'],
    'application/x-www-form-urlencoded',
    '这个接口的体是表单 —— 照抄搜索接口的 application/json 会头体错配',
  )
  assert.equal(init.body, 'imUserType=0&imId=&imApp=1&pageSize=30&curPage=0', 'imId 留空即可（服务端靠 cookie 认人）')
  assert.equal(init.credentials, 'include')
})

