/**
 * 危险动作实现：**同步收件箱**（把平台会话列表读进本地消息表）。
 *
 * ⚠️ 这个文件**不在 domain 的公开面上**（§4.4.1 能力不外露）：
 * 读取本身是低危的（不对外发任何东西），但它会**开一个真实浏览器页面**去访问平台 ——
 * 因此和打招呼一样，必须经 `guard.run()` 拿到令牌后走到这里。
 * 首行就是令牌校验 —— 直接调用必然抛 `GUARD_DENIED`。
 *
 * 与 `greeting.ts` 的分工：这里只负责"把平台的会话列表读回来"，
 * "读回来的消息怎么落库"通过 `record` 回调交给 domain（消息中心）。
 */
import type { AdapterRegistry } from '../../platform/registry.js'
import type { SessionService } from '../../platform/session.js'
import type { PageSource } from '../../platform/types.js'
import { DomainError, messageOf } from '../../util/errors.js'
import { guardAuthority, type GuardToken } from '../token.js'

export const INBOX_SYNC_ACTION = 'inbox.sync'

export interface InboxSyncDeps {
  registry: AdapterRegistry
  session: SessionService
  pageSource: PageSource
  logger?: { info(message: string): void; warn(message: string): void }
  /**
   * 把一条读到的消息落库。
   *
   * 为什么是回调而不是这里直接写库：去重口径（同一会话同方向同正文算不算同一条）
   * 属于消息中心的语义，不该由安全闸门定。
   * 返回值 `created` 让这里能如实统计"新增 / 重复"。
   */
  record?: (input: {
    platformId: string
    direction: 'hr' | 'me'
    content: string
    conversationId: string
    at: string | null
  }) => { created: boolean }
}

export interface InboxSyncInput {
  platformId: string
}

export interface InboxSyncResult {
  platformId: string
  /** 平台会话列表里读到的条数。 */
  fetched: number
  /** 新写进本地消息表的条数。 */
  recorded: number
  /** 已存在、本次跳过的条数（重复同步的正常现象）。 */
  duplicates: number
  /** 平台标记为未读的条数。 */
  unread: number
}

/**
 * 同步一次收件箱。
 * @param guardToken 由 `guard.run()` 签发的一次性令牌；缺参编译不过，伪造则运行期拒绝
 */
export async function syncInbox(
  deps: InboxSyncDeps,
  guardToken: GuardToken,
  input: InboxSyncInput,
): Promise<InboxSyncResult> {
  // ── 第一行：机制化强制 ────────────────────────────────────────────
  guardAuthority.assert(guardToken, INBOX_SYNC_ACTION)

  const adapter = deps.registry.get(input.platformId)
  if (adapter === undefined) {
    throw new DomainError('NOT_FOUND', `未注册的平台：${input.platformId}`)
  }

  const account = deps.session.status(input.platformId)
  if (!account.loggedIn) {
    throw new DomainError('NOT_LOGGED_IN', `${adapter.displayName} 未登录`, {
      hint: `请先在「平台与登录」里完成 ${input.platformId} 的登录，再重试。`,
      detail: { platformId: input.platformId },
    })
  }

  const readInbox = adapter.actions?.readInbox
  if (readInbox === undefined) {
    // 诚实地说"还没做"，而不是假装读到了 0 条 —— 0 条会被误读成"没人回我"
    throw new DomainError('ADAPTER_BROKEN', `${adapter.displayName} 的适配器还没实现收件箱读取`, {
      hint:
        '在此之前同步一律失败，不会静默返回 0 条 —— 那会让你以为"今天没人回复"。' +
        '换个已实现的平台，或等适配器补上。',
      detail: { platformId: input.platformId, action: INBOX_SYNC_ACTION },
    })
  }

  const page = await deps.pageSource.acquire()
  try {
    // ⚠️ 适配器约定：`readInbox` 返回 `[]` 必须是**可信的 0 条**（列表容器在、只是没有会话）；
    //    选择器腐烂 / 当前不是会话页时它应当**抛错**（zhipin 就是这么实现的）。
    //    所以这里**不吞异常** —— 把"读不到"变成"没人回我"是这条链路上最贵的谎。
    const messages = await readInbox(page)
    let recorded = 0
    let duplicates = 0
    let unread = 0
    for (const message of messages) {
      if (message.unread) unread += 1
      const outcome = deps.record?.({
        platformId: input.platformId,
        direction: message.direction,
        content: message.lastMessage,
        conversationId: message.conversationId,
        at: message.at ?? null,
      })
      if (outcome === undefined) continue
      if (outcome.created) recorded += 1
      else duplicates += 1
    }
    deps.logger?.info(
      `[guard] ${input.platformId} 收件箱同步：读到 ${String(messages.length)} 条，` +
        `新增 ${String(recorded)}、重复 ${String(duplicates)}、未读 ${String(unread)}`,
    )
    return { platformId: input.platformId, fetched: messages.length, recorded, duplicates, unread }
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('INTERNAL', `读取收件箱失败：${messageOf(error)}`)
  } finally {
    await deps.pageSource.release(page).catch(() => undefined)
  }
}
