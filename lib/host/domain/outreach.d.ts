/**
 * 打招呼话术（§4.5 / §22.2 `greeting_draft`）。
 *
 * 这个模块**只生成草稿，绝不发送** —— 发送是 `guard/actions/greeting.ts` 的事，
 * 而 guard 那条路必然要过审批（§4.5.2「不授予动作权」：LLM 输出永远不能直接触发高危动作）。
 *
 * 三件事在这里做，缺一不可：
 *   1. 组外发载荷（只挑标量字段，绝不把整个 job 对象丢出去）；
 *   2. 把 JD 全文当**不可信输入**（§4.5.2 结构性隔离），并扫描注入样本留日志；
 *   3. 输出再校验：任何引入联系方式/收件人的输出一律丢弃，退回模板。
 */
import type { AiService } from '../ai/client.js';
import type { Store } from '../store/store.js';
import type { GreetingDraftDto } from '../../shared/contract/dto/pipeline.js';
import { type GreetingTone } from '../../shared/contract/enums/pipeline.js';
/** 话术长度约束：太短没内容，太长 HR 不会看。 */
export declare const GREETING_MIN_CHARS = 15;
export declare const GREETING_MAX_CHARS = 400;
/** 只允许这些字段外发 —— 白名单，不是黑名单（§4.5 隐私闸门）。 */
export declare const GREETING_ALLOW_FIELDS: readonly ["jobTitle", "companyName", "city", "salaryRaw", "expReq", "eduReq", "tags", "flagLabels", "tone", "highlights"];
export interface InjectionHit {
    name: string;
    /** 命中的片段（已截断），便于事后分析。 */
    sample: string;
}
/** 扫描不可信文本里的注入样本。返回空数组表示没看到可疑内容 —— 不代表"安全"。 */
export declare function scanInjection(text: string, limit?: number): InjectionHit[];
/**
 * 输出再校验（§4.5.2 第三层）。
 *
 * 拒绝的不是"提到了联系方式"，而是**草稿自己引入了联系方式** ——
 * 用户的简历里有没有电话不归这里管，这里管的是"模型往话术里塞了一个新号码"。
 */
export declare function validateGreetingText(text: string): string | undefined;
/** 打招呼草稿的生成结果；`via` 由上层原样透传给用户。 */
export type GreetingDraft = GreetingDraftDto;
export interface GreetingDraftInput {
    jobId: number;
    tone?: GreetingTone;
    /** 用户自选要突出的经历要点（可选，最长 3 条）。 */
    highlights?: string[];
    /** 自定义补充说明，直接作为可信指令的一部分。 */
    extra?: string;
}
export interface OutreachDeps {
    store: Store;
    ai: AiService;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
    };
    /** 注入样本落日志的钩子（默认走 logger + audit）。 */
    onInjection?: (info: {
        jobId: number;
        hits: InjectionHit[];
    }) => void;
}
export interface OutreachService {
    draft(input: GreetingDraftInput): Promise<GreetingDraft>;
    /** 不发模型，纯模板结果 —— 用于预览模板与离线场景。 */
    template(input: GreetingDraftInput): GreetingDraft;
}
export declare function createOutreachService(deps: OutreachDeps): OutreachService;
export interface TemplateInput {
    title: string;
    companyName: string;
    city: string;
    tags: string[];
    expReq: string;
    tone: GreetingTone;
    highlights: string[];
}
/**
 * 内置模板（降级路径）。
 *
 * 模板刻意写得**保守且可读**：它存在的意义是"模型关了也有东西可用"，
 * 不是"假装这就是 AI 写的"。所以它只用抓到的事实，不造句。
 */
export declare function buildTemplateGreeting(input: TemplateInput): string;
//# sourceMappingURL=outreach.d.ts.map