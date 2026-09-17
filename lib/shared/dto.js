/**
 * SR-17：跳过原因枚举。**界面显示人话，不显示这个英文键**。
 *
 * 枚举而不是自由文本：自由文本最后一定会退化成"已武装"这种什么都没说的话，
 * 而"为什么没跑"恰恰是用户最需要知道的。
 */
export const SKIP_REASONS = [
    'not_logged_in',
    'adapter_broken',
    'risk_paused',
    'lease_lost',
    'offline_gate',
    'outside_window',
    'quota_reached',
    'another_run_active',
    'backoff',
    'global_pause',
    'plan_disabled',
];
// ── 看板遗留（批次 F）────────────────────────────────────────────────
/**
 * 薪资统计的口径（F1）。
 *
 * **必须显式**：同一个岗位库按"月薪下限"和按"年薪折算"算出来的中位数可以差好几成，
 * 而界面上如果不写清用的是哪一个，那个数字就是在骗人。
 */
export const SALARY_BASES = ['monthly_min', 'annualized'];
export const SALARY_BASIS_LABEL = {
    monthly_min: '月薪下限（元/月）',
    annualized: '年薪折算（元/年，按 12 个月兜底）',
};
/**
 * 简历 A/B 对比的**诚实性**说明（F3）。
 *
 * 写在这里而不是服务里，是为了让界面与工具文案共用同一句话 ——
 * "样本不够就别看显著性"这条规矩必须只有一份。
 */
export const RESUME_COMPARE_CAVEAT = '这张表只做**对比**，不做显著性检验：这是本地小样本，任何"某版简历更有效"的说法都可能是噪音。' +
    '每一格都标了样本量，样本不足的格子会被显式标出来 —— 那时请看数字，别下结论。';
//# sourceMappingURL=dto.js.map