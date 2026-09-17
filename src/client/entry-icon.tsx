/**
 * 侧栏入口图标。
 *
 * C7（P0 实测）：`sidebar.panellist` 的按钮归 shell 所有，我们只贡献图标内容，
 * ownerProps 只有 `{ size, active }` —— **没有徽标位**，label 也由 shell 从注册元数据读。
 * 所以这里只画一个 glyph；未读/告警靠 `shell.overlay` 浮层补偿。
 */
export interface EntryIconProps {
  /** shell 要求的方形边长（px）。 */
  size: number
  /** 该面板当前是否被选中，用于描边粗细。 */
  active: boolean
}

export function JobHunterEntryIcon({ size, active }: EntryIconProps) {
  const edge = typeof size === 'number' && size > 0 ? size : 18
  return (
    <svg
      className="jh-entry-icon"
      data-job-hunter="entry"
      width={edge}
      height={edge}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={active === true ? 1.6 : 1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M6.5 6.5v7" />
    </svg>
  )
}
