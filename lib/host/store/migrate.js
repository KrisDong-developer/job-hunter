/**
 * 迁移（§4.1「启动引导与迁移安全」）。
 *
 * 规则：
 *   * `user_version` 落后才迁移；
 *   * 迁移前**先备份**（`VACUUM INTO`，不是手工复制文件 —— WAL 下复制 .db 会拿到半截状态）；
 *   * 每个版本一个事务，失败**回滚并让插件拒绝启动**（带病运行会污染数据，比不启动更糟）。
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DomainError, messageOf } from '../util/errors.js';
import { asInt } from './row.js';
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, SCHEMA_V5, SCHEMA_V6, SCHEMA_V7, SCHEMA_V8, SCHEMA_V9, SCHEMA_V10, SCHEMA_V11, SCHEMA_V12, SCHEMA_V13, } from './schema.js';
/** 迁移清单。**只追加，不修改历史条目** —— 已发布的版本可能已经在别人机器上跑过。 */
export const MIGRATIONS = [
    { version: 1, name: 'init', sql: SCHEMA_V1 },
    { version: 2, name: 'intel', sql: SCHEMA_V2 },
    { version: 3, name: 'security', sql: SCHEMA_V3 },
    { version: 4, name: 'resume', sql: SCHEMA_V4 },
    { version: 5, name: 'pipeline', sql: SCHEMA_V5 },
    { version: 6, name: 'branches', sql: SCHEMA_V6 },
    { version: 7, name: 'scheduling', sql: SCHEMA_V7 },
    { version: 8, name: 'indexes', sql: SCHEMA_V8 },
    { version: 9, name: 'plan-platform-overrides', sql: SCHEMA_V9 },
    { version: 10, name: 'offer', sql: SCHEMA_V10 },
    { version: 11, name: 'job-score-index', sql: SCHEMA_V11 },
    { version: 12, name: 'greeting-template-resume', sql: SCHEMA_V12 },
    { version: 13, name: 'company-enrichment', sql: SCHEMA_V13 },
];
/** 当前 `user_version`。 */
export function currentVersion(db) {
    const row = db.prepare('PRAGMA user_version').get();
    return asInt(row?.['user_version']);
}
/** `VACUUM INTO` 一致性快照。 */
function snapshot(db, dbPath, at, fromVersion) {
    const dir = join(dirname(dbPath), 'backups');
    mkdirSync(dir, { recursive: true });
    const stamp = at.toISOString().replace(/[:.]/g, '-');
    const target = join(dir, `data-v${fromVersion}-${stamp}.db`);
    // 目标必须不存在，VACUUM INTO 才会成功
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    return target;
}
/**
 * 执行所有待应用迁移。
 * @throws DomainError('DATA_UNAVAILABLE') 某个版本失败（事务已回滚，库停留在失败前的版本）
 */
export function migrate(db, options) {
    const from = currentVersion(db);
    const pending = MIGRATIONS.filter((migration) => migration.version > from).sort((a, b) => a.version - b.version);
    if (pending.length === 0) {
        return { from, to: from, applied: [], backupPath: null };
    }
    const last = pending[pending.length - 1];
    const target = last === undefined ? from : last.version;
    let backupPath = null;
    // 全新库（from === 0）没有数据可备份
    if (from > 0 && options.skipBackup !== true) {
        backupPath = snapshot(db, options.dbPath, options.now?.() ?? new Date(), from);
        options.logger?.info(`[migrate] 迁移前备份 → ${backupPath}`);
    }
    const applied = [];
    for (const migration of pending) {
        db.exec('BEGIN IMMEDIATE');
        try {
            db.exec(migration.sql);
            // user_version 存在库头里，随事务一起提交/回滚
            db.exec(`PRAGMA user_version = ${Math.trunc(migration.version)}`);
            db.exec('COMMIT');
            applied.push({ version: migration.version, name: migration.name });
            options.logger?.info(`[migrate] v${migration.version} ${migration.name} 已应用`);
        }
        catch (error) {
            try {
                db.exec('ROLLBACK');
            }
            catch {
                /* 事务可能已因错误自动回滚 */
            }
            throw new DomainError('DATA_UNAVAILABLE', `迁移 v${migration.version} (${migration.name}) 失败，已回滚：${messageOf(error)}`, {
                hint: backupPath === null
                    ? '数据库未被改动，请排查后重试。'
                    : `数据库仍停留在 v${from}，迁移前快照在 ${backupPath}。`,
                detail: { from, failedVersion: migration.version, backupPath },
                cause: error,
            });
        }
    }
    return { from, to: target, applied, backupPath };
}
//# sourceMappingURL=migrate.js.map