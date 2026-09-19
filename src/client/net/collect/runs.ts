/**
 * 触发一次采集与查看"跑到哪了"：抓取状态、运行历史、跳过原因。
 */
import type { CrawlSummaryDto } from '../../../shared/dto.js'
import { request } from '../client.js'

export async function runCrawl(input: {
  platformId?: string
  criteria?: Record<string, string>
}): Promise<CrawlSummaryDto> {
  return await request<CrawlSummaryDto>('/crawl/run', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ── P3：调度与健康 ────────────────────────────────────────────────────

/** A2：「抓取一次」= 按默认方案跑一轮（不再写死 51job/深圳/Java）。 */
export async function runDefaultPlan(): Promise<CrawlSummaryDto & { planId: number; planName: string }> {
  return await request<CrawlSummaryDto & { planId: number; planName: string }>('/crawl', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** SR-17/26：跳过原因 → 人话。宿主是唯一来源，界面不自己写一套。 */
export async function fetchSkipReasons(
  signal?: AbortSignal,
): Promise<{ items: Record<string, string> }> {
  return await request<{ items: Record<string, string> }>(
    '/schedule/reasons',
    signal === undefined ? {} : { signal },
  )
}

/** 手动跑一次方案；`catchUp` 为 true 表示这是对「错过一轮」待办的响应。 */
export async function runPlan(planId: number, catchUp = false): Promise<CrawlSummaryDto> {
  return await request<CrawlSummaryDto>(`/plans/${String(planId)}/run`, {
    method: 'POST',
    body: JSON.stringify({ catchUp }),
  })
}

