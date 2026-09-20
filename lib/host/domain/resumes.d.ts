import type { ResumeFormat, ResumeLanguage, ResumeState, ResumeTemplate } from '../../shared/contract/enums/resume.js';
import type { GreetingTemplateDto, ResumeDto, ResumeFileDto, ResumeSummaryDto, TailoringDto } from '../../shared/contract/dto/resume.js';
import type { ResumeContent, ResumeIssue } from '../../shared/domain/resume-content.js';
import { emptyResumeContent } from '../../shared/domain/resume-content.js';
import { type GreetingTone } from '../../shared/contract/enums/pipeline.js';
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
    /**
     * A3：把**粘贴进来的简历文本**解析成结构化内容，并（默认）存成一版新简历。
     *
     * ⚠️ 只接受**文本**，不接受 PDF/DOCX 字节：本仓库没有 PDF/DOCX 解析库，
     * 硬造一个只会把脏数据写进简历库。用户从 PDF 里选中复制再粘进来即可
     * （Word 与 PDF 都能复制）。想把手上的 PDF 原样存档，用下面的 `uploadFile`。
     */
    importResume(input: ResumeImportInput): Promise<ResumeImportResult>;
    /**
     * 把**用户自己的** PDF / DOCX 存成这一版简历的附件（R9 / D7）。
     *
     * 与 `exportResume` 的分工：那个是"从结构化内容生成文件"，
     * 这个是"把你手上已有的文件原样收进来"——用途是投递归因（R6：这次投的是哪一份）
     * 以及平台要求的自有模板表。
     */
    uploadFile(resumeId: number, input: {
        fileName: string;
        contentBase64: string;
        format?: string;
    }): ResumeFileDto;
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
    /** ── 简历赛道级话术模板（简历中心「话术」子页，v12 多赛道）────────── */
    listGreetingTemplates(resumeId: number): GreetingTemplateDto[];
    /** 从这份简历的事实生成一条开场模板：AI 优先（过校验），规则兜底。 */
    generateGreetingTemplate(input: {
        resumeId: number;
        tone?: GreetingTone;
    }): Promise<GreetingTemplateDto>;
    /** 手动新建 / 编辑（`via` 记 `manual`；编辑不改归属）。 */
    saveGreetingTemplate(input: {
        resumeId: number;
        id?: number;
        name: string;
        body: string;
    }): GreetingTemplateDto;
    removeGreetingTemplate(id: number): boolean;
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
export interface ResumeImportInput {
    /** 从 PDF / Word 里复制出来的简历正文（纯文本）。 */
    text: string;
    name?: string;
    direction?: string;
    language?: ResumeLanguage;
    /** 是否存成一版新简历；`false` = 只解析给用户看。默认 `true`。 */
    save?: boolean;
    useLlm?: boolean;
}
export interface ResumeImportResult {
    /** 落库后的简历；`save: false` 时为 null。 */
    resume: ResumeDto | null;
    /** 解析（或兜底）得到的结构化内容 —— 即使没落库也返回，界面让用户先看再决定。 */
    content: ResumeContent;
    /** `llm` = 模型解析；`rule` = 未解析（原始文本原样保留在 `extras` 里）。 */
    via: 'llm' | 'rule';
    /** 事实说明：降级原因、外发字段、以及需要人工核对的项。 */
    notes: string[];
    issues: ResumeIssue[];
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
/** 从正文里提取 `{占位符}` 名列表（去重保序）。 */
export declare function templateVarsOf(body: string): string[];
/**
 * 模板正文校验：占位符、联系方式/长度（复用发送侧同一条 `validateGreetingText`）、
 * 技术词白名单（简历没有的技术词 = 编造，R8 红线）。
 */
export declare function validateTemplateBody(allowed: Set<string>, body: string): string | undefined;
export interface ResumeGreetingSeed {
    name: string;
    body: string;
}
/**
 * 规则兜底模板：只用简历里**已抓到的事实**造句（方向 / 年限 / 前三技能 /
 * 第一条成果），含 {岗位} {公司} 占位符 —— 它的正确性与 `ruleTailor` 同源：
 * "什么都不加"在结构上就不可能编造。
 */
export declare function buildResumeGreetingTemplate(content: ResumeContent, tone: GreetingTone): ResumeGreetingSeed;
/**
 * 摘掉联系方式。
 *
 * 模型不需要知道用户的手机号与邮箱就能做对齐改写 —— 而这两样一旦发出去就收不回来。
 * 隐私闸门（`ai/privacy.ts`）也会兜一层，但那是"万一漏了"的第二道，不是第一道。
 */
export declare function stripContacts(content: ResumeContent): ResumeContent;
export { emptyResumeContent, isoNow };
//# sourceMappingURL=resumes.d.ts.map