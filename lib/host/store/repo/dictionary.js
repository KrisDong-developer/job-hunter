import { asBool, asInt, asReal, asText, asTextOrNull } from '../row.js';
export const DICTIONARY_KINDS = [
    'jargon',
    'outsourcing',
    'fraud',
    'zombie',
    'salary',
];
function toEntry(row) {
    return {
        id: asInt(row['id']),
        kind: asText(row['kind']),
        scope: asText(row['scope'], 'global'),
        term: asText(row['term']),
        meaning: asTextOrNull(row['meaning']),
        weight: asReal(row['weight'], 1),
        enabled: asBool(row['enabled'], true),
    };
}
export function createDictionaryRepo(db) {
    const insertIgnore = db.prepare(`INSERT INTO dictionary (kind, scope, term, meaning, weight, enabled)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(kind, scope, term) DO NOTHING`);
    const upsertStmt = db.prepare(`INSERT INTO dictionary (kind, scope, term, meaning, weight, enabled)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, scope, term) DO UPDATE SET
       meaning = excluded.meaning, weight = excluded.weight, enabled = excluded.enabled`);
    const selectAll = db.prepare('SELECT * FROM dictionary WHERE enabled = 1 ORDER BY kind, term');
    const selectKind = db.prepare('SELECT * FROM dictionary WHERE enabled = 1 AND kind = ? ORDER BY term');
    const setEnabledStmt = db.prepare('UPDATE dictionary SET enabled = ? WHERE id = ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM dictionary');
    return {
        ensureSeed(entries) {
            let added = 0;
            for (const entry of entries) {
                const result = insertIgnore.run(entry.kind, entry.scope ?? 'global', entry.term, entry.meaning ?? null, entry.weight ?? 1);
                added += asInt(result.changes) > 0 ? 1 : 0;
            }
            return added;
        },
        list(kind) {
            const rows = kind === undefined ? selectAll.all() : selectKind.all(kind);
            return rows.map(toEntry);
        },
        upsert(input) {
            upsertStmt.run(input.kind, input.scope ?? 'global', input.term, input.meaning ?? null, input.weight ?? 1, input.enabled === false ? 0 : 1);
        },
        setEnabled(id, enabled) {
            setEnabledStmt.run(enabled ? 1 : 0, id);
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=dictionary.js.map