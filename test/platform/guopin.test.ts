import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createGuopinAdapter } from '../../src/host/platform/adapters/guopin/index.js'
import {
  DEFAULT_GUOPIN_CONFIG,
  GUOPIN_LOGIN_URL,
  GUOPIN_MAX_PAGES,
  mergeGuopinConfig,
} from '../../src/host/platform/adapters/guopin/config.js'
import { buildGuopinJobDetailUrl, buildGuopinSearchUrl } from '../../src/host/platform/adapters/guopin/urls.js'
import {
  buildGuopinListBody,
  guopinListPageOf,
} from '../../src/host/platform/adapters/guopin/api.js'
import {
  GUOPIN_EXPERIENCE_OPTIONS,
  GUOPIN_MAJOR_OPTIONS,
} from '../../src/host/platform/adapters/guopin/dictionaries.js'
import { isLoggedInByMarkersInPage } from '../../src/host/platform/adapters/guopin/page/list.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.iguopin.com/jobList?keyword=Java'
const FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'guopin-search.html')
/** 登录态列表夹具（`npm run probe:guopin-login` 采集，2026-09-20）。 */
const LOGGED_FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'guopin-search-logged-in.html')
/** 详情页夹具（同一次探针点开首卡采下，`/job/detail?id=` 真实结构）。 */
const DETAIL_FIXTURE_PATH = join(import.meta.dirname, '..', 'fixtures', 'guopin-detail.html')

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

// ── URL 构造 ───────────────────────────────────────────────────────────────
test('搜索 URL：keyword 原样透传；城市码表为空 ⇒ 带城市一律 null（不猜）', () => {
  assert.equal(
    buildGuopinSearchUrl(DEFAULT_GUOPIN_CONFIG, { keyword: 'Java' }),
    'https://www.iguopin.com/jobList?keyword=Java',
  )
  assert.equal(
    buildGuopinSearchUrl(DEFAULT_GUOPIN_CONFIG, { keyword: '前端' }),
    'https://www.iguopin.com/jobList?keyword=%E5%89%8D%E7%AB%AF',
  )
  // 空条件 → 裸列表页（平台默认全量）
  assert.equal(buildGuopinSearchUrl(DEFAULT_GUOPIN_CONFIG, {}), 'https://www.iguopin.com/jobList')
  // 城市码未实测（v1 空表）：带城市就拒绝，绝不猜一个参数形态
  assert.equal(buildGuopinSearchUrl(DEFAULT_GUOPIN_CONFIG, { keyword: 'Java', city: '北京' }), null)
  // DB 覆盖补上城市码后即放行
  assert.equal(
    buildGuopinSearchUrl(
      { ...DEFAULT_GUOPIN_CONFIG, cityCodes: { 北京: '110000' } },
      { keyword: 'Java', city: '北京' },
    ),
    'https://www.iguopin.com/jobList?keyword=Java',
  )
})

test('列表接口（2026-09-21 探针实测）：筛选进请求体、记录逐字段映射', () => {
  // ① 请求体：只发证明过会筛的两个键，且必须是**数组**（字符串形状会被忽略，见 FINDINGS）
  const body = JSON.parse(
    buildGuopinListBody(
      { keyword: 'Java', platform: { experience: '113aJGtA', major: '117CvKmE' } },
      2,
      20,
    ),
  )
  assert.deepEqual(body.search, {
    page: 2,
    page_size: 20,
    keyword: 'Java',
    experience: ['113aJGtA'],
    major: ['117CvKmE'],
  })
  // 没配就不发这两个键（"没配"与"配了"分得开）
  const bare = JSON.parse(buildGuopinListBody({ keyword: 'Java' }, 1, 20))
  assert.equal('experience' in bare.search, false)
  assert.equal('major' in bare.search, false)

  // ② 真实夹具（抓包里那一次带 experience 筛选的响应）→ 逐字段映射
  const fixture = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'fixtures', 'guopin-list-api.json'), 'utf8'),
  )
  const page = guopinListPageOf(fixture, {
    detailUrlTemplate: 'https://www.iguopin.com/job/detail?id={jobId}',
  } as never)
  assert.ok(page !== null, '真实响应必须能解析')
  assert.equal(page?.jobs.length, 20)
  assert.equal(page?.total, 48, '这一份是"Java + 1-3年"的结果集（api-diff 实测 400→48）')
  const first = page?.jobs[0]
  assert.equal(first?.title, 'Java工程师')
  assert.equal(first?.company, '北京易电智通信息技术有限公司保定分公司')
  // 接口直接给明文区间 + 单位；发薪月数**只在 >12 时**才announce（12 薪是默认，写出来是噪音）
  assert.equal(first?.salaryRaw, '6000-8000元/月')
  assert.equal(first?.city, '保定')
  assert.equal(first?.district, '竞秀区', 'district_list[0].area_cn 是「市-区」')
  assert.equal(first?.eduReq, '本科')
  assert.equal(first?.expReq, '1-3年')
  assert.equal(first?.publishedAt, '2026-09-15 01:00:00')
  assert.ok(
    first?.sourceUrl.includes(first?.platformJobId ?? 'x'),
    'sourceUrl 由 detailUrlTemplate 拼出',
  )

  // ③ 声明：两个维度都写了 wire（对账测试会验"探针值必须改变真实请求"）
  const adapter = createGuopinAdapter()
  const experience = adapter.criteriaDimensions.find((item) => item.key === 'experience')
  assert.equal(experience?.wire?.param, 'experience')
  assert.equal(experience?.values.length, GUOPIN_EXPERIENCE_OPTIONS.length)
  const major = adapter.criteriaDimensions.find((item) => item.key === 'major')
  assert.equal(major?.wire?.param, 'major')
  assert.equal(major?.values.length, GUOPIN_MAJOR_OPTIONS.length)
})

test('详情 URL 模板：{jobId} 替换（19 位数字 id 形态）', () => {
  assert.equal(
    buildGuopinJobDetailUrl(DEFAULT_GUOPIN_CONFIG, '1234567890123456789'),
    'https://www.iguopin.com/job/detail?id=1234567890123456789',
  )
})

// ── 适配器声明（钉住平台事实，防漂移）──────────────────────────────────────
test('适配器声明符合平台事实：未登录可搜、薪资 18/20（medium）、antiBot=low、单页', () => {
  const adapter = createGuopinAdapter()
  assert.equal(adapter.id, 'guopin')
  assert.equal(adapter.displayName, '国聘网')
  // 列表页未登录可看（probe 实证），投递才要登录
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  // 列表卡片无薪资（probe 实证）→ 字段完整度如实 medium，不高报
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium')
  // 政府背景平台，未观测到 CDP 检测（§7.1 低档）
  assert.equal(adapter.capabilities.antiBot, 'low')
  assert.equal(adapter.maxPages, GUOPIN_MAX_PAGES)
  assert.equal(adapter.maxPages, 20, 'ant 分页自报 20 页（2026-09-20 实测）—— 深度上限来自平台')
  assert.equal(adapter.defaultMaxPages, 1, '默认仍 1 页（翻页要重新导航+连点，保守取舍）')
  // 列表薪资 18/20 + 无平台 id ⇒ salary_raw 不进必需字段（否则无薪资的那几条被隔离）
  assert.ok(
    !adapter.requiredFields.includes('salary_raw' as never),
    '列表薪资 18/20，salary_raw 不得进必需字段（否则无薪资的那几条被隔离）',
  )
  // 国聘没有会话/收件箱/投递按钮契约 —— capabilities 全关 + actions fail-closed
  assert.equal(adapter.capabilities.supportsInbox, false)
  assert.equal(adapter.capabilities.supportsGreeting, false)
  assert.equal(adapter.capabilities.supportsAttachment, false)
  assert.equal(adapter.capabilities.supportsReadReceipt, false)
  assert.equal(adapter.actions, undefined, '投递要登录态且无稳定按钮契约 —— fail-closed，不实现')
  assert.ok(adapter.detail !== undefined, '详情页结构已由登录态快照校准，应声明 detail.extract')
  // 2026-09-20：登录检测补齐（锚点两端实测；此前 auth === undefined ⇒ platforms.loginStatus 抛错）
  assert.equal(typeof adapter.auth?.isLoggedIn, 'function')
  assert.equal(adapter.auth?.loginUrl, GUOPIN_LOGIN_URL)
  assert.equal(adapter.auth?.loginUrl, 'https://www.iguopin.com/login')
  // 城市维度 closed:true —— 空表 ≠ 自由文本，未列城市在入口层就被拒
  const cityDim = adapter.criteriaDimensions.find((item) => item.key === 'city')
  assert.equal(cityDim?.closed, true)
  assert.deepEqual(cityDim?.values, [])
})

test('hasNextPage：读 ant 分页真实状态（next 在且不带 disabled → true；无分页 → false）', async () => {
  const adapter = createGuopinAdapter()
  // 无分页区（0 条结果 / 结构变了）→ false
  const noPagination = browserLikePage('<html><body><div class="job-card"></div></body></html>')
  assert.equal(await adapter.crawl.hasNextPage(noPagination), false)

  // ant 分页、第 1 页（next 可用）→ true —— 结构照 2026-09-20 实测快照还原
  const page1 = browserLikePage(`
  <html><body>
    <ul class="ant-pagination">
      <li title="上一页" class="ant-pagination-prev ant-pagination-disabled"><button disabled></button></li>
      <li title="1" class="ant-pagination-item ant-pagination-item-1 ant-pagination-item-active"><a rel="nofollow">1</a></li>
      <li title="2" class="ant-pagination-item ant-pagination-item-2"><a rel="nofollow">2</a></li>
      <li title="下一页" class="ant-pagination-next"><button class="ant-pagination-item-link"></button></li>
    </ul>
  </body></html>`)
  assert.equal(await adapter.crawl.hasNextPage(page1), true)

  // 末页（next 带 disabled）→ false
  const lastPage = browserLikePage(`
  <html><body>
    <ul class="ant-pagination">
      <li title="20" class="ant-pagination-item ant-pagination-item-20 ant-pagination-item-active"><a rel="nofollow">20</a></li>
      <li title="下一页" class="ant-pagination-next ant-pagination-disabled"><button disabled></button></li>
    </ul>
  </body></html>`)
  assert.equal(await adapter.crawl.hasNextPage(lastPage), false)
})

test('gotoSearch 翻页 fail-closed：第 2 页点不动就抛错（不把第 1 页当第 2 页读）', async () => {
  const adapter = createGuopinAdapter({
    // 离线夹具没有 React，点了 next 页码不会变 → 超时收手；把超时压到几十毫秒
    config: { ...DEFAULT_GUOPIN_CONFIG, pageTurnTimeoutMs: 50 },
  })
  const page = browserLikePage(`
  <html><body>
    <div class="job-card"></div>
    <ul class="ant-pagination">
      <li title="1" class="ant-pagination-item ant-pagination-item-1 ant-pagination-item-active"><a rel="nofollow">1</a></li>
      <li title="2" class="ant-pagination-item ant-pagination-item-2"><a rel="nofollow">2</a></li>
      <li title="下一页" class="ant-pagination-next"><button class="ant-pagination-item-link"></button></li>
    </ul>
  </body></html>`)
  await assert.rejects(
    adapter.crawl.gotoSearch(page, { keyword: 'Java', page: 2 }),
    /翻到第 2 页失败/,
    '翻不到目标页必须抛错：继续读会把第 1 页当第 2 页重复采集（幂等键还会悄悄吞掉重复）',
  )
  // 第 1 页不点击，照常通过
  await assert.doesNotReject(adapter.crawl.gotoSearch(page, { keyword: 'Java', page: 1 }))
})

// ── gotoSearch：waitForSelector 超时不抛（由判墙 + 0 条兜底）────────────────
test('gotoSearch：卡片容器等不到时不抛错（超时交给判墙/0 条去解释）', async () => {
  const adapter = createGuopinAdapter()
  const page = browserLikePage('<html><body><div>请登录</div></body></html>')
  // 以前这里会抛 TimeoutError，把"被登录墙顶掉"讲成一次导航失败
  await assert.doesNotReject(adapter.crawl.gotoSearch(page, { keyword: 'Java' }))
})

// ── 判墙（GUOPIN_BLOCK_SIGNALS ∪ 通用词表）─────────────────────────────────
test('判墙：geetest DOM → captcha；「人机验证」→ rate-limited', async () => {
  const adapter = createGuopinAdapter()
  const geetest = browserLikePage('<html><body><div class="geetest_box">验证</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(geetest), 'captcha')

  const humanCheck = browserLikePage('<html><body><div>人机验证</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(humanCheck), 'rate-limited')
})

test('判墙：0 卡 + 「请登录」→ login-required（loginTextLength 极大 = 不看页面长度）', async () => {
  const adapter = createGuopinAdapter()
  // 国聘的登录墙判据刻意放宽了长度门槛（GUOPIN_BLOCK_SIGNALS.loginTextLength = 1_000_000）：
  // 即使页面很长（SPA 外壳 + 登录提示），只要一条卡片都没有就判登录墙。
  const longLoginWall = browserLikePage(
    `<html><body><div>${'x'.repeat(2_000)}</div><div>请登录后继续操作</div></body></html>`,
  )
  assert.equal(await adapter.guard.detectBlock(longLoginWall), 'login-required')
})

test('判墙：空白页 → blank；正常夹具 → null', async (t) => {
  const adapter = createGuopinAdapter()
  const blank = browserLikePage('<html><body></body></html>')
  assert.equal(await adapter.guard.detectBlock(blank), 'blank')

  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:guopin`)
    return
  }
  const page = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))
  assert.equal(await adapter.guard.detectBlock(page), null)
})

// ── 真实夹具解析（probe:guopin 采集，2026-09-18）───────────────────────────
test('真实夹具解析：20 张卡片、薪资 18/20、无平台 id、城市走「」书名号、公司三件套', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:guopin`)
    return
  }
  const adapter = createGuopinAdapter()
  const page = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))
  const jobs = await adapter.crawl.readListPage(page)

  assert.equal(jobs.length, 20, 'probe 实证 20 张卡片')

  for (const job of jobs) {
    assert.ok(job.title.length > 0, '标题必填')
    assert.ok(job.company.length > 0, '公司名走 company-name[title]')
    // 薪资多数卡片有（18/20）、少数没有（2/20，恰为同公司引才计划卡）—— 空值如实留空
    assert.match(job.platformJobId, /^ch:[0-9a-f]{1,8}$/, '内容哈希幂等键形态')
    // sourceUrl 存列表页 URL（列表无详情链接，不编）
    assert.equal(job.sourceUrl, SEARCH_URL)
  }

  // 首卡实测样本（fixture 第一张）：java后端 「北京-东城区」（属无 .job-salary 的少数卡）
  const first = jobs[0]
  assert.equal(first?.title, 'java后端')
  assert.equal(first?.city, '北京')
  assert.equal(first?.district, '东城区')
  assert.equal(first?.salaryRaw, '', '首卡（引才计划卡）无 .job-salary，留空由详情页兜底')
  assert.equal(first?.company, '智能汽车制造产业链专项引才计划')
  assert.equal(first?.companyNature, '其他')
  assert.equal(first?.companySize, '100-300人')
  assert.equal(first?.industry, '汽车制造业')
  // 「性质/经验/学历」标签按词表归类进 tags（该卡经验缺失属实测常态）
  assert.ok((first?.tags ?? []).includes('校招'))
  assert.ok((first?.tags ?? []).includes('本科'))

  // 薪资覆盖：18/20 张卡片带 .job-salary（面议 / 数值区间 / ·N薪 形态）
  const withSalary = jobs.filter((job) => job.salaryRaw !== '')
  assert.equal(withSalary.length, 18, '夹具实测 18 张卡片带薪资')
  assert.ok(withSalary.some((job) => job.salaryRaw === '面议'), '「面议」是合法薪资格')
  assert.ok(
    withSalary.some((job) => /^\d+(\.\d+)?~\d+(\.\d+)?K$/.test(job.salaryRaw)),
    '区间形态（如 10~13K）要能读到',
  )
  assert.ok(withSalary.some((job) => job.salaryRaw.includes('薪')), '「8~9K·16薪」形态要能读到')

  // 无区域的城市（「北京」无短横线）：city=北京、district 留空（按 title+company 锚定样本，
  // 同名岗位多城多卡，只认北京计算机技术及应用研究所那张）
  const noDistrict = jobs.find(
    (job) => job.title === 'Java开发工程师' && job.company === '北京计算机技术及应用研究所',
  )
  assert.ok(noDistrict !== undefined)
  assert.equal(noDistrict.city, '北京')
  assert.equal(noDistrict.district ?? '', '', '「北京」没有区域段，district 应省略')
  assert.equal(noDistrict.salaryRaw, '面议', '该卡 .job-salary=面议（probe 实证）')

  const hit = (pick: (job: (typeof jobs)[number]) => unknown): number =>
    jobs.filter((job) => {
      const value = pick(job)
      return value !== undefined && value !== '' && value !== null
    }).length
  console.log(
    `[guopin-fixture] ${String(jobs.length)} 张卡片 · city ${String(hit((j) => j.city))} · ` +
      `district ${String(hit((j) => j.district))} · exp ${String(hit((j) => j.expReq))} · ` +
      `edu ${String(hit((j) => j.eduReq))} · salary ${String(hit((j) => j.salaryRaw))}/20` +
      '（少数卡片无 .job-salary 属预期，由详情页兜底）',
  )

  // 夹具带 ant 分页（未登录也有分页，next 可用）—— hasNextPage 应如实返回 true
  assert.equal(await adapter.crawl.hasNextPage(page), true, '夹具有 ant 分页且 next 可用')
})

test('幂等键：deterministic + 同岗位重复挂载自然去重（用户拍板的内容哈希方案）', async (t) => {
  if (!existsSync(FIXTURE_PATH)) {
    t.skip(`夹具不存在（${FIXTURE_PATH}）—— 先手动跑一次 npm run probe:guopin`)
    return
  }
  const adapter = createGuopinAdapter()
  const html = readFileSync(FIXTURE_PATH, 'utf8')
  const first = await adapter.crawl.readListPage(browserLikePage(html))
  const second = await adapter.crawl.readListPage(browserLikePage(html))
  assert.deepEqual(
    second.map((job) => job.platformJobId),
    first.map((job) => job.platformJobId),
    '同输入两次解析必须得到同一组幂等键（deterministic FNV-1a）',
  )

  // 夹具里「Java开发工程师 | 北京计算机技术及应用研究所」挂了两次（probe 实证）：
  // title|company|city|district 完全一致 ⇒ 内容键碰撞 —— 这正是该方案的语义：
  // 同岗位重复抓不重复（upsert 层自然去重），20 张卡片收敛为 19 个岗位。
  const ids = new Set(first.map((job) => job.platformJobId))
  assert.equal(ids.size, 19, '20 张卡片 - 1 组重复挂载 = 19 个唯一岗位')
})

// ── 详情页解析（2026-09-20 由真实登录态快照校准：`.probe-guopin-capture/guopin-detail-…`）──
test('详情页解析：真实结构全字段（标题/JD/公司/报名截止/学历/性质/公司标签/更新时间）', async () => {
  const adapter = createGuopinAdapter()
  // 结构照快照原文还原（java后端 · 智能汽车制造产业链专项引才计划 · 校招岗，无薪资节点）。
  const html = `
  <html><head><title>java后端-智能汽车制造产业链专项引才计划-国聘</title></head><body>
    <div class="job-banner"><div class="container"><div class="title-box"><div class="title-wrap">
      <div class="title-section "><div class="title">java后端</div></div>
      <img class="icon-time"><span class="update-time">更新于 2026-09-12</span>
    </div></div></div></div>
    <div class="job-container"><div class="container"><div class="job-content"><div class="left ">
      <div class="job-overview-section bordered">
        <div class="overview-item"><span class="circle"></span><span class="overview-title">职位性质：</span><span class="overview-desc">校招</span></div>
        <div class="overview-item"><span class="circle"></span><span class="overview-title">最低学历：</span><span class="overview-desc">本科</span></div>
        <div class="overview-item"><span class="circle"></span><span class="overview-title">报名截止：</span><span class="overview-desc">2026-12-31 23:59:59</span></div>
      </div>
      <div class="section job-intro-section"><div class="section-title">职位介绍</div>
        <div class="section-content">
          <div class="intro-tag-wrap"><span class="intro-tag">Java工程师</span><span class="intro-tag">智能汽车制造产业链专项引才计划</span></div>
          <div class="job-duty">【工作职责】 参与机器人云平台后端微服务模块的设计、开发与迭代。</div>
        </div>
      </div>
    </div><div class="right"><div class="section job-company-wrap">
      <div class="section-content">
        <div class="job-company-top">
          <div class="logo-wrap"><a href="/company?id=217298487220372682"><div class="company-logo-mark">智</div></a></div>
          <div class="job-company-desc"><a href="/company?id=217298487220372682"><div class="company-title substring2">智能汽车制造产业链专项引才计划</div></a></div>
        </div>
        <div class="job-company-tag"><span class="company-tag">公共招聘服务</span><span class="company-tag">其他</span><span class="company-tag">汽车制造业</span><span class="company-tag">100-300人</span></div>
      </div>
    </div></div></div></div></div>
  </body></html>`
  const page = browserLikePage(html, 'https://www.iguopin.com/job/detail?id=217910786683569703')

  const detail = await adapter.detail?.extract(page)

  assert.equal(detail?.platformJobId, '217910786683569703', 'id 从 URL 抠出（详情页是平台 id 的唯一来源）')
  assert.equal(detail?.title, 'java后端', '标题走 .title-section .title（页面无 h1）')
  assert.equal(detail?.company, '智能汽车制造产业链专项引才计划', '公司走 .company-title（logo 链接里没有文本）')
  assert.ok((detail?.jdText ?? '').includes('机器人云平台后端'), 'JD 走 .job-duty')
  assert.equal(detail?.eduReq, '本科', '学历从 overview 键值对按 title 文本归类')
  assert.equal(detail?.applyDeadline, '2026-12-31 23:59:59', '报名截止整串（campus 硬截止的原料）')
  assert.equal(detail?.publishedAt, '2026-09-12', '「更新于 2026-09-12」→ publishedAt 只留日期')
  assert.equal(detail?.companyNature, '其他', '公司标签按词表归类性质（顺序不固定）')
  assert.equal(detail?.companySize, '100-300人', '公司标签按词表归类规模')
  assert.ok((detail?.tags ?? []).includes('校招'), '职位性质裸值进 tags（与列表口径一致）')
  assert.ok((detail?.tags ?? []).includes('Java工程师'), '职能标签 .intro-tag 进 tags')
  assert.equal(detail?.salaryRaw, '', '该岗无薪资节点（引才计划岗）→ 留空，不编')
  assert.equal(detail?.sourceUrl, 'https://www.iguopin.com/job/detail?id=217910786683569703')
})

test('详情页解析：overview 没给报名截止时走正文正则兜底；都没有就省略', async () => {
  const adapter = createGuopinAdapter()
  // ① overview 没有该项、正文里有 → 正则兜底（老路径，保 DB 覆盖兼容）
  const withBodyDeadline = browserLikePage(
    `<html><head><title>岗</title></head><body><div class="title-section"><div class="title">岗</div></div>
     <div class="job-duty">JD 正文。报名截止：2026-12-12 23:50:05 请尽早。</div></body></html>`,
    'https://www.iguopin.com/job/detail?id=42',
  )
  const fallback = await adapter.detail?.extract(withBodyDeadline)
  assert.equal(fallback?.applyDeadline, '2026-12-12 23:50:05', 'overview 缺席时从正文抠')

  // ② 两处都没有 → 键省略（不编 null 占位）
  const none = browserLikePage(
    `<html><head><title>岗</title></head><body><div class="title-section"><div class="title">岗</div></div>
     <div class="job-duty">JD 正文，没有截止时间字段。</div></body></html>`,
    'https://www.iguopin.com/job/detail?id=43',
  )
  const detail = await adapter.detail?.extract(none)
  assert.equal('applyDeadline' in (detail ?? {}), false, '没有截止时间就整个键省略')
})

test('详情页真实夹具：选择器逐字段命中（probe:guopin-login 采集的 /job/detail 快照）', async (t) => {
  if (!existsSync(DETAIL_FIXTURE_PATH)) {
    t.skip(`夹具不存在（${DETAIL_FIXTURE_PATH}）—— 先手动跑一次 npm run probe:guopin-login`)
    return
  }
  const adapter = createGuopinAdapter()
  const page = browserLikePage(readFileSync(DETAIL_FIXTURE_PATH, 'utf8'), 'https://www.iguopin.com/job/detail?id=217910786683569703')
  const detail = await adapter.detail?.extract(page)
  assert.equal(detail?.title, 'java后端')
  assert.equal(detail?.company, '智能汽车制造产业链专项引才计划')
  assert.ok((detail?.jdText ?? '').length > 100, `JD 应有正文，实际 ${String((detail?.jdText ?? '').length)} 字`)
  assert.match(detail?.applyDeadline ?? '', /^\d{4}-\d{2}-\d{2}/, '报名截止应解析出日期串')
  assert.equal(detail?.platformJobId, '217910786683569703')
})

// ── 登录态检测（2026-09-20 两端实测：未登录夹具 vs 登录态快照）──────────────
test('登录态：未登录夹具判「未登录」、登录态夹具判「已登录」、判不出来时如实返回 null', async (t) => {
  if (!existsSync(FIXTURE_PATH) || !existsSync(LOGGED_FIXTURE_PATH)) {
    t.skip('需要 guopin-search.html 与 guopin-search-logged-in.html 两份夹具')
    return
  }
  const adapter = createGuopinAdapter()
  const markers = {
    loggedIn: DEFAULT_GUOPIN_CONFIG.loginSelectors.loggedIn,
    notLoggedIn: DEFAULT_GUOPIN_CONFIG.loginSelectors.notLoggedIn,
  }

  // ① 未登录夹具：页头是 `a.login`「登录/注册」
  const anon = browserLikePage(readFileSync(FIXTURE_PATH, 'utf8'))
  assert.equal(await adapter.auth?.isLoggedIn(anon), false, '未登录夹具：应判「未登录」')

  // ② 登录态快照：页头是 `.avatar-box .user-name`（脱敏手机号）
  const loggedIn = browserLikePage(readFileSync(LOGGED_FIXTURE_PATH, 'utf8'))
  assert.equal(await adapter.auth?.isLoggedIn(loggedIn), true, '登录态夹具：应判「已登录」')

  // ③ 两个锚点都不在 ⇒ 页面函数如实返回 null；适配器层再保守落成 false
  const blank = browserLikePage('<div>页面结构整个换了</div>')
  assert.equal(
    await blank.evaluate(isLoggedInByMarkersInPage as unknown as (arg: typeof markers) => boolean | null, markers),
    null,
    '判不出来必须是 null，而不是猜一个',
  )
  assert.equal(await adapter.auth?.isLoggedIn(blank), false, '适配器层：判不出来按「未登录」兜底（保守）')
})

// ── 配置合并（DB 覆盖边界）────────────────────────────────────────────────
test('配置合并：非法覆盖回落默认、合法覆盖逐键生效', () => {
  // selectors / urlParams / cityCodes 按 section 浅合并
  assert.equal(
    mergeGuopinConfig({ selectors: { card: '.my-card' } }).selectors.card,
    '.my-card',
  )
  assert.equal(
    mergeGuopinConfig({ selectors: { card: '.my-card' } }).selectors.jobName,
    DEFAULT_GUOPIN_CONFIG.selectors.jobName,
    '没覆盖的键必须保持默认',
  )
  assert.deepEqual(
    mergeGuopinConfig({ cityCodes: { 北京: '110000' } }).cityCodes,
    { 北京: '110000' },
    '城市码整表来自 DB（默认空表）',
  )
  // 正则类字段：字符串非空才生效
  assert.equal(mergeGuopinConfig({ salaryPattern: '面议' }).salaryPattern, '面议')
  assert.equal(
    mergeGuopinConfig({ salaryPattern: '' }).salaryPattern,
    DEFAULT_GUOPIN_CONFIG.salaryPattern,
    '空串 = 没覆盖',
  )
  assert.equal(
    mergeGuopinConfig({ salaryPattern: 123 as never }).salaryPattern,
    DEFAULT_GUOPIN_CONFIG.salaryPattern,
    '类型写错回落默认',
  )
  // 登录锚点 / 翻页超时：section 浅合并 / 正数校验
  assert.equal(
    mergeGuopinConfig({ loginSelectors: { loggedIn: '.my-user' } }).loginSelectors.loggedIn,
    '.my-user',
  )
  assert.equal(
    mergeGuopinConfig({ loginSelectors: { loggedIn: '.my-user' } }).loginSelectors.notLoggedIn,
    DEFAULT_GUOPIN_CONFIG.loginSelectors.notLoggedIn,
    '登录锚点没覆盖的键保持默认',
  )
  assert.equal(mergeGuopinConfig({ pageTurnTimeoutMs: 30 }).pageTurnTimeoutMs, 30)
  assert.equal(
    mergeGuopinConfig({ pageTurnTimeoutMs: -1 as never }).pageTurnTimeoutMs,
    DEFAULT_GUOPIN_CONFIG.pageTurnTimeoutMs,
    '非法数值回落默认（否则翻页等待被写坏）',
  )
  // 整份非对象覆盖 → 默认
  assert.equal(mergeGuopinConfig('bad'), DEFAULT_GUOPIN_CONFIG)
  assert.equal(mergeGuopinConfig(null), DEFAULT_GUOPIN_CONFIG)
})
