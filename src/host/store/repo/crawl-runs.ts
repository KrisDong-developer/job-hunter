import type { DatabaseSync } from 'node:sqlite'
import type { CrawlState } from '../../../shared/contract/enums/crawl.js'
import type { CrawlFailureCode } from '../../../shared/contract/enums/error.js'
import type { CrawlRunDto } from '../../../shared/contract/dto/crawl.js'
import { asId, asInt, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 悬挂 `running` 的收敛阈值（SR-15 / A3）。
 *
 * 为什么是 2 小时：正常一轮抓取最多几分钟（单页 + 1.2–3.2s 随机延时），
 * 2 小时意味着"进程当时已经不在了"。阈值故意给得很宽 ——
 * **把一轮还在跑的抓取误判成失败，比留一条悬挂记录更糟**：前者会让用户以为数据是坏的。
 */
export const STALE_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000

/** 结束一轮抓取时写入的汇总（§6.1 / §7 `crawl_run`）。 */
export interface CrawlRunPatch {
  state: CrawlState
  pages?: number
  found?: number
  inserted?: number
  updated?: number
  skipped?: number
  quarantined?: number
  /** 失败码。取值域见 shared 的 `CRAWL_FAILURE_CODES`（写错了编译不过）。 */
  errorCode?: CrawlFailureCode | null
  errorMsg?: string | null
  logRef?: string | null
  /** SR-28/29：触发原因（schedule / manual / catch-up）。 */
  reason?: string | null
  /** SR-17/29：跳过原因（枚举键）。只有"到点了但没跑"才写。 */
  skipReason?: string | null
}

export interface CrawlRunRepo {
  start(
    input: { platformId: string; planId?: number | null; reason?: string | null },
    now: string,
  ): number
  finish(id: number, patch: CrawlRunPatch, now: string): void
  get(id: number): CrawlRunDto | undefined
  latest(platformId?: string): CrawlRunDto | undefined
  list(limit: number, platformId?: string): CrawlRunDto[]
  count(): number
  /**
   * SR-15：把**超过阈值仍在 `running`** 的记录收敛为 `failed`。
   *
   * 为什么必须有：进程被强杀（或机器断电）时 `finish()` 根本没机会执行，
   * 那条记录会**永远**停在 `running`。而 `crawlStatus().busy` 之类的判断会因此一直显示"正在跑"，
   * 用户看到的是一个永远不结束的抓取，且下次启动的互斥判断也可能被它带偏。
   *
   * @returns 被收敛的记录数
   */
  reapStale(now: string, thresholdMs?: number): number
  /** 当前有没有"看起来还在跑"的记录（诊断用，不做业务判断）。 */
  countRunning(): number
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
    // 读出来时收窄一次：库里可能留着旧版本写的码（取值域见 CRAWL_FAILURE_CODES）。
    // 这是**唯一**的收窄点 —— 写入侧由类型保证，读侧只此一处，所以不会有第三份口径。
    errorCode: asTextOrNull(row['error_code']) as CrawlFailureCode | null,
    errorMsg: asTextOrNull(row['error_msg']),
    // SR-28/29：触发原因与跳过原因都随记录落库 —— 否则运行历史表回答不了"这次是谁触发的"
    reason: asTextOrNull(row['reason']),
    skipReason: asTextOrNull(row['skip_reason']),
  }
}

export function createCrawlRunRepo(db: DatabaseSync): CrawlRunRepo {
  const insert = db.prepare(
    `INSERT INTO crawl_run (plan_id, platform_id, started_at, state, reason)
     VALUES (?, ?, ?, 'running', ?)`,
  )
  const update = db.prepare(
    `UPDATE crawl_run SET
       ended_at = ?, state = ?,
       pages = coalesce(?, pages), found = coalesce(?, found),
       inserted = coalesce(?, inserted), updated = coalesce(?, updated),
       skipped = coalesce(?, skipped), quarantined = coalesce(?, quarantined),
       error_code = ?, error_msg = ?, log_ref = coalesce(?, log_ref),
       reason = coalesce(?, reason),
       skip_reason = ?
     WHERE id = ?`,
  )
  const selectOne = db.prepare('SELECT * FROM crawl_run WHERE id = ?')
  const selectLatestAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT 1')
  const selectLatestPlatform = db.prepare(
    'SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT 1',
  )
  /**
   * 「最近 N 轮」按 **`started_at`** 倒序，不是按 `id`。
   *
   * `id` 是**写入顺序**，`started_at` 才是**发生时刻**。真实抓取下两者一致
   * （每轮跑完就写一条），所以这条曾经"看起来没问题"；但一旦有行是**事后补写**的
   * （验收/历史数据、按旧日期灌进来的样本），`id` 序与时间序就会分叉 ——
   * 界面上的「最近运行」于是看起来是乱的：它确实按 id 倒序排了，
   * 只是那个顺序**不是时间顺序**。
   *
   * 这条列表要回答的问题是"最近发生了什么"，所以次序必须由时间定义。
   * `id DESC` 留作**同一时刻的稳定次序**（同一毫秒内写入的多条不会来回跳）。
   *
   * 注意 `latest()` 那两条查询**没有**改：它是"最后写入的那一轮"，实时写入路径下
   * 与时间序一致，而它服务的是健康/连续失败记账，不在"最近运行"这条线上。
   */
  const selectListAll = db.prepare(
    'SELECT * FROM crawl_run ORDER BY started_at DESC, id DESC LIMIT ?',
  )
  const selectListPlatform = db.prepare(
    'SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY started_at DESC, id DESC LIMIT ?',
  )
  const countStmt = db.prepare('SELECT count(*) AS n FROM crawl_run')
  const selectStale = db.prepare(
    "SELECT id, started_at FROM crawl_run WHERE state = 'running' AND started_at < ? ORDER BY id",
  )
  const countRunningStmt = db.prepare("SELECT count(*) AS n FROM crawl_run WHERE state = 'running'")
  const reapOne = db.prepare(
    `UPDATE crawl_run SET
       ended_at = ?, state = 'failed',
       error_code = 'ORPHANED', error_msg = ?
     WHERE id = ? AND state = 'running'`,
  )

  return {
    start(input, now): number {
      const result = insert.run(input.planId ?? null, input.platformId, now, input.reason ?? null)
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
        patch.reason ?? null,
        patch.skipReason ?? null,
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

    reapStale(now, thresholdMs = STALE_RUN_THRESHOLD_MS): number {
      const at = new Date(now)
      if (Number.isNaN(at.getTime())) return 0
      const cutoff = new Date(at.getTime() - Math.max(0, thresholdMs)).toISOString()
      const stale = selectStale.all(cutoff) as Row[]
      let reaped = 0
      for (const row of stale) {
        const message =
          `这一轮抓取在 ${asText(row['started_at'])} 开始，但进程在结束前就退出了 —— ` +
          '已按失败收敛（SR-15）。数据以最后一批成功写入的为准。'
        if (asInt(reapOne.run(now, message, asInt(row['id'])).changes) > 0) reaped += 1
      }
      return reaped
    },

    countRunning(): number {
      const row = countRunningStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
