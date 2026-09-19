/**
 * 路由层的**输入输出契约**（叶子模块，不 import 任何本项目模块）。
 *
 * 单独一个文件是为了让 `router.ts` 与 `routes/*` 之间不出现循环引用：
 * 类型在叶子里，路由模块与聚合入口都只依赖它。
 */

/**
 * 一次路由的结果。
 *
 * 三种形态对应传输层（`http.ts`）的三种处理方式，所以这里必须区分清楚：
 * JSON 直接写回、字节流带 `Content-Type` 与 `Content-Disposition`、SSE 交给传输层挂流。
 */
export type RouteResult =
  | { kind: 'json'; status: number; body: unknown }
  /** 二进制响应（附件下载、PDF 预览）。`contentType` 必填 —— 浏览器靠它决定"打开还是下载"。 */
  | {
      kind: 'bytes'
      status: number
      contentType: string
      bytes: Uint8Array
      /** 有值就带上 `Content-Disposition`；用 `inline` 让 PDF 能在标签页里直接看。 */
      fileName?: string
      disposition?: 'inline' | 'attachment'
    }
  /** 交给传输层去开 SSE 流。 */
  | { kind: 'sse' }

export interface RouteRequest {
  method: string
  /** **已剥掉路由前缀**的路径，形如 `/jobs/12`。 */
  path: string
  query: URLSearchParams
  headers: Record<string, string | string[] | undefined>
  /** 变更类请求必须过同源校验（C4）。由传输层算好传进来，便于单测。 */
  sameOrigin: boolean
  readJson(): Promise<unknown>
}
