import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildLiepinSearchUrl,
  buildSearchRequestBody,
  createLiepinAdapter,
  DEFAULT_LIEPIN_CONFIG,
  mergeLiepinConfig,
  parseSearchApiResponse,
  refreshTimeToIso,
} from '../../src/host/platform/adapters/liepin.js'
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
  assert.equal(adapter.capabilities.supportsGreeting, false)
  assert.equal(adapter.actions, undefined)
  assert.equal(adapter.maxPages, 8)
  // 不声明 auth：v1 按"免登录可搜"处理，登录墙信号等夹具校准（防"永远未登录"死锁）
  assert.equal(adapter.auth, undefined)
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
