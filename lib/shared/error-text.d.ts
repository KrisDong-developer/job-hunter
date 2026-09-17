/**
 * 错误信息 → **人话**（host 与 client 共用）。
 *
 * 实测的界面缺陷：运行历史里直接把 `errorMsg` 印出来，于是非技术用户看到的是
 *
 *     page.evaluate: ReferenceError: maxCards is not defined
 *         at extractJobsInPage (eval at evaluate (:302:30), <anonymous>:42:11)
 *         at Page.evaluate (...)
 *
 * —— 一串堆栈。用户既读不懂，也不知道该做什么。
 *
 * 这一层做两件事：
 *   1. 给一个**短句**（"适配器脚本执行异常"），让用户一眼知道出在哪一类；
 *   2. 给一个 `kind`，界面据此提供**下一步怎么办**（而不是"死胡同"提示）；
 *      原始全文仍然完整保留在 `detail` 里，可展开查看 —— **不隐藏信息**。
 *
 * 纯函数：所以宿主日志、工具返回文本、界面提示三处用的是同一份判断。
 */
/** 故障类别 —— 界面据此给排查入口，不自己猜。 */
export type FailureKind = 'selector' | 'script' | 'login' | 'risk' | 'navigation' | 'platform-paused' | 'quota' | 'offline' | 'unknown';
export interface FailureText {
    kind: FailureKind;
    /** 一句话短句，直接显示。 */
    short: string;
    /** 这一类故障**下一步该做什么**（人话，可执行）。 */
    advice: string;
    /** 原始信息（完整保留，界面折叠展示）。`null` = 没有原始信息可给。 */
    detail: string | null;
    /** 原始信息看起来像代码堆栈吗（界面据此换一句更友好的标签）。 */
    looksTechnical: boolean;
}
export declare function looksLikeStackTrace(message: string): boolean;
export declare function adviceForFailure(kind: FailureKind): string;
export declare function failureKindOf(errorCode: string | null, message: string): FailureKind;
/**
 * 把一条失败信息翻成人话。
 *
 * @param errorCode 适配器/领域层给的错误码（可为 null）
 * @param errorMsg  原始信息（可为 null；可能是长堆栈）
 */
export declare function humanizeFailure(errorCode: string | null, errorMsg: string | null): FailureText | null;
/** 故障类别 → 界面上的短标签（"排查方案"的标题用）。 */
export declare const FAILURE_KIND_LABEL: Record<FailureKind, string>;
//# sourceMappingURL=error-text.d.ts.map