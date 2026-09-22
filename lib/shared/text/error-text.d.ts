/** 故障类别 —— 界面据此给排查入口，不自己猜。 */
export type FailureKind = 'selector'
/**
 * **身份键没解析出来**（解析出了记录，但一条都没有平台岗位 id）。
 *
 * 单独立一个类别而不是并进 `selector`：并进去之后的短文案是"没解析到岗位"，
 * 而这一种的情况恰恰是"解析到了 4 条、一条都没写" —— 说成"没解析到"会把人引到
 * 错误的排查方向上（他会去翻卡片选择器，而问题在 id 正则上）。
 */
 | 'identity' | 'script' | 'login' | 'risk' | 'navigation' | 'platform-paused' | 'quota' | 'offline'
/** 到单轮预算上限主动停手 —— **不是故障**，是保险丝生效（已抓到的都入库了）。 */
 | 'budget' | 'unknown';
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