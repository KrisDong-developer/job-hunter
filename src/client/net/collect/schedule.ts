/**
 * 排程与租约：当前排程状态、全局暂停、风控恢复、实例接管。
 */
import type { PlanDto, SchedulerStatusDto } from '../../../shared/contract/dto/plan.js'
import { request } from '../client.js'

/** B3/SR-30：全局一键暂停（**只停定时**，手动仍然可用）。 */
export async function setSchedulePaused(paused: boolean, reason?: string): Promise<SchedulerStatusDto> {
  const result = await request<{ ok: boolean; status: SchedulerStatusDto }>('/schedule/pause', {
    method: 'POST',
    body: JSON.stringify(reason === undefined ? { paused } : { paused, reason }),
  })
  return result.status
}

/** SR-21：人工确认恢复风控暂停的方案（系统不会自动恢复）。 */
export async function resumePlanRisk(id: number): Promise<PlanDto> {
  const result = await request<{ ok: boolean; plan: PlanDto }>(`/plans/${String(id)}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return result.plan
}

/**
 * R20：重新检测一次租约。
 *
 * 对方进程刚被关掉时，界面本来要干等最长 90 秒（心跳过期）才会变；
 * 这个动作让它**立刻**重试一次。它抢不走活着的实例的租约。
 */
export async function recheckLease(): Promise<SchedulerStatusDto> {
  const result = await request<{ ok: boolean; status: SchedulerStatusDto }>(
    '/schedule/lease/recheck',
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.status
}

/**
 * R20：人工接管租约。**只在对方心跳已过期时才会成功** ——
 * 抢一个活着的实例会造成两个调度器同时抓取，那正是这条锁要防的事。
 */
export async function takeoverLease(): Promise<SchedulerStatusDto> {
  const result = await request<{ ok: boolean; status: SchedulerStatusDto }>(
    '/schedule/lease/takeover',
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.status
}

export async function fetchSchedulerStatus(signal?: AbortSignal): Promise<SchedulerStatusDto> {
  return await request<SchedulerStatusDto>('/scheduler/status', signal === undefined ? {} : { signal })
}

