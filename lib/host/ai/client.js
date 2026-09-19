import { isoNow } from '../util/time.js';
import { applyPrivacy, redactPatterns } from './privacy.js';
import { buildPrompt, extractJson } from './prompts.js';
import { AI_CONFIG_KEY, normalizeAiConfig, } from './purposes.js';
export const DEFAULT_AI_TIMEOUT_MS = 30_000;
function purposeAllowed(config, purpose) {
    return config.enabled && config.purposes[purpose] !== false;
}
export function createAiService(deps) {
    const { store } = deps;
    const timeoutMs = deps.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS;
    const readConfig = () => {
        try {
            return normalizeAiConfig(store.setting.get(AI_CONFIG_KEY, 'global'));
        }
        catch {
            return normalizeAiConfig(undefined);
        }
    };
    const config = readConfig;
    const setConfig = (patch) => {
        const current = readConfig();
        const next = {
            enabled: patch.enabled ?? current.enabled,
            purposes: { ...current.purposes, ...(patch.purposes ?? {}) },
        };
        store.setting.set(AI_CONFIG_KEY, 'global', '', next, isoNow());
        return next;
    };
    const available = () => deps.llm() !== undefined;
    const enabled = (purpose) => purposeAllowed(readConfig(), purpose) && available();
    const call = async (request, options) => {
        const notes = [];
        const privacy = applyPrivacy(request.payload ?? {}, { allowFields: request.allowFields });
        // 可信正文：脱敏 + 计入外发字段清单。这两件事必须一起做 ——
        // 只脱敏不记账（或反过来）都会让留痕与实际外发不符。
        const trusted = (request.trusted ?? []).map((block) => {
            const { text, hits } = redactPatterns(block.text);
            if (hits.length > 0)
                notes.push(`已屏蔽「${block.label}」里的 ${[...new Set(hits)].join('、')}`);
            return { label: block.label, text };
        });
        const trustedFields = trusted.map((block) => `trusted:${block.label}`);
        /** 这次"如果真发出去"会外带的全部字段。 */
        const wouldSend = [...privacy.outboundFields, ...trustedFields];
        const degrade = (reason, sent = false) => {
            notes.push(reason);
            if (!sent)
                notes.push('本次没有数据发给模型');
            deps.onDegrade?.({ purpose: request.purpose, reason });
            return {
                value: options.fallback(),
                via: 'fallback',
                notes,
                // 只在**真的发出去过**的时候才声称外发了字段。
                // 没调模型却报一串"外发字段"，会让 I5 的查询结果说假话。
                outboundFields: sent ? wouldSend : [],
            };
        };
        const current = readConfig();
        if (!current.enabled)
            return degrade('模型功能已关闭，使用模板结果');
        if (current.purposes[request.purpose] === false) {
            return degrade(`用途「${request.purpose}」未开启，使用模板结果`);
        }
        const port = deps.llm();
        if (port === undefined)
            return degrade('未配置模型，使用模板结果');
        if (privacy.redactedFields.length > 0) {
            notes.push(`已屏蔽字段：${[...new Set(privacy.redactedFields)].join('、')}`);
        }
        const prompt = buildPrompt({
            instruction: request.instruction,
            fields: privacy.safe,
            trusted,
            untrusted: request.untrusted,
            outputSpec: request.outputSpec,
        });
        const startedAt = Date.now();
        let completion;
        try {
            completion = await withTimeout(port.complete({
                system: prompt.system,
                user: prompt.user,
                maxTokens: request.maxTokens,
                temperature: request.temperature,
            }), timeoutMs);
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            writeCall(store, {
                purpose: request.purpose,
                fields: wouldSend,
                ref: request.ref,
                durationMs: Date.now() - startedAt,
                ok: false,
                error: reason,
            });
            return degrade(`模型调用失败（${reason}），使用模板结果`, true);
        }
        let parsed = options.parse(completion.text);
        let attemptNote;
        if (parsed === undefined) {
            // §4.5：失败重试一次。重试也只要一次 —— 再多就是在跟一个不肯听话的模型耗时间。
            try {
                const retry = await withTimeout(port.complete({
                    system: prompt.system,
                    user: `${prompt.user}\n\n【上一次输出不合规】请严格按要求格式重新输出。`,
                    maxTokens: request.maxTokens,
                    temperature: 0,
                }), timeoutMs);
                completion = retry;
                parsed = options.parse(retry.text);
            }
            catch (error) {
                attemptNote = error instanceof Error ? error.message : String(error);
            }
        }
        if (parsed === undefined) {
            writeCall(store, {
                purpose: request.purpose,
                fields: wouldSend,
                ref: request.ref,
                durationMs: Date.now() - startedAt,
                ok: false,
                error: attemptNote ?? '输出无法解析',
                completion,
            });
            return degrade('模型输出不合规，使用模板结果', true);
        }
        if (options.validate !== undefined) {
            const rejection = options.validate(parsed);
            if (rejection !== undefined) {
                writeCall(store, {
                    purpose: request.purpose,
                    fields: wouldSend,
                    ref: request.ref,
                    durationMs: Date.now() - startedAt,
                    ok: false,
                    error: `结果校验未通过：${rejection}`,
                    completion,
                });
                return degrade(`模型结果未通过校验（${rejection}），使用模板结果`, true);
            }
        }
        const callId = writeCall(store, {
            purpose: request.purpose,
            fields: wouldSend,
            ref: request.ref,
            durationMs: Date.now() - startedAt,
            ok: true,
            completion,
        });
        return { value: parsed, via: 'llm', notes, outboundFields: wouldSend, callId };
    };
    return { config, setConfig, enabled, available, call, extractJson };
}
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`超时（${ms}ms）`)), ms);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (error) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
}
/** 留痕失败不能影响主流程：写日志本身不该让一次对话崩掉。 */
function writeCall(store, record) {
    try {
        return store.llmCall.write({
            purpose: record.purpose,
            fields: record.fields,
            ...(record.ref === undefined ? {} : { ref: record.ref }),
            ...(record.completion?.provider === undefined ? {} : { provider: record.completion.provider }),
            ...(record.completion?.model === undefined ? {} : { model: record.completion.model }),
            ...(record.completion?.promptTokens === undefined
                ? {}
                : { promptTokens: record.completion.promptTokens }),
            ...(record.completion?.completionTokens === undefined
                ? {}
                : { completionTokens: record.completion.completionTokens }),
            durationMs: record.durationMs,
            ok: record.ok,
            errorCode: record.error ?? null,
        }, isoNow());
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=client.js.map