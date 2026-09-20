/**
 * 猎聘「高危动作」离线回归：打招呼 / 回复（2026-09-20 发送实验后落地）。
 *
 * 与 `zhipin-actions.test.ts` 同一套证明目标：
 *
 *   1. **送达语义不撒谎**：只有 `.im-ui-message-item-send` 里真的出现那条消息、
 *      且 loading 图标归 `hide` 才算 `delivered`；没确认到一律 `missing`；
 *   2. **fail-closed**：页面没有 CDP 输入面时直接失败，绝不退回 DOM `el.click()`；
 *   3. **上屏校验护栏**（猎聘特有，第一次发送实验踩出来的坑）：点击落在动画中的
 *      弹窗上、焦点没进输入框时 `insertText` 全部落空 —— 所以输入后必须校验
 *      `textarea.value`，两路键盘都不上屏就**绝不按回车**。
 *
 * 夹具是**合成 HTML**（结构照 2026-09-19 / 09-20 两次实测快照还原），
 * 保证"别在改选择器时把语义改坏"。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLiepinAdapter } from '../../src/host/platform/adapters/liepin/index.js'
import {
  DEFAULT_LIEPIN_CONFIG,
  type LiepinConfig,
} from '../../src/host/platform/adapters/liepin/config.js'
import type { HumanKeyboard, HumanMouse } from '../../src/host/platform/humanize.js'
import type { ActionResult, PageLike } from '../../src/host/platform/types.js'
import { JsdomPage } from '../support/jsdom-page.js'

const JOB_URL = 'https://www.liepin.com/job/1984775119.shtml'
const SEARCH_URL = 'https://www.liepin.com/zhaopin/?currentPage=0'
const GREETING = '您好，看到这个岗位和我的经历很匹配，方便聊聊吗？'
const COMPANY = '北京外企德科人力资源服务上海有限公司'

/** 测试用配置：关掉拟人停留、把等待与轮询压到最小。 */
const FAST_CONFIG: LiepinConfig = {
  ...DEFAULT_LIEPIN_CONFIG,
  dwellBeforeGreetMs: [0, 0],
  dwellBeforeReplyMs: [0, 0],
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

/**
 * 点击后在页面里执行的**状态机**（自包含）—— 离线夹具里所有元素共用同一个矩形，
 * "点到了哪个"没法靠坐标断言，让点击真的改变 DOM 才可观察：
 *
 *   * `sayHello` 形态：点「聊一聊」→ 渲染会话面板（受理）或 `.complete-resume-modal`（被拒）；
 *   * `reply` 形态：第一次点（抽屉入口）→ 渲染抽屉 + 会话行；第二次点（会话行）→ 渲染会话面板。
 */
function clickStateMachineInPage(arg: { mode: 'accept' | 'reject' | 'drawer' }): void {
  // ⚠️ 会话行里的公司名必须**内联**（本函数会被序列化送进页面执行，模块级常量不可见）
  const companies = ['北京外企德科人力资源服务上海有限公司', '南京正大天晴制药有限公司']
  const existing = document.querySelector('.im-ui-chat-modal-container, .ant-im-drawer')
  if (existing !== null) {
    // 第二次点击（reply：点会话行）→ 渲染会话面板
    if (document.querySelector('.im-ui-chat-modal-container') === null) {
      const modal = document.createElement('div')
      modal.className = 'im-ui-chat-modal-container'
      const tip = document.createElement('div')
      tip.className = 'im-ui-system-tip'
      tip.textContent = '您可以修改打招呼语，去修改＞＞'
      const composer = document.createElement('textarea')
      composer.className = 'ant-im-input ant-im-input-borderless im-ui-textarea'
      composer.setAttribute('rows', '2')
      composer.setAttribute('placeholder', '请输入文字，按Enter键发送')
      modal.appendChild(tip)
      modal.appendChild(composer)
      document.body.appendChild(modal)
    }
    return
  }
  if (arg.mode === 'reject') {
    const modal = document.createElement('div')
    modal.className = 'complete-resume-modal'
    modal.textContent = '完善简历，提高沟通效率立即完善简历'
    document.body.appendChild(modal)
    return
  }
  if (arg.mode === 'drawer') {
    const drawer = document.createElement('div')
    drawer.className = 'ant-im-drawer'
    for (const company of companies) {
      const row = document.createElement('div')
      row.className = 'im-ui-contact-list-item im-ui-contact-item'
      const name = document.createElement('div')
      name.className = 'im-ui-contact-title-name'
      name.textContent = '何女士'
      const sub = document.createElement('div')
      sub.className = 'im-ui-contact-title-sub'
      sub.textContent = `HR·${company}`
      row.appendChild(name)
      row.appendChild(sub)
      drawer.appendChild(row)
    }
    document.body.appendChild(drawer)
    return
  }
  // accept：渲染会话面板（open-chat 受理的 DOM 证据）
  const modal = document.createElement('div')
  modal.className = 'im-ui-chat-modal-container'
  const tip = document.createElement('div')
  tip.className = 'im-ui-system-tip'
  tip.textContent = '您可以修改打招呼语，去修改＞＞'
  const composer = document.createElement('textarea')
  composer.className = 'ant-im-input ant-im-input-borderless im-ui-textarea'
  composer.setAttribute('rows', '2')
  composer.setAttribute('placeholder', '请输入文字，按Enter键发送')
  modal.appendChild(tip)
  modal.appendChild(composer)
  document.body.appendChild(modal)
}

/** 在页面上下文里把一条"我发出的"消息追加进会话面板（模拟 WS 推送 render）。⚠️ 自包含。 */
function appendOwnMessageInPage(arg: { text: string; loading?: boolean }): void {
  const modal = document.querySelector('.im-ui-chat-modal-container')
  if (modal === null) return
  const body = document.createElement('div')
  body.className = 'im-ui-message-item-body im-ui-message-item-send'
  const text = document.createElement('div')
  text.className = 'im-ui-txt send'
  text.textContent = arg.text
  const icon = document.createElement('div')
  icon.className = `im-ui-message-item-loadingicon im-ui-message-item-loadingicon-send${arg.loading === true ? '' : ' hide'}`
  body.appendChild(text)
  body.appendChild(icon)
  modal.appendChild(body)
}

/** 把输入框的 value 设成 buffer（模拟"键盘输入被受控组件接受"）。⚠️ 自包含。 */
function setComposerValueInPage(arg: { selector: string; value: string }): void {
  const el = document.querySelector(arg.selector) as HTMLTextAreaElement | null
  if (el !== null) el.value = arg.value
}

interface ActionPageOptions {
  html: string
  url: string
  /** 交互面：`'full'` = 有 mouse+keyboard；`'none'` = 都没有（fail-closed 用例）。 */
  interaction?: 'full' | 'none'
  /** 点击后的 DOM 状态机形态。 */
  clickMode?: 'accept' | 'reject' | 'drawer'
  /** 按 URL 换内容（reply 要"从搜索页进抽屉"）。 */
  loader?: (url: string) => string | undefined
  /**
   * 模拟**焦点丢失**（第一次发送实验的失败形态）：insertText / type 都不写 value
   * ⇒ `typeIntoComposer` 两路校验都失败 ⇒ 绝不能按回车。
   */
  dropFocus?: boolean
  /** Enter 之后渲染的消息是否停在"发送中"（loading 图标不带 hide）。 */
  pendingAfterSend?: boolean
}

/**
 * 造一个带 CDP 输入面的离线页面。
 *
 * `keyboard.press('Enter')` 会把"输入框里累计的文本"渲染成一条我方消息 ——
 * 这是离线夹具里唯一能触发"消息出现"的手段，也让送达校验有东西可校验。
 */
function actionPage(options: ActionPageOptions): {
  page: PageLike
  mouse: RecordingMouse
  typed: string[]
  enters: number
} {
  const inner = new JsdomPage({
    html: options.html,
    url: options.url,
    layout: true,
    ...(options.loader === undefined ? {} : { loader: options.loader }),
  })
  const clickMode = options.clickMode ?? 'accept'
  const mouse = new RecordingMouse(async () => {
    await inner.evaluate(
      asSerialized(clickStateMachineInPage as unknown as (arg: { mode: string }) => void),
      { mode: clickMode } as never,
    )
  })
  const typed: string[] = []
  const enters = { count: 0 }
  let buffer = ''

  const keyboard: HumanKeyboard = {
    async press(key: string): Promise<void> {
      if (key === 'Backspace') {
        buffer = ''
        if (!options.dropFocus) {
          await inner.evaluate(asSerialized(setComposerValueInPage), {
            selector: 'textarea.im-ui-textarea',
            value: '',
          })
        }
        return
      }
      if (key === 'Enter') {
        enters.count += 1
        const text = buffer
        buffer = ''
        if (text !== '') {
          await inner.evaluate(asSerialized(appendOwnMessageInPage as unknown as (arg: { text: string }) => void), {
            text,
            ...(options.pendingAfterSend === true ? { loading: true } : {}),
          } as never)
        }
        return
      }
      /* KeyA / 功能键：离线夹具无需处理 */
    },
    async insertText(text: string): Promise<void> {
      buffer += text
      typed.push(text)
      if (!options.dropFocus) {
        await inner.evaluate(asSerialized(setComposerValueInPage), {
          selector: 'textarea.im-ui-textarea',
          value: buffer,
        })
      }
    },
    // 真键盘路径（回退用）：与 insertText 同款行为 —— dropFocus 模式下同样不写 value
    async type(text: string): Promise<void> {
      buffer += text
      typed.push(text)
      if (!options.dropFocus) {
        await inner.evaluate(asSerialized(setComposerValueInPage), {
          selector: 'textarea.im-ui-textarea',
          value: buffer,
        })
      }
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
    ...(options.interaction === 'none' ? {} : { mouse, keyboard }),
  }
  return {
    page,
    mouse,
    typed,
    get enters(): number {
      return enters.count
    },
  }
}

/**
 * 岗位详情页：侧边栏 decoy（含「聊」字、且**文档顺序在前**）+ 真入口 `a.btn-main`。
 * decoy 存在且不带排除容器时会先命中 —— 这正是 `chatButtonExclude` 的存在理由。
 */
const DETAIL_PAGE_HTML = `
<html><head><title>Java工程师_某某科技招聘</title></head><body>
  <div class="sider-bar-item-box"><a class="btn-chat" href="javascript:;">和TA聊聊</a></div>
  <div class="apply-box"><a class="btn-minor" href="javascript:;">投简历</a><a class="btn-main" href="javascript:;">聊一聊</a></div>
</body></html>`

/** 搜索页：IM 抽屉入口（内层 `.im-ui-basic-entry` —— reply 等的就是这个懒加载产物）。 */
const SEARCH_PAGE_HTML = `
<html><body>
  <div id="im-c-entry"><div class="im-ui-basic-entry"><div class="im-ui-basic-entry-title">有新消息</div></div></div>
</body></html>`

const JOB = { title: 'Java工程师', company: COMPANY, sourceUrl: JOB_URL }

function adapter(): ReturnType<typeof createLiepinAdapter> {
  return createLiepinAdapter({ config: FAST_CONFIG })
}

// ── sayHello ──────────────────────────────────────────────────────────

test('sayHello：成功路径 —— 受理（面板出现）→ 逐字输入（value 校验过）→ 回车 → 我方消息出现 ⇒ delivered', async () => {
  const { page, typed } = actionPage({ html: DETAIL_PAGE_HTML, url: JOB_URL })
  const result: ActionResult | undefined = await adapter().actions?.sayHello?.(page, JOB, GREETING)

  assert.equal(result?.ok, true)
  assert.equal(result?.delivery, 'delivered')
  assert.equal(result?.evidence, 'dom')
  assert.equal(result?.idempotentHit, undefined)
  // 逐字符输入确实发生（humanType 一次一字符）
  assert.equal(typed.join(''), GREETING)
})

test('sayHello：消息级幂等 —— 会话里已有同文本（已送达）⇒ 不重发（idempotentHit）', async () => {
  const { page, typed } = actionPage({ html: DETAIL_PAGE_HTML, url: JOB_URL })
  const act = adapter().actions
  assert.equal((await act?.sayHello?.(page, JOB, GREETING))?.delivery, 'delivered')
  const typedAfterFirst = typed.length
  const again = await act?.sayHello?.(page, JOB, GREETING)
  assert.equal(again?.ok, true)
  assert.equal(again?.idempotentHit, true, '同文本已存在 ⇒ 不重发')
  assert.equal(typed.length, typedAfterFirst, '第二次没有再打一个字')
})

test('sayHello：被拒路径 —— 弹「简历完整度不足」（open-chat 30011 的 DOM 证据）⇒ missing，一个字都不打', async () => {
  const { page, typed } = actionPage({
    html: DETAIL_PAGE_HTML,
    url: JOB_URL,
    clickMode: 'reject',
  })
  const result = await adapter().actions?.sayHello?.(page, JOB, GREETING)

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.match(String(result?.message), /简历完整度不足/)
  assert.equal(typed.length, 0, '被拒后绝不输入')
})

test('sayHello：上屏失败（焦点陷阱）⇒ 不按回车、如实报 missing —— 第一次发送实验踩的那个坑', async () => {
  const { page, enters } = actionPage({
    html: DETAIL_PAGE_HTML,
    url: JOB_URL,
    dropFocus: true,
  })
  const result = await adapter().actions?.sayHello?.(page, JOB, GREETING)

  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'missing')
  assert.match(String(result?.message), /没有按回车/)
  assert.equal(enters, 0, '回车一次都没按 —— 空框/半截文本发出去就是事故')
})

test('sayHello：回车后消息停在「发送中」（loading 图标没归 hide）⇒ pending，不谎报 delivered', async () => {
  const { page } = actionPage({
    html: DETAIL_PAGE_HTML,
    url: JOB_URL,
    pendingAfterSend: true,
  })
  const result = await adapter().actions?.sayHello?.(page, JOB, GREETING)
  assert.equal(result?.ok, false)
  assert.equal(result?.delivery, 'pending')
})

test('sayHello：详情页没有「聊一聊」入口 ⇒ missing（不重试）', async () => {
  const { page } = actionPage({
    html: '<html><body><div class="apply-box"><a class="btn-minor">投简历</a></div></body></html>',
    url: JOB_URL,
  })
  const result = await adapter().actions?.sayHello?.(page, JOB, GREETING)
  assert.equal(result?.delivery, 'missing')
  assert.match(String(result?.message), /没出现「聊一聊」/)
})

// ── reply ─────────────────────────────────────────────────────────────

test('reply：成功路径 —— 搜索页 → 开抽屉 → 点公司匹配的会话行 → 面板 → 输入回车 ⇒ delivered', async () => {
  const { page, typed } = actionPage({
    html: SEARCH_PAGE_HTML,
    url: SEARCH_URL,
    clickMode: 'drawer',
  })
  const result = await adapter().actions?.reply?.(page, JOB, GREETING)

  assert.equal(result?.ok, true)
  assert.equal(result?.delivery, 'delivered')
  assert.equal(typed.join(''), GREETING)
})

test('reply：会话列表里没有这家公司的会话 ⇒ missing，绝不猜一条', async () => {
  const { page } = actionPage({
    html: SEARCH_PAGE_HTML,
    url: SEARCH_URL,
    clickMode: 'drawer',
  })
  const result = await adapter().actions?.reply?.(page, {
    ...JOB,
    company: '不存在的公司',
    title: '不存在的岗位',
  }, GREETING)
  assert.equal(result?.delivery, 'missing')
  assert.match(String(result?.message), /没找到/)
})

test('reply：「我的沟通」入口没渲染（内层懒加载未完成）⇒ missing —— 等的是内层选择器，不是外层 #im-c-entry', async () => {
  const { page } = actionPage({
    // 外层在、内层不在：真实形态（2026-09-20 快照实测详情页就是这个样子）
    html: '<html><body><div id="im-c-entry"></div></body></html>',
    url: SEARCH_URL,
    clickMode: 'drawer',
  })
  const result = await adapter().actions?.reply?.(page, JOB, GREETING)
  assert.equal(result?.delivery, 'missing')
  assert.match(String(result?.message), /入口没渲染/)
})

// ── fail-closed（与 zhipin 同一条纪律）─────────────────────────────────

test('没有 CDP 输入面 ⇒ sayHello / reply 都 fail-closed（绝不退回 DOM 事件）', async () => {
  const detail = actionPage({ html: DETAIL_PAGE_HTML, url: JOB_URL, interaction: 'none' })
  const search = actionPage({ html: SEARCH_PAGE_HTML, url: SEARCH_URL, interaction: 'none', clickMode: 'drawer' })
  const act = adapter().actions

  const hello = await act?.sayHello?.(detail.page, JOB, GREETING)
  assert.equal(hello?.ok, false)
  assert.equal(hello?.delivery, 'missing')
  assert.match(String(hello?.message), /CDP 输入能力/)

  const reply = await act?.reply?.(search.page, JOB, GREETING)
  assert.equal(reply?.ok, false)
  assert.match(String(reply?.message), /CDP 输入能力/)
})
