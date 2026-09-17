import { PLUGIN_ID } from '../shared/constants.js'

/**
 * 注入本插件的样式。
 *
 * 注意：真实客户端插件**没有** `styles` 服务 —— 那是动态插件的 sandbox builtin。
 * 页面上的惯例是插入 `<style data-plugin="<包名>">`；`dsh-client-hmr` 热重载时
 * 正是按 `style[data-plugin]` 清理旧样式的，所以这个属性必须写对。
 *
 * 颜色一律走主题 CSS 变量（§5.3），亮/暗主题共用一套，不硬编码颜色。
 */
export function installStyles(): () => void {
  for (const stale of document.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`)) stale.remove()
  const style = document.createElement('style')
  style.setAttribute('data-plugin', PLUGIN_ID)
  style.textContent = CSS
  document.head.appendChild(style)
  return () => style.remove()
}

const CSS = `
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

/* ── 屏 ───────────────────────────────────────────────────────────── */
.jh-screen{padding:16px 18px;max-width:1000px}
.jh-card{max-width:1000px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin:0 0 12px}
.jh-card-tight{padding:10px 12px;margin:12px 0}
.jh-card-title{font-size:13px;font-weight:600;margin:0 0 8px}
.jh-muted{color:var(--dsw-alias-label-secondary);margin:0}
.jh-ok{color:var(--dsw-alias-state-success-primary)}
.jh-warn{color:var(--dsw-alias-state-warn-primary)}
.jh-error{color:var(--dsw-alias-state-error-primary);margin:0}

.jh-kv{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:96px 1fr;gap:2px 12px}
.jh-kv>li{display:contents}
.jh-kv span:first-child{color:var(--dsw-alias-label-secondary)}
.jh-kv code,.jh-list code{font-family:ui-monospace,Consolas,monospace;font-size:12px;
  background:var(--dsw-alias-markdown-inline-code);padding:1px 5px;border-radius:4px}
.jh-list{margin:0;padding-left:18px}
.jh-list li{margin:2px 0}

/* ── 控件 ─────────────────────────────────────────────────────────── */
.jh-btn{margin-top:10px;padding:6px 12px;font-size:13px;border-radius:8px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary)}
.jh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.jh-btn:disabled{opacity:.5;cursor:default}
.jh-btn-inline{margin-top:0}
.jh-btn-active{border-color:var(--dsw-alias-brand-primary);font-weight:600}
.jh-icon-btn{border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;
  padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
.jh-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

.jh-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
.jh-input{box-sizing:border-box;padding:5px 9px;font-size:13px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);min-width:180px}
.jh-input-narrow{min-width:110px;width:auto}

/* ── U0 今日 ─────────────────────────────────────────────────────── */
.jh-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 12px}
.jh-stat{display:flex;flex-direction:column;gap:2px;text-align:left;padding:12px 14px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);cursor:default}
button.jh-stat{cursor:pointer}
button.jh-stat:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-stat b{font-size:22px;font-weight:600;line-height:1.2}
.jh-stat span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-stat-warn b{color:var(--dsw-alias-state-warn-primary)}
.jh-stat-error b{color:var(--dsw-alias-state-error-primary)}

.jh-todos{list-style:none;margin:0;padding:0}
.jh-todo{display:flex;gap:10px;align-items:flex-start;padding:8px 0;
  border-top:1px solid var(--dsw-alias-border-l1)}
.jh-todo:first-child{border-top:0}
.jh-todo-level{flex:0 0 auto;font-size:11px;padding:1px 6px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-todo-urgent .jh-todo-level{background:var(--dsw-alias-state-error-primary);color:#fff}
.jh-todo-warn .jh-todo-level{background:var(--dsw-alias-state-warn-primary);color:#fff}
.jh-todo-title{font-weight:600}
.jh-todo-body{flex:1 1 auto;min-width:0}
.jh-todo-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.jh-btn-tiny{padding:3px 8px;font-size:12px;border-radius:6px;margin-left:6px}

/* ── U1 岗位库 ───────────────────────────────────────────────────── */
.jh-listbar{display:flex;align-items:center;gap:8px;margin:0 0 8px}
.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-job{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;
  box-sizing:border-box;padding:12px 14px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary)}
.jh-job:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover)}
.jh-job-main{flex:1 1 auto;min-width:0}
.jh-job-title{font-size:14px;font-weight:600;margin:0 0 2px}
.jh-job-meta{display:flex;flex-wrap:wrap;gap:10px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-salary{color:var(--dsw-alias-state-business-primary);font-weight:600}
.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
.jh-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.jh-tag{font-size:11px;padding:1px 7px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-state{flex:0 0 auto;font-size:11px;padding:2px 8px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-state-new{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-text)}
.jh-state-saved{background:var(--dsw-alias-state-success-primary);color:#fff}
.jh-state-ignored,.jh-state-archived{opacity:.7}

/* ── P4：匹配分与风险标注 ────────────────────────────────────────── */
.jh-job-signals{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}
.jh-score{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-score-inline{margin-left:8px;font-size:12px}
.jh-flag{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-flag-outsourcing{background:var(--dsw-alias-state-warn-primary);color:#fff}
.jh-flag-fraud{background:var(--dsw-alias-state-error-primary);color:#fff}
.jh-flag-zombie{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.jh-flag-salary_inflation{background:var(--dsw-alias-state-warn-primary);color:#fff;opacity:.85}
.jh-flag-jargon_hit{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-reasons{list-style:none;margin:6px 0 0;padding:0}
.jh-reason{display:flex;gap:8px;padding:2px 0;font-size:12px}
.jh-reason-weight{flex:0 0 34px;text-align:right;font-family:ui-monospace,Consolas,monospace;
  color:var(--dsw-alias-label-tertiary)}
.jh-reason-hit .jh-reason-weight{color:var(--dsw-alias-state-success-primary)}
.jh-reason-penalty .jh-reason-weight,.jh-reason-exclude .jh-reason-weight{color:var(--dsw-alias-state-error-primary)}
.jh-reason-exclude{color:var(--dsw-alias-state-error-primary);font-weight:600}
.jh-flags{list-style:none;margin:0;padding:0}
.jh-flag-item{padding:8px 0;border-top:1px solid var(--dsw-alias-border-l1)}
.jh-flag-item:first-child{border-top:0}
.jh-flag-head{display:flex;align-items:center;gap:8px}
.jh-evidence{margin:4px 0 0;padding-left:18px;font-size:12px;color:var(--dsw-alias-label-secondary)}

/* ── U2 抽屉 ─────────────────────────────────────────────────────── */
.jh-drawer-layer{position:absolute;inset:0;z-index:30}
.jh-drawer-backdrop{position:absolute;inset:0;border:0;padding:0;cursor:pointer;
  background:rgba(0,0,0,.28)}
.jh-drawer{position:absolute;top:0;right:0;bottom:0;width:min(520px,86%);
  display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);
  border-left:1px solid var(--dsw-alias-border-l1);box-shadow:-8px 0 28px rgba(0,0,0,.18)}
.jh-drawer-head{display:flex;align-items:center;gap:8px;padding:10px 14px;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.jh-drawer-title{font-weight:600;flex:1 1 auto}
.jh-drawer-body{flex:1 1 auto;overflow:auto;padding:14px}
.jh-detail-title{font-size:16px;font-weight:600;margin:0 0 4px}
.jh-detail-salary{margin:0 0 12px}
.jh-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 8px}

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
.jh-tv-ok{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px}
.jh-tv-error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;
  overflow-wrap:anywhere;white-space:pre-wrap}

.jh-tv-jobs{display:flex;flex-direction:column;gap:1px}
.jh-tv-job{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;cursor:pointer;
  border:0;background:transparent;border-radius:6px;padding:3px 6px;
  color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}
.jh-tv-job:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-tv-job-id{color:var(--dsw-alias-label-tertiary);flex:0 0 auto;font-variant-numeric:tabular-nums}
.jh-tv-job-title{font-weight:500;flex:0 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jh-tv-job-meta,.jh-tv-job-salary,.jh-tv-job-score{color:var(--dsw-alias-label-secondary);
  flex:0 0 auto;font-size:12px}

.jh-tv-pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:8px 10px;border-radius:8px;
  background:var(--dsw-alias-markdown-code-block);border:.5px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.jh-tv-pre-body{background:transparent;border:0;padding:0}
.jh-tv-draft{display:flex;flex-direction:column;gap:6px}
.jh-tv-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

/* ── P6：简历中心（U3）与定制（U4）────────────────────────────────── */
.jh-row-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.jh-resume-layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px;align-items:start}
.jh-resume-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.jh-resume-item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;cursor:pointer;
  border:1px solid transparent;background:transparent;border-radius:8px;padding:8px 10px;
  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.jh-resume-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-resume-item-active{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.jh-resume-name{font-weight:600;display:flex;align-items:center;gap:6px}
.jh-badge-inline{font-style:normal;font-size:10px;font-weight:600;padding:0 5px;border-radius:999px;
  color:var(--dsw-alias-brand-text);background:var(--dsw-alias-state-business-tertiary)}
.jh-resume-meta{font-size:12px;line-height:1.5}
.jh-resume-detail{min-width:0}
.jh-resume-editor{display:flex;flex-direction:column;gap:10px}
.jh-two-col{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;align-items:start}
.jh-field{display:flex;flex-direction:column;gap:3px;margin:0 0 8px}
.jh-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-inline{display:flex;gap:6px}
.jh-input,.jh-textarea,.jh-select{width:100%;box-sizing:border-box;font:inherit;font-size:13px;
  padding:5px 8px;border-radius:8px;color:var(--dsw-alias-label-primary);
  border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.jh-input-narrow{max-width:90px}
.jh-textarea{resize:vertical;line-height:1.6}
.jh-textarea-tall{min-height:200px;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.jh-issues{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
.jh-preview{width:100%;height:420px;border:.5px solid var(--dsw-alias-border-l1);border-radius:10px;
  background:#fff}
.jh-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
.jh-link{color:var(--dsw-alias-brand-text);text-decoration:underline}
.jh-footnote{margin-top:14px;font-size:12px}
.jh-select{max-width:260px}

/* U4：岗位详情里的定制建议 */
.jh-tailor{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.jh-tailor-notes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;
  font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-tailor-skill{display:inline-block;margin:0 4px 4px 0;padding:1px 7px;border-radius:999px;font-size:12px;
  border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.jh-tailor-skill-hit{border-color:var(--dsw-alias-brand-text);color:var(--dsw-alias-brand-text)}
.jh-tv-score-stale{color:var(--dsw-alias-state-warn-primary);font-size:12px}

/* ── P7：流水线看板 / 消息 / 面试 / 数据看板 ───────────────────────── */
.jh-board{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}
.jh-board-col{flex:0 0 210px;min-width:210px;display:flex;flex-direction:column;gap:6px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  border-radius:10px;padding:8px}
.jh-board-head{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
  color:var(--dsw-alias-label-secondary)}
.jh-board-count{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-weight:400}
.jh-board-empty{margin:0;text-align:center;font-size:12px}
.jh-board-card{display:flex;flex-direction:column;gap:3px;padding:7px 8px;border-radius:8px;
  border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.jh-board-title{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;font:inherit;
  font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.jh-board-title:hover{color:var(--dsw-alias-brand-text);text-decoration:underline}
.jh-board-meta{font-size:11px;line-height:1.5}
.jh-board-age{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.jh-board-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}

.jh-followups{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-followup{padding:8px 10px;border-radius:8px;border-left:3px solid var(--dsw-alias-border-l3);
  background:var(--dsw-alias-bg-layer-1);font-size:12px}
.jh-followup-read-no-reply{border-left-color:var(--dsw-alias-state-warn-primary)}
.jh-followup-unread-timeout{border-left-color:var(--dsw-alias-label-tertiary)}
.jh-followup p{margin:2px 0 0}

.jh-messages,.jh-interviews{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-message,.jh-interview{padding:9px 11px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1)}
.jh-message-hr{border-left:3px solid var(--dsw-alias-brand-text)}
.jh-message-me{border-left:3px solid var(--dsw-alias-label-tertiary)}
.jh-message-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:12px}
.jh-message-body{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.jh-message-reply{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.jh-interview-conflict{border-color:var(--dsw-alias-state-warn-primary)}

.jh-funnel{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
.jh-funnel>li{display:flex;align-items:center;gap:8px}
.jh-funnel-label{flex:0 0 72px;color:var(--dsw-alias-label-secondary)}
.jh-funnel-bar{height:8px;border-radius:4px;background:var(--dsw-alias-brand-text);opacity:.55;flex:0 0 auto}
.jh-funnel-count{flex:0 0 40px;text-align:right;font-variant-numeric:tabular-nums}
.jh-funnel-rate{flex:0 0 48px;text-align:right}
/* 总体切换：接触漏斗与投递漏斗是两个不可比的总体，画一条线比什么都清楚 */
.jh-funnel-boundary{border-top:1px dashed var(--dsw-alias-border-l3);padding-top:4px;margin-top:2px}

.jh-table{border-collapse:collapse;width:100%;font-size:12px}
.jh-table th,.jh-table td{border-bottom:.5px solid var(--dsw-alias-border-l1);padding:4px 6px;text-align:left}
.jh-table th{color:var(--dsw-alias-label-secondary);font-weight:500}

/* ── P8：校招硬截止（不可逆节点必须显眼）──────────────────────────── */
.jh-deadlines{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:4px;font-size:12px}
.jh-deadline{padding:5px 9px;border-radius:7px;border-left:3px solid var(--dsw-alias-border-l3);
  background:var(--dsw-alias-bg-base)}
/* 24 小时内：橙；已过期：红。两个色阶刻意区分 —— 「快了」与「没了」是两件事 */
.jh-deadline-urgent{border-left-color:var(--dsw-alias-state-warn-primary);
  background:var(--dsw-alias-state-warn-tertiary)}
.jh-deadline-overdue{border-left-color:var(--dsw-alias-state-error-primary);
  background:var(--dsw-alias-state-error-tertiary)}
.jh-campus-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-campus-item{padding:9px 11px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1)}
`
