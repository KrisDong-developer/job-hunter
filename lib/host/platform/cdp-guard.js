/**
 * 在给定 CDP session 上启用端口守卫。
 *
 * 拦截规则：页面发起的、指向 `127.0.0.1:<port>` / `localhost:<port>` 的请求，
 * 一律 `Fetch.failRequest` 成 `ConnectionRefused`。
 *
 * @returns 清理函数：停止拦截（页面关闭时调用，避免 session 泄漏）。
 */
export async function installPortGuard(session, options) {
    const { port, logger } = options;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    await session.send('Fetch.enable', {
        patterns: hosts.map((host) => ({
            urlPattern: `http://${host}/*`,
            requestStage: 'Request',
        })),
    });
    const onPaused = (raw) => {
        const params = raw;
        if (typeof params.requestId !== 'string')
            return;
        // 命中即拒 —— 页面脚本以为端口不存在。
        void session
            .send('Fetch.failRequest', {
            requestId: params.requestId,
            errorReason: 'ConnectionRefused',
        })
            .catch((error) => {
            logger?.warn(`[cdp-guard] failRequest 失败：${error instanceof Error ? error.message : String(error)}`);
        });
    };
    session.on('Fetch.requestPaused', onPaused);
    logger?.info(`[cdp-guard] 已启用端口守卫：拦截对 ${hosts.join(' / ')} 的页面探测`);
    return () => {
        session.off('Fetch.requestPaused', onPaused);
        void session.send('Fetch.disable').catch(() => undefined);
    };
}
//# sourceMappingURL=cdp-guard.js.map