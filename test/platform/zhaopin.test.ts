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
  buildTalkListUrl,
  createZhaopinAdapter,
  DEFAULT_ZHAOPIN_CONFIG,
  extractJobDetailInPage,
  mergeZhaopinConfig,
  ZHAOPIN_CITY_CODES,
  ZHAOPIN_MAX_PAGES,
  ZHAOPIN_SALARY_MASK,
  type ZhaopinConfig,
} from '../../src/host/platform/adapters/zhaopin.js'
import type { HumanMouse } from '../../src/host/platform/humanize.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const SEARCH_URL = 'https://www.zhaopin.com/sou/jl765?kw=Java'
const FIXTURE_HTML = readFileSync(
  join(import.meta.dirname, '..', 'fixtures', 'zhaopin-sz.html'),
  'utf8',
)
const DETAIL_URL = 'https://www.zhaopin.com/jobdetail/CC320762410J40890686210.htm'
const DETAIL_FIXTURE_HTML = readFileSync(
  join(import.meta.dirname, '..', 'fixtures', 'zhaopin-detail.html'),
  'utf8',
)

function page(html: string = FIXTURE_HTML): JsdomPage {
  return new JsdomPage({ html, url: SEARCH_URL })
}

function detailPage(html: string = DETAIL_FIXTURE_HTML): JsdomPage {
  return new JsdomPage({ html, url: DETAIL_URL })
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
  // 详情选择器同样是合并语义，未覆盖的键保留默认
  const mergedDetail = mergeZhaopinConfig({ detailSelectors: { jdText: '.custom-jd' } })
  assert.equal(mergedDetail.detailSelectors.jdText, '.custom-jd')
  assert.equal(
    mergedDetail.detailSelectors.title,
    DEFAULT_ZHAOPIN_CONFIG.detailSelectors.title,
    '未覆盖的详情选择器应保留默认',
  )
  // 会话页同理（readInbox / detectStage 用）
  const mergedIm = mergeZhaopinConfig({ imSelectors: { sessionRow: '.custom-session' } })
  assert.equal(mergedIm.imSelectors.sessionRow, '.custom-session')
  assert.equal(mergedIm.imSelectors.badge, DEFAULT_ZHAOPIN_CONFIG.imSelectors.badge)
  assert.equal(mergedIm.talkListApi, DEFAULT_ZHAOPIN_CONFIG.talkListApi)
})

// ── 收件箱（2026-09-18 登录态实测：getTalkList 接口）──────────────────

/**
 * 会话行夹具：**A 行照实测原样**（`test/tools/probe-zhaopin-login.ts` 采到的那条，
 * 「已发送附件简历」、selfReply=1、senderId===userId）；
 * **B 行是构造的** —— 用来测"HR 发来的未读"这一档（该账号实测时没有这样的样本，
 * 所以 B 行的字段组合**没有实测依据**，它只保证解析逻辑对，不证明线上就是这形状）。
 */
const TALK_ROW_ME = {
  sessionid: '5da2f5329b907c648fb682182f88c540',
  peerPartnerId: '1265452585',
  staffName: '邓亚芳',
  companyName: '深圳市威腾白猫科技',
  jobTitle: '餐饮服务员兼职',
  jobNumber: 'CC657755130J40874315311',
  text: '已发送附件简历',
  unreadCount: 0,
  sendTime: 1789754924259,
  userId: 1104065197,
  senderId: 1104065197,
  oppositeRead: 0,
  oppositeReply: 0,
  selfRead: 0,
  selfReply: 1,
}
const TALK_ROW_HR = {
  ...TALK_ROW_ME,
  sessionid: 'conv-hr-1',
  peerPartnerId: '999000111',
  staffName: '李先生',
  companyName: '另一家公司',
  jobTitle: '前端工程师',
  jobNumber: 'CC000000000J00000000001',
  text: '方便聊聊吗？',
  unreadCount: 2,
  senderId: 999000111,
  selfReply: 0,
}

function talkPage(options: {
  payload?: unknown
  /** 按 URL 给不同响应（翻页用例用）。 */
  payloadFor?: (url: string) => unknown
  fail?: string
  status?: number
  /** 记录实际请求过的 URL（断言"翻了几页"）。 */
  urls?: string[]
}): JsdomPage {
  return new JsdomPage({
    html: `<html><body><div class="im-container"></div></body></html>`,
    url: DEFAULT_ZHAOPIN_CONFIG.imUrl,
    fetchStub: async (url) => {
      options.urls?.push(url)
      if (options.fail !== undefined) throw new Error(options.fail)
      return {
        status: options.status ?? 200,
        ok: true,
        json: async () =>
          options.payloadFor === undefined ? options.payload : options.payloadFor(url),
      }
    },
  })
}

/** 从接口 URL 里取 pageNo（翻页用例用）。 */
function pageNoOf(url: string): number {
  return Number(/pageNo=(\d+)/.exec(url)?.[1] ?? '1')
}

test('readInbox：接口返回 → 逐条映射（方向靠 senderId===userId 判）', async () => {
  const adapter = createZhaopinAdapter()
  const page = talkPage({ payload: { code: 200, data: [TALK_ROW_ME, TALK_ROW_HR] } })

  const inbox = await adapter.actions?.readInbox?.(page)

  assert.equal(inbox?.length, 2)
  const [me, hr] = inbox ?? []
  assert.equal(me?.conversationId, '5da2f5329b907c648fb682182f88c540')
  assert.equal(me?.hrName, '邓亚芳')
  assert.equal(me?.company, '深圳市威腾白猫科技')
  assert.equal(me?.lastMessage, '已发送附件简历')
  assert.equal(me?.platformJobId, 'CC657755130J40874315311')
  assert.equal(me?.direction, 'me', 'senderId === userId ⇒ 最后一条是我发的')
  assert.equal(me?.unread, false)
  assert.equal(me?.at, new Date(1789754924259).toISOString())
  assert.equal(hr?.direction, 'hr', 'senderId ≠ userId ⇒ HR 发的')
  assert.equal(hr?.unread, true, 'unreadCount > 0 ⇒ 未读')
})

test('readInbox：接口说 code≠200 → **抛错**，绝不返回空数组', async () => {
  const adapter = createZhaopinAdapter()
  const page = talkPage({ payload: { code: 401, message: '登录已失效', data: null } })

  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(page),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes('code=401'), error.message)
      return true
    },
    '把"读不到"变成"没人回我"是这条链路上最贵的谎',
  )
})

test('readInbox：接口调不通（fetch 抛错）→ 抛错；形状变了 → 也抛错', async () => {
  const adapter = createZhaopinAdapter()

  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(talkPage({ fail: '网络断了' })),
    (error: unknown) => error instanceof Error && error.message.includes('网络断了'),
  )

  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(talkPage({ payload: { code: 200, data: {} } })),
    (error: unknown) => error instanceof Error && error.message.includes('形状变了'),
  )
})

test('readInbox：code 200 + data:[] → 这才是**可信的 0 条**', async () => {
  const adapter = createZhaopinAdapter()
  const inbox = await adapter.actions?.readInbox?.(talkPage({ payload: { code: 200, data: [] } }))
  assert.deepEqual(inbox, [])
})

test('readInbox：会话行缺 userId/senderId → 抛错（方向不敢猜）', async () => {
  const adapter = createZhaopinAdapter()
  const broken = { ...TALK_ROW_ME, userId: 0 }
  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(talkPage({ payload: { code: 200, data: [broken] } })),
    (error: unknown) => error instanceof Error && error.message.includes('方向判定必须重校'),
  )
})

test('readInbox：会话多于一页 → 翻页读完，某页不满一页就停手', async () => {
  const adapter = createZhaopinAdapter({
    config: { ...DEFAULT_ZHAOPIN_CONFIG, talkListPageSize: 2, talkListMaxPages: 5 },
  })
  const urls: string[] = []
  const page = talkPage({
    urls,
    payloadFor: (url) => {
      const sizes: Record<number, number> = { 1: 2, 2: 2, 3: 1 }
      const starts: Record<number, number> = { 1: 1, 2: 3, 3: 5 }
      const pageNo = pageNoOf(url)
      const n = sizes[pageNo] ?? 0
      const start = starts[pageNo] ?? 99
      return {
        code: 200,
        data: Array.from({ length: n }, (_, index) => ({
          ...TALK_ROW_ME,
          sessionid: `conv-${String(start + index)}`,
        })),
      }
    },
  })

  const inbox = await adapter.actions?.readInbox?.(page)

  assert.equal(inbox?.length, 5, '三页加起来 5 条（2+2+1）')
  assert.equal(urls.length, 3, '第 3 页只有 1 条（不满一页）→ 就该停手，不该再翻')
})

test('readInbox：同一条会话出现在两页里 → 只留一条（翻页期间会话会挪页）', async () => {
  const adapter = createZhaopinAdapter({
    config: { ...DEFAULT_ZHAOPIN_CONFIG, talkListPageSize: 2, talkListMaxPages: 3 },
  })
  const page = talkPage({
    payloadFor: (url) => {
      const pageNo = pageNoOf(url)
      const ids = pageNo === 1 ? ['c1', 'c2'] : pageNo === 2 ? ['c2', 'c3'] : []
      return { code: 200, data: ids.map((sid) => ({ ...TALK_ROW_ME, sessionid: sid })) }
    },
  })

  const inbox = await adapter.actions?.readInbox?.(page)

  assert.equal(inbox?.length, 3, 'c1/c2/c3 各一条 —— c2 在两页里都出现也只算一次')
})

test('readInbox：**翻页中某一页失败** → 抛错（不许把"读到一半"当读完了）', async () => {
  const adapter = createZhaopinAdapter({
    config: { ...DEFAULT_ZHAOPIN_CONFIG, talkListPageSize: 2, talkListMaxPages: 3 },
  })
  const page = talkPage({
    payloadFor: (url) => {
      if (pageNoOf(url) === 2) return { code: 500, message: '服务端错误', data: null }
      return {
        code: 200,
        data: [{ ...TALK_ROW_ME, sessionid: 'c1' }, { ...TALK_ROW_ME, sessionid: 'c2' }],
      }
    },
  })

  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(page),
    (error: unknown) => error instanceof Error && error.message.includes('第 2 页'),
  )
})

test('talkList 接口地址带上实测的那几个 query 键（不带 at/rt —— 实测非必需）', () => {
  const url = buildTalkListUrl(DEFAULT_ZHAOPIN_CONFIG, 2)
  for (const key of ['pageNo=2', 'PageSize=20', 'pageSize=20', 'sessionType=1', 'imMessageListType=1', 'communicateStatusType=0']) {
    assert.ok(url.includes(key), `缺少 ${key}：${url}`)
  }
  assert.ok(!url.includes('at='), '实测「仅 cookie」就能读，不该把 token 拼进 URL')
})

// ── 阶段探测（同一份会话列表）────────────────────────────────────────

test('detectStage：有未读 → replied；我发过且对方没读没回 → delivered', async () => {
  const adapter = createZhaopinAdapter()
  const page = talkPage({ payload: { code: 200, data: [TALK_ROW_ME, TALK_ROW_HR] } })

  const mine = await adapter.actions?.detectStage?.(page, {
    title: '餐饮服务员兼职',
    company: '深圳市威腾白猫科技',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/CC657755130J40874315311.htm',
  })
  assert.equal(mine, 'delivered', 'selfReply=1 且 oppositeRead/Reply 都是 0 ⇒ 我发出去了、对方还没读')

  const replied = await adapter.actions?.detectStage?.(page, {
    title: '前端工程师',
    company: '另一家公司',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/x.htm',
  })
  assert.equal(replied, 'replied', '有未读 ⇒ HR 回过话')
})

test('detectStage：列表里没有这个岗位 → null（**不是** none）；接口挂了 → 也 null', async () => {
  const adapter = createZhaopinAdapter()
  const page = talkPage({ payload: { code: 200, data: [TALK_ROW_ME] } })

  const missing = await adapter.actions?.detectStage?.(page, {
    title: '查无此岗',
    company: '查无此司',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/y.htm',
  })
  // 「从没接触过」与「会话被平台归档」在这里分不清 —— 写成 none 就是记错账
  assert.equal(missing, null)

  const broken = await adapter.actions?.detectStage?.(talkPage({ fail: '超时' }), {
    title: '餐饮服务员兼职',
    company: '深圳市威腾白猫科技',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/CC657755130J40874315311.htm',
  })
  assert.equal(broken, null, '判不出来就返回 null（契约允许），不猜')
})

test('detectStage：状态字段全是 0（判不出来）→ null', async () => {
  const adapter = createZhaopinAdapter()
  const blank = { ...TALK_ROW_ME, selfReply: 0, selfRead: 0 }
  const page = talkPage({ payload: { code: 200, data: [blank] } })
  const stage = await adapter.actions?.detectStage?.(page, {
    title: '餐饮服务员兼职',
    company: '深圳市威腾白猫科技',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/CC657755130J40874315311.htm',
  })
  assert.equal(stage, null)
})

test('detectStage：**不靠** oppositeRead/oppositeReply 判阶段（实测语义与命名不符）', async () => {
  const adapter = createZhaopinAdapter()
  // 「对方已读/已回」都标成 1，但没有未读、我方也没发过任何东西
  const weird = { ...TALK_ROW_ME, unreadCount: 0, selfReply: 0, oppositeRead: 1, oppositeReply: 1 }
  const page = talkPage({ payload: { code: 200, data: [weird] } })

  const stage = await adapter.actions?.detectStage?.(page, {
    title: '餐饮服务员兼职',
    company: '深圳市威腾白猫科技',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/CC657755130J40874315311.htm',
  })

  // 实测：第 1 页 11 条会话里这两个字段**全是 0**，连有 2 条未读的会话也是 0 ——
  // 也就是说它们并不表示"对方已读/已回"。用它们判阶段就会把"HR 已回复"说成"没回复"，
  // 所以这里刻意返回 null（判不出来），而不是拿它们当判据。
  assert.equal(stage, null)
})

test('detectStage：有未读时，即使 oppositeReply 是 0 也判 replied', async () => {
  const adapter = createZhaopinAdapter()
  const row = { ...TALK_ROW_ME, unreadCount: 3, oppositeReply: 0, oppositeRead: 0, selfReply: 0 }
  const page = talkPage({ payload: { code: 200, data: [row] } })

  const stage = await adapter.actions?.detectStage?.(page, {
    title: '餐饮服务员兼职',
    company: '深圳市威腾白猫科技',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/CC657755130J40874315311.htm',
  })
  assert.equal(stage, 'replied', '未读 = HR 发来的消息 ⇒ 对方回过话（这是唯一有样本的判据）')
})

test('detectStage：优先按**岗位号**匹配 —— 公司名/岗位名被平台改写也判得出来', async () => {
  const adapter = createZhaopinAdapter()
  // 会话行里的名字都被平台改写过（加后缀/括号），只有 jobNumber 没变
  const rewritten = {
    ...TALK_ROW_HR,
    companyName: '深圳市威腾白猫科技有限公司（已认证）',
    jobTitle: '餐饮服务员（兼职）',
  }
  const page = talkPage({ payload: { code: 200, data: [rewritten] } })

  const stage = await adapter.actions?.detectStage?.(page, {
    title: '餐饮服务员兼职',
    company: '深圳市威腾白猫科技',
    sourceUrl: 'https://www.zhaopin.com/jobdetail/CC000000000J00000000001.htm',
  })
  assert.equal(stage, 'replied', '会话行的 jobNumber 就是详情 URL 里那个 id —— 这条判据比名字稳')
})


// ── 投递（页面驱动 + DOM 送达验证）──────────────────────────────────

/**
 * 投递页夹具。
 *
 * ⚠️ 成功弹窗默认是**隐藏的**（`display:none`）—— 真页面里那个弹窗模板**一直在 DOM 里**，
 * 这正是 `applySuccessInPage` 必须同时看"可见"和"文案"的原因。
 */
function applyHtml(options: { entryText?: string; modal?: 'success' | 'other' | 'none' }): string {
  const kind = options.modal ?? 'none'
  const modal =
    kind === 'none'
      ? ''
      : `<div class="deliver-greeting-modal" style="display:none"><div class="deliver-greeting-modal__box">` +
        `<div class="deliver-greeting-modal__title">${
          kind === 'success' ? '已向对方发送简历和打招呼语' : '请先完善简历'
        }</div></div></div>`
  const entry =
    options.entryText === undefined
      ? ''
      : `<div class="summary-planes__action"><button type="button" class="a-button">${options.entryText}</button></div>`
  return `<html><body><div class="summary-planes__right">
    <button class="summary-planes__prechat">先聊聊</button>${entry}</div>${modal}</body></html>`
}

/** 模拟平台对这次点击的响应：把成功弹窗显示出来（自包含）。 */
function showSuccessModalInPage(): void {
  const node = document.querySelector('.deliver-greeting-modal') as unknown as {
    style: { display: string }
  } | null
  if (node !== null) node.style.display = ''
}

/** 造一个带 CDP 鼠标（可观察点击）的投递页。 */
function applyPage(options: {
  html: string
  interaction?: 'full' | 'none'
  onClick?: () => void
  /** `goto` 之后实际落在哪个 URL（模拟"直接被弹到登录页"）。 */
  landOn?: string
  /** 点击之后落在哪个 URL（模拟"点了才被弹到登录页"）。 */
  landAfterClick?: string
}): { page: PageLike; counter: { ups: number } } {
  const inner = new JsdomPage({ html: options.html, url: DETAIL_URL, layout: true })
  const counter = { ups: 0 }
  const mouse: HumanMouse = {
    async move(): Promise<void> {
      /* no-op */
    },
    async down(): Promise<void> {
      /* no-op */
    },
    async up(): Promise<void> {
      counter.ups += 1
      // 模拟"点完之后平台把页面重定向到登录页"：真的改一次 URL（DOM 不变，够用了）
      if (options.landAfterClick !== undefined) await inner.goto(options.landAfterClick)
      if (options.onClick !== undefined) {
        await inner.evaluate(asSerialized(options.onClick as () => void), undefined as never)
      }
    },
  }
  const page: PageLike = {
    goto: async (url) => {
      await inner.goto(options.landOn ?? url)
    },
    url: () => inner.url(),
    waitForTimeout: (ms) => inner.waitForTimeout(ms),
    waitForSelector: (selector, timeoutMs) => inner.waitForSelector(selector, timeoutMs),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> => {
      const rebuilt = asSerialized(fn as unknown as (...args: never[]) => unknown)
      return await inner.evaluate(rebuilt as unknown as (value: A) => R, arg)
    },
    ...(options.interaction === 'none' ? {} : { mouse }),
  }
  return { page, counter }
}

const APPLY_JOB = {
  title: '餐饮服务员兼职',
  company: '深圳市威腾白猫科技',
  sourceUrl: DETAIL_URL,
}

test('sendResume：入口是「立即投递」→ 真鼠标点击 → 看到成功弹窗 = delivered', async () => {
  const adapter = createZhaopinAdapter()
  const { page, counter } = applyPage({
    html: applyHtml({ entryText: '立即投递', modal: 'success' }),
    onClick: showSuccessModalInPage,
  })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, null)

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered')
  assert.equal(result?.evidence, 'dom')
  assert.equal(counter.ups, 1, '必须走真鼠标（三段式），而不是 DOM click')
})

test('sendResume：入口文案是「继续沟通」（已投过/已沟通）→ **一个字都不点**', async () => {
  const adapter = createZhaopinAdapter()
  const { page, counter } = applyPage({
    html: applyHtml({ entryText: '继续沟通', modal: 'success' }),
    onClick: showSuccessModalInPage,
  })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, null)

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok((result?.message ?? '').includes('已经投过或已经沟通过'), result?.message)
  assert.equal(counter.ups, 0, '已投过的岗位绝不能再点一下 —— 那是重复投递')
})

test('sendResume：点了但成功弹窗没显示 → pending +「别立刻重试」', async () => {
  const adapter = createZhaopinAdapter()
  // 弹窗元素在 DOM 里但一直隐藏（真页面就是这种"模板常驻"的形态）
  const { page, counter } = applyPage({ html: applyHtml({ entryText: '立即投递', modal: 'success' }) })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, null)

  assert.equal(counter.ups, 1, '这一下确实点了')
  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'pending', '点了但没确认 —— 不能报 delivered')
  assert.ok((result?.message ?? '').includes('不要立刻重试'), result?.message)
})

test('sendResume：弹窗文案不是"已发送简历" → 也不能算成功', async () => {
  const adapter = createZhaopinAdapter()
  const { page } = applyPage({
    html: applyHtml({ entryText: '立即投递', modal: 'other' }),
    onClick: showSuccessModalInPage,
  })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, null)

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'pending')
  assert.ok((result?.message ?? '').includes('没能确认成功'), result?.message)
})

test('sendResume：本地文件 → fail-closed（智联只认平台内简历），且不点任何东西', async () => {
  const adapter = createZhaopinAdapter()
  const { page, counter } = applyPage({ html: applyHtml({ entryText: '立即投递', modal: 'success' }) })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, 'D:/resume.pdf')

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok((result?.message ?? '').includes('平台内简历'), result?.message)
  assert.equal(counter.ups, 0)
})

test('sendResume：没有 CDP 鼠标 / 页面上找不到入口 → 都如实失败', async () => {
  const adapter = createZhaopinAdapter()

  const noMouse = await adapter.actions?.sendResume?.(
    applyPage({ html: applyHtml({ entryText: '立即投递' }), interaction: 'none' }).page,
    APPLY_JOB,
    null,
  )
  assert.equal(noMouse?.ok, false)
  assert.ok((noMouse?.message ?? '').includes('CDP'), noMouse?.message)

  const noEntry = await adapter.actions?.sendResume?.(
    applyPage({ html: applyHtml({}) }).page,
    APPLY_JOB,
    null,
  )
  assert.equal(noEntry?.ok, false)
  assert.ok((noEntry?.message ?? '').includes('找不到投递入口'), noEntry?.message)
})

test('sendResume：没登录（直接落在登录页）→ missing，且**一个字都不点**', async () => {
  const adapter = createZhaopinAdapter()
  // 实测（probe:zhaopin-anon）：未登录时详情页**照样有**「立即投递」按钮 ——
  // 只看"入口在不在"会真点下去，然后撞登录墙，最后报一条吓人的 pending。
  const { page, counter } = applyPage({
    html: applyHtml({ entryText: '立即投递', modal: 'success' }),
    landOn: 'https://passport.zhaopin.com/login?BkUrl=https%3A%2F%2Fi.zhaopin.com%2Fim',
  })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, null)

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.equal(counter.ups, 0, '登录墙挡着，点它是白点')
  assert.ok((result?.message ?? '').includes('登录页'), result?.message)
})

test('sendResume：点了之后才被弹到登录页 → missing（**不是** pending）', async () => {
  const adapter = createZhaopinAdapter()
  const { page, counter } = applyPage({
    html: applyHtml({ entryText: '立即投递', modal: 'success' }),
    landAfterClick: 'https://passport.zhaopin.com/login?BkUrl=https%3A%2F%2Fi.zhaopin.com%2Fim',
  })

  const result = await adapter.actions?.sendResume?.(page, APPLY_JOB, null)

  assert.equal(counter.ups, 1)
  assert.equal(result?.ok, false)
  // 登录墙挡在前面 ⇒ 这次点击**肯定没投出去**。报 pending（"别急着重试"）是假警报。
  assert.equal(result?.delivery, 'missing', '落在登录页 = 没投出去，不该报"待确认"')
  assert.ok((result?.message ?? '').includes('没有投出去'), result?.message)
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

// ── 详情页解析 ────────────────────────────────────────────────────────

test('详情页：借载荷解析出完整 RawJobDetail（jdText 全文，薪资不被 DOM 掩码污染）', async () => {
  const adapter = createZhaopinAdapter()
  const detail = (await adapter.detail?.extract(detailPage())) ?? null
  assert.ok(detail)
  assert.equal(detail.platformJobId, 'CC320762410J40890686210')
  assert.equal(detail.title, 'java开发（南网电力）')
  assert.equal(detail.salaryRaw, '1-1.1万', '薪资来自载荷真值，不是 DOM 的 **-**元')
  assert.equal(detail.expReq, '3-5年')
  assert.equal(detail.eduReq, '本科')
  assert.ok((detail.jdText ?? '').includes('电网管理平台开发'), 'JD 全文')
  assert.ok((detail.jdText ?? '').includes('SpringBoot'))
  assert.equal(detail.company, '北京宏天信业信息技术股份有限公司')
  assert.equal(detail.companySize, '100-299人', '公司标签 li[1] = 规模')
  assert.equal(detail.industry, '软件/IT服务', '公司标签 li[2] = 行业')
  assert.equal(detail.companyNature, '未融资', '公司标签 li[0] = 融资状态')
  assert.equal(detail.sourceUrl, 'https://www.zhaopin.com/jobdetail/CC320762410J40890686210.htm')
  assert.ok(detail.tags?.includes('五险一金'), '福利标签来自载荷 welfareTags')
})

test('详情页：载荷缺失时退 DOM，且不把掩码薪资当真值', async () => {
  // 去掉整份载荷 → title/JD/公司退 DOM；薪资留空（DOM 是 **-**元，不许回流成 salaryRaw）
  const html = DETAIL_FIXTURE_HTML.replace(/<script>__INITIAL_STATE__[\s\S]*?<\/script>/, '')
  const adapter = createZhaopinAdapter()
  const detail = (await adapter.detail?.extract(detailPage(html))) ?? null
  assert.ok(detail)
  assert.equal(detail.title, 'java开发（南网电力）', 'DOM H1.summary-planes__title')
  assert.ok((detail.jdText ?? '').includes('电网管理平台开发'), 'DOM .describtion-card__detail-content 的 textContent 即全文')
  assert.equal(detail.companySize, '100-299人')
  assert.equal(detail.salaryRaw, '', '载荷没了 + DOM 掩码 → 留空，不写 **-**元')
  assert.equal(detail.platformJobId, 'CC320762410J40890686210', '岗位 id 只来自 URL，与载荷无关')
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

test('详情页函数按源码重建后仍能解析（自包含 + 读 location.href 的 id）', async () => {
  const rebuilt = asSerialized(extractJobDetailInPage)
  const detailPage = new JsdomPage({ html: DETAIL_FIXTURE_HTML, url: DETAIL_URL })
  const detail = (await detailPage.evaluate(rebuilt, DEFAULT_ZHAOPIN_CONFIG)) as unknown as Record<string, unknown> | null
  assert.ok(detail)
  assert.equal(detail.platformJobId, 'CC320762410J40890686210', '重建后仍能读 location.href 里的岗位 id')
  assert.ok(String(detail.jdText).includes('SpringBoot'), '重建后仍能解析载荷 JD 全文')
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
  // （2026-09-18 实测把原因钉死了：智联没有独立的打招呼动作，IM 发送走网易云信私有 WS）
  assert.equal(adapter.capabilities.supportsGreeting, false)
  // 收件箱 2026-09-18 落地（实测 11 条会话 + getTalkList 接口）
  assert.equal(adapter.capabilities.supportsInbox, true)
  // 平台支持附件简历（preparation 返回 isShowAttachmentSelect + attachmentResumeInfo.fileList）
  assert.equal(adapter.capabilities.supportsAttachment, true)
  // 只读两项 + 投递（页面驱动）已实现；**打招呼仍然刻意不做** ——
  // 智联没有独立的打招呼动作，IM 发送走网易云信私有 WS，编一个只会乱点
  assert.equal(typeof adapter.actions?.readInbox, 'function')
  assert.equal(typeof adapter.actions?.detectStage, 'function')
  assert.equal(typeof adapter.actions?.sendResume, 'function')
  assert.equal(adapter.actions?.sayHello, undefined, '打招呼在智联做不了（没有独立动作 + IM 私有协议）')
})
