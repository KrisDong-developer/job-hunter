import { asId, asInt, asJson, asText, asTextOrNull } from '../row.js';
/** 单条记录的 HTML 片段上限，避免隔离队列自己变成磁盘黑洞。 */
const RAW_HTML_LIMIT = 20_000;
export function createRepairRepo(db) {
    const insert = db.prepare(`INSERT INTO pending_repair (
       platform_id, crawl_run_id, captured_at, missing_fields_json, raw_json, raw_html, source_url, note
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const countAll = db.prepare("SELECT count(*) AS n FROM pending_repair WHERE replay_state = 'pending'");
    const countPlatform = db.prepare("SELECT count(*) AS n FROM pending_repair WHERE replay_state = 'pending' AND platform_id = ?");
    const listAll = db.prepare("SELECT * FROM pending_repair WHERE replay_state = 'pending' ORDER BY id DESC LIMIT ?");
    const listPlatform = db.prepare("SELECT * FROM pending_repair WHERE replay_state = 'pending' AND platform_id = ? ORDER BY id DESC LIMIT ?");
    const markReplayedStmt = db.prepare("UPDATE pending_repair SET replay_state = 'replayed', replayed_at = ?, replayed_job_id = ? WHERE id = ?");
    const clearStmt = db.prepare("UPDATE pending_repair SET replay_state = 'discarded' WHERE platform_id = ? AND replay_state = 'pending'");
    const selectOne = db.prepare('SELECT * FROM pending_repair WHERE id = ?');
    const discardStmt = db.prepare("UPDATE pending_repair SET replay_state = 'discarded' WHERE id = ? AND replay_state = 'pending'");
    const toRecord = (row) => ({
        id: asInt(row['id']),
        platformId: asText(row['platform_id']),
        crawlRunId: row['crawl_run_id'] === null || row['crawl_run_id'] === undefined ? null : asInt(row['crawl_run_id']),
        capturedAt: asText(row['captured_at']),
        missingFields: asJson(row['missing_fields_json'], []),
        raw: asJson(row['raw_json'], null),
        sourceUrl: asTextOrNull(row['source_url']),
        replayState: asText(row['replay_state'], 'pending'),
    });
    return {
        enqueue(input, now) {
            const html = typeof input.rawHtml === 'string' && input.rawHtml.length > RAW_HTML_LIMIT
                ? input.rawHtml.slice(0, RAW_HTML_LIMIT)
                : (input.rawHtml ?? null);
            const result = insert.run(input.platformId, input.crawlRunId ?? null, now, JSON.stringify(input.missingFields), JSON.stringify(input.raw ?? null), html, input.sourceUrl ?? null, input.note ?? null);
            return asId(result.lastInsertRowid);
        },
        countPending(platformId) {
            const row = platformId === undefined
                ? countAll.get()
                : countPlatform.get(platformId);
            return asInt(row?.['n']);
        },
        listPending(platformId, limit) {
            const rows = platformId === undefined
                ? listAll.all(limit)
                : listPlatform.all(platformId, limit);
            return rows.map(toRecord);
        },
        get(id) {
            const row = selectOne.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        discard(id) {
            return Number(discardStmt.run(id).changes) > 0;
        },
        markReplayed(id, jobId, now) {
            markReplayedStmt.run(now, jobId, id);
        },
        clear(platformId) {
            return asInt(clearStmt.run(platformId).changes);
        },
    };
}
//# sourceMappingURL=repairs.js.map