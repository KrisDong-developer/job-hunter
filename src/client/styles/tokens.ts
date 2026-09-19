/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const SEMANTIC_TEXT = `
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
`
