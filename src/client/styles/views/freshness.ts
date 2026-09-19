/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const FRESHNESS = `
/* ── D-19：新鲜度徽章与采集页（U9）────────────────────────────────── */
/* 三级各自一个色阶，且**永远带文字**：只给颜色用户分不清"坏了"还是"旧了"。 */
.jh-fresh{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
  border-radius:999px;white-space:nowrap}
.jh-fresh-fresh{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
.jh-fresh-stale{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
.jh-fresh-cold{background:var(--jh-error-bg);color:var(--jh-error-fg)}
`
