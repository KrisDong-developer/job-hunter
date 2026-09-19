/**
 * 面试日程相关的端点（§13 U7）：`/interviews` 系列 —— 列表（GET /interviews）、
 * 新建（POST /interviews）、冲突（GET /interviews/conflicts）、即将到来
 * （GET /interviews/upcoming）、单条（GET /interviews/:id）、更新（PATCH /interviews/:id）、
 * 删除（DELETE /interviews/:id）、状态流转（POST /interviews/:id/state）、
 * 复盘（POST /interviews/:id/review）、面试准备（GET /interviews/:id/prep）。
 */
import type { InterviewKind, InterviewState } from '../../../shared/enums.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
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
