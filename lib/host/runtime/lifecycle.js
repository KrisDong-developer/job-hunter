/**
 * 装配点的**生命周期**：单实例租约（R20）与心跳。
 *
 * ## 为什么这三样放在一起
 *
 * 它们共享同一个失效边界：**这个实例什么时候算"死了"**。
 * 心跳是"我还活着"的声明，租约是"只有我能抓"的仲裁，"不持租约"是三处入口
 * （抓取 / 登录引导 / 调度状态）必须给同一份说法的拒绝理由。
 *
 * 此前它们散在装配点的前中后三段里，"接管租约"那五步（acquire → 日志 → 广播
 * → 回调 → 返回）被抄了三遍（心跳里一遍、按钮的"重新检测"一遍、"人工接管"一遍）。
 * 三遍的差别只在日志文案 —— 而这类抄写最危险的漏项是**广播**：
 * 少了 `lease.acquired` 事件，界面就不会重渲染，用户看到的还是"另一个实例正在运行"。
 */
import { PLUGIN_ID } from '../../shared/config/plugin.js';
import { DomainError } from '../util/errors.js';
/** 租约心跳间隔。比 `LEASE_STALE_MS` 小得多，留足抖动余量。 */
export const HEARTBEAT_MS = 30_000;
/**
 * 本实例为什么是只读的；`null` = 不是只读。
 *
 * 两个读者共用这一份说法：`/scheduler/status` 的 `readOnlyReason`，
 * 以及两条 `CONFLICT` 错误（抓取 / 登录引导）的兜底文案。
 */
export function readOnlyReasonOf(deps) {
    if (!deps.storeReady)
        return deps.failureMessage ?? '数据层尚未就绪';
    if (!deps.lease.held()) {
        const status = deps.lease.status();
        return `另一个实例正在运行（pid ${String(status.pid ?? '?')}）`;
    }
    return null;
}
/**
 * R20：不持租约就不许驱动浏览器（抓取与登录引导共用这一个入口）。
 *
 * 两个实例共用一个 browser-profile 目录会互相踩，所以这条不是"礼貌提示"，
 * 而是拒绝执行。
 */
export function requireLease(lease, readOnlyReason, hint) {
    if (lease.held())
        return;
    throw new DomainError('CONFLICT', readOnlyReason() ?? '本实例不持有租约', { hint });
}
/**
 * 尝试接管租约。**只有对方心跳已过期时才会成功** —— 这一点由 `lease.ts` 保证，
 * 所以这里不需要（也不应该）再做一次新鲜度判断：那会把判据抄成两份。
 *
 * @returns 是否接管成功
 */
export function takeOverLease(deps) {
    const verdict = deps.lease.acquire();
    if (!verdict.held)
        return false;
    const message = `[${PLUGIN_ID}] ${deps.describe(verdict)}`;
    if (deps.level === 'warn')
        deps.logger?.warn(message);
    else
        deps.logger?.info(message);
    deps.events.publish('lease.acquired', { pid: process.pid });
    deps.onAcquired?.();
    return true;
}
/**
 * 起心跳。用 `after` 自链，两种 TimerPort 都能干净取消（C15）。
 *
 * 没持租约时它不是空转：**等待接管**的探测循环 —— 上一个实例可能被强杀，
 * 那种情况下本实例要能自己接管，而不是必须重启。
 *
 * @returns 取消函数（`close()` 调它）
 */
export function startHeartbeat(deps) {
    let cancel = null;
    const beat = () => {
        if (deps.lease.held()) {
            deps.lease.heartbeat();
            deps.onBeat?.();
        }
        else {
            takeOverLease(deps);
        }
        cancel = deps.timer.after(HEARTBEAT_MS, beat);
    };
    cancel = deps.timer.after(HEARTBEAT_MS, beat);
    return () => {
        if (cancel === null)
            return;
        cancel();
        cancel = null;
    };
}
//# sourceMappingURL=lifecycle.js.map