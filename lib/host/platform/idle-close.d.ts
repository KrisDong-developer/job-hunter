/**
 * 空闲自关（NFR-7 / C12）。
 *
 * 为什么单独一个文件：这段逻辑有**四个容易写错、又必须离线可测**的点，
 * 埋在 `browser.ts` 里就只能靠真起浏览器才能验：
 *   1. 任何"开始干活"都必须取消已排的关闭（否则新一轮刚开跑就被上一轮的定时器关掉）；
 *   2. 到点时要**再问一次**能不能关（登录中 / 采集中不能关）；
 *   3. 被拦住之后要**重新计时**，而不是放弃 —— 否则一次登录引导就永久取消了自关；
 *   4. 时长设成 0 要能撤销已排的那一次，否则"改成不关"之后还会被关一次。
 */
import type { TimerPort } from '../scheduler/timer-port.js';
export interface IdleCloserOptions {
    /** 空闲多久后关闭（毫秒）。`<= 0` = 不自动关闭。 */
    idleMs: number;
    timers: TimerPort;
    /** 真正关掉浏览器的动作。 */
    close: () => void | Promise<void>;
    /**
     * 到点时再确认一次"现在能关吗"。**只有明确返回 `false` 才拦住** ——
     * 不传 / 返回 true / 返回 undefined 都算可以关（默认关门）。
     */
    shouldKeepAlive?: () => boolean;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export interface IdleCloser {
    /** 重新开始计时（每次"用完浏览器"时调用）。 */
    arm(): void;
    /** 取消计时（开始干活，或时长被改成 0）。 */
    cancel(): void;
    /** 运行期改时长。`<= 0` 会同时取消已排的那一次。 */
    setIdleMs(ms: number): void;
    /** 当前是否排着一次关闭（诊断与测试用）。 */
    scheduled(): boolean;
    /** 当前时长（毫秒）。 */
    idleMs(): number;
}
export declare function createIdleCloser(options: IdleCloserOptions): IdleCloser;
//# sourceMappingURL=idle-close.d.ts.map