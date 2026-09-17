/** 时间工具。全部时间在库里都是 ISO-8601 字符串（UTC）。 */
/**
 * 本机时区名（SR-5：存本地墙钟 + 时区快照）。
 *
 * 放在 `util/time.ts` 而不是某个仓储里：它是时间工具，而**调度器与仓储都要用它**。
 *
 * 拿不到就返回 `'UTC'` 而不是抛错 —— 时区拿不到不该让任何功能挂掉。
 * 但注意：**不能**把它当成"计划没记时区"时的占位显示值（那会显示成一个假的 UTC）——
 * 没有快照时的正确说法是"就是这台电脑现在的时区"，所以调用方要真的调它。
 */
export function detectTimezone() {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return typeof zone === 'string' && zone !== '' ? zone : 'UTC';
    }
    catch {
        return 'UTC';
    }
}
/** 当前时刻的 ISO 字符串。 */
export function isoNow() {
    return new Date().toISOString();
}
/** 默认时钟。 */
export const systemClock = isoNow;
//# sourceMappingURL=time.js.map