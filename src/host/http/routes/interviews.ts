/**
 * 面试日程相关的端点（§13 U7）：`/interviews` 系列 —— 列表（GET /interviews）、
 * 新建（POST /interviews）、冲突（GET /interviews/conflicts）、即将到来
 * （GET /interviews/upcoming）、单条（GET /interviews/:id）、更新（PATCH /interviews/:id）、
 * 删除（DELETE /interviews/:id）、状态流转（POST /interviews/:id/state）、
 * 复盘（POST /interviews/:id/review）、面试准备（GET /interviews/:id/prep）。
 *
 * 以及**错题本**（G6，`/questions` 系列）：`GET /questions`、`POST /interviews/:id/questions`、
 * `PATCH|DELETE /questions/:id`。放在本模块的理由：`prep` 已经在读它
 * （准备包里那一段"之前记过的错题"），读写同一个域放一起才不会两处漂移。
 */
import type { InterviewKind, InterviewState } from '../../../shared/contract/enums/interview.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, parseRecordId, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

// ── P7：面试日程（§13 U7）────────────────────────────────────────
export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'interviews')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const from = req.query.get('from')
  const to = req.query.get('to')
  return json(200, {
    items: service.list({
      ...(from === null || to === null ? {} : { from, to }),
      limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
    }),
    conflicts: service.conflicts(),
  })
}

export async function create(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'interviews')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const body = await readObject(req)
  if (typeof body['at'] !== 'string' || body['at'] === '') {
    throw new DomainError('INVALID_INPUT', 'at（面试时间）必填')
  }
  const interview = service.upsert({
    at: body['at'],
    ...(typeof body['applicationId'] === 'number' ? { applicationId: body['applicationId'] } : {}),
    ...(typeof body['jobId'] === 'number' ? { jobId: body['jobId'] } : {}),
    ...(typeof body['round'] === 'number' ? { round: body['round'] } : {}),
    ...(typeof body['tz'] === 'string' ? { tz: body['tz'] } : {}),
    ...(typeof body['place'] === 'string' ? { place: body['place'] } : {}),
    ...(typeof body['link'] === 'string' ? { link: body['link'] } : {}),
    ...(typeof body['contact'] === 'string' ? { contact: body['contact'] } : {}),
    ...(typeof body['kind'] === 'string' ? { kind: body['kind'] as InterviewKind } : {}),
    ...(typeof body['commuteMin'] === 'number' ? { commuteMin: body['commuteMin'] } : {}),
  })
  runtime.events().publish('interview.scheduled', { id: interview.id, at: interview.at })
  return json(201, { ok: true, interview })
}

export async function conflicts(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'interviews' && segments[1] === 'conflicts')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  return json(200, { items: service.conflicts() })
}

export async function upcoming(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'interviews' && segments[1] === 'upcoming')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const hours = parsePositiveInt(req.query.get('hours'), 72, 1, 24 * 30)
  return json(200, { items: service.upcoming(hours) })
}

export async function get(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'interviews')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const interviewId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(interviewId)) {
    throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`)
  }

  return json(200, service.get(interviewId))
}

export async function patch(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'interviews')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const interviewId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(interviewId)) {
    throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`)
  }

  const body = await readObject(req)
  const interview = service.upsert({
    id: interviewId,
    at: typeof body['at'] === 'string' ? body['at'] : service.get(interviewId).at,
    ...(typeof body['round'] === 'number' ? { round: body['round'] } : {}),
    ...(typeof body['state'] === 'string' ? { state: body['state'] as InterviewState } : {}),
    ...(typeof body['place'] === 'string' ? { place: body['place'] } : {}),
    ...(typeof body['link'] === 'string' ? { link: body['link'] } : {}),
    ...(typeof body['contact'] === 'string' ? { contact: body['contact'] } : {}),
    ...(typeof body['kind'] === 'string' ? { kind: body['kind'] as InterviewKind } : {}),
    ...(typeof body['commuteMin'] === 'number' ? { commuteMin: body['commuteMin'] } : {}),
  })
  return json(200, { ok: true, interview })
}

export async function remove(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (!(method === 'DELETE' && segments.length === 2 && segments[0] === 'interviews')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const interviewId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(interviewId)) {
    throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`)
  }

  if (!service.remove(interviewId)) throw new DomainError('NOT_FOUND', `面试不存在：${String(interviewId)}`)
  return json(200, { ok: true })
}

export async function setState(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'state')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const interviewId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(interviewId)) {
    throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`)
  }

  const body = await readObject(req)
  const state = body['state']
  if (typeof state !== 'string') throw new DomainError('INVALID_INPUT', 'state 必填')
  return json(200, {
    ok: true,
    interview: service.setState(interviewId, state as InterviewState, {
      ...(body['allowReschedule'] === true ? { allowReschedule: true } : {}),
    }),
  })
}

export async function review(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'review')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const interviewId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(interviewId)) {
    throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`)
  }

  const body = await readObject(req)
  return json(200, { ok: true, interview: service.review(interviewId, body) })
}

export async function prep(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'prep')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.interviews()

  const interviewId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(interviewId)) {
    throw new DomainError('INVALID_INPUT', `非法面试 id：${segments[1] ?? ''}`)
  }

  return json(200, service.prep(interviewId))
}

// ── 错题本（G6）────────────────────────────────────────────────────
//
// 为什么必须单独立一组端点：`prep` 一直在**读**错题本，而在此之前
// `pipeline.upsertQuestionNote` 零调用 —— 于是准备包里的"错题本"区块永远空着。
// 读得到、写不进去，等于这个能力不存在。

/** `GET /questions` —— 错题列表（按被问次数排）。 */
export async function questionsList(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'questions')) return undefined
  requireData(runtime)

  const topic = req.query.get('topic')
  const companyId = Number.parseInt(req.query.get('companyId') ?? '', 10)
  return json(200, {
    items: runtime.interviews().listQuestions({
      ...(topic === null || topic === '' ? {} : { topic }),
      ...(Number.isFinite(companyId) ? { companyId } : {}),
      limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
    }),
  })
}

/**
 * `POST /interviews/:id/questions` —— 记一道面试题。
 *
 * 挂在面试下（而不是 `POST /questions`）：一道题总是**在某场面试里被问到的**，
 * 这样公司维度能自动补上，而"哪家问过什么"是错题本的第二个用法。
 * 同一个「问题 + 主题」再记一次是**累加次数**，所以这个入口可以反复调。
 */
export async function questionsAdd(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'interviews' && segments[2] === 'questions')) {
    return undefined
  }
  requireData(runtime)

  const interviewId = parseRecordId(segments[1] ?? null, '面试')
  const body = await readObject(req)
  const question = body['question']
  if (typeof question !== 'string') {
    throw new DomainError('INVALID_INPUT', 'question 必填（面试官问了什么）')
  }
  const note = runtime.interviews().addQuestion(interviewId, {
    question,
    ...(typeof body['myAnswer'] === 'string' ? { myAnswer: body['myAnswer'] } : {}),
    ...(typeof body['betterAnswer'] === 'string' ? { betterAnswer: body['betterAnswer'] } : {}),
    ...(typeof body['topic'] === 'string' ? { topic: body['topic'] } : {}),
  })
  runtime.events().publish('interview.question.recorded', { id: note.id, times: note.times })
  return json(201, { ok: true, question: note })
}

/** `PATCH /questions/:id` —— 改答案 / 改主题（`times` 是事实，改不了）。 */
export async function questionsPatch(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'questions')) return undefined
  requireData(runtime)

  const id = parseRecordId(segments[1] ?? null, '错题')
  const body = await readObject(req)
  const question = runtime.interviews().updateQuestion(id, {
    ...(typeof body['question'] === 'string' ? { question: body['question'] } : {}),
    ...(typeof body['myAnswer'] === 'string' ? { myAnswer: body['myAnswer'] } : {}),
    ...(typeof body['betterAnswer'] === 'string' ? { betterAnswer: body['betterAnswer'] } : {}),
    ...(typeof body['topic'] === 'string' ? { topic: body['topic'] } : {}),
  })
  return json(200, { ok: true, question })
}

/** `DELETE /questions/:id`。 */
export async function questionsRemove(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'DELETE' && segments.length === 2 && segments[0] === 'questions')) return undefined
  requireData(runtime)

  const id = parseRecordId(segments[1] ?? null, '错题')
  if (!runtime.interviews().removeQuestion(id)) {
    throw new DomainError('NOT_FOUND', `错题不存在：${String(id)}`)
  }
  return json(200, { ok: true })
}
