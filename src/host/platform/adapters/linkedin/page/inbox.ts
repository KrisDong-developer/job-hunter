/**
 * LinkedIn 的**收件箱页面上下文函数**：解析 Messaging（/messaging/）的会话列表。
 *
 * ⚠️ **自包含警告**：本文件的函数在真机上**脱离模块作用域**执行，不得引用模块级的常量
 * 或工具函数；只做**读**（Trusted Types 红线，见 `./list.ts` 文件头）。
 *
 * ## 真机结构（2026-09-21 `probe:linkedin-actions` 登录态快照，证据
 * `.probe-linkedin-capture/actions-messaging-<日期>.html`）
 *
 * ```html
 * <ul class="list-style-none msg-conversations-container__conversations-list" aria-label="对话列表">
 *   <li class="… msg-conversation-listitem msg-conversations-container__convo-item …">
 *     <div class="msg-conversation-card …" id="conversation-card-ember48">
 *       <h3 class="msg-conversation-listitem__participant-names msg-conversation-card__participant-names …">
 *         <span>Zaira Bhatti</span>
 *       </h3>
 *       <time class="… msg-conversation-card__time-stamp">3月19日</time>
 *       <p class="msg-conversation-card__message-snippet …">Zaira发送了一个附件</p>
 *     </div>
 *   </li>
 * </ul>
 * ```
 *
 * ## 证据边界（如实，与 zhipin 的 readInbox 相比缺什么就说什么）
 *
 *   * **无未读标记**：快照里唯一的 `.notification-badge` 是**全局导航**的通知徽章，
 *     会话卡上没有任何未读类名（逐字符搜过 `unread`，只命中 i18n 字符串）→
 *     `unread` 恒 `false`（读不到就报没有，不猜）；
 *   * **无方向标记**：会话卡看不出「最后一条是谁发的」（zhipin 有 `.message-status`）→
 *     按「漏报比误报贵」口径一律 `direction: 'hr'`（zhipin inbox 同款说明）；
 *   * **无公司 / 岗位字段**：会话卡只有人名 → `company` 空串、省略 `platformJobId`
 *     （LinkedIn Messaging 是「人」维度，与猎聘同形）；
 *   * **时间不是绝对时间戳**（「3月19日」这类相对格式）—— 原样带出，由上层解释。
 */
import type { RawInboxMessage } from '../../../types.js'
import type { LinkedInInboxSelectors } from '../config.js'

/**
 * **在页面上下文里**读 Messaging 收件箱（已导航到 `/messaging/` 的活 DOM）。
 *
 * 容器找不到时**抛错**而不是返回 []：空数组会被上层读成「今天没人回我」，
 * 而 0 条必须可信（zhipin `readInboxInPage` 同款口径）。容器在而 0 行 =
 * 可信的 0 条（当前无空态文案证据，不编判据）。
 */
export function readInboxInPage(arg: { selectors: LinkedInInboxSelectors }): RawInboxMessage[] {
  const out: RawInboxMessage[] = []
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

  // ① 容器必须先找到 —— 找不到 = 选择器腐烂 / 当前不是 Messaging 页。
  let container: Element | null = null
  try {
    container = document.querySelector(arg.selectors.listContainer)
  } catch {
    container = null
  }
  if (container === null) {
    throw new Error(
      `会话列表容器未找到（${arg.selectors.listContainer}）—— 选择器可能已腐烂，或当前页面不是 Messaging`,
    )
  }

  // ② 行：每个 li 是一条会话。
  let rows: Element[] = []
  try {
    rows = Array.from(container.querySelectorAll(arg.selectors.row))
  } catch {
    return out
  }

  rows.forEach((row, index) => {
    const name = norm(row.querySelector(arg.selectors.name)?.textContent)
    if (name === '') return

    const snippet = norm(row.querySelector(arg.selectors.snippet)?.textContent)
    const time = norm(row.querySelector(arg.selectors.time)?.textContent)

    // conversationId：卡片自己的 id（如 conversation-card-ember48）。
    // ⚠️ ember 序号跨轮会变，去重键弱于 zhipin 的行 id —— 但 DOM 没有提供 thread URN
    // （逐属性搜过），退到「名字#序号」兜底（zhipin 同款兜底链）。
    const cardId = norm(row.querySelector(arg.selectors.card)?.getAttribute('id'))
    const conversationId = cardId !== '' ? cardId : `${name}#${String(index)}`

    out.push({
      conversationId,
      hrName: name,
      company: '',
      lastMessage: snippet,
      // 无方向判据（见文件头证据边界）→ 按 hr：收件箱的用途是「有没有人回我」，漏报比误报贵。
      direction: 'hr',
      unread: false,
      at: time === '' ? null : time,
    })
  })
  return out
}
