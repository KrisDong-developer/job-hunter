import { asBool, asInt, asIntOrNull, asJson, asText, asTextOrNull } from '../row.js';
export function createPlatformRepo(db) {
    const insert = db.prepare(`INSERT INTO platform (id, display_name, capabilities_json, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, capabilities_json = excluded.capabilities_json`);
    const selectOne = db.prepare('SELECT * FROM platform WHERE id = ?');
    const selectAll = db.prepare('SELECT * FROM platform ORDER BY id');
    const updateHealth = db.prepare('UPDATE platform SET health_state = ?, health_reason = ? WHERE id = ?');
    // 只清失败计数与记 last_ok_at。**健康态不在这里翻** ——
    // 从 degraded/broken 回到 healthy 的唯一依据是「解析真的恢复了」（见 platform/health.ts）。
    // 早先这里顺手把 health_state 置成 healthy，结果降级状态被一次 run 抹掉，
    // 恢复待办永远关不掉。
    const updateSuccess = db.prepare('UPDATE platform SET fail_streak = 0, last_ok_at = ? WHERE id = ?');
    const updateFailure = db.prepare('UPDATE platform SET fail_streak = fail_streak + 1 WHERE id = ?');
    const selectStreak = db.prepare('SELECT fail_streak FROM platform WHERE id = ?');
    const toRecord = (row) => ({
        id: asText(row['id']),
        displayName: asText(row['display_name']),
        enabled: asBool(row['enabled'], true),
        capabilities: asJson(row['capabilities_json'], {}),
        health: asText(row['health_state'], 'healthy'),
        healthReason: asTextOrNull(row['health_reason']),
        failStreak: asInt(row['fail_streak']),
        lastOkAt: asTextOrNull(row['last_ok_at']),
        createdAt: asText(row['created_at']),
    });
    return {
        ensure(input, now) {
            insert.run(input.id, input.displayName, JSON.stringify(input.capabilities ?? {}), now);
        },
        get(id) {
            const row = selectOne.get(id);
            return row === undefined ? undefined : toRecord(row);
        },
        list() {
            return selectAll.all().map(toRecord);
        },
        setHealth(id, health, reason, _now) {
            updateHealth.run(health, reason, id);
        },
        recordSuccess(id, now) {
            updateSuccess.run(now, id);
        },
        recordFailure(id) {
            updateFailure.run(id);
            const row = selectStreak.get(id);
            return asIntOrNull(row?.['fail_streak']) ?? 0;
        },
    };
}
//# sourceMappingURL=platforms.js.map