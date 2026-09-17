import type { DatabaseSync } from 'node:sqlite';
import type { ResumeContent } from '../../../shared/resume.js';
/**
 * 简历定制仓储（§11.3 `ResumeTailoring`）。
 *
 * 为什么每次定制都要落库而不是"生成完直接覆盖简历"：
 *   * §3.2 的结论是**不要每岗定制**，所以定制是"建议 + 显式采用"的形态；
 *     覆盖式生成会让用户失去"哪一版投了哪个岗位"的对应关系；
 *   * `adopted` + `outcome` 是 P7 归因（"哪版简历转化好"）的原始数据。
 *
 * `content_json` 同样是不可信输入（模型返回）→ 入库前一律规范化。
 */
export interface TailoringRecord {
    id: number;
    resumeId: number;
    jobId: number | null;
    content: ResumeContent;
    via: 'llm' | 'rule';
    notes: string[];
    adopted: boolean;
    outcome: string | null;
    createdAt: string;
}
export interface TailoringInput {
    resumeId: number;
    jobId: number | null;
    content: ResumeContent;
    via: 'llm' | 'rule';
    notes?: string[];
}
export interface TailoringRepo {
    create(input: TailoringInput, now: string): TailoringRecord;
    get(id: number): TailoringRecord | undefined;
    list(options: {
        resumeId?: number;
        jobId?: number;
        limit?: number;
    }): TailoringRecord[];
    adopt(id: number, adopted: boolean): TailoringRecord | undefined;
    setOutcome(id: number, outcome: string | null): void;
    removeByResume(resumeId: number): number;
    countFor(resumeId: number): number;
}
export declare function createTailoringRepo(db: DatabaseSync): TailoringRepo;
//# sourceMappingURL=tailorings.d.ts.map