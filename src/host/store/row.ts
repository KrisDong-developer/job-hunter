/**
 * sqlite 行值的安全读取。
 *
 * `node:sqlite` 的返回值类型是 `null | number | bigint | string | Uint8Array`，
 * 直接当 string/number 用会到处是断言。这里集中收敛，顺便把 bigint 归一成 number。
 */

/** 一行结果。 */
export type Row = Record<string, SqlValue>

export type SqlValue = null | number | bigint | string | Uint8Array

export function asText(value: SqlValue | undefined, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return fallback
}

export function asTextOrNull(value: SqlValue | undefined): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return null
}

export function asInt(value: SqlValue | undefined, fallback = 0): number {
  if (typeof value === 'number') return Math.trunc(value)
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function asIntOrNull(value: SqlValue | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Math.trunc(value)
  if (typeof value === 'bigint') return Number(value)
  return null
}

export function asRealOrNull(value: SqlValue | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  return null
}

export function asReal(value: SqlValue | undefined, fallback = 0): number {
  return asRealOrNull(value) ?? fallback
}

export function asBool(value: SqlValue | undefined, fallback = false): boolean {
  if (value === null || value === undefined) return fallback
  return asInt(value, fallback ? 1 : 0) !== 0
}

/** 解析 JSON 列；坏数据一律退化为 fallback，绝不让一条脏 JSON 打断查询。 */
export function asJson<T>(value: SqlValue | undefined, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** 把 number | bigint 的 lastInsertRowid 归一成 number。 */
export function asId(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value
}
