import { asId, asInt, asJson, asText, asTextOrNull } from '../row.js';
function toRecord(row) {
    return {
        id: asInt(row['id']),
        at: asText(row['at']),
        purpose: asText(row['purpose']),
        provider: asTextOrNull(row['provider']),
        model: asTextOrNull(row['model']),
        fields: asJson(row['fields_json'], []),
        promptTokens: asInt(row['prompt_tokens']),
        completionTokens: asInt(row['completion_tokens']),
        ref: asJson(row['ref_json'], {}),
        ok: asInt(row['ok'], 1) !== 0,
        errorCode: asTextOrNull(row['error_code']),
        durationMs: asInt(row['duration_ms']),
    };
}
export function createLlmCallRepo(db) {
    const insert = db.prepare(`INSERT INTO llm_call (at, purpose, provider, model, fields_json, prompt_tokens, completion_tokens, ref_json, ok, error_code, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectAll = db.prepare('SELECT * FROM llm_call ORDER BY id DESC LIMIT ?');
    const selectPurpose = db.prepare('SELECT * FROM llm_call WHERE purpose = ? ORDER BY id DESC LIMIT ?');
    const statsStmt = db.prepare(`SELECT purpose, count(*) AS calls, sum(prompt_tokens) AS pt, sum(completion_tokens) AS ct
     FROM llm_call GROUP BY purpose ORDER BY calls DESC`);
    const countStmt = db.prepare('SELECT count(*) AS n FROM llm_call');
    return {
        write(input, now) {
            const result = insert.run(now, input.purpose, input.provider ?? null, input.model ?? null, JSON.stringify(input.fields ?? []), input.promptTokens ?? 0, input.completionTokens ?? 0, JSON.stringify(input.ref ?? {}), input.ok === false ? 0 : 1, input.errorCode ?? null, input.durationMs ?? 0, now);
            return asId(result.lastInsertRowid);
        },
        list(limit, purpose) {
            const rows = purpose === undefined
                ? selectAll.all(limit)
                : selectPurpose.all(purpose, limit);
            return rows.map(toRecord);
        },
        stats() {
            return statsStmt.all().map((row) => ({
                purpose: asText(row['purpose']),
                calls: asInt(row['calls']),
                promptTokens: asInt(row['pt']),
                completionTokens: asInt(row['ct']),
            }));
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=llm-calls.js.map