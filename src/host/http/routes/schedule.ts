/**
 * 调度域路由：`/schedule/lease/recheck`、`/schedule/lease/takeover`（R20 租约重检/接管）、
 * `/schedule/pause`（B3/SR-30 全局一键暂停）、`/schedule/reasons`（SR-17/26 跳过原因人话）、
 * `/scheduler/status`。只碰调度器自身状态，不读写业务数据。
 *
 * 平台与登录态见 platforms.ts；触达相关（含挂在 `/jobs` 前缀下但按行为归属 outreach 的
 * `/jobs/:id/greeting/draft` 与 `/jobs/:id/detect-stage`）见 outreach.ts。
 */
import { SKIP_REASON_LABEL } from '../../../shared/contract/enums/plan.js'
import { DomainError } from '../../util/errors.js'
import { json, readObject, requireData, type RouteContext } from './kit.js'
import type { RouteResult } from './types.js'

/** 原 router.ts L1068-1084。 */
export async function lease(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── R20：租约的"重新检测"与"人工接管"────────────────────────────
  //
  // 界面上原来只有一句"非租约持有者连手动跑也会被拒绝"—— 那是**死胡同**提示：
  // 用户知道了原因，却没有任何下一步可做。这两条接口就是那个下一步。
  if (segments.length === 3 && segments[0] === 'schedule' && segments[1] === 'lease') {
    if (method !== 'POST') throw new DomainError('INVALID_INPUT', '租约操作只支持 POST')
    requireData(runtime)
    if (segments[2] === 'recheck') {
      return json(200, { ok: true, status: runtime.recheckLease() })
    }
    if (segments[2] === 'takeover') {
      return json(200, { ok: true, status: runtime.takeoverLease() })
    }
    throw new DomainError('INVALID_INPUT', `不认识的租约操作：${segments[2] ?? ''}`, {
      hint: '合法取值：recheck / takeover',
    })
  }

  return undefined
}

/** 原 router.ts L1086-1094。 */
export async function pause(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, req, segments, method } = ctx

  // ── B3/SR-30：全局一键暂停（**只停定时**，手动永远可用）──────────────
  if (segments.length === 2 && segments[0] === 'schedule' && segments[1] === 'pause') {
    if (method !== 'POST') throw new DomainError('INVALID_INPUT', '暂停/恢复只支持 POST')
    requireData(runtime)
    const body = await readObject(req)
    const paused = body['paused'] !== false
    runtime.setSchedulePaused(paused, typeof body['reason'] === 'string' ? body['reason'] : undefined)
    return json(200, { ok: true, status: runtime.schedulerStatus() })
  }

  return undefined
}

/** 原 router.ts L1096-1099。 */
export async function reasons(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { segments, method } = ctx

  // ── SR-17/26：跳过原因 → 人话（界面与工具共用同一份，避免两处说法漂移）──
  if (method === 'GET' && segments.length === 2 && segments[0] === 'schedule' && segments[1] === 'reasons') {
    return json(200, { items: SKIP_REASON_LABEL })
  }

  return undefined
}

/** 原 router.ts L1101-1104。 */
export async function schedulerStatus(ctx: RouteContext): Promise<RouteResult | undefined> {
  const { runtime, segments, method } = ctx

  // ── 调度状态（P3）──────────────────────────────────────────────────
  if (method === 'GET' && segments.length === 2 && segments[0] === 'scheduler' && segments[1] === 'status') {
    return json(200, runtime.schedulerStatus())
  }

  return undefined
}
