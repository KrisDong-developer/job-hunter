/**
 * 发送时段的解析。**只用于渲染，不用于判定**。
 *
 * 宿主 `parseSendWindow` 才是权威：窗口是否生效、现在是否在窗口内，都由它说了算。
 * 客户端需要自己的解析只有一个原因 —— 要用两个 `<input type="time">` 呈现它，
 * 而 time 输入只认 `HH:MM`。所以这里刻意**不**做"现在能不能发"的判断：
 * 同一套闸门逻辑出现第二份实现，两边迟早会对不上（本项目已经因此吃过亏）。
 */
export function parseWindow(raw: string): { start: string; end: string } | null {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(raw.trim())
  if (match === null) return null
  const startHour = Number(match[1] ?? '')
  const startMin = Number(match[2] ?? '')
  const endHour = Number(match[3] ?? '')
  const endMin = Number(match[4] ?? '')
  if (!Number.isFinite(startHour + startMin + endHour + endMin)) return null
  if (startHour > 23 || endHour > 23 || startMin > 59 || endMin > 59) return null
  const pad = (value: number): string => String(value).padStart(2, '0')
  return { start: `${pad(startHour)}:${pad(startMin)}`, end: `${pad(endHour)}:${pad(endMin)}` }
}
