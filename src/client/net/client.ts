/**
 * 与宿主 HTTP 的唯一出口：URL 拼装、统一错误类型、唯一 fetch。
 * 界面层不该直接用 `request` —— 它是给本目录其它域模块复用的内网工具。
 */
import { ROUTE_PREFIX } from '../../shared/config/plugin.js'

/**
 * 客户端调用宿主 API 失败时的统一错误类型。
 *
 * 宿主接口遵循统一响应协议（`{ ok, code, message, hint? }`），本类把
 * HTTP 状态码、机器可读错误码、以及面向用户的可读提示打包成一个 Error，
 * 界面层拿到后可以直接把 `display` 展示给用户，无需再解析原始响应体。
 *
 * 字段说明：
 * - `status`：HTTP 状态码，用于日志与请求调试定位。
 * - `code`：机器可读错误码（如 `NEEDS_CONFIRM`、`GUARD_DENIED`），供逻辑分支判断。
 * - `hint`：宿主返回的用户可读文案；为空时界面退化为使用 `message`。
 * - `body`：原始响应体。审批类流程需要读其中的额外字段（如 `confirmText`）。
 * - `display`：给用户看的一行字，优先采用宿主给的 `hint`。
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly hint: string | undefined
  /** 原始响应体。审批类流程需要读其中的额外字段（如 `confirmText`）。 */
  readonly body: unknown

  constructor(status: number, code: string, message: string, hint?: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.hint = hint
    this.body = body
  }

  /** 给用户看的一行字：优先用宿主给的 hint。 */
  get display(): string {
    return this.hint === undefined || this.hint === '' ? this.message : this.hint
  }
}

/** 只走 `/job-hunter/*`，权威数据始终在宿主 sqlite（§5.2）。 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined
  const response = await fetch(`${ROUTE_PREFIX}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  let body: unknown = null
  if (text !== '') {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    throw new ApiError(
      response.status,
      typeof record['code'] === 'string' ? record['code'] : `HTTP_${String(response.status)}`,
      typeof record['message'] === 'string' ? record['message'] : `HTTP ${String(response.status)}`,
      typeof record['hint'] === 'string' ? record['hint'] : undefined,
      body,
    )
  }
  return body as T
}

/**
 * 「高危动作需要用户二次确认」的客户端错误。
 *
 * 宿主对危险操作采用**两段式确认**协议：第一次请求不带确认标志时，宿主返回
 * 409 `NEEDS_CONFIRM` 并携带 `confirmText` 文案；界面收到本错误后把
 * `confirmText` 展示给用户，用户点确认后再带 `confirm: true` 重发同一请求。
 *
 * 这是 HTTP 层 `ConfirmRequiredError` 在客户端的对应投影——`request` 捕获到
 * `ApiError`（code 为 `NEEDS_CONFIRM`）后翻译成该语义明确的类型，
 * 界面可用 `instanceof` 精准分支处理确认流程。
 */
export class NeedsConfirmError extends Error {
  readonly code = 'NEEDS_CONFIRM'
  constructor(readonly confirmText: string) {
    super('这个动作需要你先确认')
    this.name = 'NeedsConfirmError'
  }
}

