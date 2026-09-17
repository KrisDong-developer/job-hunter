import { asId, asInt, asJson, asText, asTextOrNull } from '../row.js';
export function createTodoRepo(db) {
    const insert = db.prepare(`INSERT INTO todo (kind, level, title, ref, detail_json, due_at, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`);
    const findOpen = db.prepare("SELECT id FROM todo WHERE kind = ? AND ifnull(ref, '') = ifnull(?, '') AND state = 'open' LIMIT 1");
    const selectOpen = db.prepare("SELECT id, kind, level, title, ref, detail_json, due_at, state, created_at FROM todo WHERE state = 'open' ORDER BY CASE level WHEN 'urgent' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, id DESC LIMIT ?");
    const countOpenStmt = db.prepare("SELECT count(*) AS n FROM todo WHERE state = 'open'");
    const closeByIdStmt = db.prepare("UPDATE todo SET state = 'closed', read_at = ? WHERE id = ? AND state = 'open'");
    const closeStmt = db.prepare("UPDATE todo SET state = 'closed' WHERE kind = ? AND ifnull(ref, '') = ifnull(?, '') AND state = 'open'");
    const toRecord = (row) => ({
        id: asInt(row['id']),
        kind: asText(row['kind']),
        level: asText(row['level'], 'info'),
        title: asText(row['title']),
        ref: asTextOrNull(row['ref']),
        detail: asJson(row['detail_json'], null),
        dueAt: asTextOrNull(row['due_at']),
        state: asText(row['state'], 'open'),
        createdAt: asText(row['created_at']),
    });
    const create = (input, now) => {
        const result = insert.run(input.kind, input.level ?? 'info', input.title, input.ref ?? null, JSON.stringify(input.detail ?? {}), input.dueAt ?? null, now);
        return asId(result.lastInsertRowid);
    };
    return {
        create,
        createOnce(input, now) {
            const existing = findOpen.get(input.kind, input.ref ?? '');
            if (existing !== undefined)
                return null;
            return create(input, now);
        },
        listOpen(limit = 50) {
            return selectOpen.all(limit).map(toRecord);
        },
        countOpen() {
            const row = countOpenStmt.get();
            return asInt(row?.['n']);
        },
        close(id, now) {
            return asInt(closeByIdStmt.run(now, id).changes) > 0;
        },
        closeByRef(kind, ref, _now) {
            const result = closeStmt.run(kind, ref);
            return asInt(result.changes);
        },
    };
}
//# sourceMappingURL=todos.js.map