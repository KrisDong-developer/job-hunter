import type { AdapterMaturityFact, AuthRequirementFact } from './types.js';
export interface PlatformFacts {
    maturity: AdapterMaturityFact;
    authRequirement: AuthRequirementFact;
    /**
     * 平台的**每日动作安全上限**（平台事实）。
     *
     * 与用户的 `dailyLimits` 是**两层**：用户设的是"我今天想投多少"，
     * 这里是"这个平台允许多少"（超出会被限流、甚至标记账号）。取两者**较小的**。
     *
     * `undefined` = **不知道** —— 那时只有用户自己的额度在管。
     * 不知道就不编一个保守值：编出来的数字会平白拦掉合法使用，
     * 而"少投了几个"和"被平台盯上"都由用户承担，不该由我们瞎猜。
     */
    dailyCaps?: {
        greeting?: number;
        application?: number;
    };
    /**
     * 投递时**平台自己还会做**的额外动作（平台事实，进审批文案）。
     *
     * 为什么要有这一格：智联的「立即投递」一次点击 = 投简历 **+ 平台自动发一句招呼语**
     * （实测结果弹窗：「已向对方发送简历和打招呼语」）。这是用户在按下"确认"之前就必须知道的事 ——
     * 只写"用哪版简历"是不够的，他同时还在替自己说了一句话。
     *
     * `undefined` = 该平台没有这类副作用（实测如此，不是"没查"）。
     */
    applicationSideEffect?: string;
    /**
     * 打招呼时**平台自己还会做**的额外动作（平台事实，进审批文案）。
     *
     * BOSS 求职者端实测：点「立即沟通」会**先由平台替你发一句默认招呼语**，随后适配器才发
     * 用户那段 text —— 一次 `greeting.send` 会在会话里留下**两条**消息。
     *
     * 这里如实写出来而不是"让适配器少发一条"：用户要的正是他那段话术，不能替他省掉；
     * 但"对方会先看到一句不是你写的问候"必须在他按"确认"之前就知道。
     *
     * `undefined` = 该平台没有这类副作用（实测如此，不是"没查"）。
     */
    greetingSideEffect?: string;
}
/**
 * 已注册平台的认知表。键 = `SiteAdapter.id`。
 *
 * 分级口径见 `MATURITY_LEVEL_LABEL`；这里的分档依据是**证据强度**：
 *   * `stable`       = 真实夹具 + 真机冒烟通过；
 *   * `calibrated`   = 真实探针/响应夹具验证过，但有已知未覆盖的部分；
 *   * `experimental` = 夹具缺失、关键契约未确证、或没有测试；
 *   * `disabled`     = 平台侧已不可用（需改配置才启用）。
 */
export declare const PLATFORM_FACTS: Record<string, PlatformFacts>;
/**
 * 取某个平台的事实。
 *
 * 未登记的 id **不抛错**（否则新增适配器会以最难查的方式失败），
 * 而是给一个**保守默认**：实验性 + 全部未验证。
 * 这会同时让它在界面上显示为"实验"，以及被契约测试点名。
 */
export declare function platformFacts(id: string): PlatformFacts;
//# sourceMappingURL=platform-facts.d.ts.map