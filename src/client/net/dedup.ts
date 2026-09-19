/**
 * 跨平台去重：分组读取、全库复核、拆分与解散。
 */
import { request } from './client.js'
import type { DedupGroupDto, DedupSweepResultDto } from '../../shared/contract/dto/dedup.js'

export async function fetchDedupGroups(
  signal?: AbortSignal,
): Promise<{ items: DedupGroupDto[]; count: number }> {
  return await request<{ items: DedupGroupDto[]; count: number }>(
    '/dedup/groups',
    signal === undefined ? {} : { signal },
  )
}

/**
 * 单个去重分组（批次 4）。
 *
 * 岗位库按组折叠时，展开那一行才拉这一条 —— 而不是预取全部 200 个分组
 * （大多数行用户根本不会展开，预取等于每次翻页都传一遍全库的分组）。
 */
export async function fetchDedupGroup(
  groupId: number,
  signal?: AbortSignal,
): Promise<DedupGroupDto> {
  const result = await request<{ group: DedupGroupDto }>(
    `/dedup/groups/${String(groupId)}`,
    signal === undefined ? {} : { signal },
  )
  return result.group
}

/** 触发一次**全库**去重复核。 */
export async function runDedupSweep(): Promise<DedupSweepResultDto> {
  return await request<DedupSweepResultDto>('/dedup/run', { method: 'POST', body: JSON.stringify({}) })
}

/** 把一个岗位从去重组里拆出（可逆：拆出后它独立成普通岗位）。 */
export async function splitDedupMember(groupId: number, jobId: number): Promise<void> {
  await request<{ ok: boolean }>(`/dedup/groups/${String(groupId)}/split`, {
    method: 'POST',
    body: JSON.stringify({ jobId }),
  })
}

/** 删除整个去重组（组内岗位全部独立，不删岗位本身）。 */
export async function deleteDedupGroup(groupId: number): Promise<void> {
  await request<{ ok: boolean }>(`/dedup/groups/${String(groupId)}`, { method: 'DELETE' })
}

// ── 批次 F：箱线图 / 本地基准 / 简历 A/B ─────────────────────────────

