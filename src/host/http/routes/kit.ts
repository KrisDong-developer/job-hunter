/**
 * 路由层的共享工具：**跨域**才放这里（json / 参数解析 / 数据层就绪检查 / 读请求体）。
 *
 * 只被某一个域用到的解析器一律留在那个域的文件里（例如 `buildJobQuery` 在 jobs.ts、
 * `settingsPatchOf` 在 ops.ts）—— 否则这个文件会慢慢长成第二个 router.ts。
 */
import { dataNotReady } from '../../runtime/contract.js'
import type { HostRuntime } from '../../runtime.js'
import { DomainError } from '../../util/errors.js'
import type { RouteRequest, RouteResult } from './types.js'

/**
 * 一次请求里被所有 handler 共享的东西。
 *
 * `segments` / `method` 由聚合入口**算一次**再传下来（原来是 `dispatch` 里的局部变量）：
 * 每个路由模块各切一次路径既浪费又容易出现口径不一致。
 */
export interface RouteContext {
  runtime: HostRuntime
  req: RouteRequest
  /** 路径按 `/` 切好并丢掉空段，形如 `['jobs', '12']`。 */
  segments: string[]
  /** 已大写的 HTTP 方法。 */
  method: string
}

/**
 * 一个路由处理函数。
 *
 * 返回 `undefined` = **本模块不接这条请求**，交给路由表里的下一个 handler。
 * 这个约定是原 `dispatch` 里"容器块不匹配就往下穿透"的等价物，**不要**改成抛错或 404 ——
 * 有些路径正是靠穿透才走到的（见 router.ts 里路由表的顺序说明）。
 */
export type RouteHandler = (ctx: RouteContext) => Promise<RouteResult | undefined> | RouteResult | undefined

export function json(status: number, body: unknown): RouteResult {
  return { kind: 'json', status, body }
}

export function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

/**
 * 路径 / 查询串里的记录 id。
 *
 * 不能用裸 `Number.parseInt`：`parseInt('12abc')` 得到 12，且 `Number.isFinite` 为真 ——
 * 于是 `/assessments/12abc/state` 会被当成 id=12 落到**一条真实记录**上。
 * 打错的路径不该命中数据，所以这里只认纯数字。
 */
export function parseRecordId(raw: string | null, what: string): number {
  if (raw === null || !/^\d+$/.test(raw)) {
    throw new DomainError('INVALID_INPUT', `非法${what} id：${raw ?? ''}`)
  }
  const value = Number.parseInt(raw, 10)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DomainError('INVALID_INPUT', `非法${what} id：${raw}`)
  }
  return value
}

/** 数据层未就绪的路由一律走这个，错误信息可读且可被 GUI 直接展示。 */
export function requireData(runtime: HostRuntime): void {
  if (!runtime.isReady()) throw dataNotReady(runtime)
}

/** 读一个 JSON 对象体；不是对象就报 400。 */
export async function readObject(req: RouteRequest): Promise<Record<string, unknown>> {
  const raw = await req.readJson()
  if (raw === null || raw === undefined) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DomainError('INVALID_INPUT', '请求体必须是一个 JSON 对象')
  }
  return raw as Record<string, unknown>
}
