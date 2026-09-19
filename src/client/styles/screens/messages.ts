/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const MESSAGES = `
.jh-messages,.jh-interviews{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-message,.jh-interview{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1)}
.jh-message-hr{border-color:var(--dsw-alias-brand-primary)}
.jh-message-me{border-color:var(--dsw-alias-border-l2)}
.jh-message-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
.jh-message-body{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.jh-message-reply{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.jh-interview-conflict{border-color:var(--dsw-alias-state-warn-primary)}
`
