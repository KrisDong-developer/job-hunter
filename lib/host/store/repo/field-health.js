import { asInt, asText, asTextOrNull } from '../row.js';
export function createFieldHealthRepo(db) {
    const selectAll = db.prepare('SELECT field, consecutive_miss, miss_total, hit_total, last_miss_at, last_hit_at FROM adapter_field_health WHERE platform_id = ? ORDER BY field');
    const upsertHit = db.prepare(`INSERT INTO adapter_field_health (platform_id, field, consecutive_miss, miss_total, hit_total, last_hit_at)
     VALUES (?, ?, 0, 0, 1, ?)
     ON CONFLICT(platform_id, field) DO UPDATE SET
       consecutive_miss = 0,
       hit_total = hit_total + 1,
       last_hit_at = excluded.last_hit_at`);
    const upsertMiss = db.prepare(`INSERT INTO adapter_field_health (platform_id, field, consecutive_miss, miss_total, hit_total, last_miss_at)
     VALUES (?, ?, 1, 1, 0, ?)
     ON CONFLICT(platform_id, field) DO UPDATE SET
       consecutive_miss = consecutive_miss + 1,
       miss_total = miss_total + 1,
       last_miss_at = excluded.last_miss_at`);
    const selectMiss = db.prepare('SELECT consecutive_miss FROM adapter_field_health WHERE platform_id = ? AND field = ?');
    const resetStmt = db.prepare('UPDATE adapter_field_health SET consecutive_miss = 0 WHERE platform_id = ?');
    const toRecord = (row) => ({
        field: asText(row['field']),
        consecutiveMiss: asInt(row['consecutive_miss']),
        missTotal: asInt(row['miss_total']),
        hitTotal: asInt(row['hit_total']),
        lastMissAt: asTextOrNull(row['last_miss_at']),
        lastHitAt: asTextOrNull(row['last_hit_at']),
    });
    return {
        list(platformId) {
            return selectAll.all(platformId).map(toRecord);
        },
        recordHit(platformId, field, now) {
            upsertHit.run(platformId, field, now);
        },
        recordMiss(platformId, field, now) {
            upsertMiss.run(platformId, field, now);
            const row = selectMiss.get(platformId, field);
            return asInt(row?.['consecutive_miss']);
        },
        reset(platformId) {
            resetStmt.run(platformId);
        },
    };
}
//# sourceMappingURL=field-health.js.map