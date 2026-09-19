/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const CAMPUS = `
/* ── P8：校招硬截止（不可逆节点必须显眼）──────────────────────────── */
.jh-deadlines{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
.jh-deadline{padding:5px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-base)}
/* 24 小时内：橙；已过期：红。两个色阶刻意区分 —— 「快了」与「没了」是两件事。
   注意：主题里**没有** state-error-tertiary（实测对着 357 个变量 diff 出来的），
   原先写它等于背景静默失效 → 这里用 color-mix 自己调一个 8% 的红底。 */
.jh-deadline-urgent{border-color:var(--dsw-alias-state-warn-primary);
  background:var(--dsw-alias-state-warn-tertiary)}
.jh-deadline-overdue{border-color:var(--dsw-alias-state-error-primary);
  background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
.jh-campus-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-campus-item{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1)}
`
