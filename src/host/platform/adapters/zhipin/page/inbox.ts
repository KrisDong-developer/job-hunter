/**
 * BOSS 直聘的**收件箱页面上下文函数**：读会话列表、按会话行判定接触阶段。
 *
 * ⚠️ 这些函数会被 `page.evaluate` 序列化后送进浏览器执行，在真机上**脱离模块作用域**：
 * 本文件**不得**新增任何模块级的值（常量 / 工具函数）供它们引用 —— 需要共享的值必须
 * 内联进函数体。离线 jsdom 测不出这个错（Node 里闭包还在），一上真机就整页解析失败。
 * 完整实测记录见 `../index.ts` 文件头。
 */
import type { ContactStage } from '../../../../../shared/contract/enums/pipeline.js'
import type { RawInboxMessage } from '../../../types.js'
import type { ZhipinInboxSelectors } from '../config.js'

/**
 * **在页面上下文里**解析收件箱（求职者端会话列表）。
 *
 * 结构（BossHunter `JS_EXTRACT_CHAT_LIST` 实测）：
 *   li[role=listitem]
 *     ├ .name-box                              ← 名字容器
 *     │    ├ span[0] = HR 名
 *     │    ├ span[1] = 公司名
 *     │    └ span[last] = HR 头衔
 *     ├ .name-text                             ← HR 名（独立节点，更稳）
 *     ├ .last-msg-text                         ← 最后一条消息
 *     └ .message-status                        ← 方向线索（status-read/status-delivery 是"我发的"）
 *
 * `direction`：`RawInboxMessage` 只有 `hr | me` 两档。分不清时**按 hr 记**
 * —— 收件箱的用途是"有没有人回我"，漏报比误报贵（BossHunter 同样把不确定行
 * 当作候选回复来处理）。
 *
 * ⚠️ 必须完全自包含。
 */
export function readInboxInPage(arg: { selectors: ZhipinInboxSelectors }): RawInboxMessage[] {
  const out: RawInboxMessage[] = []
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()

  // ① 容器必须先找到。找不到就是"选择器腐烂 / 当前不是求职者端会话页"——
  //    这里**抛错**而不是返回 []：空数组会被上层读成"今天没人回我"，
  //    那正是 `syncInbox` 反复强调不许发生的事（0 条必须可信）。
  let container: Element | null = null
  if (arg.selectors.listContainer !== '') {
    try {
      container = document.querySelector(arg.selectors.listContainer)
    } catch {
      container = null
    }
    if (container === null) {
      throw new Error(
        `会话列表容器未找到（${arg.selectors.listContainer}）—— 选择器可能已腐烂，或当前页面不是求职者端会话页`,
      )
    }
    // ② 空态：容器在 + 页面自报"暂无联系人" → 这才是**可信的 0 条**，如实返回空数组
    try {
      if (arg.selectors.emptyState !== '' && container.querySelector(arg.selectors.emptyState) !== null) {
        return out
      }
    } catch {
      /* 选择器非法 → 继续按行解析 */
    }
    try {
      const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, '')
      if (bodyText.includes('暂无联系人') || bodyText.includes('暂无沟通')) return out
    } catch {
      /* ignore */
    }
  }

  let rows: Element[] = []
  try {
    rows = Array.from(document.querySelectorAll(arg.selectors.row))
  } catch {
    return out
  }

  rows.forEach((row, index) => {
    let name = ''
    try {
      name = norm(row.querySelector(arg.selectors.name)?.textContent)
    } catch {
      name = ''
    }
    if (name === '') return

    let company = ''
    try {
      // ⚠️ 必须**先取容器再取 span**，不能拼 `${nameBox} span`：
      //    nameBox 是逗号候选列表，拼出来会变成 `.name-box, .name-contet span` ——
      //    逗号优先级最低，`.name-box`（容器本身）也会被选中，spans[1] 就取错了。
      const nameBox = row.querySelector(arg.selectors.nameBox)
      const spans = nameBox === null ? [] : Array.from(nameBox.querySelectorAll('span'))
      const second = spans[1]
      company = second === undefined ? '' : norm(second.textContent)
    } catch {
      company = ''
    }

    let lastMessage = ''
    let lastClass = ''
    try {
      const node = row.querySelector(arg.selectors.lastMessage)
      lastMessage = norm(node?.textContent)
      lastClass = (node?.getAttribute('class') ?? '').toLowerCase()
    } catch {
      lastMessage = ''
    }

    let statusClass = ''
    try {
      statusClass = (row.querySelector(arg.selectors.status)?.getAttribute('class') ?? '').toLowerCase()
    } catch {
      statusClass = ''
    }
    // 判据一（主）：`.message-status` 这个节点**只出现在我们发出的消息上**（文案形如 `[送达]` / `[已读]`），
    //   所以只要节点在，方向就是"我发的" —— 不要求认得出具体状态类名。
    //   曾经这里靠类名（`status-read` / `status-delivery`）判定：平台改一次类名，整行方向就读反了
    //   （HR 的会话被记成"我发的"，并在本地写出一条假消息）。`detectStageInPage` 用的是
    //   "节点在即我发的" —— 两处必须一致，否则同一行会被读成两种方向。
    // 判据二（兜底）：类名里带 myself / self / …（旧版式与离线夹具）。
    const isOurs = statusClass !== '' || /(myself|self|mine|outgoing|send)/.test(lastClass)

    let unread = false
    try {
      unread = row.querySelector(arg.selectors.unread) !== null
    } catch {
      unread = false
    }

    // ✅ 2026-09-18 实测：时间节点是 `.time`（形如 `00:53`）—— 之前一直没着落，所以留的 null
    let time = ''
    try {
      time = norm(row.querySelector(arg.selectors.time)?.textContent)
    } catch {
      time = ''
    }

    const rawId = row.getAttribute('id') ?? ''
    const conversationId =
      rawId !== '' ? rawId : company === '' ? `${name}#${String(index)}` : `${name}|${company}`

    out.push({
      conversationId,
      hrName: name,
      company,
      lastMessage,
      direction: isOurs ? 'me' : 'hr',
      unread,
      // 平台这里给的是「今天/昨天」这类相对时间（如 `00:53`），**不是**绝对时间戳 —— 原样带出去，
      // 由上层决定怎么解释（编一个日期比留原文更糟）。
      at: time === '' ? null : time,
    })
  })
  return out
}

/**
 * **在页面上下文里**判断某个岗位当前的接触阶段。
 *
 * 判据只用**已实测**的收件箱选择器（2026-09-18）：
 *   `.time` / `.name-text` / `.name-box` / `.last-msg-text` / `.message-status` / 未读徽章。
 *
 * ⚠️ 认不出来就返回 `null` 并带上原因，**绝不猜**：
 *   * 列表里没有这一行 → 分不清"从没打过招呼"与"会话已超出平台保留窗口"，返回 `none` 会写错账；
 *   * 状态类名不认识 → 返回 `null`，让上层**保留原值**而不是被降级。
 * ⚠️ 必须完全自包含。
 */
export function detectStageInPage(arg: {
  selectors: ZhipinInboxSelectors
  company: string
  title: string
}): { stage: ContactStage | null; reason: string } {
  const norm = (value: string | null | undefined): string => (value ?? '').replace(/\s+/g, ' ').trim()
  let container: Element | null = null
  if (arg.selectors.listContainer !== '') {
    try {
      container = document.querySelector(arg.selectors.listContainer)
    } catch {
      container = null
    }
    if (container === null) {
      return { stage: null, reason: `会话列表容器未找到（${arg.selectors.listContainer}）—— 判不出阶段` }
    }
  }

  let rows: Element[] = []
  try {
    rows = Array.from(document.querySelectorAll(arg.selectors.row))
  } catch {
    rows = []
  }
  const hints = [norm(arg.company), norm(arg.title)].filter((hint) => hint !== '')
  if (hints.length === 0) return { stage: null, reason: '岗位没有公司名也没有标题，无法在会话列表里定位' }
  const row = rows.find((node) => {
    const text = norm(node.textContent)
    return hints.some((hint) => text.includes(hint))
  })
  if (row === undefined) {
    return {
      stage: null,
      reason: '会话列表里没有这个岗位的会话（可能从未打过招呼，或平台已把它移出保留窗口）—— 不写成 none',
    }
  }

  let statusClass = ''
  let hasStatus = false
  try {
    const node = row.querySelector(arg.selectors.status)
    hasStatus = node !== null
    statusClass = (node?.getAttribute('class') ?? '').toLowerCase()
  } catch {
    hasStatus = false
    statusClass = ''
  }
  let lastClass = ''
  try {
    lastClass = (row.querySelector(arg.selectors.lastMessage)?.getAttribute('class') ?? '').toLowerCase()
  } catch {
    lastClass = ''
  }
  let unread = false
  try {
    unread = row.querySelector(arg.selectors.unread) !== null
  } catch {
    unread = false
  }

  if (unread) return { stage: 'replied', reason: '会话有未读，说明 HR 发了新消息' }
  // 「这条是不是我发的」看**节点在不在**，不看类名认不认得出 —— 见 `readInboxInPage` 里同一处的说明
  const ours = hasStatus || /(myself|self|mine|outgoing|send)/.test(lastClass)
  if (!ours) return { stage: 'replied', reason: '最后一条不是我们发的 → HR 已回复' }
  // ⚠️ `status-read` 这一档**代码支持但尚未实测**（还没见过被已读的样本）
  if (statusClass.includes('status-read')) return { stage: 'read', reason: '.message-status 为 status-read' }
  if (statusClass.includes('status-delivery')) {
    return { stage: 'delivered', reason: '.message-status 为 status-delivery（已送达，未见已读）' }
  }
  return {
    stage: null,
    reason: `最后一条是我们发的，但状态类名认不出来（class="${statusClass}"）—— 不猜`,
  }
}
