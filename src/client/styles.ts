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
.jh-card{max-width:1000px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin:0 0 12px}
.jh-card-tight{padding:12px 14px;margin:14px 0}
.jh-card-title{font-size:13px;font-weight:600;margin:0 0 8px}
.jh-muted{color:var(--dsw-alias-label-secondary);margin:0}
.jh-ok{color:var(--dsw-alias-state-success-primary)}
.jh-warn{color:var(--dsw-alias-state-warn-primary)}
.jh-error{color:var(--dsw-alias-state-error-primary);margin:0}

.jh-kv{list-style:none;margin:0 0 12px;padding:0;display:grid;
  grid-template-columns:84px minmax(0,1fr);gap:6px 12px;font-size:13px}
.jh-kv>li{display:contents}
/* 键浅、值深：Label 走 secondary(#61666b)，Value 走 primary 并加半档字重 ——
   之前两者颜色几乎一样，眼睛没有落点。 */
.jh-kv span:first-child{color:var(--dsw-alias-label-secondary);font-size:12.5px}
.jh-kv span:last-child{color:var(--dsw-alias-label-primary);font-weight:500;
  min-width:0;overflow-wrap:anywhere}
.jh-kv code,.jh-list code{font-family:ui-monospace,Consolas,monospace;font-size:12px;
  background:var(--dsw-alias-markdown-inline-code);padding:1px 5px;border-radius:4px}
.jh-list{margin:0;padding-left:18px}
.jh-list li{margin:2px 0}

/* ── 控件 ───────────────────────────────────────────────────────────
   对比度基线（2026-09-17 从主题里量出来的，不是拍脑袋）：
     border-l1 = #0000000a（4% 黑）→ 几乎看不见；l2 = 10% / l3 = 12% / l4 = 16%
     bg-base 与 bg-layer-1/-2/-3 **全是纯白** → 靠背景分不出任何层级
     label-primary = bluish-1000（近黑）/ secondary = #61666b /
     tertiary = #81858c / caption = #adb2b8
   结论：**能看见的边界只能由 l2 以上的描边或阴影提供**；正文一律 label-primary，
   secondary 只留给"标签与次要说明"，tertiary 及以下只用于真正可以忽略的东西。 */
.jh-btn{margin-top:10px;padding:6px 12px;font-size:13px;border-radius:8px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l3);background:transparent;
  color:var(--dsw-alias-label-primary)}
.jh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.jh-btn:disabled{opacity:.45;cursor:default}
.jh-btn-inline{margin-top:0}
.jh-btn-active{border-color:var(--dsw-alias-brand-primary);font-weight:600;
  background:var(--dsw-alias-interactive-bg-active)}
/* 主按钮照抄 shell 自己的配方（button-primary-fill + label-primary-foreground）。
   注意：这个主题里 brand-primary = bluish-1000（近黑），所以"主色按钮"就是黑底白字。 */
.jh-btn-primary{border-color:transparent;font-weight:600;
  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.jh-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
/* 三级动作（"重置"）连边框都不给：它不该和主按钮抢注意力 */
.jh-btn-quiet{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.jh-btn-quiet:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.jh-icon-btn{border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;
  padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
.jh-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

.jh-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
.jh-filters .jh-input,.jh-filters .jh-select{width:auto}
/* 关键词吃掉剩余宽度：筛选区右侧不再空一大片 */
.jh-input-grow{flex:1 1 220px;min-width:180px}
.jh-input-sm{width:130px}

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
.jh-todo-urgent .jh-todo-level{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}
.jh-todo-warn .jh-todo-level{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-foreground)}
.jh-todo-title{font-weight:600}
.jh-todo-body{flex:1 1 auto;min-width:0}
.jh-todo-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.jh-btn-tiny{padding:3px 8px;font-size:12px;border-radius:6px;margin-left:6px}

/* ── U1 岗位库 ───────────────────────────────────────────────────── */
.jh-listbar{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* 卡片必须有边界：白底 + 4% 描边画在白页面上等于没有卡片，滚动时容易看串行 */
.jh-job{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;
  box-sizing:border-box;padding:12px 14px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 1px 2px rgba(0,0,0,.04);
  color:var(--dsw-alias-label-primary);transition:border-color .12s,box-shadow .12s}
.jh-job:hover{border-color:var(--dsw-alias-border-l4);box-shadow:0 2px 8px rgba(0,0,0,.08)}
/* 选中：加深描边 + 更实的底。
   不再用 inset 左侧色条 —— 卡片左边挂一条竖线在密集列表里很吵，
   而且和"边框"重复表达了两遍。 */
.jh-job-active{border-color:var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-interactive-bg-active);
  box-shadow:0 2px 8px rgba(0,0,0,.08)}
.jh-job-main{flex:1 1 auto;min-width:0}
.jh-job-title{font-size:14.5px;font-weight:600;margin:0 0 3px;line-height:1.5}
.jh-job-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;
  font-size:12px;color:var(--dsw-alias-label-secondary)}
/* 薪资是决策第一眼要看的东西：字号与字重都提上去，不再和地点一个量级 */
.jh-salary{font-size:15px;font-weight:700;color:var(--dsw-alias-state-business-primary)}
/* 公司名是次要信息，但也不能淡到读不出：用正文色 */
.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;
  color:var(--dsw-alias-label-primary)}
.jh-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
/* 标签做成"极浅灰底 + 深色字"的扁平块：不描边、不加粗 —— 密度高但不噪 */
.jh-tag{font-size:12px;line-height:18px;padding:0 7px;border-radius:5px;
  background:var(--dsw-alias-markdown-tag);color:var(--dsw-alias-label-primary)}
/* 状态徽章是"这个岗位当前算什么"，不是复选框（项目里没有批量选择） */
.jh-state{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
  border-radius:999px;background:var(--dsw-alias-bg-overlay);
  color:var(--dsw-alias-label-secondary)}
.jh-state-new{background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-text)}
/* 已收藏不用实心绿块（一块饱和绿压在白底上很廉价，而且它只是个状态、不是告警）：
   中性底 + 一个绿色小点，仍然一眼能认。 */
.jh-state-saved{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary)}
.jh-state-saved::before{content:'';display:inline-block;width:6px;height:6px;margin-right:5px;
  border-radius:50%;background:var(--dsw-alias-state-success-primary);vertical-align:middle}
.jh-state-ignored,.jh-state-archived{opacity:.75}

/* 分页器：只有"上一页/下一页"两个文字按钮时，用户不知道总共有多少页 */
.jh-pager{display:flex;align-items:center;gap:4px;margin-left:auto}
.jh-pg{min-width:28px;height:28px;padding:0 8px;font-size:12.5px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;
  color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.jh-pg:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.jh-pg:disabled{opacity:.4;cursor:default}
.jh-pg-active{border-color:transparent;font-weight:600;
  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.jh-pg-gap{color:var(--dsw-alias-label-tertiary);padding:0 2px}

/* ── U1 岗位库：左列表 / 右详情（2026-09-17 起不再用抽屉）────────────
   这个屏的主任务是"浏览 → 比较 → 决定"，弹层会盖住列表、每看下一个都要先关一次。
   两栏各自滚动：筛选条固定在顶部，左栏 padding-right 与右栏 padding-left 给中间那条
   分隔线留呼吸；分隔线画在右栏的 border-left 上，不再额外占一列宽度。 */
.jh-jobs-split{display:flex;flex-direction:column;height:100%;box-sizing:border-box;
  padding:16px 18px;max-width:1560px;container-type:inline-size}
.jh-jobs-cols{display:grid;grid-template-columns:minmax(360px,46%) 1fr;
  flex:1 1 auto;min-height:0}
.jh-jobs-pane{min-width:0;overflow:auto;padding-right:16px;padding-bottom:16px}
.jh-detail-pane{min-width:0;overflow:auto;padding-left:16px;padding-bottom:16px;
  border-left:1px solid var(--dsw-alias-border-l1)}
.jh-detail-pane-empty{display:flex;flex-direction:column;gap:8px;justify-content:center;
  color:var(--dsw-alias-label-secondary)}
.jh-detail-empty-title{font-size:14px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
.jh-job-active{border-color:var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-interactive-bg-active)}
/* 面板被拖窄时退回单栏：列表在上、详情在下，整屏一起滚。
   用 container query 而不是 media query —— 决定"窄不窄"的是**面板**有多宽，
   不是窗口有多宽：侧栏一展开、对话区一挤，窗口还宽着呢面板已经放不下两栏了。 */
@container (max-width: 820px){
  .jh-jobs-split{height:auto}
  .jh-jobs-cols{grid-template-columns:1fr}
  .jh-jobs-pane{overflow:visible;padding-right:0}
  .jh-detail-pane{overflow:visible;border-left:0;border-top:1px solid var(--dsw-alias-border-l1);
    padding-left:0;padding-top:12px;margin-top:12px}
}

/* ── P4：匹配分与风险标注 ────────────────────────────────────────── */
.jh-job-signals{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}
.jh-score{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-score-inline{margin-left:8px;font-size:12px}
.jh-flag{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-flag-outsourcing{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-foreground)}
.jh-flag-fraud{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}
.jh-flag-zombie{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.jh-flag-salary_inflation{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-foreground);opacity:.85}
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

/* ── U2 详情（右侧内嵌栏与抽屉共用同一份正文）────────────────────────
   操作按钮原先在正文**最底部** —— 右侧一屏那么长，用户根本滚不到
   （实测反馈就是"详情页右侧没有任何操作按钮"）。现在做成**吸顶操作条**：
   标题 + 薪资 + 四个动作永远停在最上面。
   sticky 相对最近的可滚动祖先（.jh-detail-pane / .jh-drawer-body）定位。 */
.jh-detail-head{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px;
  align-items:flex-start;justify-content:space-between;padding:12px 0 10px;margin:0 0 12px;
  background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l2)}
.jh-detail-headline{min-width:0;flex:1 1 240px}
.jh-detail-title{font-size:17px;font-weight:600;margin:0 0 4px;line-height:1.4}
.jh-detail-salary{margin:0;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
.jh-detail-actions{display:flex;flex-wrap:wrap;gap:6px;flex:0 0 auto}

/* 抽屉：临时看一眼用，保持弹层形态 */
.jh-drawer-layer{position:absolute;inset:0;z-index:30}
.jh-drawer-backdrop{position:absolute;inset:0;border:0;padding:0;cursor:pointer;
  background:rgba(0,0,0,.28)}
.jh-drawer{position:absolute;top:0;right:0;bottom:0;width:min(560px,88%);
  display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);
  border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-8px 0 28px rgba(0,0,0,.18)}
.jh-drawer-head{display:flex;align-items:center;gap:8px;padding:10px 14px;
  border-bottom:1px solid var(--dsw-alias-border-l2)}
.jh-drawer-title{font-weight:600;flex:1 1 auto}
.jh-drawer-body{flex:1 1 auto;overflow:auto;padding:0 14px 14px}

/* L1 粗筛分：本项目的特色数据，值得一个看得懂的仪表盘而不是一行灰字 */
.jh-gauge-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.jh-gauge{position:relative;flex:0 0 auto;width:72px;height:72px}
.jh-gauge svg{transform:rotate(-90deg)}
.jh-gauge-track{stroke:var(--dsw-alias-bg-overlay)}
.jh-gauge-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;font-size:19px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.jh-gauge-unit{font-size:10px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-top:2px}
.jh-gauge-band{font-size:12.5px;font-weight:600}
.jh-gauge-high{color:var(--dsw-alias-state-success-primary)}
.jh-gauge-mid{color:var(--dsw-alias-state-warn-primary)}
.jh-gauge-low{color:var(--dsw-alias-label-secondary)}
.jh-gauge-side{min-width:0;flex:1 1 180px;display:flex;flex-direction:column;gap:6px}

/* 命中/失分逐条：给符号与颜色，而不是只给一个加权数字 */
.jh-reason-mark{flex:0 0 14px;text-align:center;font-weight:700}
.jh-reason-ok .jh-reason-mark{color:var(--dsw-alias-state-success-primary)}
.jh-reason-bad .jh-reason-mark{color:var(--dsw-alias-state-error-primary)}

/* 风险提示用 Alert 框，而不是一排灰字。**不在左边挂粗色条**：
   靠"整体描边 + 浅底"就够表意了，左边一条竖线在密集列表里既吵又与边框重复。
   另外"没有命中"**不刷成绿色**：绿色等于宣布"这个岗位没问题"，而规则没命中只说明
   "没命中已知模式" —— 那恰恰是本项目一路拒绝下的那种结论。 */
.jh-alert{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  padding:10px 12px;margin:0 0 10px;background:var(--dsw-alias-bg-base)}
.jh-alert-warn{border-color:var(--dsw-alias-state-warn-secondary);
  background:var(--dsw-alias-state-warn-tertiary)}
.jh-alert-error{border-color:var(--dsw-alias-state-error-secondary);
  background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
.jh-alert-quiet{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
.jh-alert-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 4px}
.jh-alert-title{font-weight:600;font-size:13px}
.jh-alert-body{margin:0;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-primary)}

/* 长解释收进一个小问号：悬浮看全文，正文里只留一句 */
.jh-hint{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;
  margin-left:5px;border-radius:50%;cursor:help;font-size:10.5px;font-weight:700;line-height:1;
  background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);vertical-align:middle}
.jh-note{margin:0;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary)}

/* 标签分组（技能要求 / 公司福利） */
.jh-tag-group{margin:0 0 10px}
.jh-tag-group-name{display:block;font-size:11.5px;font-weight:600;margin:0 0 5px;
  color:var(--dsw-alias-label-secondary)}

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
  background:var(--dsw-alias-markdown-code-block);border:1px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.jh-tv-pre-body{background:transparent;border:0;padding:0}
.jh-tv-draft{display:flex;flex-direction:column;gap:6px}
.jh-tv-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

/* ── P6：简历中心（U3）与定制（U4）────────────────────────────────── */
.jh-row-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px}
/* 这一屏要占满宽度：左边版本列表（约 1/4）+ 右边工作区 */
.jh-screen-wide{max-width:none;height:100%;display:flex;flex-direction:column;box-sizing:border-box}
.jh-resume-shell{display:grid;grid-template-columns:minmax(230px,25%) minmax(0,1fr);gap:16px;
  flex:1 1 auto;min-height:0}
.jh-resume-side{display:flex;flex-direction:column;gap:8px;min-height:0}
.jh-resume-side-head{display:flex;gap:6px;flex:0 0 auto}
.jh-resume-side-head .jh-btn{flex:0 0 auto}
.jh-resume-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;
  overflow:auto;min-height:0}
.jh-resume-item{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;
  padding:10px 12px;color:var(--dsw-alias-label-primary);font:inherit}
.jh-resume-item:hover{border-color:var(--dsw-alias-border-l4)}
.jh-resume-item-active{border-color:var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-interactive-bg-active);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.jh-resume-item-top{display:flex;align-items:center;gap:6px}
.jh-resume-name{font-size:13.5px;font-weight:600;flex:1 1 auto;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 启用中：浅绿底 + 正文色。刻意不用"饱和绿底白字" —— 那是告警的语法，不是状态的语法 */
.jh-badge-on{flex:0 0 auto;font-size:10.5px;font-weight:600;line-height:18px;padding:0 7px;
  border-radius:999px;background:var(--dsw-alias-state-success-tertiary);
  color:var(--dsw-alias-label-primary)}
.jh-badge-inline{font-style:normal;font-size:10px;font-weight:600;padding:0 5px;border-radius:999px;
  color:var(--dsw-alias-brand-text);background:var(--dsw-alias-state-business-tertiary)}
.jh-resume-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-resume-chips{display:flex;flex-wrap:wrap;gap:4px}
.jh-chip{font-style:normal;font-size:11px;line-height:18px;padding:0 7px;border-radius:5px;
  background:var(--dsw-alias-markdown-tag);color:var(--dsw-alias-label-secondary)}
/* 体检异常：高饱和橙底 —— 它是**告警**，不是状态，所以该刺眼。
   （状态类的"启用中"走的是浅绿底，两者刻意不同语法。） */
.jh-chip-warn{background:var(--dsw-alias-state-warn-primary);
  color:var(--dsw-alias-label-primary-foreground);font-weight:600;cursor:help}
/* "有未保存的改动"是提醒不是告警，用浅底，别和体检抢 */
.jh-chip-dirty{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-primary)}
.jh-chip-quiet{background:transparent;border:1px dashed var(--dsw-alias-border-l3)}

/* 右工作区。
   吸顶不变量（2026-09-17 实测）：**滚动容器是 .jh-work-editor，标题栏在它外面**，
   所以把编辑器滚到底（scrollTop 928）后标题栏 top 仍是 110、位移 0。
   别再给标题栏加 overflow/height，否则"保存"就会跟着滚走。 */
.jh-resume-work{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;
  container-type:inline-size}
.jh-work-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto}
.jh-work-name{max-width:260px;font-weight:600}
.jh-work-actions{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto;align-items:center}
.jh-work-modes{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:0 0 auto}
.jh-modes{display:flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.jh-mode{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;padding:3px 10px;
  border-radius:6px;color:var(--dsw-alias-label-secondary)}
.jh-mode:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-mode-active{background:var(--dsw-alias-interactive-bg-active);
  color:var(--dsw-alias-label-primary);font-weight:600}
.jh-work-body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;flex:1 1 auto;min-height:0}
/* 分屏：窄时**上下堆叠**，中间那条灰条可以拖动改比例。
   同一个 --jh-split 服务两种排法（宽时是左右分屏，见下面的 container query）。 */
.jh-mode-split .jh-work-body{grid-template-columns:minmax(0,1fr);
  grid-template-rows:var(--jh-split,55%) 10px minmax(0,1fr);gap:0}
.jh-mode-edit .jh-work-preview,.jh-mode-edit .jh-work-files,.jh-mode-edit .jh-splitter{display:none}
.jh-mode-preview .jh-work-editor,.jh-mode-preview .jh-work-files,.jh-mode-preview .jh-splitter{display:none}
/* 分屏里也不显示附件 —— 它已经是独立子 tab，留在分屏里会白占一个网格行（实测多出 74px 空白） */
.jh-mode-split .jh-work-files{display:none}
/* 附件单独一个子 tab：它跟渲染无关，挤在预览下面只会占地方 */
.jh-mode-files .jh-work-editor,.jh-mode-files .jh-work-preview,.jh-mode-files .jh-splitter{display:none}
.jh-splitter{display:none;border-radius:5px;background:var(--dsw-alias-bg-overlay);
  cursor:row-resize;margin:5px 0}
.jh-mode-split .jh-splitter{display:block}
.jh-splitter:hover,.jh-splitter:focus-visible{background:var(--dsw-alias-border-l4);outline:none}
.jh-work-files{overflow:auto;min-height:0;padding-right:4px}
.jh-work-editor{overflow:auto;min-height:0;padding-right:4px}
.jh-work-preview{display:flex;flex-direction:column;gap:8px;min-height:0}
.jh-preview-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto}
/* 纸张隐喻：深灰底 + 白纸 + 阴影（bg-mask-2 实测 = 12% 黑，压在白底上就是浅灰） */
.jh-paper-stage{flex:1 1 auto;min-height:320px;overflow:auto;border-radius:10px;
  background:var(--dsw-alias-bg-mask-2);padding:18px}
.jh-paper{display:block;width:100%;max-width:794px;height:1123px;margin:0 auto;border:0;
  border-radius:2px;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.3)}
/* 工作区够宽（>900px）时改成左右分屏：这时拖的是横条，比例仍走 --jh-split。
   判断依据是**面板**宽度（container query），不是窗口宽度。 */
@container (min-width: 901px){
  .jh-mode-split .jh-work-body{grid-template-columns:var(--jh-split,50%) 10px minmax(0,1fr);
    grid-template-rows:minmax(0,1fr)}
  .jh-splitter{cursor:col-resize;margin:0 5px}
}

/* 表单 */
.jh-form-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);padding:12px 14px;margin:0 0 12px}
.jh-form-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.jh-form-head h3{font-size:13px;font-weight:600;margin:0}
.jh-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.jh-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.jh-field{display:flex;flex-direction:column;gap:4px;margin:0 0 10px}
.jh-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-inline{display:flex;gap:6px}
/* 重复块：一块一框，编号 + 上移/下移/删除 */
.jh-entry{border:1px solid var(--dsw-alias-border-l3);border-radius:9px;padding:10px 12px;
  margin:0 0 10px;background:var(--dsw-alias-bg-base)}
.jh-entry-head{display:flex;align-items:center;gap:4px;margin:0 0 8px}
.jh-entry-no{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.jh-icon-btn:disabled{opacity:.3;cursor:default}
.jh-lines{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.jh-line{display:flex;gap:6px;align-items:center;width:100%}
/* 标签输入：回车/顿号确认，点 × 删掉 */
.jh-chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.jh-chip-item{display:inline-flex;align-items:center;gap:4px;font-size:12px;line-height:20px;
  padding:0 4px 0 8px;border-radius:6px;background:var(--dsw-alias-markdown-tag);
  color:var(--dsw-alias-label-primary)}
.jh-chip-x{border:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary);
  font-size:13px;line-height:1;padding:0 2px}
.jh-chip-x:hover{color:var(--dsw-alias-state-error-primary)}
.jh-chip-input{width:150px}

/* 输入控件：白底，与卡片同一层级（反馈：大块文本框的浅灰底和卡片"不是一套"）。
   可输入性改由**描边**承担：常态 12% 黑、悬停 16%、聚焦主题色 + 3px 光环 ——
   比当初被否掉的那版（4% 黑、无聚焦态）强得多，所以去掉填充不会回到"看不出哪里能输入"。 */
.jh-input,.jh-textarea,.jh-select{width:100%;box-sizing:border-box;font:inherit;font-size:13px;
  padding:6px 10px;border-radius:8px;color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base)}
.jh-input:hover,.jh-textarea:hover,.jh-select:hover{border-color:var(--dsw-alias-border-l4)}
.jh-input:focus,.jh-textarea:focus,.jh-select:focus{outline:none;background:var(--dsw-alias-bg-base);
  border-color:var(--dsw-alias-link);box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
.jh-input::placeholder,.jh-textarea::placeholder{color:var(--dsw-alias-label-caption)}
.jh-input-narrow{max-width:90px}
.jh-textarea{resize:vertical;line-height:1.7}
/* 内联可编辑的标题：平时长得像标题，悬停/聚焦才露出"这里能改" */
.jh-editable{width:auto;min-width:180px;max-width:320px;font-size:14.5px;font-weight:600;
  padding:4px 8px;border-color:transparent;background:transparent}
.jh-editable:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-markdown-tag)}
.jh-editable:focus{background:var(--dsw-alias-bg-base);border-color:var(--dsw-alias-link)}
/* 主按钮二号：导出用的"信息蓝"，与保存（近黑）区分开，但同样是实心 */
.jh-btn-info{border-color:transparent;font-weight:600;
  background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-primary-foreground)}
.jh-btn-info:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}
/* 加模块：整行虚线框，空的时候看得见、忙的时候好点 */
.jh-drop{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;
  padding:10px;border:1.5px dashed var(--dsw-alias-border-l4);border-radius:9px;
  background:transparent;cursor:pointer;font:inherit;font-size:13px;
  color:var(--dsw-alias-label-secondary)}
.jh-drop:hover{border-color:var(--dsw-alias-link);color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-interactive-bg-hover)}
/* 辅助说明：前置一个 ⓘ，颜色用 secondary（#61666b —— 比建议的 #888 更深） */
.jh-info{display:flex;align-items:flex-start;gap:6px;margin:6px 0 0;font-size:12.5px;
  line-height:1.7;color:var(--dsw-alias-label-secondary)}
.jh-info-icon{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}
.jh-issues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:12.5px}
.jh-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:12px}
/* 附件一行：格式徽章 + 文件名/元信息 + 打开/删除。原先是一行裸链接，既不能开也不能删。 */
.jh-file-row{display:flex;align-items:center;gap:10px;padding:9px 11px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
.jh-file-badge{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:2px 7px;border-radius:5px;background:var(--dsw-alias-markdown-tag);
  color:var(--dsw-alias-label-secondary)}
.jh-file-pdf{background:var(--dsw-alias-state-error-secondary);
  color:var(--dsw-alias-label-primary-foreground)}
.jh-file-docx{background:var(--dsw-alias-button-info-fill);
  color:var(--dsw-alias-label-primary-foreground)}
.jh-file-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.jh-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jh-file-meta{font-size:11.5px}
.jh-link{color:var(--dsw-alias-link);text-decoration:underline}
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
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.jh-board-title{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;font:inherit;
  font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.jh-board-title:hover{color:var(--dsw-alias-brand-text);text-decoration:underline}
.jh-board-meta{font-size:11px;line-height:1.5}
.jh-board-age{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.jh-board-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}

.jh-followups{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* 同样不用左侧色条：语气靠整体描边色表达 */
.jh-followup{padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);font-size:12px}
.jh-followup-read-no-reply{border-color:var(--dsw-alias-state-warn-secondary)}
.jh-followup-unread-timeout{border-color:var(--dsw-alias-border-l3)}
.jh-followup p{margin:2px 0 0}

.jh-messages,.jh-interviews{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-message,.jh-interview{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1)}
.jh-message-hr{border-color:var(--dsw-alias-brand-primary)}
.jh-message-me{border-color:var(--dsw-alias-border-l2)}
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
/* 总体分段标题：接触链路与投递链路分开写清楚 */
.jh-funnel-seg{font-size:11px;font-weight:600;letter-spacing:.06em;
  color:var(--dsw-alias-label-secondary);margin-top:2px}
.jh-funnel-row{display:flex;align-items:center;gap:9px}
/* 跑道：0 也画得出来（条本身保底 3px），否则全 0 时整张图像没画 */
.jh-funnel-track{flex:1 1 auto;min-width:0;height:12px;border-radius:3px;
  background:var(--dsw-alias-bg-overlay);overflow:hidden}
.jh-funnel-bar{display:block;height:100%;border-radius:3px;
  background:var(--dsw-alias-brand-primary);opacity:.75}
/* 投递阶段换一档色：一眼分得清哪些是"我做的动作"、哪些是招聘方的回应 */
.jh-funnel-bar-apply{background:var(--dsw-alias-button-info-fill);opacity:1}
.jh-funnel-count{flex:0 0 40px;text-align:right;font-variant-numeric:tabular-nums;
  border:0;background:transparent;cursor:pointer;font:inherit;font-weight:600;
  color:var(--dsw-alias-link);text-decoration:underline;padding:0}
.jh-funnel-count:hover{color:var(--dsw-alias-label-primary)}
.jh-funnel-drop{flex:0 0 52px;text-align:right;font-size:11px}

/* ── 看板：全局筛选栏（§13 U8）───────────────────────────────────────
   一处筛选，三个模块一起重算 —— 所以它必须长得像"整页的开关"，
   而不是某个模块自己的小控件：独立卡片 + 一排贴底对齐的字段。 */
.jh-filterbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;
  padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);margin:0 0 10px}
.jh-filterbar .jh-field{margin:0}
.jh-filterbar .jh-input-sm{width:132px}
.jh-filterbar .jh-select{max-width:190px}

.jh-table{border-collapse:collapse;width:100%;font-size:12px}
.jh-table th,.jh-table td{border-bottom:1px solid var(--dsw-alias-border-l2);padding:4px 6px;text-align:left}
.jh-table th{color:var(--dsw-alias-label-secondary);font-weight:500}

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

/* ── D-19：新鲜度徽章与采集页（U9）────────────────────────────────── */
/* 三级各自一个色阶，且**永远带文字**：只给颜色用户分不清"坏了"还是"旧了"。 */
.jh-fresh{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
  border-radius:999px;white-space:nowrap}
.jh-fresh-fresh{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.jh-fresh-stale{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary)}
.jh-fresh-cold{background:var(--dsw-alias-state-error-tertiary);color:var(--dsw-alias-state-error-primary)}

.jh-today-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
.jh-health-line{font-size:12.5px}
.jh-link{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
  color:var(--dsw-alias-brand-text);padding:0}
.jh-link:hover{text-decoration:underline}

.jh-plan-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-plan-item{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
.jh-plan-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 4px}
.jh-sub-title{font-size:12.5px;font-weight:600;margin:12px 0 6px;
  color:var(--dsw-alias-label-primary)}

.jh-card-editing{border-color:var(--dsw-alias-brand-primary)}
.jh-card-error{border-color:var(--dsw-alias-state-error-secondary)}
.jh-fieldset{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px 12px;margin:0 0 12px}
.jh-fieldset legend{font-size:12px;font-weight:600;padding:0 4px;color:var(--dsw-alias-label-secondary)}
.jh-check{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer}
.jh-check input{cursor:pointer}

/* ── 批次 F：薪资箱线图（横向，P25–P75 高亮）──────────────────────── */
/* 用**横向**画：薪资回答"多少"而不是"什么时候"，横着比竖着好读，
   也和上面的漏斗条形同一套视觉语言。高亮的是箱体（P25–P75），
   两端的须是最小/最大值 —— 刻意不做离群点剔除，剔了会把真实的高薪岗删掉。 */
.jh-box{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.jh-box-track{position:relative;height:26px}
.jh-box-whisker{position:absolute;top:11px;height:4px;border-radius:2px;
  background:var(--dsw-alias-border-l3)}
.jh-box-whisker::before,.jh-box-whisker::after{content:'';position:absolute;top:-5px;width:2px;height:14px;
  background:var(--dsw-alias-border-l4)}
.jh-box-whisker::before{left:0}
.jh-box-whisker::after{right:0}
.jh-box-body{position:absolute;top:3px;height:20px;border-radius:5px;
  background:var(--dsw-alias-state-business-tertiary);
  border:1px solid var(--dsw-alias-state-business-primary)}
.jh-box-median{position:absolute;top:1px;width:2px;height:24px;
  background:var(--dsw-alias-state-business-primary)}
.jh-box-scale{display:flex;justify-content:space-between;font-size:11.5px;
  color:var(--dsw-alias-label-secondary)}
.jh-baseline{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
`
