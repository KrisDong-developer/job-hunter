/** 百分比（0-1 → "62%"）。 */
export function formatRate(rate: number): string {
  return `${String(Math.round(rate * 100))}%`
}




