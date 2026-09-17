/** 用 Cordis 的 timer 服务。 */
export function cordisTimerPort(timer) {
    return {
        after(delayMs, callback) {
            return timer.timeout(callback, Math.max(0, delayMs));
        },
    };
}
/** 原生兜底：没有 timer 服务时也不能让调度不工作。 */
export function nativeTimerPort() {
    return {
        after(delayMs, callback) {
            const handle = setTimeout(callback, Math.max(0, delayMs));
            // 宿主是长驻进程，定时器不该把它钉住不退出
            if (typeof handle === 'object' && handle !== null && 'unref' in handle) {
                ;
                handle.unref();
            }
            return () => {
                clearTimeout(handle);
            };
        },
    };
}
export function createManualTimer() {
    let now = 0;
    let entries = [];
    return {
        after(delayMs, callback) {
            const entry = { at: now + Math.max(0, delayMs), callback, cancelled: false };
            entries.push(entry);
            return () => {
                entry.cancelled = true;
            };
        },
        advance(ms) {
            now += ms;
            const due = entries.filter((entry) => !entry.cancelled && entry.at <= now).sort((a, b) => a.at - b.at);
            entries = entries.filter((entry) => !entry.cancelled && entry.at > now);
            for (const entry of due)
                entry.callback();
        },
        pending() {
            return entries.filter((entry) => !entry.cancelled).length;
        },
    };
}
//# sourceMappingURL=timer-port.js.map