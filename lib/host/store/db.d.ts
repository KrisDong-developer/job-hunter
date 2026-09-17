import { DatabaseSync } from 'node:sqlite';
/** 解析数据目录。优先显式入参，其次环境变量，最后 `$DSH_HOME/job-hunter`。 */
export declare function resolveDataDir(explicit?: string): string;
/** 主库文件路径。**必须是独立文件**：session-query 用的是它自己的库。 */
export declare function resolveDbPath(dataDir?: string): string;
/**
 * 打开（必要时创建）主库，并校验 `application_id`。
 *
 * 归属判定：
 *   * 已经是本项目的 id → 直接放行；
 *   * 还是 0（全新文件）**且库里没有任何业务表** → 认领它；
 *   * 否则一律拒绝 —— 包括“有表但没写 application_id”的库，那多半是别人的。
 *
 * @throws DomainError('DATA_UNAVAILABLE') 归属校验失败时
 */
export declare function openDatabase(dbPath: string): DatabaseSync;
/** 关闭连接；WAL 会在最后一次连接关闭时自动 checkpoint。 */
export declare function closeDatabase(db: DatabaseSync): void;
//# sourceMappingURL=db.d.ts.map