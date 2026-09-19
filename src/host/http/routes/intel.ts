/**
 * 情报引擎（intel 域）的路由（P4）：词表读写与重算。
 *
 * 两条路径都在 `/intel` 前缀下、第二段是字面量（`dictionary` / `recompute`）：
 * `dictionary` 内部再按 GET / POST 分派；`recompute` 只接 POST，且是单次有上限的重算。
 */
import { dataNotReady } from '../../runtime/contract.js'
import { PAGE_SIZE_MAX } from '../../../shared/config/limits.js'
import { DomainError } from '../../util/errors.js'
import { DICTIONARY_KINDS } from '../../store/repo/dictionary.js'
import { json, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

// ── 情报引擎：词表与重算（P4）──────────────────────────────────────
export async function dictionary(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(segments.length === 2 && segments[0] === 'intel' && segments[1] === 'dictionary')) {
    return undefined
  }
  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  if (method === 'GET') {
    return json(200, { items: store.dictionary.list() })
  }
  if (method === 'POST') {
    const body = await readObject(req)
    const kind = body['kind']
    const term = body['term']
    if (typeof kind !== 'string' || !DICTIONARY_KINDS.includes(kind as never)) {
      throw new DomainError('INVALID_INPUT', 'kind 必须是合法的词表类别', {
        hint: `合法取值：${DICTIONARY_KINDS.join(' / ')}`,
      })
    }
    if (typeof term !== 'string' || term.trim() === '') {
      throw new DomainError('INVALID_INPUT', 'term 不能为空')
    }
    store.dictionary.upsert({
      kind: kind as (typeof DICTIONARY_KINDS)[number],
      term: term.trim(),
      ...(typeof body['meaning'] === 'string' ? { meaning: body['meaning'] } : {}),
      ...(typeof body['weight'] === 'number' ? { weight: body['weight'] } : {}),
      ...(typeof body['enabled'] === 'boolean' ? { enabled: body['enabled'] } : {}),
    })
    return json(200, { ok: true, items: store.dictionary.list() })
  }
}

export async function recompute(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(segments.length === 2 && segments[0] === 'intel' && segments[1] === 'recompute')) {
    return undefined
  }
  if (method !== 'POST') throw new DomainError('INVALID_INPUT', '重算只支持 POST')
  requireData(runtime)
  const store = runtime.store()
  const jobService = runtime.jobs()
  if (store === undefined || jobService === undefined) throw dataNotReady(runtime)

  const intel = runtime.intel()
  const now = new Date().toISOString()
  let jobs = 0
  for (const job of jobService.query({}, PAGE_SIZE_MAX, 0)) {
    intel.evaluateJob(job.id, now)
    jobs += 1
  }
  return json(200, {
    ok: true,
    jobs,
    note: `重算了最近 ${String(jobs)} 条岗位（单次上限 ${String(PAGE_SIZE_MAX)}）；超出部分等后续阶段接调度做全量重算`,
  })
}
