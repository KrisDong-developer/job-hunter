import { asId, asInt, asJson, asReal, asText } from '../row.js';
function toRecord(row) {
    return {
        id: asInt(row['id']),
        companyId: asInt(row['company_id']),
        type: asText(row['type']),
        evidence: asJson(row['evidence_json'], null),
        weight: asReal(row['weight']),
        source: asText(row['source'], 'rule'),
        createdAt: asText(row['created_at']),
    };
}
export function createSignalRepo(db) {
    const insert = db.prepare('INSERT INTO company_signal (company_id, type, evidence_json, weight, source, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const findSame = db.prepare('SELECT id FROM company_signal WHERE company_id = ? AND type = ? AND source = ? AND evidence_json = ? LIMIT 1');
    const selectByCompany = db.prepare('SELECT * FROM company_signal WHERE company_id = ? ORDER BY weight DESC, id LIMIT ?');
    const selectByType = db.prepare('SELECT * FROM company_signal WHERE type = ? ORDER BY weight DESC, id LIMIT ?');
    const clearSource = db.prepare('DELETE FROM company_signal WHERE company_id = ? AND source = ?');
    const countTypeStmt = db.prepare('SELECT type, count(*) AS n FROM company_signal GROUP BY type');
    const countStmt = db.prepare('SELECT count(*) AS n FROM company_signal');
    const write = (input, now) => {
        const evidenceJson = JSON.stringify(input.evidence ?? null);
        const result = insert.run(input.companyId, input.type, evidenceJson, input.weight ?? 0, input.source ?? 'rule', now);
        return asId(result.lastInsertRowid);
    };
    return {
        add(input, now) {
            return write(input, now);
        },
        addOnce(input, now) {
            const existing = findSame.get(input.companyId, input.type, input.source ?? 'rule', JSON.stringify(input.evidence ?? null));
            if (existing !== undefined)
                return null;
            return write(input, now);
        },
        listByCompany(companyId, limit = 100) {
            return selectByCompany.all(companyId, limit).map(toRecord);
        },
        listByType(type, limit) {
            return selectByType.all(type, limit).map(toRecord);
        },
        clearBySource(companyId, source) {
            return asInt(clearSource.run(companyId, source).changes);
        },
        countByType() {
            const out = {};
            for (const row of countTypeStmt.all())
                out[asText(row['type'])] = asInt(row['n']);
            return out;
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=signals.js.map