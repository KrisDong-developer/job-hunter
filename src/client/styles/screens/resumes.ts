/**
 * 本文件只装 CSS 常量，由 `styles/index.ts` 按固定顺序拼装后一次注入。
 * 分段名沿用原 `styles.ts` 的历史分节，顺序即层叠顺序 —— 不要重排。
 */

export const RESUMES = `
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
/* 卡片标题行里的紧凑下拉：width:100% 只在表单里合理，放进标题行会撑满整行。 */
.jh-select-inline{width:auto;flex:0 0 auto;max-width:200px;padding:3px 8px;font-size:12px}
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
`
