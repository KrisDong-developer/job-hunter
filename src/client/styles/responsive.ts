/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const SMALL_TOP = `
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
`

export const SMALL = `
/* ── 小屏（≤480px）─────────────────────────────────────────────────
   quality-gates §5 要求 375px 可用；rules §7 要求弹窗在移动端考虑底部抽屉/全屏页。 */
@media (max-width:480px){
  /* 弹窗：小屏变成接近全屏的页面，而不是卡片留 16px 边 */
  .jh-modal-layer{padding:0;align-items:stretch}
  .jh-modal{max-height:100%;height:100%;border-radius:0;border-left:0;border-right:0}
  .jh-modal-md,.jh-modal-lg{max-width:none}
  /* 低密度：小屏隐藏「更新」列，保留 时间/状态/新增/结果说明 这四列关键信息 */
  .jh-table-runs .jh-col-hide-sm{display:none}
  /* 矩阵同理：小屏先让「成熟度」「产量」让位，留下 平台/今天能跑/登录/健康/额度/最近一轮 */
  .jh-table-matrix .jh-col-hide-sm{display:none}
  /* 能力矩阵：让「成熟度」「上次验证」两列退场（它们最不让位），
     其余照旧横滑 —— 首列已经粘住，横滑时仍认得出是哪一行 */
  .jh-table-caps .jh-col-hide-sm{display:none}
  /* 采集页顶部工具条：这里装着 3 个分区按钮 + 状态 + 3 个全局按钮，
     375px 下必然折成 2~3 行。它原来还带 position:sticky ——
     等于常驻吃掉视口高度的 1/4~1/3，而它下面是这一页真正要看的内容。
     窄屏改回随页面滚动："随手够得着"在这里不如"看得见内容"重要。 */
  .jh-collect-bar{position:static}
  /* 状态只留圆点（与顶栏 .jh-live 同一套降级）。圆点本身是 aria-hidden，
     所以状态对读屏仍然完整 —— 靠的就是被隐掉的这一层文字。 */
  .jh-collect-switch-text{display:none}
  .jh-clip{max-width:11em}
  /* 主要操作在小屏仍然找得到：方案卡的动作换行且左对齐，不挤成一条 */
  .jh-plan-head{gap:4px}
  .jh-plan-head .jh-btn{flex:0 0 auto}
  /* 时间范围在小屏换行显示，避免两个输入框被压扁 */
  .jh-timerange{gap:6px}
  .jh-time{width:100%;max-width:160px}
}
`
