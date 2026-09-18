import type { DatabaseSync } from 'node:sqlite'
import type {
  ApplicationChannel,
  ApplicationStage,
  ContactStage,
  InterviewKind,
  InterviewState,
  MessageDirection,
  StageSource,
} from '../../../shared/enums.js'
import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 跟进与看板仓储（P7，§7 / §12）。
 *
 * 四张表放在一个文件里，因为它们共享**同一个不变量**：
 * **任何状态字段的变化都必须同时追加一条 `stage_event`**。
 * 拆到四个文件里，"忘记写事件"就会变成四次机会而不是一次。
 *
 * `greeting.stage` 的语义是**最新一条即当前接触态**（§7.0），所以推进接触态是
 * "改最新那条 greeting"，而不是"给 job 加一个字段" —— 后者会与历史不一致。
 */

export interface GreetingTemplateRecord {
  id: number
  name: string
  body: string
  vars: string[]
  scene: string
  uses: number
  replies: number
  createdAt: string
  updatedAt: string
}

export interface GreetingRecord {
  id: number
  jobId: number | null
  platformId: string
  templateId: number | null
  content: string
  sentAt: string
  channel: ApplicationChannel
  actor: string
  stage: ContactStage
  stageAt: string
  repliedAt: string | null
}

export interface MessageRecord {
  id: number
  platformId: string
  conversationId: string
  direction: MessageDirection
  content: string
  at: string
  attachmentRef: string | null
  jobId: number | null
  readAt: string | null
}

export interface ApplicationRecord {
  id: number
  jobId: number | null
  resumeId: number | null
  resumeFileId: number | null
  channel: ApplicationChannel
  sentAt: string
  stage: ApplicationStage
  stageAt: string
  actor: string
  note: string | null
}

export interface StageEventRecord {
  id: number
  entity: string
  entityId: number
  fromStage: string | null
  toStage: string
  at: string
  source: StageSource
  evidenceRef: string | null
  note: string | null
}

export interface InterviewRecord {
  id: number
  applicationId: number | null
  jobId: number | null
  round: number
  at: string
  tz: string
  place: string | null
  link: string | null
  contact: string | null
  kind: InterviewKind
  state: InterviewState
  commuteMin: number | null
  review: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface QuestionNoteRecord {
  id: number
  question: string
  myAnswer: string
  betterAnswer: string
  topic: string
  companyId: number | null
  interviewId: number | null
  times: number
  createdAt: string
  updatedAt: string
}

export interface StageEventInput {
  /**
   * 状态变更的主体。
   *
   * `campus` / `assessment` / `tripartite` 是 P8 加的：校招与海外的状态机与社招主线**不同**
   * （§12.7 / §12.8），但"每次变更都要留痕"这条规则是一样的 —— 所以共用一张事件表，
   * 只把 `entity` 当区分维度。
   */
  entity: 'greeting' | 'application' | 'job' | 'interview' | 'campus' | 'assessment' | 'tripartite'
  entityId: number
  fromStage: string | null
  toStage: string
  source: StageSource
  evidenceRef?: string | null
  note?: string | null
}

export interface PipelineRepo {
  // ── 话术模板 ────────────────────────────────────────────────────
  listTemplates(): GreetingTemplateRecord[]
  upsertTemplate(
    input: { id?: number; name: string; body: string; vars?: string[]; scene?: string },
    now: string,
  ): GreetingTemplateRecord
  removeTemplate(id: number): boolean
  /** 发送成功/收到回复时累加，用于算模板回复率（§11.3）。 */
  bumpTemplate(id: number, field: 'uses' | 'replies'): void

  // ── 打招呼记录（接触态）─────────────────────────────────────────
  createGreeting(
    input: {
      jobId: number | null
      platformId: string
      templateId?: number | null
      content: string
      channel?: ApplicationChannel
      actor: string
    },
    now: string,
  ): GreetingRecord
  listGreetings(filter?: { jobId?: number; stage?: ContactStage; limit?: number }): GreetingRecord[]
  latestGreeting(jobId: number): GreetingRecord | undefined
  /** 推进某条 greeting 的接触态；返回是否真的变了。 */
  advanceGreeting(id: number, to: ContactStage, now: string): boolean
  countGreetingsByStage(): Record<string, number>

  // ── 消息 ───────────────────────────────────────────────────────
  createMessage(
    input: {
      platformId: string
      conversationId?: string
      direction: MessageDirection
      content: string
      at?: string
      attachmentRef?: string | null
      jobId?: number | null
    },
    now: string,
  ): MessageRecord
  listMessages(filter?: { jobId?: number; unreadOnly?: boolean; limit?: number }): MessageRecord[]
  /**
   * 按「平台 + 会话 + 方向 + 正文」找最近一条。
   *
   * 存在的唯一理由是**收件箱同步的去重**：平台会话列表只给"每个会话的最后一条消息"，
   * 反复同步会把同一条消息反复写进库（`message` 表没有唯一索引，靠 SQL 去重是唯一防线）。
   */
  findMessage(input: {
    platformId: string
    conversationId: string
    direction: MessageDirection
    content: string
  }): MessageRecord | undefined
  markMessageRead(id: number, now: string): boolean
  countUnread(): number

  // ── 投递 ───────────────────────────────────────────────────────
  createApplication(
    input: {
      jobId: number | null
      resumeId?: number | null
      resumeFileId?: number | null
      channel?: ApplicationChannel
      actor: string
      note?: string | null
      stage?: ApplicationStage
    },
    now: string,
  ): ApplicationRecord
  listApplications(filter?: { jobId?: number; stage?: ApplicationStage; limit?: number }): ApplicationRecord[]
  getApplication(id: number): ApplicationRecord | undefined
  advanceApplication(id: number, to: ApplicationStage, now: string): boolean
  countApplicationsByStage(): Record<string, number>
  /** 看板与归因要用：投递 + 岗位标题/公司。 */
  boardRows(): Array<ApplicationRecord & { jobTitle: string | null; companyName: string | null }>

  // ── 状态事件（所有状态变更的唯一留痕点）─────────────────────────
  appendStageEvent(input: StageEventInput, now: string): number
  listStageEvents(entity: string, entityId: number, limit?: number): StageEventRecord[]
  recentStageEvents(limit: number): StageEventRecord[]

  // ── 面试 ───────────────────────────────────────────────────────
  createInterview(
    input: {
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
    },
    now: string,
  ): InterviewRecord
  updateInterview(
    id: number,
    patch: Partial<{
      at: string
      state: InterviewState
      place: string | null
      link: string | null
      contact: string | null
      kind: InterviewKind
      commuteMin: number | null
      review: Record<string, unknown>
      round: number
    }>,
    now: string,
  ): InterviewRecord | undefined
  getInterview(id: number): InterviewRecord | undefined
  listInterviews(filter?: { from?: string; to?: string; jobId?: number; state?: InterviewState; limit?: number }): InterviewRecord[]
  removeInterview(id: number): boolean

  // ── 错题本 ─────────────────────────────────────────────────────
  upsertQuestionNote(
    input: { question: string; myAnswer?: string; betterAnswer?: string; topic?: string; interviewId?: number | null },
    now: string,
  ): QuestionNoteRecord
  listQuestionNotes(filter?: { topic?: string; limit?: number }): QuestionNoteRecord[]
}

const toTemplate = (row: Row): GreetingTemplateRecord => ({
  id: asInt(row['id']),
  name: asText(row['name']),
  body: asText(row['body']),
  vars: asJson<string[]>(row['vars_json'], []),
  scene: asText(row['scene']),
  uses: asInt(row['uses']),
  replies: asInt(row['replies']),
  createdAt: asText(row['created_at']),
  updatedAt: asText(row['updated_at']),
})

const toGreeting = (row: Row): GreetingRecord => ({
  id: asInt(row['id']),
  jobId: asIntOrNull(row['job_id']),
  platformId: asText(row['platform_id']),
  templateId: asIntOrNull(row['template_id']),
  content: asText(row['content']),
  sentAt: asText(row['sent_at']),
  channel: asText(row['channel'], 'platform') as ApplicationChannel,
  actor: asText(row['actor'], 'gui'),
  stage: asText(row['stage'], 'greeted') as ContactStage,
  stageAt: asText(row['stage_at']),
  repliedAt: asTextOrNull(row['replied_at']),
})

const toMessage = (row: Row): MessageRecord => ({
  id: asInt(row['id']),
  platformId: asText(row['platform_id']),
  conversationId: asText(row['conversation_id']),
  direction: asText(row['direction']) as MessageDirection,
  content: asText(row['content']),
  at: asText(row['at']),
  attachmentRef: asTextOrNull(row['attachment_ref']),
  jobId: asIntOrNull(row['job_id']),
  readAt: asTextOrNull(row['read_at']),
})

const toApplication = (row: Row): ApplicationRecord => ({
  id: asInt(row['id']),
  jobId: asIntOrNull(row['job_id']),
  resumeId: asIntOrNull(row['resume_id']),
  resumeFileId: asIntOrNull(row['resume_file_id']),
  channel: asText(row['channel'], 'platform') as ApplicationChannel,
  sentAt: asText(row['sent_at']),
  stage: asText(row['stage'], 'sent') as ApplicationStage,
  stageAt: asText(row['stage_at']),
  actor: asText(row['actor'], 'gui'),
  note: asTextOrNull(row['note']),
})

const toStageEvent = (row: Row): StageEventRecord => ({
  id: asInt(row['id']),
  entity: asText(row['entity']),
  entityId: asInt(row['entity_id']),
  fromStage: asTextOrNull(row['from_stage']),
  toStage: asText(row['to_stage']),
  at: asText(row['at']),
  source: asText(row['source'], 'manual') as StageSource,
  evidenceRef: asTextOrNull(row['evidence_ref']),
  note: asTextOrNull(row['note']),
})

const toInterview = (row: Row): InterviewRecord => ({
  id: asInt(row['id']),
  applicationId: asIntOrNull(row['application_id']),
  jobId: asIntOrNull(row['job_id']),
  round: asInt(row['round'], 1),
  at: asText(row['at']),
  tz: asText(row['tz'], 'Asia/Shanghai'),
  place: asTextOrNull(row['place']),
  link: asTextOrNull(row['link']),
  contact: asTextOrNull(row['contact']),
  kind: asText(row['kind'], 'video') as InterviewKind,
  state: asText(row['state'], 'pending') as InterviewState,
  commuteMin: asIntOrNull(row['commute_min']),
  review: asJson<Record<string, unknown>>(row['review_json'], {}),
  createdAt: asText(row['created_at']),
  updatedAt: asText(row['updated_at']),
})

const toQuestionNote = (row: Row): QuestionNoteRecord => ({
  id: asInt(row['id']),
  question: asText(row['question']),
  myAnswer: asText(row['my_answer']),
  betterAnswer: asText(row['better_answer']),
  topic: asText(row['topic']),
  companyId: asIntOrNull(row['company_id']),
  interviewId: asIntOrNull(row['interview_id']),
  times: asInt(row['times'], 1),
  createdAt: asText(row['created_at']),
  updatedAt: asText(row['updated_at']),
})

function tally(rows: Row[], column: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const key = asText(row[column])
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

export function createPipelineRepo(db: DatabaseSync): PipelineRepo {
  const insertTemplate = db.prepare(
    `INSERT INTO greeting_template (name, body, vars_json, scene, uses, replies, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
  )
  const updateTemplate = db.prepare(
    'UPDATE greeting_template SET name = ?, body = ?, vars_json = ?, scene = ?, updated_at = ? WHERE id = ?',
  )
  const selectTemplates = db.prepare('SELECT * FROM greeting_template ORDER BY uses DESC, id DESC')
  const selectTemplate = db.prepare('SELECT * FROM greeting_template WHERE id = ?')
  const deleteTemplate = db.prepare('DELETE FROM greeting_template WHERE id = ?')
  const bumpUses = db.prepare('UPDATE greeting_template SET uses = uses + 1 WHERE id = ?')
  const bumpReplies = db.prepare('UPDATE greeting_template SET replies = replies + 1 WHERE id = ?')

  const insertGreeting = db.prepare(
    `INSERT INTO greeting (job_id, platform_id, template_id, content, sent_at, channel, actor, stage, stage_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectGreeting = db.prepare('SELECT * FROM greeting WHERE id = ?')
  const selectGreetingsAll = db.prepare('SELECT * FROM greeting ORDER BY sent_at DESC LIMIT ?')
  const selectGreetingsByJob = db.prepare('SELECT * FROM greeting WHERE job_id = ? ORDER BY sent_at DESC LIMIT ?')
  const selectGreetingsByStage = db.prepare('SELECT * FROM greeting WHERE stage = ? ORDER BY sent_at DESC LIMIT ?')
  const selectLatestGreeting = db.prepare('SELECT * FROM greeting WHERE job_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1')
  const advanceGreetingStmt = db.prepare(
    `UPDATE greeting SET stage = ?, stage_at = ?,
       replied_at = CASE WHEN ? IN ('replied', 'interview_scheduled') THEN COALESCE(replied_at, ?) ELSE replied_at END
     WHERE id = ? AND stage != ?`,
  )
  const greetingStageCounts = db.prepare('SELECT stage, count(*) AS n FROM greeting GROUP BY stage')

  const insertMessage = db.prepare(
    `INSERT INTO message (platform_id, conversation_id, direction, content, at, attachment_ref, job_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectMessage = db.prepare('SELECT * FROM message WHERE id = ?')
  const selectMessagesAll = db.prepare('SELECT * FROM message ORDER BY at DESC LIMIT ?')
  const selectMessagesByJob = db.prepare('SELECT * FROM message WHERE job_id = ? ORDER BY at DESC LIMIT ?')
  const selectMessagesUnread = db.prepare('SELECT * FROM message WHERE read_at IS NULL ORDER BY at DESC LIMIT ?')
  const selectMessageByKey = db.prepare(
    `SELECT * FROM message
     WHERE platform_id = ? AND conversation_id = ? AND direction = ? AND content = ?
     ORDER BY id DESC LIMIT 1`,
  )
  const markRead = db.prepare('UPDATE message SET read_at = ? WHERE id = ? AND read_at IS NULL')
  const countUnreadStmt = db.prepare('SELECT count(*) AS n FROM message WHERE read_at IS NULL')

  const insertApplication = db.prepare(
    `INSERT INTO application (job_id, resume_id, resume_file_id, channel, sent_at, stage, stage_at, actor, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectApplication = db.prepare('SELECT * FROM application WHERE id = ?')
  const selectApplicationsAll = db.prepare('SELECT * FROM application ORDER BY sent_at DESC LIMIT ?')
  const selectApplicationsByJob = db.prepare('SELECT * FROM application WHERE job_id = ? ORDER BY sent_at DESC LIMIT ?')
  const selectApplicationsByStage = db.prepare('SELECT * FROM application WHERE stage = ? ORDER BY sent_at DESC LIMIT ?')
  const advanceApplicationStmt = db.prepare(
    'UPDATE application SET stage = ?, stage_at = ? WHERE id = ? AND stage != ?',
  )
  const applicationStageCounts = db.prepare('SELECT stage, count(*) AS n FROM application GROUP BY stage')
  const boardStmt = db.prepare(
    `SELECT a.*, j.title AS job_title, c.name AS company_name
     FROM application a
     LEFT JOIN job j ON j.id = a.job_id
     LEFT JOIN company c ON c.id = j.company_id
     ORDER BY a.stage_at DESC LIMIT ?`,
  )

  const insertStageEvent = db.prepare(
    `INSERT INTO stage_event (entity, entity_id, from_stage, to_stage, at, source, evidence_ref, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectStageEvents = db.prepare(
    'SELECT * FROM stage_event WHERE entity = ? AND entity_id = ? ORDER BY at DESC, id DESC LIMIT ?',
  )
  const selectRecentStageEvents = db.prepare('SELECT * FROM stage_event ORDER BY id DESC LIMIT ?')

  const insertInterview = db.prepare(
    `INSERT INTO interview (application_id, job_id, round, at, tz, place, link, contact, kind, state, commute_min, review_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, '{}', ?, ?)`,
  )
  const selectInterview = db.prepare('SELECT * FROM interview WHERE id = ?')
  const selectInterviewsAll = db.prepare('SELECT * FROM interview ORDER BY at LIMIT ?')
  const selectInterviewsWindow = db.prepare('SELECT * FROM interview WHERE at >= ? AND at <= ? ORDER BY at LIMIT ?')
  const selectInterviewsByJob = db.prepare('SELECT * FROM interview WHERE job_id = ? ORDER BY at DESC LIMIT ?')
  const selectInterviewsByState = db.prepare('SELECT * FROM interview WHERE state = ? ORDER BY at LIMIT ?')
  const deleteInterview = db.prepare('DELETE FROM interview WHERE id = ?')

  const insertQuestionNote = db.prepare(
    `INSERT INTO question_note (question, my_answer, better_answer, topic, interview_id, times, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  const selectQuestionByText = db.prepare(
    'SELECT * FROM question_note WHERE question = ? AND topic = ? ORDER BY id DESC LIMIT 1',
  )
  const bumpQuestion = db.prepare(
    'UPDATE question_note SET times = times + 1, my_answer = ?, better_answer = ?, updated_at = ? WHERE id = ?',
  )
  const selectQuestion = db.prepare('SELECT * FROM question_note WHERE id = ?')
  const selectQuestionsAll = db.prepare('SELECT * FROM question_note ORDER BY times DESC, id DESC LIMIT ?')
  const selectQuestionsByTopic = db.prepare('SELECT * FROM question_note WHERE topic = ? ORDER BY times DESC LIMIT ?')

  const getInterviewOrThrow = (id: number): InterviewRecord => {
    const row = selectInterview.get(id) as Row | undefined
    if (row === undefined) throw new Error(`interview ${String(id)} 不存在`)
    return toInterview(row)
  }

  return {
    // ── 模板 ──────────────────────────────────────────────────────
    listTemplates(): GreetingTemplateRecord[] {
      return (selectTemplates.all() as Row[]).map(toTemplate)
    },

    upsertTemplate(input, now): GreetingTemplateRecord {
      if (input.id === undefined) {
        const result = insertTemplate.run(
          input.name,
          input.body,
          JSON.stringify(input.vars ?? []),
          input.scene ?? '',
          now,
          now,
        )
        return toTemplate(selectTemplate.get(asId(result.lastInsertRowid)) as Row)
      }
      updateTemplate.run(input.name, input.body, JSON.stringify(input.vars ?? []), input.scene ?? '', now, input.id)
      const row = selectTemplate.get(input.id) as Row | undefined
      if (row === undefined) throw new Error(`greeting_template ${String(input.id)} 不存在`)
      return toTemplate(row)
    },

    removeTemplate(id): boolean {
      return Number(deleteTemplate.run(id).changes) > 0
    },

    bumpTemplate(id, field): void {
      if (field === 'uses') bumpUses.run(id)
      else bumpReplies.run(id)
    },

    // ── 打招呼 ────────────────────────────────────────────────────
    createGreeting(input, now): GreetingRecord {
      const result = insertGreeting.run(
        input.jobId,
        input.platformId,
        input.templateId ?? null,
        input.content,
        now,
        input.channel ?? 'platform',
        input.actor,
        'greeted',
        now,
        now,
      )
      return toGreeting(selectGreeting.get(asId(result.lastInsertRowid)) as Row)
    },

    listGreetings(filter = {}): GreetingRecord[] {
      const limit = filter.limit ?? 100
      const rows = (
        filter.jobId !== undefined
          ? selectGreetingsByJob.all(filter.jobId, limit)
          : filter.stage !== undefined
            ? selectGreetingsByStage.all(filter.stage, limit)
            : selectGreetingsAll.all(limit)
      ) as Row[]
      return rows.map(toGreeting)
    },

    latestGreeting(jobId): GreetingRecord | undefined {
      const row = selectLatestGreeting.get(jobId) as Row | undefined
      return row === undefined ? undefined : toGreeting(row)
    },

    advanceGreeting(id, to, now): boolean {
      return Number(advanceGreetingStmt.run(to, now, to, now, id, to).changes) > 0
    },

    countGreetingsByStage(): Record<string, number> {
      const rows = greetingStageCounts.all() as Row[]
      const out: Record<string, number> = {}
      for (const row of rows) out[asText(row['stage'])] = asInt(row['n'])
      return out
    },

    // ── 消息 ─────────────────────────────────────────────────────
    createMessage(input, now): MessageRecord {
      const result = insertMessage.run(
        input.platformId,
        input.conversationId ?? '',
        input.direction,
        input.content,
        input.at ?? now,
        input.attachmentRef ?? null,
        input.jobId ?? null,
        now,
      )
      return toMessage(selectMessage.get(asId(result.lastInsertRowid)) as Row)
    },

    listMessages(filter = {}): MessageRecord[] {
      const limit = filter.limit ?? 100
      const rows = (
        filter.jobId !== undefined
          ? selectMessagesByJob.all(filter.jobId, limit)
          : filter.unreadOnly === true
            ? selectMessagesUnread.all(limit)
            : selectMessagesAll.all(limit)
      ) as Row[]
      return rows.map(toMessage)
    },

    markMessageRead(id, now): boolean {
      return Number(markRead.run(now, id).changes) > 0
    },

    findMessage(input): MessageRecord | undefined {
      const row = selectMessageByKey.get(
        input.platformId,
        input.conversationId,
        input.direction,
        input.content,
      ) as Row | undefined
      return row === undefined ? undefined : toMessage(row)
    },

    countUnread(): number {
      const row = countUnreadStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },

    // ── 投递 ─────────────────────────────────────────────────────
    createApplication(input, now): ApplicationRecord {
      const stage = input.stage ?? 'sent'
      const result = insertApplication.run(
        input.jobId,
        input.resumeId ?? null,
        input.resumeFileId ?? null,
        input.channel ?? 'platform',
        now,
        stage,
        now,
        input.actor,
        input.note ?? null,
        now,
      )
      return toApplication(selectApplication.get(asId(result.lastInsertRowid)) as Row)
    },

    listApplications(filter = {}): ApplicationRecord[] {
      const limit = filter.limit ?? 200
      const rows = (
        filter.jobId !== undefined
          ? selectApplicationsByJob.all(filter.jobId, limit)
          : filter.stage !== undefined
            ? selectApplicationsByStage.all(filter.stage, limit)
            : selectApplicationsAll.all(limit)
      ) as Row[]
      return rows.map(toApplication)
    },

    getApplication(id): ApplicationRecord | undefined {
      const row = selectApplication.get(id) as Row | undefined
      return row === undefined ? undefined : toApplication(row)
    },

    advanceApplication(id, to, now): boolean {
      return Number(advanceApplicationStmt.run(to, now, id, to).changes) > 0
    },

    countApplicationsByStage(): Record<string, number> {
      return tally(applicationStageCounts.all() as Row[], 'stage')
    },

    boardRows() {
      return (boardStmt.all(500) as Row[]).map((row) => ({
        ...toApplication(row),
        jobTitle: asTextOrNull(row['job_title']),
        companyName: asTextOrNull(row['company_name']),
      }))
    },

    // ── 状态事件 ──────────────────────────────────────────────────
    appendStageEvent(input, now): number {
      const result = insertStageEvent.run(
        input.entity,
        input.entityId,
        input.fromStage,
        input.toStage,
        now,
        input.source,
        input.evidenceRef ?? null,
        input.note ?? null,
      )
      return asId(result.lastInsertRowid)
    },

    listStageEvents(entity, entityId, limit = 50): StageEventRecord[] {
      return (selectStageEvents.all(entity, entityId, limit) as Row[]).map(toStageEvent)
    },

    recentStageEvents(limit): StageEventRecord[] {
      return (selectRecentStageEvents.all(limit) as Row[]).map(toStageEvent)
    },

    // ── 面试 ─────────────────────────────────────────────────────
    createInterview(input, now): InterviewRecord {
      const result = insertInterview.run(
        input.applicationId ?? null,
        input.jobId ?? null,
        input.round ?? 1,
        input.at,
        input.tz ?? 'Asia/Shanghai',
        input.place ?? null,
        input.link ?? null,
        input.contact ?? null,
        input.kind ?? 'video',
        input.commuteMin ?? null,
        now,
        now,
      )
      return toInterview(selectInterview.get(asId(result.lastInsertRowid)) as Row)
    },

    updateInterview(id, patch, now): InterviewRecord | undefined {
      const current = selectInterview.get(id) as Row | undefined
      if (current === undefined) return undefined
      const record = toInterview(current)
      const next = {
        round: patch.round ?? record.round,
        at: patch.at ?? record.at,
        state: patch.state ?? record.state,
        place: patch.place === undefined ? record.place : patch.place,
        link: patch.link === undefined ? record.link : patch.link,
        contact: patch.contact === undefined ? record.contact : patch.contact,
        kind: patch.kind ?? record.kind,
        commuteMin: patch.commuteMin === undefined ? record.commuteMin : patch.commuteMin,
        review: patch.review ?? record.review,
      }
      db.prepare(
        `UPDATE interview SET round = ?, at = ?, state = ?, place = ?, link = ?, contact = ?, kind = ?,
           commute_min = ?, review_json = ?, updated_at = ? WHERE id = ?`,
      ).run(
        next.round,
        next.at,
        next.state,
        next.place,
        next.link,
        next.contact,
        next.kind,
        next.commuteMin,
        JSON.stringify(next.review),
        now,
        id,
      )
      return getInterviewOrThrow(id)
    },

    getInterview(id): InterviewRecord | undefined {
      const row = selectInterview.get(id) as Row | undefined
      return row === undefined ? undefined : toInterview(row)
    },

    listInterviews(filter = {}): InterviewRecord[] {
      const limit = filter.limit ?? 200
      const rows = (
        filter.from !== undefined && filter.to !== undefined
          ? selectInterviewsWindow.all(filter.from, filter.to, limit)
          : filter.jobId !== undefined
            ? selectInterviewsByJob.all(filter.jobId, limit)
            : filter.state !== undefined
              ? selectInterviewsByState.all(filter.state, limit)
              : selectInterviewsAll.all(limit)
      ) as Row[]
      return rows.map(toInterview)
    },

    removeInterview(id): boolean {
      return Number(deleteInterview.run(id).changes) > 0
    },

    // ── 错题本 ───────────────────────────────────────────────────
    upsertQuestionNote(input, now): QuestionNoteRecord {
      const topic = input.topic ?? ''
      const existing = selectQuestionByText.get(input.question, topic) as Row | undefined
      if (existing !== undefined) {
        const record = toQuestionNote(existing)
        bumpQuestion.run(input.myAnswer ?? record.myAnswer, input.betterAnswer ?? record.betterAnswer, now, record.id)
        return toQuestionNote(selectQuestion.get(record.id) as Row)
      }
      const result = insertQuestionNote.run(
        input.question,
        input.myAnswer ?? '',
        input.betterAnswer ?? '',
        topic,
        input.interviewId ?? null,
        now,
        now,
      )
      return toQuestionNote(selectQuestion.get(asId(result.lastInsertRowid)) as Row)
    },

    listQuestionNotes(filter = {}): QuestionNoteRecord[] {
      const limit = filter.limit ?? 100
      const rows = (
        filter.topic !== undefined
          ? selectQuestionsByTopic.all(filter.topic, limit)
          : selectQuestionsAll.all(limit)
      ) as Row[]
      return rows.map(toQuestionNote)
    },
  }
}
