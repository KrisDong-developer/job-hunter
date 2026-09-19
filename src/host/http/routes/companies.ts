/**
 * 公司画像与识别依据（P4）的路由块。
 * 管 GET /companies（列表）、GET /companies/:id（详情：画像 + 信号 + 岗位 + 标记计数）、
 * PATCH /companies/:id（人工复核：白名单键的黑名单 / 备注 / 人工标签）。
 */
import type { CompanyDetailDto } from '../../../shared/contract/dto/job.js'
import { dataNotReady } from '../../runtime/contract.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** 与原 `dispatch` 里的同名闭包一致：每次调用取当前时刻。 */
const now = (): string => new Date().toISOString()

export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'companies')) return undefined

  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  // GET /companies —— 列表（外包/诈骗/黑名单集中曝光）
  const blacklisted = req.query.get('blacklisted')
  const manualLabel = req.query.get('manualLabel')
  const result = store.company.list({
    ...(blacklisted === null || blacklisted === '' ? {} : { blacklisted: blacklisted !== '0' }),
    ...(manualLabel === null || manualLabel === '' ? {} : { manualLabel }),
    limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
    offset: parsePositiveInt(req.query.get('offset'), 0, 0, 500_000),
  })
  return json(200, { items: result.items, total: result.total })
}

export async function review(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'companies')) return undefined

  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  const companyId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(companyId)) {
    throw new DomainError('INVALID_INPUT', `非法公司 id：${segments[1] ?? ''}`)
  }
  const company = store.company.get(companyId)
  if (company === undefined) {
    throw new DomainError('NOT_FOUND', `公司不存在：${String(companyId)}`)
  }

  // PATCH /companies/:id —— 人工复核（只认白名单键）
  const body = await readObject(req)
  const patch: { blacklisted?: boolean; note?: string | null; manualLabel?: string | null } = {}
  if (typeof body['blacklisted'] === 'boolean') patch.blacklisted = body['blacklisted']
  if (body['note'] !== undefined) patch.note = typeof body['note'] === 'string' ? body['note'] : null
  if (body['manualLabel'] !== undefined) {
    patch.manualLabel = typeof body['manualLabel'] === 'string' && body['manualLabel'] !== '' ? body['manualLabel'] : null
  }
  const reviewed = store.company.updateReview(companyId, patch, now())
  runtime.events().publish('company.reviewed', { companyId, blacklisted: patch.blacklisted })
  return json(200, { ok: true, reviewed })
}

export async function detail(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'companies')) return undefined

  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  const companyId = Number.parseInt(segments[1] ?? '', 10)
  if (!Number.isFinite(companyId)) {
    throw new DomainError('INVALID_INPUT', `非法公司 id：${segments[1] ?? ''}`)
  }
  const company = store.company.get(companyId)
  if (company === undefined) {
    throw new DomainError('NOT_FOUND', `公司不存在：${String(companyId)}`)
  }

  const profile = store.company.getProfile(companyId)
  const jobs = jobService.query({ companyId }, 50, 0)
  const flagCounts: Record<string, number> = {}
  for (const job of jobs) {
    for (const type of job.flagTypes) flagCounts[type] = (flagCounts[type] ?? 0) + 1
  }

  const body: CompanyDetailDto = {
    company: {
      id: company.id,
      name: company.name,
      nameNorm: company.nameNorm,
      industry: company.industry,
      size: company.size,
      nature: company.nature,
      jobCount: profile?.jobCount ?? 0,
      geoSpread: profile?.geoSpread ?? 0,
      stackDiversity: profile?.stackDiversity ?? 0,
      onsiteRatio: profile?.onsiteRatio ?? null,
      nameKeywordHits: profile?.nameKeywordHits ?? 0,
      outsourcingScore: profile?.outsourcingScore ?? null,
      fraudScore: profile?.fraudScore ?? null,
      manualLabel: profile?.manualLabel ?? null,
      blacklisted: company.blacklisted,
    },
    signals: store.signal.listByCompany(companyId).map((signal) => ({
      type: signal.type,
      weight: signal.weight,
      evidence: signal.evidence,
      source: signal.source,
      createdAt: signal.createdAt,
    })),
    jobs,
    flagCounts,
  }
  return json(200, body)
}
