import { DomainError, messageOf } from '../util/errors.js';
import { systemClock } from '../util/time.js';
import { jitterFor, missedRun, nextRunAt } from './schedule.js';
export function createScheduler(deps) {
    const clock = deps.clock ?? systemClock;
    const random = deps.random ?? Math.random;
    let started = false;
    let cancel = null;
    let armedAtMs = null;
    let running = false;
    let warnedReadOnly = false;
    const now = () => new Date(clock());
    const enabledPlans = () => deps.store.plan.list().filter((plan) => plan.enabled && plan.schedule.enabled);
    const planNext = (plan, from) => nextRunAt(plan.schedule, from, jitterFor(plan.schedule, random));
    /** 重新武装定时器：永远只挂一个，指向最近的那个到期时刻。 */
    const arm = () => {
        cancel?.();
        cancel = null;
        armedAtMs = null;
        if (!started || !deps.canSchedule())
            return;
        let soonestMs = null;
        let soonestPlan = null;
        for (const plan of enabledPlans()) {
            if (plan.nextRunAt === null)
                continue;
            const at = new Date(plan.nextRunAt).getTime();
            if (!Number.isFinite(at))
                continue;
            if (soonestMs === null || at < soonestMs) {
                soonestMs = at;
                soonestPlan = plan;
            }
        }
        if (soonestMs === null || soonestPlan === null)
            return;
        const delay = Math.max(0, soonestMs - now().getTime());
        armedAtMs = soonestMs;
        cancel = deps.timer.after(delay, () => {
            void tick();
        });
        deps.events.publish('schedule.armed', { at: new Date(soonestMs).toISOString(), planId: soonestPlan.id });
    };
    /**
     * 启动调度。**可重复调用**：不持租约时它只是记录只读并返回，
     * 等租约到手后再调一次就能真正武装起来。
     *
     * 「可重复」不是洁癖：实测踩到过 —— 上一个实例被强杀后租约文件还在，
     * 新实例启动时对方心跳还没过期，于是它进入只读；如果 start() 只认第一次，
     * 这个实例就**永远不会**接管调度，只能重启。
     */
    const start = () => {
        if (!deps.canSchedule()) {
            if (!warnedReadOnly) {
                deps.logger?.info(`[scheduler] 不启动调度：${deps.readOnlyReason() ?? '数据层未就绪'}（本实例只读）`);
                warnedReadOnly = true;
            }
            return;
        }
        if (started)
            return;
        started = true;
        warnedReadOnly = false;
        // 首次安装至少有一个方案，否则「到点自动跑」无从谈起
        deps.plans.ensureDefault();
        const current = now();
        for (const plan of deps.store.plan.list()) {
            if (!plan.enabled || !plan.schedule.enabled) {
                deps.store.plan.setRunTimes(plan.id, { nextRunAt: null });
                continue;
            }
            deps.store.plan.setRunTimes(plan.id, { nextRunAt: planNext(plan, current).toISOString() });
            const verdict = missedRun(plan.schedule, plan.lastRunAt, current);
            if (!verdict.missed)
                continue;
            const created = deps.store.todo.createOnce({
                kind: 'catch-up',
                level: 'warn',
                title: `${plan.name} 错过了一轮抓取`,
                ref: String(plan.id),
                detail: {
                    planId: plan.id,
                    expectedAt: verdict.expectedAt?.toISOString() ?? null,
                    lastRunAt: plan.lastRunAt,
                    hint: '点「立即补跑」执行，或忽略它等下一轮。',
                },
            }, clock());
            if (created !== null) {
                // 只生成待办，**绝不自动跑**（C9）
                deps.logger?.info(`[scheduler] ${plan.name} 有错过的轮次 → 已生成补跑待办（不自动执行）`);
            }
        }
        arm();
    };
    const tick = async () => {
        if (running)
            return;
        if (!deps.canSchedule())
            return;
        running = true;
        try {
            const current = now();
            const due = enabledPlans().filter((plan) => {
                if (plan.nextRunAt === null)
                    return false;
                const at = new Date(plan.nextRunAt).getTime();
                return Number.isFinite(at) && at <= current.getTime();
            });
            for (const plan of due) {
                deps.events.publish('plan.started', { planId: plan.id, name: plan.name });
                for (const platformId of plan.platforms) {
                    try {
                        const summary = await deps.run({
                            planId: plan.id,
                            platformId,
                            criteria: plan.criteria,
                            reason: 'schedule',
                        });
                        deps.events.publish('plan.finished', {
                            planId: plan.id,
                            platformId,
                            state: summary.run.state,
                            inserted: summary.run.inserted,
                        });
                    }
                    catch (error) {
                        // 单个平台失败不阻断其它平台；失败本身已经在 crawl 里记了健康与待办
                        deps.logger?.warn(`[scheduler] ${plan.name} / ${platformId} 抓取失败：${messageOf(error)}`);
                        deps.events.publish('plan.failed', { planId: plan.id, platformId, message: messageOf(error) });
                    }
                }
                deps.store.plan.setRunTimes(plan.id, { lastRunAt: clock() });
                deps.store.todo.closeByRef('catch-up', String(plan.id), clock());
            }
            // 不论有没有到期，都把 next_run_at 推到未来 —— 否则定时器会立刻再次触发（自旋）
            for (const plan of enabledPlans()) {
                deps.store.plan.setRunTimes(plan.id, { nextRunAt: planNext(plan, now()).toISOString() });
            }
        }
        finally {
            running = false;
            arm();
        }
    };
    return {
        start,
        stop() {
            started = false;
            cancel?.();
            cancel = null;
            armedAtMs = null;
        },
        status() {
            const plans = deps.store.plan.list();
            const lastRunAt = plans
                .map((plan) => plan.lastRunAt)
                .filter((value) => value !== null)
                .sort()
                .at(-1) ?? null;
            return {
                scheduling: started && deps.canSchedule(),
                readOnly: !deps.canSchedule(),
                readOnlyReason: deps.readOnlyReason(),
                armed: cancel !== null,
                nextRunAt: armedAtMs === null ? null : new Date(armedAtMs).toISOString(),
                lastRunAt,
                running,
                plans,
                lease: deps.leaseStatus(),
            };
        },
        async runPlan(planId, reason) {
            if (!deps.canSchedule()) {
                throw new DomainError('CONFLICT', deps.readOnlyReason() ?? '本实例不持有租约，不能执行抓取', {
                    hint: '另一个实例正在运行 —— 请在那边操作，避免两个调度器同时抓取（R20）。',
                });
            }
            const plan = deps.plans.get(planId);
            if (plan.platforms.length === 0) {
                throw new DomainError('INVALID_INPUT', `方案「${plan.name}」没有配置平台`);
            }
            let last = null;
            for (const platformId of plan.platforms) {
                last = await deps.run({ planId, platformId, criteria: plan.criteria, reason });
            }
            deps.store.plan.setRunTimes(planId, { lastRunAt: clock() });
            deps.store.todo.closeByRef('catch-up', String(planId), clock());
            if (last === null) {
                throw new DomainError('INTERNAL', `方案「${plan.name}」没能跑出结果`);
            }
            return last;
        },
        tick,
    };
}
//# sourceMappingURL=index.js.map