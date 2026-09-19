/**
 * sqlite 连接（§4.1）。
 *
 * 三条硬约束在这里落地：
 *   1. `application_id` 自保护 —— 不符就**拒绝打开**，避免误开别的库；
 *   2. WAL + busy_timeout + foreign_keys 是连接级设置，必须每次连接都设；
 *   3. 文件位置固定在 `$DSH_HOME/job-hunter/data.db`，不写别的地方（§8 红线）。
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { APPLICATION_ID, DATA_DIR_ENV, DATA_DIR_NAME, DB_FILENAME } from '../../shared/config/plugin.js'
import { DomainError } from '../util/errors.js'
import { asInt, type Row } from './row.js'

/** 解析数据目录。优先显式入参，其次环境变量，最后 `$DSH_HOME/job-hunter`。 */
export function resolveDataDir(explicit?: string): string {
  if (explicit !== undefined && explicit !== '') return explicit
  const override = process.env[DATA_DIR_ENV]
  if (override !== undefined && override !== '') return override
  const home = process.env['DSH_HOME']
  const base = home !== undefined && home !== '' ? home : join(homedir(), '.dsh')
  return join(base, DATA_DIR_NAME)
}

/** 主库文件路径。**必须是独立文件**：session-query 用的是它自己的库。 */
export function resolveDbPath(dataDir?: string): string {
  return join(resolveDataDir(dataDir), DB_FILENAME)
}

/** 连接级 PRAGMA。WAL 下 synchronous=NORMAL 是安全且明显更快的档位。 */
function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
}

function userTableCount(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .get() as Row | undefined
  return asInt(row?.['n'])
}

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
export function openDatabase(dbPath: string): DatabaseSync {
  mkdirSync(join(dbPath, '..'), { recursive: true })
  const db = new DatabaseSync(dbPath)
  try {
    applyPragmas(db)

    const row = db.prepare('PRAGMA application_id').get() as Row | undefined
    const current = asInt(row?.['application_id'])
    if (current === APPLICATION_ID) return db

    const tables = userTableCount(db)
    if (current === 0 && tables === 0) {
      db.exec(`PRAGMA application_id = ${Math.trunc(APPLICATION_ID)}`)
      return db
    }

    throw new DomainError('DATA_UNAVAILABLE', `${dbPath} 不是 dsh-job-hunter 的数据库`, {
      hint:
        current === 0
          ? '该文件已有业务表但没有 application_id，可能属于别的程序。请换一个数据目录（DSH_JOB_HUNTER_DATA_DIR）或先备份后移走它。'
          : `该文件的 application_id=${current}，与本项目的 ${APPLICATION_ID} 不符。`,
      detail: { path: dbPath, applicationId: current, tables },
    })
  } catch (error) {
    try {
      db.close()
    } catch {
      /* 关不上就算了，原始错误更重要 */
    }
    throw error
  }
}

/** 关闭连接；WAL 会在最后一次连接关闭时自动 checkpoint。 */
export function closeDatabase(db: DatabaseSync): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch {
    /* checkpoint 失败不影响关闭 */
  }
  db.close()
}
