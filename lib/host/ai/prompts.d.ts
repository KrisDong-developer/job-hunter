/**
 * 提示词构造与外发文本的**结构隔离**（§4.5.2）。
 *
 * 注入防御不靠"过滤可疑字样" —— 那是打不完的地鼠。这里靠三件事：
 *   1. 系统提示里明确宣布：边界内的一切都是**数据**，不是指令；
 *   2. 外部文本一律包进带随机 nonce 的围栏，让它无法伪造围栏闭合；
 *   3. 模型输出**再过一遍结构校验**（见 `client.ts` 的 `parse` 与 `outreach.ts`），
 *      就算被绕过了也只是产出一段被丢弃的文本，改不了数据库。
 */
export declare const SYSTEM_BASE: string;
/** nonce 每次调用都不同：外部文本无法预测并伪造围栏闭合。 */
export declare function makeNonce(): string;
export interface UntrustedBlock {
    label: string;
    text: string;
}
/**
 * 单个不可信块的上限：截断而不是拒绝。
 * 截断处留标记，便于排查"为什么模型没看到后半段"。
 */
export declare const DEFAULT_UNTRUSTED_CHAR_LIMIT = 6000;
export declare function wrapUntrusted(block: UntrustedBlock, nonce: string, charLimit?: number): string;
export interface BuiltPrompt {
    system: string;
    user: string;
}
/** 可信但体量大的正文块（简历 JSON 等）。与 `untrusted` 的区别是**不给它加围栏**。 */
export interface TrustedBlock {
    label: string;
    text: string;
}
export interface BuildPromptInput {
    instruction: string;
    /** 已过隐私闸门的结构化字段。 */
    fields?: Record<string, string | number | boolean | null>;
    /** 可信正文（简历等）。已经是同一条消息的一部分，不加围栏、不宣布为"数据"。 */
    trusted?: TrustedBlock[];
    untrusted?: UntrustedBlock[];
    /** 输出格式要求（如"只输出 JSON"）。 */
    outputSpec?: string;
    charLimit?: number;
}
export declare function buildPrompt(input: BuildPromptInput): BuiltPrompt;
/**
 * 从模型回复里抠出 JSON。
 *
 * 模型很爱加 ```json 围栏或前后缀白字，这里容忍这些噪音；
 * 但**不**做"猜字段"——抠不出来就返回 undefined，交给调用方降级。
 */
export declare function extractJson(raw: string): unknown;
//# sourceMappingURL=prompts.d.ts.map