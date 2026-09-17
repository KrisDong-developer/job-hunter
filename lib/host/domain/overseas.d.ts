/**
 * 海外 / 远程支线（§4.M / §12.8）。
 *
 * 三个 P0 需求，各有一个"错一次就完"的点：
 *   * **M4 工签/Sponsorship**：识别不出来就必须说识别不出来。
 *     把"没看到 no sponsorship"当成"提供担保"，会让用户投一堆注定无效的岗位 ——
 *     比不识别更糟，因为它给了虚假的希望。所以 `unknown` 是一等取值。
 *   * **M3 时区**：算错时区 = 直接错过面试。所以面试时间**双重显示**
 *     （对方时区 + 本地时区），而不是只换算一个数字让用户自己信。
 *   * **M1 英文简历不做机翻**：这是 §4.M 点名的致命错误。所以这里只做
 *     "检查与提示"（无照片/无年龄/无婚育、动词开头），真正的英文内容由用户或模型产出，
 *     **不提供中→英翻译**。
 *
 * 外加 M2 Cover Letter 与 M5 远程筛选。
 */
import type { CoverLetterLanguage, RemoteKind, VisaStance } from '../../shared/enums.js';
import type { CoverLetterDto, TimezoneDisplayDto, VisaRequirementDto } from '../../shared/dto.js';
import type { AiService } from '../ai/client.js';
import type { Store } from '../store/store.js';
import { type Clock } from '../util/time.js';
/**
 * 工签识别词表。
 *
 * 分成三组而不是一组：**"明确不提供"与"明确提供"必须区分开**，
 * 因为它们的行动含义相反（一个该放弃，一个该优先投）。
 * 都没命中才是 `unknown`。
 */
export declare const VISA_NO_SPONSORSHIP_PATTERNS: string[];
export declare const VISA_PROVIDES_PATTERNS: string[];
export declare const REMOTE_PATTERNS: Array<{
    kind: RemoteKind;
    patterns: string[];
}>;
/** 校招批次识别（L7）。与工签同源思路：命中才标记，命不中留 NULL。 */
export declare const CAMPUS_PATTERNS: Array<{
    batch: 'autumn' | 'spring';
    patterns: string[];
}>;
export interface RecognitionResult {
    stance: VisaStance;
    evidence: string[];
    uncertainty: string | null;
}
/**
 * 从 JD / HR 消息里识别工签立场。
 *
 * **纯关键词，不做推断**。命中"不提供"优先于"提供"（同一段文本里两者都出现时，
 * 保守地按"不提供"处理 —— 投错的代价比不投大）。
 */
export declare function detectVisa(text: string): RecognitionResult;
/** 从文本识别工作模式。识不出来是 `unknown`，不猜。 */
export declare function detectRemote(text: string): {
    kind: RemoteKind;
    evidence: string[];
};
/** 校招批次识别。 */
export declare function detectCampusBatch(text: string): {
    batch: 'autumn' | 'spring' | null;
    evidence: string[];
};
/**
 * 英文简历的**检查**（M1）。
 *
 * 只检查、不翻译。机翻简历是 §4.M 点名的致命错误，所以这里连"翻译"的入口都不提供 ——
 * 提供入口就等于鼓励用它。
 */
export interface ToneIssue {
    level: 'error' | 'warn';
    message: string;
}
export declare function inspectEnglishResume(content: {
    basics: {
        age?: number;
        name: string;
        title: string;
    };
    summary: string;
    experiences: Array<{
        highlights: string[];
    }>;
    extras: Array<{
        label: string;
        text: string;
    }>;
}): ToneIssue[];
/**
 * 时区双重显示（M3）。
 *
 * 关键是**两边都显示**而不是只换算一边：只给一个数字，用户无从判断对不对；
 * 两边一起给，错的时区会自己露出来（"对方 9:00，我这边 22:00" 一眼就知道不对）。
 */
export declare function timezoneDisplay(atIso: string, counterpartTz: string, localTz: string): TimezoneDisplayDto;
export interface OverseasService {
    /** 识别并落库一个岗位的工签/远程/批次（L7 / M4 / M5）。 */
    analyzeJob(jobId: number): VisaRequirementDto & {
        remoteKind: RemoteKind;
        campusBatch: string | null;
    };
    getVisa(jobId: number): VisaRequirementDto;
    setVisa(jobId: number, stance: VisaStance, options?: {
        identityLimit?: string | null;
        evidence?: string[];
    }): VisaRequirementDto;
    /** 按工签/远程筛选岗位（M4 / M5）。 */
    filterJobs(input: {
        stance?: VisaStance;
        remoteKind?: RemoteKind;
        limit?: number;
    }): Array<{
        jobId: number;
        title: string;
        companyName: string | null;
        stance: VisaStance | null;
        remoteKind: RemoteKind | null;
    }>;
    /** 面试时间的双重显示（M3）。 */
    displayInterviewTime(atIso: string, counterpartTz: string): TimezoneDisplayDto;
    /** 英文简历体检（M1：**只检查，不翻译**）。 */
    inspectEnglish(resumeId: number): ToneIssue[];
    /** Cover Letter（M2）。 */
    draftCoverLetter(input: {
        jobId: number;
        language?: CoverLetterLanguage;
        resumeId?: number;
        useLlm?: boolean;
    }): Promise<CoverLetterDto>;
    listCoverLetters(jobId?: number): CoverLetterDto[];
}
export interface OverseasDeps {
    store: Store;
    ai?: AiService | undefined;
    clock?: Clock;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
}
export declare function createOverseasService(deps: OverseasDeps): OverseasService;
//# sourceMappingURL=overseas.d.ts.map