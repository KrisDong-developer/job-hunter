/**
 * 宿主半的 HTTP 传输层（§4.7 / ADR-6）。
 *
 * 只注册**一条 prefix 路由** `/job-hunter`：
 *   - 少注册点：`webServer.register` 对重复 (kind, path) 会抛错
 *   - 集中安全：同源校验与体积上限只写一处（C4：宿主对我们的路由不提供任何鉴权）
 *   - 不与 `/api` 冲突：`/api` 已被 Connection 占用
 *
 * 这一层只做**传输**：把 Node 的 req/res 翻成 `RouteRequest` / `RouteResult`，
 * 以及把 SSE 流挂上。所有路由与业务判断在 `router.ts`（可离线单测）里。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { MAX_BODY_BYTES, ROUTE_PREFIX } from '../shared/constants.js'
import type { Disposer, PluginContext, WebServerService } from '../shared/dsh.js'
import { serviceOf } from '../shared/dsh.js'
import type { HostRuntime } from './runtime.js'
import { routeRequest, type RouteResult } from './http/router.js'
import { formatSseFrame, SSE_HEARTBEAT_FRAME, SSE_HEARTBEAT_MS, type EventBus } from './http/sse.js'

const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}

const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  // 让可能存在的反向代理不要缓冲，否则事件会被攒住
  'x-accel-buffering': 'no',
}

/** 带 HTTP 状态码的类型化错误。 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
    this.name = 'HttpError'
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

/**
 * 二进制响应（P6：简历附件下载与 PDF 内联预览）。
 *
 * `Content-Disposition` 用 `inline` 还是 `attachment` 是有区别的：
 * PDF/HTML 用 inline，浏览器直接在标签页里打开（"能预览附件"就是靠它）；
 * docx 浏览器渲染不了，用 attachment 交给系统程序。
 *
 * 文件名同时给 `filename`（ASCII 兜底）与 `filename*`（UTF-8）——
 * 简历文件名是中文，只给前者会在某些浏览器上变成乱码。
 */
function writeBytes(
  res: ServerResponse,
  result: Extract<RouteResult, { kind: 'bytes' }>,
): void {
  const headers: Record<string, string> = {
    'content-type': result.contentType,
    'content-length': String(result.bytes.byteLength),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    // 附件可能被内联打开，别让它有能力跑脚本或读同源数据
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
  }
  if (result.fileName !== undefined) {
    const ascii = result.fileName.replace(/[^\x20-\x7e]/g, '_')
    headers['content-disposition'] =
      `${result.disposition ?? 'attachment'}; filename="${ascii}"; ` +
      `filename*=UTF-8''${encodeURIComponent(result.fileName)}`
  }
  res.writeHead(result.status, headers)
  res.end(Buffer.from(result.bytes))
}

/**
 * 同源校验（C4）。市场用的是同一套判断：`Origin` 的 host 必须等于 `Host` 头。
 * 只对**变更类**请求强制；读操作放宽（§4.7、§6.3）。
 *
 * 对文档里那段片段做了一处加固：`Origin` 缺失时不再一律拒绝，而是认
 * `Sec-Fetch-Site: same-origin`。理由是**不能把自己人挡在门外** ——
 * 某些浏览器/客户端在特定同源场景下不带 `Origin`，那会让我们自己的收藏按钮 403。
 * 安全性没有实质下降：跨站请求一定会带 `Origin`（且 `cross-site` 一律拒绝），
 * 而这两者本来就都是**绊线**，真正的边界是回环 socket（见任务面板同款注释）。
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (site === 'cross-site') return false

  const origin = req.headers.origin
  const host = req.headers.host

  if (typeof origin !== 'string' || origin === '') {
    return site === 'same-origin'
  }
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** 读取并解析 JSON 请求体；超限 413，坏 JSON 400。 */
export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE')
    chunks.push(buffer)
  }
  if (size === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'BAD_JSON')
  }
}

/**
 * 建立一条 SSE 连接。
 *
 * 按 ADR-24：客户端带 `Last-Event-ID` 时能补就补，补不上就发 `resync`
 * 让前端整体重拉 —— 丢事件最坏只是延迟，不会状态错乱。
 * @returns 关闭这条连接的函数（插件卸载时要调用，否则心跳定时器会泄漏）
 */
export function serveEventStream(req: IncomingMessage, res: ServerResponse, bus: EventBus): () => void {
  res.writeHead(200, SSE_HEADERS)

  // **立刻写一个注释帧**。Node 在第一次 write 之前不会把响应头刷出去，
  // 如果此刻没有可补发的事件，浏览器要等到第一次心跳（15s）才会触发 onopen ——
  // 实测就是这个：SSE 端点在 3 秒内一个字节都不发，前端一直停在「连接中」。
  res.write(': connected\n\n')
  // 顺带把重连间隔收到 3s，断线恢复更快
  res.write('retry: 3000\n\n')

  const rawLastId = req.headers['last-event-id']
  const parsedLastId =
    typeof rawLastId === 'string' && rawLastId !== '' ? Number.parseInt(rawLastId, 10) : Number.NaN
  const lastEventId = Number.isFinite(parsedLastId) ? parsedLastId : null

  const replay = bus.replay(lastEventId)
  for (const event of replay.events) res.write(formatSseFrame(event))
  if (replay.resync) {
    res.write(
      formatSseFrame({
        id: bus.lastEventId(),
        type: 'resync',
        data: { reason: 'buffered-events-missed' },
        at: new Date().toISOString(),
      }),
    )
  }

  const unsubscribe = bus.subscribe((event) => {
    if (!res.writableEnded) res.write(formatSseFrame(event))
  })
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(SSE_HEARTBEAT_FRAME)
  }, SSE_HEARTBEAT_MS)

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    if (!res.writableEnded) res.end()
  }
  req.once('close', close)
  res.once('close', close)

  return close
}

/**
 * 注册 `/job-hunter` 前缀路由。
 * @returns 移除该路由（并关闭所有 SSE 连接）的 disposer
 */
export function registerHttpRoutes(ctx: PluginContext, runtime: HostRuntime): Disposer {
  const webServer = serviceOf<WebServerService>(ctx, 'webServer')
  if (webServer === undefined) {
    ctx.logger?.warn('[job-hunter] webServer 服务缺失，HTTP 路由未注册')
    return () => {}
  }

  // 记住所有活着的 SSE 连接，卸载时逐个关掉（§4.9：dispose 要关 SSE）
  const openStreams = new Set<() => void>()

  const disposeRoute = webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: (req, res) => {
      const handle = async (): Promise<void> => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname.slice(ROUTE_PREFIX.length) || '/'

        const result = await routeRequest(runtime, {
          method: req.method ?? 'GET',
          path,
          query: url.searchParams,
          headers: req.headers,
          sameOrigin: isSameOrigin(req),
          readJson: async () => await readJsonBody(req),
        })

        if (result.kind === 'sse') {
          const close = serveEventStream(req, res, runtime.events())
          openStreams.add(close)
          res.once('close', () => openStreams.delete(close))
          return
        }

        if (result.kind === 'bytes') {
          writeBytes(res, result)
          return
        }

        writeJson(res, result.status, result.body)
      }

      handle().catch((error: unknown) => {
        if (res.headersSent) {
          res.end()
          return
        }
        if (error instanceof HttpError) {
          writeJson(res, error.status, { ok: false, code: error.code })
          return
        }
        ctx.logger?.error(error)
        writeJson(res, 500, { ok: false, code: 'INTERNAL' })
      })
    },
  })

  return () => {
    for (const close of [...openStreams]) {
      try {
        close()
      } catch {
        /* 单条连接关不掉不影响其余 */
      }
    }
    openStreams.clear()
    disposeRoute()
  }
}
