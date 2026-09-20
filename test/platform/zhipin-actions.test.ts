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
import { createZhipinAdapter } from '../../src/host/platform/adapters/zhipin/index.js'
import {
  DEFAULT_ZHIPIN_CONFIG,
  type ZhipinConfig,
} from '../../src/host/platform/adapters/zhipin/config.js'
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
  /**
   * 点击之后在页面里执行的**自包含**函数（模拟平台对点击的响应）。
   *
   * 为什么需要：夹具给每个元素的是**同一个矩形**，所以"点到了哪个元素"没法靠坐标断言。
   * 让点击真的改变 DOM（例如切 tab 后列表重渲染），"点对了"才变成可观察的事实。
   */
  afterClick?: () => void
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
  const mouse = new RecordingMouse(
    options.afterClick === undefined
      ? undefined
      : async () => {
          await inner.evaluate(asSerialized(options.afterClick as () => void), undefined as never)
        },
  )
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

/**
 * 合成版简历选择弹窗（旧夹具形态：一条可选简历 + 可点确认）。
 *
 * ⚠️ 它与**真实**弹窗的差别是已知的（真实结构见下面 `measuredResumeDialogHtml`）——
 * 留着它是为了继续覆盖"有条目且能发"这条成功路径。
 */
const SYNTHETIC_RESUME_DIALOG_HTML = `  <div class="choose-resume-dialog">
    <div class="list-item">我的在线简历</div>
    <div class="btn-confirm">确定</div>
  </div>`

/**
 * 简历选择弹窗 —— **2026-09-20 真实原文**的等价物。
 *
 * 原文出处：`.probe-zhipin-capture/resume-dialog-2026-09-20.html`
 * （账号收到 HR 回复、「发简历」的 `unable` 消失后，探针用真鼠标点开采集）。
 * 两处与合成版不同、且**都被适配器依赖**：
 *   * `items = 0` 时渲染的是空态 `.resume-top-tip`（「未上传简历 / 去上传」）——
 *     弹窗照样会打开，所以"弹窗开了"**不等于**能发；
 *   * 确认按钮未选中简历时带 `class="… disabled" disabled`。
 */
function measuredResumeDialogHtml(options: { items: number }): string {
  const items = Array.from(
    { length: options.items },
    (_, index) => `<div class="list-item">我的简历 ${String(index + 1)}</div>`,
  ).join('')
  const container =
    options.items === 0
      ? '<div class="resume-top-tip"><i class="icon-xinxi-tip"></i><span>未上传简历</span>' +
        '<span class="btn-upload">去上传</span></div>'
      : items
  return `
  <div class="boss-popup__wrapper boss-dialog boss-dialog__wrapper dialog-default choose-resume-dialog">
    <div class="boss-popup__content">
      <div class="boss-dialog__header"><div class="boss-dialog_title"><h3>请选择要发送的简历</h3></div></div>
      <div class="boss-dialog__body">
        <div class="choose-resume-dialog">
          <div class="resume-choose-container">${container}</div>
          <div class="tips"></div>
          <div class="footer">
            <div class="manage-btn">管理附件</div>
            <button type="button" disabled="disabled" class="btn-v2 btn-sure-v2 btn-confirm disabled">发送</button>
          </div>
        </div>
      </div>
    </div>
    <div class="boss-popup__close"><i class="icon-close"></i></div>
  </div>`
}

/** 会话页：输入框 + 空消息列表 + 工具条「发简历」。 */
const CHAT_PAGE_HTML = `
<html><body>
  <li role="listitem" id="conv-1">
    <div class="name-box"><span>张女士</span><span>某某科技</span><span>HR</span></div>
    <div class="name-text">张女士</div>
    <div class="last-msg-text">你好，方便发一份简历吗？</div>
    <span class="notice-badge">2</span>
  </li>
  <div class="toolbar-controls">
    <div class="toolbar-btn-content"><div aria-label="表情" class="icon btn-emotion"></div></div>
    <div class="toolbar-btn-content"><div aria-label="发送图片" class="icon btn-sendimg"><input type="file" accept="image/gif,image/jpeg,image/png"></div></div>
    <div class="toolbar-btn-content"><div aria-label="求简历" class="toolbar-btn tooltip"> 发简历 </div></div>
  </div>
${SYNTHETIC_RESUME_DIALOG_HTML}
  <div class="resume-card">在线简历</div>
  <div class="editor-container">
    <div id="chat-input" contenteditable="true" class="chat-input"></div>
    <div class="chat-op"><span class="tip">按Enter键发送，按Ctrl+Enter键换行</span><button type="send" class="btn-v2 btn-sure-v2 btn-send disabled">发送</button></div>
  </div>
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
  // 结构照 2026-09-18 真实会话行（`.user-list > .user-list-content > ul[role=group] > li`），
  // 行内类名与 `.time` 全是实测值。
  const html = `
  <html><body>
    <div class="chat-wrap">
      <div class="chat-user v2">
        <div class="label-list"><ul><li class="selected"><span class="label-name">全部</span></li></ul></div>
        <div class="chat-content">
          <div class="user-list"><div class="user-list-content">
            <ul role="thead"><!----></ul>
            <ul role="group">
              <li id="c1" role="listitem">
                <div class="friend-content">
                  <span class="time">00:53</span>
                  <span class="name-box"><span class="name-text">张女士</span><span>某某科技</span><i class="vline"></i><span>招聘主管</span></span>
                  <div class="gray last-msg">
                    <span class="last-msg-text">你好，方便发一份简历吗？</span>
                    <span class="unread-count">2</span>
                  </div>
                </div>
              </li>
              <li id="c2" role="listitem">
                <div class="friend-content">
                  <span class="time">昨天</span>
                  <span class="name-box"><span class="name-text">李先生</span><span>另一家公司</span></span>
                  <div class="gray last-msg">
                    <i class="message-status status-delivery"> [送达] </i>
                    <span class="last-msg-text">好的，期待您的消息</span>
                  </div>
                </div>
              </li>
            </ul>
            <div role="tfoot"></div>
          </div></div>
        </div>
      </div>
    </div>
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
  assert.equal(first?.at, '00:53', '时间来自实测的 .time 节点')

  const second = inbox[1]
  assert.equal(second?.unread, false)
  assert.equal(second?.direction, 'me', 'status-delivery 说明最后一条是我发的')
  assert.equal(second?.at, '昨天')
})

test('readInbox：**空列表**（容器在、列表空）→ 可信的 0 条，不报错', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  // 2026-09-18 实测的真空态结构：容器 `.user-list` 里只有一个 `.no-data`
  const html = `
  <html><body>
    <div class="chat-content"><div class="user-list">
      <div class="no-data"><p class="no-setting-text">30天内暂无联系人</p></div>
    </div></div>
    <div class="chat-conversation"><div class="chat-no-data"><div class="no-data-text">当前暂无消息</div></div></div>
  </body></html>`
  const { page } = actionPage({ html, url: 'https://www.zhipin.com/web/geek/chat', interaction: 'none' })

  const inbox = await adapter.actions?.readInbox?.(page)

  assert.deepEqual(inbox, [], '容器在 + 页面自报「暂无联系人」= 真的空，返回 [] 是正确的')
})

test('readInbox：**容器都找不到** → 抛错，绝不谎报 0 条', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  // 选择器腐烂 / 不是会话页时的形态：没有 `.chat-content .user-list`
  const html = '<html><body><div class="some-other-page">首页</div></body></html>'
  const { page } = actionPage({ html, url: 'https://www.zhipin.com/web/geek/chat', interaction: 'none' })

  await assert.rejects(
    async () => await adapter.actions?.readInbox?.(page),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.ok(error.message.includes('会话列表容器未找到'), error.message)
      return true
    },
    '容器缺失必须抛错 —— 把"读不到"变成"没人回我"是这条链路上最贵的谎',
  )
})

test('sendResume：本地文件 → 如实说明"没有把本地文件发给 HR 的入口"，不假装投递', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: CHAT_PAGE_HTML, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    'D:/resume.pdf',
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing', '平台没有这个入口时不能假装把本地文件发出去了')
  // 页面上那两个 file input 分别是「上传附件简历到我的简历」与「发送图片」——必须讲清楚
  assert.ok((result?.message ?? '').includes('把本地简历文件发给 HR'), result?.message)
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

test('sendResume：「发简历」不可用（双方未回复）→ 如实转述平台门槛，不点那个点不动的按钮', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  // 2026-09-18 实测形态：未回复时按钮带 `unable`，aria-label 明写「双方回复后可用」
  const html = CHAT_PAGE_HTML.replace(
    '<div aria-label="求简历" class="toolbar-btn tooltip"> 发简历 </div>',
    '<div aria-label="求简历：双方回复后可用" class="toolbar-btn tooltip unable"> 发简历 </div>',
  )
  const { page } = actionPage({ html, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, false, JSON.stringify(result))
  assert.equal(result?.delivery, 'missing')
  assert.ok((result?.message ?? '').includes('双方回复'), result?.message)
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

// ── sendResume：**2026-09-20 实测打开的弹窗**（此前这段选择器只有 BossHunter 的猜测）──
//
// 这两条用例钉住的是同一件事：**"弹窗开了"不等于"发出去了"**。真实弹窗在没有可选简历时
// 照样打开（空态「未上传简历」），而确认按钮此时带 `disabled` —— 点它毫无反应。
// 夹具里刻意放着一个 `.resume-card`：只要适配器把这种状态讲成 delivered/pending，
// 断言就会红（这正是修改前会撒的谎）。

test('sendResume：弹窗是实测的**空态**（「未上传简历」）→ 如实说 missing 并给下一步，不假装在发', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const html = CHAT_PAGE_HTML.replace(
    SYNTHETIC_RESUME_DIALOG_HTML,
    measuredResumeDialogHtml({ items: 0 }),
  )
  const { page } = actionPage({ html, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, false, JSON.stringify(result))
  assert.equal(result?.delivery, 'missing', '没有可选简历时绝不能报 delivered/pending')
  assert.ok((result?.message ?? '').includes('没有可选的简历'), result?.message)
  assert.ok((result?.message ?? '').includes('未上传简历'), '要把平台的空态文案原样带出来')
  assert.ok((result?.message ?? '').includes('我的简历'), '要告诉用户下一步去哪儿传简历')
})

test('sendResume：弹窗有条目但确认按钮带 disabled → missing，不点那个点不动的按钮', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const html = CHAT_PAGE_HTML.replace(
    SYNTHETIC_RESUME_DIALOG_HTML,
    measuredResumeDialogHtml({ items: 1 }),
  )
  const { page } = actionPage({ html, url: JOB_URL })

  const result = await adapter.actions?.sendResume?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    null,
  )

  assert.equal(result?.ok, false, JSON.stringify(result))
  assert.equal(result?.delivery, 'missing', '按钮 disabled 时点它什么都不会发生，不能说成 pending')
  assert.ok((result?.message ?? '').includes('不可用'), result?.message)
})

// ── reply：在已有会话里真回消息（2026-09-18 补的 actions.reply）──────────

const CHAT_URL = 'https://www.zhipin.com/web/geek/chat'
const REPLY_TEXT = '可以，明天下午两点以后我都有空。'

/** 把一条"我发出的"同文本消息预先放进会话（幂等用例用）。 */
function chatHtmlWithOwnMessage(text: string): string {
  return CHAT_PAGE_HTML.replace(
    '<div class="chat-record"></div>',
    `<div class="chat-record"><div class="message-item item-myself"><div class="message-content">${text}</div></div></div>`,
  )
}

test('reply：会话里已有同文本 → 幂等命中，不重复发送', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page, typed } = actionPage({
    html: chatHtmlWithOwnMessage(REPLY_TEXT),
    url: CHAT_URL,
    interaction: 'full',
  })

  const result = await adapter.actions?.reply?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    REPLY_TEXT,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered')
  assert.equal(result?.idempotentHit, true, '同文本已存在时必须标记幂等命中')
  assert.equal(typed.length, 0, '幂等命中时一个字都不该输入（重发 = 对方收到两条一样的话）')
})

test('reply：正常路径 → 进会话 → 逐字符输入 → 回车 → 送达校验通过', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page, mouse, typed } = actionPage({ html: CHAT_PAGE_HTML, url: CHAT_URL, interaction: 'full' })

  const result = await adapter.actions?.reply?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    REPLY_TEXT,
  )

  assert.equal(result?.ok, true, JSON.stringify(result))
  assert.equal(result?.delivery, 'delivered', `实际：${JSON.stringify(result)}`)
  assert.equal(result?.evidence, 'dom')
  assert.equal(typed.join(''), REPLY_TEXT, '必须逐字符输入（humanType），不是一次性 fill')
  assert.ok(mouse.downs > 0 && mouse.ups > 0, '点击必须走 CDP 鼠标（三段式），而不是 DOM click')
})

test('reply：没有 CDP 输入面 → fail-closed，按未发送处理', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html: CHAT_PAGE_HTML, url: CHAT_URL, interaction: 'none' })

  const result = await adapter.actions?.reply?.(
    page,
    { title: 'Java工程师', company: '某某科技', sourceUrl: JOB_URL },
    REPLY_TEXT,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.equal(result?.evidence, 'none')
  assert.ok((result?.message ?? '').includes('CDP'))
})

test('reply：会话列表里找不到这个岗位的会话 → missing，不猜一个会话把话发出去', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page, typed } = actionPage({ html: CHAT_PAGE_HTML, url: CHAT_URL, interaction: 'full' })

  const result = await adapter.actions?.reply?.(
    page,
    { title: 'Java工程师', company: '查无此司', sourceUrl: JOB_URL },
    REPLY_TEXT,
  )

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.ok((result?.message ?? '').includes('查无此司'), result?.message)
  assert.equal(typed.length, 0, '没找到会话就一个字都不该输入')
})

// ── detectStage：接触阶段探测（2026-09-18 用实测选择器实现）──────────────

/**
 * 会话列表夹具：一行会话，可按需带未读徽章 / `.message-status` 状态类名。
 *
 * 未读徽章的类名用 **2026-09-20 实测值 `.notice-badge`**（HR 主动发来的那行实测带它，
 * 文本就是未读数）；`.unread-count` 那条兜底候选由 TABBED_INBOX_HTML 覆盖。
 */
function inboxHtml(options: { company: string; status?: string; unread?: boolean }): string {
  const status =
    options.status === undefined
      ? ''
      : `<i class="message-status ${options.status}"> [送达] </i>`
  return `
  <html><body>
    <div class="chat-content"><div class="user-list"><div class="user-list-content">
      <ul role="group">
        <li id="c1" role="listitem">
          <div class="friend-content">
            <span class="time">00:53</span>
            <span class="name-box"><span class="name-text">张女士</span><span>${options.company}</span></span>
            <div class="gray last-msg">
              ${status}
              <span class="last-msg-text">你好，方便发一份简历吗？</span>
              ${options.unread === true ? '<span class="notice-badge">1</span>' : ''}
            </div>
          </div>
        </li>
      </ul>
    </div></div></div>
  </body></html>`
}

async function stageOf(html: string, job: { title: string; company: string }): Promise<string | null> {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({ html, url: CHAT_URL, interaction: 'none' })
  const stage = await adapter.actions?.detectStage?.(page, { ...job, sourceUrl: JOB_URL })
  return stage ?? null
}

test('detectStage：会话里有未读（实测 `.notice-badge`）→ replied', async () => {
  const stage = await stageOf(inboxHtml({ company: '某某科技', unread: true }), {
    title: 'Java工程师',
    company: '某某科技',
  })
  assert.equal(stage, 'replied')
})

test('detectStage：最后一条是我发的且 status-delivery → delivered', async () => {
  const stage = await stageOf(inboxHtml({ company: '某某科技', status: 'status-delivery' }), {
    title: 'Java工程师',
    company: '某某科技',
  })
  assert.equal(stage, 'delivered')
})

// ✅ 2026-09-20：真实站点上拿到了 `status-read` 的样本（文案 `[已读]`），这条从
// "代码支持但没见过" 变成**有真机证据**的回归。
test('detectStage：status-read（实测文案 `[已读]`）→ read', async () => {
  const stage = await stageOf(inboxHtml({ company: '某某科技', status: 'status-read' }), {
    title: 'Java工程师',
    company: '某某科技',
  })
  assert.equal(stage, 'read')
})

test('detectStage：列表里没有这个岗位的会话 → null（**不是** none）', async () => {
  const stage = await stageOf(inboxHtml({ company: '另一家公司' }), {
    title: 'Java工程师',
    company: '某某科技',
  })
  // 「从没打过招呼」与「会话被移出平台保留窗口」在这里分不清 —— 写成 none 会记错账
  assert.equal(stage, null)
})

test('detectStage：状态类名认不出来 → null（不猜）', async () => {
  const stage = await stageOf(inboxHtml({ company: '某某科技', status: 'status-something-new' }), {
    title: 'Java工程师',
    company: '某某科技',
  })
  assert.equal(stage, null)
})

test('detectStage：不是会话页（容器都没有）→ null，而不是抛错', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: '<html><body><div class="home">首页</div></body></html>',
    url: CHAT_URL,
    interaction: 'none',
  })
  const stage = await adapter.actions?.detectStage?.(page, {
    title: 'Java工程师',
    company: '某某科技',
    sourceUrl: JOB_URL,
  })
  // 契约允许判不出来返回 null（上层保留原值）；这里如实返回，不猜成 none
  assert.equal(stage ?? null, null)
})

// ── readInbox：按 tab 读（`inboxTab`）─────────────────────────────────

/** 模拟"切到未读 tab"：平台重渲染后只剩带未读徽章的会话行。⚠️ 必须自包含。 */
function keepOnlyUnreadRowsInPage(): void {
  document.querySelectorAll('li[role="listitem"]').forEach((row) => {
    if (row.querySelector('.unread-count') === null) row.remove()
  })
}

const TABBED_INBOX_HTML = `
<html><body>
  <div class="chat-content">
    <div class="label-list"><ul>
      <li class="selected"><span class="label-name">全部</span></li>
      <li><span class="label-name">未读</span></li>
    </ul></div>
    <div class="user-list"><div class="user-list-content">
      <ul role="group">
        <li id="c1" role="listitem">
          <div class="friend-content">
            <span class="name-box"><span class="name-text">张女士</span><span>某某科技</span></span>
            <div class="gray last-msg"><span class="last-msg-text">你好，方便发一份简历吗？</span><span class="unread-count">2</span></div>
          </div>
        </li>
        <li id="c2" role="listitem">
          <div class="friend-content">
            <span class="name-box"><span class="name-text">李先生</span><span>另一家公司</span></span>
            <div class="gray last-msg"><i class="message-status status-delivery"> [送达] </i><span class="last-msg-text">好的，期待您的消息</span></div>
          </div>
        </li>
      </ul>
    </div></div>
  </div>
</body></html>`

test('readInbox：inboxTab=all（默认）不点 tab，读到全量', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page, mouse } = actionPage({ html: TABBED_INBOX_HTML, url: CHAT_URL, interaction: 'full' })

  const inbox = await adapter.actions?.readInbox?.(page)

  assert.equal(inbox?.length, 2)
  assert.equal(mouse.ups, 0, '默认 all 不该点任何 tab')
})

test('readInbox：inboxTab=unread → 真的点到「未读」这个 tab（点完读到的是该 tab 的内容）', async () => {
  const adapter = createZhipinAdapter({
    config: { ...FAST_CONFIG, inboxTab: 'unread' },
  })
  const { page, mouse } = actionPage({
    html: TABBED_INBOX_HTML,
    url: CHAT_URL,
    interaction: 'full',
    // 平台对这次点击的响应：切到未读后只剩带未读徽章的那一行
    afterClick: keepOnlyUnreadRowsInPage,
  })

  const inbox = await adapter.actions?.readInbox?.(page)

  assert.ok(mouse.ups > 0, '配置了非 all 的 tab，就必须真的点一下')
  assert.equal(inbox?.length, 1, '读到的是切 tab 之后的内容 —— 这证明点到的确实是那个 tab')
  assert.equal(inbox?.[0]?.conversationId, 'c1')
})

test('readInbox：没有 CDP 鼠标时切不动 tab → 退回读全量（超集，不漏）', async () => {
  const adapter = createZhipinAdapter({
    config: { ...FAST_CONFIG, inboxTab: 'unread' },
  })
  const { page } = actionPage({ html: TABBED_INBOX_HTML, url: CHAT_URL, interaction: 'none' })

  const inbox = await adapter.actions?.readInbox?.(page)

  // 点不上不算失败：读到的是"当前展示的全量"，是**超集** —— 精度变差，但不会漏消息
  assert.equal(inbox?.length, 2)
})

test('readInbox：状态类名没认出来，但 `.message-status` 节点在 → 方向仍判为"我发的"', async () => {
  const adapter = createZhipinAdapter({ config: FAST_CONFIG })
  const { page } = actionPage({
    html: inboxHtml({ company: '某某科技', status: 'status-brand-new-name' }),
    url: CHAT_URL,
    interaction: 'none',
  })

  const inbox = await adapter.actions?.readInbox?.(page)

  // 送达/已读标记只出现在我们发出的消息上 —— 平台改类名不该让方向整体读反
  // （读反了本地会多出一条"HR 说的话"，而且和 detectStage 的结论互相矛盾）
  assert.equal(inbox?.[0]?.direction, 'me')
})
