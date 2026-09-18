/**
 * 把 DSH 的 `llm` 服务适配成 `LlmPort`（§4.5）。
 *
 * 宿主只提供**流式**接口（`llm.stream(GenerateOptions)`），所以这里收流拼文本。
 * 「一次调用」的语义由 `ai/client.ts` 负责，这一层只做协议搬运：
 *   - 选路（provider/model）优先用本插件自己的设置，否则退回宿主的默认模型；
 *   - `finish` 分片里的 `error` / `aborted` 必须**抛出**，
 *     否则上层会把一个失败的调用当成"模型返回了空字符串"而记成成功。
 *
 * 这里的类型是本插件自己声明的最小结构 —— 不 import DSH 内部类型，
 * 免得宿主重命名一个内部 interface 就把插件编译打断（ADR-2 的同一个理由）。
 */
import type { LlmPort } from './client.js';
export interface LlmStreamChunkLike {
    type: string;
    text?: string;
    reason?: {
        kind?: string;
        failure?: {
            message?: string;
            code?: string;
        };
    };
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
}
export interface LlmMessageLike {
    id: string;
    role: 'user';
    content: Array<{
        type: 'text';
        text: string;
    }>;
    source: {
        kind: 'plugin';
        plugin: string;
    };
}
export interface GenerateOptionsLike {
    provider: string;
    model: string;
    system?: string;
    messages: LlmMessageLike[];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
}
/** `ctx.llm` 的结构投影。 */
export interface LlmSourceLike {
    stream(options: GenerateOptionsLike): AsyncIterable<LlmStreamChunkLike>;
}
/** `ctx.agentDefaultModel` 的结构投影。 */
export interface ModelSelectorLike {
    currentSelection(): {
        provider: string;
        model: string;
    };
}
export interface Route {
    provider: string;
    model: string;
}
export interface LlmPortDeps {
    llm: LlmSourceLike;
    /** 宿主默认模型；可能不可用（没挂 settings provider 时也有内建默认值）。 */
    defaultModel?: ModelSelectorLike | undefined;
    /** 本插件自己的选路设置（覆盖宿主默认）。 */
    route?: () => Partial<Route> | undefined;
    pluginId?: string;
    onWarn?: (message: string) => void;
}
/**
 * LLM 模型路由不可用错误。
 *
 * 当插件既没有配置自己的模型选路（`route`），宿主默认模型（`defaultModel`）
 * 又不可用时抛出。调用方（工具层）捕获后应降级处理——跳过依赖 LLM 的环节
 * 或向用户给出可操作的提示，而不是让整个请求直接失败。
 */
export declare class LlmRouteUnavailableError extends Error {
    constructor(message: string);
}
export declare function resolveRoute(deps: LlmPortDeps): Route;
export declare function createLlmPort(deps: LlmPortDeps): LlmPort;
//# sourceMappingURL=llm-port.d.ts.map