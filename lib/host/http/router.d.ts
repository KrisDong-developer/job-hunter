import type { CrawlStatusDto } from '../../shared/dto.js';
import { type HostRuntime } from '../runtime.js';
export type RouteResult = {
    kind: 'json';
    status: number;
    body: unknown;
}
/** 二进制响应（附件下载、PDF 预览）。`contentType` 必填 —— 浏览器靠它决定"打开还是下载"。 */
 | {
    kind: 'bytes';
    status: number;
    contentType: string;
    bytes: Uint8Array;
    /** 有值就带上 `Content-Disposition`；用 `inline` 让 PDF 能在标签页里直接看。 */
    fileName?: string;
    disposition?: 'inline' | 'attachment';
}
/** 交给传输层去开 SSE 流。 */
 | {
    kind: 'sse';
};
export interface RouteRequest {
    method: string;
    /** **已剥掉路由前缀**的路径，形如 `/jobs/12`。 */
    path: string;
    query: URLSearchParams;
    headers: Record<string, string | string[] | undefined>;
    /** 变更类请求必须过同源校验（C4）。由传输层算好传进来，便于单测。 */
    sameOrigin: boolean;
    readJson(): Promise<unknown>;
}
/**
 * 唯一入口。所有领域错误在这里翻译成 HTTP（§9 映射表）。
 */
export declare function routeRequest(runtime: HostRuntime, req: RouteRequest): Promise<RouteResult>;
export type { CrawlStatusDto };
//# sourceMappingURL=router.d.ts.map