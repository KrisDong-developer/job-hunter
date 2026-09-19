/**
 * analytics 域的取值域与中文标签。
 *
 * 标签与取值域放在同一个文件：`Record<取值, string>` 由 TS 保证穷尽，
 * 新增一个取值必然在这里编译报错 —— 这比"另一处也别忘了改"强。
 * 界面与模型返回文本取的是同一份词（同一条纪律：只此一份）。
 */
/**
 * 薪资统计的口径（F1）。
 *
 * **必须显式**：同一个岗位库按"月薪下限"和按"年薪折算"算出来的中位数可以差好几成，
 * 而界面上如果不写清用的是哪一个，那个数字就是在骗人。
 */
export declare const SALARY_BASES: readonly ["monthly_min", "annualized"];
export type SalaryBasis = (typeof SALARY_BASES)[number];
export declare const SALARY_BASIS_LABEL: Record<SalaryBasis, string>;
//# sourceMappingURL=analytics.d.ts.map