/**
 * 行内「打招呼 / 投递简历」的两枚小图标 —— 与 ✕ 排在同一列、同一个 34px 方块里。
 *
 * 手画 SVG 而不是图标字体：✕ / ★ 这类字形在部分中文字体里会退回豆腐块
 * （`.jh-chip-neg` 那段注释已经吃过一次亏），而 SVG + `stroke="currentColor"`
 * 跟着按钮颜色走、两套主题都在，缩放与强制色彩模式下也不会丢。
 * 14px 是为了与 15px 的 ✕ 字形对齐视觉重量（字形本身的墨迹比它的字号小）。
 */
export function IconChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M2 3.6A1.6 1.6 0 0 1 3.6 2h8.8A1.6 1.6 0 0 1 14 3.6v5.8a1.6 1.6 0 0 1-1.6 1.6H6.8L4 13.6V11A1.6 1.6 0 0 1 2 9.4z" />
    </svg>
  )
}

export function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M14.5 1.5 9.6 14.5 6.7 9.3 1.5 6.4z" />
      <path d="M14.5 1.5 6.7 9.3" />
    </svg>
  )
}
