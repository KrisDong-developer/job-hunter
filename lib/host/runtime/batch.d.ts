/** 条与条之间的随机间隔（毫秒）。 */
export interface BatchInterval {
    readonly min: number;
    readonly max: number;
}
/**
 * 批内**同一家公司只让过一条**。
 *
 * 照 `checkCooldown` 的口径：冷却期内同一家公司的第二条会被闸门拦下。
 * 区别在于闸门看的是**库里已有的记录**，而这里看的是"这一批的**前几条**已经排掉了哪些公司"——
 * 那些记录此刻还不存在，但这一批发完就存在了。所以是"占名额"，不是查表。
 *
 * 第一个通过闸门的公司先占名额，后面的同公司条目在预览里就被标成 `duplicate_company`。
 */
export declare class CompanyDeduper {
    readonly cooldownMinutes: number;
    private readonly seen;
    /**
     * @param cooldownMinutes 冷却期分钟数。`0` = 不限制 —— 那就不去重
     *   （用户把冷却期关掉之后，预览不该还在拦他）。
     */
    constructor(cooldownMinutes: number);
    /** 这家公司在**这一批**里是不是已经排过一条了。 */
    blocked(companyId: number | null): boolean;
    /**
     * 占掉这家公司的名额。
     *
     * **只在确定这一条真的会被发出之后**调用 —— 提前调用会让那些"其实发不出去"的
     * 条目把名额占掉，后面的同公司条目就被误判成重复。
     */
    take(companyId: number | null): void;
}
/** 当日额度余量的读数（与 `checkQuota` 同源，见 `guardUsageOf`）。 */
export interface QuotaReadout {
    remaining: number;
    limit: number;
    used: number;
}
/**
 * 批内**当日额度预占**：把"这一批发出去会消耗掉的名额"从余量里扣掉。
 *
 * 读数由调用方注入（runtime 里就是 `guardUsageOf`）—— 与真正的判定**同源**。
 * 各算一份必然漂移，而漂移的表现是"预览说能发 3 条、点下去第 2 条就被拒"：
 * 那比没有预览更恼火，所以宁可让这里依赖同一个读数。
 *
 * 取不到读数时**不预测**（`reserved: true`），由调用方在 `note` 里如实说明这是预测。
 */
export declare class QuotaReserver {
    private readonly remainingToday;
    private readonly left;
    constructor(remainingToday: (platformId: string) => QuotaReadout | null);
    /**
     * 取一个名额。
     *
     * `reserved: false` 时带上读数 —— 只回一句"额度用完了"没有信息量，
     * 用户要看到"今天在 BOSS 已经发了 20/20"才知道该改哪里。
     */
    take(platformId: string): {
        reserved: true;
    } | {
        reserved: false;
        limit: number;
        used: number;
    };
}
/**
 * 条数校验：空列表与超上限都在**进入循环之前**拒绝。
 *
 * 两件事放在一起是因为它们是同一个语义（"不要静默成功"与"必须分批"），只有名词不同。
 * 空列表单独挡的原因：返回一个空回执会让人以为"没什么可发的"。
 */
export declare function assertBatchSize(size: number, max: number, noun: string): void;
/**
 * 这一条发送**之前**要等的毫秒数。
 *
 * 间隔插在**条与条之间**：第一条不等（用户刚点完确认），最后一条后面也不等。
 * 返回 `null` = 不用等（调用方据此跳过 `sleep`，测试也据此断言"单条 0 次等待"）。
 */
export declare function interItemDelayMs(index: number, random: () => number, interval: BatchInterval): number | null;
/** 把一条失败翻译成回执字段（逐条回执**绝不**把异常整批抛出去）。 */
export declare function failureOf(error: unknown): {
    code: string;
    message: string;
    hint: string | null;
};
//# sourceMappingURL=batch.d.ts.map