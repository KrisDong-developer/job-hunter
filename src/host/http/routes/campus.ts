/**
 * 校招支线（P8，§4.L / §13）相关端点：`/campus` 系列 —— 列表（GET /campus）、
 * 新建（POST /campus）、单条（GET /campus/:id）、推进阶段（POST /campus/:id/advance）；
 * 测评（GET/POST /assessments、POST /assessments/:id/state）；
 * 三方协议（GET/POST /tripartite、POST /tripartite/:id/state）；
 * 宣讲会（GET/POST /talks）与硬截止（GET /deadlines）。
 */
import type { AssessmentKind, AssessmentState, CampusBatch, CampusStage, TripartiteState } from '../../../shared/enums.js'
import { DomainError } from '../../util/errors.js'
import { json, parseRecordId, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

// ── P8：校招支线（§4.L / §13）─────────────────────────────────────
export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'campus')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const batch = req.query.get('batch')
  const stage = req.query.get('stage')
  return json(200, {
    items: service.list({
      ...(batch === null || batch === '' ? {} : { batch: batch as CampusBatch }),
      ...(stage === null || stage === '' ? {} : { stage: stage as CampusStage }),
    }),
    windows: service.windows(),
  })
}

export async function create(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'campus')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const body = await readObject(req)
  const campus = service.create({
    ...(typeof body['companyId'] === 'number' ? { companyId: body['companyId'] } : {}),
    ...(typeof body['jobId'] === 'number' ? { jobId: body['jobId'] } : {}),
    ...(typeof body['batch'] === 'string' ? { batch: body['batch'] as CampusBatch } : {}),
    ...(typeof body['companyName'] === 'string' ? { companyName: body['companyName'] } : {}),
    ...(typeof body['applyOpenAt'] === 'string' ? { applyOpenAt: body['applyOpenAt'] } : {}),
    ...(typeof body['applyCloseAt'] === 'string' ? { applyCloseAt: body['applyCloseAt'] } : {}),
    ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
  })
  runtime.events().publish('campus.created', { id: campus.id, batch: campus.batch })
  return json(201, { ok: true, campus })
}

export async function get(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'campus')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const campusId = parseRecordId(segments[1] ?? null, '校招记录')
  return json(200, service.get(campusId))
}

export async function advance(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'campus' && segments[2] === 'advance')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const campusId = parseRecordId(segments[1] ?? null, '校招记录')
  const body = await readObject(req)
  const stage = body['stage']
  if (typeof stage !== 'string') throw new DomainError('INVALID_INPUT', 'stage 必填')
  const campus = service.advance(campusId, stage as CampusStage, {
    ...(body['allowBackward'] === true ? { allowBackward: true } : {}),
    ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
  })
  runtime.events().publish('campus.advanced', { id: campusId, stage: campus.stage })
  return json(200, { ok: true, campus })
}

export async function assessmentsList(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'assessments')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const state = req.query.get('state')
  return json(200, {
    items: service.listAssessments(state === null || state === '' ? {} : { state: state as AssessmentState }),
  })
}

export async function assessmentCreate(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'assessments')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const body = await readObject(req)
  const assessment = service.addAssessment({
    ...(typeof body['campusApplicationId'] === 'number' ? { campusApplicationId: body['campusApplicationId'] } : {}),
    ...(typeof body['platform'] === 'string' ? { platform: body['platform'] } : {}),
    ...(typeof body['kind'] === 'string' ? { kind: body['kind'] as AssessmentKind } : {}),
    ...(typeof body['at'] === 'string' ? { at: body['at'] } : {}),
    ...(typeof body['dueAt'] === 'string' ? { dueAt: body['dueAt'] } : {}),
    ...(typeof body['durationMin'] === 'number' ? { durationMin: body['durationMin'] } : {}),
  })
  runtime.events().publish('assessment.created', { id: assessment.id, dueAt: assessment.dueAt })
  return json(201, { ok: true, assessment })
}

export async function assessmentState(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'assessments' && segments[2] === 'state')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const id = parseRecordId(segments[1] ?? null, '测评')
  const body = await readObject(req)
  const state = body['state']
  if (typeof state !== 'string') throw new DomainError('INVALID_INPUT', 'state 必填')
  return json(200, {
    ok: true,
    assessment: service.setAssessmentState(
      id,
      state as AssessmentState,
      typeof body['result'] === 'string' ? body['result'] : null,
    ),
  })
}

export async function tripartiteList(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'tripartite')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  return json(200, { items: service.listTripartite() })
}

export async function tripartiteCreate(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'tripartite')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const body = await readObject(req)
  const tripartite = service.addTripartite({
    ...(typeof body['campusApplicationId'] === 'number' ? { campusApplicationId: body['campusApplicationId'] } : {}),
    ...(typeof body['issuedAt'] === 'string' ? { issuedAt: body['issuedAt'] } : {}),
    ...(typeof body['signDeadline'] === 'string' ? { signDeadline: body['signDeadline'] } : {}),
    ...(typeof body['penaltySummary'] === 'string' ? { penaltySummary: body['penaltySummary'] } : {}),
  })
  return json(201, { ok: true, tripartite })
}

export async function tripartiteState(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'tripartite' && segments[2] === 'state')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.campus()

  const id = parseRecordId(segments[1] ?? null, '三方')
  const body = await readObject(req)
  if (typeof body['state'] !== 'string') throw new DomainError('INVALID_INPUT', 'state 必填')
  return json(200, {
    ok: true,
    tripartite: service.setTripartiteState(id, body['state'] as TripartiteState),
  })
}

export async function talksGet(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (method === 'GET' && segments.length === 1 && segments[0] === 'talks') {
    requireData(runtime)
    return json(200, { items: runtime.campus().listTalkSessions() })
  }

  return undefined
}

export async function talksPost(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (method === 'POST' && segments.length === 1 && segments[0] === 'talks') {
    requireData(runtime)
    const body = await readObject(req)
    if (typeof body['at'] !== 'string' || body['at'] === '') {
      throw new DomainError('INVALID_INPUT', 'at（宣讲会时间）必填')
    }
    return json(201, {
      ok: true,
      talk: runtime.campus().addTalkSession({
        at: body['at'],
        ...(typeof body['companyId'] === 'number' ? { companyId: body['companyId'] } : {}),
        ...(typeof body['place'] === 'string' ? { place: body['place'] } : {}),
        ...(typeof body['online'] === 'boolean' ? { online: body['online'] } : {}),
        ...(typeof body['url'] === 'string' ? { url: body['url'] } : {}),
        ...(typeof body['worthGoing'] === 'string' ? { worthGoing: body['worthGoing'] } : {}),
        ...(typeof body['note'] === 'string' ? { note: body['note'] } : {}),
      }),
    })
  }

  return undefined
}

export async function deadlines(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // 硬截止：U0 与流水线页都要看这个（**不可逆**，所以单独一个端点）
  if (method === 'GET' && segments.length === 1 && segments[0] === 'deadlines') {
    requireData(runtime)
    const service = runtime.campus()
    return json(200, { items: service.deadlines(), overdue: service.overdue() })
  }

  return undefined
}
