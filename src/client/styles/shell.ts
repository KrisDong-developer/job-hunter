/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const ENTRY_ICON = `
/* ── 侧栏入口图标 ─────────────────────────────────────────────────────
   shell 的 .panelRow 是 padding:7px 8px、gap:8px，而 .panelGlyph **没有宽度**：
   glyph 占多宽完全由我们决定，标签的起点因此也跟着我们走。
   同排的社区插件（task-board / skill-explorer）**没用槽位**，是手插 DOM 自带样式：
   padding:0 10px + 24px 图标盒 + 18px svg →
     它们的标签起点 = 10 + 24 + 8 = 42px
     我们若按 shell 给的 16px 画 = 8 + 16 + 8 = 32px   ← 实测差 10px，就是"不左对齐"
   这里把盒子固定成 24px、图标按 18px 画，再在宽侧栏补 2px（shell 的 8px → 它们的 10px），
   于是两边都是 42px，图标也落在同一列（13..31px）。
   折叠态（size=18）**不补**那 2px：那行是 36×36 居中，补了会偏心。
   高度取 22px 而不是 24px：shell 的 .panelRow 是 min-height:36px + 上下 padding 7px，
   内容超过 22px 就把行撑到 38px，而邻居是写死的 height:36px（实测 38 vs 36）。
   宽度必须是 24px（对齐标签列），高度退回 22px（对齐行高）—— 图标仍然居中，看不出来。 */
.jh-entry-glyph{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:24px;height:22px}
.jh-entry-glyph[data-wide="1"]{margin-left:2px}
.jh-entry-glyph svg{display:block}
`

export const SHELL = `
/* ── 外壳 ─────────────────────────────────────────────────────────── */
.jh-root{box-sizing:border-box;display:flex;flex-direction:column;height:100%;position:relative;
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.7}
.jh-topbar{display:flex;align-items:center;gap:10px;flex:0 0 auto;
  padding:10px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1)}
.jh-body{flex:1 1 auto;overflow:auto}
.jh-spacer{flex:1 1 auto}
.jh-title{font-size:15px;font-weight:600;margin:0}
.jh-badge{font-size:11px;font-weight:600;letter-spacing:.03em;padding:1px 7px;border-radius:999px;
  color:var(--dsw-alias-brand-text);background:var(--dsw-alias-state-business-tertiary)}

.jh-tabs{display:flex;gap:2px;margin-left:8px}
.jh-tab{border:0;background:transparent;cursor:pointer;font-size:13px;padding:4px 12px;border-radius:8px;
  color:var(--dsw-alias-label-secondary)}
.jh-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.jh-tab-active{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary);font-weight:600}

.jh-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;
  color:var(--dsw-alias-label-secondary)}
.jh-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-tertiary);display:inline-block}
.jh-live-open .jh-dot{background:var(--dsw-alias-state-success-primary)}
.jh-live-closed .jh-dot{background:var(--dsw-alias-state-error-primary)}
`

export const OVERLAY = `
/* ── shell.overlay 浮层（P0-VERIFICATION F1：必须自消失）───────────── */
.jh-notice{position:fixed;right:18px;bottom:18px;pointer-events:auto;z-index:40;
  display:flex;align-items:center;gap:10px;max-width:320px;padding:8px 10px 8px 12px;
  border-radius:10px;font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.18);
  background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-primary)}
.jh-notice-text{flex:1}
.jh-notice-close{border:0;background:transparent;cursor:pointer;font-size:15px;line-height:1;
  padding:2px 4px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
.jh-notice-close:hover{background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-primary)}
`
