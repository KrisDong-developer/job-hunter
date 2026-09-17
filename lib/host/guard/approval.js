/** 默认超时 5 分钟（§4.4.2）。 */
export const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;
export function createApprovalPort(options = {}) {
    const timeoutMs = options.timeoutMs ?? APPROVAL_TIMEOUT_MS;
    const now = options.clock ?? (() => Date.now());
    return {
        available() {
            if (options.available !== undefined)
                return options.available();
            return options.ask !== undefined;
        },
        timeoutMs() {
            return timeoutMs;
        },
        async ask(request) {
            const ask = options.ask;
            if (ask === undefined) {
                // 无 GUI / CLI：**fail-closed**
                return {
                    approved: false,
                    via: 'unavailable',
                    reason: '当前环境没有审批界面（headless / CLI），高危动作一律拒绝',
                };
            }
            const controller = new AbortController();
            let timer;
            try {
                const timeout = new Promise((_resolve, reject) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        reject(new Error('approval-timeout'));
                    }, timeoutMs);
                });
                const answer = await Promise.race([ask(request, controller.signal), timeout]);
                return toDecision(answer, timeoutMs);
            }
            catch (error) {
                const timedOut = error instanceof Error && error.message === 'approval-timeout';
                if (timedOut) {
                    return {
                        approved: false,
                        via: 'timeout',
                        reason: `审批在 ${String(Math.round(timeoutMs / 1000))} 秒内没有响应，按拒绝处理`,
                    };
                }
                return {
                    approved: false,
                    via: 'error',
                    reason: `审批通道出错：${error instanceof Error ? error.message : String(error)}`,
                };
            }
            finally {
                if (timer !== undefined)
                    clearTimeout(timer);
            }
        },
    };
}
/** 把询问方的回答翻译成决策。**只有 `true` 是放行。** */
export function toDecision(answer, timeoutMs = APPROVAL_TIMEOUT_MS) {
    if (answer === true)
        return { approved: true, via: 'user', by: 'user' };
    if (answer === false)
        return { approved: false, via: 'user', reason: '用户拒绝了这次动作' };
    switch (answer) {
        case 'timeout':
            return {
                approved: false,
                via: 'timeout',
                reason: `审批在 ${String(Math.round(timeoutMs / 1000))} 秒内没有响应，按拒绝处理`,
            };
        case 'cancelled':
            return { approved: false, via: 'error', reason: '审批在进行中被取消' };
        case 'error':
            return { approved: false, via: 'error', reason: '审批通道出错' };
        default:
            return {
                approved: false,
                via: 'unavailable',
                reason: '当前环境没有审批界面（headless / CLI），高危动作一律拒绝',
            };
    }
}
/** 把审批请求渲染成一段纯文本（也用于测试断言文案是否含必需信息）。 */
export function renderApproval(request) {
    const head = `【需要你确认】${request.title}`;
    const body = request.lines.map((line) => `· ${line}`).join('\n');
    const content = request.content === null ? '' : `\n\n内容全文：\n${request.content}`;
    return `${head}\n${body}${content}`;
}
//# sourceMappingURL=approval.js.map