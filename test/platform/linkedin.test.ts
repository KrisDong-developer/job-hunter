import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { createLinkedInAdapter } from '../../src/host/platform/adapters/linkedin/index.js'
import { DEFAULT_LINKEDIN_CONFIG, mergeLinkedInConfig } from '../../src/host/platform/adapters/linkedin/config.js'
import {
  buildLinkedInGuestApiUrl,
  buildLinkedInSearchUrl,
} from '../../src/host/platform/adapters/linkedin/urls.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const HOST = DEFAULT_LINKEDIN_CONFIG.host
const GUEST_URL = `https://${HOST}/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Java&start=0`

/** 序列化重建：模拟 Playwright 把函数送进浏览器的真实路径（闭包不存在）。 */
function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

/**
 * 导航式页面：`gotoSearch` 会把页面**导航到 guest 端点 URL**，夹具页按 loader
 * 在导航时换内容 —— 与真路径「浏览器渲染片段成文档」同构（Trusted Types 红线
 * 决定了不能走「fetch 回字符串再注入解析」）。
 */
function browserLikePage(
  html: string,
  url = GUEST_URL,
  loader?: (url: string) => string | undefined,
): PageLike {
  const inner = new JsdomPage({ html, url, ...(loader === undefined ? {} : { loader }) })
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

/** guest 端点导航夹具：任何 guest URL 都返回这份卡片文档（按 start 换内容的测试自带 loader）。 */
const guestDocOf = (fragment: string): ((url: string) => string | undefined) => () => fragment

// ── URL 构造 ───────────────────────────────────────────────────────────

test('guest 端点 URL（主导航目标）：keywords/location/start；第二页 start=10（真机步进）', () => {
  const url = buildLinkedInGuestApiUrl(DEFAULT_LINKEDIN_CONFIG, { keyword: 'Java', city: 'Shanghai', page: 1 })
  assert.equal(
    url,
    'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=Java&location=Shanghai&start=0',
  )
  const page2 = buildLinkedInGuestApiUrl(DEFAULT_LINKEDIN_CONFIG, { keyword: 'Java', city: 'Shanghai', page: 2 })
  assert.ok(page2.includes('start=10'), `第二页 start 应步进 pageSize（真机实测每页 10）：${page2}`)
})

test('筛选参数：只拼 guest 端点真认的 f_TPR；f_E/f_WT/f_AL/sortBy 一律不拼（v2 实测被忽略）', () => {
  const url = buildLinkedInGuestApiUrl(DEFAULT_LINKEDIN_CONFIG, {
    keyword: 'Engineer',
    page: 2,
    postedWithinDays: 7,
    sort: 'DD',
    platform: { experienceLevel: '4', workMode: '2', easyApply: 'true' },
  })
  assert.ok(url.includes('f_TPR=r604800'), `一周窗应拼 r604800（实测生效）：${url}`)
  assert.ok(url.includes('start=10'), `page=2 的 start 应为 10：${url}`)
  // 回归护栏：这四个参数在 guest 端点上被忽略（v2 实测），拼了就是骗配置界面
  for (const banned of ['f_E=', 'f_WT=', 'f_AL=', 'sortBy=']) {
    assert.ok(!url.includes(banned), `guest 端点忽略 ${banned}，不应出现在 URL：${url}`)
  }
})

test('空条件不带 keywords/location；host / pageSize 可被 DB 覆盖', () => {
  const url = buildLinkedInGuestApiUrl(DEFAULT_LINKEDIN_CONFIG, {})
  assert.ok(!url.includes('keywords='))
  assert.ok(!url.includes('location='))
  assert.ok(url.includes('start=0'))

  // 覆盖值刻意取 25（≠ 默认 10），否则测不出「覆盖真的生效」
  const config = mergeLinkedInConfig({ pageSize: 25 })
  const overridden = buildLinkedInGuestApiUrl(config, { keyword: 'Java', page: 2 })
  assert.ok(overridden.includes('start=25'), `自定义 pageSize 应改 start 步进：${overridden}`)
})

test('搜索页 URL（auth.checkUrl 用）：带 trk、同一套参数', () => {
  const url = buildLinkedInSearchUrl(DEFAULT_LINKEDIN_CONFIG, { keyword: 'Java' })
  assert.equal(
    url,
    `https://${HOST}/jobs/search/?keywords=Java&start=0&trk=${DEFAULT_LINKEDIN_CONFIG.guestTrk}`,
  )
})

// ── 解析（合成样本：按 base-card 族稳定结构构造，验证解析代码路径） ──────

const SYNTHETIC_DOC = `<html><body><ul class="jobs-search__results-list">
  <li>
    <div class="base-card relative job-search-card" data-entity-urn="urn:li:jobPosting:4098276354">
      <a class="base-card__full-link" href="/jobs/view/senior-java-engineer-at-acme-4098276354?position=1&amp;pageNum=0">Senior Java Engineer</a>
      <div class="base-search-card__info">
        <h3 class="base-search-card__title"><span>Senior Java Engineer</span></h3>
        <h4 class="base-search-card__subtitle"><a class="hidden-nested-link" href="/company/acme">Acme Corp</a></h4>
        <div class="base-search-card__metadata"><span class="job-search-card__location">Shanghai, China</span></div>
        <span class="job-search-card-salary-info">$120,000.00/yr - $150,000.00/yr</span>
      </div>
      <time class="job-search-card__listdate--new" datetime="2026-09-20">2 days ago</time>
    </div>
  </li>
  <li>
    <div class="base-card relative job-search-card">
      <a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/frontend-engineer-at-beta-4098111222">Frontend Engineer</a>
      <div class="base-search-card__info">
        <h3 class="base-search-card__title"><span>Frontend Engineer</span></h3>
        <h4 class="base-search-card__subtitle"><a class="hidden-nested-link">Beta GmbH</a></h4>
        <div class="base-search-card__metadata"><span class="job-search-card__location">Berlin, Germany</span></div>
      </div>
      <time class="job-search-card__listdate" datetime="2026-09-19">3 days ago</time>
    </div>
  </li>
  <li>
    <div class="base-card relative job-search-card" data-entity-urn="urn:li:jobPosting:4098000111">
      <a class="base-card__full-link" href="/jobs/view/4098000111">Data Analyst</a>
      <div class="base-search-card__info">
        <h3 class="base-search-card__title"><span>Data Analyst</span></h3>
        <div class="base-search-card__metadata"><span class="job-search-card__location">Singapore</span></div>
      </div>
    </div>
  </li>
</ul></body></html>`

test('解析（导航式 guest 文档）：urn 优先取 id、URL 兜底、薪资/ISO 日期/公司/地点锚定', async () => {
  const adapter = createLinkedInAdapter()
  const page = browserLikePage('<html><body></body></html>', GUEST_URL, guestDocOf(SYNTHETIC_DOC))
  await adapter.crawl.gotoSearch(page, { keyword: 'Java' })
  // 导航目标是 guest 端点（不是搜索页）—— 夹具页的地址就是证明
  assert.equal(page.url(), GUEST_URL)

  const jobs = await adapter.crawl.readListPage(page)
  assert.equal(jobs.length, 3)

  const first = jobs[0]
  assert.ok(first !== undefined)
  assert.equal(first?.platformJobId, '4098276354', 'id 优先取 data-entity-urn')
  assert.equal(first?.title, 'Senior Java Engineer')
  assert.equal(first?.company, 'Acme Corp')
  assert.equal(first?.city, 'Shanghai, China')
  assert.equal(first?.salaryRaw, '$120,000.00/yr - $150,000.00/yr')
  assert.equal(first?.publishedAt, '2026-09-20', 'datetime 属性是 ISO 日期，比相对文本更有用')
  assert.equal(first?.sourceUrl, `https://${HOST}/jobs/view/4098276354`, 'sourceUrl 规范成幂等形态')
  assert.deepEqual(first?.notes, undefined, '全锚中的卡不该有 notes')

  const second = jobs[1]
  assert.ok(second !== undefined)
  assert.equal(second?.platformJobId, '4098111222', '没有 urn 时从 /jobs/view/{slug}-{id} 抠 id')
  assert.equal(second?.company, 'Beta GmbH')
  assert.equal(second?.publishedAt, '2026-09-19')

  const third = jobs[2]
  assert.ok(third !== undefined)
  assert.equal(third?.company, '', '公司锚点不命中就留空 —— 不编')
  assert.ok((third?.notes ?? []).some((note) => note.includes('公司未锚定')), '缺失要记进 notes')
  assert.equal(third?.publishedAt, undefined, '无 time 节点就不给 publishedAt')
})

test('真实夹具：guest 文档解析 10 条、id/公司/地点/日期全中（2026-09-20 真机读数）', async () => {
  const fragment = readFileSync(join(process.cwd(), 'test', 'fixtures', 'linkedin-guest-fragment.html'), 'utf8')
  const adapter = createLinkedInAdapter()
  const page = browserLikePage('<html><body></body></html>', GUEST_URL, guestDocOf(fragment))
  await adapter.crawl.gotoSearch(page, { keyword: 'Software Engineer', city: 'China' })
  const jobs = await adapter.crawl.readListPage(page)

  assert.equal(jobs.length, 10, '当次真机读数：10 张卡片（也是 pageSize=10 的出处）')
  assert.ok(jobs.every((job) => job.platformJobId !== ''), 'urn:li:jobPosting id 应 10/10 命中')
  assert.ok(jobs.every((job) => job.company !== ''), '公司 10/10')
  assert.ok(jobs.every((job) => job.city !== undefined && job.city !== ''), '地点 10/10（含中文地点）')
  assert.ok(jobs.every((job) => job.publishedAt !== undefined && job.publishedAt !== ''), 'ISO 日期 10/10')

  const first = jobs[0]
  assert.ok(first !== undefined)
  assert.equal(first?.title, 'Senior Software Engineer')
  assert.equal(first?.company, 'Traveloka')
  assert.equal(first?.city, '上海市', '真实样本里的中文地点')
  assert.equal(first?.sourceUrl, `https://${HOST}/jobs/view/4430405159`)
  // 卡片链接的 href 落在 cn.linkedin.com（站点自己的回链）—— sourceUrl 规范到配置 host
  assert.ok(jobs.every((job) => !job.sourceUrl.includes('?')), 'sourceUrl 不带查询参数')
  // 翻页判据：真实页恰好满页（10 条）→ 有下一页
  assert.equal(await adapter.crawl.hasNextPage(page), true)
})

// ── 详情页解析（2026-09-20 v2 真机快照夹具） ─────────────────────────────

const DETAIL_FIXTURE = readFileSync(join(process.cwd(), 'test', 'fixtures', 'linkedin-detail.html'), 'utf8')

test('详情（真实快照夹具）：JD 全文 / 标题 / 公司 / 地点 / criteria 分发', async () => {
  const adapter = createLinkedInAdapter()
  assert.ok(adapter.detail !== undefined, 'detail 已按 v2 真机锚点落地')
  const page = browserLikePage(DETAIL_FIXTURE, `https://${HOST}/jobs/view/4430405159`)

  const parsed = await adapter.detail?.extract(page)
  assert.ok(parsed !== undefined)
  assert.equal(parsed?.title, 'Senior Software Engineer')
  assert.equal(parsed?.company, 'Traveloka')
  assert.equal(parsed?.city, '上海市')
  assert.ok((parsed?.jdText ?? '').includes('Traveloka'), 'JD 正文应含公司名')
  assert.ok((parsed?.jdText ?? '').length > 200, `JD 应是全文（真机快照 400+ 字）：实际 ${String(parsed?.jdText?.length)}`)
  assert.ok((parsed?.jdText ?? '').includes('scalable backend applications'), 'clamp 折叠是 CSS 层的事，textContent 是全文')
  assert.equal(parsed?.expReq, '中高级', 'criteria「职位级别」→ expReq')
  assert.ok(
    (parsed?.tags ?? []).some((tag) => tag.includes('职位性质') && tag.includes('全职')),
    `其余 criteria 进 tags：${JSON.stringify(parsed?.tags)}`,
  )
  assert.equal(parsed?.salaryRaw, '', '详情页真机无薪资 —— 留空是平台事实，不是解析失败')
})

// ── 翻页（满页判据；v2 真机：三页 10/10/10 零重叠） ──────────────────────

test('翻页：拉满 pageSize 条 → 有下一页；不满页 → 没有', async () => {
  const adapter = createLinkedInAdapter()
  const full = Array.from(
    { length: DEFAULT_LINKEDIN_CONFIG.pageSize },
    (_, i) =>
      `<li><div class="base-card" data-entity-urn="urn:li:jobPosting:40${String(10_000 + i)}">` +
      `<a class="base-card__full-link" href="/jobs/view/job-${String(10_000 + i)}">Job ${String(i)}</a>` +
      `<h3 class="base-search-card__title"><span>Job ${String(i)}</span></h3>` +
      `<h4 class="base-search-card__subtitle"><a>Co ${String(i)}</a></h4></div></li>`,
  ).join('')
  const pageFull = browserLikePage('<html><body></body></html>', GUEST_URL, guestDocOf(`<ul>${full}</ul>`))
  await adapter.crawl.gotoSearch(pageFull, { keyword: 'Java' })
  const jobs = await adapter.crawl.readListPage(pageFull)
  assert.equal(jobs.length, DEFAULT_LINKEDIN_CONFIG.pageSize)
  assert.equal(await adapter.crawl.hasNextPage(pageFull), true, '满页 = 大概率还有下一页')

  const pageShort = browserLikePage('<html><body></body></html>', GUEST_URL, guestDocOf(SYNTHETIC_DOC))
  await adapter.crawl.gotoSearch(pageShort, { keyword: 'Java' })
  await adapter.crawl.readListPage(pageShort)
  assert.equal(await adapter.crawl.hasNextPage(pageShort), false, '不满页 = 最后一批')

  // 空结果（真实空结果形态：文档里没有卡片）：不抛错、hasNextPage=false
  const pageEmpty = browserLikePage('<html><body></body></html>', GUEST_URL, guestDocOf(''))
  await adapter.crawl.gotoSearch(pageEmpty, { keyword: 'NoSuchJob123' })
  const empty = await adapter.crawl.readListPage(pageEmpty)
  assert.equal(empty.length, 0)
  assert.equal(await adapter.crawl.hasNextPage(pageEmpty), false)
})

// ── 判墙（地址级优先；登录墙只信地址，不信文案） ──────────────────────────

test('判墙：被 302 到 /authwall → login-required', async () => {
  const adapter = createLinkedInAdapter()
  const page = browserLikePage(
    '<html><body><h1>Sign in</h1><p>Join LinkedIn to get the most out of it</p></body></html>',
    'https://www.linkedin.com/authwall?trk=guest&sessionRedirect=%2Fjobs-guest%2F',
  )
  assert.equal(await adapter.guard.detectBlock(page), 'login-required')
})

test('判墙：/checkpoint/challenge 挑战页 → captcha', async () => {
  const adapter = createLinkedInAdapter()
  const page = browserLikePage(
    '<html><body><h1>Verification</h1></body></html>',
    'https://www.linkedin.com/checkpoint/challengeAnemiaRedirect',
  )
  assert.equal(await adapter.guard.detectBlock(page), 'captcha')
})

test('判墙：英文挑战/限流文案（词表条目必须无空白 —— compact 会去掉全部空白）', async () => {
  const adapter = createLinkedInAdapter()
  const captcha = browserLikePage("<html><body><div>Let's do a quick security check</div></body></html>")
  assert.equal(await adapter.guard.detectBlock(captcha), 'captcha')

  const rate = browserLikePage('<html><body><div>You have sent too many requests.</div></body></html>')
  assert.equal(await adapter.guard.detectBlock(rate), 'rate-limited')
})

test('判墙：游客页头本来就有 Sign in 按钮 —— 文案不该判登录墙（skipLoginWall）', async () => {
  const adapter = createLinkedInAdapter()
  // 有卡片：无论如何都不该判墙
  const withCards = browserLikePage(`<html><body><nav>Sign in Join now</nav>${SYNTHETIC_DOC}</body></html>`)
  assert.equal(await adapter.guard.detectBlock(withCards), null)
})

test('判墙：空白页 → blank；被挪到非预期域 → blank', async () => {
  const adapter = createLinkedInAdapter()
  const wiped = browserLikePage('<html><body><div> </div></body></html>')
  assert.equal(await adapter.guard.detectBlock(wiped), 'blank')

  // cn.linkedin.com 这类历史域重定向：host 与配置不符 → blank（地址级事实）
  const foreign = browserLikePage('<html><body><div>LinkedIn</div></body></html>', 'https://cn.linkedin.com/jobs')
  assert.equal(await adapter.guard.detectBlock(foreign), 'blank')
})

// ── 登录检测（2026-09-20 两侧真机证据：global-nav 我区 vs Sign in 按钮） ────

test('登录检测：已登录页（global-nav 我区头像）→ true；未登录页（只有 Sign in 按钮）→ false', async () => {
  const adapter = createLinkedInAdapter()
  assert.ok(adapter.auth !== undefined, 'auth 已于 2026-09-20 落地（两侧锚点证据）')
  assert.equal(adapter.auth.loginUrl, 'https://www.linkedin.com/login')
  assert.ok((adapter.auth.checkUrl ?? '').includes('/jobs/search'), '判据按搜索页校准 —— 登录页上没有 global-nav')

  const loggedIn = browserLikePage(
    `<html><body><header><nav class="global-nav">
      <div class="global-nav__me artdeco-dropdown"><img class="global-nav__me-photo evi-image ember-view" alt=""></div>
    </nav></header></body></html>`,
    'https://www.linkedin.com/jobs/search/?trk=x',
  )
  assert.equal(await adapter.auth?.isLoggedIn(loggedIn), true)

  const anonymous = browserLikePage(
    `<html><body><header><nav class="nav">
      <a class="nav__button-secondary btn-secondary-emphasis ml-3 btn-md" href="/login">Sign in</a>
    </nav></header></body></html>`,
    'https://www.linkedin.com/jobs/search/?trk=x',
  )
  assert.equal(await adapter.auth?.isLoggedIn(anonymous), false, '未登录侧：me 锚点 0 命中（真机两侧定案）')
})

// ── 薪资回填通道（2026-09-21 第三轮探针发现；默认关，DB 可开） ────────────

/** 登录态搜索页列表卡文档（按真机 actions-search-panel 快照的类名合成）：occludable 卡 + ¥ 薪资。 */
const PANEL_DOC = `<html><body><div class="jobs-search-results-list">
  <div class="job-card-container" data-occludable-job-id="4098000111">
    <a class="job-card-list__title--link" href="/jobs/view/4098000111">Data Analyst</a>
    <ul><li class="jVDYikdkEUKpihBiaAiheLNfuBZXssxrtmqk"><span dir="ltr">¥20K/月 - ¥27K/月</span></li></ul>
  </div>
  <div class="job-card-container" data-occludable-job-id="9999999999">
    <a class="job-card-list__title--link" href="/jobs/view/9999999999">别的岗位（无薪资节点）</a>
  </div>
</div></body></html>`

test('薪资回填（开启）：导航登录态搜索页、按 occludable id 只回填空薪资、自有薪资不覆盖', async () => {
  const adapter = createLinkedInAdapter({
    config: { ...DEFAULT_LINKEDIN_CONFIG, salaryPanelEnabled: true },
  })
  const visited: string[] = []
  const page = browserLikePage('<html><body></body></html>', 'about:blank', (url) => {
    visited.push(url)
    // guest 端点 → guest 文档；搜索页（回填通道）→ 登录态列表卡文档
    return url.includes('/jobs-guest/') ? SYNTHETIC_DOC : PANEL_DOC
  })
  await adapter.crawl.gotoSearch(page, { keyword: 'Java' })
  const jobs = await adapter.crawl.readListPage(page)

  assert.ok(
    visited.some((v) => v.includes('/jobs/search/')),
    `开启回填后应额外导航登录态搜索页：${visited.join(' ')}`,
  )
  // 第三卡（Data Analyst）guest 文档里无薪资 → 按 occludable id 回填命中
  const analyst = jobs.find((job) => job.platformJobId === '4098000111')
  assert.ok(analyst !== undefined)
  assert.equal(analyst.salaryRaw, '¥20K/月 - ¥27K/月', 'guest 通道无薪资，按 occludable id 回填')
  // 第一卡 guest 文档自带 $ 薪资 → 回填**不覆盖**（只回填空值）
  const senior = jobs.find((job) => job.platformJobId === '4098276354')
  assert.ok(senior !== undefined)
  assert.equal(senior.salaryRaw, '$120,000.00/yr - $150,000.00/yr', '自有薪资优先，回填不覆盖')

  // 翻页判据不受回填影响（仍按 guest 文档的条数）
  assert.equal(jobs.length, 3)
  assert.equal(await adapter.crawl.hasNextPage(page), false, '不满页（3 < 10）')
})

test('薪资回填（默认关）：不额外导航搜索页，guest 文档行为不变', async () => {
  const adapter = createLinkedInAdapter()
  const visited: string[] = []
  const page = browserLikePage('<html><body></body></html>', 'about:blank', (url) => {
    visited.push(url)
    return url.includes('/jobs-guest/') ? SYNTHETIC_DOC : PANEL_DOC
  })
  await adapter.crawl.gotoSearch(page, { keyword: 'Java' })
  const jobs = await adapter.crawl.readListPage(page)
  assert.ok(
    visited.every((v) => v.includes('/jobs-guest/')),
    `默认关闭时只应有 guest 导航：${visited.join(' ')}`,
  )
  const analyst = jobs.find((job) => job.platformJobId === '4098000111')
  assert.ok(analyst !== undefined)
  assert.equal(analyst.salaryRaw, '', '通道关闭：guest 无薪资就留空，不多导航一次')
})

// ── 收件箱（2026-09-21 actions 探针登录态真机结构） ──────────────────────

/** 按真机快照（actions-messaging-*.html）的会话卡结构合成 —— 字段名与真实 DOM 一致。 */
const MESSAGING_DOC = `<html><body>
  <ul class="list-style-none msg-conversations-container__conversations-list" aria-label="对话列表">
    <li class="ember-view scaffold-layout__list-item msg-conversation-listitem msg-conversations-container__convo-item">
      <div class="msg-conversation-card msg-conversations-container__pillar" id="conversation-card-ember48">
        <h3 class="msg-conversation-listitem__participant-names msg-conversation-card__participant-names">
          <div class="display-flex"><span class="truncate"> Zaira Bhatti </span></div>
        </h3>
        <time class="msg-conversation-listitem__time-stamp msg-conversation-card__time-stamp"> 3月19日 </time>
        <p class="msg-conversation-card__message-snippet"> Zaira发送了一个附件 </p>
      </div>
    </li>
    <li class="ember-view msg-conversation-listitem msg-conversations-container__convo-item">
      <div class="msg-conversation-card" id="conversation-card-ember77">
        <h3 class="msg-conversation-card__participant-names"><span> 李四 </span></h3>
        <p class="msg-conversation-card__message-snippet"> 谢谢你的关注 </p>
      </div>
    </li>
  </ul>
</body></html>`

test('readInbox：自导航到 Messaging、按真机会话卡结构解析、无 id 时兜底 name#index', async () => {
  const adapter = createLinkedInAdapter()
  assert.ok(adapter.actions?.readInbox !== undefined, 'readInbox 已按 2026-09-21 真机证据落地')

  const visited: string[] = []
  const page = browserLikePage('<html><body></body></html>', 'about:blank', (url) => {
    visited.push(url)
    return MESSAGING_DOC
  })
  const messages = await adapter.actions?.readInbox?.(page)

  assert.ok(visited.some((v) => v.includes('/messaging/')), `readInbox 应自导航到 Messaging：${visited.join(' ')}`)
  assert.equal(messages?.length, 2)
  const first = messages?.[0]
  assert.ok(first !== undefined)
  assert.equal(first?.hrName, 'Zaira Bhatti')
  assert.equal(first?.lastMessage, 'Zaira发送了一个附件')
  assert.equal(first?.at, '3月19日', '相对时间格式原样带出，由上层解释')
  assert.equal(first?.conversationId, 'conversation-card-ember48', 'conversationId 首选卡片自己的 id')
  assert.equal(first?.direction, 'hr', 'DOM 无方向标记 → 按「漏报比误报贵」记 hr（真机证据边界）')
  assert.equal(first?.unread, false, 'DOM 无未读标记（唯一的 notification-badge 是全局导航的）')
  assert.equal(first?.company, '', '会话卡是「人」维度，无公司字段')

  const second = messages?.[1]
  assert.ok(second !== undefined)
  assert.equal(second?.hrName, '李四')
  assert.equal(second?.conversationId, 'conversation-card-ember77')
  assert.equal(second?.at, null, '无 time 节点就给 null，不编')
})

test('readInbox（真实夹具）：登录态快照两卡逐字段钉住（2026-09-21 真机读数）', async () => {
  const adapter = createLinkedInAdapter()
  const fixture = readFileSync(join(process.cwd(), 'test', 'fixtures', 'linkedin-messaging.html'), 'utf8')
  const page = browserLikePage(fixture, 'about:blank', () => fixture)
  const messages = await adapter.actions?.readInbox?.(page)

  assert.equal(messages?.length, 2, '真机快照：2 条会话')
  const first = messages?.[0]
  assert.ok(first !== undefined)
  assert.equal(first?.hrName, 'Zaira Bhatti')
  assert.equal(first?.conversationId, 'conversation-card-ember48')
  assert.equal(first?.lastMessage, 'Zaira发送了一个附件')
  assert.equal(first?.at, '3月19日')
  assert.equal(first?.direction, 'hr')
  assert.equal(first?.unread, false)

  const second = messages?.[1]
  assert.ok(second !== undefined)
  assert.equal(second?.hrName, 'The LinkedIn Team')
  assert.equal(second?.conversationId, 'conversation-card-ember56')
  // 系统会话带「发自领英」pill —— textContent 原样带出（真实解析行为，如实钉住）
  assert.ok((second?.lastMessage ?? '').includes('欢迎使用领英'), `摘要应含正文：${String(second?.lastMessage)}`)
  assert.ok((second?.lastMessage ?? '').includes('发自领英'), 'pill 前缀也在 textContent 里 —— 真实形态')
  assert.equal(second?.at, '2025年12月14日')
})

test('readInbox：被弹到 authwall → 抛 login-required（0 条必须可信，绝不静默）', async () => {
  const adapter = createLinkedInAdapter()
  // goto 后夹具落点保持在 authwall（真机上未登录访问 /messaging/ 就是被弹到这里）
  const walled = browserLikePage('<html><body><h1>Sign in</h1></body></html>', 'https://www.linkedin.com/authwall?trk=x')
  await assert.rejects(
    adapter.actions?.readInbox?.(walled) ?? Promise.resolve([]),
    (error: unknown) => error instanceof Error && /登录墙/.test(error.message),
    'authwall 上 readInbox 应抛 PlatformBlockedError(login-required)，而不是返回 []',
  )
})

test('readInbox：容器缺失（不是 Messaging 页/选择器腐烂）→ 抛错而不是返回空数组', async () => {
  const adapter = createLinkedInAdapter()
  const page = browserLikePage('<html><body><div>别的页面</div></body></html>', 'about:blank', () => '<html><body><div>别的页面</div></body></html>')
  await assert.rejects(
    adapter.actions?.readInbox?.(page) ?? Promise.resolve([]),
    (error: unknown) => error instanceof Error && /容器未找到/.test(error.message),
    '容器缺失必须抛错 —— 空数组会被上层读成「今天没人回我」',
  )
})

// ── 自包含护栏与契约声明 ────────────────────────────────────────────────

test('护栏本身有效：引用闭包的函数重建后必然 ReferenceError', () => {
  const moduleScoped = 42
  const leaky = (): number => moduleScoped
  assert.throws(() => asSerialized(leaky)(), ReferenceError)
})

test('适配器声明符合平台事实：antiBot=high、免登录可搜、fieldCompleteness=medium、readInbox 落地', () => {
  const adapter = createLinkedInAdapter()
  assert.equal(adapter.id, 'linkedin')
  assert.equal(adapter.displayName, 'LinkedIn 领英')
  assert.equal(adapter.capabilities.searchWithoutLogin, true)
  assert.equal(adapter.capabilities.antiBot, 'high', '风控业内最强一档，界面要如实展示')
  assert.equal(adapter.capabilities.fieldCompleteness, 'medium', '真机 10/10 核心字段；薪资无源')
  assert.equal(adapter.capabilities.supportsGreeting, false)
  assert.equal(adapter.capabilities.supportsInbox, true, 'readInbox 已落地（2026-09-21 真机证据）—— 三轴一致性要求声明')
  assert.ok(adapter.actions !== undefined, 'actions 已落地 readInbox')
  assert.equal(adapter.actions?.sayHello, undefined, '不可逆动作无实测链路 → fail-closed')
  assert.equal(adapter.actions?.sendResume, undefined, 'Easy Apply 多步表单未取证 → fail-closed')
  assert.equal(adapter.actions?.readInbox !== undefined, true)
  assert.ok(adapter.auth !== undefined, '登录检测已按两侧真机证据落地')
  assert.ok(adapter.detail !== undefined, '详情解析已按 v2 真机锚点落地（游客 SSR 直出）')
  assert.equal(adapter.maxPages, 5)
  assert.equal(adapter.defaultMaxPages, 2)
  assert.equal(DEFAULT_LINKEDIN_CONFIG.pageSize, 10, '真机实测每页 10（不是社区文档说的 25）')
  assert.deepEqual(adapter.requiredFields, ['title', 'company', 'source_url'], '薪资无源，不进必需字段')
  const dimensionKeys = adapter.criteriaDimensions.map((item) => item.key)
  assert.deepEqual(
    dimensionKeys,
    ['keyword', 'city', 'postedWithinDays', 'maxPages'],
    '只声明 guest 端点真认的维度（v2 实测：f_E/f_WT/f_AL/sortBy 被忽略 → 不声明）',
  )
})

test('guest 端点 URL 是采集导航目标（criteria.buildSearchUrl 与 gotoSearch 同址）', async () => {
  const adapter = createLinkedInAdapter()
  const criteria = { keyword: 'Java', city: 'China', page: 2 }
  const url = adapter.criteria.buildSearchUrl(criteria)
  assert.ok(url !== null && url.includes('/jobs-guest/'), `buildSearchUrl 应给 guest 端点地址：${String(url)}`)

  // gotoSearch 确实导航到了该地址（导航式主通道）
  const visited: string[] = []
  const page = browserLikePage('<html><body></body></html>', 'about:blank', (url_) => {
    visited.push(url_)
    return SYNTHETIC_DOC
  })
  await adapter.crawl.gotoSearch(page, criteria)
  assert.ok(visited.some((v) => v.includes('/jobs-guest/') && v.includes('start=10')), `导航目标：${visited.join(' ')}`)
})
