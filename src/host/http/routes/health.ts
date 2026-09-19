/**
 * 健康与运行态只读端点。
 *
 * 这个模块只管三个端点：
 * - `GET /health` —— 宿主自检结果与数据文件路径；
 * - `GET /today` —— U0 首屏聚合（数据层未就绪也返回 200）；
 * - `GET /events` —— SSE 事件流，交给传输层挂流。
 */
import { json, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

export async function health(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── GET /health ────────────────────────────────────────────────────
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'health')) return undefined
  return json(200, runtime.health())
}

export async function today(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── GET /today ─────────────────────────────────────────────────────
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'today')) return undefined
  // 数据层没就绪也返回 200：U0 要能把「为什么没有数据」显示出来
  return json(200, runtime.today())
}

export async function events(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { segments, method } = ctx

  // ── GET /events（SSE）──────────────────────────────────────────────
  if (!(method === 'GET' && segments.length === 1 && segments[0] === 'events')) return undefined
  return { kind: 'sse' }
}
