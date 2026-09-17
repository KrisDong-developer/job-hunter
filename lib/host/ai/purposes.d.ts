/**
 * 模型用途枚举与开关（§4.5）。
 *
 * 「按用途开关」是隐私设计的一部分：用户可以只开话术、关掉简历定制 ——
 * 而不是只能选择"全开或全关"。
 */
export declare const AI_PURPOSES: readonly ["match_score", "explain", "jd_summary", "greeting_draft", "resume_tailor", "resume_tone_check", "interview_prep", "mock_interview", "company_intel", "stage_extract", "offer_compare", "cover_letter"];
export type AiPurpose = (typeof AI_PURPOSES)[number];
export declare const AI_PURPOSE_LABEL: Record<AiPurpose, string>;
/**
 * 默认开关。
 *
 * 默认**只开低风险、低成本的用途**：话术与摘要。
 * 简历相关的用途默认关 —— 那会把简历内容发给模型，属于用户应当显式同意的范围（I5 知情同意）。
 */
export declare const AI_PURPOSE_DEFAULT_ENABLED: Record<AiPurpose, boolean>;
export interface AiConfig {
    /** 总开关。关掉之后一切走规则降级，功能不崩（J10）。 */
    enabled: boolean;
    purposes: Record<AiPurpose, boolean>;
}
/**
 * 配置补丁：`purposes` 允许只写要改的那几项。
 * 不这么写的话，每加一个用途都会让所有调用点的对象字面量编译失败。
 */
export type AiConfigPatch = Partial<Omit<AiConfig, 'purposes'>> & {
    purposes?: Partial<Record<AiPurpose, boolean>>;
};
export declare const DEFAULT_AI_CONFIG: AiConfig;
export declare const AI_CONFIG_KEY = "ai-config";
/** 读配置；缺项按默认补齐（新增用途不会让老配置失效）。 */
export declare function normalizeAiConfig(stored: Partial<AiConfig> | undefined): AiConfig;
//# sourceMappingURL=purposes.d.ts.map