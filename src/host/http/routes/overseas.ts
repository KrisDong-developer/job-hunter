/**
 * 海外支线（P8，§4.M）相关端点：`/overseas` 系列 —— JD 分析（POST /overseas/analyze）、
 * 签证立场读写（GET/POST /overseas/visa）、按签证筛岗（GET /overseas/jobs）；
 * 时区双重显示（GET /timezone）；英文简历体检（GET /resumes/:id/english-check ——
 * 路径挂在 `/resumes` 前缀下，但按**行为**归属海外，调用 runtime.overseas().inspectEnglish）；
 * 求职信（/cover-letters）。
 */
import type { CoverLetterLanguage, RemoteKind, VisaStance } from '../../../shared/enums.js'
import { DomainError } from '../../util/errors.js'
import { json, parseRecordId, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

// ── P8：海外支线（§4.M）──────────────────────────────────────────
export async function analyze(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'overseas' && segments[1] === 'analyze')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.overseas()

  const body = await readObject(req)
  const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN
  if (!Number.isFinite(jobId) || jobId <= 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
  return json(200, { ok: true, ...service.analyzeJob(jobId) })
}

export async function visaGet(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'overseas' && segments[1] === 'visa')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.overseas()

  const jobId = parseRecordId(req.query.get('jobId'), '岗位')
  return json(200, service.getVisa(jobId))
}

export async function visaSet(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'overseas' && segments[1] === 'visa')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.overseas()

  const body = await readObject(req)
  const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN
  const stance = body['stance']
  if (!Number.isFinite(jobId) || jobId <= 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
  if (typeof stance !== 'string') throw new DomainError('INVALID_INPUT', 'stance 必填')
  return json(200, {
    ok: true,
    visa: service.setVisa(jobId, stance as VisaStance, {
      ...(typeof body['identityLimit'] === 'string' ? { identityLimit: body['identityLimit'] } : {}),
    }),
  })
}

export async function jobs(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'overseas' && segments[1] === 'jobs')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.overseas()

  const stance = req.query.get('stance')
  const remoteKind = req.query.get('remote')
  return json(200, {
    items: service.filterJobs({
      ...(stance === null || stance === '' ? {} : { stance: stance as VisaStance }),
      ...(remoteKind === null || remoteKind === '' ? {} : { remoteKind: remoteKind as RemoteKind }),
    }),
  })
}

export async function timezone(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  // 时区双重显示（M3：算错时区 = 直接错过面试）
  if (method === 'GET' && segments.length === 1 && segments[0] === 'timezone') {
    requireData(runtime)
    const at = req.query.get('at')
    const tz = req.query.get('tz')
    if (at === null || at === '' || tz === null || tz === '') {
      throw new DomainError('INVALID_INPUT', '需要 at（ISO 时间）与 tz（对方时区，如 America/New_York）')
    }
    return json(200, runtime.overseas().displayInterviewTime(at, tz))
  }

  return undefined
}

export async function resumeEnglishCheck(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // 英文简历体检（M1：**只检查，不翻译**）
  if (method === 'GET' && segments.length === 3 && segments[0] === 'resumes' && segments[2] === 'english-check') {
    requireData(runtime)
    const id = parseRecordId(segments[1] ?? null, '简历')
    const issues = runtime.overseas().inspectEnglish(id)
    return json(200, {
      items: issues,
      note: '这里只做**检查**，不提供中→英翻译 —— 机翻简历是海外求职最致命的错误（§4.M）。',
    })
  }

  return undefined
}

// ── P8：求职信（/cover-letters）──────────────────────────────────
export async function coverLettersList(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'cover-letters')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.overseas()

  const jobIdRaw = req.query.get('jobId')
  return json(200, {
    items: service.listCoverLetters(
      jobIdRaw === null || jobIdRaw === '' ? undefined : parseRecordId(jobIdRaw, '岗位'),
    ),
  })
}

export async function coverLettersCreate(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'cover-letters')) {
    return undefined
  }

  requireData(runtime)
  const service = runtime.overseas()

  const body = await readObject(req)
  const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN
  if (!Number.isFinite(jobId) || jobId <= 0) throw new DomainError('INVALID_INPUT', 'jobId 必须是正整数')
  const letter = await service.draftCoverLetter({
    jobId,
    ...(typeof body['language'] === 'string' ? { language: body['language'] as CoverLetterLanguage } : {}),
    ...(typeof body['resumeId'] === 'number' ? { resumeId: body['resumeId'] } : {}),
    ...(typeof body['useLlm'] === 'boolean' ? { useLlm: body['useLlm'] } : {}),
  })
  runtime.events().publish('coverLetter.created', { id: letter.id, jobId })
  return json(201, { ok: true, coverLetter: letter })
}
