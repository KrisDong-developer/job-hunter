/**
 * 工具层的共享工具箱。
 *
 * 这里只放**与领域无关**的东西：schema 片段、工具定义装配、参数收敛、数据层就绪检查。
 * 领域相关的（岗位谓词、岗位行格式化、简历逐条拼装…）一律留在各自的领域文件里 ——
 * 否则这个文件会慢慢长成第二个 `index.ts`。
 */
import type { JsonSchemaNode, ToolDefinition, ToolRunContext } from '../../shared/dsh.js';
import type { HostRuntime } from '../runtime.js';
/** 工具单次返回的岗位条数上限：模型上下文不该被一张长列表挤满（§22.5）。 */
export declare const TOOL_LIST_MAX = 20;
/** 批量类工具（模型发起）的岗位数上限，与 §22.4「≤5」一致。 */
export declare const TOOL_BATCH_MAX = 5;
export declare const schema: (properties: Record<string, JsonSchemaNode>, required?: string[]) => Record<string, unknown>;
export declare const str: (description: string) => JsonSchemaNode;
export declare const num: (description: string) => JsonSchemaNode;
export declare const int: (description: string) => JsonSchemaNode;
/**
 * 枚举型字符串参数。
 *
 * 值的集合与顺序由调用方给（通常直接是 `shared/enums.ts` 的常量），
 * **不在这里重排、改写或补默认值** —— 它必须与领域层的校验用同一份清单。
 */
export declare function enumStr(values: readonly string[], description: string): JsonSchemaNode;
export declare const ARRAY_OF_OBJECT: JsonSchemaNode;
/**
 * 「只产出一段文本」的工具怎么把值交回给模型。
 *
 * 单独拆成常量是因为它原本是两处各写一遍（`outputSchema` 与 `render`）：
 * 一旦两者走散（schema 说有 text、render 却读别的键），模型就会收到空内容，
 * 而类型系统看不见这种错误。
 */
export declare const renderText: (_args: unknown, value: {
    text: string;
}) => string;
/** `renderText` 配套的输出 schema（31 个工具里有 26 个就是这一种形状）。 */
export declare const textResult: {
    outputSchema: JsonSchemaNode;
    render: (_args: unknown, value: {
        text: string;
    }) => string;
};
export interface ToolSpec<A, V> {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    outputSchema: JsonSchemaNode;
    /** 返回**模型看到的文本**（一行行，人可读，客户端 toolview 也解析它）。 */
    render(args: A, value: V): string;
    timeoutMs?: number;
    run(args: A, ctx: ToolRunContext, runtime: HostRuntime): Promise<V>;
}
/** 把 `runtime` 绑进工具定义（领域文件里 `const tool = toolDefiner(runtime)` 即可）。 */
export declare function toolDefiner(runtime: HostRuntime): <A, V>(spec: ToolSpec<A, V>) => ToolDefinition;
/** 数据层没就绪时给出可读错误，而不是让模型收到一个空对象。 */
export declare function requireData(runtime: HostRuntime): {
    store: import("../settings.js").Store;
    jobs: import("../domain/jobs.js").JobService;
};
export declare function toInt(value: unknown, fallback: number, min: number, max: number): number;
export declare function asString(value: unknown): string | undefined;
/**
 * 正整数字段（各种 `xxxId`）：收敛到 `[1, MAX_SAFE_INTEGER]`，0 视为"没给/给错"。
 *
 * 原本这一段是 13 处两行重复（`toInt(..., 0, 1, MAX_SAFE_INTEGER)` + `if (x === 0) throw`），
 * 报错文案必须**逐字**保持 —— 模型会把它转述给用户。
 */
export declare function positiveId(value: unknown, field: string): number;
//# sourceMappingURL=kit.d.ts.map