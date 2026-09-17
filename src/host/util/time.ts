/** 时间工具。全部时间在库里都是 ISO-8601 字符串（UTC）。 */

/** 当前时刻的 ISO 字符串。 */
export function isoNow(): string {
  return new Date().toISOString()
}

/** 可注入的时钟，便于测试断言。 */
export type Clock = () => string

/** 默认时钟。 */
export const systemClock: Clock = isoNow
