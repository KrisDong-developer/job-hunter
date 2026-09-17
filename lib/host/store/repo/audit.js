import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull } from '../row.js';
/** 敏感正文的字段名（命中就只记长度，不记内容）。 */
const SENSITIVE_KEYS = ['text', 'content', 'body', 'message', 'resume', 'jd', 'jdText', 'payload', 'prompt'];
/** 单个字符串在摘要里保留的最大长度 —— 只用于判断"是不是同一段文本"，不用于还原。 */
const SUMMARY_PREVIEW = 40;
/**
 * 把任意载荷压缩成"字段摘要 + 长度"。
 *
 * - 字符串：`{ length, preview }`，敏感字段不保留 preview；
 * - 数组：`{ count, sample }`（sample 最多 3 项）；
 * - 对象：递归一层，深了就只记 `{ keys }`。
 */
export function summarize(value, depth = 0, keyHint = '') {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'number' || typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const sensitive = SENSITIVE_KEYS.some((key) => keyHint.toLowerCase().includes(key.toLowerCase()));
        return sensitive
            ? { length: value.length, redacted: true }
            : { length: value.length, preview: value.slice(0, SUMMARY_PREVIEW) };
    }
    if (Array.isArray(value)) {
        return { count: value.length, sample: value.slice(0, 3).map((item) => summarize(item, depth + 1, keyHint)) };
    }
    if (typeof value === 'object') {
        if (depth >= 2)
            return { keys: Object.keys(value).slice(0, 20) };
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = summarize(item, depth + 1, key);
        }
        return out;
    }
    return String(value);
}
function toRecord(row) {
    return {
        id: asInt(row['id']),
        at: asText(row['at']),
        actor: asText(row['actor']),
        action: asText(row['action']),
        target: asJson(row['target_json'], {}),
        detail: asJson(row['detail_json'], {}),
        result: asText(row['result']),
        reason: asTextOrNull(row['reason']),
        approval: asJson(row['approval_json'], null),
        durationMs: asIntOrNull(row['duration_ms']),
    };
}
export function createAuditRepo(db) {
    const insert = db.prepare(`INSERT INTO audit_log (at, actor, action, target_json, detail_json, result, reason, approval_json, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const selectAll = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?');
    const selectActor = db.prepare('SELECT * FROM audit_log WHERE actor = ? ORDER BY id DESC LIMIT ?');
    const selectAction = db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ?');
    const countStmt = db.prepare('SELECT count(*) AS n FROM audit_log');
    return {
        write(input, now) {
            const result = insert.run(now, input.actor, input.action, JSON.stringify(input.target ?? {}), 
            // 只存摘要，不存正文
            JSON.stringify(summarize(input.detail ?? {})), input.result, input.reason ?? null, input.approval === undefined ? null : JSON.stringify(input.approval), input.durationMs ?? null, now);
            return asId(result.lastInsertRowid);
        },
        list(limit, filter) {
            const rows = filter?.actor !== undefined
                ? selectActor.all(filter.actor, limit)
                : filter?.action !== undefined
                    ? selectAction.all(filter.action, limit)
                    : selectAll.all(limit);
            return rows.map(toRecord);
        },
        countByAction(action, sinceIso, onlyOk = true, platformId) {
            // 目标在 JSON 里，用 SQL 过滤要么上 JSON1 要么写 LIKE，都不如取一批在 JS 里判清楚。
            // 每日额度场景的量级很小（几十条），500 条的上界足够。
            const rows = selectAction.all(action, 500);
            let count = 0;
            for (const row of rows) {
                if (asText(row['at']) < sinceIso)
                    break; // 按 id 倒序 ≈ 时间倒序
                if (onlyOk && asText(row['result']) !== 'ok')
                    continue;
                if (platformId !== undefined) {
                    const target = asJson(row['target_json'], {});
                    if (target['platformId'] !== platformId)
                        continue;
                }
                count += 1;
            }
            return count;
        },
        count() {
            const row = countStmt.get();
            return asInt(row?.['n']);
        },
    };
}
//# sourceMappingURL=audit.js.map