import type { DatabaseSync } from 'node:sqlite';
import type { ResumeLanguage, ResumeState } from '../../../shared/enums.js';
import type { ResumeContent, ResumeDto, ResumeFileDto, ResumeSummaryDto } from '../../../shared/resume.js';
import { asTextOrNull } from '../row.js';
/**
 * 简历仓储（§7 / §11.3）。
 *
 * 三条纪律：
 *   1. **`content_json` 一律过 `normalizeResumeContent`** —— 它是用户手改的 JSON，
 *      也可能是模型返回的 JSON，两者都不可信。规范化放在仓储边界上，
 *      上层就永远拿不到"缺字段的半截对象"；
 *   2. **`rev` 只增不减**：任何内容变更都 +1。`job.score_rev` 靠它判断分数是否过期（§4.1），
 *      不递增就等于把过期分数当新分数用；
 *   3. **删除只由用户显式发起**：`remove` 会连带删掉附件记录与磁盘文件（由领域层做），
 *      但没有任何自动清理路径会调它（§18：简历与附件绝不清）。
 */
export interface ResumeRecord {
    id: number;
    name: string;
    direction: string;
    language: ResumeLanguage;
    content: ResumeContent;
    state: ResumeState;
    isDefault: boolean;
    rev: number;
    createdAt: string;
    updatedAt: string;
}
export interface ResumeUpsertInput {
    name: string;
    direction?: string;
    language?: ResumeLanguage;
    content: ResumeContent;
    state?: ResumeState;
    isDefault?: boolean;
}
export interface ResumeFileRecord extends ResumeFileDto {
    resumeId: number;
    template: string;
    /** 相对 `files/` 根的路径。 */
    path: string;
}
export interface ResumeRepo {
    list(options?: {
        state?: ResumeState;
        includeArchived?: boolean;
    }): ResumeRecord[];
    get(id: number): ResumeRecord | undefined;
    create(input: ResumeUpsertInput, now: string): ResumeRecord;
    update(id: number, patch: Partial<ResumeUpsertInput>, now: string): ResumeRecord;
    remove(id: number): boolean;
    /** 把某一版设为"当前启用"。同方向内互斥。 */
    setDefault(id: number, now: string): ResumeRecord;
    defaultResume(): ResumeRecord | undefined;
    /** 列表用的轻量视图（不把整份简历正文塞进 DTO）；带上各版附件，投递时选简历要用。 */
    summaries(options?: {
        includeArchived?: boolean;
    }): ResumeSummaryDto[];
    count(): number;
    addFile(input: Omit<ResumeFileRecord, 'id' | 'createdAt'>, now: string): ResumeFileRecord;
    listFiles(resumeId: number): ResumeFileRecord[];
    getFile(fileId: number): ResumeFileRecord | undefined;
    removeFile(fileId: number): boolean;
    /** 匹配分失效判断需要知道"当前版本是哪一份、rev 多少"（§4.1）。 */
    revision(): {
        resumeId: number | null;
        rev: number;
    };
}
export declare function createResumeRepo(db: DatabaseSync): ResumeRepo;
/**
 * `ResumeFileDto` 投影：**刻意不含 `path`**。
 *
 * 磁盘路径只活在仓储层（相对 `files/`），出不了 DTO 边界（§4.1）。
 * 放成导出的函数而不是各写一遍：投递选简历、简历详情、导出回执都要用它 ——
 * 三处各写一遍的话，哪天给 DTO 加一格就必然漏掉两处。
 */
export declare function toResumeFileDto(file: ResumeFileRecord): ResumeFileDto;
/** 把仓储记录转成对外 DTO（补上附件列表与定制数）。 */
export declare function toResumeDto(record: ResumeRecord, files: ResumeFileDto[], tailoringCount: number): ResumeDto;
export { asTextOrNull };
//# sourceMappingURL=resumes.d.ts.map