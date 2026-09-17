import type { DatabaseSync } from 'node:sqlite'
import { asId, asInt, asJson, asText, asTextOrNull, type Row } from '../row.js'

/**
 * 模型调用留痕（I5 / §11.4 `LLMCall`）。
 *
 * 这张表存在的唯一目的：**用户必须能查到「我的哪些数据被发给了模型」**。
 * 所以 `fields` 记的是**外发字段清单**（字段名 + 摘要），不是原始内容；
 * 原始内容留在业务表里，需要核对时按 `ref` 回查。
 */
export interface LlmCallRecord {
  id: number
  at: string
  purpose: string
  provider: string | null
  model: string | null
  fields: string[]
  promptTokens: number
  completionTokens: number
  ref: Record<string, unknown>
  ok: boolean
  errorCode: string | null
  durationMs: number
}

export interface LlmCallInput {
  purpose: string
  provider?: string | null
  model?: string | null
  /** 外发字段清单（字段名即可；I5 要求可查）。 */
  fields?: string[]
  promptTokens?: number
  completionTokens?: number
  ref?: Record<string, unknown>
  ok?: boolean
  errorCode?: string | null
  durationMs?: number
}

export interface LlmCallRepo {
  write(input: LlmCallInput, now: string): number
  list(limit: number, purpose?: string): LlmCallRecord[]
  /** 按用途统计调用次数与 token，用于「成本与隐私」视图。 */
  stats(): Array<{ purpose: string; calls: number; promptTokens: number; completionTokens: number }>
  count(): number
}

function toRecord(row: Row): LlmCallRecord {
  return {
    id: asInt(row['id']),
    at: asText(row['at']),
    purpose: asText(row['purpose']),
    provider: asTextOrNull(row['provider']),
    model: asTextOrNull(row['model']),
    fields: asJson<string[]>(row['fields_json'], []),
    promptTokens: asInt(row['prompt_tokens']),
    completionTokens: asInt(row['completion_tokens']),
    ref: asJson<Record<string, unknown>>(row['ref_json'], {}),
    ok: asInt(row['ok'], 1) !== 0,
    errorCode: asTextOrNull(row['error_code']),
    durationMs: asInt(row['duration_ms']),
  }
}

export function createLlmCallRepo(db: DatabaseSync): LlmCallRepo {
  const insert = db.prepare(
    `INSERT INTO llm_call (at, purpose, provider, model, fields_json, prompt_tokens, completion_tokens, ref_json, ok, error_code, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectAll = db.prepare('SELECT * FROM llm_call ORDER BY id DESC LIMIT ?')
  const selectPurpose = db.prepare('SELECT * FROM llm_call WHERE purpose = ? ORDER BY id DESC LIMIT ?')
  const statsStmt = db.prepare(
    `SELECT purpose, count(*) AS calls, sum(prompt_tokens) AS pt, sum(completion_tokens) AS ct
     FROM llm_call GROUP BY purpose ORDER BY calls DESC`,
  )
  const countStmt = db.prepare('SELECT count(*) AS n FROM llm_call')

  return {
    write(input, now): number {
      const result = insert.run(
        now,
        input.purpose,
        input.provider ?? null,
        input.model ?? null,
        JSON.stringify(input.fields ?? []),
        input.promptTokens ?? 0,
        input.completionTokens ?? 0,
        JSON.stringify(input.ref ?? {}),
        input.ok === false ? 0 : 1,
        input.errorCode ?? null,
        input.durationMs ?? 0,
        now,
      )
      return asId(result.lastInsertRowid)
    },

    list(limit, purpose?): LlmCallRecord[] {
      const rows =
        purpose === undefined
          ? (selectAll.all(limit) as Row[])
          : (selectPurpose.all(purpose, limit) as Row[])
      return rows.map(toRecord)
    },

    stats(): Array<{ purpose: string; calls: number; promptTokens: number; completionTokens: number }> {
      return (statsStmt.all() as Row[]).map((row) => ({
        purpose: asText(row['purpose']),
        calls: asInt(row['calls']),
        promptTokens: asInt(row['pt']),
        completionTokens: asInt(row['ct']),
      }))
    },

    count(): number {
      const row = countStmt.get() as Row | undefined
      return asInt(row?.['n'])
    },
  }
}
