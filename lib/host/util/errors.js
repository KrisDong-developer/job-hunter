/**
 * 类型化领域错误（§9 错误模型）。
 *
 * 领域层抛这个类型，入口层（http / tools）负责把它翻译成状态码与可读提示。
 */
/** 每种错误对应的 HTTP 状态（§9 映射表）。 */
const HTTP_STATUS = {
    NOT_LOGGED_IN: 403,
    BLOCKED: 409,
    ADAPTER_BROKEN: 409,
    ADAPTER_DEGRADED: 409,
    QUOTA_EXCEEDED: 429,
    GUARD_DENIED: 403,
    CONFLICT: 409,
    NOT_FOUND: 404,
    INVALID_INPUT: 400,
    DATA_UNAVAILABLE: 503,
    LLM_DISABLED: 409,
    LLM_FAILED: 502,
    INTERNAL: 500,
};
/** 领域层唯一的错误类型。 */
export class DomainError extends Error {
    code;
    hint;
    detail;
    constructor(code, message, init = {}) {
        super(message, init.cause === undefined ? undefined : { cause: init.cause });
        this.name = 'DomainError';
        this.code = code;
        this.hint = init.hint;
        this.detail = init.detail;
    }
    /** 供 HTTP 层使用的状态码。 */
    get status() {
        return HTTP_STATUS[this.code];
    }
    /** 序列化成 JSON 响应体。 */
    toJson() {
        return {
            ok: false,
            code: this.code,
            message: this.message,
            ...(this.hint === undefined ? {} : { hint: this.hint }),
            ...(this.detail === undefined ? {} : { detail: this.detail }),
        };
    }
}
/** 断言输入非空字符串，否则抛 INVALID_INPUT。 */
export function requireText(value, field) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new DomainError('INVALID_INPUT', `${field} 不能为空`);
    }
    return value;
}
/** 把任意 unknown 收敛成可读消息。 */
export function messageOf(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
//# sourceMappingURL=errors.js.map