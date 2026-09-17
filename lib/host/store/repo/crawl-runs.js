import { asId, asInt, asText, asTextOrNull } from '../row.js';
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
    };
}
export function createCrawlRunRepo(db) {
    const insert = db.prepare(`INSERT INTO crawl_run (plan_id, platform_id, started_at, state)
     VALUES (?, ?, ?, 'running')`);
    const update = db.prepare(`UPDATE crawl_run SET
       ended_at = ?, state = ?,
       pages = coalesce(?, pages), found = coalesce(?, found),
       inserted = coalesce(?, inserted), updated = coalesce(?, updated),
       skipped = coalesce(?, skipped), quarantined = coalesce(?, quarantined),
       error_code = ?, error_msg = ?, log_ref = coalesce(?, log_ref)
     WHERE id = ?`);
    const selectOne = db.prepare('SELECT * FROM crawl_run WHERE id = ?');
    const selectLatestAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT 1');
    const selectLatestPlatform = db.prepare('SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT 1');
    const selectListAll = db.prepare('SELECT * FROM crawl_run ORDER BY id DESC LIMIT ?');
    const selectListPlatform = db.prepare('SELECT * FROM crawl_run WHERE platform_id = ? ORDER BY id DESC LIMIT ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM crawl_run');
    return {
        start(input, now) {
            const result = insert.run(input.planId ?? null, input.platformId, now);
            return asId(result.lastInsertRowid);
        },
        finish(id, patch, now) {
            update.run(now, patch.state, patch.pages ?? null, patch.found ?? null, patch.inserted ?? null, patch.updated ?? null, patch.skipped ?? null, patch.quarantined ?? null, patch.errorCode ?? null, patch.errorMsg ?? null, patch.logRef ?? null, id);
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
    };
}
//# sourceMappingURL=crawl-runs.js.map