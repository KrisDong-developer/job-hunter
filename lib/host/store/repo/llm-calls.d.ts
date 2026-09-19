import type { DatabaseSync } from 'node:sqlite';
import type { LlmCallDto } from '../../../shared/contract/dto/settings.js';
/**
 * 模型调用留痕（I5 / §11.4 `LLMCall`）。
 *
 * 这张表存在的唯一目的：**用户必须能查到「我的哪些数据被发给了模型」**。
 * 所以 `fields` 记的是**外发字段清单**（字段名 + 摘要），不是原始内容；
 * 原始内容留在业务表里，需要核对时按 `ref` 回查。
 *
 * 形状的权威定义在 `shared/contract/dto/settings.ts`（它同时是 HTTP 响应形状），
 * 这里直接取那一份 —— 曾经仓库里有两处同名同字段的接口。
 */
export type LlmCallRecord = LlmCallDto;
export interface LlmCallInput {
    purpose: string;
    provider?: string | null;
    model?: string | null;
    /** 外发字段清单（字段名即可；I5 要求可查）。 */
    fields?: string[];
    promptTokens?: number;
    completionTokens?: number;
    ref?: Record<string, unknown>;
    ok?: boolean;
    errorCode?: string | null;
    durationMs?: number;
}
export interface LlmCallRepo {
    write(input: LlmCallInput, now: string): number;
    list(limit: number, purpose?: string): LlmCallRecord[];
    /** 按用途统计调用次数与 token，用于「成本与隐私」视图。 */
    stats(): Array<{
        purpose: string;
        calls: number;
        promptTokens: number;
        completionTokens: number;
    }>;
    count(): number;
}
export declare function createLlmCallRepo(db: DatabaseSync): LlmCallRepo;
//# sourceMappingURL=llm-calls.d.ts.map