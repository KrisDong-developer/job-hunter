/** 时间工具。全部时间在库里都是 ISO-8601 字符串（UTC）。 */
/** 当前时刻的 ISO 字符串。 */
export function isoNow() {
    return new Date().toISOString();
}
/** 默认时钟。 */
export const systemClock = isoNow;
//# sourceMappingURL=time.js.map