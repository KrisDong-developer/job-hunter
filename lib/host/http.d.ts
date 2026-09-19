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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Disposer, PluginContext } from '../shared/contract/dsh.js';
import type { HostRuntime } from './runtime.js';
import { type EventBus } from './http/sse.js';
/**
 * 宿主 HTTP 服务内部使用的类型化错误。
 *
 * 路由处理器抛出本类型时，`router` 层会统一捕获并映射为对应的 HTTP 响应
 * （状态码 + JSON body），避免每个处理器各自手写 `writeHead`/`end`。
 *
 * - `status`：要返回给客户端的 HTTP 状态码。
 * - `code`：机器可读错误码，作为响应体中的 `code` 字段，与 §9 错误模型对齐。
 */
export declare class HttpError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string);
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
export declare function isSameOrigin(req: IncomingMessage): boolean;
/**
 * 某条路径允许的请求体上限。
 *
 * 默认 64KB；**只有简历附件上传**那一条放宽 —— 一份真实的 PDF 简历（100KB–500KB）
 * 装不进 64KB，而 base64 还要再膨胀 4/3。刻意不做成"全局放宽"：
 * 体积闸门张开的范围越小，出事的面积就越小。
 *
 * 注意这只是**传输层**的兜底：业务上限（5MB、文件头是不是真 PDF）在领域层
 * `resumes.uploadFile` 里判 —— 界面、模型工具与这条 HTTP 路径过的是同一套判断。
 */
export declare function bodyLimitFor(path: string): number;
/** 读取并解析 JSON 请求体；超限 413，坏 JSON 400。 */
export declare function readJsonBody(req: IncomingMessage, limit?: number): Promise<unknown>;
/**
 * 建立一条 SSE 连接。
 *
 * 按 ADR-24：客户端带 `Last-Event-ID` 时能补就补，补不上就发 `resync`
 * 让前端整体重拉 —— 丢事件最坏只是延迟，不会状态错乱。
 * @returns 关闭这条连接的函数（插件卸载时要调用，否则心跳定时器会泄漏）
 */
export declare function serveEventStream(req: IncomingMessage, res: ServerResponse, bus: EventBus): () => void;
/**
 * 注册 `/job-hunter` 前缀路由。
 * @returns 移除该路由（并关闭所有 SSE 连接）的 disposer
 */
export declare function registerHttpRoutes(ctx: PluginContext, runtime: HostRuntime): Disposer;
//# sourceMappingURL=http.d.ts.map