/**
 * 侧栏入口图标。
 *
 * C7（P0 实测）：`sidebar.panellist` 的按钮归 shell 所有，我们只贡献图标内容，
 * ownerProps 只有 `{ size, active }` —— **没有徽标位**，label 也由 shell 从注册元数据读。
 * 所以这里只画一个 glyph；未读/告警靠 `shell.overlay` 浮层补偿。
 *
 * 尺寸与对齐（2026-09-17 实测，数字全部来自两侧的源码 / 计算样式）：
 *
 * - shell（`dsh-client-ui-sidebar/lib/client.js`）渲染的是
 *   `<button class="panelRow"><span class="panelGlyph">{我们}</span><span class="panelTitle">{label}</span></button>`，
 *   其中 `.panelRow{padding:7px 8px;gap:8px}`、`.panelGlyph` **没有宽度**，
 *   并且传下来的 `size` 是 `wide ? 16 : 18`。
 * - 同排的社区插件（task-board / skill-explorer）**没有用槽位**，是往侧栏 DOM 里手插
 *   一整个 button，自带 `.entry{padding:0 10px;gap:8px}` + `.entryIcon{24×24}` + `svg{18×18}`。
 *
 * 于是标签起点：它们 = 10+24+8 = 42px；我们若照 shell 的 16px 画 = 8+16+8 = 32px，
 * 看起来就是"我们的行整体靠左"。修法见 `styles.ts` 的 `.jh-entry-glyph`：
 * 固定 24px 的盒子 + 18px 的图 + 宽侧栏下补 2px 左边距 → 两边都落在 42px。
 *
 * 为什么画 18px 而不是 shell 给的 16px：同排邻居都是 18px，用 16px 会小一圈；
 * 盒子已经是 24px，画 18px 不会撑破行高（行 min-height 36px、纵向 padding 7px）。
 */
export interface EntryIconProps {
  /** shell 要求的图标边长：宽侧栏 16、折叠态 18（见上）。 */
  size: number
  /** 该面板当前是否被选中，用于描边粗细。 */
  active: boolean
}

/** 与同排社区插件一致的画布边长（px）。 */
const GLYPH_MIN = 18

export function JobHunterEntryIcon({ size, active }: EntryIconProps) {
  const asked = typeof size === 'number' && size > 0 ? size : GLYPH_MIN
  const edge = Math.max(asked, GLYPH_MIN)
  // 宽侧栏才会给 16（< 18）；只有这一种情况需要那 2px 左边距。
  const wide = asked < GLYPH_MIN
  return (
    <span
      className="jh-entry-glyph"
      data-job-hunter="entry"
      {...(wide ? { 'data-wide': '1' } : {})}
    >
      <svg
        className="jh-entry-icon"
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
    </span>
  )
}
