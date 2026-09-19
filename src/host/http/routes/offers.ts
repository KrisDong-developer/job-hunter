/**
 * Offer（§4.H H1/H2/H3/H4）的路由：`/offers` 系列 —— 列表（GET /offers）、
 * 登记（POST /offers）、对比（POST /offers/compare）、单条（GET/PATCH/DELETE /offers/:id）、
 * 状态（POST /offers/:id/state），以及岗位维度的反查（GET /jobs/:id/offers）。
 *
 * **顺序敏感**：`compare` 是字面量段，必须排在 `/offers/:id` 之前 ——
 * 否则 `compare` 会被当成 offer id 解析（与 `/jobs/facets`、`/interviews/conflicts`
 * 同一条纪律，钉在 `test/http/route-precedence.test.ts`）。
 *
 * 归属说明：`GET /jobs/:id/offers` 挂在 `/jobs` 前缀下，但按**行为**归在本模块 ——
 * 它调的是 `runtime.offers().byJob`，与 `outreach.ts` 收留 `/jobs/:id/greeting/draft` 同理。
 */
import { OFFER_STATES, type OfferState } from '../../../shared/enums.js'
import type { OfferWriteInput } from '../../domain/offers.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, parseRecordId, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/**
 * 请求体 → 写入输入。
 *
 * **只认识白名单里的键**（与简历、方案同一条纪律）：界面不可能手搓 JSON 去碰
 * 它不该碰的东西。两处刻意的形状：
 *   * 可空字段（`jobId` / `companyId` / `applicationId` / `deadline` / `note`）
 *     区分"没传"（保留原值）与"传了 null"（清空）—— 否则一次拼错的请求会把用户填的
 *     截止时间悄悄抹掉；
 *   * `comp` **整份替换**（与 `criteria` / `resume.content` 一致），不做字段级 merge ——
 *     明细是一棵小树，半合并出来的树比替换更难排查。
 */
function writeInputOf(body: Record<string, unknown>): OfferWriteInput {
  const input: OfferWriteInput = {}
  if (typeof body['companyId'] === 'number') input.companyId = body['companyId']
  else if (body['companyId'] === null) input.companyId = null
  if (typeof body['companyName'] === 'string') input.companyName = body['companyName']
  if (typeof body['jobId'] === 'number') input.jobId = body['jobId']
  else if (body['jobId'] === null) input.jobId = null
  if (typeof body['applicationId'] === 'number') input.applicationId = body['applicationId']
  else if (body['applicationId'] === null) input.applicationId = null
  if (typeof body['role'] === 'string') input.role = body['role']
  if (body['comp'] !== undefined) input.comp = body['comp']
  if (typeof body['deadline'] === 'string') {
    const trimmed = body['deadline'].trim()
    input.deadline = trimmed === '' ? null : trimmed
  } else if (body['deadline'] === null) {
    input.deadline = null
  }
  if (typeof body['state'] === 'string') input.state = parseState(body['state'])
  if (typeof body['note'] === 'string') input.note = body['note'].trim() === '' ? null : body['note']
  else if (body['note'] === null) input.note = null
  return input
}

function parseState(raw: string): OfferState {
  if (!(OFFER_STATES as readonly string[]).includes(raw)) {
    throw new DomainError('INVALID_INPUT', `非法 offer 状态：${raw}`, {
      hint: `合法取值：${OFFER_STATES.join(' / ')}`,
    })
  }
  return raw as OfferState
}

// ── GET /offers ────────────────────────────────────────────────────
export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'offers')) return undefined
  requireData(runtime)

  const stateRaw = req.query.get('state')
  const companyId = Number.parseInt(req.query.get('companyId') ?? '', 10)
  return json(200, {
    items: runtime.offers().list({
      ...(stateRaw === null || stateRaw === '' ? {} : { state: parseState(stateRaw) }),
      ...(req.query.get('open') === '1' ? { openOnly: true } : {}),
      ...(Number.isFinite(companyId) ? { companyId } : {}),
      limit: parsePositiveInt(req.query.get('limit'), 100, 1, 500),
    }),
    openCount: runtime.offers().openCount(),
  })
}

// ── POST /offers ───────────────────────────────────────────────────
export async function create(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'offers')) return undefined
  requireData(runtime)

  const body = await readObject(req)
  const offer = runtime.offers().create(writeInputOf(body))
  runtime.events().publish('offer.created', { id: offer.id, companyName: offer.companyName })
  return json(201, { ok: true, offer })
}

// ── POST /offers/compare（字面量，必须在 /offers/:id 之前）────────────
export async function compare(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'offers' && segments[1] === 'compare')) {
    return undefined
  }
  requireData(runtime)

  const body = await readObject(req)
  const rawIds = Array.isArray(body['offerIds']) ? body['offerIds'] : undefined
  const offerIds = rawIds
    ?.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0)
  const result = await runtime.offers().compare({
    ...(offerIds === undefined || offerIds.length === 0 ? {} : { offerIds }),
    ...(typeof body['useLlm'] === 'boolean' ? { useLlm: body['useLlm'] } : {}),
  })
  return json(200, { ok: true, ...result })
}

// ── GET /offers/:id ────────────────────────────────────────────────
export async function get(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'offers')) return undefined
  requireData(runtime)
  return json(200, runtime.offers().get(parseRecordId(segments[1] ?? null, 'Offer')))
}

// ── PATCH /offers/:id ──────────────────────────────────────────────
export async function patch(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'PATCH' && segments.length === 2 && segments[0] === 'offers')) return undefined
  requireData(runtime)

  const id = parseRecordId(segments[1] ?? null, 'Offer')
  const body = await readObject(req)
  const offer = runtime.offers().update(id, writeInputOf(body))
  runtime.events().publish('offer.updated', { id: offer.id })
  return json(200, { ok: true, offer })
}

// ── DELETE /offers/:id ─────────────────────────────────────────────
export async function remove(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'DELETE' && segments.length === 2 && segments[0] === 'offers')) return undefined
  requireData(runtime)

  const id = parseRecordId(segments[1] ?? null, 'Offer')
  if (!runtime.offers().remove(id)) throw new DomainError('NOT_FOUND', `Offer 不存在：${String(id)}`)
  runtime.events().publish('offer.removed', { id })
  return json(200, { ok: true })
}

// ── POST /offers/:id/state ─────────────────────────────────────────
export async function setState(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 3 && segments[0] === 'offers' && segments[2] === 'state')) {
    return undefined
  }
  requireData(runtime)

  const id = parseRecordId(segments[1] ?? null, 'Offer')
  const body = await readObject(req)
  const state = body['state']
  if (typeof state !== 'string') {
    throw new DomainError('INVALID_INPUT', 'state 必填', {
      hint: `合法取值：${OFFER_STATES.join(' / ')}`,
    })
  }
  const offer = runtime.offers().setState(id, parseState(state))
  runtime.events().publish('offer.state.changed', { id: offer.id, state: offer.state })
  return json(200, { ok: true, offer })
}

// ── GET /jobs/:id/offers（岗位详情要能回答"这个岗位走到哪一步了"）─────
export async function byJob(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'offers')) {
    return undefined
  }
  requireData(runtime)
  const jobId = parseRecordId(segments[1] ?? null, '岗位')
  return json(200, { items: runtime.offers().byJob(jobId) })
}
