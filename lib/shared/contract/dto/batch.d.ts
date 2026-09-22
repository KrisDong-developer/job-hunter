/**
 * batch 域的对外 DTO —— 领域层与 HTTP / 工具之间的 JSON 边界（§4.3 字段级铁律 P7）。
 *
 * **只允许标量 JSON**：禁止 page / session / Cordis service / 任何活对象穿越这一层。
 */
import type { DeliveryState } from '../enums/job.js';
/**
 * 批量发送里"这一条为什么发不出去"。
 *
 * 单独一个结构（而不是一句话）是因为**界面要按它分组**：
 * "平台不支持"和"同一个公司今天已经发过"对用户是两个完全不同的结论
 * （前者只能放弃，后者明天再来）。
 */
export interface GreetingBatchBlockerDto {
    /** 机器可判的类别。 */
    code: 'missing' | 'platform_unsupported' | 'not_logged_in' | 'guard_denied' | 'duplicate_company' | 'quota_exhausted' | 'draft_failed';
    message: string;
    hint?: string;
    /** 被闸门拦时，是哪条规则（`switch` / `window` / `quota` / `cooldown` / `stealth`…）。 */
    reason?: string;
}
/** 批量预览里的一条（`POST /greeting/send-batch/preview`）。 */
export interface GreetingBatchItemDto {
    jobId: number;
    title: string;
    company: string;
    platformId: string;
    /** 会不会真的发出去。 */
    willSend: boolean;
    /** 不会时给出原因；`willSend` 时为 null。 */
    blocker: GreetingBatchBlockerDto | null;
    /**
     * 将发送的话术全文（只有 `willSend` 的项才有）。
     *
     * 为什么预览阶段就把它生成出来：§4.4.2 要求确认时看到**正文全文**。
     * 只在"能发"的项上生成，是为了不为一批注定发不出去的岗位白花模型调用。
     */
    text: string | null;
    /** 话术来源：模型 / 模板 / 调用方给定。 */
    via: 'llm' | 'template' | 'given' | null;
    /** 平台自己还会做的额外动作（如 BOSS 点「立即沟通」会先替你发一句默认招呼语）。 */
    sideEffect: string | null;
}
/** `POST /greeting/send-batch/preview` 的结果。**只读、无副作用**。 */
export interface GreetingBatchPlanDto {
    generatedAt: string;
    items: GreetingBatchItemDto[];
    /** 能发的条数。 */
    sendable: number;
    blocked: number;
    /** 服务端单次上限；超过要分批（界面按同一个数切）。 */
    batchMax: number;
    /** 条与条之间的随机间隔范围 —— 如实告诉用户"慢是故意的"。 */
    intervalMs: {
        min: number;
        max: number;
    };
    /**
     * 逐条说明必须随响应下发的原因：这份预览是**预测**（同公司冷却、当日额度余量都在批内模拟过），
     * 但真正的判定仍然发生在每一条的闸门上 —— 预测与实际不一致时以实际为准。
     */
    note: string;
}
/** 批量发送的**逐条回执**。 */
export interface GreetingBatchReceiptDto {
    jobId: number;
    title: string;
    company: string;
    ok: boolean;
    sentAt: string | null;
    /** 发送成功时的话术长度（审计与回执都只留长度，不留正文）。 */
    textLength: number | null;
    /** 失败时的原因（与 `GreetingBatchBlockerDto.code` 同源，便于界面统一渲染）。 */
    code: string | null;
    message: string | null;
    hint: string | null;
}
/** `POST /greeting/send-batch` 的结果。 */
export interface GreetingBatchResultDto {
    executedAt: string;
    receipts: GreetingBatchReceiptDto[];
    sent: number;
    failed: number;
    /** 实际耗时（含随机间隔）——用户能看出"慢是故意的"。 */
    elapsedMs: number;
    note: string;
}
/**
 * 批量投递的**逐条阻塞原因**（L4）。
 *
 * 为什么不与 `GreetingBatchBlockerDto` 合并成一个宽枚举：两边的取值集合本来就不同
 * （投递多了"平台只吃平台内简历"，少了"话术生成失败"）。合成一个之后，
 * 两边都看不出自己究竟要处理哪些 —— 而这正是"逐条说清为什么"最容易退化的地方。
 */
export interface ApplicationBatchBlockerDto {
    /** 机器可判的类别。 */
    code: 
    /** 岗位不存在（已被清理掉）。 */
    'missing'
    /** 适配器没实现投递（`actions.sendResume` 缺失）。 */
     | 'platform_unsupported' | 'not_logged_in' | 'guard_denied' | 'duplicate_company' | 'quota_exhausted';
    message: string;
    hint?: string;
    /** 被闸门拦时，是哪条规则（`switch` / `window` / `quota` / `cooldown` / `stealth`…）。 */
    reason?: string;
}
/** 批量投递预览里的一条（`POST /applications/deliver-batch/preview`）。 */
export interface ApplicationBatchItemDto {
    jobId: number;
    title: string;
    company: string;
    platformId: string;
    willDeliver: boolean;
    /** 不会投时给出原因；`willDeliver` 时为 null。 */
    blocker: ApplicationBatchBlockerDto | null;
    /** 平台自己还会做的额外动作（如智联投递会顺带替你发一句招呼语）——按**平台事实**给。 */
    sideEffect: string | null;
    /**
     * **提醒**（不影响能不能投）：最典型的是"这个岗位的另一个平台副本已经投过了"。
     *
     * 为什么只提醒不拦：分组是**启发式**判出来的（同公司归一化名 + 同城 + 薪资不冲突 +
     * 标题 ≥0.9），判错的时候拦下来会让用户投不出去、还不知道为什么。而"同一家公司的
     * 两个平台副本各投一次"这件事本身，是用户最想避免的重复劳动 —— 所以必须说出来。
     */
    warning: string | null;
}
/** `POST /applications/deliver-batch/preview` 的结果。**只读、无副作用**。 */
export interface ApplicationBatchPlanDto {
    generatedAt: string;
    items: ApplicationBatchItemDto[];
    sendable: number;
    blocked: number;
    /** 服务端单次上限；超过要分批（界面按同一个数切）。 */
    batchMax: number;
    /** 条与条之间的随机间隔范围 —— 如实告诉用户"慢是故意的"。 */
    intervalMs: {
        min: number;
        max: number;
    };
    /**
     * 整批共用的那份简历（`resume_file.id`）；`null` = 用**平台内简历**。
     *
     * §4.4.2 要求确认时能看到"用了哪版简历"，所以它必须随计划一起下发 ——
     * 而不是等到发送时才由服务端自己决定。
     */
    resumeFileId: number | null;
    /** 上面那份的可读标签（简历名 + 附件文件名）；`null` = 平台内简历。 */
    resumeLabel: string | null;
    /**
     * 指定的那份文件**会不会真的上传给平台**。
     *
     * * `null` = 没指定文件（用平台内简历），这一格不适用；
     * * `true` = 这些平台接受本地附件 ⇒ 适配器会用它投；
     * * `false` = 这些平台只吃**它们自己那份**（实测：没有"把本地文件发给 HR"的入口）⇒
     *   文件**不会**上传。这一批**照投**（平台用它自己那份），那份简历只作**本地登记**。
     *
     * ⚠️ 这一格存在的唯一理由是"不许让用户误会"：不说清的话，他会以为自己传了一版、
     * 而平台上收到的其实是另一版 —— 而投递不可逆。
     */
    uploadsResumeFile: boolean | null;
    /**
     * 逐条说明必须随响应下发的原因：这份预览是**预测**（同公司冷却与当日额度余量都在批内模拟过），
     * 但真正的判定仍然发生在每一条的闸门上 —— 不一致时以实际为准。
     */
    note: string;
}
/** 批量投递的**逐条回执**。 */
export interface ApplicationBatchReceiptDto {
    jobId: number;
    title: string;
    company: string;
    ok: boolean;
    sentAt: string | null;
    /**
     * 送达状态。投递比打招呼更需要这一格：`pending` = "动作发出去了，但没能确认送达"，
     * 而投递**不可逆**且可能已经成功 —— 用户据此决定去平台上核对，而不是直接重投。
     */
    delivery: DeliveryState | null;
    /** 失败时的原因（与 `ApplicationBatchBlockerDto.code` 同源，便于界面统一渲染）。 */
    code: string | null;
    message: string | null;
    hint: string | null;
}
/** `POST /applications/deliver-batch` 的结果。 */
export interface ApplicationBatchResultDto {
    executedAt: string;
    receipts: ApplicationBatchReceiptDto[];
    /** 真的投出去的条数（`delivery` 不是 `failed` 的那些）。 */
    sent: number;
    failed: number;
    /** 实际耗时（含随机间隔）——用户能看出"慢是故意的"。 */
    elapsedMs: number;
    note: string;
}
//# sourceMappingURL=batch.d.ts.map