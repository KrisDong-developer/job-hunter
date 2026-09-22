/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const COLLECT_BUTTONS = `
/* ── 第三轮修复：12px → 12.5px。采集页/方案卡里的「重新检测」「编辑」「删除」
   都是这一档，而卡片标题同时从 13px 提到 14px —— 两者本来只差 1px，
   一提就变成 2px，按钮的标签反而比它所属模块的正文还小。12.5px 收窄这个落差。 */
.jh-btn-tiny{padding:3px 8px;font-size:12.5px;border-radius:6px;margin-left:6px}
`

export const PLANS = `
.jh-plan-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.jh-plan-item{padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
.jh-plan-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 4px}

.jh-card-editing{border-color:var(--dsw-alias-brand-primary)}
.jh-card-error{border-color:var(--dsw-alias-state-error-secondary)}
.jh-fieldset{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:10px 12px;margin:0 0 12px}
.jh-fieldset legend{font-size:12px;font-weight:600;padding:0 4px;color:var(--dsw-alias-label-secondary)}
.jh-check{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer}
.jh-check input{cursor:pointer}
`

export const COLLECT_USABILITY = `
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
/* 正常态（本窗口负责采集）**不给框也不给底**。
   它本来就长在「运行状态」那张 .jh-card 里面，再套一层边框+填充就是
   "卡片套卡片" —— 本页最多的地方叠了三层（.jh-card → .jh-lease → 内层说明）。
   只有异常态（本窗口只读）才用边框把它抬出来，因为那时它才真的需要被看见。 */
.jh-lease-ok{border-color:transparent;background:transparent}
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

/* 状态圆点：状态由它旁边的文字说清，圆点只是**辅助**（不让颜色单独承载信息）。
   颜色用 --jh-*-fg（深色混色变体）而**不是** state-*-primary：
   后者当底色时与页面/卡片背景的对比度只有 2.0–2.2:1，而 WCAG 1.4.11 对
   "承载意义的非文本图形"要求 3:1 —— 小圆点尤其容易在这种检查上被忽视。
   混色变体实测：成功 5.3:1 / 警告 5.9:1 / 危险 9.8:1（浅色主题）。
   ── 第六轮：它原来服务的是「平台明细」那条 .jh-status-list（已随该列表一起删除：
   平台状态现在用标准徽标表达）。列表没了，圆点留下 —— 采集页顶部工具条的
   调度状态指示器在用（圆点 + "定时运行中/已暂停"）。 */
.jh-status-dot{flex:none;width:8px;height:8px;border-radius:50%;
  background:var(--dsw-alias-label-tertiary)}
.jh-status-dot-on{background:var(--jh-ok-fg)}
.jh-status-dot-warn{background:var(--jh-warn-fg)}
.jh-status-dot-bad{background:var(--jh-error-fg)}
`

export const PLAN_EDITOR_MODAL = `
/* ── 采集方案弹窗（第六轮：分步 + 表格化）────────────────────────────
   这一整块只服务「新增/编辑采集方案」弹窗，放一起是为了下次改它不用在
   1000 行 CSS 里翻。针对评审的三条结构改动：
     ① .jh-steps      —— 分步条，取代"一个弹窗无限往下滚"；
     ② .jh-table-plan —— 平台表，取代"上面勾一遍平台、下面再逐平台填一遍页数"；
     ③ .jh-affix      —— 后缀按钮，取代"输入框旁边漂着一个按钮"。
   折叠开关（.jh-plan-toggle / .jh-plan-panel）沿岗位库那一套写法，
   但**另起类名**：通用名在这个仓库里已经撞过一次（见 .jh-jobs-filters 那段注释）。
   ⚠️ 注释里一律不写反引号 —— 这段 CSS 是模板字符串，反引号会把字符串截断
   （OPTIMIZATION-PLAN.md §1.3 第 2 条，本项目已为此踩过三次）。*/
.jh-steps{display:flex;align-items:center;gap:2px;flex-wrap:wrap;margin:0 0 12px}
.jh-step{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;
  padding:4px 10px;border-radius:999px;cursor:pointer;border:1px solid transparent;
  background:transparent;color:var(--dsw-alias-label-secondary)}
.jh-step:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.jh-step:disabled{cursor:default;opacity:.5}
.jh-step-no{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:16px;height:16px;border-radius:50%;font-size:10.5px;font-weight:700;
  background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}
.jh-step-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);
  font-weight:600}
.jh-step-on .jh-step-no{background:var(--dsw-alias-brand-primary);
  color:var(--dsw-alias-label-primary-foreground)}
.jh-step-sep{color:var(--dsw-alias-border-l4);font-size:11px;flex:none}
/* 每步至少占这么高：否则从"字段多"的第 1 步切到"字段少"的第 3 步时，
   弹窗会突然缩一截，底栏跟着跳 —— 而底栏刚刚才被要求吸底。 */
.jh-step-body{min-height:150px}

/* 折叠开关：与岗位库「高级筛选」同一套语法（一行小字 + 前置指示符） */
.jh-plan-toggle{display:flex;align-items:center;gap:6px;align-self:flex-start;
  padding:2px 0;border:0;background:transparent;cursor:pointer;text-align:left;font:inherit}
.jh-plan-caret{color:var(--jh-muted-fg);font-size:10px;line-height:1;flex:0 0 auto}
.jh-plan-toggle-text{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.jh-plan-toggle:hover .jh-plan-toggle-text{color:var(--dsw-alias-label-primary)}
.jh-plan-panel{display:flex;flex-direction:column;gap:8px;margin-top:6px}
/* ⚠️ 必须显式写：.jh-plan-panel 的 display:flex 会盖掉 UA 样式表里的 [hidden]，
   少了这条，折叠区根本收不起来（.jh-jobs-filter-panel 为同一个原因写过一遍）。 */
.jh-plan-panel[hidden]{display:none}

/* 后缀按钮：与输入框拼成**一个**控件（评审："按钮与输入框对齐脱节"）。
   输入框留下右边框当分隔线，按钮去掉左边框与左圆角。 */
.jh-affix{display:flex;align-items:stretch;width:100%}
.jh-affix>.jh-input{flex:1 1 auto;min-width:0;border-top-right-radius:0;
  border-bottom-right-radius:0}
.jh-affix-btn{flex:none;margin:0;border-left:0;white-space:nowrap;
  border-top-left-radius:0;border-bottom-left-radius:0}

/* 平台表：勾选 / 平台 / 状态 / 页数上限 / 限制。
   列宽策略抄 .jh-table-matrix：非末列收缩到内容宽，"限制"列吃掉剩余 ——
   否则"页数上限"会被拉成一大片空白，而真正要看的那段说明被挤窄。 */
.jh-table-plan{min-width:560px}
.jh-table-plan th:not(:last-child),.jh-table-plan td:not(:last-child){width:1%;white-space:nowrap}
.jh-table-plan td.jh-col-check,.jh-table-plan th.jh-col-check{text-align:center;padding-right:0}
/* 表格里的数字框不能用 .jh-input 的 width:100%（会把"限制"列顶没） */
.jh-pages-input{width:72px;padding:4px 6px;text-align:right;
  font-variant-numeric:tabular-nums}
/* 表格工具条：全选 / 计数在左，批量设置在右 —— 与「已勾选的行」在视觉上贴在一起 */
.jh-batch{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px}
.jh-batch .jh-input{width:72px;padding:4px 6px;text-align:right;
  font-variant-numeric:tabular-nums}

/* 调度：时段与运行日**同一行**（评审："保持与时间段选择器同一行对齐"）。
   flex-wrap 保证窄屏/弹出式键盘下逐项换行，而不是把某个控件压扁。 */
.jh-schedule-row{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.jh-schedule-row .jh-field{margin:0}
.jh-schedule-row .jh-timerange{margin:0}

/* 卡片内的警告 Banner（把"连续失败 N 次"这类核心风险抬出来）。
   ── 用**左侧色条**而不是填充底色：它长在 .jh-plan-card 里面，而那张卡自己
   已经有边框和背景，再叠一块实心色就是"卡片套卡片套色块"（三层边界，
   每层的视觉落点都被重置一次）。
   左边框取 currentColor，颜色仍然只由下面两条的 color 决定 —— 加一个色调
   不必同时改两处，也不会出现"底色是黄、文字是红"的不一致。 */
.jh-banner{display:flex;flex-direction:column;gap:2px;margin-top:8px;
  padding:2px 0 2px 10px;border-left:3px solid currentColor;
  font-size:12.5px;line-height:1.6}
.jh-banner-title{font-weight:600}
.jh-banner-warn{color:var(--jh-warn-fg)}
.jh-banner-error{color:var(--jh-error-fg)}

/* 方案卡片：明确边框，与卡片背景拉开层次。
   ── 去掉了原来那层 box-shadow:0 1px 3px rgba(0,0,0,.07)：它压在
   .jh-card 的背景上，浅色主题里几乎看不出，深色主题里完全消失，
   而它带来的"这是卡片里的卡片"那层暗示却是实实在在的 —— 留边框就够。 */
.jh-plan-card{padding:11px 13px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3);
  background:var(--dsw-alias-bg-layer-1);font-size:12.5px}
.jh-plan-name{font-size:13.5px}

/* 「这个条件当前平台用不了」那一行：说明文字可以很长（disabledReason 里带着
   每个平台自己写的理由），所以让它在左边**换行**，移除按钮留在右边不被挤走。
   长句不换行会撑破弹窗宽度，而这三个字（移除这个条件）是这一行唯一的出口。 */
.jh-dim-blocked{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.jh-dim-blocked>span{min-width:0;overflow-wrap:anywhere}
.jh-dim-blocked>.jh-btn{flex:0 0 auto}

/* 平台单选（一个方案一个平台）：一行一个平台，整行可点。
   用 <label> 包住 radio 让整行成为点击目标 —— 只点那个小圆点太考验耐心，
   而这一屏的主任务就是"选一个平台"。选中行给左侧色条 + 边框加深，
   与卡片里的警告 banner 用同一套"左侧色条"语言（不叠实心底色）。 */
.jh-platform-list{display:flex;flex-direction:column;gap:6px}
.jh-platform-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  padding:9px 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);cursor:pointer}
.jh-platform-row:hover{border-color:var(--dsw-alias-border-l3)}
.jh-platform-row-on{border-left:3px solid var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary)}
.jh-platform-name{display:inline-flex;align-items:center;gap:4px;font-weight:600}

/* 干跑预览（方案表单里的「各平台实际会请求什么」）：一个平台一块。
   URL 常常很长（带一串 query），所以让它**换行**而不是撑破弹窗宽度 ——
   撑破之后右侧会被裁掉，而右边的参数表恰恰是这一块的重点。 */
.jh-preview{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:9px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}
.jh-preview-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.jh-preview-url code{font-size:11.5px;overflow-wrap:anywhere;word-break:break-all;
  color:var(--dsw-alias-label-secondary)}

/* 按钮权重：危险 / 警示。主操作复用已有的 .jh-btn-primary。
   颜色一律走主题变量（§5.3），不写死 red。 */
/* 危险操作：**实底**。
   注意底色用的是 --jh-error-fg（语义色与 label-primary 混出的深色变体），不是主题的
   state-error-primary —— 实测后者配白字恰好 **4.4996:1**，比 AA 的 4.5 差一点点，
   属于"看着没问题、量了就是不达标"。换成混色后是 9.79:1，视觉上仍是明确的红。 */
`

export const RUNS_TABLE = `
/* 小屏策略：**有意的横向滚动**（quality-gates §5 允许，条件是保留行身份与主操作）。
   表格给一个 min-width 让列不被压成一条；容器 overflow-x:auto 承担滚动。 */
.jh-table-scroll{overflow-x:auto;overscroll-behavior-x:contain}
/* 运行表比以前宽了（第六轮补了 平台 / 命中 / 隔离 / 耗时 四列）：
   下限定在 720px，窄屏下宁可横向滚动，也别把列压到读不出来
   —— 第一列粘住，滚动时仍然认得出这是哪一行。 */
.jh-table-runs{min-width:720px}
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
`

export const PLATFORM_MATRIX = `
/* ── 平台总览矩阵（批次 5）────────────────────────────────────────────
   与「最近运行」同一套列宽策略：非最后一列收缩到内容宽，最后一列吃掉剩余；
   第一列粘住，"横向滚动时仍认得出这是哪一行"。 */
.jh-table-matrix{min-width:640px}
.jh-table-matrix th:not(:last-child),.jh-table-matrix td:not(:last-child){width:1%;white-space:nowrap}
.jh-table-matrix th.jh-col-sticky,.jh-table-matrix td.jh-col-sticky{
  position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1)}
/* "今天能跑"那一格：长原因截断显示，全文进 title。
   为什么不做一套短标签 —— 那会是**第二份文案**，迟早与 SKIP_REASON_LABEL 漂移，
   用户就在矩阵与别处读到两种说法。截断 + 悬停是同一份文案的两种呈现。 */
.jh-clip{display:inline-block;max-width:18em;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;vertical-align:bottom}
`
