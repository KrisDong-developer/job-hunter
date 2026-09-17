import type { ResumeFormat, ResumeLanguage, ResumeState, ResumeTemplate } from '../../shared/enums.js';
import type { ResumeContent, ResumeDto, ResumeFileDto, ResumeIssue, ResumeSummaryDto, TailoringDto } from '../../shared/resume.js';
import { emptyResumeContent } from '../../shared/resume.js';
import type { AiService } from '../ai/client.js';
import type { Store } from '../store/store.js';
import { isoNow, type Clock } from '../util/time.js';
/** 渲染成 PDF 的端口。真实实现是 headless Chromium（`render/pdf.ts`），测试用假的。 */
export interface PdfPort {
    render(html: string): Promise<Uint8Array>;
}
export interface ResumeServiceDeps {
    store: Store;
    /** 生成文件放哪。默认 `$DSH_HOME/job-hunter/files`（由 runtime 注入）。 */
    filesDir: string;
    clock?: Clock;
    ai?: AiService | undefined;
    pdf?: PdfPort | undefined;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export interface ResumeService {
    list(options?: {
        includeArchived?: boolean;
    }): ResumeSummaryDto[];
    get(id: number): ResumeDto;
    create(input: ResumeWriteInput): ResumeDto;
    update(id: number, patch: Partial<ResumeWriteInput>): ResumeDto;
    duplicate(id: number, name?: string): ResumeDto;
    setDefault(id: number): ResumeDto;
    remove(id: number): boolean;
    /** 体检（规则部分）。 */
    inspect(id: number): ResumeIssue[];
    /** 预览用的自包含 HTML（不落盘）。 */
    preview(id: number, template?: ResumeTemplate): string;
    /** 生成附件并记账。 */
    exportResume(id: number, input?: {
        format?: ResumeFormat;
        template?: ResumeTemplate;
    }): Promise<ResumeFileDto>;
    /** 读回已生成的文件（下载路由用）。 */
    readFile(fileId: number): {
        fileName: string;
        format: string;
        bytes: Uint8Array;
    } | undefined;
    removeFile(fileId: number): boolean;
    tailor(input: {
        jobId: number;
        resumeId?: number;
        useLlm?: boolean;
    }): Promise<TailoringDto>;
    listTailorings(options: {
        resumeId?: number;
        jobId?: number;
        limit?: number;
    }): TailoringDto[];
    adopt(tailoringId: number, adopted: boolean): TailoringDto;
    /** 当前启用版本的标识，写进 `job.score_rev`（§4.1）。 */
    scoreStamp(): {
        resumeId: number | null;
        rev: number;
    };
}
export interface ResumeWriteInput {
    name: string;
    direction?: string;
    language?: ResumeLanguage;
    content: ResumeContent;
    state?: ResumeState;
    isDefault?: boolean;
}
export declare function createResumeService(deps: ResumeServiceDeps): ResumeService;
/**
 * 规则定制（无模型路径，也是模型结果不合规时的兜底）。
 *
 * **它的正确性来自"什么都不加"**：只做重排、挑选、以及用原简历里已有的词写一句简介。
 * 这样它在结构上就不可能编造 —— 而一个"可能编造但更快"的兜底是没有意义的。
 */
export declare function ruleTailor(content: ResumeContent, job: {
    title: string;
    tags: string[];
    jdText: string;
}): {
    content: ResumeContent;
    notes: string[];
};
/**
 * 摘掉联系方式。
 *
 * 模型不需要知道用户的手机号与邮箱就能做对齐改写 —— 而这两样一旦发出去就收不回来。
 * 隐私闸门（`ai/privacy.ts`）也会兜一层，但那是"万一漏了"的第二道，不是第一道。
 */
export declare function stripContacts(content: ResumeContent): ResumeContent;
export { emptyResumeContent, isoNow };
//# sourceMappingURL=resumes.d.ts.map