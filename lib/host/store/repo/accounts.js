import { asBool, asInt, asText, asTextOrNull } from '../row.js';
export function createAccountRepo(db) {
    const upsertStmt = db.prepare(`INSERT INTO account_state (platform_id, logged_in, hidden_from_current_employer, last_check_at, hint, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(platform_id) DO UPDATE SET
       logged_in = excluded.logged_in,
       hidden_from_current_employer = excluded.hidden_from_current_employer,
       last_check_at = excluded.last_check_at,
       hint = excluded.hint,
       updated_at = excluded.updated_at`);
    const selectOne = db.prepare('SELECT * FROM account_state WHERE platform_id = ?');
    const selectAll = db.prepare('SELECT * FROM account_state ORDER BY platform_id');
    const toRecord = (row) => {
        const hidden = row['hidden_from_current_employer'];
        return {
            platformId: asText(row['platform_id']),
            loggedIn: asBool(row['logged_in']),
            hiddenFromCurrentEmployer: hidden === null || hidden === undefined ? null : asInt(hidden) !== 0,
            lastCheckAt: asTextOrNull(row['last_check_at']),
            hint: asTextOrNull(row['hint']),
            updatedAt: asTextOrNull(row['updated_at']),
        };
    };
    return {
        upsert(input, now) {
            upsertStmt.run(input.platformId, input.loggedIn ? 1 : 0, input.hiddenFromCurrentEmployer === null ? null : input.hiddenFromCurrentEmployer ? 1 : 0, now, input.hint, now);
        },
        get(platformId) {
            const row = selectOne.get(platformId);
            return row === undefined ? undefined : toRecord(row);
        },
        list() {
            return selectAll.all().map(toRecord);
        },
    };
}
//# sourceMappingURL=accounts.js.map