/**
 * 定时器端口。
 *
 * 生产用 Cordis 的 `timer` 服务（`timer.timeout(cb, delay)`，随 fiber 回收），
 * 它缺失时退到原生 `setTimeout`；测试注入一个可以手动推进的假定时器。
 * 调度逻辑因此完全不依赖真实时间流逝，秒级跑完、也不会 flaky。
 */
export interface TimerLike {
    timeout(callback: () => void, delay: number): () => void;
}
export interface TimerPort {
    /** 单次定时，返回取消函数（**必须可取消**，否则卸载会留下幽灵定时器）。 */
    after(delayMs: number, callback: () => void): () => void;
}
/** 用 Cordis 的 timer 服务。 */
export declare function cordisTimerPort(timer: TimerLike): TimerPort;
/** 原生兜底：没有 timer 服务时也不能让调度不工作。 */
export declare function nativeTimerPort(): TimerPort;
/** 测试用：手动推进的定时器。 */
export interface ManualTimer extends TimerPort {
    /** 触发所有到期的定时器。 */
    advance(ms: number): void;
    /** 当前排队的定时器数量（断言「没有留下幽灵定时器」用）。 */
    pending(): number;
}
export declare function createManualTimer(): ManualTimer;
//# sourceMappingURL=timer-port.d.ts.map