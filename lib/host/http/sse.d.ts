/**
 * 实时事件总线 + SSE 线格式（§4.7 `/events`、§5.5、ADR-24）。
 *
 * **ADR-24 的约束决定了这里的形状**：事件只作「去重新拉取」的提示，
 * 前端**不得**靠事件流构建状态。所以：
 *   * 宿主只持有**有界**缓冲；
 *   * 客户端带上 `Last-Event-ID`，命中缓冲就补发；
 *   * **命中不了就发 `resync`**，让前端整体重拉。
 * 这样丢事件最坏只是延迟，不会状态错乱。
 */
import { type Clock } from '../util/time.js';
export interface BusEvent {
    /** 单调递增；作为 SSE 的 `id:` 字段。 */
    id: number;
    type: string;
    data: unknown;
    at: string;
}
export interface ReplayResult {
    events: BusEvent[];
    /** true 表示缓冲里已经没有客户端要的那一段，必须整体重拉。 */
    resync: boolean;
}
export interface EventBus {
    publish(type: string, data: unknown): BusEvent;
    subscribe(listener: (event: BusEvent) => void): () => void;
    /** 从 `lastEventId` 之后补发；`null` 表示新连接（无需补发）。 */
    replay(lastEventId: number | null): ReplayResult;
    lastEventId(): number;
    /** 当前缓冲里的事件数（诊断用）。 */
    size(): number;
    subscriberCount(): number;
}
/** 有界缓冲大小。超过就丢最旧的 —— 丢事件的代价只是让前端 resync。 */
export declare const SSE_BUFFER_SIZE = 200;
export declare function createEventBus(options?: {
    bufferSize?: number;
    clock?: Clock;
}): EventBus;
/**
 * 格式化成 SSE 帧。
 * `data` 用 JSON 编码，且**不能含裸换行** —— 否则会被 SSE 解析成多个 data 行。
 */
export declare function formatSseFrame(event: BusEvent): string;
/** 心跳注释帧，防止中间层把空闲连接掐掉。 */
export declare const SSE_HEARTBEAT_FRAME = ": ping\n\n";
/** 心跳间隔（§4.7：15s）。 */
export declare const SSE_HEARTBEAT_MS = 15000;
//# sourceMappingURL=sse.d.ts.map