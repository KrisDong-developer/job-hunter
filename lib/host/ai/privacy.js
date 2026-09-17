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
export const HARD_BLOCKED_FIELDS = [
    'phone',
    'mobile',
    'telephone',
    'idcard',
    'idnumber',
    'email',
    'wechat',
    'qq',
    'bankcard',
    'colleague',
    'referee',
    'address',
    'birthday',
    'realname',
    'password',
    'token',
    'credential',
];
/** 值模式黑名单。命中就替换成占位符，**不整字段丢弃**（保留上下文可读性）。 */
export const HARD_BLOCKED_PATTERNS = [
    { name: 'phone', pattern: /1[3-9]\d{9}/g },
    { name: 'idCard', pattern: /\b\d{17}[\dXx]\b/g },
    { name: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g },
    { name: 'bankCard', pattern: /\b\d{16,19}\b/g },
];
export const REDACTION = '[已屏蔽]';
function isBlockedField(name) {
    const lower = name.toLowerCase();
    return HARD_BLOCKED_FIELDS.some((blocked) => lower.includes(blocked));
}
/** 对字符串值做模式脱敏。 */
export function redactPatterns(value) {
    let text = value;
    const hits = [];
    for (const { name, pattern } of HARD_BLOCKED_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
            hits.push(name);
            pattern.lastIndex = 0;
            text = text.replace(pattern, REDACTION);
        }
    }
    return { text, hits };
}
/**
 * 裁剪一份出站载荷。
 *
 * 只处理一层标量字段 —— 嵌套对象里的敏感数据不能靠"递归猜"来保护，
 * 调用方应当**只把需要的标量挑出来**再交进来（§4.3 P7：领域层只传标量）。
 */
export function applyPrivacy(payload, options = {}) {
    const safe = {};
    const redactedFields = [];
    const outboundFields = [];
    const allow = options.allowFields;
    for (const [key, raw] of Object.entries(payload)) {
        if (allow !== undefined && !allow.includes(key)) {
            redactedFields.push(key);
            continue;
        }
        if (isBlockedField(key)) {
            redactedFields.push(key);
            continue;
        }
        if (raw === null || raw === undefined) {
            safe[key] = null;
        }
        else if (typeof raw === 'number' || typeof raw === 'boolean') {
            safe[key] = raw;
        }
        else if (typeof raw === 'string') {
            const { text, hits } = redactPatterns(raw);
            if (hits.length > 0)
                redactedFields.push(...hits.map((hit) => `${key}:${hit}`));
            safe[key] = text;
        }
        else if (Array.isArray(raw)) {
            const items = raw
                .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
                .map((item) => (typeof item === 'string' ? redactPatterns(item).text : item));
            safe[key] = items.join(', ');
        }
        else {
            // 嵌套对象不进外发载荷 —— 不是"剥敏"，是**根本不发**
            redactedFields.push(key);
            continue;
        }
        outboundFields.push(key);
    }
    return { safe, redactedFields, outboundFields };
}
//# sourceMappingURL=privacy.js.map