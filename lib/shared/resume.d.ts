/**
 * 简历的结构化形状 —— host、client、渲染器（HTML / DOCX）与模型提示词**共用这一份**。
 *
 * 为什么必须结构化而不是"一段富文本"：
 *   1. **防编造**（§4.5 禁止编造、R8）：只有结构化之后，"模型有没有加一段不存在的经历"
 *      才是可判定的（见 `factAtoms` / `checkNoFabrication`）；
 *   2. **多目标渲染**：同一份数据要出 HTML 预览、PDF、DOCX，还要喂给模型做定制；
 *   3. **匹配分是简历版本的函数**（§4.1）：简历改了，之前算过的分就失效了，
 *      这要求简历有稳定 id 与版本（见 `resume_rev`）。
 *
 * 这里**只有纯数据与纯函数**（没有 IO、没有活对象），所以 host 与 client 都能直接引。
 */
import type { ResumeLanguage, ResumeState } from './enums.js';
/** 基础信息。`phone`/`email` 走隐私闸门时会被硬黑名单剥离（§4.5 / I5）。 */
export interface ResumeBasics {
    name: string;
    /** 目标岗位 / 方向，如「Java 后端开发」。 */
    title: string;
    phone?: string;
    email?: string;
    city?: string;
    /** 工作年限。 */
    years?: number;
    age?: number;
    links?: Array<{
        label: string;
        url: string;
    }>;
}
export declare const SKILL_LEVELS: readonly ["了解", "熟悉", "熟练", "精通"];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export interface ResumeSkill {
    name: string;
    level?: SkillLevel;
    years?: number;
    /** 证据：在哪个项目/经历里用过。**没有证据的技能更容易被面试问穿**。 */
    evidence?: string;
}
export interface ResumeExperience {
    company: string;
    title: string;
    /** `YYYY-MM` 或 `YYYY-MM-DD`。允许只写一端（在职中）。 */
    start?: string;
    end?: string;
    city?: string;
    /** 逐条成果/职责。定制时只允许重排、改写措辞，不允许新增事实。 */
    highlights: string[];
    stack?: string[];
}
export interface ResumeProject {
    name: string;
    role?: string;
    period?: string;
    highlights: string[];
    stack?: string[];
}
export interface ResumeEducation {
    school: string;
    major?: string;
    degree?: string;
    start?: string;
    end?: string;
}
export interface ResumeExtra {
    label: string;
    text: string;
}
export interface ResumeContent {
    basics: ResumeBasics;
    /** 个人简介 / 自我评价。 */
    summary: string;
    skills: ResumeSkill[];
    experiences: ResumeExperience[];
    projects: ResumeProject[];
    education: ResumeEducation[];
    extras: ResumeExtra[];
}
/** 一份空简历：新建版本时的起点，也是"结构合法"的基准。 */
export declare function emptyResumeContent(direction?: string): ResumeContent;
export declare function normalizeResumeContent(input: unknown): ResumeContent;
/** 简历"有没有内容"的判定：渲染与导出都要求它非空，否则给的是白纸。 */
export declare function isResumeContentUsable(content: ResumeContent): boolean;
/**
 * 完整性体检（§4.C / A5 的规则部分；LLM 那部分不在本阶段）。
 *
 * 只报**能确定**的问题（缺名字、经历没写成果、时间倒挂、技能没证据），
 * 不猜"这段经历够不够强" —— 那种判断要么靠模型、要么靠人。
 */
export interface ResumeIssue {
    level: 'error' | 'warn';
    /** 人话，直接显示给用户。 */
    message: string;
    /** 定位：哪个段落、第几项。 */
    at: string;
}
export declare function inspectResume(content: ResumeContent): ResumeIssue[];
/**
 * 事实原子：一份简历里**可以被凭空编出来**的东西。
 *
 * 抽取规则刻意保守 —— 宁可漏报也不要误报，因为误报会让合法的措辞改写被拒。
 * 覆盖的是最常见的编造形态：**编一个没用过的技术**、**编一段没做过的经历**、
 * **把数字/年限/百分比写大**、**编一个学历或公司**。
 */
export interface FactAtoms {
    /** 技术词（拉丁字母 token，如 React / Kubernetes / MySQL）。 */
    tech: Set<string>;
    /** 数字与单位（`30%`、`5年`、`2000万`、`2021`）。 */
    numbers: Set<string>;
    /** 组织名（公司 / 学校 / 项目名）。 */
    orgs: Set<string>;
}
/** 把一份简历里的所有自由文本摊平（用于抽取事实原子）。 */
export declare function flattenResumeText(content: ResumeContent): string;
export declare function factAtoms(content: ResumeContent): FactAtoms;
export interface FabricationReport {
    ok: boolean;
    /** 人话理由，可直接显示给用户。 */
    reasons: string[];
    /** 具体多出来的东西，便于用户核对。 */
    addedTech: string[];
    addedNumbers: string[];
    addedOrgs: string[];
    /** 多出来的技能名（**中文技能也能查出来**，见下面的结构性检查）。 */
    addedSkills: string[];
}
export interface FabricationOptions {
    /**
     * 允许出现的技术词（通常是**目标岗位**的标题与标签里的词）。
     *
     * 为什么需要这个口子：定制后的简历会合法地提到目标岗位（`basics.title` 改成
     * "Java 后端开发"、"简介"里写"希望从事微服务方向"）。这些词来自**岗位**而不是简历，
     * 如果不放行，每一次定制都会被自己的防编造检查拒掉 —— 那种检查最后一定会被关掉，
     * 等于没有检查。
     *
     * **注意放行的范围**：只有技术词能放行。组织名与数字一律严格 ——
     * "多出一段经历"和"把 3 年写成 5 年"才是真正致命的编造。
     */
    allowTech?: readonly string[];
}
/**
 * 检查"定制后"的简历有没有引入原简历里不存在的事实。
 *
 * 三条硬规则（对应 §4.5「新内容不得引入简历中不存在的事实」）：
 *   1. 组织（公司/学校/项目）只允许**是原集的子集** —— 不许加一段经历；
 *   2. 技术词不许**新增**（`allowTech` 里的除外）—— 这是最常见的编造
 *      （"顺手写个 Kubernetes"，面试第一轮就穿）；
 *   3. 数字/年限/百分比不许**新增** —— 把 3 年写成 5 年属于致命失真。
 */
export declare function checkNoFabrication(original: ResumeContent, candidate: ResumeContent, options?: FabricationOptions): FabricationReport;
/** 从一段文本里抽出技术词（供 `allowTech` 使用：岗位标题 + 标签）。 */
export declare function techTokensOf(text: string): string[];
/** 去掉文件名里不能用的字符（Windows 比 POSIX 更严，按 Windows 来）。 */
export declare function sanitizeFileName(name: string): string;
/** 默认文件名：`姓名-岗位方向-年限.pdf`（R4）。 */
export declare function resumeFileName(content: ResumeContent, format: string): string;
export interface ResumeFileDto {
    id: number;
    format: string;
    fileName: string;
    bytes: number;
    createdAt: string;
}
export interface ResumeDto {
    id: number;
    /** 方向 / 版本名，如「Java 后端 · 2026 春」。 */
    name: string;
    direction: string;
    language: ResumeLanguage;
    state: ResumeState;
    /** 是否是当前启用的版本（同方向只应有一个）。 */
    isDefault: boolean;
    content: ResumeContent;
    /** 该版本的版本号；匹配分据此判断是否失效（§4.1）。 */
    rev: number;
    createdAt: string;
    updatedAt: string;
    files: ResumeFileDto[];
    /** 未采用的定制数量，界面上给个角标。 */
    tailoringCount: number;
}
/** 列表用的轻量形状：不把整份简历塞进列表（§22.5 同样的理由）。 */
export interface ResumeSummaryDto {
    id: number;
    name: string;
    direction: string;
    language: ResumeLanguage;
    state: ResumeState;
    isDefault: boolean;
    rev: number;
    updatedAt: string;
    /**
     * 这一版导出的附件（**不含磁盘路径**，见 `ResumeFileDto`）。
     *
     * 为什么要带在列表里：投递时要选"用哪份简历"，而那个选择落在**附件**上
     * （`resume_file.id`）—— 列表里不带 id，选简历这件事就只能靠"每版再请求一次"拼出来。
     * 本身是几个标量，不违反"列表不带正文"的那条纪律。
     */
    files: ResumeFileDto[];
    /** 结构化程度概览，让用户一眼看出"这份填得全不全"。 */
    counts: {
        skills: number;
        experiences: number;
        projects: number;
        education: number;
        files: number;
    };
    issues: number;
}
export interface TailoringDto {
    id: number;
    resumeId: number;
    jobId: number;
    jobTitle: string | null;
    companyName: string | null;
    content: ResumeContent;
    /** `llm` = 模型产出（已过防编造）；`rule` = 规则降级。 */
    via: 'llm' | 'rule';
    notes: string[];
    adopted: boolean;
    outcome: string | null;
    createdAt: string;
}
//# sourceMappingURL=resume.d.ts.map