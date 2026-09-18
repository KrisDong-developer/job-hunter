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
/**
 * 领域层唯一的类型化错误（§9 错误模型）。
 *
 * 领域层（domain / store / platform）抛出的所有失败都以本类型表达，
 * 入口层（HTTP 路由 / 模型工具）负责捕获并把 `code` / `hint` 翻译成
 * 对外状态码与可读提示。
 *
 * - `code`：机器可读错误码（`DomainErrorCode`），驱动状态码映射与逻辑分支。
 * - `hint`：给用户看的一句话，必须**可操作**（例如“BOSS 未登录，请先在平台页登录”）。
 * - `detail`：机器可读的补充信息（键值对）。
 * - `status`：根据 `code` 映射出的 HTTP 状态码（getter）。
 * - `toJson()`：序列化为统一的 `{ ok: false, ... }` 响应体。
 */
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