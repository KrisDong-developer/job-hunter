/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const SETTINGS = `
/* ── U10 设置页重排（2026-09-18）──────────────────────────────────────
   实测的三个问题：
     ① 6 个平级 h2 纵向单列排下来，宽屏下右侧一大片空白；
     ② 配置（模型用途 / 闸门 / 浏览器）与诊断（诊断 / 留痕 / 审计）混在同一屏，
        想关掉某一个用途得先滚过整屏日志；
     ③ 开关与额度是**纯文本**（"开 / 关"、"打招呼 20 · 投递 10 · 回复 30"），
        看起来像读数而不是能改的控件。
   做法：二级标签页 + 容器查询驱动的两栏网格 + 真正的 Switch / 数字输入框。
   配置页现在是**三张卡**（模型用途 / 系统控制中心 / 运行资源）—— 「运行资源」
   （浏览器 + 采集节奏）是从闸门那张卡里拆出来的，理由见 config-panel.tsx。
   为什么用 container query 而不是 media query：决定"放不放得下两栏"的是**面板**
   有多宽（侧栏一展开、对话区一挤，窗口还宽着呢面板已经放不下了），
   与岗位库的两栏网格（.jh-jobs-split）同一个理由。 */
.jh-screen-settings{max-width:1360px}
.jh-set-tabs{margin:0 0 12px}
.jh-set-wrap{container-type:inline-size}
/* 这一屏的卡片统一放到 1360：.jh-card 自带的 max-width:1000px 会让顶部的
   「当前风控态势」比下面两栏网格窄一截，看起来像没对齐。
   ── 2026-09-20：作用域从 .jh-set-wrap>.jh-card（只有配置页在 wrap 里）改成**整屏**。
   原因：三个分区的内容宽度原本是 1360 / 1000 / 964（数据页还多套了一层 .jh-screen
   的内边距），切分区时整片内容会跳一下宽度。
   为什么不是"给每个 tabpanel 都加 .jh-set-wrap"（那样只改一行）：.jh-set-wrap 带
   container-type:inline-size，等于给面板加了一层 containment —— 而清理确认弹窗
   （Modal）与留痕抽屉（PayloadDrawer）都是 position:absolute 层，containment 会让
   它们改为相对面板定位：面板很高、用户又滚到了下面时，弹窗会落在视口之外。
   宽度归一不需要 containment，所以用作用域选择器，不动面板本身。 */
.jh-screen-settings .jh-card{max-width:none}
.jh-set-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
/* 间距交给 grid gap：卡片自带 margin-bottom，两栏时左右两张卡的下外边距会变成双份 */
.jh-set-grid>.jh-card{margin:0}
@container (min-width: 880px){
  .jh-set-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);align-items:start}
}

/* 控制行：左边是标签（可带问号说明），右边是控件。
   用 grid 而不是 flex —— 标签有长有短，grid 让同一张卡里所有控件左边缘对齐。 */
.jh-ctl{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;
  gap:10px;padding:7px 0}
.jh-ctl+.jh-ctl,.jh-ctl-stack+.jh-ctl{border-top:1px solid var(--dsw-alias-border-l1)}
/* 控制行的另一种形态：标签在上、控件在下。
   给"控件本身很宽"的行用 —— 发送时段是两个 time 输入 + 一个按钮（约 360px），
   在两栏布局最窄的那一档（容器 880px 时右栏内容宽约 361px）横排会把标签挤成一列字。
   窄的时候整行换成上下排，宽的时候也不难看（与「每日额度」三格同一套语法）。 */
.jh-ctl-stack{display:flex;flex-direction:column;gap:4px;padding:7px 0}

/* 清理清单的勾选框：原生 checkbox 只有 13×13，而这里的勾选是"要删哪些"的唯一入口。
   与 .jh-job-pick 同一个理由与做法（那里已提到 18px + 内边距）。
   作用域只给这一处清单：.jh-check 全仓库有 7 个使用点，改全局会连带改到
   筛选栏与几个弹窗的行高，那不是这次要动的东西。 */
.jh-clean-list .jh-check{padding:2px 0}
.jh-clean-list .jh-check input{width:18px;height:18px;margin:0}
`

export const SETTINGS_PURPOSES_AND_USAGE = `
/* 模型用途：按业务分组，每组一个三列网格（窄面板自动降为两列 / 一列）。
   14 项平铺一列是原来"页面很长"的主要来源之一。
   148px 会在这个宽度下排成 4 列 —— 190px 才是"两栏布局下正好三列"（3×190+2×10=590）。 */
.jh-purpose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
  gap:0 10px}
.jh-purpose{display:flex;align-items:center;justify-content:space-between;gap:8px;
  min-width:0;padding:5px 8px;border-radius:7px;cursor:pointer}
.jh-purpose:hover{background:var(--dsw-alias-interactive-bg-hover)}
.jh-purpose-name{font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap}

/* 额度那三格：标签在上、输入框在下（横排放不下"打招呼 / 投递 / 回复"三个完整标签） */
.jh-limits{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 12px}
.jh-limit{display:flex;flex-direction:column;gap:4px;min-width:0}
.jh-limit .jh-number{width:100%}

/* 发送时段这两个 time 输入在控制行里（.jh-ctl 是 grid）：.jh-timerange 自带下外边距，
   在行内会把这行撑高，所以清掉。 */
.jh-ctl .jh-timerange{margin:0}

/* 按用途汇总（留痕）：每个用途一格，横向排开。
   意图是"哪几项在烧 token"——它支撑"该关掉哪个用途"这个决策，所以放在表格上方。 */
.jh-usage{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:6px 14px;margin:0 0 12px}
.jh-usage-item{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:12px}
.jh-usage-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:var(--dsw-alias-label-primary)}
.jh-usage-num{font-variant-numeric:tabular-nums;font-weight:600}
.jh-usage-unit{color:var(--jh-muted-fg)}

/* 设置页那两张表（留痕 / 审计）：与「最近运行」「平台矩阵」同一档内边距。
   基础档是 4px 6px —— 而这两张表的单元格里放的是 19px 高的状态标签，
   贴边会很挤（第三轮已在 .jh-table-runs/-matrix 上下过同样的结论，只是没推广到这两张）。 */
.jh-table-roomy th,.jh-table-roomy td{padding:7px 10px;vertical-align:middle}
/* 时间列：左对齐 + 等宽数字（与 .jh-table-runs 的第一列同一套），
   **不能**右对齐 —— 表头是左对齐的，单元格右对齐会让列内错位。 */
.jh-table-roomy td:first-child{font-variant-numeric:tabular-nums;white-space:nowrap}

/* 数据文件那一行：路径截断 + 两个动作。
   ── 截断而不是换行：一条 60 字符的绝对路径换三行会把整个诊断卡撑高，
   而它 99% 的时候只是"看着对"；要完整内容有 title 与复制按钮。 */
.jh-path{display:flex;align-items:center;gap:4px;min-width:0}
.jh-path code{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:ui-monospace,Consolas,monospace;font-size:12px;padding:2px 6px;border-radius:5px;
  background:var(--dsw-alias-markdown-inline-code)}
/* 触达尺寸：WCAG 2.2 的 24×24。.jh-icon-btn 默认只有 18px 高 —— 图标按钮最容易
   在这条上被漏掉（审核里 .jh-chip-x 13×13 就是同类问题）。 */
.jh-path .jh-icon-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;
  min-width:24px;min-height:24px;padding:0}
.jh-path .jh-icon-btn svg{display:block}

/* 调用留痕的「外发字段」：单元格里只留一个数量，点开才看完整 payload */
.jh-payload-link{font-size:12px}
/* 结果列的状态标签：错误列存的是宿主的错误消息（可能一整句），
   标签本身限宽截断，全文进 title —— 否则一句话会把"结果"列撑到半张表宽。 */
.jh-tag-clip{max-width:16em;overflow:hidden;text-overflow:ellipsis}
/* Payload JSON 查看器（抽屉里）。等宽 + 可横向滚动：JSON 折行后很难读。 */
.jh-json{margin:0;padding:10px 12px;border-radius:8px;max-height:56vh;overflow:auto;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-markdown-code-block);
  font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;
  white-space:pre;color:var(--dsw-alias-label-primary)}
.jh-json-hint{margin:0 0 8px}

/* ── 采集页重构（第六轮，2026-09-18）：分区 + 固定工具条 + 主从表格 ──────
   这一轮修的是**可用性**：原来「触发与运行 / 采集方案 / 跨平台去重 / 平台总览 /
   平台明细」五个模块一拉到底 —— 改配置要穿过状态区，找按钮要逐卡扫描，
   而「平台总览」与「平台明细」说的还是同一批平台。三处对应三组新样式。 */

/* ① 顶部固定工具条：分区切换 + 全局操作。
   负外边距抵掉 .jh-screen 的 padding，让这条横贯整屏并贴住滚动容器顶部；
   底色必须**不透明**（bg-base），否则滚动时下面的内容会从它身下透出来。 */
.jh-collect-bar{position:sticky;top:0;z-index:3;display:flex;align-items:center;
  gap:8px;flex-wrap:wrap;margin:-16px -18px 12px;padding:10px 18px;
  background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1)}
.jh-collect-bar .jh-modes{flex:0 0 auto}
/* 调度状态：小圆点 + 一句话。它回答"现在是什么状态"，
   按钮文案回答"点下去会发生什么" —— 两者都要有，缺一个就得猜。 */
.jh-collect-switch{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;
  color:var(--dsw-alias-label-secondary);white-space:nowrap}

/* ② 顶部两栏（运行状态 / 当前生效方案）。
   判断"窄不窄"的是**面板**宽度（container query），不是窗口宽度：
   侧栏一展开、对话区一挤，窗口还宽着，面板已经放不下两栏了。
   顶部留白由 .jh-collect-top 负责，所以格子里的卡不再自带下外边距。 */
.jh-collect-top{container-type:inline-size;margin:0 0 12px}
.jh-collect-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);
  gap:12px;align-items:start}
.jh-collect-grid>.jh-card{margin:0}
@container (max-width:760px){
  .jh-collect-grid{grid-template-columns:minmax(0,1fr)}
}
/* 方案卡的操作行放**右下角**：读配置内容时不会被一排按钮从中间打断。
   原先按钮挤在标题右侧，与标题争同一行。 */
.jh-plan-actions{display:flex;gap:6px;justify-content:flex-end;
  margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
/* .jh-btn-tiny 自带 margin-left:6px，这里是 flex + gap，不要叠加 */
.jh-plan-actions .jh-btn,.jh-plat-detail-actions .jh-btn{margin-left:0}
.jh-plan-switch{margin:0 0 8px}

/* ③ 表格：内边距 / 对齐 / 行状态。
   实测原来 th/td 是 padding:4px 6px —— 内容贴边、行与行糊在一起；而"状态"格里
   放的是 19px 高的徽标，需要**居中**才不像挤在左边。数字仍然右对齐（.jh-num）。 */
.jh-table-matrix th,.jh-table-matrix td{padding:8px 10px;vertical-align:middle}
.jh-table-runs th,.jh-table-runs td{padding:7px 10px;vertical-align:middle}
.jh-table th.jh-cell-status,.jh-table td.jh-cell-status{text-align:center}
/* 操作列右对齐：与"数字右对齐"同一套语法，扫这一列时按钮在同一条竖线上 */
.jh-table td.jh-cell-actions{text-align:right}
/* 展开了明细的那一行**不换底色**。
   本来想给它 interactive-bg-active 表示"这是我展开的"，但那会引入一个**没量过**的
   前景/背景组合：这一行里有 .jh-muted（label-secondary），而审核实测
   "bg-overlay 上的 label-secondary 在深色下只有 3.85:1" —— 交互底色的取值不一定
   与它相同，不值得为一个纯装饰性的底色去冒这个险。
   "哪一行展开了"已经有两个更强的信号：按钮变成「收起」+ 明细就贴在它下面
   （左边一条竖线，见 .jh-plat-detail）。 */
.jh-table tbody tr.jh-row-detail:hover{background:transparent}
.jh-table tbody tr.jh-row-detail>td{background:var(--dsw-alias-bg-base);
  padding:10px 12px 12px 26px}

/* 展开行里的诊断明细。左边一条竖线表示"属于上面那一行"
   （与 .jh-dedup-pane 同一套语法，不再另造一种"归属"的画法）。 */
.jh-plat-detail{display:flex;flex-direction:column;gap:4px;
  border-left:2px solid var(--dsw-alias-border-l3);padding-left:10px}
.jh-plat-detail .jh-kv{margin:0 0 8px}
/* 这里曾经有一条 .jh-plat-detail-row（放"登录 徽标 + 登录按钮"那一行）。
   随着登录动作回到矩阵行里，它没有使用者了 —— 死规则留着比删掉更糟：
   下一个人会以为明细里还有一排"行内控件"的写法可以复用。 */
.jh-plat-detail-actions{display:flex;gap:6px;margin-top:6px}

/* 能力矩阵（诊断与明细分区）：12 列，**不套用** .jh-table-matrix 的列宽策略 ——
   那一套会 nowrap 所有非末列，而这里"成熟度"格下面还挂着"已知缺口"的说明句，
   nowrap 会把它压成一条读不了的横线。允许换行、给一个最小宽度让它横向滚动。 */
.jh-table-caps{min-width:900px}
.jh-table-caps th,.jh-table-caps td{padding:7px 10px;vertical-align:top;text-align:left}
/* 首列粘住：与「平台状态总览」同一套做法（见 PLATFORM_MATRIX 那段）。
   900px 的表在窄屏一定会横滑，而横滑到右边几列时，没有粘性首列就看不出
   这一行是哪个平台 —— "保留行身份"是本项目允许横滑的前提。
   只借"粘住"这一件事，**不借** width:1% 那套列宽策略（原因见上面那条注释）。 */
.jh-table-caps th.jh-col-sticky,.jh-table-caps td.jh-col-sticky{
  position:sticky;left:0;z-index:1;background:var(--dsw-alias-bg-layer-1)}
`
