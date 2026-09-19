/**
 * 采集（crawl）与筛选维度的路由：`/crawl` 的状态 / 历史 / 触发，以及筛选维度查询。
 *
 * **顺序敏感**：`GET /crawl/status`、`GET /crawl/runs`、`POST /crawl/run` 第二段是同前缀
 * 字面量，分别由 `status` / `runs` / `run` 三个 handler 精确匹配；`POST /crawl`（`once`）
 * 是另一条独立路径，靠 `segments.length === 1` 与前者区分。维度接口在 `/criteria/dimensions`。
 */
import { dataNotReady } from '../../runtime/contract.js'
import type { CrawlSummaryDto } from '../../../shared/dto.js'
import { DomainError } from '../../util/errors.js'
import { criteriaDimensionsFor } from '../../domain/plan-config.js'
import type { SearchCriteria } from '../../platform/types.js'
import { json, parsePositiveInt, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

// ── GET /crawl/status ──────────────────────────────────────────────
export async function status(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'crawl' && segments[1] === 'status')) {
    return undefined
  }
  return json(200, runtime.crawlStatus())
}

// ── GET /crawl/runs ────────────────────────────────────────────────
export async function runs(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'crawl' && segments[1] === 'runs')) {
    return undefined
  }
  requireData(runtime)
  const limit = parsePositiveInt(req.query.get('limit'), 20, 1, 100)
  const platformId = req.query.get('platformId')
  const store = runtime.store()
  if (store === undefined) throw dataNotReady(runtime)
  return json(200, {
    items: store.crawlRun.list(limit, platformId === null || platformId === '' ? undefined : platformId),
  })
}

// ── POST /crawl/run ────────────────────────────────────────────────
export async function run(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 2 && segments[0] === 'crawl' && segments[1] === 'run')) {
    return undefined
  }
  requireData(runtime)
  const raw = await req.readJson()
  const input = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const adapters = runtime.registry().list()
  const platformId =
    typeof input['platformId'] === 'string' && input['platformId'] !== ''
      ? input['platformId']
      : adapters[0]?.id
  if (platformId === undefined) {
    throw new DomainError('NOT_FOUND', '没有已注册的平台')
  }
  const criteria =
    input['criteria'] !== null && typeof input['criteria'] === 'object'
      ? (input['criteria'] as SearchCriteria)
      : {}
  const summary: CrawlSummaryDto = await runtime.crawl({ platformId, criteria })
  return json(200, summary)
}

// ── A2："抓取一次"走**默认方案**（不再写死 {51job, 深圳, Java}）──────
// 没有方案时先建一个默认方案，所以这个入口永远有一个真实条件，而不是一个字面量。
export async function once(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx
  if (!(method === 'POST' && segments.length === 1 && segments[0] === 'crawl')) {
    return undefined
  }
  requireData(runtime)
  const planService = runtime.plans()
  planService.ensureDefault()
  const first = planService.list().find((plan) => plan.enabled) ?? planService.list()[0]
  if (first === undefined) {
    throw new DomainError('INVALID_INPUT', '还没有任何方案，请先去「采集」页建一个', {
      hint: '方案决定抓什么（平台 + 条件 + 抓取深度）。',
    })
  }
  const summary = await runtime.runPlan(first.id, 'manual')
  return json(200, { ...summary, planId: first.id, planName: first.name })
}

// ── SR-41：当前平台支持哪些筛选维度（界面据此渲染筛选器）─────────────
export async function dimensions(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx
  if (!(method === 'GET' && segments.length === 2 && segments[0] === 'criteria' && segments[1] === 'dimensions')) {
    return undefined
  }
  requireData(runtime)
  const platforms = (req.query.get('platforms') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  const effective =
    platforms.length === 0 ? runtime.registry().list().map((adapter) => adapter.id) : platforms
  return json(200, {
    items: criteriaDimensionsFor(runtime.registry(), effective),
    platforms: effective,
    available: runtime
      .registry()
      .list()
      .map((adapter) => ({ id: adapter.id, displayName: adapter.displayName })),
  })
}
