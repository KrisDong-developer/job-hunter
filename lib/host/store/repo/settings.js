import { asJson, asText } from '../row.js';
export function createSettingRepo(db) {
    const selectOne = db.prepare('SELECT key, scope, scope_ref, value_json, updated_at FROM setting WHERE key = ? AND scope = ? AND scope_ref = ?');
    const selectScope = db.prepare('SELECT key, scope, scope_ref, value_json, updated_at FROM setting WHERE scope = ? AND scope_ref = ? ORDER BY key');
    const upsert = db.prepare(`INSERT INTO setting (key, scope, scope_ref, value_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(key, scope, scope_ref) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`);
    const del = db.prepare('DELETE FROM setting WHERE key = ? AND scope = ? AND scope_ref = ?');
    const toRecord = (row) => ({
        key: asText(row['key']),
        scope: asText(row['scope']),
        scopeRef: asText(row['scope_ref']),
        value: asJson(row['value_json'], null),
        updatedAt: asText(row['updated_at']),
    });
    return {
        get(key, scope, scopeRef = '') {
            const row = selectOne.get(key, scope, scopeRef);
            if (row === undefined)
                return undefined;
            return asJson(row['value_json'], undefined);
        },
        set(key, scope, scopeRef, value, now) {
            upsert.run(key, scope, scopeRef, JSON.stringify(value ?? null), now);
        },
        remove(key, scope, scopeRef) {
            del.run(key, scope, scopeRef);
        },
        listByScope(scope, scopeRef) {
            return selectScope.all(scope, scopeRef).map(toRecord);
        },
    };
}
//# sourceMappingURL=settings.js.map