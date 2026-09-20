/**
 * 猎聘的**会话页页面上下文函数**：元素定位（含祖先排除）、消息送达判读。
 *
 * 完整实测记录见 `../index.ts` 文件头。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 */
import type { LiepinChatSelectors } from '../config.js'

/**
 * 页面上下文的元素定位结果（拟人点击的坐标来源）。
 *
 * 与 zhipin 的 `ZhipinElementInfo` 同形：`found=false` 时坐标无意义。
 */
export interface LiepinElementInfo {
  found: boolean
  x: number
  y: number
  text: string
}

/**
 * **在页面上下文里**找一个"可点元素"并返回其视口中心坐标（自包含）。
 *
 * 与 zhipin 的 `elementCenterInPage` 的差别只有一处、但至关重要：
 * `excludeAncestor` —— 猎聘详情页上按文案找「聊一聊」时，**侧边栏的「我的沟通」
 * （`.sider-bar-item-box`）会先命中**（2026-09-19 实测踩过：白点一轮、还采不到打招呼契约），
 * 必须按祖先容器排除。
 *
 * 规则：只统计**可见**元素（有尺寸且没被 display/visibility/pointer-events 关掉）；
 * `textIncludes` 非空时按文本过滤；取**第一个命中**的。`scrollIntoView` 失败（离线夹具
 * 没有布局引擎）不视为错误 —— 夹具里 `getBoundingClientRect` 由测试注成固定矩形。
 */
export function elementCenterInPage(arg: {
  selector: string
  textIncludes?: string
  /** 命中元素的祖先里带这个选择器的一律排除（侧边栏入口）。 */
  excludeAncestor?: string
}): LiepinElementInfo {
  const empty: LiepinElementInfo = { found: false, x: 0, y: 0, text: '' }
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selector))
  } catch {
    return empty
  }
  const wanted = norm(arg.textIncludes)
  const excluded = arg.excludeAncestor ?? ''
  const visible = (el: Element): boolean => {
    try {
      const rect = el.getBoundingClientRect()
      // ⚠️ 必须写成 `window.getComputedStyle`：本函数会被序列化送进页面执行，
      // 离线夹具（jsdom）里只挂了 `window`。
      const style = window.getComputedStyle(el)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.pointerEvents !== 'none'
      )
    } catch {
      return false
    }
  }
  const inside = (el: Element, selector: string): boolean => {
    if (selector === '') return false
    try {
      return el.closest(selector) !== null
    } catch {
      return false
    }
  }
  const chosen = nodes.find(
    (el) =>
      visible(el) &&
      !inside(el, excluded) &&
      (wanted === '' || norm(el.textContent).includes(wanted)),
  )
  if (chosen === undefined) return empty
  try {
    chosen.scrollIntoView({ block: 'center', inline: 'center' })
  } catch {
    /* 离线夹具没有布局引擎 */
  }
  let rect: { x: number; y: number; width: number; height: number }
  try {
    rect = chosen.getBoundingClientRect()
  } catch {
    return empty
  }
  const viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 1024
  const viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 768
  const x = Math.min(Math.max(rect.x + rect.width / 2, 0), Math.max(0, viewportWidth - 1))
  const y = Math.min(Math.max(rect.y + rect.height / 2, 0), Math.max(0, viewportHeight - 1))
  return { found: true, x, y, text: norm(chosen.textContent).slice(0, 120) }
}

/**
 * **在页面上下文里**读"我发出的消息"，判断"我们发的那条"到了哪一步（自包含）。
 *
 * 判据全部来自 2026-09-19 / 09-20 两次实测：
 *   * 我方消息条目 `.im-ui-message-item-send`，正文 `.im-ui-txt.send`；
 *   * 每条消息内有一个 loading 图标 `.im-ui-message-item-loadingicon-send`，
 *     **空闲时带 `hide` 类** ⇒「文本在 + 图标在转」= pending，「文本在 + 图标 hide」= delivered；
 *   * 找不到对应文本 → `missing`（**绝不把"没看到"当"已送达"”）。
 *
 * ⚠️ 页面上有个别消息 web 端渲染不了（实测文案「不支持此消息查看，请登录"猎聘APP"…」）——
 *    那种文本对不上我们的话术，自然落入 missing；不会干扰同文本匹配。
 */
export function readChatMessagesInPage(arg: {
  selectors: LiepinChatSelectors
  expectText: string
}): { state: 'delivered' | 'pending' | 'missing'; count: number } {
  const norm = (value: string | null | undefined): string =>
    (value ?? '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  const expected = norm(arg.expectText)
  if (expected === '') return { state: 'missing', count: 0 }

  let nodes: Element[] = []
  try {
    nodes = Array.from(document.querySelectorAll(arg.selectors.myMessage))
  } catch {
    return { state: 'missing', count: 0 }
  }

  let matched = false
  let loading = false
  for (const node of nodes) {
    let text = ''
    try {
      const content = node.querySelector(arg.selectors.messageText)
      text = norm(content === null ? node.textContent : content.textContent)
    } catch {
      text = ''
    }
    if (text === '' || !text.includes(expected)) continue
    matched = true
    try {
      const icon = node.querySelector(arg.selectors.messageLoading)
      if (icon !== null && !(icon.getAttribute('class') ?? '').includes('hide')) loading = true
    } catch {
      /* 选择器非法就当不在转圈 */
    }
  }
  if (!matched) return { state: 'missing', count: nodes.length }
  return { state: loading ? 'pending' : 'delivered', count: nodes.length }
}

/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export function hasSelectorInPage(arg: { selector: string }): boolean {
  try {
    return document.querySelector(arg.selector) !== null
  } catch {
    return false
  }
}

/**
 * **在页面上下文里**读输入框当前的值（自包含）。
 *
 * 用途：**回车前的上屏校验** —— 猎聘这个 textarea 实测不接受只带 input 事件的
 * 插入（2026-09-20 第一次发送实验：`insertText` 后 `value` 恒空、Enter 落空）。
 * 打完字必须先确认 `value === 话术` 才按回车，否则半截/空文本发出去就是事故。
 */
export function composerValueInPage(arg: { selector: string }): string {
  try {
    const el = document.querySelector(arg.selector) as HTMLTextAreaElement | HTMLInputElement | null
    return el === null ? '' : el.value
  } catch {
    return ''
  }
}
