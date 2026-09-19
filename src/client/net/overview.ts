/**
 * 总览类读数：健康、今日概况、闸门额度余量。
 */
import type { HealthDto } from '../../shared/contract/dto/crawl.js'
import type { GuardUsageDto, TodayDto } from '../../shared/contract/dto/today.js'
import { request } from './client.js'

export async function fetchHealth(signal?: AbortSignal): Promise<HealthDto> {
  return await request<HealthDto>('/health', signal === undefined ? {} : { signal })
}

export async function fetchToday(signal?: AbortSignal): Promise<TodayDto> {
  return await request<TodayDto>('/today', signal === undefined ? {} : { signal })
}

export async function fetchGuardUsage(platformId?: string, signal?: AbortSignal): Promise<GuardUsageDto> {
  const suffix = platformId === undefined || platformId === '' ? '' : `?platformId=${encodeURIComponent(platformId)}`
  return await request<GuardUsageDto>(`/guard/usage${suffix}`, signal === undefined ? {} : { signal })
}

// ── 数据保留、清理与可携带性（§18 / J8）────────────────────────

