/**
 * 51job「高危动作 + 详情页」离线回归：打招呼 / 投递 / 收件箱 / 探阶段 / 详情解析。
 *
 * 对标 `zhipin-actions.test.ts` 的三件事：
 *
 *   1. **送达语义不撒谎**：只有会话里真的出现那条消息才算 `delivered`；
 *      没确认到一律 `missing`（宁可漏记，也不能把"点了按钮"当成"发出去了"）；
 *   2. **fail-closed**：页面没有 CDP 输入面（`page.mouse` / `page.keyboard`）时
 *      直接返回失败，**绝不退回 DOM `el.click()`**（§7.2 站点规则）；
 *   3. **入口形态如实上报**：51job 特有的「去聊聊」未登录形态是**微信扫码弹层**
 *      （真实夹具实测）—— 必须报成"没有可输入面、消息未发出"，而不是当成已发送。
 *
 * 夹具是**合成 HTML**：投递弹窗 / 沟通入口的结构照真实夹具 `51job-sz.html` 的
 * 实证类名还原（`button.btn.apply` / `.apply-component-resume-dialog` /
 * `.pc-apply-resume__row` / `.chat` / `.chat-popover`）；登录态站内会话的 DOM
 * 按候选选择器合成 —— 真实登录夹具到位后，这些用例负责保证"别在改选择器时把语义改坏"。
 *
 * ⚠️ 所有页面函数都经 `asSerialized` **按源码重建**后执行（模拟 Playwright 的序列化）：
 *    新增的任何页面函数若引用模块作用域的值，这里会当场 ReferenceError。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFiftyOneAdapter } from '../../src/host/platform/adapters/fiftyone-job/index.js'
import {
  DEFAULT_FIFTYONE_CONFIG,
  type FiftyOneConfig,
} from '../../src/host/platform/adapters/fiftyone-job/config.js'
import type { HumanKeyboard, HumanMouse } from '../../src/host/platform/humanize.js'
import type { PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const JOB_URL = 'https://jobs.51job.com/all/173674707.html'
const GREETING = '您好，我有五年全栈经验，和这个岗位挺匹配的，方便聊聊吗？'

/** 测试用配置：关掉拟人停留、把等待压到最小。 */
const FAST_CONFIG: FiftyOneConfig = {
  ...DEFAULT_FIFTYONE_CONFIG,
  dwellBeforeGreetMs: [0, 0],
  dwellBeforeReplyMs: [0, 0],
  dwellBeforeApplyMs: [0, 0],
  actionWaitMs: 200,
  deliveryPoll: { attempts: 3, intervalMs: 0 },
}

function asSerialized<F extends (...args: never[]) => unknown>(fn: F): F {
  return new Function(`return (${String(fn)})`)() as F
}

class RecordingMouse implements HumanMouse {
  readonly moves: Array<[number, number]> = []
  downs = 0
  ups = 0

  /** 点击（抬起）之后的动作：用来模拟"平台对这次点击的响应"。 */
  constructor(private readonly afterClick?: () => Promise<void>) {}

  async move(x: number, y: number): Promise<void> {
    this.moves.push([x, y])
  }

  async down(): Promise<void> {
    this.downs += 1
  }

  async up(): Promise<void> {
    this.ups += 1
    await this.afterClick?.()
  }
}

interface ActionPageOptions {
  html: string
  url: string
  /** 交互面：`'full'` = 有 mouse+keyboard；`'none'` = 都没有（fail-closed 用例）。 */
  interaction?: 'full' | 'none'
  /** 按 URL 换内容（多页测试）。 */
  loader?: (url: string) => string | undefined
  /** 点击之后在页面里执行的**自包含**函数（模拟平台对点击的响应）。 */
  afterClick?: (arg: never) => void
  /** afterClick 的入参（`asSerialized` 会丢闭包，preset 之类的值只能从这里传）。 */
  afterClickArg?: unknown
}

/**
 * 造一个带 CDP 输入面的离线页面（evaluate 一律按源码重建 —— 专抓不自包含的页面函数）。
 *
 * `keyboard.press('Enter')` 会把"输入框里累计的文本"渲染成一条自己的消息 ——
 * 这是离线夹具里唯一能触发"消息出现"这件事的手段，也让送达校验有东西可校验。
 */
function actionPage(options: ActionPageOptions): { page: PageLike; mouse: RecordingMouse; typed: string[] } {
  const inner = new JsdomPage({
    html: options.html,
    url: options.url,
    layout: true,
    ...(options.loader === undefined ? {} : { loader: options.loader }),
  })
  const mouse = new RecordingMouse(
    options.afterClick === undefined
      ? undefined
      : async () => {
          await inner.evaluate(
            asSerialized(options.afterClick as () => void),
            (options.afterClickArg ?? undefined) as never,
          )
        },
  )
  const typed: string[] = []
  let buffer = ''

  const keyboard: HumanKeyboard = {
    async press(key: string): Promise<void> {
      if (key === 'Backspace') {
        buffer = ''
        return
      }
      if (key === 'Enter') {
        const text = buffer
        buffer = ''
        if (text !== '') {
          await inner.evaluate(asSerialized(appendOwnMessageInPage), { text })
        }
        return
      }
      /* KeyA / 功能键：离线夹具无需处理 */
    },
    async insertText(text: string): Promise<void> {
      buffer += text
      typed.push(text)
    },
    async down(): Promise<void> {
      /* no-op */
    },
    async up(): Promise<void> {
      /* no-op */
    },
  }

  const page: PageLike = {
    goto: (target) => inner.goto(target),
    url: () => inner.url(),
    waitForTimeout: (ms) => inner.waitForTimeout(ms),
    waitForSelector: (selector, timeoutMs) => inner.waitForSelector(selector, timeoutMs),
    evaluate: async <R, A>(fn: (arg: A) => R, arg: A): Promise<R> => {
      const rebuilt = asSerialized(fn as unknown as (...args: never[]) => unknown)
      return await inner.evaluate(rebuilt as unknown as (value: A) => R, arg)
    },
    ...(options.interaction === 'none'
      ? {}
      : {
          mouse,
          keyboard,
          setInputFiles: async (_selector: string, _filePaths: readonly string[]): Promise<void> => {
            /* 记录与否不影响本组用例（本地文件路径是 fail-closed 分支） */
          },
        }),
  }
  return { page, mouse, typed }
}

/** 在页面上下文里把一条"我发出的"消息追加进会话（模拟平台 render）。⚠️ 必须自包含。 */
function appendOwnMessageInPage(arg: { text: string }): void {
  const list = document.querySelector('.chat-record')
  if (list === null) return
  const item = document.createElement('div')
  item.className = 'message-item item-myself'
  const content = document.createElement('div')
  content.className = 'message-content'
  content.textContent = arg.text
  item.appendChild(content)
  list.appendChild(item)
}

/**
 * 点「去聊聊」后平台打开站内会话（登录态形态的合成等价物）。⚠️ 必须自包含。
 * `arg.preset` 非空时顺手塞一条已存在的同文本消息（幂等用例）——
 * 值从 `afterClickArg` 传入（`asSerialized` 会丢闭包）。
 */
function openChatInPage(arg?: { preset?: string }): void {
  const editor = document.createElement('div')
  editor.className = 'editor-container'
  editor.innerHTML =
    '<div class="chat-input" contenteditable="true"></div>' +
    '<div class="chat-op"><span class="tip">按Enter键发送</span></div>'
  const record = document.createElement('div')
  record.className = 'chat-record'
  document.body.appendChild(editor)
  document.body.appendChild(record)
  if (arg !== undefined && arg.preset !== undefined && arg.preset !== '') {
    const item = document.createElement('div')
    item.className = 'message-item item-myself'
    const content = document.createElement('div')
    content.className = 'message-content'
    content.textContent = arg.preset
    item.appendChild(content)
    record.appendChild(item)
  }
}

/**
 * 投递三步的页面响应（按点击次数推进）。⚠️ 必须自包含。
 *   第 1 次（点「投递」）→ 弹出简历选择弹窗（真实类名，样式证据见 config.ts）；
 *   第 2 次（点选择控件）→ 选中（无 DOM 变化，确认按钮本就可用）；
 *   第 3 次（点确认）→ 出现成功提示 `.success_title`。
 */
function applyFlowInPage(_arg: Record<string, never>): void {
  const w = window as unknown as { __applyStep?: number }
  const step = (w.__applyStep ?? 0) + 1
  w.__applyStep = step
  if (step === 1) {
    const dialog = document.createElement('div')
    dialog.className = 'apply-component-resume-dialog'
    dialog.innerHTML =
      '<div class="el-dialog__body"><div class="title">选择投递简历</div>' +
      '<div class="pc-apply-resume"><div class="pc-apply-resume__row">' +
      '<span class="pc-apply-resume__label">默认简历</span>' +
      '<div class="pc-apply-resume__selects"><div class="pc-apply-resume__select--resume">我的在线简历</div></div>' +
      '</div></div></div>' +
      '<div class="el-dialog__footer"><button type="button" class="el-button el-button--primary">确定</button></div>'
    document.body.appendChild(dialog)
    return
  }
  if (step === 3) {
    const ok = document.createElement('div')
    ok.className = 'success_title'
    ok.textContent = '投递成功'
    document.body.appendChild(ok)
  }
}

/** 岗位详情页（合成）：有「去聊聊」与「投递」两个入口（类名照真实夹具还原）。 */
const DETAIL_PAGE_HTML = `
<html><head><title>全栈开发工程师_深圳市明泰海科技术有限公司_深圳-前程无忧</title></head><body>
  <h1>全栈开发工程师</h1>
  <div class="chat"><span>去聊聊</span></div>
  <button type="button" trace-name="申请职位-职位下" class="btn apply"> 投递 </button>
</body></html>`

/** 未登录形态：点「去聊聊」弹出的是微信扫码引导（真实夹具形态，去掉触发判墙的「扫码」二字不影响结构判定）。 */
const QR_POPOVER_PAGE_HTML = `
<html><head><title>全栈开发工程师_深圳市明泰海科技术有限公司</title></head><body>
  <h1>全栈开发工程师</h1>
  <div class="chat"><span>去聊聊</span></div>
  <div class="chat-popover"><div class="detail-wrapper"><div class="info-wrapper">
    <div class="hr-info"><div class="hr-name text-cut">王女士</div><div class="hr-position text-cut">招聘经理</div></div>
    <div class="hr-tip">微信与我聊聊吧</div>
  </div><div class="qrcode-wrapper"><div class="qrcode"><img src="about:blank" alt=""></div></div></div></div>
</body></html>`

/** 消息页（合成，候选选择器）：容器 + 两行会话。 */
const INBOX_PAGE_HTML = `
<html><body>
  <div class="msg-list">
    <li role="listitem" id="conv-1">
      <div class="name-text">王女士</div>
      <div class="company">深圳市明泰海科技术有限公司</div>
      <div class="last-msg-text">你好，看了你的简历，方便聊聊吗？</div>
      <span class="notice-badge">2</span>
      <div class="time">昨天</div>
    </li>
    <li role="listitem" id="conv-2">
      <div class="name-text">李先生</div>
      <div class="company">某某网络科技</div>
      <div class="last-msg-text">您好，我有五年全栈经验……</div>
      <div class="message-status status-read">已读</div>
      <div class="time">09-15</div>
    </li>
  </div>
</body></html>`

// ── sayHello ──────────────────────────────────────────────────────────

test('sayHello：站内会话形态 → 逐字符输入 → 回车兜底发送 → 送达校验通过', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page, mouse, typed } = actionPage({
    html: DETAIL_PAGE_HTML,
    url: JOB_URL,
    afterClick: openChatInPage,
  })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: '全栈开发工程师', company: '深圳市明泰海科技术有限公司', sourceUrl: JOB_URL },
    GREETING,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered', `实际：${JSON.stringify(result)}`)
  assert.equal(result?.evidence, 'dom')
  // 真鼠标点击过（沟通入口 + 输入框）；文本是逐字符键入的
  assert.ok(mouse.ups >= 2)
  assert.equal(typed.join(''), GREETING)
})

test('sayHello：未登录形态弹出微信扫码引导 → 如实报「没有可输入面、未发送」', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: QR_POPOVER_PAGE_HTML,
    url: JOB_URL,
    // 不挂 afterClick：点了入口页面也不变（弹层本来就在）
  })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: '全栈开发工程师', company: '深圳市明泰海科技术有限公司', sourceUrl: JOB_URL },
    GREETING,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok(result?.message?.includes('微信') === true, `消息要讲清扫码引导：${result?.message ?? ''}`)
  assert.ok(result?.message?.includes('登录') === true, '要指路先登录')
})

test('sayHello：会话里已有同文本消息 → 幂等命中，不再输入', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page, typed } = actionPage({
    html: DETAIL_PAGE_HTML,
    url: JOB_URL,
    afterClick: openChatInPage,
    afterClickArg: { preset: GREETING },
  })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: '全栈开发工程师', company: '深圳市明泰海科技术有限公司', sourceUrl: JOB_URL },
    GREETING,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.idempotentHit, true)
  assert.equal(typed.length, 0, '幂等命中后一个字都不该再输入')
})

test('sayHello / sendResume：页面没有 CDP 输入面 → fail-closed，不退回 DOM 点击', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: DETAIL_PAGE_HTML, url: JOB_URL, interaction: 'none' })

  const hello = await adapter.actions?.sayHello?.(
    page,
    { title: '全栈开发工程师', company: '', sourceUrl: JOB_URL },
    GREETING,
  )
  assert.equal(hello?.ok, false)
  assert.equal(hello?.delivery, 'missing')
  assert.ok(hello?.message?.includes('CDP') === true)

  const apply = await adapter.actions?.sendResume?.(
    page,
    { title: '全栈开发工程师', company: '', sourceUrl: JOB_URL },
    null,
  )
  assert.equal(apply?.ok, false)
  assert.equal(apply?.delivery, 'missing')
})

// ── sendResume（51job 的投递形态）──────────────────────────────────────

test('sendResume：投递 → 选简历 → 确认 → 成功提示 → delivered', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page, mouse } = actionPage({
    html: DETAIL_PAGE_HTML,
    url: JOB_URL,
    afterClick: applyFlowInPage,
  })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: '全栈开发工程师', company: '深圳市明泰海科技术有限公司', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered')
  assert.equal(result?.evidence, 'dom')
  // 三次真鼠标点击：投递 → 选简历 → 确认
  assert.equal(mouse.ups, 3)
})

test('sendResume：本地文件路径 → 平台没有直投入口，如实拒绝并指路简历中心', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: DETAIL_PAGE_HTML, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: '全栈开发工程师', company: '', sourceUrl: JOB_URL },
    'D:/resume.pdf',
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok(result?.message?.includes('简历中心') === true, `要指路简历中心：${result?.message ?? ''}`)
})

test('sendResume：弹窗里没有可选简历（提示形态）→ 如实报 missing 并带平台提示', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  // 提示文案刻意避开判墙词表（「今日投递太多」会先被 assertActionPage 判成
  // quota-exhausted 并抛 PlatformBlockedError —— 那是**正确**行为，走的是另一条路径）
  const html = DETAIL_PAGE_HTML.replace(
    '</body>',
    '<div class="apply-component-hint-dialog"><div class="el-dialog__body">请先上传简历后再投递</div></div></body>',
  )
  const { page } = actionPage({ html, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: '全栈开发工程师', company: '', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok(result?.message?.includes('请先上传简历后再投递') === true, `平台提示要透传：${result?.message ?? ''}`)
})

test('sendResume：确认按钮 disabled → 报「平台没接受这次选择」，不讲成 pending', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const html = DETAIL_PAGE_HTML.replace(
    '</body>',
    '<div class="apply-component-resume-dialog">' +
      '<div class="pc-apply-resume"><div class="pc-apply-resume__row"><div class="pc-apply-resume__select--resume">我的在线简历</div></div></div>' +
      '<div class="el-dialog__footer"><button type="button" disabled class="el-button el-button--primary disabled">确定</button></div>' +
      '</div></body>',
  )
  const { page } = actionPage({ html, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: '全栈开发工程师', company: '', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing', '点不动的按钮绝不能报成 pending/delivered')
})

// ── readInbox / detectStage / reply ────────────────────────────────────

test('readInbox：解析会话行（方向 / 未读 / 相对时间），页面函数按源码重建后仍工作', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: INBOX_PAGE_HTML, url: 'https://i.51job.com/message/' })

  const messages = await adapter.actions?.readInbox?.(page)

  assert.equal(messages?.length, 2)
  const first = messages?.[0]
  assert.equal(first?.hrName, '王女士')
  assert.equal(first?.company, '深圳市明泰海科技术有限公司')
  assert.equal(first?.direction, 'hr', '带未读徽章的行按 hr 记（漏报比误报贵）')
  assert.equal(first?.unread, true)
  assert.equal(first?.at, '昨天')
  const second = messages?.[1]
  assert.equal(second?.direction, 'me', '状态节点在场 ⇒ 最后一条是我们发的')
  assert.equal(second?.unread, false)
})

test('readInbox：容器找不到 → 抛错，绝不谎报 0 条', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: '<html><body><div class="something-else">页面改版了</div></body></html>',
    url: 'https://i.51job.com/message/',
  })

  await assert.rejects(() => adapter.actions?.readInbox?.(page) ?? Promise.resolve([]))
})

test('detectStage：未读行 → replied；我发的且已读 → read；没有会话 → null（不写成 none）', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: INBOX_PAGE_HTML, url: 'https://i.51job.com/message/' })

  const replied = await adapter.actions?.detectStage?.(page, {
    title: '全栈开发工程师',
    company: '深圳市明泰海科技术有限公司',
    sourceUrl: JOB_URL,
  })
  assert.equal(replied, 'replied')

  const read = await adapter.actions?.detectStage?.(page, {
    title: '另一个岗位',
    company: '某某网络科技',
    sourceUrl: JOB_URL,
  })
  assert.equal(read, 'read')

  const unknown = await adapter.actions?.detectStage?.(page, {
    title: '没接触过的岗位',
    company: '不存在的公司',
    sourceUrl: JOB_URL,
  })
  assert.equal(unknown, null)
})

test('reply：会话页命中会话行 → 输入并发送 → delivered', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page, typed } = actionPage({
    html: INBOX_PAGE_HTML,
    url: 'https://i.51job.com/message/',
    // 点中会话行后平台打开会话（同页挂输入框与消息列表）
    afterClick: openChatInPage,
    afterClickArg: {},
  })

  const result = await adapter.actions?.reply?.(
    page,
    { title: '全栈开发工程师', company: '深圳市明泰海科技术有限公司', sourceUrl: JOB_URL },
    '您好，感谢回复，我的情况是这样的……',
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered')
  assert.ok((typed.join('') ?? '').length > 0)
})

// ── detail.extract ────────────────────────────────────────────────────

test('detail：合成详情页 → JD/字段解析 + platformJobId 从地址反解', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const html = `
<html><head><title>全栈开发工程师_深圳市明泰海科技术有限公司_深圳-前程无忧</title></head><body>
  <h1>全栈开发工程师</h1>
  <strong class="sal">1.3-1.8万</strong>
  <div class="jtag"><span>5年及以上</span><span>本科</span></div>
  <div class="job_msg">岗位职责：1. 参与后端业务系统的设计与开发；2. 编写单元测试。</div>
  <div class="cname">深圳市明泰海科技术有限公司</div>
  <div class="dc">船舶/航空/航天</div><div class="dc">民营</div><div class="dc">少于50人</div>
</body></html>`
  const { page } = actionPage({ html, url: JOB_URL })

  const detail = await adapter.detail?.extract(page)

  assert.equal(detail?.platformJobId, '173674707', 'jobId 从 /all/<id>.html 反解')
  assert.equal(detail?.title, '全栈开发工程师')
  assert.equal(detail?.salaryRaw, '1.3-1.8万')
  assert.equal(detail?.expReq, '5年及以上')
  assert.equal(detail?.eduReq, '本科')
  assert.equal(detail?.company, '深圳市明泰海科技术有限公司')
  assert.equal(detail?.industry, '船舶/航空/航天')
  assert.equal(detail?.companyNature, '民营')
  assert.equal(detail?.companySize, '少于50人')
  assert.ok((detail?.jdText ?? '').includes('后端业务系统'))
  assert.equal(detail?.sourceUrl, JOB_URL)
})

test('detail：候选选择器全 miss → 留空 + 记「待校准」note，title 走 document.title 兜底', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: '<html><head><title>某岗位_某公司_深圳-前程无忧</title></head><body><div>页面结构变了</div></body></html>',
    url: JOB_URL,
  })

  const detail = await adapter.detail?.extract(page)

  assert.equal(detail?.jdText, undefined, '锚不到 JD 就不产出，绝不编')
  assert.equal(detail?.title, '某岗位', 'document.title 兜底')
  assert.equal(detail?.company, '某公司')
  assert.ok(detail?.notes?.some((note) => note.includes('JD 未锚定')) === true)
})

// ── auth.isLoggedIn（结构性锚点）──────────────────────────────────────

test('isLoggedIn：页头有「登录/注册」锚点（真实夹具形态）→ 判未登录', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: '<html><body><div class="header"><span class="login loginBtnClick">登录/注册</span></div><div class="joblist"></div></body></html>',
    url: 'https://we.51job.com/pc/search?keyword=Java&jobArea=040000',
  })

  // 旧判据（整页判墙反推）在这个未登录搜索页上会恒判"已登录"——锚点把这一侧纠正过来
  assert.equal(await adapter.auth?.isLoggedIn(page), false)
})

test('isLoggedIn：已登录锚点在 → 判已登录（锚点为候选，DB 可覆盖校准）', async () => {
  const adapter = createFiftyOneAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: '<html><body><div class="header"><span class="userName">求职者A</span></div><div class="joblist"></div></body></html>',
    url: 'https://we.51job.com/pc/search?keyword=Java&jobArea=040000',
  })

  assert.equal(await adapter.auth?.isLoggedIn(page), true)
})
