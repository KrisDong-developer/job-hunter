/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const PIPELINE_GROUP = `
/* ── P7：流水线看板 / 消息 / 面试 / 数据看板 ───────────────────────── */
`

export const PIPELINE = `
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
`
