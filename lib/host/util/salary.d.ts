/**
 * 薪资解析（§4.10.2）—— **纯规则，不走 LLM**。
 *
 * 输入形如 `15-25K` / `1.3-1.8万` / `20-40万/年` / `15薪` / `面议` / `****元`，
 * 归一化成 `(下限, 上限, 月数, 是否面议, 原始文本)`，单位统一到 **元/月**。
 *
 * **保留原始文本**：解析结果只用于筛选排序，展示与人工核对一律用 `raw`，绝不覆盖原文。
 */
/** 解析结果的单位语义。`day` 表示无法可靠折算到月，因此 min/max 留空。 */
export type SalaryUnit = 'month' | 'year' | 'day' | 'unknown';
export interface ParsedSalary {
    /** 原始文本（trim 后，未做任何改写）。 */
    raw: string;
    /** 月薪下限（元），不可得为 null。 */
    min: number | null;
    /** 月薪上限（元），不可得为 null。 */
    max: number | null;
    /** 年发薪月数（如 `15薪` → 15），未提及为 null。 */
    months: number | null;
    /** 是否面议。 */
    negotiable: boolean;
    unit: SalaryUnit;
    /** 诊断用：为什么 min/max 是空的。 */
    note?: string;
}
/**
 * 解析一条薪资文本。任何情况下都不抛错：看不懂就返回全 null 并把原因写进 `note`。
 */
export declare function parseSalary(input: string): ParsedSalary;
/**
 * 年包（元），用于排序与统计。面议或缺下限时返回 null —— **不要**用 0 冒充未知。
 */
export declare function annualPackage(salary: ParsedSalary): number | null;
//# sourceMappingURL=salary.d.ts.map