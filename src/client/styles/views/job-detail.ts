/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const MATCH_AND_FLAGS = `
/* ── P4：匹配分与风险标注 ────────────────────────────────────────── */
.jh-job-signals{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}
.jh-score{font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
/* 分数已过期（第五轮，批次 A2）：换简历之后库里那个分就不再代表"当前匹配度"。
   它仍然有信息量（旧简历下的相对排序），所以**不隐藏、不删掉**，只是不再看起来
   和当前分数一样可信：去掉填充、文字转 muted。形状不变 → 不会造成行高跳动。
   "为什么过期"由文字与 tooltip 说明（见 job-row 的「（按旧简历）」）。 */
.jh-score-stale{background:transparent;color:var(--jh-muted-fg);
  box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}
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
`

export const DETAIL = `
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
/* 提示列表：**一条一行**。上一版是"· 提示一 · 提示二"连排成一段，
   读起来是一块文字而不是几条可逐条处理的事（评审原话："文字瀑布"）。 */
.jh-alert-list{margin:0;padding-left:18px;font-size:12.5px;line-height:1.7;
  color:var(--dsw-alias-label-primary)}
.jh-alert-list li{margin:2px 0}

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

/* JD 原文。抓下来的文本自带换行与缩进（列表项、空行），pre-wrap 原样保留；
   anywhere 防止长串（URL、无空格英文）把卡片撑宽。
   颜色刻意用 primary 而不是 secondary —— 这是要读的正文，不是说明文字。 */
.jh-jd{margin:0 0 8px;font-size:13px;line-height:1.75;white-space:pre-wrap;
  overflow-wrap:anywhere;color:var(--dsw-alias-label-primary)}
`

export const TAILOR_AND_FILE = `
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
`

export const COMPANY_REVIEW_AND_SIBLINGS = `
/* 人工复核条：与上面的画像统计用一条分隔线隔开 —— 上面是**规则算的**，
   下面是**你写的**，两者性质不同，不该混成一片。 */
.jh-review{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 0;
  padding:10px 0 0;border-top:1px solid var(--dsw-alias-border-l1)}
.jh-review-field{display:inline-flex;align-items:center;gap:6px;font-size:12px;
  color:var(--dsw-alias-label-secondary)}

/* 「这家公司的其它岗位」：整行可点（切到那个岗位的详情）。
   用块级文本按钮而不是下划线链接 —— 一排十几条下划线在详情栏里太吵。 */
.jh-siblings{list-style:none;margin:0;padding:0}
.jh-siblings li{margin:0}
.jh-sibling{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;width:100%;
  text-align:left;border:0;background:transparent;font:inherit;font-size:12.5px;
  padding:5px 6px;border-radius:6px;color:var(--dsw-alias-label-primary)}
.jh-sibling:hover{background:var(--dsw-alias-interactive-bg-hover)}
/* 抽屉里没有"切换岗位"的上下文，渲染成纯文本 —— 删掉 hover 反馈免得看着像能点 */
.jh-sibling-static{cursor:default}
.jh-sibling-static:hover{background:transparent}
.jh-sibling-meta{color:var(--dsw-alias-label-secondary);font-size:11.5px}
`
