/**
 * 全局抓取互斥（§4.2.1「并发：全局互斥，串行执行」）。
 *
 * 单进程单连接（C14），所以进程内一把锁就够；它的职责是**不让两个采集互相踩**，
 * 而不是防跨进程竞争。跨进程靠租约锁（R20，P3 补）。
 *
 * 实现要点：`pending` **在调用时就同步自增**。
 * 如果等到微任务里才置忙，同一 tick 内的第二次 `tryRun` 会看到「不忙」并且也开工 ——
 * 这个 bug 在「模型工具与定时任务同时触发」时才会暴露，而且表现为偶发的双份抓取。
 */
export interface Mutex {
    /** 排队执行。 */
    run<T>(fn: () => Promise<T>): Promise<T>;
    /** 忙就立刻放弃并返回 null（定时抓取用「跳过」而不是「排队」）。 */
    tryRun<T>(fn: () => Promise<T>): Promise<T | null>;
    isBusy(): boolean;
    /** 当前持有者标签，仅用于诊断。 */
    holder(): string | null;
}
export declare function createMutex(): Mutex;
//# sourceMappingURL=mutex.d.ts.map