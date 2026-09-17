/** 时间工具。全部时间在库里都是 ISO-8601 字符串（UTC）。 */
/** 当前时刻的 ISO 字符串。 */
export declare function isoNow(): string;
/** 可注入的时钟，便于测试断言。 */
export type Clock = () => string;
/** 默认时钟。 */
export declare const systemClock: Clock;
//# sourceMappingURL=time.d.ts.map