/**
 * Offer 待遇明细（§4.H H1，需求原文列了 16 个维度）。
 *
 * ## 为什么是"字段清单"而不是一坨自由 JSON
 *
 * H1 要的是一张**对比表**：两个 offer 的公积金比例、试用期工资、竞业补偿并排放，
 * 差异要自己跳出来。自由 JSON 做不到这件事 —— 界面只能把 JSON 打出来给人看，
 * 而"哪一格差了几万"恰好是这张表存在的理由。
 *
 * 所以每个字段的**键、标签、单位、比较方向**在这里声明一次（`OFFER_COMP_FIELDS`），
 * 对比表按它逐行渲染。宿主与界面看到的是同一份口径（与 `facets.ts` 同一条纪律）。
 *
 * ## 四条刻意的取值约定
 *
 * 1. **缺省 = 未知，不是 0**。`undefined` 表示"对方没说"或"用户还没填"，
 *    对比表渲染成"未填写"。当成 0 会让"没写进合同的年终奖"看起来像"没有年终奖"——
 *    而这两件事在谈薪时是相反的结论。
 * 2. **比例用百分数**（`probationRatio: 80` = 试用期发 80%），与中文语境一致
 *    （"公积金 12%"不用先在心里换成 0.12）。
 * 3. `annualCash` **可推导、可覆盖**：能算就替用户算
 *    （`月 base × 月数 + 年终奖 + 补贴`），用户显式给了就以用户的为准。
 *    它只算**现金**：股票/期权单列成 `equityValue`，因为"年化多少"依赖上市与股价，
 *    混进现金总包会让对比表给出一个假的精确数。
 * 4. 文本字段（`equityNote` / `penaltyNote` / `overtimeNote`）**不进对比数值**，
 *    只并排显示 —— 它们是"要去问 HR 的问题"，不是可比的数字。
 */
/** 对比表里一行的比较方向（决定"哪一格更好"）。 */
export type OfferCompDirection = 'higher' | 'lower' | 'none';
export interface OfferComp {
    /** 月 base（元/月）。 */
    monthlyBase?: number;
    /** 年发放月数（12 / 13 / 15 / 16…）。 */
    monthsPerYear?: number;
    /** 年终奖（元/年）。 */
    bonusYearly?: number;
    /** 年终奖**是否写进合同**（口头承诺与合同条款是两件事）。 */
    bonusInContract?: boolean;
    /** 补贴与餐补（元/年）。 */
    allowanceYearly?: number;
    /** 年现金总包（元）。不填则按上面几项推导。 */
    annualCash?: number;
    /** 股票期权年化（元/年）。 */
    equityValue?: number;
    /** 行权价 / 归属节奏 / 回购条款。 */
    equityNote?: string;
    /** 社保基数（元/月）。 */
    socialInsuranceBase?: number;
    /** 公积金比例（%）。 */
    housingFundRatio?: number;
    /** 公积金基数（元/月）。 */
    housingFundBase?: number;
    /** 试用期时长（月）。 */
    probationMonths?: number;
    /** 试用期工资比例（%）。 */
    probationRatio?: number;
    /** 竞业限制时长（月）。 */
    noncompeteMonths?: number;
    /** 竞业补偿（元/月）。 */
    noncompeteComp?: number;
    /** 违约金 / 服务期。 */
    penaltyNote?: string;
    /** 年假（天）。 */
    annualLeaveDays?: number;
    /** 加班与调休。 */
    overtimeNote?: string;
    /** 单程通勤（分钟）。 */
    commuteMin?: number;
    /** 搬家 / 搬迁成本（元，一次性）。 */
    relocationCost?: number;
    /** 备注。 */
    note?: string;
}
export type OfferCompKind = 'money' | 'percent' | 'count' | 'bool' | 'text';
export interface OfferCompFieldSpec {
    key: keyof OfferComp;
    label: string;
    kind: OfferCompKind;
    /** 金额口径：`year` / `month` / `once`。只影响显示与推导。 */
    moneyUnit?: 'year' | 'month' | 'once';
    /** 数值比较方向；`none` = 不判断"哪格更好"（文本、布尔、无绝对好坏的量）。 */
    direction: OfferCompDirection;
    /** 为什么这项值得单列（对比表上鼠标悬停能看到）。 */
    hint: string;
}
/**
 * 全部字段与显示口径。**顺序就是对比表的行序**（现金在前、隐性成本在后）。
 *
 * `direction` 只对**真的有绝对好坏**的量给方向：通勤越低越好、年假越多越好；
 * 而"社保基数"高低各有各的说法（高基数当期到手少），标 `none` 不替用户下判断。
 */
export declare const OFFER_COMP_FIELDS: readonly OfferCompFieldSpec[];
/**
 * 把不可信输入（界面手搓的 JSON、模型给的 JSON）收敛成 `OfferComp`。
 *
 * 只认识声明过的键，其余一律丢弃；非法值**当没填**（而不是编一个 0）——
 * 一个错误的 0 会污染对比表与"差多少"的结论，而缺一个字段只是多一行"未填写"。
 */
export declare function normalizeOfferComp(input: unknown): OfferComp;
/**
 * 年现金总包（元）。
 *
 * 口径只含**现金**：`月 base × 年发放月数 + 年终奖 + 补贴`。
 * 算不出来就返回 `null` —— 缺月数时**不假设 12**（"没有信息"与"12 薪"是两个结论）。
 */
export declare function annualCashOf(comp: OfferComp): number | null;
/** 明细里**一个字段都没填**（用来判断"这份 offer 是不是空壳"）。 */
export declare function isOfferCompEmpty(comp: OfferComp): boolean;
/** 把一项显示成人话；`undefined` → `null`（界面渲染成"未填写"，不是 0）。 */
export declare function offerCompDisplay(spec: OfferCompFieldSpec, comp: OfferComp): string | null;
/** 金额显示：`18000` → `1.8 万`（对比表里逐位读数字太累）。 */
export declare function formatMoney(value: number): string;
//# sourceMappingURL=offer-comp.d.ts.map