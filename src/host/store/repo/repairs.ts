import type { DatabaseSync } from 'node:sqlite'
import { asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/** `pending_repair` 里的一条待修复记录（§4.2.4）。 */
export interface RepairRecord {
  id: number
  platformId: string
  crawlRunId: number | null
  capturedAt: string
  missingFields: string[]
  raw: unknown
  sourceUrl: string | null
  replayState: string
}

export interface EnqueueRepairInput {
  platformId: string
  crawlRunId?: number | null
  /** 该条记录缺了哪些核心字段。 */
  missingFields: string[]
  /** 已解析出的原始字段（标量 JSON）。 */
  raw: unknown
  /** 原始 HTML 片段，供修好选择器后重放解析。 */
  rawHtml?: string | null
  sourceUrl?: string | null
  note?: string | null
}

/** 单条记录的 HTML 片段上限，避免隔离队列自己变成磁盘黑洞。 */
const RAW_HTML_LIMIT = 20_000

export interface RepairRepo {
  enqueue(input: EnqueueRepairInput, now: string): number
  countPending(platformId?: string): number
  listPending(platformId: string | undefined, limit: number): RepairRecord[]
  markReplayed(id: number, jobId: number, now: string): void
  /** 修好选择器、重放完成后清空该平台的队列。 */
  clear(platformId: string): number
}

export function createRepairRepo(db: DatabaseSync): RepairRepo {
  const insert = db.prepare(
    `INSERT INTO pending_repair (
       platform_id, crawl_run_id, captured_at, missing_fields_json, raw_json, raw_html, source_url, note
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const countAll = db.prepare("SELECT count(*) AS n FROM pending_repair WHERE replay_state = 'pending'")
  const countPlatform = db.prepare(
    "SELECT count(*) AS n FROM pending_repair WHERE replay_state = 'pending' AND platform_id = ?",
  )
  const listAll = db.prepare(
    "SELECT * FROM pending_repair WHERE replay_state = 'pending' ORDER BY id DESC LIMIT ?",
  )
  const listPlatform = db.prepare(
    "SELECT * FROM pending_repair WHERE replay_state = 'pending' AND platform_id = ? ORDER BY id DESC LIMIT ?",
  )
  const markReplayedStmt = db.prepare(
    "UPDATE pending_repair SET replay_state = 'replayed', replayed_at = ?, replayed_job_id = ? WHERE id = ?",
  )
  const clearStmt = db.prepare("UPDATE pending_repair SET replay_state = 'discarded' WHERE platform_id = ? AND replay_state = 'pending'")

  const toRecord = (row: Row): RepairRecord => ({
    id: asInt(row['id']),
    platformId: asText(row['platform_id']),
    crawlRunId: row['crawl_run_id'] === null || row['crawl_run_id'] === undefined ? null : asInt(row['crawl_run_id']),
    capturedAt: asText(row['captured_at']),
    missingFields: asJson<string[]>(row['missing_fields_json'], []),
    raw: asJson<unknown>(row['raw_json'], null),
    sourceUrl: asTextOrNull(row['source_url']),
    replayState: asText(row['replay_state'], 'pending'),
  })

  return {
    enqueue(input, now): number {
      const html =
        typeof input.rawHtml === 'string' && input.rawHtml.length > RAW_HTML_LIMIT
          ? input.rawHtml.slice(0, RAW_HTML_LIMIT)
          : (input.rawHtml ?? null)
      const result = insert.run(
        input.platformId,
        input.crawlRunId ?? null,
        now,
        JSON.stringify(input.missingFields),
        JSON.stringify(input.raw ?? null),
        html,
        input.sourceUrl ?? null,
        input.note ?? null,
      )
      return asId(result.lastInsertRowid)
    },

    countPending(platformId?): number {
      const row =
        platformId === undefined
          ? (countAll.get() as Row | undefined)
          : (countPlatform.get(platformId) as Row | undefined)
      return asInt(row?.['n'])
    },

    listPending(platformId, limit): RepairRecord[] {
      const rows =
        platformId === undefined
          ? (listAll.all(limit) as Row[])
          : (listPlatform.all(platformId, limit) as Row[])
      return rows.map(toRecord)
    },

    markReplayed(id, jobId, now): void {
      markReplayedStmt.run(now, jobId, id)
    },

    clear(platformId): number {
      return asInt(clearStmt.run(platformId).changes)
    },
  }
}
