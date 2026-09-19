/**
 * 触达与消息工具：打招呼话术、发送、收件箱同步、接触阶段探测、消息读取与回复。
 *
 * 危险级分层在这个文件里体现得最清楚：
 *   · 只读 / 只看不发（`greeting_draft`、`contact_stage`、`inbox_list`）→ 低危，不审批；
 *   · 真的对外发东西（`greeting_send`、`message_reply`）→ 高危，必然过闸门 + 用户审批。
 * 工具层**没有**绕过闸门的能力：它只调用 `runtime` 上那几个已经接了 guard 的方法。
 */
import type { ToolDefinition } from '../../shared/dsh.js'
import { CONTACT_STAGE_LABEL, MANUAL_CONTACT_STAGES } from '../../shared/enums.js'
import type { ManualContactStage } from '../../shared/enums.js'
import { TONE_LABEL } from '../../shared/labels.js'
import type { HostRuntime } from '../runtime.js'
import { DomainError } from '../util/errors.js'
import {
  asString,
  enumStr,
  int,
  positiveId,
  renderText,
  requireData,
  schema,
  str,
  textResult,
  toInt,
  toolDefiner,
} from './kit.js'

export function outreachTools(runtime: HostRuntime): ToolDefinition[] {
  const tool = toolDefiner(runtime)

  return [
    tool<Record<string, unknown>, { text: string }>({
      name: 'greeting_draft',
      description:
        '为某个岗位生成打招呼话术。**只生成，不发送** —— 发送要用 greeting_send 并经过用户审批。' +
        '模型不可用时会退回内置模板，返回里会如实说明是哪种。',
      parameters: schema(
        {
          jobId: int('岗位 id'),
          tone: enumStr(['formal', 'warm', 'concise'], '语气'),
          highlights: {
            type: 'array',
            items: { type: 'string' },
            description: '要突出的经历要点（最多 3 条）',
          },
        },
        ['jobId'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const id = positiveId(args.jobId, 'jobId')
        const tone = asString(args['tone'])
        if (tone !== undefined && !(tone in TONE_LABEL)) {
          throw new DomainError('INVALID_INPUT', `tone 取值不合法：${tone}`, {
            hint: `合法取值：${Object.keys(TONE_LABEL).join(' / ')}`,
          })
        }
        const highlights = Array.isArray(args['highlights'])
          ? args['highlights'].filter((item): item is string => typeof item === 'string').slice(0, 3)
          : undefined

        const draft = await runtime.draftGreeting({
          jobId: id,
          ...(tone === undefined ? {} : { tone: tone as 'formal' | 'warm' | 'concise' }),
          ...(highlights === undefined ? {} : { highlights }),
        })

        const source =
          draft.via === 'llm' ? '来源：模型生成' : `来源：内置模板（${draft.notes.join('；') || '未调用模型'}）`
        const egress =
          draft.outboundFields.length === 0
            ? '本次没有数据发给模型'
            : `发给模型的字段：${draft.outboundFields.join('、')}`
        return {
          text: [
            `#${String(draft.jobId)} 打招呼话术（${source}）`,
            '',
            draft.text,
            '',
            `（${String(draft.text.length)} 字）${egress}`,
            '这段还没有发送。要发的话用 greeting_send，它会先让你确认。',
          ].join('\n'),
        }
      },
    }),

    tool<Record<string, unknown>, { text: string; jobId: number }>({
      name: 'greeting_send',
      description:
        '**发送**打招呼（高危，必须经用户审批）。会依次检查：功能开关 → 隐身 → 额度 → 冷却期 → 用户审批。\n' +
        '单条：给 `jobId`。不传 text 就先按岗位生成一段再交给用户确认。\n' +
        '**批量**：给 `jobIds`（每个平台能发的数量有限，同一次调用受批量上限约束，' +
        '见设置里的"批量上限"，超出必须分批）。批量是**逐条过闸门、逐条回执**：\n' +
        '· **每一条都会单独问你一次审批** —— 这是刻意的，一次问 5 条会让人看不清自己在批准什么；\n' +
        '· 一条失败不影响其它条，返回值里有逐条的成功/失败原因；\n' +
        '· 条与条之间宿主会插入 3–9 秒随机间隔（D3 的"随机间隔"），所以批量会明显慢。\n' +
        '⚠️ 不是所有平台都能发：只有适配器实现了打招呼动作的才行（其余会在闸门处如实报错，' +
        '不会静默变成"已发送"）。',
      timeoutMs: 6 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id（单条发送用；与 jobIds 二选一）'),
          jobIds: {
            type: 'array',
            items: { type: 'integer' },
            description: '岗位 id 数组（批量发送用；与 jobId 二选一）',
          },
          text: str('要发送的话术全文；不填则先生成一段（批量时忽略，逐条各自生成）'),
        },
        [],
      ),
      outputSchema: {
        type: 'object',
        properties: { text: { type: 'string' }, jobId: { type: 'integer' } },
      },
      render: renderText,
      async run(args) {
        requireData(runtime)
        const text = asString(args['text'])
        const jobIds = (Array.isArray(args['jobIds']) ? args['jobIds'] : []).filter(
          (item): item is number => typeof item === 'number' && item > 0,
        )

        // ── 批量：逐条过闸门、逐条回执 ──────────────────────────────
        if (jobIds !== undefined && jobIds.length > 0) {
          // 先在工具层挡一道：闸门里每条也会挡（§22.4），但那样用户要等
          // 3–9 秒 × N 的间隔、最后拿到一屏全是"超过上限"的回执 —— 不如现在就说清楚
          const limit = runtime.settings().snapshot().guard.batchLimit
          if (jobIds.length > limit) {
            throw new DomainError(
              'GUARD_DENIED',
              `模型单次调用最多涉及 ${String(limit)} 个岗位（§22.4 批量上限），这次是 ${String(jobIds.length)} 个`,
              {
                hint: `请分批，每批不超过 ${String(limit)} 个，并逐批让用户确认。`,
                detail: { reason: 'batch' },
              },
            )
          }
          const result = await runtime.sendGreetingBatch({
            items: jobIds.map((jobId) => ({ jobId })),
            actor: 'model',
          })
          const lines = [
            `批量打招呼：成功 ${String(result.sent)} 条、失败 ${String(result.failed)} 条` +
              `（耗时 ${(result.elapsedMs / 1000).toFixed(1)} 秒，含条间随机间隔）。`,
            '',
            ...result.receipts.map((receipt, index) => {
              const who = `${receipt.company || receipt.title}（#${String(receipt.jobId)}）`
              if (receipt.ok) return `${String(index + 1)}. ✅ ${who}：已发送，${String(receipt.textLength ?? 0)} 字`
              const hint = receipt.hint === null ? '' : ` —— ${receipt.hint}`
              return `${String(index + 1)}. ❌ ${who}：${receipt.message ?? '失败'}${hint}`
            }),
            '',
            '「失败」是**逐条**的：没有"整批失败"这种状态，成功的那些已经真的发出去了。',
          ]
          return { text: lines.join('\n'), jobId: jobIds[0] ?? 0 }
        }

        // ── 单条 ────────────────────────────────────────────────────
        const id = positiveId(args.jobId, 'jobId')

        // 注意：这里**没有** guiConfirmed —— 模型不能自我确认，
        // guard 会因为 actor='model' 走 ctx.approval。
        const result = await runtime.sendGreeting({
          jobId: id,
          ...(text === undefined ? {} : { text }),
          actor: 'model',
        })
        return {
          jobId: result.jobId,
          text:
            `已向「${result.company || result.title}」发送打招呼` +
            `（${result.platformId}，${String(result.textLength)} 字，${result.sentAt}）。`,
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'inbox_sync',
      description:
        '**同步收件箱**：把平台会话列表（HR 消息）读进本地消息表，之后用 inbox 工具即可看到。' +
        '低危（不对外发任何消息），因此**不需要审批**。返回值里的"读到 N 条"是可信的 0 条 —— ' +
        '未登录、适配器没实现、或列表容器选择器腐烂时会**如实失败**，不会静默返回 0 条让你以为"今天没人回复"。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          platformId: str('平台 id，例如 zhipin'),
        },
        ['platformId'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const platformId = asString(args['platformId'])
        if (platformId === undefined || platformId === '') {
          throw new DomainError('INVALID_INPUT', 'platformId 不能为空')
        }
        // 低危动作：模型发起也不需要审批（guard 只在 high / 模型发起的 mid 时问用户）
        const result = await runtime.syncInbox({ platformId, actor: 'model' })
        return {
          text:
            `${platformId} 收件箱同步完成：读到 ${String(result.fetched)} 条，` +
            `新增 ${String(result.recorded)}、重复 ${String(result.duplicates)}、未读 ${String(result.unread)}。`,
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'contact_stage',
      description:
        '岗位的接触阶段（§12.2）。两种用法：\n' +
        '· **不传 stage** = 探测：去平台上看 HR 是否已读 / 已回复。低危（只看不发、也不写任何东西），不需审批。' +
        '返回 null 表示"判不出来"，**不是** "未接触"。\n' +
        '· **传 stage** = 标记：把本地接触态记成给定值（也用于回退）。只改本地库、**平台上什么都不发生**，' +
        '不需要审批；但会写一条状态事件（来源记为"模型"）。\n' +
        '⚠️ 探测与标记是两件事：识别 ≠ 改状态。探测到事实后要不要落成状态，是下一步显式动作 —— ' +
        '不要因为探到"HR 已读"就自动标记。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          jobId: int('岗位 id'),
          stage: enumStr(
            [...MANUAL_CONTACT_STAGES],
            '要标记的接触态（不传则只探测）。"未接触/无记录"不是能标出来的状态。',
          ),
        },
        ['jobId'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const jobId = positiveId(args.jobId, 'jobId')

        // ── 标记：只写本地，不碰平台 ──────────────────────────────
        const stage = asString(args['stage'])
        if (stage !== undefined) {
          if (!(MANUAL_CONTACT_STAGES as readonly string[]).includes(stage)) {
            throw new DomainError('INVALID_INPUT', `stage 取值不合法：${stage}`, {
              hint: `合法取值：${MANUAL_CONTACT_STAGES.join(' / ')}（"未接触"不可标记：它等于"没有打招呼记录"）。`,
            })
          }
          const pipeline = runtime.pipeline()
          const from = pipeline.contactStage(jobId)
          const greeting = pipeline.advanceContact({
            jobId,
            to: stage as ManualContactStage,
            source: 'model',
            note: '模型在对话中标记',
          })
          runtime.events().publish('contact.stage.changed', { jobId, from, stage: greeting.stage })
          return {
            text:
              `岗位 #${String(jobId)} 的接触态：${CONTACT_STAGE_LABEL[from]} → **${CONTACT_STAGE_LABEL[greeting.stage]}**。\n` +
              '这一步**只改本地记录**（平台上什么都没发生），已留一条状态事件。',
          }
        }

        // ── 探测：低危动作，模型发起也不打扰用户 ──────────────────
        const result = await runtime.probeContactStage({ jobId, actor: 'model' })
        const stageText =
          result.stage === null ? '判不出来（会话不在列表里，或状态标记认不出来）' : CONTACT_STAGE_LABEL[result.stage]
        return {
          text:
            `岗位 #${String(result.jobId)}（${result.platformId}）在平台上的接触阶段：**${stageText}**。\n` +
            `${result.note}`,
        }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'inbox_list',
      description: '看消息（默认最近 50 条，可只看未读）。低危，只读。会标出疑似面试邀约。',
      parameters: schema({
        jobId: int('只看某个岗位的消息'),
        unreadOnly: { type: 'boolean', description: '只看未读' },
        limit: int('返回条数，默认 20'),
      }),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const jobId = typeof args['jobId'] === 'number' ? args['jobId'] : undefined
        const inbox = runtime.messages().inbox({
          ...(jobId === undefined ? {} : { jobId }),
          ...(args['unreadOnly'] === true ? { unreadOnly: true } : {}),
          limit: toInt(args['limit'], 20, 1, 100),
        })
        if (inbox.items.length === 0) {
          return {
            text:
              inbox.total === 0
                ? '没有消息。消息目前靠手动录入（平台适配器的收件箱解析属于 P8）。'
                : '没有未读消息。',
          }
        }
        const lines = [`共 ${String(inbox.total)} 条，未读 ${String(inbox.unread)} 条：`]
        for (const message of inbox.items.slice(0, 20)) {
          const who = message.direction === 'hr' ? 'HR' : '我'
          lines.push(
            `#${String(message.id)} [${who}] ${message.at.slice(0, 16).replace('T', ' ')}` +
              `${message.readAt === null ? '（未读）' : ''}` +
              `${message.jobTitle === null ? '' : `｜${message.companyName ?? ''} ${message.jobTitle}`}`,
          )
          lines.push(`  ${message.content.slice(0, 120)}`)
          if (message.inviteSignal?.hit === true) {
            lines.push(`  ⚠ 疑似面试邀约（命中：${message.inviteSignal.keywords.join('、')}）—— 仅供参考，改状态请显式确认`)
          }
        }
        return { text: lines.join('\n') }
      },
    }),

    tool<Record<string, unknown>, { text: string }>({
      name: 'message_reply',
      description:
        '在**已有会话里**回复一条 HR 消息（真的发到平台上）。**高危**，必须经用户审批' +
        '（审批文案会显示回复正文全文）。对方还没回过话 = 没有会话可回，那种情况用 greeting_send。',
      timeoutMs: 3 * 60 * 1000,
      parameters: schema(
        {
          messageId: int('要回复的消息 id（inbox_list 里的 #数字）'),
          content: str('回复正文'),
        },
        ['messageId', 'content'],
      ),
      ...textResult,
      async run(args) {
        requireData(runtime)
        const messageId = positiveId(args.messageId, 'messageId')
        const content = asString(args['content'])
        if (content === undefined) throw new DomainError('INVALID_INPUT', 'content 不能为空')

        // 真的发：闸门 → 适配器 → **送达确认之后**才落本地记录（返回的 delivery 已确认为 delivered）
        const result = await runtime.replyToMessage({ messageId, content, actor: 'model' })
        return {
          text:
            `已回复「${result.company === '' ? result.title : result.company}」（回复的是消息 #${String(result.messageId)}，` +
            `${String(result.textLength)} 字）—— 平台上已确认送达。`,
        }
      },
    }),
  ]
}
