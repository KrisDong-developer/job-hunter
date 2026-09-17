export function createMutex() {
    /** 永不 reject 的队尾。 */
    let tail = Promise.resolve();
    let pending = 0;
    let label = null;
    const settle = () => {
        pending -= 1;
        if (pending <= 0) {
            pending = 0;
            label = null;
        }
    };
    const enqueue = (tag, fn) => {
        pending += 1;
        label = tag;
        const started = tail.then(fn, fn);
        // tail 继续挂在「已结算」的 promise 上，所以一个任务失败不会卡死后续任务
        tail = started.then(settle, settle);
        return started;
    };
    return {
        run(fn) {
            return enqueue('queued', fn);
        },
        tryRun(fn) {
            if (pending > 0)
                return Promise.resolve(null);
            return enqueue('try', fn);
        },
        isBusy() {
            return pending > 0;
        },
        holder() {
            return label;
        },
    };
}
//# sourceMappingURL=mutex.js.map