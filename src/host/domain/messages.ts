/**
 * 消息中心（§4.3 里归 `outreach`，P7 独立成服务；§13 U6）。
 *
 * **为什么从 outreach 里拆出来**：§4.3 的服务表写的是"关键方法（示意）"，
 * 而消息中心自己有完整的一套语义（会话分组、未读、回复、邀约识别、与接触态联动），
 * 塞进话术生成里会让两边都变模糊。拆开之后职责很干净：
 *   * `outreach`  = 我**生成**什么
 *   * `messages`  = 双方**往来了**什么
 *
 * ## 一条硬规则：识别 != 改状态
 *
 * §13 U6 要求"识别面试邀约"。但**识别出来只作为建议**：
 * 规则识别一定会误判（"感谢您的关注"和"邀请您面试"长得可以很像），
 * 而状态一旦被误改，用户就会漏掉一个真正在推进的岗位。
 * 所以这里只产出 `inviteSignal`，改状态是另一次显式动作（并且会写 `stage_event`）。
 */
import type { MessageDirection } from '../../shared/enums.js'
import type { InboxDto, MessageDto } from '../../shared/dto.js'
import type { Store } from '../store/store.js'
import { systemClock, type Clock } from '../util/time.js'
import { DomainError } from '../util/errors.js'

/**
 * 面试邀约的规则词表。
 *
 * 刻意**保守**：宁可漏判（用户自己看得见消息）也不要误判成"要面试了"。
 * 所以只收"几乎只可能出现在邀约里"的词，不收"沟通""聊聊"这类中性词。
 */
export const INVITE_KEYWORDS = [
  '面试',
  '面谈',
  '笔试',
  '复试',
  '初试',
  '一面',
  '二面',
  '终面',
  '视频面试',
  '电话沟通',
  '约个时间',
  '预约时间',
  '方便的时间',
  '入职时间',
  '薪资期望',
  'offer',
  '录用',
  '简历通过',
  '安排面试',
] as const

/** 只在 HR 发来的消息里找信号 —— 我自己说的"期待面试"不算邀约。 */
export function detectInvite(content: string, direction: MessageDirection): { hit: boolean; keywords: string[] } {
  if (direction !== 'hr') return { hit: false, keywords: [] }
  const hits = INVITE_KEYWORDS.filter((keyword) => content.includes(keyword))
  return { hit: hits.length > 0, keywords: [...hits] }
}

export interface MessageService {
  record(input: {
    platformId: string
    direction: MessageDirection
    content: string
    jobId?: number | null
    conversationId?: string
    attachmentRef?: string | null
    at?: string
  }): MessageDto
  inbox(filter?: { jobId?: number; unreadOnly?: boolean; limit?: number }): InboxDto
  /**
   * 回复一条消息。**高危**：这是真正对外发消息。
   * 走闸门（模型发起必然审批），并且回复内容会进审批文案的正文。
   */
  reply(input: { messageId: number; content: string; actor: string; guiConfirmed?: boolean }): Promise<MessageDto>
  markRead(id: number): boolean
  unreadCount(): number
}

export interface MessageDeps {
  store: Store
  clock?: Clock
  guardRun?: <T>(input: {
    action: string
    actor: string
    danger: 'low' | 'mid' | 'high'
    target?: { jobId?: number; platformId?: string; companyId?: number }
    payload?: Record<string, unknown>
    guiConfirmed?: boolean
  }, fn: () => Promise<T>) => Promise<T>
  logger?: { info(message: string): void; warn(message: string): void }
}

export function createMessageService(deps: MessageDeps): MessageService {
  const { store } = deps
  const clock = deps.clock ?? systemClock

  const decorate = (record: ReturnType<Store['pipeline']['createMessage']>): MessageDto => {
    const job = record.jobId === null ? undefined : store.job.detail(record.jobId)
    return {
      ...record,
      jobTitle: job?.title ?? null,
      companyName: job?.companyName ?? null,
      inviteSignal: detectInvite(record.content, record.direction),
    }
  }

  return {
    record(input): MessageDto {
      if (input.content.trim() === '') {
        throw new DomainError('INVALID_INPUT', '消息内容不能为空')
      }
      const record = store.pipeline.createMessage(
        {
          platformId: input.platformId,
          direction: input.direction,
          content: input.content,
          ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
          ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
          ...(input.attachmentRef === undefined ? {} : { attachmentRef: input.attachmentRef }),
          ...(input.at === undefined ? {} : { at: input.at }),
        },
        clock(),
      )
      const dto = decorate(record)
      // 识别到邀约信号 → 只发事件给界面提示，**不动状态**
      if (dto.inviteSignal?.hit === true) {
        deps.logger?.info(
          `[messages] 消息 #${String(dto.id)} 疑似面试邀约（命中：${dto.inviteSignal.keywords.join('、')}）—— ` +
            '只作为建议，状态需要你确认后才改',
        )
      }
      return dto
    },

    inbox(filter = {}): InboxDto {
      const items = store.pipeline
        .listMessages({
          ...(filter.jobId === undefined ? {} : { jobId: filter.jobId }),
          ...(filter.unreadOnly === undefined ? {} : { unreadOnly: filter.unreadOnly }),
          ...(filter.limit === undefined ? {} : { limit: filter.limit }),
        })
        .map(decorate)
      return { items, unread: store.pipeline.countUnread(), total: items.length }
    },

    async reply(input): Promise<MessageDto> {
      const target = store.pipeline.listMessages({ limit: 500 }).find((item) => item.id === input.messageId)
      if (target === undefined) {
        throw new DomainError('NOT_FOUND', `消息不存在：${String(input.messageId)}`, {
          detail: { messageId: input.messageId },
        })
      }
      if (input.content.trim() === '') {
        throw new DomainError('INVALID_INPUT', '回复内容不能为空')
      }
      const job = target.jobId === null ? undefined : store.job.detail(target.jobId)

      const create = async (): Promise<MessageDto> => {
        const record = store.pipeline.createMessage(
          {
            platformId: target.platformId,
            direction: 'me',
            content: input.content,
            ...(target.jobId === null ? {} : { jobId: target.jobId }),
            ...(target.conversationId === '' ? {} : { conversationId: target.conversationId }),
          },
          clock(),
        )
        return decorate(record)
      }

      const run = deps.guardRun
      const result =
        run === undefined
          ? await create()
          : await run(
              {
                action: 'message.reply',
                actor: input.actor,
                danger: 'high',
                ...(job === undefined
                  ? {}
                  : {
                      target: {
                        jobId: job.id,
                        platformId: job.platformId,
                        ...(job.companyId === null ? {} : { companyId: job.companyId }),
                      },
                    }),
                payload: {
                  // 正文进审批文案（§4.4.2），审计里只留摘要
                  text: input.content,
                  toJob: job?.title ?? '（未知岗位）',
                  company: job?.companyName ?? '',
                  replyTo: target.content.slice(0, 80),
                },
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
              },
              create,
            )
      deps.logger?.info(`[messages] 已回复消息 #${String(input.messageId)}（对方是 ${target.platformId}）`)
      return result
    },

    markRead(id): boolean {
      return store.pipeline.markMessageRead(id, clock())
    },

    unreadCount(): number {
      return store.pipeline.countUnread()
    },
  }
}
