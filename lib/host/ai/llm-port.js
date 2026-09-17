export class LlmRouteUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LlmRouteUnavailableError';
    }
}
export function resolveRoute(deps) {
    const override = deps.route?.() ?? {};
    let provider = override.provider;
    let model = override.model;
    if (provider === undefined || model === undefined) {
        let selection;
        try {
            selection = deps.defaultModel?.currentSelection();
        }
        catch (error) {
            deps.onWarn?.(`读取默认模型失败：${messageOf(error)}`);
        }
        provider = provider ?? selection?.provider;
        model = model ?? selection?.model;
    }
    if (provider === undefined || provider === '' || model === undefined || model === '') {
        throw new LlmRouteUnavailableError('没有可用的模型路由（provider/model 未配置）');
    }
    return { provider, model };
}
export function createLlmPort(deps) {
    const pluginId = deps.pluginId ?? 'dsh-job-hunter';
    return {
        async complete(request) {
            const route = resolveRoute(deps);
            const options = {
                provider: route.provider,
                model: route.model,
                messages: [
                    {
                        // 本插件自己造的瞬时消息：id 只在本进程内有意义，不入会话历史。
                        id: `${pluginId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                        role: 'user',
                        content: [{ type: 'text', text: request.user }],
                        source: { kind: 'plugin', plugin: pluginId },
                    },
                ],
                ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
                ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
            };
            if (request.system !== undefined && request.system !== '')
                options.system = request.system;
            let text = '';
            let promptTokens;
            let completionTokens;
            let failure;
            for await (const chunk of deps.llm.stream(options)) {
                if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
                    text += chunk.text;
                }
                else if (chunk.type === 'usage' && chunk.usage !== undefined) {
                    promptTokens = chunk.usage.inputTokens ?? promptTokens;
                    completionTokens = chunk.usage.outputTokens ?? completionTokens;
                }
                else if (chunk.type === 'finish') {
                    const kind = chunk.reason?.kind;
                    if (kind === 'error' || kind === 'aborted') {
                        const detail = chunk.reason?.failure?.message ?? chunk.reason?.failure?.code ?? kind;
                        failure = `模型调用${kind === 'aborted' ? '被中止' : '失败'}：${detail}`;
                    }
                }
            }
            if (failure !== undefined)
                throw new Error(failure);
            if (text.trim() === '')
                throw new Error('模型返回了空内容');
            return {
                text,
                provider: route.provider,
                model: route.model,
                ...(promptTokens === undefined ? {} : { promptTokens }),
                ...(completionTokens === undefined ? {} : { completionTokens }),
            };
        },
    };
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=llm-port.js.map