/**
 * 平台侧运维：平台总览、登录引导、适配器配置覆盖、待修复队列。
 */
import type { AdapterConfigDto, LoginStatusDto, PlatformOverviewDto, RepairListDto } from '../../../shared/dto.js'
import { request } from '../client.js'

export async function fetchPlatforms(signal?: AbortSignal): Promise<{ items: PlatformOverviewDto[] }> {
  return await request<{ items: PlatformOverviewDto[] }>('/platforms', signal === undefined ? {} : { signal })
}

export async function startLogin(platformId: string): Promise<LoginStatusDto> {
  const result = await request<{ ok: boolean; login: LoginStatusDto }>(
    `/platforms/${encodeURIComponent(platformId)}/login/start`,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return result.login
}

export async function fetchRepairs(platformId?: string, signal?: AbortSignal): Promise<RepairListDto> {
  const suffix = platformId === undefined || platformId === '' ? '' : `?platformId=${encodeURIComponent(platformId)}`
  return await request<RepairListDto>(`/repairs${suffix}`, signal === undefined ? {} : { signal })
}

/** 丢弃单条待修复记录（行保留、状态置 discarded，用于留痕）。 */
export async function discardRepair(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/repairs/${String(id)}/discard`, { method: 'POST', body: JSON.stringify({}) })
}

/** 清空某平台的待修复队列（改好选择器、确认新数据正常之后）。返回清掉了几条。 */
export async function clearRepairs(platformId: string): Promise<number> {
  const result = await request<{ ok: boolean; cleared: number }>('/repairs/clear', {
    method: 'POST',
    body: JSON.stringify({ platformId }),
  })
  return result.cleared
}

// ── 适配器配置覆盖（J2 / ADAPTERS.md §4）─────────────────────────

/** 读三层视图：代码默认 / DB 覆盖 / 实际生效。 */
export async function fetchAdapterConfig(platformId: string, signal?: AbortSignal): Promise<AdapterConfigDto> {
  return await request<AdapterConfigDto>(
    `/platforms/${encodeURIComponent(platformId)}/adapter-config`,
    signal === undefined ? {} : { signal },
  )
}

/** 写入覆盖并**热生效**（宿主会重建适配器）。`override: null` = 清除覆盖。 */
export async function updateAdapterConfig(platformId: string, override: unknown): Promise<AdapterConfigDto> {
  const result = await request<{ ok: boolean; config: AdapterConfigDto }>(
    `/platforms/${encodeURIComponent(platformId)}/adapter-config`,
    { method: 'PUT', body: JSON.stringify({ override }) },
  )
  return result.config
}

// ── 每日额度读数（D7 / U0「额度余量」）──────────────────────────

