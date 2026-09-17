/**
 * 投递流水线（§4.3 `pipeline` / §12.1 / §13 U5）。
 *
 * ## 三条硬规则
 *
 * 1. **状态变更必须留事件**：`stage` 只是便于查询的冗余，事实在 `stage_event` 里。
 *    §12.1 的转移表把"自动识别"与"人工打勾"混在一起 —— 不记 `source` 就无法解释
 *    "这个状态是谁改的"，自动识别错了也回溯不了。
 * 2. **不合并状态机**（§7.0）：投递阶段（`application.stage`）与接触态（`greeting.stage`）
 *    是两套。一个岗位可以"已收藏 + 已读未回"，合并成单一枚举就表达不了。
 * 3. **状态只能往前走，但允许人工回退**：回退要显式传 `allowBackward`，
 *    免得手滑把"已 Offer"点回"已投递"而没人知道为什么。
 */
import type {
  ApplicationChannel,
  ApplicationStage,
  ContactStage,
  StageSource,
} from '../../shared/enums.js'
import { APPLICATION_CHANNELS, APPLICATION_STAGES } from '../../shared/enums.js'
import type { ApplicationDto, BoardDto, BoardCardDto, StageEventDto } from '../../shared/dto.js'
import type { Store } from '../store/store.js'
import type { ApplicationRecord, GreetingRecord } from '../store/repo/pipeline.js'
import { systemClock, type Clock } from '../util/time.js'
import { DomainError } from '../util/errors.js'

/** 阶段的先后顺序。回退判断与漏斗排序都靠它，**顺序本身就是业务规则**。 */
export const STAGE_ORDER: readonly ApplicationStage[] = APPLICATION_STAGES

export function stageRank(stage: ApplicationStage): number {
  return STAGE_ORDER.indexOf(stage)
}

/** 终态：到了这里就不该再自动往前走。 */
export const TERMINAL_STAGES: readonly ApplicationStage[] = ['offer', 'rejected', 'no_reply']

export interface PipelineService {
  /** 记一次投递。`actor` 决定审计归属（gui / model）。 */
  recordApplication(input: {
    jobId: number
    resumeId?: number | null
    resumeFileId?: number | null
    channel?: ApplicationChannel
    actor: string
    note?: string | null
    /**
     * 界面上的二次确认（§4.4.2 两段式）。
     *
     * 必须一路传到 `guardRun` 里 —— 少传这一层，界面就会陷入
     * 「点了确认还是让你确认」的死循环（实测就是这么被测试抓到的）。
     * 模型**不能**传这个字段：guard 会拒绝非界面来源的自封确认。
     */
    guiConfirmed?: boolean
  }): Promise<ApplicationDto>
  advance(input: {
    applicationId: number
    to: ApplicationStage
    actor: string
    source?: StageSource
    evidenceRef?: string | null
    note?: string | null
    allowBackward?: boolean
  }): ApplicationDto
  list(filter?: { jobId?: number; stage?: ApplicationStage; limit?: number }): ApplicationDto[]
  get(id: number): ApplicationDto
  /** U5 看板：按阶段分组，附带岗位/公司名。 */
  board(): BoardDto
  /** 某个岗位的全部状态事件（详情页用来回答"凭什么"）。 */
  history(jobId: number): StageEventDto[]

  // ── 接触态（greeting.stage；§7.0 说"最新一条即当前接触态"）────────
  /** 供 guard 的发送动作在**成功之后**调用。 */
  recordGreetingSent(input: {
    jobId: number
    platformId: string
    content: string
    actor: string
    templateId?: number | null
    channel?: ApplicationChannel
  }): GreetingRecord
  advanceContact(input: {
    jobId: number
    to: ContactStage
    source?: StageSource
    evidenceRef?: string | null
  }): GreetingRecord
  contactStage(jobId: number): ContactStage
  /** 未读超时 / 已读未回超时的**建议**（§12.2 的两条分支，§3.3 的核心洞察）。 */
  followUpSuggestions(): FollowUpSuggestion[]
}

/**
 * 跟进建议。
 *
 * 注意它是**建议**而不是状态：超时是由时间推导出来的，把它写成状态会让状态机被时间污染
 * （一旦写成 `read_timeout`，用户回了消息之后这个状态还得再改回去）。
 */
export interface FollowUpSuggestion {
  jobId: number
  jobTitle: string | null
  companyName: string | null
  stage: ContactStage
  /** 距今多少小时没动静。 */
  idleHours: number
  kind: 'unread-timeout' | 'read-no-reply' | 'no-progress'
  message: string
  advice: string
}

/** 未读超时阈值（小时）——超过就建议放弃（§3.3）。 */
export const UNREAD_TIMEOUT_HOURS = 72
/** 已读未回超时阈值（小时）——超过就建议改简历/话术，而不是继续加量（§3.3 / §3.2）。 */
export const READ_TIMEOUT_HOURS = 24 * 7
/** 投递后完全没进展的阈值（天）。 */
export const NO_PROGRESS_DAYS = 21

export interface PipelineDeps {
  store: Store
  clock?: Clock
  /** 投递走闸门（高危）。由装配点注入，避免领域层 import guard。 */
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

export function createPipelineService(deps: PipelineDeps): PipelineService {
  const { store } = deps
  const clock = deps.clock ?? systemClock

  const decorate = (record: ApplicationRecord): ApplicationDto => {
    const job = record.jobId === null ? undefined : store.job.detail(record.jobId)
    return {
      ...record,
      jobTitle: job?.title ?? null,
      companyName: job?.companyName ?? null,
      events: store.pipeline
        .listStageEvents('application', record.id, 20)
        .map((event) => ({ ...event })),
    }
  }

  const requireApplication = (id: number): ApplicationRecord => {
    const record = store.pipeline.getApplication(id)
    if (record === undefined) {
      throw new DomainError('NOT_FOUND', `投递记录不存在：${String(id)}`, {
        hint: '用 /board 或 /applications 看当前有哪些投递。',
        detail: { applicationId: id },
      })
    }
    return record
  }

  return {
    async recordApplication(input): Promise<ApplicationDto> {
      const job = store.job.detail(input.jobId)
      if (job === undefined) {
        throw new DomainError('NOT_FOUND', `岗位不存在：${String(input.jobId)}`, { detail: { jobId: input.jobId } })
      }
      const channel = input.channel ?? 'platform'
      if (!APPLICATION_CHANNELS.includes(channel)) {
        throw new DomainError('INVALID_INPUT', `不支持的投递渠道：${String(channel)}`, {
          hint: `合法取值：${APPLICATION_CHANNELS.join(' / ')}`,
        })
      }
      const resumeId = input.resumeId ?? store.resume.defaultResume()?.id ?? null
      if (resumeId === null) {
        throw new DomainError('INVALID_INPUT', '还没有任何简历版本，无法记录投递', {
          hint: '投递必须记下"用了哪份简历"——这是归因分析的基础（§11.3 / R6）。',
        })
      }

      // 投递是**高危**动作：走闸门（模型发起时必然要审批）。
      const run = deps.guardRun
      const create = async (): Promise<ApplicationDto> => {
        const record = store.pipeline.createApplication(
          {
            jobId: job.id,
            resumeId,
            resumeFileId: input.resumeFileId ?? null,
            channel,
            actor: input.actor,
            note: input.note ?? null,
          },
          clock(),
        )
        store.pipeline.appendStageEvent(
          {
            entity: 'application',
            entityId: record.id,
            fromStage: null,
            toStage: 'sent',
            source: input.actor === 'model' ? 'model' : 'manual',
            note: input.note ?? null,
          },
          clock(),
        )
        return decorate(record)
      }

      const result =
        run === undefined
          ? await create()
          : await run(
              {
                action: 'application.send',
                actor: input.actor,
                danger: 'high',
                target: {
                  jobId: job.id,
                  platformId: job.platformId,
                  ...(job.companyId === null ? {} : { companyId: job.companyId }),
                },
                payload: {
                  jobTitle: job.title,
                  company: job.companyName ?? '',
                  channel,
                  // §4.4.2：审批文案必须写清"用了哪版简历"
                  resumeVersion: `#${String(resumeId)}`,
                  resumeFileId: input.resumeFileId ?? null,
                },
                ...(input.guiConfirmed === true ? { guiConfirmed: true } : {}),
              },
              create,
            )
      deps.logger?.info(`[pipeline] 记录投递：岗位 #${String(job.id)}，渠道 ${channel}`)
      return result
    },

    advance(input): ApplicationDto {
      const record = requireApplication(input.applicationId)
      if (!APPLICATION_STAGES.includes(input.to)) {
        throw new DomainError('INVALID_INPUT', `不支持的投递阶段：${String(input.to)}`, {
          hint: `合法取值：${APPLICATION_STAGES.join(' / ')}`,
        })
      }
      if (input.to === record.stage) return decorate(record)

      const backward = stageRank(input.to) < stageRank(record.stage)
      // 终态回退是允许的（HR 有时会反悔），但必须显式说明 —— 否则就是手滑
      if (backward && input.allowBackward !== true) {
        throw new DomainError('INVALID_INPUT', `不允许把状态从「${record.stage}」回退到「${input.to}」`, {
          hint: '回退要显式带上 allowBackward: true，并说明原因（会记进状态事件里）。',
          detail: { from: record.stage, to: input.to },
        })
      }

      const changed = store.pipeline.advanceApplication(input.applicationId, input.to, clock())
      if (!changed) return decorate(requireApplication(input.applicationId))
      store.pipeline.appendStageEvent(
        {
          entity: 'application',
          entityId: input.applicationId,
          fromStage: record.stage,
          toStage: input.to,
          source: input.source ?? (input.actor === 'model' ? 'model' : 'manual'),
          evidenceRef: input.evidenceRef ?? null,
          note: input.note ?? null,
        },
        clock(),
      )
      deps.logger?.info(
        `[pipeline] 投递 #${String(input.applicationId)}：${record.stage} → ${input.to}` +
          `${backward ? '（回退）' : ''}`,
      )
      return decorate(requireApplication(input.applicationId))
    },

    list(filter = {}): ApplicationDto[] {
      return store.pipeline.listApplications(filter).map(decorate)
    },

    get(id): ApplicationDto {
      return decorate(requireApplication(id))
    },

    board(): BoardDto {
      const rows = store.pipeline.boardRows()
      const columns = STAGE_ORDER.map((stage) => ({
        stage,
        cards: rows
          .filter((row) => row.stage === stage)
          .map(
            (row): BoardCardDto => ({
              applicationId: row.id,
              jobId: row.jobId ?? 0,
              jobTitle: row.jobTitle,
              companyName: row.companyName,
              channel: row.channel,
              stage: row.stage,
              stageAt: row.stageAt,
              sentAt: row.sentAt,
              resumeId: row.resumeId,
              daysSinceStage: daysBetween(row.stageAt, clock()),
            }),
          ),
      }))
      return {
        generatedAt: clock(),
        columns,
        total: rows.length,
        /** 待跟进：卡在中间阶段太久的（不进终态的都算在途）。 */
        staleCount: rows.filter(
          (row) => !TERMINAL_STAGES.includes(row.stage) && daysBetween(row.stageAt, clock()) >= NO_PROGRESS_DAYS,
        ).length,
      }
    },

    history(jobId): StageEventDto[] {
      const applications = store.pipeline.listApplications({ jobId, limit: 50 })
      const greetings = store.pipeline.listGreetings({ jobId, limit: 50 })
      const events: StageEventDto[] = []
      for (const application of applications) {
        for (const event of store.pipeline.listStageEvents('application', application.id, 50)) {
          events.push({ ...event, entity: 'application' })
        }
      }
      for (const greeting of greetings) {
        for (const event of store.pipeline.listStageEvents('greeting', greeting.id, 50)) {
          events.push({ ...event, entity: 'greeting' })
        }
      }
      return events.sort((a, b) => b.at.localeCompare(a.at))
    },

    // ── 接触态 ────────────────────────────────────────────────────
    recordGreetingSent(input): GreetingRecord {
      const record = store.pipeline.createGreeting(
        {
          jobId: input.jobId,
          platformId: input.platformId,
          templateId: input.templateId ?? null,
          content: input.content,
          channel: input.channel ?? 'platform',
          actor: input.actor,
        },
        clock(),
      )
      store.pipeline.appendStageEvent(
        {
          entity: 'greeting',
          entityId: record.id,
          fromStage: 'none',
          toStage: 'greeted',
          source: input.actor === 'model' ? 'model' : 'manual',
        },
        clock(),
      )
      if (input.templateId !== undefined && input.templateId !== null) {
        store.pipeline.bumpTemplate(input.templateId, 'uses')
      }
      return record
    },

    advanceContact(input): GreetingRecord {
      const latest = store.pipeline.latestGreeting(input.jobId)
      if (latest === undefined) {
        throw new DomainError('NOT_FOUND', `岗位 #${String(input.jobId)} 还没有打招呼记录`, {
          hint: '接触态挂在打招呼记录上（§7.0：最新一条即当前接触态），没有记录就没有可推进的状态。',
          detail: { jobId: input.jobId },
        })
      }
      if (input.to === latest.stage) return latest
      const changed = store.pipeline.advanceGreeting(latest.id, input.to, clock())
      if (!changed) return store.pipeline.latestGreeting(input.jobId) ?? latest
      store.pipeline.appendStageEvent(
        {
          entity: 'greeting',
          entityId: latest.id,
          fromStage: latest.stage,
          toStage: input.to,
          source: input.source ?? 'manual',
          evidenceRef: input.evidenceRef ?? null,
        },
        clock(),
      )
      // 收到回复 → 给模板记一次回复，用于算回复率（§11.3）
      if (input.to === 'replied' || input.to === 'interview_scheduled') {
        if (latest.templateId !== null) store.pipeline.bumpTemplate(latest.templateId, 'replies')
      }
      return store.pipeline.latestGreeting(input.jobId) ?? latest
    },

    contactStage(jobId): ContactStage {
      return store.pipeline.latestGreeting(jobId)?.stage ?? 'none'
    },

    followUpSuggestions(): FollowUpSuggestion[] {
      const now = clock()
      const out: FollowUpSuggestion[] = []
      for (const greeting of store.pipeline.listGreetings({ limit: 200 })) {
        if (greeting.jobId === null) continue
        // 已回复/已约面的不再催 —— 那是另一条流程（面试）
        if (greeting.stage === 'replied' || greeting.stage === 'interview_scheduled') continue
        if (greeting.stage === 'none') continue

        const idleHours = hoursBetween(greeting.stageAt, now)
        const job = store.job.detail(greeting.jobId)
        const base = {
          jobId: greeting.jobId,
          jobTitle: job?.title ?? null,
          companyName: job?.companyName ?? null,
          stage: greeting.stage,
          idleHours: Math.round(idleHours),
        }
        if (greeting.stage === 'delivered' && idleHours >= UNREAD_TIMEOUT_HOURS) {
          out.push({
            ...base,
            kind: 'unread-timeout',
            message: `打了招呼 ${String(Math.round(idleHours / 24))} 天，HR 一直没读`,
            advice: '未读超时通常说明这个岗位的 HR 不活跃或不看这类消息 —— 建议放弃，把时间给别的岗位。',
          })
        } else if (greeting.stage === 'read' && idleHours >= READ_TIMEOUT_HOURS) {
          out.push({
            ...base,
            kind: 'read-no-reply',
            message: `已读未回已经 ${String(Math.round(idleHours / 24))} 天`,
            advice: '读了没回**不是**没戏，通常是你呈现出来的东西和岗位要求对不上 —— 该改简历或话术，而不是继续加量（§3.2）。',
          })
        }
      }
      return out.sort((a, b) => b.idleHours - a.idleHours)
    },
  }
}

function hoursBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, (to - from) / 3_600_000)
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}
