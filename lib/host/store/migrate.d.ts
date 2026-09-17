import type { DatabaseSync } from 'node:sqlite';
export interface Migration {
    version: number;
    name: string;
    sql: string;
}
/** 迁移清单。**只追加，不修改历史条目** —— 已发布的版本可能已经在别人机器上跑过。 */
export declare const MIGRATIONS: readonly Migration[];
export interface MigrationReport {
    from: number;
    to: number;
    applied: Array<{
        version: number;
        name: string;
    }>;
    backupPath: string | null;
}
export interface MigrateOptions {
    /** 库文件路径，用于推导备份位置。 */
    dbPath: string;
    now?: () => Date;
    /** 跳过快照（只在测试里用；生产路径永远备份）。 */
    skipBackup?: boolean;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
/** 当前 `user_version`。 */
export declare function currentVersion(db: DatabaseSync): number;
/**
 * 执行所有待应用迁移。
 * @throws DomainError('DATA_UNAVAILABLE') 某个版本失败（事务已回滚，库停留在失败前的版本）
 */
export declare function migrate(db: DatabaseSync, options: MigrateOptions): MigrationReport;
//# sourceMappingURL=migrate.d.ts.map