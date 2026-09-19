/**
 * 跨平台去重复核（§4.10.1 铁律 2：去重必须可逆，人工能拆开）的路由块。
 * 管 GET /dedup/groups（列出分组，附成员岗位摘要）、GET /dedup/groups/:id（单个分组）、
 * POST /dedup/run（全库复核一遍）、DELETE /dedup/groups/:id（拆分整组）、
 * POST /dedup/groups/:id/split（把一个岗位从组里拆出）。
 */
import type { DedupGroupRecord } from '../../store/repo/dedup-groups.js'
import type { Store } from '../../store/store.js'
import { dataNotReady } from '../../runtime/contract.js'
import { DomainError } from '../../util/errors.js'
import { json, parsePositiveInt, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/**
 * 一个去重分组的对外形状。**列表与单个分组共用这一份**。
 *
 * 成员上带 `salaryRaw` / `sourceUrl` / `platformName`：岗位库的「跨平台对照」
 * 要在一张表里比薪资、并让人跳去那个平台的原页面。少这几个字段，界面就得为
 * 每个成员再拉一次详情（N+1 次往返，而它要的只是三个字段）。
 */
function dedupGroupItem(store: Store, group: DedupGroupRecord) {
  return {
    id: group.id,
    primaryJobId: group.primaryJobId,
    basis: group.basis,
    score: group.score,
    createdAt: group.createdAt,
    members: group.memberIds
      .map((jobId) => store.job.detail(jobId))
      .filter((job): job is NonNullable<typeof job> => job !== undefined)
      .map((job) => ({
        id: job.id,
        platformId: job.platformId,
        platformName: job.platformName,
        title: job.title,
        companyName: job.companyName,
        city: job.city,
        salaryRaw: job.salaryRaw,
        sourceUrl: job.sourceUrl,
        state: job.state,
        isPrimary: job.id === group.primaryJobId,
      })),
  }
}

function dedupGroupItems(store: Store, limit: number): ReturnType<typeof dedupGroupItem>[] {
  return store.dedupGroup.list(limit).map((group) => dedupGroupItem(store, group))
}

export async function groups(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'dedup' && segments[1] === 'groups')) return undefined

  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  // GET /dedup/groups —— 列出分组，附每个成员的岗位摘要（判断是否误判）
  return json(200, {
    items: dedupGroupItems(store, parsePositiveInt(req.query.get('limit'), 50, 1, 200)),
    count: store.dedupGroup.count(),
  })
}

export async function sweep(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'dedup' && segments[1] === 'run')) return undefined

  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  // POST /dedup/run —— **全库复核一遍**（批次 4：去重可独立触发）
  //
  // 为什么需要它：去重以前只在抓取的后处理里发生，于是"刚打开去重开关"或
  // "去重规则改过之后"这两个场合都没有入口 —— 只能干等下一轮抓取，
  // 而那一轮可能一条新岗位都没有。
  const result = runtime.sweepDedup()
  return json(200, { ...result, items: dedupGroupItems(store, 50) })
}

export async function group(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 3 && segments[0] === 'dedup' && segments[1] === 'groups')) return undefined

  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  const groupId = Number.parseInt(segments[2] ?? '', 10)
  if (!Number.isFinite(groupId)) throw new DomainError('INVALID_INPUT', `非法分组 id：${segments[2] ?? ''}`)

  // GET /dedup/groups/:id —— 单个分组（岗位库"按组折叠"展开时按需拉这一条）
  const group = store.dedupGroup.get(groupId)
  if (group === undefined) throw new DomainError('NOT_FOUND', `去重分组不存在：${String(groupId)}`)
  return json(200, { group: dedupGroupItem(store, group) })
}

export async function dropGroup(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'DELETE' && segments.length === 3 && segments[0] === 'dedup' && segments[1] === 'groups')) return undefined

  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  const groupId = Number.parseInt(segments[2] ?? '', 10)
  if (!Number.isFinite(groupId)) throw new DomainError('INVALID_INPUT', `非法分组 id：${segments[2] ?? ''}`)

  // DELETE /dedup/groups/:id —— 拆分整组：所有成员独立，删除分组
  if (store.dedupGroup.get(groupId) === undefined) {
    throw new DomainError('NOT_FOUND', `去重分组不存在：${String(groupId)}`)
  }
  store.dedupGroup.deleteGroup(groupId)
  return json(200, { ok: true })
}

export async function split(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 4 && segments[0] === 'dedup' && segments[1] === 'groups' && segments[3] === 'split')) return undefined

  requireData(runtime)
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)

  const groupId = Number.parseInt(segments[2] ?? '', 10)
  if (!Number.isFinite(groupId)) throw new DomainError('INVALID_INPUT', `非法分组 id：${segments[2] ?? ''}`)

  // POST /dedup/groups/:id/split —— 把一个岗位从组里拆出（不再是合并岗位）
  const body = await readObject(req)
  const jobId = typeof body['jobId'] === 'number' ? body['jobId'] : Number.NaN
  if (!Number.isFinite(jobId) || jobId <= 0) throw new DomainError('INVALID_INPUT', 'jobId 必填且为正整数')
  const group = store.dedupGroup.get(groupId)
  if (group === undefined) throw new DomainError('NOT_FOUND', `去重分组不存在：${String(groupId)}`)
  if (!group.memberIds.includes(jobId)) {
    throw new DomainError('INVALID_INPUT', `岗位 #${String(jobId)} 不属于分组 #${String(groupId)}`)
  }
  store.dedupGroup.removeMember(groupId, jobId)
  return json(200, { ok: true })
}
