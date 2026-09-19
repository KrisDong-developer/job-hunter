/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const TODAY = `
/* ── U0 今日 ─────────────────────────────────────────────────────── */
.jh-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px}
.jh-stat{display:flex;flex-direction:column;gap:2px;text-align:left;padding:12px 14px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);cursor:default}
button.jh-stat{cursor:pointer}
button.jh-stat:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-stat b{font-size:22px;font-weight:600;line-height:1.2}
.jh-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-stat-warn b{color:var(--jh-warn-fg)}
.jh-stat-error b{color:var(--dsw-alias-state-error-primary)}

.jh-todos{list-style:none;margin:0;padding:0}
.jh-todo{display:flex;gap:10px;align-items:flex-start;padding:8px 0;
  border-top:1px solid var(--dsw-alias-border-l1)}
.jh-todo:first-child{border-top:0}
.jh-todo-level{flex:0 0 auto;font-size:11px;padding:1px 6px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
/* 同一类对比度问题（语义底 + 白字 = 4.50:1 临界）在这里也存在，一并修：
   换成混色深变体后是 9.79:1 / 6.4:1。属于 rules §4.4 允许的"可访问性修复"，不是重绘。 */
.jh-todo-urgent .jh-todo-level{background:var(--jh-error-fg);color:var(--dsw-alias-label-primary-foreground)}
.jh-todo-warn .jh-todo-level{background:var(--jh-warn-fg);color:var(--dsw-alias-label-primary-foreground)}
.jh-todo-title{font-weight:600}
.jh-todo-body{flex:1 1 auto;min-width:0}
.jh-todo-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
`

export const TODAY_HEALTH = `
.jh-today-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
.jh-health-line{font-size:12.5px}
`
