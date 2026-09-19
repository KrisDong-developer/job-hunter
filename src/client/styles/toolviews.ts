/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const TOOLVIEW_CARD = `
/* ── tool.call.toolview 卡片（§22.3）────────────────────────────────
   对话里的卡片要"看起来像话，不像日志"：只用主题变量、不硬编码颜色，
   并且比面板里的卡片更紧凑（它在对话流中间，不该抢占竖向空间）。 */
.jh-tv{display:flex;flex-direction:column;gap:6px;margin:2px 0;font-size:13px;line-height:1.6;
  color:var(--dsw-alias-label-primary)}
.jh-tv-head{display:flex;align-items:baseline;gap:8px;min-width:0}
.jh-tv-title{font-weight:600;flex:0 0 auto}
.jh-tv-sub{color:var(--dsw-alias-label-secondary);flex:1 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jh-tv-actions{display:flex;gap:6px;flex:0 0 auto}
.jh-tv-link{border:0;background:transparent;cursor:pointer;padding:0 2px;font-size:12px;
  color:var(--dsw-alias-label-secondary);text-decoration:underline}
.jh-tv-link:hover{color:var(--dsw-alias-label-primary)}
.jh-tv[data-tone=error] .jh-tv-title{color:var(--dsw-alias-state-error-primary)}

.jh-tv-body{display:flex;flex-direction:column;gap:6px}
.jh-tv-rows{display:flex;flex-direction:column;gap:2px}
.jh-tv-row{display:grid;grid-template-columns:72px 1fr;gap:10px;align-items:baseline}
.jh-tv-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.jh-tv-value{min-width:0;overflow-wrap:anywhere}
.jh-tv-note{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px}
.jh-tv-ok{color:var(--jh-ok-fg);margin:0;font-size:12px}
.jh-tv-error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;
  overflow-wrap:anywhere;white-space:pre-wrap}

.jh-tv-jobs{display:flex;flex-direction:column;gap:1px}
.jh-tv-job{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;cursor:pointer;
  border:0;background:transparent;border-radius:6px;padding:3px 6px;
  color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}
.jh-tv-job:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-tv-job-id{color:var(--jh-muted-fg);flex:0 0 auto;font-variant-numeric:tabular-nums}
.jh-tv-job-title{font-weight:500;flex:0 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jh-tv-job-meta,.jh-tv-job-salary,.jh-tv-job-score{color:var(--dsw-alias-label-secondary);
  flex:0 0 auto;font-size:12px}

.jh-tv-pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:8px 10px;border-radius:8px;
  background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.jh-tv-pre-body{background:transparent;border:0;padding:0}
.jh-tv-draft{display:flex;flex-direction:column;gap:6px}
.jh-copy-head{display:flex;justify-content:flex-end}
.jh-tv-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`
