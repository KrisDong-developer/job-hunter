import { DomainError } from '../util/errors.js';
import { toolExec } from './exec-context.js';
/** 工具单次返回的岗位条数上限：模型上下文不该被一张长列表挤满（§22.5）。 */
export const TOOL_LIST_MAX = 20;
/** 批量类工具（模型发起）的岗位数上限，与 §22.4「≤5」一致。 */
export const TOOL_BATCH_MAX = 5;
export const schema = (properties, required = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
});
export const str = (description) => ({ type: 'string', description });
export const num = (description) => ({ type: 'number', description });
export const int = (description) => ({ type: 'integer', description });
/**
 * 枚举型字符串参数。
 *
 * 值的集合与顺序由调用方给（通常直接是 `shared/enums.ts` 的常量），
 * **不在这里重排、改写或补默认值** —— 它必须与领域层的校验用同一份清单。
 */
export function enumStr(values, description) {
    return { type: 'string', enum: [...values], description };
}
export const ARRAY_OF_OBJECT = { type: 'array', items: { type: 'object' } };
/**
 * 「只产出一段文本」的工具怎么把值交回给模型。
 *
 * 单独拆成常量是因为它原本是两处各写一遍（`outputSchema` 与 `render`）：
 * 一旦两者走散（schema 说有 text、render 却读别的键），模型就会收到空内容，
 * 而类型系统看不见这种错误。
 */
export const renderText = (_args, value) => value.text;
/** `renderText` 配套的输出 schema（31 个工具里有 26 个就是这一种形状）。 */
export const textResult = {
    outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    render: renderText,
};
/** 把 `runtime` 绑进工具定义（领域文件里 `const tool = toolDefiner(runtime)` 即可）。 */
export function toolDefiner(runtime) {
    return (spec) => defineTool(runtime, spec);
}
/** 定义一个工具：把「怎么执行」与「怎么渲染」放在一起，避免两处走散。 */
function defineTool(runtime, spec) {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        ...(spec.timeoutMs === undefined ? {} : { timeoutMs: spec.timeoutMs }),
        output: {
            schema: spec.outputSchema,
            render: (args, value) => [
                { type: 'text', text: spec.render(args, value) },
            ],
        },
        async execute(rawArgs, exec) {
            const args = (rawArgs ?? {});
            // 审批需要 agent/toolName/callId —— 在这里放进异步上下文，
            // 领域的其它层完全不知道"模型"这件事存在。
            return await toolExec.run({
                toolName: spec.name,
                agent: exec.agent,
                callId: exec.callId,
                signal: exec.signal,
            }, async () => await spec.run(args, exec, runtime));
        },
    };
}
/** 数据层没就绪时给出可读错误，而不是让模型收到一个空对象。 */
export function requireData(runtime) {
    const store = runtime.store();
    const jobs = runtime.jobs();
    if (store === undefined || jobs === undefined) {
        const failure = runtime.failure();
        throw new DomainError('DATA_UNAVAILABLE', failure?.message ?? '数据层尚未就绪', {
            hint: failure?.hint ?? '稍等几秒再试；若一直如此，用 /health 看具体原因。',
        });
    }
    return { store, jobs };
}
export function toInt(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, Math.trunc(value)));
}
export function asString(value) {
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
/**
 * 正整数字段（各种 `xxxId`）：收敛到 `[1, MAX_SAFE_INTEGER]`，0 视为"没给/给错"。
 *
 * 原本这一段是 13 处两行重复（`toInt(..., 0, 1, MAX_SAFE_INTEGER)` + `if (x === 0) throw`），
 * 报错文案必须**逐字**保持 —— 模型会把它转述给用户。
 */
export function positiveId(value, field) {
    const id = toInt(value, 0, 1, Number.MAX_SAFE_INTEGER);
    if (id === 0)
        throw new DomainError('INVALID_INPUT', `${field} 必须是正整数`);
    return id;
}
//# sourceMappingURL=kit.js.map