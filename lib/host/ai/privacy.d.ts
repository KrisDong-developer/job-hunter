/**
 * 隐私闸门（I5 / §4.5）。
 *
 * 两条规则，先剥后裁：
 *   1. **硬黑名单**：手机号、身份证、邮箱、银行卡这类字段与模式**直接剥离**，
 *      不因为"这次用途需要"就放行 —— 它们是"绝不出本机"的那一类；
 *   2. **白名单裁剪**：给了白名单就只放白名单里的字段。
 *
 * 返回值里带 `outboundFields` —— 这张清单会原样写进 `llm_call`，
 * 让用户能回答"我的哪些数据被发给了模型"（这是 I5 的核心诉求，不是附属功能）。
 */
/** 字段名黑名单（大小写不敏感、子串匹配）。 */
export declare const HARD_BLOCKED_FIELDS: string[];
/** 值模式黑名单。命中就替换成占位符，**不整字段丢弃**（保留上下文可读性）。 */
export declare const HARD_BLOCKED_PATTERNS: Array<{
    name: string;
    pattern: RegExp;
}>;
export declare const REDACTION = "[\u5DF2\u5C4F\u853D]";
export interface PrivacyOptions {
    /** 只允许这些字段出站（不给则只做黑名单剥离）。 */
    allowFields?: readonly string[];
}
export interface PrivacyResult {
    safe: Record<string, string | number | boolean | null>;
    /** 被剥离/脱敏的字段名，用于提示用户"这次少了什么"。 */
    redactedFields: string[];
    /** **外发字段清单** —— 写进 `llm_call`，用户可查。 */
    outboundFields: string[];
}
/** 对字符串值做模式脱敏。 */
export declare function redactPatterns(value: string): {
    text: string;
    hits: string[];
};
/**
 * 裁剪一份出站载荷。
 *
 * 只处理一层标量字段 —— 嵌套对象里的敏感数据不能靠"递归猜"来保护，
 * 调用方应当**只把需要的标量挑出来**再交进来（§4.3 P7：领域层只传标量）。
 */
export declare function applyPrivacy(payload: Record<string, unknown>, options?: PrivacyOptions): PrivacyResult;
//# sourceMappingURL=privacy.d.ts.map