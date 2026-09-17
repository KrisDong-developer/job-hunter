import { asId, asInt, asText, asTextOrNull } from '../row.js';
/**
 * 悬挂 `running` 的收敛阈值（SR-15 / A3）。
 *
 * 为什么是 2 小时：正常一轮抓取最多几分钟（单页 + 1.2–3.2s 随机延时），
 * 2 小时意味着"进程当时已经不在了"。阈值故意给得很宽 ——
 * **把一轮还在跑的抓取误判成失败，比留一条悬挂记录更糟**：前者会让用户以为数据是坏的。
 */
export const STALE_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000;
function toDto(row) {
    return {
        id: asInt(row['id']),
        platformId: asText(row['platform_id']),
        planId: row['plan_id'] === null || row['plan_id'] === undefined ? null : asInt(row['plan_id']),
        startedAt: asText(row['started_at']),
        endedAt: asTextOrNull(row['ended_at']),
        state: asText(row['state'], 'queued'),
        pages: asInt(row['pages']),
        found: asInt(row['found']),
        inserted: asInt(row['inserted']),
        updated: asInt(row['updated']),
        skipped: asInt(row['skipped']),
        quarantined: asInt(row['quarantined']),
        errorCode: asTextOrNull(row['error_code']),
        errorMsg: asTextOrNull(row['error_msg']),
        // SR-28/29：触发原因与跳过原因都随记录落库 —— 否则运行历史表回答不了"这次是谁触发的"
        reason: asTextOrNull(row['reason']),
        skipReason: asTextOrNull(row['skip_reason']),
    };
}
export function createCrawlRunRepo(db) {
    const insert = db.prepare(`INSERT INTO crawl_run (plan_id, platform_id, started_at, state, reason)
     VALUES (?, ?, ?, 'running', ?)`);
    const update = db.prepare(`UPDATE crawl_run SET
       ended_at = ?, state = ?,
       pages = coalesce(?, pages), found = coalesce(?, found),
       inserted = coalesce(?, inserted), updated = coalesce(?, updated),
       skipped = coalesce(?, skipped), quarantined = coalesce(?, quarantined),
       error_code = ?, error_msg = ?, log_ref = coalesce(?, log_ref),
       reason = coalesce(?, reason),
       skip_reason = ?
     WHERE id = ?`);
    const selectOne = db.prepare('SELECT * FROM crawl_run WHERE id = ?');
    const selectLatestAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT 1');
    const selectLatestPlatform = db.prepare('SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT 1');
    const selectListAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT ?');
    const selectListPlatform = db.prepare('SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM crawl_run');
    const selectStale = db.prepare("SELECT id, started_at FROM crawl_run WHERE state = 'running' AND started_at < ? ORDER BY id");
    const countRunningStmt = db.prepare("SELECT count(*) AS n FROM crawl_run WHERE state = 'running'");
    const reapOne = db.prepare(`UPDATE crawl_run SET
       ended_at = ?, state = 'failed',
       error_code = 'ORPHANED', error_msg = ?
     WHERE id = ? AND state = 'running'`);
    return {
        start(input, now) {
            const result = insert.run(input.planId ?? null, input.platformId, now, input.reason ?? null);
            return asId(result.lastInsertRowid);
        },
        finish(id, patch, now) {
            update.run(now, patch.state, patch.pages ?? null, patch.found ?? null, patch.inserted ?? null, patch.updated ?? null, patch.skipped ?? null, patch.quarantined ?? null, patch.errorCode ?? null, patch.errorMsg ?? null, patch.logRef ?? null, patch.reason ?? null, patch.skipReason ?? null, id);
        },
        get(id) {
            const row = selectOne.get(id);
            return row === undefined ? undefined : toDto(row);
        },
        latest(platformId) {
            const row = platformId === undefined
                ? selectLatestAll.get()
                : selectLatestPlatform.get(platformId);
            return row === undefined ? undefined : toDto(row);
        },
        list(limit, platformId) {
            const rows = platformId === undefined
                ? selectListAll.all(limit)
                : selectListPlatform.all(platformId, limit);
            return rows.map(toDto);
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
        reapStale(now, thresholdMs = STALE_RUN_THRESHOLD_MS) {
            const at = new Date(now);
            if (Number.isNaN(at.getTime()))
                return 0;
            const cutoff = new Date(at.getTime() - Math.max(0, thresholdMs)).toISOString();
            const stale = selectStale.all(cutoff);
            let reaped = 0;
            for (const row of stale) {
                const message = `这一轮抓取在 ${asText(row['started_at'])} 开始，但进程在结束前就退出了 —— ` +
                    '已按失败收敛（SR-15）。数据以最后一批成功写入的为准。';
                if (asInt(reapOne.run(now, message, asInt(row['id'])).changes) > 0)
                    reaped += 1;
            }
            return reaped;
        },
        countRunning() {
            const row = countRunningStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=crawl-runs.js.map