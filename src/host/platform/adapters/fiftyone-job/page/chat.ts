/**
 * 51job 的**沟通面页面上下文函数**：沟通入口状态、投递（选简历）弹窗状态、消息送达判读。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { FiftyOneChatSelectors } from '../config.js'

/**
 * **在页面上下文里**读沟通入口点击后的形态。
 *
 * 为什么需要它（真实夹具 `51job-sz.html` 的实证）：51job 的「去聊聊」（卡片右侧
 * `.chat`）在**未登录**视图弹出的是 `.chat-popover` —— 里面是 HR 名/头衔（`.hr-name` /
 * `.hr-position`）+ 文案「微信扫码与我聊聊吧」（`.hr-tip`）+ 二维码（`.qrcode`）。
 * 也就是说**这一侧根本没有可输入的会话框**：把"点了去聊聊"当成"消息已发出"是这条
 * 链路上最容易撒的谎。登录态下点它会进什么形态（站内 IM？）本仓未实测 —— 所以这里
 * 只如实报告三种状态：`qr-popover`（未登录扫码引导）/ `chat-input`（出现了输入面）/
 * `none`（什么都没出现）。
 *
 * ⚠️ 必须完全自包含。
 */
export function chatEntryStateInPage(arg: {
  selectors: FiftyOneChatSelectors
}): { kind: 'qr-popover' | 'chat-input' | 'none'; hrName: string; tip: string } {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      return (
        rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      )
    } catch {
      return false
    }
  }
  try {
    // ① 微信扫码弹层（实测形态）：在场即「未登录 / 引导扫码」，没有可输入面
    for (const popover of Array.from(document.querySelectorAll(arg.selectors.chatQrPopover))) {
      if (!visible(popover)) continue
      const tip = norm(popover.querySelector(arg.selectors.chatQrTip)?.textContent)
      if (tip !== '' || popover.querySelector(arg.selectors.chatQrCode) !== null) {
        return {
          kind: 'qr-popover',
          hrName: norm(popover.querySelector(arg.selectors.hrName)?.textContent),
          tip,
        }
      }
    }
    // ② 站内会话输入面（登录态形态，候选未实测）：有输入框就算进了会话
    if (arg.selectors.chatInput !== '') {
      for (const input of Array.from(document.querySelectorAll(arg.selectors.chatInput))) {
        if (visible(input)) return { kind: 'chat-input', hrName: '', tip: '' }
      }
    }
  } catch {
    /* 选择器非法 → none */
  }
  return { kind: 'none', hrName: '', tip: '' }
}

/**
 * **在页面上下文里**读投递（选择简历）弹窗的状态。
 *
 * 证据（真实夹具 `51job-sz.html` 里随页面带的组件样式，2026-09-21 摘录）：
 *
 * ```
 * .apply-component-resume-dialog          ← 弹窗外壳（Element Plus el-dialog）
 *   .el-dialog__body
 *     .title（「选择投递简历」）
 *     .pc-apply-resume                    ← 简历条目列表
 *       .pc-apply-resume__row             ← 单条（row + row 兄弟选择器实证逐条渲染）
 *         .pc-apply-resume__label / __selects / __select--resume
 *   .el-dialog__footer .el-button--primary ← 确认按钮
 * .apply-component-hint-dialog            ← 另一种提示形态（同样有 footer 按钮）
 * .success_title / .tips                  ← 成功提示文案
 * ```
 *
 * ⚠️ 组件**运行时才挂载**（点了「投递」才出现），所以夹具里只有样式证据、没有
 * markup 原文；条目与按钮的禁用态沿用 Element Plus 惯例（`disabled` 类 + `disabled`
 * 属性两种都认），与 zhipin 简历弹窗同款判法。
 * ⚠️ 必须完全自包含。
 */
export function applyDialogStateInPage(arg: {
  selectors: FiftyOneChatSelectors
}): {
  found: boolean
  rowCount: number
  confirmFound: boolean
  confirmDisabled: boolean
  hintText: string
} {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  const missing = { found: false, rowCount: 0, confirmFound: false, confirmDisabled: false, hintText: '' }
  let dialog: Element | null = null
  try {
    dialog = document.querySelector(arg.selectors.applyDialog)
  } catch {
    dialog = null
  }
  if (dialog === null) {
    // 提示形态兜底：`.apply-component-hint-dialog`（如「今日投递太多」这类平台提示）
    try {
      dialog = document.querySelector(arg.selectors.applyHintDialog)
    } catch {
      dialog = null
    }
  }
  if (dialog === null) return missing
  const box: Element = dialog

  const count = (selector: string): number => {
    if (selector === '') return 0
    try {
      return box.querySelectorAll(selector).length
    } catch {
      return 0
    }
  }
  let confirm: Element | null = null
  try {
    confirm = box.querySelector(arg.selectors.applyDialogConfirm)
  } catch {
    confirm = null
  }
  const className = (confirm?.getAttribute('class') ?? '').toLowerCase()
  return {
    found: true,
    rowCount: count(arg.selectors.applyResumeRow) + count(arg.selectors.applyResumeSelect),
    confirmFound: confirm !== null,
    // 两种写法都要认：类名里的 `disabled`（Element Plus 惯例）与元素属性 `disabled`
    confirmDisabled:
      confirm !== null && (className.split(/\s+/).includes('disabled') || confirm.hasAttribute('disabled')),
    hintText: norm(box.textContent).slice(0, 160),
  }
}

/**
 * **在页面上下文里**读会话消息，判断"我们发的那条"到了哪一步。
 *
 * ⚠️ 51job 站内会话的 DOM **未实测**（登录态夹具缺位），判据沿 zhipin 的
 * `readChatMessagesInPage` 同款口径：比对前去零宽字符与「发送中/已读」尾标；
 * 状态节点类名认 `error` → failed、`loading`/`sending` → pending、其余 → delivered；
 * 找不到对应消息 → `missing`（**绝不能**把"没看到"当成"已送达"）。
 * ⚠️ 必须完全自包含。
 */
export function readChatMessagesInPage(arg: {
  selectors: FiftyOneChatSelectors
  expectText: string
}): { state: 'delivered' | 'pending' | 'failed' | 'missing' } {
  const norm = (value: string | null | undefined): string =>
    (value ?? '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  const stripTail = (value: string): string =>
    norm(value)
      .replace(/(发送中|已读|未读|送达|发送成功|重试|重新发送)$/g, '')
      .trim()
  const expected = norm(arg.expectText)
  if (expected === '') return { state: 'missing' }

  let list: Element | null = null
  try {
    list = document.querySelector(arg.selectors.messageList)
  } catch {
    list = null
  }
  if (list === null) return { state: 'missing' }

  let nodes: Element[] = []
  try {
    nodes = Array.from(list.querySelectorAll(arg.selectors.myMessage))
  } catch {
    nodes = []
  }
  const states: Array<'delivered' | 'pending' | 'failed'> = []
  for (const node of nodes) {
    let text = ''
    try {
      const content = node.querySelector(arg.selectors.messageText)
      text = stripTail(content === null ? node.textContent : content.textContent)
    } catch {
      text = ''
    }
    if (text === '' || !text.includes(expected)) continue
    let statusClass = ''
    try {
      statusClass = node.querySelector(arg.selectors.messageStatus)?.getAttribute('class') ?? ''
    } catch {
      statusClass = ''
    }
    const lower = statusClass.toLowerCase()
    states.push(
      lower.includes('error') ? 'failed' : lower.includes('loading') || lower.includes('sending') ? 'pending' : 'delivered',
    )
  }
  if (states.length === 0) return { state: 'missing' }
  if (states.includes('delivered')) return { state: 'delivered' }
  if (states.includes('pending')) return { state: 'pending' }
  return { state: 'failed' }
}
