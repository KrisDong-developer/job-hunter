import { DomainError, messageOf } from '../util/errors.js';
import { systemClock } from '../util/time.js';
export function toAccountDto(record) {
    return {
        platformId: record.platformId,
        loggedIn: record.loggedIn,
        hiddenFromCurrentEmployer: record.hiddenFromCurrentEmployer,
        lastCheckAt: record.lastCheckAt,
        hint: record.hint,
        updatedAt: record.updatedAt,
    };
}
export function createSessionService(store, clock = systemClock) {
    /**
     * `account_state.platform_id` 有指向 `platform` 的外键，而**登录引导可能发生在任何一次抓取之前**
     * （全新安装：先登录再抓）。所以写账号态之前先确保平台实体存在 ——
     * 否则这里会抛 FOREIGN KEY constraint failed，表现为「点登录没反应」。
     */
    const ensurePlatform = (platformId) => {
        if (store.platform.get(platformId) === undefined) {
            store.platform.ensure({ id: platformId, displayName: platformId }, clock());
        }
    };
    const read = (platformId) => store.account.get(platformId) ?? {
        platformId,
        loggedIn: false,
        hiddenFromCurrentEmployer: null,
        lastCheckAt: null,
        hint: null,
        updatedAt: null,
    };
    return {
        status: read,
        list() {
            return store.account.list();
        },
        markLoggedIn(platformId) {
            const now = clock();
            ensurePlatform(platformId);
            store.account.upsert({
                platformId,
                loggedIn: true,
                hiddenFromCurrentEmployer: read(platformId).hiddenFromCurrentEmployer,
                hint: null,
            }, now);
            // 登录好了，对应的告警待办就该消失
            store.todo.closeByRef('login-required', platformId, now);
        },
        markLoginRequired(platformId, hint) {
            const now = clock();
            ensurePlatform(platformId);
            store.account.upsert({
                platformId,
                loggedIn: false,
                hiddenFromCurrentEmployer: read(platformId).hiddenFromCurrentEmployer,
                hint,
            }, now);
            store.todo.createOnce({
                kind: 'login-required',
                level: 'urgent',
                title: `${platformId} 需要登录`,
                ref: platformId,
                detail: { hint },
            }, now);
        },
        recordHidden(platformId, hidden) {
            const before = read(platformId);
            ensurePlatform(platformId);
            store.account.upsert({ platformId, loggedIn: before.loggedIn, hiddenFromCurrentEmployer: hidden, hint: before.hint }, clock());
        },
    };
}
const IDLE = { state: 'idle', message: null, startedAt: null, cancelled: false, page: null };
function toStatus(platformId, flow, session) {
    return {
        platformId,
        state: flow.state,
        message: flow.message,
        startedAt: flow.startedAt,
        account: toAccountDto(session.status(platformId)),
    };
}
export function createLoginFlow(deps) {
    const clock = deps.clock ?? systemClock;
    const pollIntervalMs = deps.pollIntervalMs ?? 3000;
    const timeoutMs = deps.timeoutMs ?? 5 * 60 * 1000;
    const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const flows = new Map();
    const flowOf = (platformId) => flows.get(platformId) ?? IDLE;
    const setFlow = (platformId, flow) => {
        flows.set(platformId, flow);
    };
    const requireAuth = (platformId) => {
        const adapter = deps.registry.get(platformId);
        if (adapter === undefined)
            throw new DomainError('NOT_FOUND', `未注册的平台：${platformId}`);
        if (adapter.auth === undefined) {
            throw new DomainError('INVALID_INPUT', `${platformId} 没有声明登录入口`, {
                hint: '该适配器不需要登录，或还没实现 auth 契约。',
            });
        }
        return adapter.auth;
    };
    const finish = async (platformId, flow) => {
        setFlow(platformId, flow);
        const page = flow.page;
        if (page !== null) {
            setFlow(platformId, { ...flow, page: null });
            await deps.pageSource.release(page).catch(() => undefined);
        }
    };
    const pollOnce = async (platformId) => {
        const auth = requireAuth(platformId);
        const flow = flowOf(platformId);
        if (flow.state !== 'running')
            return toStatus(platformId, flow, deps.session);
        let page = flow.page;
        try {
            if (page === null) {
                page = await deps.pageSource.acquire();
                setFlow(platformId, { ...flow, page });
            }
            if (await auth.isLoggedIn(page)) {
                deps.session.markLoggedIn(platformId);
                deps.events.publish('login.succeeded', { platformId });
                await finish(platformId, {
                    state: 'succeeded',
                    message: '登录成功',
                    startedAt: flow.startedAt,
                    cancelled: false,
                    page,
                });
            }
            else {
                deps.session.markLoginRequired(platformId, '尚未登录，请在弹出的浏览器窗口里完成登录');
            }
            return toStatus(platformId, flowOf(platformId), deps.session);
        }
        catch (error) {
            const message = messageOf(error);
            deps.logger?.warn(`[session] ${platformId} 登录态检测失败：${message}`);
            await finish(platformId, {
                state: 'failed',
                message,
                startedAt: flow.startedAt,
                cancelled: false,
                page,
            });
            deps.events.publish('login.failed', { platformId, message });
            return toStatus(platformId, flowOf(platformId), deps.session);
        }
    };
    /** 后台循环：不阻塞路由。 */
    const runLoop = async (platformId, deadlineMs) => {
        while (flowOf(platformId).state === 'running' && !flowOf(platformId).cancelled) {
            if (new Date(clock()).getTime() > deadlineMs) {
                const deadline = flowOf(platformId);
                deps.events.publish('login.failed', { platformId, message: '登录超时' });
                await finish(platformId, {
                    state: 'failed',
                    message: '登录超时，请重试',
                    startedAt: deadline.startedAt,
                    cancelled: false,
                    page: deadline.page,
                });
                return;
            }
            await sleep(pollIntervalMs);
            if (flowOf(platformId).cancelled)
                return;
            const result = await pollOnce(platformId);
            if (result.state !== 'running')
                return;
        }
    };
    return {
        start(platformId) {
            const auth = requireAuth(platformId);
            const existing = flowOf(platformId);
            if (existing.state === 'running')
                return toStatus(platformId, existing, deps.session);
            const startedAt = clock();
            const running = {
                state: 'running',
                message: '已打开登录页，请在弹出的浏览器窗口里完成登录',
                startedAt,
                cancelled: false,
                page: null,
            };
            setFlow(platformId, running);
            // 打开登录页是异步的，但路由不能等它 —— 先返回，进度用 status() 轮询
            void (async () => {
                try {
                    const page = await deps.pageSource.acquire();
                    setFlow(platformId, { ...flowOf(platformId), page });
                    await page.goto(auth.loginUrl);
                    deps.logger?.info(`[session] 已打开 ${platformId} 登录页：${auth.loginUrl}`);
                }
                catch (error) {
                    const message = messageOf(error);
                    await finish(platformId, {
                        state: 'failed',
                        message: `打不开登录页：${message}`,
                        startedAt,
                        cancelled: false,
                        page: flowOf(platformId).page,
                    });
                }
            })();
            void runLoop(platformId, new Date(startedAt).getTime() + timeoutMs);
            return toStatus(platformId, running, deps.session);
        },
        status(platformId) {
            return toStatus(platformId, flowOf(platformId), deps.session);
        },
        pollOnce,
        cancelAll() {
            for (const [platformId, flow] of flows) {
                if (flow.state === 'running') {
                    // 卸载时把登录页也放掉，不留孤儿页面
                    void deps.pageSource.release(flow.page ?? {}).catch(() => undefined);
                }
                flows.set(platformId, { ...flow, cancelled: true, state: flow.state === 'running' ? 'idle' : flow.state, page: null });
            }
        },
        isRunning() {
            for (const flow of flows.values()) {
                if (flow.state === 'running')
                    return true;
            }
            return false;
        },
    };
}
//# sourceMappingURL=session.js.map