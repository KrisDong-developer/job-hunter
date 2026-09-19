/**
 * 面试日程（§4.3 `interviews` / §12.6 / §13 U7）。
 *
 * U7 的目的写得很直白：**别撞车别迟到**。所以这个服务的三件正事就是：
 *   1. `conflicts()` —— 时间窗重叠要显式列出来，而不是靠用户自己比对；
 *   2. 通勤 —— 现场面试才算通勤，视频/电话不算（算了只会制造假警告）；
 *   3. `prep()` —— 准备包：**技能差距 + 公司风险 + 之前的错题 + 检查清单**。
 *
 * 状态机（§12.6）：`待确认 → 已确认 → 已完成 → 已复盘`，任意 → `已取消 / 已改期`。
 * 这条链是**单向**的：改期要显式传 `allowReschedule`，否则就是把别人的日程当草稿。
 */
import type { InterviewKind, InterviewState } from '../../shared/contract/enums/interview.js'
import type { StageSource } from '../../shared/contract/enums/pipeline.js'
import { INTERVIEW_KINDS, INTERVIEW_STATES } from '../../shared/contract/enums/interview.js'
import { JOB_FLAG_LABEL } from '../../shared/contract/enums/job.js'
import type { InterviewConflictDto, InterviewDto, InterviewPrepDto, QuestionNoteDto } from '../../shared/contract/dto/interview.js'
import type { Store } from '../store/store.js'
import type { InterviewRecord, QuestionNoteRecord } from '../store/repo/pipeline.js'
import { systemClock, type Clock } from '../util/time.js'
import { DomainError } from '../util/errors.js'

/** 撞车判定的时间窗：两场面试在这段时间内即算冲突（含前后缓冲）。 */
export const CONFLICT_WINDOW_MIN = 60
/** 面试默认时长（分钟）—— 没有明确时长时的保守估计。 */
export const DEFAULT_DURATION_MIN = 60

export interface InterviewService {
  upsert(input: {
    id?: number
    applicationId?: number | null
    jobId?: number | null
    round?: number
    at: string
    tz?: string
    place?: string | null
    link?: string | null
    contact?: string | null
    kind?: InterviewKind
    commuteMin?: number | null
    state?: InterviewState
    /** 谁发起的（写进状态事件的来源）。 */
    actor?: string
  }): InterviewDto
  list(filter?: { from?: string; to?: string; jobId?: number; state?: InterviewState; limit?: number }): InterviewDto[]
  get(id: number): InterviewDto
  setState(id: number, state: InterviewState, options?: { allowReschedule?: boolean; source?: StageSource }): InterviewDto
  review(id: number, review: Record<string, unknown>): InterviewDto
  remove(id: number): boolean
  conflicts(): InterviewConflictDto[]
  prep(id: number): InterviewPrepDto
  /** U0 今日要用：接下来 N 天内即将到来的面试。 */
  upcoming(withinHours?: number): InterviewDto[]

  // ── 错题本（G6）─────────────────────────────────────────────────
  /**
   * 记一道面试题。**同一个「问题 + 主题」再记一次是累加 `times`** ——
   * "这题被问过 3 次"是自动攒出来的，所以要能重复调用同一个入口。
   *
   * 挂在一场面试下（`POST /interviews/:id/questions`）：这样公司维度能自动补上
   * （从面试关联的岗位推），而"哪家问过什么"正是错题本的第二个用法。
   */
  addQuestion(
    interviewId: number,
    input: { question: string; myAnswer?: string; betterAnswer?: string; topic?: string },
  ): QuestionNoteDto
  listQuestions(filter?: { topic?: string; companyId?: number; limit?: number }): QuestionNoteDto[]
  updateQuestion(
    id: number,
    patch: Partial<{ question: string; myAnswer: string; betterAnswer: string; topic: string }>,
  ): QuestionNoteDto
  removeQuestion(id: number): boolean
}

export interface InterviewDeps {
  store: Store
  clock?: Clock
  logger?: { info(message: string): void; warn(message: string): void }
}

export function createInterviewService(deps: InterviewDeps): InterviewService {
  const { store } = deps
  const clock = deps.clock ?? systemClock

  const decorate = (record: InterviewRecord, all?: InterviewRecord[]): InterviewDto => {
    const job = record.jobId === null ? undefined : store.job.detail(record.jobId)
    const pool = all ?? store.pipeline.listInterviews({ limit: 500 })
    const conflicts = pool
      .filter((other) => other.id !== record.id && overlaps(record.at, other.at))
      .map((other) => other.id)
    return {
      ...record,
      jobTitle: job?.title ?? null,
      companyName: job?.companyName ?? null,
      conflicts,
      hoursUntil: Math.round((Date.parse(record.at) - Date.parse(clock())) / 3_600_000),
    }
  }

  const requireInterview = (id: number): InterviewRecord => {
    const record = store.pipeline.getInterview(id)
    if (record === undefined) {
      throw new DomainError('NOT_FOUND', `面试不存在：${String(id)}`, { detail: { interviewId: id } })
    }
    return record
  }

  /** 错题本记录 → DTO（记录形状与 DTO 一一对应，这里只做一次显式搬运，便于两边各自演进）。 */
  const toQuestionDto = (record: QuestionNoteRecord): QuestionNoteDto => ({
    id: record.id,
    question: record.question,
    myAnswer: record.myAnswer,
    betterAnswer: record.betterAnswer,
    topic: record.topic,
    companyId: record.companyId,
    interviewId: record.interviewId,
    times: record.times,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

  const requireQuestion = (id: number): QuestionNoteRecord => {
    const record = store.pipeline.getQuestionNote(id)
    if (record === undefined) {
      throw new DomainError('NOT_FOUND', `错题不存在：${String(id)}`, { detail: { questionId: id } })
    }
    return record
  }

  return {
    upsert(input): InterviewDto {
      if (Number.isNaN(Date.parse(input.at))) {
        throw new DomainError('INVALID_INPUT', `面试时间无法解析：${String(input.at)}`, {
          hint: '请用 ISO 时间，例如 2026-09-20T14:00:00+08:00。',
        })
      }
      if (input.kind !== undefined && !INTERVIEW_KINDS.includes(input.kind)) {
        throw new DomainError('INVALID_INPUT', `不支持的面试形式：${String(input.kind)}`, {
          hint: `合法取值：${INTERVIEW_KINDS.join(' / ')}`,
        })
      }
      if (input.state !== undefined && !INTERVIEW_STATES.includes(input.state)) {
        throw new DomainError('INVALID_INPUT', `不支持的面试状态：${String(input.state)}`, {
          hint: `合法取值：${INTERVIEW_STATES.join(' / ')}`,
        })
      }

      if (input.id === undefined) {
        const record = store.pipeline.createInterview(
          {
            applicationId: input.applicationId ?? null,
            jobId: input.jobId ?? null,
            round: input.round ?? 1,
            at: input.at,
            ...(input.tz === undefined ? {} : { tz: input.tz }),
            place: input.place ?? null,
            link: input.link ?? null,
            contact: input.contact ?? null,
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            commuteMin: input.commuteMin ?? null,
          },
          clock(),
        )
        deps.logger?.info(`[interviews] 新建面试 #${String(record.id)}（${record.at}）`)
        // 建档也是一次状态变更：从"没有这场面试"到"待确认"。
        // 不记这一条的话，"这场面试什么时候定下来的"就查不到了。
        store.pipeline.appendStageEvent(
          {
            entity: 'interview',
            entityId: record.id,
            fromStage: null,
            toStage: 'pending',
            source: input.actor === 'model' ? 'model' : 'manual',
            note: '新建面试',
          },
          clock(),
        )
        // 新建面试是"约面"的关键证据：把接触态推到 interview_scheduled
        if (record.jobId !== null) {
          const latest = store.pipeline.latestGreeting(record.jobId)
          if (latest !== undefined && latest.stage !== 'interview_scheduled') {
            store.pipeline.advanceGreeting(latest.id, 'interview_scheduled', clock())
            store.pipeline.appendStageEvent(
              {
                entity: 'greeting',
                entityId: latest.id,
                fromStage: latest.stage,
                toStage: 'interview_scheduled',
                source: 'auto',
                evidenceRef: `interview:${String(record.id)}`,
                note: '由新建面试自动推进',
              },
              clock(),
            )
          }
        }
        return decorate(record)
      }

      const updated = store.pipeline.updateInterview(
        input.id,
        {
          ...(input.round === undefined ? {} : { round: input.round }),
          at: input.at,
          ...(input.state === undefined ? {} : { state: input.state }),
          ...(input.place === undefined ? {} : { place: input.place }),
          ...(input.link === undefined ? {} : { link: input.link }),
          ...(input.contact === undefined ? {} : { contact: input.contact }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          ...(input.commuteMin === undefined ? {} : { commuteMin: input.commuteMin }),
        },
        clock(),
      )
      if (updated === undefined) {
        throw new DomainError('NOT_FOUND', `面试不存在：${String(input.id)}`)
      }
      return decorate(updated)
    },

    list(filter = {}): InterviewDto[] {
      const all = store.pipeline.listInterviews({ limit: 500 })
      return store.pipeline.listInterviews(filter).map((record) => decorate(record, all))
    },

    get(id): InterviewDto {
      return decorate(requireInterview(id))
    },

    setState(id, state, options = {}): InterviewDto {
      const record = requireInterview(id)
      if (!INTERVIEW_STATES.includes(state)) {
        throw new DomainError('INVALID_INPUT', `不支持的面试状态：${String(state)}`)
      }
      if (state === 'rescheduled' && options.allowReschedule !== true) {
        throw new DomainError('INVALID_INPUT', '改期需要显式确认', {
          hint: '改期会影响别人的日程，所以要显式带上 allowReschedule: true。',
          detail: { interviewId: id },
        })
      }
      const updated = store.pipeline.updateInterview(id, { state }, clock())
      if (updated === undefined) throw new DomainError('NOT_FOUND', `面试不存在：${String(id)}`)
      store.pipeline.appendStageEvent(
        {
          entity: 'interview',
          entityId: id,
          fromStage: record.state,
          toStage: state,
          source: options.source ?? 'manual',
        },
        clock(),
      )
      // 面试完成 → 投递阶段推进到"已面试"
      if (state === 'done' && record.applicationId !== null) {
        const application = store.pipeline.getApplication(record.applicationId)
        if (application !== undefined && application.stage === 'interviewing') {
          store.pipeline.advanceApplication(application.id, 'interviewed', clock())
          store.pipeline.appendStageEvent(
            {
              entity: 'application',
              entityId: application.id,
              fromStage: 'interviewing',
              toStage: 'interviewed',
              source: 'auto',
              evidenceRef: `interview:${String(id)}`,
              note: '面试已完成',
            },
            clock(),
          )
        }
      }
      return decorate(updated)
    },

    review(id, review): InterviewDto {
      requireInterview(id)
      const updated = store.pipeline.updateInterview(id, { review, state: 'reviewed' }, clock())
      if (updated === undefined) throw new DomainError('NOT_FOUND', `面试不存在：${String(id)}`)
      return decorate(updated)
    },

    remove(id): boolean {
      return store.pipeline.removeInterview(id)
    },

    conflicts(): InterviewConflictDto[] {
      const all = store.pipeline
        .listInterviews({ limit: 500 })
        .filter((record) => record.state !== 'cancelled')
      const out: InterviewConflictDto[] = []
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          const a = all[i]
          const b = all[j]
          if (a === undefined || b === undefined) continue
          const overlapMin = overlapMinutes(a.at, b.at)
          if (overlapMin <= 0) continue
          out.push({
            a: a.id,
            b: b.id,
            atA: a.at,
            atB: b.at,
            overlapMin,
            reason:
              overlapMin >= DEFAULT_DURATION_MIN
                ? '两场面试时间重叠'
                : `两场面试间隔不足 ${String(CONFLICT_WINDOW_MIN)} 分钟（含通勤缓冲）`,
          })
        }
      }
      return out.sort((x, y) => x.atA.localeCompare(y.atA))
    },

    prep(id): InterviewPrepDto {
      const record = requireInterview(id)
      const job = record.jobId === null ? undefined : store.job.detail(record.jobId)
      const notes: string[] = []

      // 技能差距：拿岗位要求里的技术词去比对简历里的技能
      const resume = store.resume.defaultResume()
      const resumeSkills = (resume?.content.skills ?? []).map((skill) => skill.name.toLowerCase())
      const jobText = job === undefined ? '' : `${job.title} ${job.tags.join(' ')} ${store.job.jdText(job.id) ?? ''}`
      const required = techTokens(jobText)
      const matchedSkills: string[] = []
      const missingSkills: string[] = []
      for (const token of required) {
        if (resumeSkills.includes(token)) matchedSkills.push(token)
        else missingSkills.push(token)
      }
      if (resume === undefined) {
        notes.push('还没有启用简历 —— 无法做技能差距对比，先去「简历中心」建一版。')
      }

      // 公司风险：直接复用 P4 的标注，不另做一套判断
      const companyFlags: string[] = []
      if (job !== undefined) {
        for (const flag of store.flag.listByJob(job.id)) {
          companyFlags.push(`${JOB_FLAG_LABEL[flag.flagType]}（${flag.evidence[0] ?? '见详情'}）`)
        }
      }

      const questionNotes = store.pipeline.listQuestionNotes({ limit: 20 }).map(toQuestionDto)

      const checklistBase = [
        '确认时间与形式（视频要提前测麦克风与网络）',
        '把 JD 里没写进简历的技术点各准备一句"我了解它是什么、用在什么场景"',
        '准备 2 个问面试官的问题（团队规模、这个岗位当前最痛的问题）',
      ]
      if (record.kind === 'onsite') {
        checklistBase.push('现场面试：提前查路线，预留堵车余量，带一份纸质简历')
      }
      if (missingSkills.length > 0) {
        checklistBase.push(
          `岗位提到但你简历里没有的：${missingSkills.slice(0, 6).join('、')} —— ` +
            '被问到时要如实说"没用过，但我知道它解决什么问题"，不要硬扯。',
        )
      }

      const commute =
        record.kind !== 'onsite'
          ? {
              kind: record.kind,
              minutes: null as number | null,
              advice: `${record.kind === 'video' ? '视频' : '电话'}面试不需要通勤 —— 但要留出安静的环境与设备测试时间。`,
            }
          : record.commuteMin === null
            ? {
                kind: record.kind,
                minutes: null as number | null,
                advice: '现场面试但还没填通勤时长 —— 建议补上，否则"别迟到"这条就是空话。',
              }
            : {
                kind: record.kind,
                minutes: record.commuteMin,
                advice: `单程约 ${String(record.commuteMin)} 分钟，出发时间建议提前 ${String(
                  record.commuteMin + 30,
                )} 分钟。`,
              }

      return {
        interviewId: id,
        jobId: record.jobId,
        jobTitle: job?.title ?? null,
        companyName: job?.companyName ?? null,
        matchedSkills: matchedSkills.slice(0, 20),
        missingSkills: missingSkills.slice(0, 20),
        companyFlags,
        questionNotes,
        commute,
        checklist: checklistBase,
        notes,
      }
    },

    upcoming(withinHours = 72): InterviewDto[] {
      const now = clock()
      const limit = new Date(Date.parse(now) + withinHours * 3_600_000).toISOString()
      const all = store.pipeline.listInterviews({ limit: 500 })
      return all
        .filter((record) => record.state !== 'cancelled' && record.at >= now && record.at <= limit)
        .map((record) => decorate(record, all))
        .sort((a, b) => a.at.localeCompare(b.at))
    },

    // ── 错题本（G6）───────────────────────────────────────────────
    addQuestion(interviewId, input): QuestionNoteDto {
      // 必须先确认这场面试存在：错题挂在一场真实面试下，"这题是哪家问的"才有出处
      const interview = requireInterview(interviewId)
      const question = input.question.trim()
      if (question === '') {
        throw new DomainError('INVALID_INPUT', '题目不能为空', {
          hint: '把面试官的原话记下来最好用（"你项目里那个超时是怎么处理的"）。',
        })
      }
      if (question.length > 300) {
        throw new DomainError('INVALID_INPUT', '题目太长了（上限 300 字）', {
          hint: '记要点即可；详细讨论写进「我当时怎么答的」。',
        })
      }
      // 公司从面试关联的岗位推 —— 用户不该为了记一道题再去选一次公司
      const job = interview.jobId === null ? undefined : store.job.detail(interview.jobId)
      const record = store.pipeline.upsertQuestionNote(
        {
          question,
          ...(input.myAnswer === undefined ? {} : { myAnswer: input.myAnswer.slice(0, 2000) }),
          ...(input.betterAnswer === undefined ? {} : { betterAnswer: input.betterAnswer.slice(0, 2000) }),
          ...(input.topic === undefined ? {} : { topic: input.topic.trim().slice(0, 60) }),
          companyId: job?.companyId ?? null,
          interviewId,
        },
        clock(),
      )
      return toQuestionDto(record)
    },

    listQuestions(filter = {}): QuestionNoteDto[] {
      return store.pipeline.listQuestionNotes(filter).map(toQuestionDto)
    },

    updateQuestion(id, patch): QuestionNoteDto {
      requireQuestion(id)
      const next: Parameters<typeof store.pipeline.updateQuestionNote>[1] = {}
      if (patch.question !== undefined) {
        const question = patch.question.trim()
        if (question === '') {
          throw new DomainError('INVALID_INPUT', '题目不能改成空')
        }
        next.question = question.slice(0, 300)
      }
      if (patch.myAnswer !== undefined) next.myAnswer = patch.myAnswer.slice(0, 2000)
      if (patch.betterAnswer !== undefined) next.betterAnswer = patch.betterAnswer.slice(0, 2000)
      if (patch.topic !== undefined) next.topic = patch.topic.trim().slice(0, 60)
      const updated = store.pipeline.updateQuestionNote(id, next, clock())
      if (updated === undefined) {
        throw new DomainError('NOT_FOUND', `错题不存在：${String(id)}`)
      }
      return toQuestionDto(updated)
    },

    removeQuestion(id): boolean {
      return store.pipeline.removeQuestionNote(id)
    },
  }
}

/** 两场面试是否落在同一个时间窗里（含缓冲）。 */
function overlaps(a: string, b: string): boolean {
  return overlapMinutes(a, b) > 0
}

/**
 * 重叠分钟数。
 *
 * 用"默认时长 + 缓冲窗"而不是"完全相同的时刻"，因为现实中撞车多是
 * "上一场刚结束 10 分钟就要到另一场" —— 那种也是撞车。
 */
function overlapMinutes(a: string, b: string): number {
  const at = Date.parse(a)
  const bt = Date.parse(b)
  if (!Number.isFinite(at) || !Number.isFinite(bt)) return 0
  const windowMs = (DEFAULT_DURATION_MIN + CONFLICT_WINDOW_MIN) * 60_000
  const gap = Math.abs(at - bt)
  if (gap >= windowMs) return 0
  return Math.round((windowMs - gap) / 60_000)
}

/** 从文本里抽技术词（与 P6 的抽取同源思路：只认拉丁 token，宁可漏也不要误报）。 */
function techTokens(text: string): string[] {
  const set = new Set<string>()
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9+#._-]{1,}/g)) {
    const token = match[0].replace(/[._-]+$/, '').toLowerCase()
    if (token.length >= 2) set.add(token)
  }
  return [...set]
}
