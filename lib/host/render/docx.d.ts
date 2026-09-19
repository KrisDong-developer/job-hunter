/**
 * 简历 → **真正的 .docx**（§17 R2）。
 *
 * 为什么不是"改名成 .docx 的 HTML"：
 *   HR 的 ATS 会解析附件正文，Word 也会按 OOXML 渲染。把 HTML 换个后缀，
 *   在别人的 Word 里就是一坨纯文本或者直接打不开 —— 对求职者来说这是**静默失败**，
 *   比导出报错糟得多。
 *
 * ZIP 容器已抽到 `render/zip.ts`（数据导出归档也要用它，两份实现迟早漂移）。
 * 本文件**只依赖 `node:zlib`**（经由那个容器）：没有 IO、没有外部进程、没有 npm 依赖，
 * 同一份输入永远产出同一串字节（时间戳写死，便于测试与去重）。
 */
import type { ResumeTemplate } from '../../shared/contract/enums/resume.js';
import type { ResumeContent } from '../../shared/domain/resume-content.js';
/** 把结构化简历渲染成**真正的 .docx**（OOXML + 自建 ZIP 容器）。 */
export declare function renderResumeDocx(content: ResumeContent, options?: {
    template?: ResumeTemplate;
}): Uint8Array;
//# sourceMappingURL=docx.d.ts.map