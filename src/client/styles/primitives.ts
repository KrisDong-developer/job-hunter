/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const SCREEN = `
/* ── 屏 ───────────────────────────────────────────────────────────── */
.jh-screen{padding:16px 18px;max-width:1000px}
.jh-card{max-width:1000px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;
  background:var(--dsw-alias-bg-layer-1);padding:14px 16px;margin:0 0 12px}
.jh-card-tight{padding:12px 14px;margin:14px 0}
`

export const CARD_TITLE = `
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
`

export const CONTROLS = `
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
/* 用 a 当按钮（导出的下载链接）：去掉链接下划线，否则"按钮上带下划线"看着像没做完 */
a.jh-btn{display:inline-block;text-decoration:none;text-align:center}
/* 批量打招呼弹窗里的正文编辑框：它是主内容（用户要逐条读一遍再发），所以给它整行宽度与可读行高 */
.jh-greeting-edit{width:100%;margin:4px 0 2px;resize:vertical;font:inherit;line-height:1.5;box-sizing:border-box}
/* 批量工具条：与"已勾选的行"贴在一起（同 plan-editor 的表格工具条） */
.jh-picked{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 8px;
  padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px}
/* 岗位行前的勾选框：单独一列，不与"点开详情"抢点击区域。
   ── 第四轮修复（审核 P2-11）：它原先是个**不包 label 的裸 input**，命中区就是控件
   自身（实测约 13×13px），又和相邻的卡片按钮只隔 8px —— 触屏上很容易点成"打开详情"，
   而且低于 WCAG 2.2 AA 2.5.8 的 24×24。现在包成 label（整块都能勾）、控件提到 18px、
   四周留 4–5px 内边距，命中区约 26×26；更宽的目标在下面那组容器查询里给触屏档。 */
.jh-job-pick{display:flex;align-items:center;justify-content:center;align-self:flex-start;
  margin-top:1px;padding:4px 5px;border-radius:6px;cursor:pointer}
.jh-job-pick:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-job-pick input{width:18px;height:18px;margin:0;cursor:pointer}
/* 高危动作的确认文案（宿主 renderApproval 给的多行文本）。
   必须原样保留换行：那些行各是一件事（平台/岗位/用了哪版简历/同时会发生什么），
   折成一坨之后用户就没法逐行核对了。 */
.jh-approval{white-space:pre-wrap;margin:0;font:inherit;font-size:13px;line-height:1.6;
  padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;
  background:var(--dsw-alias-interactive-bg-hover);overflow-x:auto}
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
/* 图标按钮：命中区有下限。
   ── 原来 padding:2px 6px + font-size:18px + line-height:1 = **22×22px**，
   WCAG 2.5.8（AA）要求 24×24。这个类被每个弹窗的关闭键与反馈条关闭键共用，
   是整个界面里最常被点、又最容易被点歪的两个控件之一。
   min-* 只在内容小于 24px 时起作用，所以不会把本来就大的图标按钮撑开。 */
.jh-icon-btn{display:inline-flex;align-items:center;justify-content:center;
  min-width:24px;min-height:24px;
  border:0;background:transparent;cursor:pointer;font-size:18px;line-height:1;
  padding:2px 6px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
.jh-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}

/* ── 键盘聚焦环（第四轮修复，审核 P3）───────────────────────────────
   输入类控件一直有聚焦样式（见 .jh-input），但这一批**自绘按钮**此前一处都没有：
   chip / 分页 / 岗位卡片 / 行内动作 / 折叠开关 / 图标按钮 / 标签页全靠 UA 默认环 ——
   形状与可见度不由我们控制，深浅两套主题下也不统一。
   这里统一成与输入框同一套语言：2px 主题色描边 + 2px 偏移（不占布局、不引起重排）。
   注意只覆盖真正可聚焦的元素，不给装饰性的 span 加。 */
.jh-btn:focus-visible,.jh-chip:focus-visible,.jh-pg:focus-visible,.jh-job:focus-visible,
.jh-job-qk:focus-visible,.jh-dedup-toggle:focus-visible,.jh-jobs-filter-toggle:focus-visible,
.jh-icon-btn:focus-visible,.jh-link:focus-visible,.jh-tab:focus-visible,.jh-seg:focus-visible,
.jh-err-chip:focus-visible,.jh-notice-close:focus-visible{
  outline:2px solid var(--dsw-alias-link);outline-offset:2px}

.jh-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
.jh-chip{padding:3px 9px;font-size:12px;line-height:18px;border-radius:999px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);
  transition:border-color .12s,background .12s}
.jh-chip:hover{border-color:var(--dsw-alias-border-l4)}
.jh-chip-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);
  background:var(--dsw-alias-interactive-bg-active)}
/* 负向过滤（屏蔽标注）与正向筛选**外观必须不同**：它们的作用方向相反。
   正向 chips 是"我要这些"，这里做成"我要躲开这些"——浅红底 + 禁止图标 + 红色文字，
   选中后整块变实心红：一眼能看出"我屏蔽了几个坑"。
   配色沿用本文件已经验证过的组合：--jh-error-bg（9% 混色）配 --jh-error-fg（深色变体），
   选中态是 --jh-error-fg 实底配 label-primary-foreground（与 .jh-file-pdf 同一配方）。 */
.jh-chip-neg{display:inline-flex;align-items:center;gap:4px;
  border-color:transparent;background:var(--jh-error-bg);color:var(--jh-error-fg)}
/* 图标用 ✕ 而不是 ⊘：✕ 在本项目里已经用着（岗位卡片的「划掉」），
   字形一定有；⊘ 在部分中文字体里会退回豆腐块。语义也一致 —— 两个都是"不要它"。 */
.jh-chip-neg::before{content:'✕';font-size:11px;line-height:1;flex:none}
.jh-chip-neg:hover{border-color:var(--dsw-alias-state-error-secondary)}
.jh-chip-neg-on{background:var(--jh-error-fg);border-color:transparent;
  color:var(--dsw-alias-label-primary-foreground)}
.jh-filters .jh-input,.jh-filters .jh-select{width:auto}
/* 关键词吃掉剩余宽度：筛选区右侧不再空一大片 */
.jh-input-grow{flex:1 1 220px;min-width:180px}
.jh-input-sm{width:130px}
`

export const TAG_AND_STATE = `
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
/* ── 标签容器（第四轮修复，审核 P1-1）────────────────────────────────
   .jh-tags 这个类名在岗位库与岗位详情里都用了，但**全仓库没有定义** ——
   少了它，标签就是一堆相邻的 inline-block：.jh-tag 自己没有外边距，容器也不给
   gap，相邻标签的底色直接贴在一起，整排读起来是一条连续灰条（圆角只在两端），
   "分类标记"的语义就丢了。这里补上唯一一条定义（不再各自复制）。 */
.jh-tags{display:flex;flex-wrap:wrap;gap:5px}
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
`

export const LINK = `
/* 唯一的 .jh-link 定义（原先这里和上面各写了一份，上面那份被这一份覆盖 —— 已合并）。
   颜色走 --jh-muted-fg？不：链接要看得出来是链接，所以走 --jh-business-fg 并带下划线。
   ── 第二轮修复：合并时**不能**用 --dsw-alias-link —— 它在浅色下是 #4176e6，
   压在白卡片上只有 4.23:1，不到正文要求的 4.5:1（.jh-funnel-count 正是踩了这个）。 */
.jh-link{border:0;background:transparent;cursor:pointer;font:inherit;font-size:12.5px;
  color:var(--jh-business-fg);text-decoration:underline;padding:0}
.jh-link:hover{text-decoration:underline}
`

export const MODAL_SEG_TIMERANGE = `
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
  background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 40px var(--jh-shadow-ink);
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

/* ── 可展开的说明（FieldHint）──────────────────────────────────────────
   问号现在是一个真正的 <button>，折叠时它在版面上与改之前**逐像素一致**
   （说明文字落在 .jh-sr-only 里，不占位），点开才把说明摊在下面。
   三件事必须显式写，否则 <button> 会带上 UA 自己的盒子模型：
     · font-family:inherit —— UA 给 button 的是系统 UI 字体，不是继承的；
     · padding:0          —— UA 给 button 的是 1px 6px；
     · box-sizing:content-box —— 浏览器给 button 的默认值是 border-box，
       而原来那个 span 是 content-box（全仓库没有全局重置）。不改回来的话
       .jh-field-hint 的 14px 会连边框一起算，圆点整体缩水 2px。
   vertical-align 挂在**外层这层**上：内层换成 button 之后，参与行内对齐的
   是外层这个 span，而不是里面那个圆点（inline 变体常出现在正文段落里）。 */
.jh-hint-wrap{position:relative;vertical-align:middle}
.jh-hint-wrap>.jh-field-hint,.jh-hint-wrap>.jh-hint{
  font-family:inherit;padding:0;cursor:pointer;position:relative}
/* 触达尺寸（WCAG 2.2 AA 2.5.8 要求 24×24）：这两个问号的实际尺寸是 16×16 / 15×15
   （content-box 的 14px + 1px 边框），却是全项目**最高频**的点击目标 —— 设置页几乎
   每一行控件都挂着它。做法：视觉圆点逐像素不动，用伪元素把命中区向外扩 5px
   （16 → 26）。不用 padding 撑：那会把每一行控件的高度都改掉，而本文件上面承诺过
   "折叠时与改之前逐像素一致"。 */
.jh-hint-wrap>.jh-field-hint::after,.jh-hint-wrap>.jh-hint::after{
  content:'';position:absolute;inset:-5px;border-radius:50%}
.jh-hint-wrap>.jh-field-hint{box-sizing:content-box}
/* inline 变体（.jh-hint，定义在 job-detail.ts）没有自己的边框，
   不加这条就会露出 <button> 的 UA 边框。 */
.jh-hint-wrap>.jh-hint{border:0}
.jh-hint-wrap>.jh-field-hint:focus-visible,.jh-hint-wrap>.jh-hint:focus-visible{
  outline:2px solid var(--dsw-alias-link);outline-offset:1px}
/* 展开后的说明：就地占一行。不用绝对定位 —— 这些问号多在弹窗里，
   而 .jh-modal-body 是 overflow:auto，浮层会被裁掉。 */
.jh-hint-text{display:block;margin:5px 0 0;padding:0 2px;max-width:48ch;
  font-size:12px;line-height:1.6;text-align:left;color:var(--dsw-alias-label-secondary)}

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
`

export const DESTRUCTIVE_BUTTONS = `
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
   现在统一成与 .jh-tag 同一档的小圆角矩形（4px）。
   ── 第四轮修复：统一之后它是 **19px 高**（line-height 17px + 上下各 1px 边框），
   而它是**失败详情的唯一入口** —— 原因、排查步骤、原始 trace 全在那扇门后面。
   WCAG 2.5.8（AA）要求 24×24，所以补 min-height（横向由文字长度天然超过 24）。 */
.jh-err-chip{display:inline-flex;align-items:center;gap:5px;cursor:pointer;font:inherit;
  font-size:11.5px;line-height:17px;min-height:24px;padding:0 8px;border-radius:4px;
  border:1px solid var(--dsw-alias-state-error-secondary);
  background:var(--jh-error-bg);color:var(--jh-error-fg)}
.jh-err-chip:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)}
.jh-err-chip-short{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:9em}
.jh-err-chip-more{font-size:10.5px;opacity:.75;text-decoration:underline;flex:none}
/* 警示图标：形状本身也表意（不只靠颜色）。 */
.jh-err-chip-icon{flex:none;font-size:10px;line-height:1}
`

export const QUALITY_GATES = `
/* ── quality-gates 收尾：表格状态 / 小屏策略 / 空态 / 加载态 / 反馈可关闭 ── */

/* Table 的必查状态里有 row hover —— 原来没有，扫行时会丢失"鼠标在哪一行"的反馈 */
.jh-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}
/* 但行 hover 会把底色铺到 .jh-muted（label-secondary）的文字下面，而本仓库的不变式是
   "secondary 只能压在 bg-base / bg-layer-1 这类卡片表面上，不要压在 bg-overlay /
   interactive-* 上"（见 tokens.ts 的实测：bg-overlay 上只有 3.85:1）——
   行 hover 用的正是 interactive-bg-hover。
   做法：悬停时把次要说明提到 label-primary。这个组合与本项目所有可悬停控件
   （.jh-btn / .jh-icon-btn / .jh-sibling）用的是同一套，不再让文字压在没量过的底色上。 */
.jh-table tbody tr:hover .jh-muted{color:var(--dsw-alias-label-primary)}

/* ── 动效降级（第四轮修复，审核 P3）────────────────────────────────
   全项目此前没有任何 prefers-reduced-motion 分支。这里的过渡都是 120–140ms 的颜色 /
   边框 / 位移（没有视差、没有自动播放），所以降级做法就是把时长压掉，而不是换一套动效。
   作用域**必须**限定在 .jh-root 之内：样式是注入到 document 的，写裸 * 会误伤宿主界面。 */
@media (prefers-reduced-motion: reduce){
  .jh-root *,.jh-root *::before,.jh-root *::after{
    transition-duration:.01ms !important;animation-duration:.01ms !important}}
`

export const EMPTY_AND_FEEDBACK = `
/* 空态：原因 + 下一步（rules §4.3 / quality-gates §2 "空数据时给出原因和下一步"）*/
.jh-empty{display:flex;flex-direction:column;gap:4px;padding:12px 0}

/* 加载态：占位行保持布局稳定（不要把"正在读取"显示成"没有数据"）*/
.jh-skeleton-row{color:var(--dsw-alias-label-secondary);text-align:center}

/* 反馈条：可关闭 */
.jh-feedback{display:flex;align-items:flex-start;gap:8px}
.jh-feedback p{flex:1 1 auto;min-width:0}
.jh-feedback-close{flex:0 0 auto}
`

export const SWITCH_AND_NUMBER = `
/* Switch 开关。
   ── 为什么不用 .jh-check 那套复选框：设置页的这 8 个开关都是**即时生效**的
   开关（不是"选了再提交"的表单项），拨杆形态表达"现在就是开着的"更直接。
   "开"用 brand-primary（近黑 / 深色下是浅色）而**不是**语义绿：
   打开 L4 投递意味着"允许工具自动投递"，那是权限的开启，不是"变好了"——
   绿色会读成安全。
   ── 无障碍：真 checkbox（role=switch）在下面，视觉拨杆 aria-hidden；
   键盘聚焦走 :focus-visible 的主题色光环，与 .jh-input 同一套语法。 */
.jh-switch{position:relative;display:inline-flex;flex:none;border-radius:999px}
.jh-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.jh-switch input:disabled{cursor:default}
.jh-switch-track{position:relative;box-sizing:border-box;flex:none;width:34px;height:20px;
  border-radius:999px;background:var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l3);
  transition:background .14s,border-color .14s}
.jh-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
  background:var(--dsw-alias-label-secondary);transition:transform .14s,background .14s}
.jh-switch input:checked+.jh-switch-track{background:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary)}
.jh-switch input:checked+.jh-switch-track .jh-switch-thumb{transform:translate(14px,0);
  background:var(--dsw-alias-label-primary-foreground)}
.jh-switch input:focus-visible+.jh-switch-track{box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
.jh-switch input:disabled+.jh-switch-track{opacity:.45}

/* 数字输入框（带单位后缀）。
   不用 .jh-input 是因为单位会站在输入框外面：这里把描边给外壳、输入框本体透明，
   于是"20 分钟"整体是一个控件。聚焦光环与 .jh-input 保持一致。 */
.jh-number{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;width:118px;
  padding:0 9px;border-radius:8px;background:var(--dsw-alias-bg-base);
  border:1px solid var(--dsw-alias-border-l3)}
.jh-number:hover{border-color:var(--dsw-alias-border-l4)}
.jh-number:focus-within{border-color:var(--dsw-alias-link);
  box-shadow:0 0 0 3px var(--dsw-alias-state-business-tertiary)}
.jh-number input{flex:1 1 auto;min-width:0;width:100%;box-sizing:border-box;border:0;
  background:transparent;font:inherit;font-size:13px;padding:6px 0;
  color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.jh-number input:focus{outline:none}
/* 原生上下箭头：13px 的密集表单里太挤，且各平台外观不一致 */
.jh-number input::-webkit-outer-spin-button,
.jh-number input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.jh-number-unit{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
`
