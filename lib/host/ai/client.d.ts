/**
 * AI 客户端（§4.5）。
 *
 * 这个模块的职责边界很窄，但每条都是硬要求：
 *   - **用途开关**：关掉的用途绝不调用模型；
 *   - **隐私闸门**：出站前剥黑名单、按白名单裁字段，并记下外发字段清单；
 *   - **留痕**：每次调用写一条 `llm_call`（含用途、外发字段、token、耗时、结果）；
 *   - **降级**：模型不可用/超时/输出不合规，都走调用方给的 `fallback`，
 *     返回 `via: 'fallback'` 让上层能如实标注"这是模板不是模型"，而不是假装成功（J10）。
 */
import type { Store } from '../store/store.js';
import { type TrustedBlock, type UntrustedBlock } from './prompts.js';
import { type AiConfig, type AiConfigPatch, type AiPurpose } from './purposes.js';
/** 模型端口。运行时用 `ctx.llm` 适配，测试用假实现。 */
export interface LlmPort {
    complete(request: {
        system: string;
        user: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<LlmCompletion>;
}
export interface LlmCompletion {
    text: string;
    provider?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
}
export interface AiCallRequest {
    purpose: AiPurpose;
    /** 可信的任务指令。 */
    instruction: string;
    /** 结构化字段，会过隐私闸门。 */
    payload?: Record<string, unknown>;
    /** 字段白名单；给了就只发这些字段。 */
    allowFields?: readonly string[];
    /**
     * 可信但体量大的正文（简历 JSON、长文等）。
     *
     * 为什么要单独一个口子，而不是塞进 `payload` 或 `instruction`：
     *   * `payload` 只处理**标量**（嵌套对象一律不发）—— 简历是深嵌套结构，塞不进去；
     *   * 塞 `instruction` 能跑，但那样 `outboundFields` 会是空的 ——
     *     于是 `llm_call` 会记成"这次没发任何字段"，而实际上整份简历都发出去了。
     *     **让 I5 的查询结果说假话，比没有留痕更糟。**
     *
     * 这里的文本会计入外发字段清单（记成 `trusted:<label>`），并按模式脱敏
     * （手机号/身份证/邮箱/银行卡）。域层还会在传进来之前先摘掉联系方式字段（防御纵深）。
     */
    trusted?: TrustedBlock[];
    /** 外部不可信文本（JD、聊天记录…），会走结构隔离包装。 */
    untrusted?: UntrustedBlock[];
    outputSpec?: string;
    maxTokens?: number;
    temperature?: number;
    /** 关联实体，写进 `llm_call` 便于溯源。 */
    ref?: Record<string, unknown>;
}
export interface AiCallOutcome<T> {
    value: T;
    via: 'llm' | 'fallback';
    /** 降级原因或补充说明，UI 应当如实展示。 */
    notes: string[];
    /** 这次实际发出去的字段清单。 */
    outboundFields: string[];
    /** 本次调用的留痕 id（降级未调用模型时为 undefined）。 */
    callId?: number;
}
export interface AiCallOptions<T> {
    /** 从模型回复解析结果；返回 undefined 表示不合规，触发降级。 */
    parse: (raw: string) => T | undefined;
    /** 规则/模板降级结果。 */
    fallback: () => T;
    /** 额外的结果校验（注入防御第三层）。返回字符串表示拒绝并说明原因。 */
    validate?: (value: T) => string | undefined;
}
export interface AiService {
    config(): AiConfig;
    setConfig(patch: AiConfigPatch): AiConfig;
    /** 用途是否可用：总开关 + 该用途开关 + 模型端口存在。 */
    enabled(purpose: AiPurpose): boolean;
    available(): boolean;
    call<T>(request: AiCallRequest, options: AiCallOptions<T>): Promise<AiCallOutcome<T>>;
    /** 供测试与诊断：暴露解析工具。 */
    extractJson(raw: string): unknown;
}
export interface AiDeps {
    store: Store;
    /** 端口可能迟到（模型未配置）——所以是 getter 而不是实例。 */
    llm: () => LlmPort | undefined;
    /** 记录日志/审计用的回调，避免 ai 层直接依赖 guard。 */
    onDegrade?: (info: {
        purpose: AiPurpose;
        reason: string;
    }) => void;
    timeoutMs?: number;
}
export declare const DEFAULT_AI_TIMEOUT_MS = 30000;
export declare function createAiService(deps: AiDeps): AiService;
//# sourceMappingURL=client.d.ts.map