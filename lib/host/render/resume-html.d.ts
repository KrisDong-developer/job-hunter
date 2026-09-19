/**
 * 简历 → HTML（§17 R1）：**自包含**、可直接交给 Chromium `page.setContent()` 打印成 PDF。
 *
 * 为什么是"自包含 + 内联样式"：
 *   1. 打印链路里**没有网络**，也没有项目的 CSS 产物 —— 外链样式表会静默失效，
 *      用户拿到的是一张没有排版的裸纸；
 *   2. 预览（`fragment`）与打印走**同一份标记**：预览好看、打印走样是最难查的一类 bug，
 *      所以这里只切外壳，不切内容。
 *
 * 字体是这里唯一"看起来像细节、实际是硬需求"的东西（R1）：中文若不显式指定字体栈，
 * 落到 Chromium 默认的 serif 上就是宋体点阵观感，且 Windows / macOS 表现完全不同。
 *
 * 本文件是**纯函数**：没有 IO、没有活对象，可被任意进程直接引。
 */
import type { ResumeTemplate } from '../../shared/contract/enums/resume.js';
import type { ResumeContent } from '../../shared/domain/resume-content.js';
export interface RenderOptions {
    template?: ResumeTemplate;
    /** 页眉里是否显示照片/期望薪资等可选字段（R3：字段可开关）。 */
    showOptional?: boolean;
    /** 只渲染正文片段（预览用），不带 `<html>/<head>` 外壳。 */
    fragment?: boolean;
}
/** 把结构化简历渲染成**自包含** HTML（无外链、无脚本、样式内联在 `<style>` 里）。 */
export declare function renderResumeHtml(content: ResumeContent, options?: RenderOptions): string;
//# sourceMappingURL=resume-html.d.ts.map