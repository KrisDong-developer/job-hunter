/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const JOBS_FILTERS = `
/* ── 岗位库筛选区：一条常规工具条 + 一个「高级筛选」折叠 ──────────────
   不带 .jh-filters 的前缀：那个类在流水线屏（薪资口径切换）里是一行横排，
   把它改成纵排会连带改坏那边 —— 岗位库这里另起一个类名。
   ── 2026-09-18 重做：上一版在这里堆了块标题、标题竖条、块间分隔线、72px 标签网格 ——
   一屏里加了一整套表单装饰，而控件本身没变多。这一版全部砍掉，只留三样东西：
   一条工具条、一行折叠开关、一个没有边框的折叠面板。分组靠**间距**就够了。
   类名一律带 jh-jobs- 前缀：通用名（jh-filter-panel 之类）会和流水线屏撞 —— 已经撞过一次。 */
.jh-jobs-filters{display:flex;flex-direction:column;gap:8px;margin:0 0 12px}
/* 常规工具条：一排输入框 / 下拉，按钮紧跟在最后一个控件后面（不推右） */
.jh-jobs-filter-line{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.jh-jobs-filters .jh-input,.jh-jobs-filters .jh-select{width:auto}
/* 宽度档位要在**同一层选择器**上重新裁决：上面那条 width:auto 是 (0,2,0)，
   比 .jh-input-md 的 (0,1,0) 高 —— 不在这里重写一遍，筛选条里的控件会全部退回
   浏览器默认宽度（看板的 .jh-filterbar .jh-input-sm 同理）。
   （原先这里还有一条 .jh-input-sm：第四轮给两个文本框加上可见标签后，
   它们改由下面的 .jh-jobs-filter-text 定宽，那条已成死规则，删掉。） */
/* 中等宽度（城市 / 状态 / 新增时间）：130px 装不下「全部城市」这类选项文字 */
.jh-jobs-filters .jh-input-md{width:150px}
/* ── 带可见标签的文本框（第四轮修复，审核 P1-4）──────────────────────
   关键词与最低月薪原先**只有 placeholder 当标签**（caption 档，白底上 2.6:1），
   而且一开始输入这段文字就消失了，用户没法回看这个框是干什么的。
   现在标签回到控件旁边：label-secondary（5.80:1），与折叠面板里那一列 76px 标签
   是同一个语言，只是这里横排 —— 工具条仍然是一条线，没有变高。 */
.jh-jobs-filter-text{display:flex;align-items:center;gap:6px;flex:1 1 220px;min-width:180px}
.jh-jobs-filter-text>span{flex:0 0 auto;font-size:12px;color:var(--dsw-alias-label-secondary);
  white-space:nowrap}
.jh-jobs-filter-text .jh-input{flex:1 1 auto;min-width:0;width:auto}
/* 最低月薪是窄字段，不参与伸展。选择器写成两个类（(0,3,0)）而不是一个 ——
   上面那条 .jh-jobs-filter-text .jh-input{width:auto} 与它是同一档特异性，
   只靠先后来裁决太脆弱（本项目为这类问题踩过一次）。 */
.jh-jobs-filter-text.jh-jobs-filter-text-narrow{flex:0 0 auto}
.jh-jobs-filter-text.jh-jobs-filter-text-narrow .jh-input{width:90px}
/* 条件改了但还没点「筛选」（第四轮修复，审核 P2-12）：
   折叠开关上的「已选 N 项」算的是**草稿**，列表头栏那句算的是**已生效**的条件 ——
   两者可以不一致，这行字把差别直接说出来，免得用户以为"已经筛过了"。 */
.jh-jobs-filter-pending{font-size:12px;font-weight:600;color:var(--jh-warn-fg)}
/* 「保存为视图」的就地输入（批次 B2）：与工具条里其它控件同高同宽档，
   150px 够写「深圳 Java 20K+」这种名字（上限 40 字由 maxLength 管）。 */
.jh-jobs-view-name{width:150px}
/* 折叠开关：只有一行小字，图标在最前面指示展开态。
   align-self 让它只占文字那点宽度 —— 整行可点的隐形大按钮会盖住下面的面板边缘。 */
.jh-jobs-filter-toggle{display:flex;align-items:center;gap:6px;align-self:flex-start;
  padding:2px 0;border:0;background:transparent;cursor:pointer;text-align:left;font:inherit}
.jh-jobs-filter-caret{color:var(--jh-muted-fg);font-size:10px;line-height:1;flex:0 0 auto}
.jh-jobs-filter-toggle-text{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.jh-jobs-filter-toggle:hover .jh-jobs-filter-toggle-text{color:var(--dsw-alias-label-primary)}
/* 折叠开关旁边那行小字。**共用名**：岗位库的「高级筛选」与设置页的用量卡片都在用它，
   所以它不跟着下面那批带 jh-jobs- 前缀的类名一起改（改了会把设置页那两处变成裸文字）。 */
.jh-filter-note{font-size:12px;color:var(--jh-muted-fg)}
/* 收起状态下有生效条件：染成品牌色。折叠的条件不能变成隐形条件 ——
   否则用户会以为"我什么都没选"，而列表确实是筛过的。 */
.jh-filter-note-on{color:var(--dsw-alias-brand-text);font-weight:600}
/* 折叠面板：**没有边框、没有底色、没有标题**，只有"标签 + 控件"两列与行距。
   76px 的标签列是按最长那个标签量出来的：「新增时间」（4 字 ≈ 48px）+ 4px + 14px 问号 = 66px。 */
.jh-jobs-filter-panel{display:flex;flex-direction:column;gap:8px}
/* ⚠️ 必须显式写：.jh-jobs-filter-panel 的 display:flex 会盖掉 UA 样式表里的 [hidden]，
   少了这条，折叠的高级筛选根本收不起来。 */
.jh-jobs-filter-panel[hidden]{display:none}
.jh-jobs-filter-row{display:flex;align-items:flex-start;gap:10px}
.jh-jobs-filter-label{flex:0 0 76px;display:inline-flex;align-items:center;gap:4px;
  padding-top:5px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
/* 控件列：chips / 下拉 / 复选框都从同一条左侧线开始 */
.jh-jobs-filter-body{flex:1 1 auto;min-width:0;display:flex;flex-wrap:wrap;gap:5px;align-items:center}
`

export const JOBS = `
/* ── U1 岗位库 ───────────────────────────────────────────────────── */
.jh-listbar{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
/* 列表头栏右侧：排序 + 分页。排序搬到这儿而不是留在筛选条里 ——
   它决定"结果怎么排"，是列表自己的事，改完当场生效。 */
.jh-listbar-right{display:flex;align-items:center;gap:12px;margin-left:auto}
.jh-sort{display:inline-flex;align-items:center;gap:6px}
.jh-sort-label{font-size:12px;color:var(--jh-muted-fg)}
.jh-sort-select{width:auto}
.jh-jobs{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* 卡片 = 选择主区域 + 右侧行内动作竖排（打招呼 / 投递简历 / 划掉）。列成一行是因为
   主按钮横贯整张卡，行内按钮不能嵌进它内部（button 不能套 button）；把它们平放在主按钮右边。 */
.jh-job-row{display:flex;align-items:stretch;gap:8px}
.jh-job-row .jh-job{flex:1 1 auto}
.jh-job-quick{display:flex;flex-direction:column;gap:6px;justify-content:center;flex:0 0 auto}
.jh-job-qk{width:34px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:transparent;color:var(--jh-muted-fg);cursor:pointer;font-size:15px;line-height:1}
.jh-job-qk:hover:not(:disabled){border-color:var(--dsw-alias-border-l4);
  background:var(--dsw-alias-interactive-bg-hover)}
.jh-job-qk:disabled{opacity:.5;cursor:default}
/* 划掉（ignored）是这一列唯一的处置态开关，选中后染红：与详情里的动作条同一套语义。
   ── 第四轮修复（审核 P1-3）：这里原先是 state-error-primary（浅色 #ec1313）——
   同一份样式在 .jh-btn-danger 的注释里早就量过"它当小字压在浅色面上只有 2.54:1"，
   只是没推广到这一处。字形与描边统一改走 --jh-error-fg（深色变体）。 */
.jh-job-qk-ign{color:var(--jh-error-fg);border-color:var(--jh-error-fg);
  background:var(--dsw-alias-interactive-bg-active)}
/* 卡片必须有边界：白底 + 4% 描边画在白页面上等于没有卡片，滚动时容易看串行。
   阴影不写死黑色（第四轮修复，审核 P2-10）：颜色一律走主题变量，这里用 label-primary
   的混色 —— 深色主题下它是浅色，阴影随之变成一层极淡的浅色边缘，仍然读作"浮起"；
   写死 rgba(0,0,0,·) 的话在深色底上会彻底消失，而悬浮与选中正是靠它表达抬升。 */
.jh-job{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;cursor:pointer;
  box-sizing:border-box;padding:12px 14px;border-radius:10px;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);
  box-shadow:0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
  color:var(--dsw-alias-label-primary);transition:border-color .12s,box-shadow .12s}
.jh-job:hover{border-color:var(--dsw-alias-border-l4);
  box-shadow:0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)}
/* 选中：加深描边 + 更实的底。
   不再用 inset 左侧色条 —— 卡片左边挂一条竖线在密集列表里很吵，
   而且和"边框"重复表达了两遍。 */
.jh-job-active{border-color:var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-interactive-bg-active);
  box-shadow:0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)}
.jh-job-main{flex:1 1 auto;min-width:0}
/* ── 标题与薪资的层级（第四轮修复，审核 P2-13）──────────────────────
   上一版标题 14.5px、薪资 15px：两个最该被扫到的字段只差 0.5px，而且**薪资更大** ——
   与同文件里"13 与 12.5 只差 0.5px，标题层级等于不存在"的判据自相矛盾。
   现在把顺序摆正并拉开一整档：标题 15px（比正文 13px 高一档，是这张卡的第一眼），
   薪资 14px/700 + 业务色（靠字重与颜色保持醒目，不再靠压过标题的字号）。 */
.jh-job-title{font-size:15px;font-weight:600;margin:0 0 3px;line-height:1.5}
.jh-job-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;
  font-size:12px;color:var(--dsw-alias-label-secondary)}
/* 薪资的颜色走 --jh-business-fg：state-business-primary 直接当文字色在白色卡片上只有
   4.23:1，而 14px/700 也够不上"大文本"门槛（需 ≥18.66px 且 ≥700）→ 必须 4.5:1。
   混色后实测浅色 4.51:1、深色 8.78:1。 */
.jh-salary{font-size:14px;font-weight:700;color:var(--jh-business-fg)}
/* 公司名是次要信息，但也不能淡到读不出：用正文色 */
.jh-job-company{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;
  color:var(--dsw-alias-label-primary)}
/* 来源（平台）与新鲜度：卡片上的第三档信息，排在标签之前、比 meta 更淡。
   ── 第四轮修复（审核 P1-2）：它原先是 label-tertiary，浅色 #81858c 配白只有 3.71:1。
   这里写的不是装饰，是"这岗多久没出现了"这种要读的判断依据，而且同文件下方的
   PAGER_CONTRAST_FIX 早就为"页码省略号"下过同样的结论 —— 只是没推广到这一条。
   统一走 --jh-muted-fg：浅色 5.22:1、深色 6.76:1。 */
.jh-job-origin{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 0;
  font-size:11.5px;color:var(--jh-muted-fg)}
/* 标签行在列表卡里的上间距（容器本身的唯一定义在 primitives 的 .jh-tags） */
.jh-job-main .jh-tags{margin-top:6px}
/* 重取期间的提示（第四轮修复，审核 P2-6）：列表不再整块消失，而是就地说明在更新 */
.jh-refreshing{font-size:12px;color:var(--jh-muted-fg)}
/* 回执行首的小标记（第四轮修复，审核 P3）：原来是 ✅/❌ emoji —— 与
   "手画 SVG 是因为字形在部分中文字体里会退回豆腐块"那套理由正好相反，
   而且各平台字形不一致。这里用它旁边那两枚 SVG（见 jobs 目录的 icons.tsx）。 */
.jh-receipt-mark{display:inline-flex;align-items:center;vertical-align:-3px;margin-right:4px}
.jh-receipt-mark svg{display:block}
`

export const JOBS_DEDUP = `
/* ── 跨平台去重（批次 4）──────────────────────────────────────────────
   徽章是**读数**不是操作（操作是卡片下面那枚「跨平台对照」开关），所以它做成一枚
   低调的描边胶囊：颜色用 label-secondary 而不是品牌色 —— 它表达的是
   "这条岗位在别处也有一份"，不是"这是重点"。 */
.jh-dedup-badge{display:inline-block;padding:0 6px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);
  font-size:10.5px;line-height:16px}
/* 行内三个动作（打招呼 / 投递简历 / 划掉）**形状完全一致**：都是 34px 方块 + 一个图标。
   这一列不随文案长短抖动，也不吃卡片宽度；动作含义由 tooltip 与 aria-label 说。
   图标是 14px 手画 SVG（见 jobs.tsx 的 IconChat / IconSend），与 15px 的 ✕ / ★ 字形
   同一档视觉重量 —— 一列里混着字形图标和 SVG 图标，靠的是尺寸对齐，不是颜色。 */
/* 三个方块共用同一套居中：字形（✕）与 SVG 的基线完全不同，交给 flex 居中才不会
   一个偏上一个偏下。 */
.jh-job-quick .jh-job-qk{display:inline-flex;align-items:center;justify-content:center}
.jh-job-quick .jh-job-qk svg{display:block}
/* 跨平台对照的开关：排在卡片**下面**（卡片自己是个按钮，里面塞不进按钮），
   所以用一枚低调的文字开关，而不是再做一个方块 —— 它是对一行数据的"展开读数"，
   不是对岗位的动作。 */
.jh-dedup-toggle{margin:4px 0 0 10px;padding:2px 8px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;
  color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:18px;cursor:pointer}
.jh-dedup-toggle:hover{border-color:var(--dsw-alias-border-l4);
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.jh-dedup-toggle-on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-text);
  background:var(--dsw-alias-interactive-bg-active)}
/* 展开的对照面板：贴在那一行下面，左边线与卡片对齐，让人看出它属于哪一行 */
.jh-dedup-pane{margin:6px 0 2px 10px;padding:8px 10px;border-left:2px solid var(--dsw-alias-border-l3);
  display:flex;flex-direction:column;gap:6px}
.jh-dedup-pane .jh-table-matrix{min-width:0}
`

export const PAGER = `
/* 分页器：只有"上一页/下一页"两个文字按钮时，用户不知道总共有多少页 */
.jh-pager{display:flex;align-items:center;gap:4px;margin-left:auto}
.jh-pg{min-width:28px;height:28px;padding:0 8px;font-size:12.5px;cursor:pointer;
  border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;
  color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.jh-pg:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.jh-pg:disabled{opacity:.4;cursor:default}
.jh-pg-active{border-color:transparent;font-weight:600;
  background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
`

export const PAGER_CONTRAST_FIX = `
/* ── 第二轮修复：下面这几处原本用 label-tertiary，浅色 #81858c 配白只有 3.71:1。
   它们都是**要读的**文本（页码省略号、失分权重、岗位编号、看板计数、说明图标），
   不是可忽略的装饰 —— 同文件 :801-804 就为 .jh-field-flag 下过这个结论。
   统一走 --jh-muted-fg：浅色 9.59:1、深色 11.15:1。 */
.jh-pg-gap{color:var(--jh-muted-fg);padding:0 2px}
`

export const JOBS_SPLIT = `
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
/* ── 窄面板 / 触屏档（第四轮修复，审核 P2-11 与 P3）────────────────────
   两件事都跟着**面板**宽度走，所以用 container query，而不是 max-width:480px 那条
   视口查询：面板被挤到 400px 时窗口可能还有 1400px 宽（responsive.ts 里那组
   .jh-col-hide-sm 就是按视口算的，在这一屏会失灵 —— 明细表会横向溢出而不是隐藏列）。 */
@container (max-width: 520px){
  .jh-job-pick{padding:6px}
  .jh-job-pick input{width:24px;height:24px}
}
@container (max-width: 480px){
  .jh-dedup-pane .jh-col-hide-sm{display:none}
}
`
