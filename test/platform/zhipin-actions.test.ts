/**
 * BOSS 直聘「高危动作」离线回归：打招呼 / 收件箱 / 附件投递。
 *
 * 为什么值得单开一个文件：`zhipin.ts` 的 actions 是本仓库**第一个真正实现**的
 * 高危动作（此前 10 个适配器一律 fail-closed）。它必须证明三件事：
 *
 *   1. **送达语义不撒谎**：只有会话里真的出现那条消息才算 `delivered`；
 *      没确认到一律 `missing`（宁可漏记，也不能把"点了按钮"当成"发出去了"）；
 *   2. **fail-closed**：页面没有 CDP 输入面（`page.mouse` / `page.keyboard`）时
 *      直接返回失败，**绝不退回 DOM `el.click()`**（§7.2 站点规则）；
 *   3. **鉴权边界**：本地简历文件在 BOSS 求职者网页端传不进去时如实报 `missing`，
 *      而不是假装发成功。
 *
 * 夹具是**合成 HTML**（结构照 BossHunter 生产选择器还原），不是保存的真实页面 ——
 * 真实登录夹具到位后，这些用例负责保证"别在改选择器时把语义改坏"。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createZhipinAdapter,
  DEFAULT_ZHIPIN_CONFIG,
  type ZhipinConfig,
} from '../../src/host/platform/adapters/zhipin.js'
import type { HumanKeyboard, HumanMouse } from '../../src/host/platform/humanize.js'
import type { PageLike, RawInboxMessage } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const JOB_URL = 'https://www.zhipin.com/job_detail/abc123.html?securityId=xyz'
const GREETING = '您好，我有三年后端经验，和这个岗位挺匹配的，方便聊聊吗？'

/** 测试用配置：关掉拟人停留、把等待压到最小。 */
const FAST_CONFIG: ZhipinConfig = {
  ...DEFAULT_ZHIPIN_CONFIG,
  dwellBeforeGreetMs: [0, 0],
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

  async move(x: number, y: number): Promise<void> {
    this.moves.push([x, y])
  }

  async down(): Promise<void> {
    this.downs += 1
  }

  async up(): Promise<void> {
    this.ups += 1
  }
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

interface ActionPageOptions {
  html: string
  url: string
  /** 交互面：`'full'` = 有 mouse+keyboard；`'none'` = 都没有（fail-closed 用例）。 */
  interaction?: 'full' | 'none'
  /** 按 URL 换内容（模拟"点击后同页跳转/另开标签页再兜底导航"）。 */
  loader?: (url: string) => string | undefined
  /** 记录 `setInputFiles` 的调用。 */
  uploads?: Array<{ selector: string; files: readonly string[] }>
}

/**
 * 造一个带 CDP 输入面的离线页面。
 *
 * `keyboard.press('Enter')` 会把"输入框里累计的文本"渲染成一条自己的消息 ——
 * 这是离线夹具里唯一能触发"消息出现"这件事的手段，也让送达校验有东西可校验。
 */
function actionPage(options: ActionPageOptions): {
  page: PageLike
  mouse: RecordingMouse
  typed: string[]
} {
  const inner = new JsdomPage({
    html: options.html,
    url: options.url,
    layout: true,
    ...(options.loader === undefined ? {} : { loader: options.loader }),
  })
  const mouse = new RecordingMouse()
  const uploads = options.uploads ?? []
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
          setInputFiles: async (selector: string, filePaths: readonly string[]): Promise<void> => {
            uploads.push({ selector, files: filePaths })
          },
        }),
  }
  return { page, mouse, typed }
}

/** 岗位详情页：只有「立即沟通」入口（点了会去会话页）。 */
const JOB_PAGE_HTML = `
<html><head><title>Java工程师_某某科技招聘</title></head><body>
  <a class="btn-startchat" href="/web/geek/chat?jobId=abc123">立即沟通</a>
</body></html>`

/** 会话页：输入框 + 空消息列表 + 工具条「发简历」。 */
const CHAT_PAGE_HTML = `
<html><body>
  <li role="listitem" id="conv-1">
    <div class="name-box"><span>张女士</span><span>某某科技</span><span>HR</span></div>
    <div class="name-text">张女士</div>
    <div class="last-msg-text">你好，方便发一份简历吗？</div>
    <span class="unread-count">2</span>
  </li>
  <div class="operate-icon-item"><span class="operate-btn">发送简历</span></div>
  <div class="choose-resume-dialog">
    <div class="list-item">我的在线简历</div>
    <div class="btn-confirm">确定</div>
  </div>
  <div class="resume-card">在线简历</div>
  <div id="chat-input" contenteditable="true"></div>
  <div class="chat-record"></div>
</body></html>`

test('sayHello：同页进入会话 → 逐字符输入 → 送达校验通过', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page, mouse, typed } = actionPage({
    html: JOB_PAGE_HTML,
    url: JOB_URL,
    loader: (url) => (url.includes('/web/geek/chat') ? CHAT_PAGE_HTML : undefined),
  })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    GREETING,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered', `实际：${JSON.stringify(result)}`)
  assert.equal(result?.evidence, 'dom')
  assert.ok(mouse.downs > 0 && mouse.ups > 0, '点击必须走 CDP 鼠标（三段式），而不是 DOM click')
  assert.equal(typed.join(''), GREETING, '话术必须是逐字符输入（humanType），不是一次性 fill')
  assert.ok(
    (page.url() ?? '').includes('/web/geek/chat'),
    '点击后应进入会话页（本用例走 redirect-url 兜底导航）',
  )
})

test('sayHello：会话里已有同文本 → 幂等命中，不重复发送', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const html = CHAT_PAGE_HTML.replace(
    '<div class="chat-record"></div>',
    `<div class="chat-record"><div class="message-item item-myself"><div class="message-content">${GREETING}</div></div></div>`,
  )
  const { page, typed } = actionPage({
    html: JOB_PAGE_HTML,
    url: JOB_URL,
    loader: (url) => (url.includes('/web/geek/chat') ? html : undefined),
  })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    GREETING,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered')
  assert.equal(result?.idempotentHit, true, '同文本已存在时必须标记幂等命中')
  assert.equal(typed.length, 0, '幂等命中时不该再输入任何字符（绝不重发）')
})

test('sayHello：没有 CDP 输入面 → fail-closed，不用 DOM click 冒充', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: CHAT_PAGE_HTML, url: JOB_URL, interaction: 'none' })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    GREETING,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing', '没能力点就不能说已送达')
  assert.equal(result?.evidence, 'none')
  assert.ok((result?.message ?? '').includes('CDP'))
})

test('sayHello：点了发送但会话里没有该消息 → missing（绝不假装 delivered）', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  // 会话页有输入框，但**没有消息列表容器** → 输入发送后文案无处渲染，
  // 校验必须停在 missing，而不是因为"点了按钮"就报 delivered。
  const html = CHAT_PAGE_HTML.replace('<div class="chat-record"></div>', '')
  const { page } = actionPage({
    html: JOB_PAGE_HTML,
    url: JOB_URL,
    loader: (url) => (url.includes('/web/geek/chat') ? html : undefined),
  })

  const result = await adapter.actions?.sayHello?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    '一条不会被渲染出来的话术',
  )

  assert.equal(result?.ok, false, JSON.stringify(result))
  assert.equal(result?.delivery, 'missing')
  assert.ok((result?.message ?? '').includes('没有确认到'))
})

test('readInbox：解析会话列表（HR 名 / 公司 / 未读 / 方向）', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const html = `
  <html><body>
    <ul>
      <li role="listitem" id="c1">
        <div class="name-box"><span>张女士</span><span>某某科技</span><span>招聘主管</span></div>
        <div class="name-text">张女士</div>
        <div class="last-msg-text">你好，方便发一份简历吗？</div>
        <span class="unread-count">2</span>
      </li>
      <li role="listitem" id="c2">
        <div class="name-box"><span>李先生</span><span>另一家公司</span></div>
        <div class="name-text">李先生</div>
        <div class="last-msg-text">好的，期待您的消息</div>
        <div class="message-status status-read"></div>
      </li>
    </ul>
  </body></html>`
  const { page } = actionPage({ html, url: 'https://www.zhipin.com/web/geek/chat', interaction: 'none' })

  const inbox: RawInboxMessage[] = (await adapter.actions?.readInbox?.(page)) ?? []

  assert.equal(inbox.length, 2)
  const first = inbox[0]
  assert.equal(first?.conversationId, 'c1', '有 id 时用平台自己的会话 id')
  assert.equal(first?.hrName, '张女士')
  assert.equal(first?.company, '某某科技', '公司名取 .name-box 的第二个 span')
  assert.equal(first?.lastMessage, '你好，方便发一份简历吗？')
  assert.equal(first?.unread, true)
  assert.equal(first?.direction, 'hr', 'HR 发来的消息方向为 hr')

  const second = inbox[1]
  assert.equal(second?.unread, false)
  assert.equal(second?.direction, 'me', 'status-read 说明最后一条是我发的')
})

test('sendResume：本地 PDF 在 BOSS 求职者网页端传不进去 → 如实报 missing', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: CHAT_PAGE_HTML, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    'D:/resume.pdf',
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing', '平台没有上传入口时不能假装把本地文件发出去了')
  assert.ok((result?.message ?? '').includes('本地文件'))
})

test('sendResume：filePath=null 走平台简历弹窗 → 出现简历卡片才算送达', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: CHAT_PAGE_HTML, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered')
})

test('sendResume：会话列表里没有这家公司 → 不投递', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: CHAT_PAGE_HTML, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '查无此司', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok((result?.message ?? '').includes('查无此司'))
})
