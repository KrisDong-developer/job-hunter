import type { DatabaseSync } from 'node:sqlite'
import type { AuditRecordDto } from '../../../shared/contract/dto/settings.js'
import { asId, asInt, asIntOrNull, asJson, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 审计表（§4.4.3 / §4.1 审计表隐私策略）。
 *
 * **铁律：审计只存字段摘要与长度，涉敏正文不入表。**
 * 话术全文、简历全文这类内容如果原样写进审计，审计表自己就成了隐私黑洞 ——
 * 而审计的保留期通常比业务数据长得多。
 * 所以 `detail` 走 `summarize()` 收口，只留"有哪些字段、各多长、哈希前 8 位"。
 *
 * 形状的权威定义在 `shared/contract/dto/settings.ts`：它同时是 HTTP 响应形状，
 * 所以这里直接取那一份 —— 曾经仓库里有两处同名同字段的接口，靠人眼保持同步。
 */
export type AuditRecord = AuditRecordDto

export interface AuditInput {
  actor: string
  action: string
  target?: Record<string, unknown>
  detail?: unknown
  result: 'ok' | 'denied' | 'error'
  reason?: string | null
  approval?: unknown
  durationMs?: number | null
}

/** 敏感正文的字段名（命中就只记长度，不记内容）。 */
const SENSITIVE_KEYS = ['text', 'content', 'body', 'message', 'resume', 'jd', 'jdText', 'payload', 'prompt']

/** 单个字符串在摘要里保留的最大长度 —— 只用于判断"是不是同一段文本"，不用于还原。 */
const SUMMARY_PREVIEW = 40

/**
 * 把任意载荷压缩成"字段摘要 + 长度"。
 *
 * - 字符串：`{ length, preview }`，敏感字段不保留 preview；
 * - 数组：`{ count, sample }`（sample 最多 3 项）；
 * - 对象：递归一层，深了就只记 `{ keys }`。
 */
export function summarize(value: unknown, depth = 0, keyHint = ''): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const sensitive = SENSITIVE_KEYS.some((key) => keyHint.toLowerCase().includes(key.toLowerCase()))
    return sensitive
      ? { length: value.length, redacted: true }
      : { length: value.length, preview: value.slice(0, SUMMARY_PREVIEW) }
  }
  if (Array.isArray(value)) {
    return { count: value.length, sample: value.slice(0, 3).map((item) => summarize(item, depth + 1, keyHint)) }
  }
  if (typeof value === 'object') {
    if (depth >= 2) return { keys: Object.keys(value as Record<string, unknown>).slice(0, 20) }
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = summarize(item, depth + 1, key)
    }
    return out
  }
  return String(value)
}

export interface AuditRepo {
  write(input: AuditInput, now: string): number
  list(limit: number, filter?: { actor?: string; action?: string }): AuditRecord[]
  /**
   * 统计某个动作在某时刻之后成功了多少次 —— 额度的计数来源。
   * 用审计表而不是另建计数器：审计表本来就是"今天做过什么"的事实来源，
   * 另建计数器只会多一处可能与事实不一致的状态。
   */
  countByAction(action: string, sinceIso: string, onlyOk?: boolean, platformId?: string): number
  count(): number
}

function toRecord(row: Row): AuditRecord {
  return {
    id: asInt(row['id']),
    at: asText(row['at']),
    actor: asText(row['actor']),
    action: asText(row['action']),
    target: asJson<Record<string, unknown>>(row['target_json'], {}),
    detail: asJson<Record<string, unknown>>(row['detail_json'], {}),
    result: asText(row['result']),
    reason: asTextOrNull(row['reason']),
    approval: asJson<unknown>(row['approval_json'], null),
    durationMs: asIntOrNull(row['duration_ms']),
  }
}

export function createAuditRepo(db: DatabaseSync): AuditRepo {
  const insert = db.prepare(
    `INSERT INTO audit_log (at, actor, action, target_json, detail_json, result, reason, approval_json, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectAll = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?')
  const selectActor = db.prepare('SELECT * FROM audit_log WHERE actor = ? ORDER BY id DESC LIMIT ?')
  const selectAction = db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT ?')
  const countStmt = db.prepare('SELECT count(*) AS n FROM audit_log')

  return {
    write(input, now): number {
      const result = insert.run(
        now,
        input.actor,
        input.action,
        JSON.stringify(input.target ?? {}),
        // 只存摘要，不存正文
        JSON.stringify(summarize(input.detail ?? {})),
        input.result,
        input.reason ?? null,
        input.approval === undefined ? null : JSON.stringify(input.approval),
        input.durationMs ?? null,
        now,
      )
      return asId(result.lastInsertRowid)
    },

    list(limit, filter): AuditRecord[] {
      const rows =
        filter?.actor !== undefined
          ? (selectActor.all(filter.actor, limit) as Row[])
          : filter?.action !== undefined
            ? (selectAction.all(filter.action, limit) as Row[])
            : (selectAll.all(limit) as Row[])
      return rows.map(toRecord)
    },

    countByAction(action, sinceIso, onlyOk = true, platformId): number {
      // 目标在 JSON 里，用 SQL 过滤要么上 JSON1 要么写 LIKE，都不如取一批在 JS 里判清楚。
      // 每日额度场景的量级很小（几十条），500 条的上界足够。
      const rows = selectAction.all(action, 500) as Row[]
      let count = 0
      for (const row of rows) {
        if (asText(row['at']) < sinceIso) break // 按 id 倒序 ≈ 时间倒序
        if (onlyOk && asText(row['result']) !== 'ok') continue
        if (platformId !== undefined) {
          const target = asJson<Record<string, unknown>>(row['target_json'], {})
          if (target['platformId'] !== platformId) continue
        }
        count += 1
      }
      return count
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
