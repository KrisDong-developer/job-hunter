import type { ResumeTemplate } from '../../shared/enums.js';
import type { ResumeContent } from '../../shared/resume.js';
/** 把结构化简历渲染成**真正的 .docx**（OOXML + 自建 ZIP 容器）。 */
export declare function renderResumeDocx(content: ResumeContent, options?: {
    template?: ResumeTemplate;
}): Uint8Array;
//# sourceMappingURL=docx.d.ts.map