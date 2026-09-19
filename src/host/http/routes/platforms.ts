/**
 * 平台与登录态路由：`GET /platforms`（已注册平台列表）、`GET /login/status`（各平台登录态）、
 * `POST /platforms/:id/login/start`（拉起登录引导）。
 *
 * 调度自身状态（/schedule/*、/scheduler/status）见 schedule.ts；触达相关
 * （/jobs/:id/greeting/draft、/jobs/:id/detect-stage 等）见 outreach.ts。
 */
import { DomainError } from '../../util/errors.js'
import { json, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** 原 router.ts L1106-1109。 */
export async function list(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── 平台与登录态（P3）──────────────────────────────────────────────
  if (method === 'GET' && segments.length === 1 && segments[0] === 'platforms') {
    return json(200, { items: runtime.platforms() })
  }

  return undefined
}

/** 原 router.ts L1218-1220。 */
export async function loginStatus(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (method === 'GET' && segments.length === 2 && segments[0] === 'login' && segments[1] === 'status') {
    return json(200, { items: runtime.loginStatuses() })
  }

  return undefined
}

/** 原 router.ts L1222-1229。 */
export async function loginStart(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  if (segments.length === 4 && segments[0] === 'platforms' && segments[2] === 'login' && segments[3] === 'start') {
    if (method !== 'POST') {
      throw new DomainError('INVALID_INPUT', '登录引导只支持 POST')
    }
    requireData(runtime)
    const platformId = segments[1] ?? ''
    return json(200, { ok: true, login: runtime.startLogin(platformId) })
  }

  return undefined
}
