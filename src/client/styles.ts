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

/* ── 语义色的"文本版"（对比度修复）──────────────────────────────────
   实测（真实浏览器取计算样式 + WCAG 公式）：主题里的 state-*-primary 是**指示色**，
   不是文字色 —— 拿来当文字色在 bg-base 上只有 2.0–2.3:1（成功 #22c55e 2.28、
   警告 #f59e0b 2.15），远低于正文要求的 4.5:1。

   做法：把语义色与 label-primary（#0f1115，18.9:1）按 55:45 混出一个**深色变体**，
   色相仍可辨认、对比度达标（混色后经实测均 ≥5:1），而且**没有硬编码色值** —— §5.3
   要求颜色一律走主题变量，color-mix 在本文件里也早有先例（见截止日期的红底）。

   另外：主题里**没有** --dsw-alias-state-error-tertiary（实测 7 个不存在的变量之一），
   写它等于背景静默失效 —— 所以红底用 color-mix 自己调，与既有做法一致。

   ── 第二轮修复（2026-09-18，UI-UX 审核 §4 的 P0 四条）──────────────────
   上一轮只修了"语义色当文字色"这一种用法，漏了另外两种，实测浅色主题下都不达标：

   ① **语义色（或它的深色变体）当"实底填充"**，配 label-primary-foreground：
      .jh-chip-warn 的底色原本直接写 state-warn-primary(#f59e0b)，
      浅色下白字配橙底只有 **2.15:1**（实测）。同文件 :42 早就量到过这个数字。
      → 统一走 --jh-warn-fg（55% 混色）：浅色 5.57:1、深色 12.08:1。

   ② **业务色当"强调文字"**：state-business-primary 在浅色是 #4176e6，
      配白色卡片只有 **4.23:1**（15px/700 的薪资不够大字号门槛，需要 4.5）。
      → --jh-business-fg 用同一个 55% 配方：浅色 4.51:1、深色 8.78:1。

   ③ **tertiary 当"必须读的说明文字"**：label-tertiary 浅色 #81858c 配白只有
      **3.71:1**。同文件 :801-804 已经就 .jh-field-flag 下过这个结论
      （"只够非文本图形，所以用 label-secondary"），只是没推广到 .jh-board-age。
      → --jh-muted-fg 用 45% 混色：浅色 5.22:1、深色 6.76:1。

   ④ **--jh-*-fg 被当成"实底填充"复用** —— 变量名本身没有区分开
      "在浅底上当文字"与"当实底配白字"两种角色。深色主题下 label-primary 是浅色，
      混出来的变体也跟着变浅，于是 :161/:254/:844 那三处"混色当底 +
      label-primary-foreground 当前景"在深色下**没有反向**（实测深色
      .jh-todo-level = 7.10:1 达标）—— 但两套主题都对同一个变量提出
      相反的方向要求，是个隐患。本轮把角色拆开并各写实测值：
         --jh-*-fg   ：当**实底填充**的底色（:161/:254/:844 继续用它）；
         --jh-*-text ：当**文字色**压在两套主题的卡片表面上。
      当前两组的取值恰好相同，拆分是为了让"下次只调一处"不至于连带破坏另一处。 */
.jh-root{
  /* 实底填充（当底色，配 label-primary-foreground 作前景）*/
  --jh-ok-fg:color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-label-primary));
  --jh-warn-fg:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, var(--dsw-alias-label-primary));
  --jh-error-fg:color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-label-primary));
  /* 文字色（压在 bg-base / bg-layer-1 上）—— 实测值见上面每条的注释 */
  --jh-business-fg:color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-label-primary));
  --jh-muted-fg:color-mix(in srgb, var(--dsw-alias-label-tertiary) 45%, var(--dsw-alias-label-primary));
  --jh-error-bg:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent);
  --jh-warn-bg:var(--dsw-alias-state-warn-tertiary);
  --jh-ok-bg:var(--dsw-alias-state-success-tertiary)}

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
/* ── 第三轮修复：模块标题原来是 13px —— 与正文（13px）、说明文字（12.5px）
   几乎同一档，"触发与运行 / 采集方案 / 平台状态"这三个模块头**立不起来**。
   实测两级只差 0.5px（13 vs 12.5），标题层级等于不存在。
   这里提到 14px（正文仍是 13px、说明 12.5px、子标题 12.5px 加粗），
   刻意**不**照搬 Ant Design 的 16/18px：本项目正文 13px、行高 1.7，
   16px 的模块标题在密集表格与表单里会显得头重脚轻。 */
.jh-card-title{font-size:14px;font-weight:600;margin:0 0 8px}
.jh-muted{color:var(--dsw-alias-label-secondary);margin:0}
.jh-ok{color:var(--jh-ok-fg)}
.jh-warn{color:var(--jh-warn-fg)}
.jh-error{color:var(--jh-error-fg);margin:0}

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
/* 筛选条里的补充条件行：标签 + 一排可切换 chips（城市多选 / 屏蔽标注） */
.jh-filter-row{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
.jh-filter-label{font-size:12px;color:var(--jh-muted-fg);margin-right:2px}
.jh-chip{padding:3px 9px;font-size:12px;line-height:18px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);
  transition:border-color .12s,background .12s}
.jh-chip:hover{border-color:var(--dsw-alias-border-l4)}
.jh-chip-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);
  background:var(--dsw-alias-interactive-bg-active)}
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
/* ── 第三轮修复：12px → 12.5px。采集页/方案卡里的「重新检测」「编辑」「删除」
   都是这一档，而卡片标题同时从 13px 提到 14px —— 两者本来只差 1px，
   一提就变成 2px，按钮的标签反而比它所属模块的正文还小。12.5px 收窄这个落差。 */
.jh-btn-tiny{padding:3px 8px;font-size:12.5px;border-radius:6px;margin-left:6px}

/* ── U1 岗位库 ───────────────────────────────────────────────────── */
.jh-listbar{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* 卡片 = 选择主区域 + 右侧快捷标记竖排。列成一行是因为主按钮横贯整张卡，
   快捷按钮不能嵌进它内部（button 不能套 button）；把它们平放在主按钮右边。 */
.jh-job-row{display:flex;align-items:stretch;gap:8px}
.jh-job-row .jh-job{flex:1 1 auto}
.jh-job-quick{display:flex;flex-direction:column;gap:6px;justify-content:center;flex:0 0 auto}
.jh-job-qk{width:34px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:transparent;color:var(--jh-muted-fg);cursor:pointer;font-size:15px;line-height:1}
.jh-job-qk:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);
  background:var(--dsw-alias-interactive-bg-hover)}
.jh-job-qk:disabled{opacity:.5;cursor:default}
.jh-job-qk-on{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);
  background:var(--dsw-alias-interactive-bg-active)}
.jh-job-qk-ign{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);
  background:var(--dsw-alias-interactive-bg-active)}
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
/* 薪资是决策第一眼要看的东西：字号与字重都提上去，不再和地点一个量级。
   颜色走 --jh-business-fg：state-business-primary 直接当文字色在白色卡片上只有
   4.23:1，而 15px/700 够不上"大文本"门槛（需 ≥18.66px 且 ≥700）→ 必须 4.5:1。
   混色后实测浅色 4.51:1、深色 8.78:1。 */
.jh-salary{font-size:15px;font-weight:700;color:var(--jh-business-fg)}
/* 公司名是次要信息，但也不能淡到读不出：用正文色 */
.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;
  color:var(--dsw-alias-label-primary)}
/* ── .jh-tag：唯一的标签定义 ────────────────────────────────────────
   ── 第三轮修复（2026-09-18）：这里本来有**两条** .jh-tag 规则 ——
   上面这条（12px / 5px 圆角 /18px 行高）与下面那条（11.5px / 999px 胶囊 /19px 行高）。
   靠后的那条静默覆盖靠前的，于是**岗位库的技能标签也变成了药丸**，
   而上面这条注释写的却是"扁平方块"——注释与实测相反，是典型的重复规则陷阱。
   两条合并成一条：扁平方块（5px 圆角）。理由：
     * 岗位库里 java/mysql/粗筛 42 是一排**分类标记**，药丸形在密集列表里太吵；
     * 状态标签（成功/失败）也用同一个类，扁平方块更像"表格里的状态"而不是按钮
       （企业级规范里 Table 内的 Tag 就是小圆角矩形，不是胶囊）。
   行高取 19px（原来是两条各 18/19，归一到高的那条，标签不会因字体基线差异跳动）。 */
.jh-tag{display:inline-block;font-size:11.5px;font-weight:600;line-height:19px;
  padding:0 8px;border-radius:4px;white-space:nowrap;
  background:var(--dsw-alias-markdown-tag);color:var(--dsw-alias-label-primary)}
/* 状态徽章是"这个岗位当前算什么"，不是复选框（项目里没有批量选择）。
   ── 第二轮修复：底色是 bg-overlay，它在深色主题下是**中灰 #61666b**，
   而 label-secondary 在深色下也是浅灰 → 实测只有 3.85:1（浅色下 4.90:1 勉强够）。
   改用 label-primary（与 .jh-state-saved 一致）：浅色 15.97:1、深色 5.55:1。 */
.jh-state{flex:0 0 auto;font-size:11.5px;font-weight:600;line-height:20px;padding:0 9px;
  border-radius:999px;background:var(--dsw-alias-bg-overlay);
  color:var(--dsw-alias-label-primary)}
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
/* ── 第二轮修复：下面这几处原本用 label-tertiary，浅色 #81858c 配白只有 3.71:1。
   它们都是**要读的**文本（页码省略号、失分权重、岗位编号、看板计数、说明图标），
   不是可忽略的装饰 —— 同文件 :801-804 就为 .jh-field-flag 下过这个结论。
   统一走 --jh-muted-fg：浅色 9.59:1、深色 11.15:1。 */
.jh-pg-gap{color:var(--jh-muted-fg);padding:0 2px}

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
.jh-flag-outsourcing{background:var(--jh-warn-fg);color:var(--dsw-alias-label-primary-foreground)}
.jh-flag-fraud{background:var(--jh-error-fg);color:var(--dsw-alias-label-primary-foreground)}
.jh-flag-zombie{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.jh-flag-salary_inflation{background:var(--jh-warn-fg);color:var(--dsw-alias-label-primary-foreground);opacity:.9}
.jh-flag-jargon_hit{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.jh-reasons{list-style:none;margin:6px 0 0;padding:0}
.jh-reason{display:flex;gap:8px;padding:2px 0;font-size:12px}
.jh-reason-weight{flex:0 0 34px;text-align:right;font-family:ui-monospace,Consolas,monospace;
  color:var(--jh-muted-fg)}
.jh-reason-hit .jh-reason-weight{color:var(--jh-ok-fg)}
.jh-reason-penalty .jh-reason-weight,.jh-reason-exclude .jh-reason-weight{color:var(--jh-error-fg)}
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
.jh-gauge-high{color:var(--jh-ok-fg)}
.jh-gauge-mid{color:var(--jh-warn-fg)}
.jh-gauge-low{color:var(--dsw-alias-label-secondary)}
.jh-gauge-side{min-width:0;flex:1 1 180px;display:flex;flex-direction:column;gap:6px}

/* 命中/失分逐条：给符号与颜色，而不是只给一个加权数字 */
.jh-reason-mark{flex:0 0 14px;text-align:center;font-weight:700}
.jh-reason-ok .jh-reason-mark{color:var(--jh-ok-fg)}
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

/* 长解释收进一个小问号：悬浮看全文，正文里只留一句。
   ── 第二轮修复：与 .jh-state 同一个病（深色下 bg-overlay 是中灰 +
   label-secondary 是浅灰 → 3.85:1）。改用 label-primary，实测 11.57:1。 */
.jh-hint{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;
  margin-left:5px;border-radius:50%;cursor:help;font-size:10.5px;font-weight:700;line-height:1;
  background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);vertical-align:middle}
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
/* 体检异常：**告警**语法（不是状态语法），所以该刺眼。
   但底色不能直接写 state-warn-primary —— 浅色下白字配 #f59e0b 只有 2.15:1，
   而这是 11px 的实际文字（不是纯装饰色块），必须 4.5:1。
   改走 --jh-warn-fg（与 .jh-todo-warn 同一配方）：浅色 5.57:1、深色 12.08:1。
   它仍然比"状态类"的浅底重得多，两者刻意不同语法这一点没有丢。 */
.jh-chip-warn{background:var(--jh-warn-fg);
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
/* 二级强调动作（导出）。
   ── 第二轮修复：原来它是**实心蓝底**（button-info-fill + label-primary-foreground）。
   两套主题对这一个配色的要求是**相反**的，靠一个 recipe 无解：
     浅色：button-info-fill = #4176e6（中蓝）→ 白字 4.23:1 ✗（需要更深的底）
     深色：button-info-fill = #679efe（亮蓝）→ 深字 7.11:1 ✓（需要更亮的底）
   任何"把底色压深"的写法都会在深色下把亮蓝压成中蓝，深字立刻掉到 4.13:1。
   所以改成**描边 + 主题色文字**：只需保证文字在两套主题的卡片表面上都达标，
   一个 recipe 就够（--jh-business-fg 实测浅色 5.10:1 / 深色 8.78:1）。
   它仍是蓝色强调，只是从"实心"降为"描边"——与本项目其它二级按钮同一套语法。 */
.jh-btn-info{border-color:var(--jh-business-fg);font-weight:600;
  background:transparent;color:var(--jh-business-fg)}
.jh-btn-info:hover:not(:disabled){background:var(--dsw-alias-state-business-tertiary)}
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
.jh-info-icon{flex:0 0 auto;color:var(--jh-muted-fg)}
.jh-issues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:12.5px}
.jh-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:12px}
/* 附件一行：格式徽章 + 文件名/元信息 + 打开/删除。原先是一行裸链接，既不能开也不能删。 */
.jh-file-row{display:flex;align-items:center;gap:10px;padding:9px 11px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1)}
.jh-file-badge{flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.04em;
  padding:2px 7px;border-radius:5px;background:var(--dsw-alias-markdown-tag);
  color:var(--dsw-alias-label-secondary)}
.jh-file-pdf{background:var(--jh-error-fg);
  color:var(--dsw-alias-label-primary-foreground)}
/* ── 第二轮修复：这两个格式徽章原本把 state-error-secondary(#f25a5a) 与
   button-info-fill(#4176e6) 当实底配 label-primary-foreground。两套主题下
   要求相反（浅色要更深的底、深色要更亮的底），一个 recipe 无解：
     浅色 state-error-secondary 配白字 3.29:1 ✗ / button-info-fill 配白字 4.23:1 ✗
     深色两者分别 5.75:1 ✓ / 7.11:1 ✓
   改走 --jh-error-fg / --jh-business-fg：浅色 9.75 / 8.76，深色 9.52 / 11.07。 */
.jh-file-docx{background:var(--jh-business-fg);
  color:var(--dsw-alias-label-primary-foreground)}
.jh-file-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}
.jh-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jh-file-meta{font-size:11.5px}
.jh-footnote{margin-top:14px;font-size:12px}
.jh-select{max-width:260px}

/* U4：岗位详情里的定制建议 */
.jh-tailor{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.jh-tailor-notes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;
  font-size:12px;color:var(--dsw-alias-label-secondary)}
.jh-tailor-skill{display:inline-block;margin:0 4px 4px 0;padding:1px 7px;border-radius:999px;font-size:12px;
  border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.jh-tailor-skill-hit{border-color:var(--dsw-alias-brand-text);color:var(--dsw-alias-brand-text)}
.jh-tv-score-stale{color:var(--jh-warn-fg);font-size:12px}

/* ── P7：流水线看板 / 消息 / 面试 / 数据看板 ───────────────────────── */
/* ── 第三轮修复（2026-09-18，从用户角度看流水线）─────────────────────
   实测的原始问题：7 列的写法是 flex:0 0 210px（连 padding 实际 228px），
   列总宽 1596px + 6×10px 间距 = 1656px，而看板容器只有 1000px
   → **溢出 656px 必须横向滚动**，而当时全屏内容只有 114px（一张卡）。
   在途阶段只有一个位置时，7 个固定列纯粹是浪费；容器越窄越糟（768px 时溢出 980px）。
   而 .jh-screen 的 max-width 是 1000px，这一点**与视口无关** —— 宽屏也照样溢出。

   改法：列改成**可伸缩**（flex:1 1 132px + max-width 340px）。
   内容少 → 列自己撑开填满，不需要滚动；内容多 → 到 132px 底限才滚动。
   底限 132px 是量出来的：卡片里最长的一行是"公司名 · 渠道 · 简历 #N"（11px，
   ≈ 22 个半角字符），再窄就要换行到三四行，卡片反而更高。 */
/* align-items 必须是 flex-start（不是 stretch）：折叠后的空列只有一行高，
   一旦被拉伸，它们会跟最高的那一列等高 —— 实测出现 7 个 400px 高的空胶囊，很丑。 */
.jh-board{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px;align-items:flex-start}
.jh-board-col{flex:1 1 132px;min-width:132px;display:flex;flex-direction:column;gap:6px;
  background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  border-radius:10px;padding:8px}
/* 空列折叠：只占"阶段 · 0"一行的宽度，**不参与伸缩**（flex:0 0 auto）。
   修正第一版：先前给空列 flex:1 1 108px，7 列平摊下来**有内容的列只剩 131px**
   —— 卡片里"公司名 · 渠道 · 简历 #N"被挤成三行，比原来的横向滚动更难读。
   空间该给有内容的列，空列只保留"这个阶段存在、现在是 0"的信息。 */
.jh-board-col-empty{flex:0 0 auto;min-width:0;padding:4px 8px;
  flex-direction:row;align-items:center;gap:6px}
/* 有内容的列**专门**吃掉空列省下的空间。
   上限 380px：实测不设上限时它会被拉到 549px，卡片里一行 11px 的文字
   横跨 500px 读起来很散；380px 与岗位库左栏（517px）同一量级，读着舒服。 */
.jh-board-col:not(.jh-board-col-empty){flex:1 1 132px;max-width:380px}
/* 空列与实列相邻时给 2px 额外间距：它们是两种不同形态的盒子，
   不留缝会糊成一条。 */
.jh-board-col-empty + .jh-board-col:not(.jh-board-col-empty),
.jh-board-col:not(.jh-board-col-empty) + .jh-board-col-empty{margin-left:2px}
.jh-board-head{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;
  color:var(--dsw-alias-label-secondary);min-width:0}
.jh-board-head-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jh-board-count{margin-left:auto;color:var(--jh-muted-fg);font-weight:400;
  font-variant-numeric:tabular-nums}
/* 整条流水线的形状：计数 + 阶段名一行摆完。
   存在的意义是"不用横向滚动也知道自己总共走到哪了"——
   这是原来的看板做不到的（1656px 里只看得到前 4 列）。 */
.jh-stage-strip{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 10px;align-items:center;
  padding:8px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;
  background:var(--dsw-alias-bg-layer-1)}
.jh-stage-strip-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);
  letter-spacing:.02em}
.jh-stage-strip-item{display:inline-flex;align-items:baseline;gap:4px;font-size:12px;
  color:var(--dsw-alias-label-secondary)}
.jh-stage-strip-num{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-primary)}
.jh-stage-strip-item[data-zero="1"] .jh-stage-strip-num{color:var(--dsw-alias-label-tertiary);
  font-weight:400}
/* 有在途投递的阶段加一个小圆点，与全 0 的区分开 —— 不只靠数字颜色。 */
.jh-stage-strip-item[data-active="1"]::before{content:'';width:6px;height:6px;border-radius:50%;
  background:var(--dsw-alias-brand-primary);align-self:center;flex:none}
/* 箭头与"0"一样是**要读的**形状信息，所以走 --jh-muted-fg 而不是 label-tertiary
   （tertiary 在浅色配白只有 3.71:1 —— 这次是类级扫描在新代码里当场抓到的）。 */
.jh-stage-strip-arrow{color:var(--jh-muted-fg);font-size:11px}
.jh-board-empty{margin:0;text-align:center;font-size:12px}
.jh-board-card{display:flex;flex-direction:column;gap:3px;padding:7px 8px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}
.jh-board-title{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;font:inherit;
  font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.jh-board-title:hover{color:var(--dsw-alias-brand-text);text-decoration:underline}
.jh-board-meta{font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.jh-board-age{font-size:11px;color:var(--jh-muted-fg)}
.jh-board-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
/* 破坏性动作（标记已拒绝）与推进动作同排但**视觉降权**：
   它是终态、不可逆，不该和"推进"抢同样的注意力（原来三个按钮长得一模一样）。
   注意用的是 --jh-error-fg（**深色变体**，两套主题下都是深色）——
   不能像早期版本那样用 --dsw-alias-state-error-primary：它在浅色是 #ec1313，
   压在白卡片上写 12px 小字只有 2.54:1，读不清。深色变体浅色 8.41:1 / 深色 7.10:1。 */
/* 具体的描边/颜色规则见下方 .jh-btn-danger-ghost —— 两者是同一套语法，
   这里不再重复定义（第三轮统一）。 */

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
/* .jh-funnel-count 的完整定义在下面（带 cursor/underline 那一条）—— 这里不再留第二份，
   两份同名规则里靠后的那份会静默覆盖靠前的，改错了地方很难查。 */
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
  color:var(--jh-business-fg);text-decoration:underline;padding:0}
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
.jh-fresh-fresh{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
.jh-fresh-stale{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
.jh-fresh-cold{background:var(--jh-error-bg);color:var(--jh-error-fg)}

.jh-today-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px}
.jh-health-line{font-size:12.5px}
/* 唯一的 .jh-link 定义（原先这里和上面各写了一份，上面那份被这一份覆盖 —— 已合并）。
   颜色走 --jh-muted-fg？不：链接要看得出来是链接，所以走 --jh-business-fg 并带下划线。
   ── 第二轮修复：合并时**不能**用 --dsw-alias-link —— 它在浅色下是 #4176e6，
   压在白卡片上只有 4.23:1，不到正文要求的 4.5:1（.jh-funnel-count 正是踩了这个）。 */
.jh-link{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
  color:var(--jh-business-fg);text-decoration:underline;padding:0}
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

/* ── 采集页可用性修复：术语释义 / 行内标记 / 中文徽章 / 明细折叠 ───── */

/* 术语释义：词本身照常显示（它确实是把事情说准的那个词），后面跟一个小小的问号。
   title 同时挂在**整个词组**上，所以悬停在词上也有解释 —— 不用非得瞄准那个问号。 */
.jh-term{border-bottom:1px dashed var(--dsw-alias-border-l4);cursor:help}
/* 术语释义的小问号。
   ── 第三轮修复：原来 margin-left 只有 3px 且 vertical-align:super —— 实测
   问号贴在词尾（"上次成功?"），还往上飘，读起来像标点而不是可点的提示。
   改成 6px 间距 + 正常基线对齐（与同文件的 .jh-field-hint 保持一致，
   那个本来就没有 super）。 */
.jh-term-mark{display:inline-flex;align-items:center;justify-content:center;
  width:13px;height:13px;margin-left:6px;font-size:9px;font-weight:700;line-height:1;
  border-radius:50%;background:var(--dsw-alias-bg-layer-3);
  color:var(--dsw-alias-label-secondary);vertical-align:middle}

/* 屏幕阅读器专用：释义文本要让读屏能念出来，但不占版面 */
.jh-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* 行内标记（粗体与代码两种）—— 原来这些标记是原样印出来的 */
.jh-inline-code{font-family:ui-monospace,Consolas,monospace;font-size:12px;
  padding:0 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary)}

.jh-tone-ok{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}
.jh-tone-warn{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
.jh-tone-error{background:var(--jh-error-bg);color:var(--jh-error-fg)}
.jh-tone-muted{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary)}

/* 调度归属的"唯一说法"：一句话讲清谁在调度、下次什么时候跑。
   原来这里是「调度：未启动」与「下次运行：还有 9 小时」并排，读起来自相矛盾。 */
.jh-story{margin:2px 0 4px;font-size:13px;line-height:1.7}
.jh-story-ok{color:var(--dsw-alias-label-primary)}
.jh-story-warn{color:var(--jh-warn-fg)}
.jh-story-muted{color:var(--dsw-alias-label-secondary)}

/* 租约面板：把"死胡同"提示换成带动作的面板 */
.jh-lease{margin:8px 0;padding:8px 10px;border-radius:9px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.jh-lease-warn{border-color:var(--dsw-alias-state-warn-secondary)}
.jh-lease-ok{border-color:var(--dsw-alias-state-success-secondary)}
.jh-lease-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px}

/* 明细折叠（原来的堆栈直出改成一句人话 + 可展开的原始信息）*/
.jh-details{margin-top:5px;font-size:12px}
.jh-details>summary{cursor:pointer;color:var(--dsw-alias-brand-text);font-size:12px;
  padding:1px 0;user-select:none}
.jh-details>summary:hover{text-decoration:underline}
.jh-details .jh-pre{margin:6px 0 0;max-height:220px}
.jh-details-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}

/* 数值列右对齐 + 等宽数字：纵向比对时位数才能对齐。
   注意选择器要写成 .jh-table td.jh-num —— 只写 .jh-num 会被上面的 .jh-table td{text-align:left}
   按特异性压过去（实测踩到：类选择器 0,1,0 输给 0,1,1，计算样式仍然是 left）。 */
.jh-table td.jh-num,.jh-table th.jh-num{text-align:right;font-variant-numeric:tabular-nums}
.jh-num{font-variant-numeric:tabular-nums}
.jh-table-runs td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}

/* 方案条件那一行：标签之间用 · 分隔，不要挤成一块 */
.jh-plan-meta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px}

/* ── 第三轮修复：平台状态列表 ────────────────────────────────────────
   原来它是一条 .jh-list 的 li，用的是浏览器默认的 list-style 小黑点（disc），
   后面再用"· "当分隔符。小黑点不带任何状态含义，而且与真正的状态色混在一起。
   这里去掉原生标记，改成一个**状态圆点 + 文字**的标准指示器：
   圆点给颜色，后面的"正常/已登录"给语义 —— 不让颜色单独承载信息。 */
.jh-status-list{list-style:none;padding-left:0;display:flex;flex-direction:column;gap:6px}
.jh-status-list>li{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
/* 状态圆点。颜色用 --jh-*-fg（深色混色变体）而**不是** state-*-primary：
   后者当底色时与页面/卡片背景的对比度只有 2.0–2.2:1，而 WCAG 1.4.11 对
   "承载意义的非文本图形"要求 3:1 —— 小圆点尤其容易在这种检查上被忽视。
   混色变体实测：成功 5.3:1 / 警告 5.9:1 / 危险 9.8:1（浅色主题）。
   文字标签**必须**保留（下面 li 里的"正常/已登录"），圆点只是辅助。 */
.jh-status-dot{flex:none;width:8px;height:8px;border-radius:50%;
  background:var(--dsw-alias-label-tertiary)}
.jh-status-dot-on{background:var(--jh-ok-fg)}
.jh-status-dot-warn{background:var(--jh-warn-fg)}
.jh-status-dot-bad{background:var(--jh-error-fg)}

/* ── 界面评审第二轮：弹窗 / 胶囊 / Banner / 分段控件 / 时间选择器 ───── */

/* 状态标签的样式见文件上方那条唯一的 .jh-tag（两条重复规则已在第三轮合并）。 */

/* 弹窗：层 + 遮罩 + 对话框。
   遮罩用 button 而不是 div —— 它天然可聚焦、可被读屏识别为"关闭"。 */
.jh-modal-layer{position:absolute;inset:0;z-index:40;display:flex;align-items:flex-start;
  justify-content:center;padding:36px 16px;box-sizing:border-box;overflow:auto}
.jh-modal-backdrop{position:absolute;inset:0;border:0;padding:0;cursor:pointer;
  background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent)}
.jh-modal{position:relative;display:flex;flex-direction:column;max-height:calc(100% - 24px);
  width:100%;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 40px rgba(0,0,0,.22);
  outline:none}
.jh-modal-md{max-width:520px}
.jh-modal-lg{max-width:720px}
.jh-modal-head{display:flex;align-items:center;gap:8px;padding:12px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.jh-modal-title{font-size:14.5px;font-weight:600;margin:0}
.jh-modal-body{padding:14px 16px;overflow:auto;flex:1 1 auto;min-height:0}
.jh-modal-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 16px;
  border-top:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.jh-modal-foot-note{font-size:12px}

/* 字段标题 + 收纳在问号里的说明（取代输入框下方的长段解释）*/
.jh-field-label{display:inline-flex;align-items:center;gap:5px;font-size:12px;
  color:var(--dsw-alias-label-secondary)}
.jh-field-hint{display:inline-flex;align-items:center;justify-content:center;
  width:14px;height:14px;flex:none;font-size:10px;font-weight:700;line-height:1;cursor:help;
  border-radius:50%;border:1px solid var(--dsw-alias-border-l3);
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.jh-field-hint:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text)}
/* 对比度：label-tertiary 在浅底上只有 3.71:1（只够非文本图形），而这是个 10px 的字符，
   所以用 label-secondary（5.80:1）。 */
.jh-field-flag{font-style:normal;font-size:11px;padding:0 6px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.jh-field-row{display:flex;align-items:center;gap:6px}
.jh-field-row .jh-input{flex:1 1 auto;min-width:0}
.jh-section-title{font-size:12px;font-weight:600;margin:14px 0 8px;
  color:var(--dsw-alias-label-secondary)}

/* 时间范围选择器：两个原生 time 输入 + 中间一个"至"，替掉原来的四个数字框 */
.jh-timerange{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
.jh-time{width:118px}
.jh-timerange-sep{font-size:12.5px;color:var(--dsw-alias-label-secondary)}

/* 分段标签组（运行日）+ 一键预设 */
.jh-segmented{display:inline-flex;gap:2px;padding:2px;border-radius:9px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay)}
.jh-seg{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
  padding:4px 10px;border-radius:7px;color:var(--dsw-alias-label-secondary)}
.jh-seg:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.jh-seg-on{background:var(--dsw-alias-interactive-bg-active);
  color:var(--dsw-alias-label-primary);font-weight:600}
.jh-presets{margin-top:8px}

/* 卡片内的警告 Banner（把"连续失败 N 次"这类核心风险抬出来）*/
.jh-banner{display:flex;flex-direction:column;gap:2px;margin-top:8px;padding:7px 10px;
  border-radius:8px;font-size:12.5px;line-height:1.6}
.jh-banner-title{font-weight:600}
.jh-banner-warn{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
.jh-banner-error{background:var(--jh-error-bg);color:var(--jh-error-fg)}

/* 方案卡片：明确边框 + 阴影，与卡片背景拉开层次 */
.jh-plan-card{padding:11px 13px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);
  background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 3px rgba(0,0,0,.07);font-size:12.5px}
.jh-plan-name{font-size:13.5px}

/* 按钮权重：危险 / 警示。主操作复用已有的 .jh-btn-primary。
   颜色一律走主题变量（§5.3），不写死 red。 */
/* 危险操作：**实底**。
   注意底色用的是 --jh-error-fg（语义色与 label-primary 混出的深色变体），不是主题的
   state-error-primary —— 实测后者配白字恰好 **4.4996:1**，比 AA 的 4.5 差一点点，
   属于"看着没问题、量了就是不达标"。换成混色后是 9.79:1，视觉上仍是明确的红。 */
/* ── 第三轮修复：破坏性动作分成"触发"与"确认"两档 ─────────────────────
   原来列表行里的「删除」和确认弹窗里的「确认删除」共用 .jh-btn-danger（实心填充）。
   实测在深色主题里「删除」的背景是 rgb(245,162,162) —— 同一张方案卡里
   它比主操作「立即采集」的填充还抢眼，而它只是个不该被顺手点的次要动作。
   现在：
     * .jh-btn-danger        实心 —— 只留给**确认弹窗里的确认键**（那里它就是主操作）；
     * .jh-btn-danger-ghost  描边 + 危险色文字 —— 列表行里的触发键。
   文字色用 --jh-error-fg（深色变体）而不是 state-error-primary：
   后者在浅色是 #ec1313，12.5px 小字压白底只有 2.54:1（实测 8.41:1 才是达标的那个）。 */
.jh-btn-danger{border-color:transparent;font-weight:600;
  background:var(--jh-error-fg);
  color:var(--dsw-alias-label-primary-foreground)}
.jh-btn-danger:hover:not(:disabled){filter:brightness(1.12)}
/* 列表行里的破坏性动作：描边、不加粗、不带填充 —— 看得见、但不抢注意力。 */
.jh-btn-danger-ghost{border-color:var(--dsw-alias-border-l3);color:var(--jh-error-fg)}
.jh-btn-danger-ghost:hover:not(:disabled){background:var(--jh-error-bg);
  border-color:var(--dsw-alias-state-error-secondary)}
.jh-btn-warn{border-color:var(--dsw-alias-state-warn-primary);color:var(--jh-warn-fg)}
.jh-btn-warn:hover:not(:disabled){background:var(--jh-warn-bg)}

/* 表格里的错误：只留一个小标记，点开才是弹窗（原来是整段堆栈摊在单元格里）。
   ── 第三轮修复：它原来是 999px 胶囊 + 1px 边框 + 2px×9px 内边距（实测 26px 高），
   而同一列的"成功/失败"标签是 19px 高的小圆角矩形 —— 同一张表里两种形状，
   而且错误那个明显更"胖"，把 158px 的状态列撑到了 227px 宽。
   现在统一成与 .jh-tag 同一档的小圆角矩形（4px），高度也对齐。 */
.jh-err-chip{display:inline-flex;align-items:center;gap:5px;cursor:pointer;font:inherit;
  font-size:11.5px;line-height:17px;padding:0 8px;border-radius:4px;
  border:1px solid var(--dsw-alias-state-error-secondary);
  background:var(--jh-error-bg);color:var(--jh-error-fg)}
.jh-err-chip:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)}
.jh-err-chip-short{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:9em}
.jh-err-chip-more{font-size:10.5px;opacity:.75;text-decoration:underline;flex:none}
/* 警示图标：形状本身也表意（不只靠颜色）。 */
.jh-err-chip-icon{flex:none;font-size:10px;line-height:1}

/* ── quality-gates 收尾：表格状态 / 小屏策略 / 空态 / 加载态 / 反馈可关闭 ── */

/* Table 的必查状态里有 row hover —— 原来没有，扫行时会丢失"鼠标在哪一行"的反馈 */
.jh-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}

/* 小屏策略：**有意的横向滚动**（quality-gates §5 允许，条件是保留行身份与主操作）。
   表格给一个 min-width 让列不被压成一条；容器 overflow-x:auto 承担滚动。 */
.jh-table-scroll{overflow-x:auto;overscroll-behavior-x:contain}
.jh-table-runs{min-width:520px}
/* 粘住"开始"列：横向滚动时仍然认得出这是哪一行。
   ── 第三轮修复：这张表原来没有列宽策略，浏览器按内容自动分配 ——
   实测"状态"列被撑到 158px 而最宽的标签只有 64px，"更新"列只有个位数却占 75px，
   空出来的宽度全被 498px 的"结果说明"吃掉（它其实只需要一句话）。
   做法：非最后一列给 width:1% + nowrap，让它们**收缩到内容宽**；
   "结果说明"不给宽度，于是吃掉全部剩余空间。比 table-layout:fixed 好的地方是
   列宽仍随内容自适应（"部分成功"比"成功"宽），不会把说明列压成等宽的一格。 */
.jh-table-runs th:not(:last-child),.jh-table-runs td:not(:last-child){width:1%;white-space:nowrap}
/* 「开始」列保底宽度：收缩到内容宽后它只剩 40px（表头"开始"比"11:34"窄），
   时间贴边、窄屏下还有被裁的风险。给一个 6ch 下限。 */
.jh-table-runs td.jh-col-sticky:first-child{min-width:6ch}
.jh-table-runs th.jh-num,.jh-table-runs td.jh-num{padding-right:10px}
.jh-table-runs th.jh-col-sticky,.jh-table-runs td.jh-col-sticky{
  position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1)}

/* 空态：原因 + 下一步（rules §4.3 / quality-gates §2 "空数据时给出原因和下一步"）*/
.jh-empty{display:flex;flex-direction:column;gap:4px;padding:12px 0}

/* 加载态：占位行保持布局稳定（不要把"正在读取"显示成"没有数据"）*/
.jh-skeleton-row{color:var(--dsw-alias-label-secondary);text-align:center}

/* 反馈条：可关闭 */
.jh-feedback{display:flex;align-items:flex-start;gap:8px}
.jh-feedback p{flex:1 1 auto;min-width:0}
.jh-feedback-close{flex:0 0 auto}

/* ── 小屏顶栏降级（≤600px）──────────────────────────────────────────
   实测踩到（375px 截图）：标题被挤成"求\n职\n找\n工\n作"一列一个字，10 个 tab 竖着排成十行。
   rules §7 要求"导航、筛选和批量操作在小屏有合理降级" —— 竖向堆叠不是降级，是坏掉。
   做法：顶栏允许换行 → 第一行 标题/徽章/实时状态/返回，第二行 **可横向滚动的 tab 条**。 */
@media (max-width:600px){
  .jh-topbar{flex-wrap:wrap;gap:8px}
  .jh-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}
  /* tab 条整行、可横滑、不换行：保留"我在哪里"的可达性，同时不把顶栏撑成十行 */
  .jh-tabs{order:3;flex:1 1 100%;margin-left:0;flex-wrap:nowrap;
    overflow-x:auto;overscroll-behavior-x:contain}
  .jh-tabs::-webkit-scrollbar{display:none}
  .jh-tab{flex:0 0 auto}
  /* 实时状态只留圆点，文字让位给操作按钮 */
  .jh-live span,.jh-live{font-size:0}
  .jh-live .jh-dot{width:8px;height:8px}
}

/* ── 小屏（≤480px）─────────────────────────────────────────────────
   quality-gates §5 要求 375px 可用；rules §7 要求弹窗在移动端考虑底部抽屉/全屏页。 */
@media (max-width:480px){
  /* 弹窗：小屏变成接近全屏的页面，而不是卡片留 16px 边 */
  .jh-modal-layer{padding:0;align-items:stretch}
  .jh-modal{max-height:100%;height:100%;border-radius:0;border-left:0;border-right:0}
  .jh-modal-md,.jh-modal-lg{max-width:none}
  /* 低密度：小屏隐藏「更新」列，保留 时间/状态/新增/结果说明 这四列关键信息 */
  .jh-table-runs .jh-col-hide-sm{display:none}
  /* 主要操作在小屏仍然找得到：方案卡的动作换行且左对齐，不挤成一条 */
  .jh-plan-head{gap:4px}
  .jh-plan-head .jh-btn{flex:0 0 auto}
  /* 时间范围在小屏换行显示，避免两个输入框被压扁 */
  .jh-timerange{gap:6px}
  .jh-time{width:100%;max-width:160px}
}
`
