/**
 * 智联招聘适配器测试（离线，不访问任何真实站点）。
 *
 * 夹具 `test/fixtures/zhaopin-sz.html` 是**合成的**：字段取值与标签结构取自
 * 2026-09 对 `https://www.zhaopin.com/sou/jl765` 的真实抓取，但页面本身是重建的
 * （真实整页 318 KB，且切出来重拼后会被 HTML 容错解析重新嵌套 —— 实测 3 张卡只剩 1 张）。
 * 所以这里测的是「给定这份选择器契约，解析逻辑正确」，**不是**"选择器线上仍有效"。
 * 后者只能靠真实 dump 或线上自检。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildZhaopinSearchUrl,
  createZhaopinAdapter,
  DEFAULT_ZHAOPIN_CONFIG,
  mergeZhaopinConfig,
  ZHAOPIN_CITY_CODES,
  ZHAOPIN_MAX_PAGES,
  ZHAOPIN_SALARY_MASK,
  type ZhaopinConfig,
} from '../../src/host/platform/adapters/zhaopin.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.zhaopin.com/sou/jl765?kw=Java'
const FIXTURE_HTML = readFileSync(
  join(import.meta.dirname, '..', 'fixtures', 'zhaopin-sz.html'),
  'utf8',
)

function page(html: string = FIXTURE_HTML): JsdomPage {
  return new JsdomPage({ html, url: SEARCH_URL })
}

// ── URL 契约 ────────────────────────────────────────────────────────

test('城市码写在路径段里，不是 query —— 这是 /sou/ 路由的形状', () => {
  const adapter = createZhaopinAdapter()
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '深圳' }),
    'https://www.zhaopin.com/sou/jl765?kw=Java',
  )
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '北京', page: 2 }),
    'https://www.zhaopin.com/sou/jl530?kw=Java&p=2',
  )
})

test('未知城市返回 null —— 城市码无法推导，不猜', () => {
  const adapter = createZhaopinAdapter()
  assert.equal(adapter.criteria.buildSearchUrl({ keyword: 'Java', city: '不存在的城市' }), null)
})

test('不传城市时退到「全国」码，URL 形状保持一致', () => {
  const adapter = createZhaopinAdapter()
  assert.equal(
    adapter.criteria.buildSearchUrl({ keyword: 'Java' }),
    'https://www.zhaopin.com/sou/jl489?kw=Java',
  )
})

test('城市表里的码都是「jl + 数字」形式，且没有重复值', () => {
  const codes = Object.values(ZHAOPIN_CITY_CODES)
  assert.ok(codes.every((code) => /^\d+$/.test(code)))
  assert.equal(new Set(codes).size, codes.length, '城市码不该有重复 —— 重复说明抄错了')
  // 抽查几个第一方实测值
  assert.equal(ZHAOPIN_CITY_CODES['深圳'], '765')
  assert.equal(ZHAOPIN_CITY_CODES['北京'], '530')
  assert.equal(ZHAOPIN_CITY_CODES['上海'], '538')
  assert.equal(ZHAOPIN_CITY_CODES['全国'], '489')
})

test('DB 覆盖能合并到默认配置上（ADR-19：配置以 DB 为权威）', () => {
  const merged = mergeZhaopinConfig({ selectors: { card: '.custom-card' }, cityCodes: { 拉萨: '999' } })
  assert.equal(merged.selectors.card, '.custom-card')
  assert.equal(merged.selectors.title, DEFAULT_ZHAOPIN_CONFIG.selectors.title, '未覆盖的键应保留默认')
  assert.equal(merged.cityCodes['拉萨'], '999')
  assert.equal(merged.cityCodes['深圳'], '765', '城市表是**合并**语义，不是替换')
  assert.deepEqual(mergeZhaopinConfig(null), DEFAULT_ZHAOPIN_CONFIG)
})

test('排序只暴露实测过的那一项 —— 不编没有证据的取值', () => {
  const adapter = createZhaopinAdapter()
  const sort = adapter.criteriaDimensions.find((d) => d.key === 'sort')
  assert.ok(sort)
  assert.deepEqual(sort.values.map((v) => v.value), ['4'])
})

test('声明不支持发布时间与页数 > 上限，并给出可读原因', () => {
  const adapter = createZhaopinAdapter()
  const posted = adapter.criteriaDimensions.find((d) => d.key === 'postedWithinDays')
  assert.ok(posted)
  assert.equal(posted.values.length, 0, '不支持就该是空值域（界面据此禁用并显示 hint）')
  assert.ok(posted.hint.includes('不暴露'))
  assert.equal(adapter.maxPages, ZHAOPIN_MAX_PAGES)
})

// ── 列表页解析 ──────────────────────────────────────────────────────

test('离线夹具：解析出 3 条，且 DOM 与内嵌载荷逐字段对得上', async () => {
  const adapter = createZhaopinAdapter()
  const jobs = await adapter.crawl.readListPage(page())

  assert.equal(jobs.length, 3)

  const first = jobs[0]
  assert.ok(first)
  assert.equal(first.platformJobId, 'CC381381910J40896290805')
  assert.equal(first.title, '销售经理｜底薪补贴4-7k+55%业绩奖+带组津贴+就近安排')
  assert.equal(first.salaryRaw, '8000-16000元')
  assert.equal(first.company, '深圳市乐有家控股集团有限公司')
  assert.equal(first.sourceUrl, 'https://www.zhaopin.com/jobdetail/CC381381910J40896290805.htm')
  assert.equal(first.city, '深圳')
  assert.equal(first.district, '宝安')
  // 经验/学历只取载荷里的精确值（DOM 上只有"后两项"这个位置信息，容易错位）
  assert.equal(first.expReq, '经验不限')
  assert.equal(first.eduReq, '高中')
  // 这三项只有内嵌载荷里有
  assert.ok(first.publishedAt?.startsWith('2026-09-17'))
  assert.equal(first.industry, '房地产中介/租赁')
  assert.equal(first.companySize, '10000人以上')
  assert.equal(first.companyNature, '民营')
  // 标签现在来自载荷 showSkillTags（技能/福利），不再混公司标签；学历/经验也被剔除
  assert.ok(first.tags?.includes('业绩奖'))
  assert.ok(!first.tags?.includes('民营'), '公司性质不该再混进技能/福利标签')
  assert.ok(!first.tags?.includes('高中') && !first.tags?.includes('经验不限'), '学历/经验不该当标签')

  // source_url 是核心字段：每条都必须能拼出来
  assert.ok(jobs.every((job) => job.platformJobId !== '' && job.sourceUrl !== ''))
})

test('每条都带 source_url 与薪资 —— 核心字段不能整轮缺失', async () => {
  const adapter = createZhaopinAdapter()
  const jobs = await adapter.crawl.readListPage(page())
  assert.ok(jobs.every((job) => job.salaryRaw !== ''))
  assert.ok(jobs.every((job) => job.title !== ''))
  assert.ok(jobs.every((job) => job.company !== ''))
})

test('薪资掩码（老路由的 **-**元）不被当成薪资写进库', async () => {
  // /jobs?jl= 那条老路由未登录时薪资就是掩码。这里**只**把卡片里那个薪资元素换成掩码，
  // 内嵌载荷保持原样 —— 否则就是在连载荷一起改，测不出"掩码被识别出来"这件事。
  const html = FIXTURE_HTML.replace(
    /<p class="jobinfo__salary">\s*8000-16000元\s*<\/p>/,
    `<p class="jobinfo__salary">${ZHAOPIN_SALARY_MASK}</p>`,
  )
  assert.ok(html.includes(ZHAOPIN_SALARY_MASK), '夹具本身要改成功，否则这个测试是空转')

  const adapter = createZhaopinAdapter()
  const jobs = await adapter.crawl.readListPage(page(html))

  assert.equal(jobs.length, 3)
  // DOM 是掩码 → 退回载荷里的真实值
  assert.equal(jobs[0]?.salaryRaw, '8000-16000元')
  assert.ok(jobs[0]?.notes?.includes('salary:masked-by-login'), '必须留下"被掩码"的痕迹')
})

test('载荷整个缺失 + DOM 薪资是掩码时，宁可留空也不写 `**-**元` 这种占位符', async () => {
  // 两个来源同时坏掉的最坏情况：既没有载荷，DOM 又是掩码。
  // 这时如果照抄 DOM，20 条岗位的薪资会全变成占位符，把匹配打分污染掉。
  let html = FIXTURE_HTML.replace(/<script>__INITIAL_STATE__[\s\S]*?<\/script>/, '')
  html = html.replace(/<p class="jobinfo__salary">\s*8000-16000元\s*<\/p>/, `<p class="jobinfo__salary">${ZHAOPIN_SALARY_MASK}</p>`)

  const adapter = createZhaopinAdapter()
  const jobs = await adapter.crawl.readListPage(page(html))

  assert.equal(jobs.length, 3)
  assert.equal(jobs[0]?.salaryRaw, '', '掩码必须变成空串（交给字段级闸门隔离），不能当薪资')
  assert.ok(jobs[0]?.notes?.includes('salary:masked-by-login'))
})

test('载荷整体缺失时仍能从 DOM 出数，并留下可读 note（不静默）', async () => {
  // 去掉内嵌载荷，模拟改版/降级
  const html = FIXTURE_HTML.replace(/<script>__INITIAL_STATE__[\s\S]*?<\/script>/, '')
  const adapter = createZhaopinAdapter()
  const jobs = await adapter.crawl.readListPage(page(html))

  assert.equal(jobs.length, 3, 'DOM 是主路径，载荷没了也该出数')
  assert.ok(jobs.every((job) => job.notes?.includes('tracking:missing-element')))
  // DOM 上拿得到的三项仍然正确
  assert.equal(jobs[0]?.title, '销售经理｜底薪补贴4-7k+55%业绩奖+带组津贴+就近安排')
  assert.equal(jobs[0]?.sourceUrl, 'https://www.zhaopin.com/jobdetail/CC381381910J40896290805.htm')
  // 只有载荷里有的字段退化为空/null —— 这是**可见的**降级，不是假装成功
  assert.equal(jobs[0]?.publishedAt, null)
  assert.equal(jobs[0]?.expReq, '')
})

test('选择器被改坏但载荷完整：卡片仍在、字段靠载荷保住，岗位 id 也不例外', async () => {
  const broken: ZhaopinConfig = {
    ...DEFAULT_ZHAOPIN_CONFIG,
    selectors: {
      ...DEFAULT_ZHAOPIN_CONFIG.selectors,
      title: '.nope-title',
      salary: '.nope-salary',
      company: '.nope-company',
      otherInfoItem: '.nope-item',
    },
  }
  const adapter = createZhaopinAdapter({ config: broken })
  const jobs = await adapter.crawl.readListPage(page())

  // 卡片容器没坏 → 仍然"看到"3 张卡，这正是 §4.2.4 要抓的那种静默失败
  assert.equal(jobs.length, 3)
  // 标题/薪资/公司**还在** —— 因为内嵌载荷按索引兜住了它们。
  assert.ok(jobs.every((job) => job.title !== '' && job.company !== '' && job.salaryRaw !== ''))
  // 岗位 id 也一样：DOM 详情链接坏掉时，载荷里的 `number` 仍是权威 id，
  // source_url 照样拼得出来 —— 这正是"载荷为主数据源"的意义。
  assert.ok(jobs.every((job) => job.platformJobId !== ''))
  assert.ok(jobs.every((job) => job.sourceUrl !== ''))
  // 经验/学历只认载荷；载荷还在，所以它们仍然对
  assert.equal(jobs[0]?.expReq, '经验不限')
})

test('AB 分流兜底：落到非目标路由（卡片 0）但载荷有真值时凭载荷出数', async () => {
  // 模拟被服务端分流到 /jobs 老路由：外层卡片容器（.joblist-box__item）整体消失，
  // 但 __INITIAL_STATE__.positionList 仍在（3 条真值，salary60 明文）。
  const html = FIXTURE_HTML.replace(
    /class="joblist-box__item clearfix joblist-box__item-unlogin"/g,
    'class="joblist-card-other-route"',
  )
  const adapter = createZhaopinAdapter()
  const jobs = await adapter.crawl.readListPage(page(html))

  assert.equal(jobs.length, 3, '卡片为 0 时靠载荷补开，不应该丢数')
  // 岗位 id 来自载荷 number，薪资来自载荷 salary60（明文）
  assert.equal(jobs[0]?.platformJobId, 'CC381381910J40896290805')
  assert.equal(jobs[0]?.salaryRaw, '8000-16000元')
  assert.equal(jobs[0]?.sourceUrl, 'https://www.zhaopin.com/jobdetail/CC381381910J40896290805.htm')
  assert.equal(jobs[0]?.expReq, '经验不限')
  assert.ok(jobs.every((job) => job.title !== '' && job.company !== ''))
})

test('AB 分流兜底：有载荷真数据时不算登录墙（卡片为 0 也放行）', async () => {
  const html = FIXTURE_HTML.replace(
    /class="joblist-box__item clearfix joblist-box__item-unlogin"/g,
    'class="joblist-card-other-route"',
  )
  const adapter = createZhaopinAdapter()
  // 页面卡片为 0、甚至带「登录」字样，但载荷有真岗位 → 不是被墙
  assert.equal(await adapter.guard.detectBlock(page(html)), null)
})

test('登录态优先信载荷 isLogged=true（即便结构类名还挂着 -unlogin）', async () => {
  const html = FIXTURE_HTML.replace(/"isLogged":false/, '"isLogged":true')
  const adapter = createZhaopinAdapter()
  assert.equal(await adapter.auth?.isLoggedIn(page(html)), true)
  // 未登录（isLogged=false）仍走结构类名判断
  assert.equal(await adapter.auth?.isLoggedIn(page()), false)
})

// ── 撞墙判定 ────────────────────────────────────────────────────────

test('正常结果页不算撞墙（尽管它未登录）', async () => {
  const adapter = createZhaopinAdapter()
  assert.equal(await adapter.guard.detectBlock(page()), null)
})

test('「登录之后再搜索」+ 0 条 → login-required（这是静默失败，必须点出来）', async () => {
  const adapter = createZhaopinAdapter()
  const walled = page('<html><body><div>登录之后再搜索，海量职位等你挑！马上登录 &gt;&gt;</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(walled), 'login-required')
})

test('验证码 / 限流 / 空白页能被区分出来', async () => {
  const adapter = createZhaopinAdapter()
  assert.equal(
    await adapter.guard.detectBlock(page('<html><body><div class="geetest_panel">请完成验证</div></body></html>')),
    'captcha',
  )
  assert.equal(
    await adapter.guard.detectBlock(page('<html><body><div>访问过于频繁，请稍后再试</div></body></html>')),
    'rate-limited',
  )
  assert.equal(await adapter.guard.detectBlock(page('<html><body></body></html>')), 'blank')
})

test('未登录判定只看结构类名，不看「登录」两个字', async () => {
  const adapter = createZhaopinAdapter()
  // 夹具是未登录态 → false
  assert.equal(await adapter.auth?.isLoggedIn(page()), false)
  // 去掉 -unlogin 修饰类 → 视为已登录
  const loggedIn = FIXTURE_HTML.replace(/-unlogin/g, '')
  assert.equal(await adapter.auth?.isLoggedIn(page(loggedIn)), true)
})

// ── 分页 ────────────────────────────────────────────────────────────

test('hasNextPage 读站点自己生成的无 query path 链接（robots 上更干净）', async () => {
  const adapter = createZhaopinAdapter()
  assert.equal(await adapter.crawl.hasNextPage(page()), true)
  // 末页：没有「下一页」→ false
  const lastPage = FIXTURE_HTML.replace(/<a href="https:\/\/www\.zhaopin\.com\/sou\/jl765\/p2" class="btn soupager__btn">下一页<\/a>/, '')
  assert.equal(await adapter.crawl.hasNextPage(page(lastPage)), false)
})

// ── 真路径的回归护栏（与 51job 同一条） ─────────────────────────────

/**
 * 像浏览器那样**只拿函数源码**重建：闭包一律不存在。
 *
 * 这是离线环境里唯一能复现「真路径 ReferenceError」的手段。
 * 本次真的差一点踩上：`extractJobsInPage` 一开始调用了模块级的
 * `readStateFromPage()` —— jsdom 下全绿（Node 里闭包还在），
 * 一上真浏览器就会整页解析失败。载荷解析因此被内联进函数体。
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
  assert.throws(() => asSerialized(leaky)(), ReferenceError)
})

test('页面函数必须自包含：按源码重建后仍能正常解析、判墙、翻页', async () => {
  const adapter = createZhaopinAdapter()
  const browserPage = browserLikePage(FIXTURE_HTML)

  // readListPage / detectBlock / hasNextPage / isLoggedIn 都会走 page.evaluate，
  // 任何一个引用了模块作用域的变量，这里都会炸。
  const jobs = await adapter.crawl.readListPage(browserPage)
  assert.equal(jobs.length, 3)
  assert.equal(jobs[0]?.title, '销售经理｜底薪补贴4-7k+55%业绩奖+带组津贴+就近安排')
  assert.equal(jobs[0]?.salaryRaw, '8000-16000元')
  assert.equal(jobs[0]?.sourceUrl, 'https://www.zhaopin.com/jobdetail/CC381381910J40896290805.htm')
  assert.equal(jobs[0]?.publishedAt?.slice(0, 10), '2026-09-17')

  assert.equal(await adapter.guard.detectBlock(browserPage), null)
  assert.equal(await adapter.crawl.hasNextPage(browserPage), true)
  assert.equal(await adapter.auth?.isLoggedIn(browserPage), false)
})

test('撞墙判定在「按源码重建」后同样成立', async () => {
  const adapter = createZhaopinAdapter()
  const captcha = browserLikePage('<html><body><div class="geetest_panel">请完成验证</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(captcha), 'captcha')
})

test('适配器 id 与能力声明符合平台事实', () => {
  const adapter = createZhaopinAdapter()
  assert.equal(adapter.id, 'zhaopin')
  assert.equal(adapter.displayName, '智联招聘')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.fieldCompleteness, 'high')
  // 打招呼没实现 → 必须声明 false，让 guard 明确拒绝而不是假装能发
  assert.equal(adapter.capabilities.supportsGreeting, false)
  assert.equal(adapter.actions, undefined)
})
