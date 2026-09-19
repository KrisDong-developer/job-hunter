/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const FUNNEL = `
/* ── 看板漏斗：连续梯形（第七轮重做）─────────────────────────────────
   改前它是"一行一根 8px 横条"，实测读起来像"文本 + 破折号"，看不出漏斗。
   改后每层的形状高度是整行（34px），上下各留 1px 缝：
   缝让相邻两层看得出边界，而左右边缘由**同一组宽度**算出来（下层上边缘 = 上层下边缘），
   所以七层拼起来是一条连续的漏斗。宽度是数据驱动的几何量，走 inline style。 */
.jh-funnel-chart{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;font-size:12px}
.jh-funnel-block{display:flex;flex-direction:column}
/* 总体分段标题：接触链路与投递链路分开写清楚 */
.jh-funnel-seg{font-size:11px;font-weight:600;letter-spacing:.06em;margin:10px 0 4px;
  color:var(--dsw-alias-label-secondary)}
.jh-funnel-block:first-child .jh-funnel-seg{margin-top:0}
/* 允许换行是给窄面板的下限：形状最小 140px，放不下就整行下移（所有行同时换，形状不会错位） */
.jh-funnel-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 9px}
.jh-funnel-label{flex:0 0 84px;color:var(--dsw-alias-label-secondary)}
.jh-funnel-track{position:relative;flex:1 1 140px;min-width:0;height:34px}
.jh-funnel-fill{position:absolute;left:0;right:0;top:1px;bottom:1px;
  background:var(--dsw-alias-brand-primary);opacity:.8}
/* 投递阶段换一档色：一眼分得清哪些是"我做的动作"、哪些是招聘方的回应 */
.jh-funnel-fill-apply{background:var(--dsw-alias-button-info-fill);opacity:1}
/* min-height:24px 是 WCAG 2.2 的触达下限（审核 B-8 记过它原来只有 40×20） */
.jh-funnel-count{flex:0 0 44px;min-height:24px;text-align:right;font-variant-numeric:tabular-nums;
  border:0;background:transparent;cursor:pointer;font:inherit;font-weight:600;
  color:var(--jh-business-fg);text-decoration:underline;padding:0}
.jh-funnel-count:hover{color:var(--dsw-alias-label-primary)}
.jh-funnel-rate{flex:0 0 48px;text-align:right;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-secondary)}
.jh-funnel-drop{flex:0 0 52px;text-align:right;font-size:11px;color:var(--jh-muted-fg)}
`

export const BOARD_FILTERS = `
/* ── 看板：全局筛选区（§13 U8，第七轮栅格化）─────────────────────────
   一处筛选，四个模块一起重算 —— 所以它必须长得像"整页的开关"：
   独立面板卡 + **等宽等距的栅格**（3 列，窄面板降为 2 列 / 1 列），
   动作（重置 / 查询）单独一行靠右，字段不会因为按钮出现或消失而位移。
   判断"窄不窄"的是**面板**宽度（container query），与岗位库两栏同一个理由。 */
.jh-filter-panel{container-type:inline-size}
.jh-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px}
.jh-filter-grid .jh-field{margin:0}
/* 栅格里的控件一律填满格子：日期/搜索/下拉的宽度因此天然一致 */
.jh-filter-grid .jh-input,.jh-filter-grid .jh-select{width:100%;max-width:none}
/* 动作行单独一行、靠右。类名刻意**不叫** .jh-filter-actions ——
   那个名字已经被岗位库的高级筛选块占着（那边是标题行内 margin-left:auto 右推），
   两处意图不同，复用一个类名必然互相改坏（本项目已在这类重复规则上踩过坑）。 */
.jh-filter-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px}
@container (max-width: 620px){
  .jh-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@container (max-width: 400px){
  .jh-filter-grid{grid-template-columns:minmax(0,1fr)}
}

.jh-table{border-collapse:collapse;width:100%;font-size:12px}
.jh-table th,.jh-table td{border-bottom:1px solid var(--dsw-alias-border-l2);padding:4px 6px;text-align:left}
.jh-table th{color:var(--dsw-alias-label-secondary);font-weight:500}
`

export const SALARY_BOX = `
/* ── 批次 F：薪资箱线图（横向，P25–P75 高亮）────────────────────────
   用**横向**画：薪资回答"多少"而不是"什么时候"，横着比竖着好读，
   也和上面的漏斗同一套视觉语言。高亮的是箱体（P25–P75），
   两端的须是最小/最大值 —— 刻意不做离群点剔除，剔了会把真实的高薪岗删掉。
   container-type 是给下面的窄面板降级用的（判断"窄不窄"的是**面板**宽度）。 */
.jh-box{display:flex;flex-direction:column;gap:2px;margin:10px 0 4px;container-type:inline-size}
/* 悬浮卡片要定位在轨道上方，所以轨道外层单独承担 position:relative */
.jh-box-plot{position:relative}
.jh-box-track{position:relative;height:26px;cursor:help}
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
/* 悬停到中位数时把它变粗 —— 位置由鼠标横向位置就近判定，没有额外的命中区元素 */
.jh-box-median[data-hot="1"]{width:3px;margin-left:-0.5px}

/* 悬浮卡片：直接给分位数之差与样本构成，替代原来"图下方一段算法说明"。
   绝对定位 + pointer-events:none：它不占版面、也不会把鼠标从轨道上抢走。 */
.jh-box-tip{position:absolute;right:0;bottom:calc(100% + 8px);z-index:2;width:264px;
  box-sizing:border-box;padding:8px 10px;border-radius:9px;font-size:12px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 6px 20px var(--jh-shadow-ink);pointer-events:none}
.jh-box-tip-row{display:flex;align-items:baseline;gap:10px;margin:0;line-height:1.9;
  color:var(--dsw-alias-label-secondary)}
.jh-box-tip-row>b{margin-left:auto;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-primary)}
.jh-box-tip-row[data-hot="1"]>span,.jh-box-tip-row[data-hot="1"]>b{font-weight:700;
  color:var(--jh-business-fg)}
.jh-box-tip-note{margin:6px 0 0;padding-top:6px;font-size:11.5px;line-height:1.6;
  border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}

/* 数值轴（第七轮新增）。
   原来刻度是 justify-content:space-between 的一行字 —— P25 / 中位 / P75 被均匀铺开，
   读起来像"三点等距"，那是**假坐标**。这里每个刻度按真实数值定位（left:X%），
   并用 data-anchor 决定标签向哪边对齐，免得首尾两个标签跑出画布。 */
.jh-box-axis{position:relative;height:38px;border-top:1px solid var(--dsw-alias-border-l2)}
.jh-box-tickmark{position:absolute;top:0;width:1px;height:5px;transform:translateX(-50%);
  background:var(--dsw-alias-border-l4)}
.jh-box-ticklabel{position:absolute;top:7px;display:flex;flex-direction:column;align-items:center;
  white-space:nowrap;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.jh-box-ticklabel>i{font-style:normal;font-size:10.5px}
.jh-box-ticklabel>b{font-weight:600;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-primary)}
.jh-box-ticklabel[data-anchor="center"]{transform:translateX(-50%)}
.jh-box-ticklabel[data-anchor="start"]{transform:translateX(0);align-items:flex-start}
.jh-box-ticklabel[data-anchor="end"]{transform:translateX(-100%);align-items:flex-end}
/* 中位数是这块数据的结论，所以它的刻度是唯一带色的 */
.jh-box-ticklabel-key>b{color:var(--jh-business-fg)}
.jh-box-ticklabel[data-hot="1"]>i,.jh-box-ticklabel[data-hot="1"]>b{font-weight:700;
  color:var(--jh-business-fg)}
/* 窄面板（≤400px）下三个刻度必然叠字 —— 实测 320px 时轨道只有 141px，
   而"P25 12000"这样的标签本身就有 34px 宽，靠"位置差 ≥9%"这条规则拦不住。
   这时只留中位数 —— 一个数字都没丢：五数概括**常驻**在图下面那一行
   .jh-metric-row 里（它不受容器查询影响，也是键盘/触屏用户唯一的读数入口）。 */
@container (max-width: 400px){
  .jh-box-ticklabel:not(.jh-box-ticklabel-key){display:none}
}
.jh-baseline{margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}
`

export const BOARD_V2 = `
/* ── 第七轮（2026-09-18）：数据看板按"信息噪音 / 图形化 / 视觉层级"重排 ──
   这一轮修的是**可读性**（§7 修的是可达性）。三件事：
     ① 筛选区栅格化 + 草稿态：6 个字段一样宽、一样间距，动作独立成行（见上面的
        .jh-filter-grid）；
     ② 每个数据模块一张**面板卡**：标题 16px、右上角挂样本徽章，长口径说明收进
        「口径说明」展开项或问号 —— 首屏只留结论；
     ③ 表格：数值列右对齐、表头有底色、行距加大、空值统一成灰色破折号。

   两个刻意**没有**照办的取值（都有实测理由，不是漏做）：
     * 圆角仍是 10px（建议 8px）：全项目 10 个屏的卡片都是 10px，单给看板换成 8px
       只会让"这一屏的卡片长得不一样"，不带来任何收益；
     * 说明文字走 --jh-muted-fg / label-secondary（建议固定 #8C8C8C）：
       #8C8C8C 压在白底上约 3.2:1，达不到正文要求的 4.5:1，而且 §5.3 要求颜色
       一律走主题变量 —— 硬编码的灰在深色主题下还会直接失效。 */

.jh-screen-title{font-size:18px;font-weight:600;margin:0}

/* 面板卡：.jh-card 已经给了描边 / 圆角 / 底色，这里只补一层微阴影 ——
   白底卡片画在白页面上时，阴影是唯一能说明"这是一块独立内容"的东西。
   走 --jh-shadow-card（与弹窗/悬浮卡的 --jh-shadow-ink 是两个角色，见 tokens.ts）。 */
.jh-panel{box-shadow:0 1px 2px var(--jh-shadow-card)}
.jh-panel-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}
.jh-panel-title{font-size:16px;font-weight:600;margin:0}
/* 面板内的二级标题：比正文（13px）略大、比面板标题（16px）小两档 */
.jh-panel-sub{font-size:13px;font-weight:600;margin:14px 0 6px;
  color:var(--dsw-alias-label-primary)}
/* 面板底部一行：左边放必须常驻的读数（样本量），右边放按需展开的依据 */
.jh-panel-foot{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:10px}
.jh-details-inline{flex:none;margin-top:0}
.jh-details-inline>p{margin:6px 0 0;max-width:640px;text-align:left}

/* 表格：表头有底色、单元格内边距加大、数值列右对齐。
   选择器写成 .jh-table.jh-table-board（两个类）而不是只写 .jh-table-board ——
   基础规则 .jh-table td{text-align:left} 与它是同一档特异性，
   靠文件先后决胜负太脆弱（本项目为此踩过一次：.jh-num 曾被 .jh-table td 压过去）。 */
.jh-table.jh-table-board th,.jh-table.jh-table-board td{padding:7px 10px;vertical-align:middle}
.jh-table.jh-table-board th{background:var(--dsw-alias-markdown-tag);font-weight:600;
  color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l3)}
.jh-table.jh-table-board td.jh-num,.jh-table.jh-table-board th.jh-num{text-align:right}
/* 行内标签（"样本少" / "回复率最高"）跟在分组名后面，给一点间距 */
.jh-table.jh-table-board td .jh-tag{margin-left:8px}

/* "表现最好的一行"：浅绿底。
   用 10% 混色而不是实色 —— 它要能被一眼扫到，但不能盖过表头，
   也不能让单元格里的正文掉出对比度。放在文件末尾是有意的：
   .jh-table tbody tr:hover 与它是同一档特异性，靠顺序决胜负。 */
.jh-table tbody tr.jh-row-best{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)}
.jh-table tbody tr.jh-row-best:hover{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent)}

/* 空值：全项目统一是同一个字符（审核 §9.1），这里只给它一个"明确的空"的灰 ——
   深灰会被读成"一个很小的数字"，浅灰才是"这里没有数据"。 */
.jh-cell-empty{color:var(--jh-muted-fg)}

/* 徽章：面板右上角的样本量 / 表格里的判断标签。
   quiet = 样本够（安静到不该抢注意力），warn = 样本不足（浅黄底 + 深色字，
   不是"饱和色底配白字"—— 那个配方本项目已经因为 2.15:1 修过一次）。 */
.jh-tag-quiet{background:transparent;border:1px dashed var(--dsw-alias-border-l3);
  color:var(--dsw-alias-label-secondary);font-weight:400}
.jh-tag-warn{background:var(--jh-warn-bg);color:var(--jh-warn-fg)}
.jh-tag-best{background:var(--jh-ok-bg);color:var(--jh-ok-fg)}

/* 薪资五数概括：一排行内指标，紧跟箱线图。数值加粗、中位数带色 ——
   "主核心指标要高亮"的具体落法（也是这一块唯一需要一眼记住的数）。
   它是**图之外的常驻读数**：极值在图上根本没有刻度，窄面板还会把刻度收掉，
   所以这一行不是装饰，是键盘 / 触屏用户拿到这些数的唯一入口。 */
.jh-metric-row{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:12px}
.jh-metric{display:flex;flex-direction:column;gap:1px;min-width:64px}
.jh-metric>span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.jh-metric>b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.jh-metric-key>b{color:var(--jh-business-fg)}
`
