import type { DatabaseSync } from 'node:sqlite'
import type { CrawlState } from '../../../shared/enums.js'
import type { CrawlRunDto } from '../../../shared/dto.js'
import { asId, asInt, asText, asTextOrNull, type Row } from '../row.js'

/** 结束一轮抓取时写入的汇总（§6.1 / §7 `crawl_run`）。 */
export interface CrawlRunPatch {
  state: CrawlState
  pages?: number
  found?: number
  inserted?: number
  updated?: number
  skipped?: number
  quarantined?: number
  errorCode?: string | null
  errorMsg?: string | null
  logRef?: string | null
}

export interface CrawlRunRepo {
  start(input: { platformId: string; planId?: number | null }, now: string): number
  finish(id: number, patch: CrawlRunPatch, now: string): void
  get(id: number): CrawlRunDto | undefined
  latest(platformId?: string): CrawlRunDto | undefined
  list(limit: number, platformId?: string): CrawlRunDto[]
  count(): number
}

function toDto(row: Row): CrawlRunDto {
  return {
    id: asInt(row['id']),
    platformId: asText(row['platform_id']),
    planId: row['plan_id'] === null || row['plan_id'] === undefined ? null : asInt(row['plan_id']),
    startedAt: asText(row['started_at']),
    endedAt: asTextOrNull(row['ended_at']),
    state: asText(row['state'], 'queued') as CrawlState,
    pages: asInt(row['pages']),
    found: asInt(row['found']),
    inserted: asInt(row['inserted']),
    updated: asInt(row['updated']),
    skipped: asInt(row['skipped']),
    quarantined: asInt(row['quarantined']),
    errorCode: asTextOrNull(row['error_code']),
    errorMsg: asTextOrNull(row['error_msg']),
  }
}

export function createCrawlRunRepo(db: DatabaseSync): CrawlRunRepo {
  const insert = db.prepare(
    `INSERT INTO crawl_run (plan_id, platform_id, started_at, state)
     VALUES (?, ?, ?, 'running')`,
  )
  const update = db.prepare(
    `UPDATE crawl_run SET
       ended_at = ?, state = ?,
       pages = coalesce(?, pages), found = coalesce(?, found),
       inserted = coalesce(?, inserted), updated = coalesce(?, updated),
       skipped = coalesce(?, skipped), quarantined = coalesce(?, quarantined),
       error_code = ?, error_msg = ?, log_ref = coalesce(?, log_ref)
     WHERE id = ?`,
  )
  const selectOne = db.prepare('SELECT * FROM crawl_run WHERE id = ?')
  const selectLatestAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT 1')
  const selectLatestPlatform = db.prepare(
    'SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT 1',
  )
  const selectListAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT ?')
  const selectListPlatform = db.prepare(
    'SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT ?',
  )
  const countStmt = db.prepare('SELECT count(*) AS n FROM crawl_run')

  return {
    start(input, now): number {
      const result = insert.run(input.planId ?? null, input.platformId, now)
      return asId(result.lastInsertRowid)
    },
    finish(id, patch, now): void {
      update.run(
        now,
        patch.state,
        patch.pages ?? null,
        patch.found ?? null,
        patch.inserted ?? null,
        patch.updated ?? null,
        patch.skipped ?? null,
        patch.quarantined ?? null,
        patch.errorCode ?? null,
        patch.errorMsg ?? null,
        patch.logRef ?? null,
        id,
      )
    },
    get(id): CrawlRunDto | undefined {
      const row = selectOne.get(id) as Row | undefined
      return row === undefined ? undefined : toDto(row)
    },
    latest(platformId?): CrawlRunDto | undefined {
      const row =
        platformId === undefined
          ? (selectLatestAll.get() as Row | undefined)
          : (selectLatestPlatform.get(platformId) as Row | undefined)
      return row === undefined ? undefined : toDto(row)
    },
    list(limit, platformId?): CrawlRunDto[] {
      const rows =
        platformId === undefined
          ? (selectListAll.all(limit) as Row[])
          : (selectListPlatform.all(platformId, limit) as Row[])
      return rows.map(toDto)
    },
    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
