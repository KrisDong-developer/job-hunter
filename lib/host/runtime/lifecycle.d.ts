import type { EventBus } from '../http/sse.js';
import type { LeaseManager, LeaseVerdict } from '../platform/lease.js';
import type { TimerPort } from '../scheduler/timer-port.js';
/** 只用到 info/warn —— 装配点的 logger 形状这里不需要整个。 */
export interface LifecycleLogger {
    info(message: string): void;
    warn(message: string): void;
}
/** 租约心跳间隔。比 `LEASE_STALE_MS` 小得多，留足抖动余量。 */
export declare const HEARTBEAT_MS = 30000;
/**
 * 本实例为什么是只读的；`null` = 不是只读。
 *
 * 两个读者共用这一份说法：`/scheduler/status` 的 `readOnlyReason`，
 * 以及两条 `CONFLICT` 错误（抓取 / 登录引导）的兜底文案。
 */
export declare function readOnlyReasonOf(deps: {
    /** 数据层是否已就绪（未就绪时连库都没有，谈不上租约）。 */
    storeReady: boolean;
    /** 数据层失败原因（`HostRuntime.failure()?.message`）。 */
    failureMessage: string | undefined;
    lease: LeaseManager;
}): string | null;
/**
 * R20：不持租约就不许驱动浏览器（抓取与登录引导共用这一个入口）。
 *
 * 两个实例共用一个 browser-profile 目录会互相踩，所以这条不是"礼貌提示"，
 * 而是拒绝执行。
 */
export declare function requireLease(lease: LeaseManager, readOnlyReason: () => string | null, hint: string): void;
export interface TakeOverDeps {
    lease: LeaseManager;
    events: EventBus;
    logger?: LifecycleLogger;
    /**
     * 接管成功时记什么日志。
     *
     * 三处的说法必须不同（自动接管 / 重新检测后接管 / 人工接管）——
     * 日志要能回答"这次是谁把它拿过来的"。
     */
    describe: (verdict: LeaseVerdict) => string;
    /**
     * 日志级别。默认 `info`；**人工接管**用 `warn` —— 那是人做的决定，
     * 事后复盘时要能一眼从日志里挑出来。
     */
    level?: 'info' | 'warn';
    /** 拿到租约后要做的事（启动调度）。 */
    onAcquired?: (() => void) | undefined;
}
/**
 * 尝试接管租约。**只有对方心跳已过期时才会成功** —— 这一点由 `lease.ts` 保证，
 * 所以这里不需要（也不应该）再做一次新鲜度判断：那会把判据抄成两份。
 *
 * @returns 是否接管成功
 */
export declare function takeOverLease(deps: TakeOverDeps): boolean;
export interface HeartbeatDeps extends TakeOverDeps {
    timer: TimerPort;
    /** 持有租约时每次心跳要做的事（硬截止待办同步挂在这里）。 */
    onBeat?: () => void;
}
/**
 * 起心跳。用 `after` 自链，两种 TimerPort 都能干净取消（C15）。
 *
 * 没持租约时它不是空转：**等待接管**的探测循环 —— 上一个实例可能被强杀，
 * 那种情况下本实例要能自己接管，而不是必须重启。
 *
 * @returns 取消函数（`close()` 调它）
 */
export declare function startHeartbeat(deps: HeartbeatDeps): () => void;
//# sourceMappingURL=lifecycle.d.ts.map