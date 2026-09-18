export function createIdleCloser(options) {
    const { timers, close, shouldKeepAlive, logger } = options;
    let idleMs = options.idleMs > 0 ? options.idleMs : 0;
    let cancelTimer;
    const cancel = () => {
        if (cancelTimer !== undefined) {
            cancelTimer();
            cancelTimer = undefined;
        }
    };
    const arm = () => {
        if (idleMs <= 0)
            return;
        // 关键：重排之前先撤旧的。漏了这句就会出现"两个定时器，早的那个先到点"
        cancel();
        cancelTimer = timers.after(idleMs, () => {
            cancelTimer = undefined;
            if (shouldKeepAlive?.() === false) {
                logger?.info('[browser] 空闲到点，但仍有任务在用，改期再关');
                // 重新计时，而不是放弃
                arm();
                return;
            }
            logger?.info(`[browser] 空闲 ${String(Math.round(idleMs / 60000))} 分钟，关闭采集浏览器`);
            // 关闭失败不重要：下一次采集会重新拉起
            void close();
        });
    };
    return {
        arm,
        cancel,
        setIdleMs(ms) {
            idleMs = ms > 0 ? ms : 0;
            if (idleMs <= 0) {
                cancel();
                return;
            }
            // 已经排过就按新值重排；还没排的话等下一次 arm()
            if (cancelTimer !== undefined)
                arm();
        },
        scheduled: () => cancelTimer !== undefined,
        idleMs: () => idleMs,
    };
}
//# sourceMappingURL=idle-close.js.map