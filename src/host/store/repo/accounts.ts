import type { DatabaseSync } from 'node:sqlite'
import { asBool, asInt, asText, asTextOrNull, type Row } from '../row.js'

/** 一个平台的账号/登录态。**绝不存密码**。 */
export interface AccountRecord {
  platformId: string
  loggedIn: boolean
  hiddenFromCurrentEmployer: boolean | null
  lastCheckAt: string | null
  hint: string | null
  updatedAt: string | null
}

export interface AccountUpsertInput {
  platformId: string
  loggedIn: boolean
  hiddenFromCurrentEmployer: boolean | null
  hint: string | null
}

export interface AccountRepo {
  upsert(input: AccountUpsertInput, now: string): void
  get(platformId: string): AccountRecord | undefined
  list(): AccountRecord[]
}

export function createAccountRepo(db: DatabaseSync): AccountRepo {
  const upsertStmt = db.prepare(
    `INSERT INTO account_state (platform_id, logged_in, hidden_from_current_employer, last_check_at, hint, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(platform_id) DO UPDATE SET
       logged_in = excluded.logged_in,
       hidden_from_current_employer = excluded.hidden_from_current_employer,
       last_check_at = excluded.last_check_at,
       hint = excluded.hint,
       updated_at = excluded.updated_at`,
  )
  const selectOne = db.prepare('SELECT * FROM account_state WHERE platform_id = ?')
  const selectAll = db.prepare('SELECT * FROM account_state ORDER BY platform_id')

  const toRecord = (row: Row): AccountRecord => {
    const hidden = row['hidden_from_current_employer']
    return {
      platformId: asText(row['platform_id']),
      loggedIn: asBool(row['logged_in']),
      hiddenFromCurrentEmployer: hidden === null || hidden === undefined ? null : asInt(hidden) !== 0,
      lastCheckAt: asTextOrNull(row['last_check_at']),
      hint: asTextOrNull(row['hint']),
      updatedAt: asTextOrNull(row['updated_at']),
    }
  }

  return {
    upsert(input, now): void {
      upsertStmt.run(
        input.platformId,
        input.loggedIn ? 1 : 0,
        input.hiddenFromCurrentEmployer === null ? null : input.hiddenFromCurrentEmployer ? 1 : 0,
        now,
        input.hint,
        now,
      )
    },
    get(platformId): AccountRecord | undefined {
      const row = selectOne.get(platformId) as Row | undefined
      return row === undefined ? undefined : toRecord(row)
    },
    list(): AccountRecord[] {
      return (selectAll.all() as Row[]).map(toRecord)
    },
  }
}
