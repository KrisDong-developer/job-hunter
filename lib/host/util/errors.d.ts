/**
 * 类型化领域错误（§9 错误模型）。
 *
 * 领域层抛这个类型，入口层（http / tools）负责把它翻译成状态码与可读提示。
 */
export type DomainErrorCode = 'NOT_LOGGED_IN' | 'BLOCKED' | 'ADAPTER_BROKEN' | 'ADAPTER_DEGRADED' | 'QUOTA_EXCEEDED' | 'GUARD_DENIED' | 'CONFLICT' | 'NOT_FOUND' | 'INVALID_INPUT' | 'DATA_UNAVAILABLE' | 'LLM_DISABLED' | 'LLM_FAILED' | 'INTERNAL';
export interface DomainErrorInit {
    /** 给用户看的一句话，必须**可操作**（例如“BOSS 未登录，请先在平台页登录”）。 */
    hint?: string;
    /** 机器可读的补充信息。 */
    detail?: Record<string, string | number | boolean | null>;
    cause?: unknown;
}
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
export declare class DomainError extends Error {
    readonly code: DomainErrorCode;
    readonly hint: string | undefined;
    readonly detail: Record<string, string | number | boolean | null> | undefined;
    constructor(code: DomainErrorCode, message: string, init?: DomainErrorInit);
    /** 供 HTTP 层使用的状态码。 */
    get status(): number;
    /** 序列化成 JSON 响应体。 */
    toJson(): {
        ok: false;
        code: DomainErrorCode;
        message: string;
        hint?: string;
        detail?: Record<string, string | number | boolean | null>;
    };
}
/** 断言输入非空字符串，否则抛 INVALID_INPUT。 */
export declare function requireText(value: unknown, field: string): string;
/** 把任意 unknown 收敛成可读消息。 */
export declare function messageOf(error: unknown): string;
//# sourceMappingURL=errors.d.ts.map