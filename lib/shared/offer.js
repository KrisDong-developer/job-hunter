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
/**
 * 全部字段与显示口径。**顺序就是对比表的行序**（现金在前、隐性成本在后）。
 *
 * `direction` 只对**真的有绝对好坏**的量给方向：通勤越低越好、年假越多越好；
 * 而"社保基数"高低各有各的说法（高基数当期到手少），标 `none` 不替用户下判断。
 */
export const OFFER_COMP_FIELDS = [
    { key: 'monthlyBase', label: '月 base', kind: 'money', moneyUnit: 'month', direction: 'higher', hint: '谈薪的第一锚点，也是其他项的计算基础' },
    { key: 'monthsPerYear', label: '年发放月数', kind: 'count', direction: 'higher', hint: '13/15/16 薪 —— 同样的 base，月数差一年就是几万' },
    { key: 'bonusYearly', label: '年终奖', kind: 'money', moneyUnit: 'year', direction: 'higher', hint: '要问清是"保底"还是"绩效上限"' },
    { key: 'bonusInContract', label: '年终奖写进合同', kind: 'bool', direction: 'none', hint: '口头承诺与合同条款是两件事' },
    { key: 'allowanceYearly', label: '补贴与餐补', kind: 'money', moneyUnit: 'year', direction: 'higher', hint: '房补、餐补、交通补贴合计' },
    { key: 'annualCash', label: '年现金总包', kind: 'money', moneyUnit: 'year', direction: 'higher', hint: '月 base × 月数 + 年终奖 + 补贴；不填会替你算' },
    { key: 'equityValue', label: '股票期权年化', kind: 'money', moneyUnit: 'year', direction: 'higher', hint: '非现金，单列：依赖上市与股价，混进现金会给出假精度' },
    { key: 'equityNote', label: '行权价 / 归属 / 回购', kind: 'text', direction: 'none', hint: '要逐条问 HR：行权价、归属节奏、离职回购价' },
    { key: 'housingFundRatio', label: '公积金比例', kind: 'percent', direction: 'none', hint: '5% 与 12% 一年差几万，但基数高低各有说法，不替你判断' },
    { key: 'housingFundBase', label: '公积金基数', kind: 'money', moneyUnit: 'month', direction: 'none', hint: '按全额还是按最低基数缴，差别很大' },
    { key: 'socialInsuranceBase', label: '社保基数', kind: 'money', moneyUnit: 'month', direction: 'none', hint: '影响当期到手与长期待遇，方向不唯一' },
    { key: 'probationMonths', label: '试用期时长', kind: 'count', direction: 'lower', hint: '试用期内被劝退的成本由此决定' },
    { key: 'probationRatio', label: '试用期工资比例', kind: 'percent', direction: 'higher', hint: '常见 80%，也有 100%' },
    { key: 'noncompeteMonths', label: '竞业限制时长', kind: 'count', direction: 'lower', hint: '只提示风险，不构成法律意见（D-12）' },
    { key: 'noncompeteComp', label: '竞业补偿', kind: 'money', moneyUnit: 'month', direction: 'higher', hint: '按月计；没有补偿的竞业条款要特别留意' },
    { key: 'penaltyNote', label: '违约金 / 服务期', kind: 'text', direction: 'none', hint: '培训服务期、落户服务期都写在这里' },
    { key: 'annualLeaveDays', label: '年假', kind: 'count', direction: 'higher', hint: '法定之外的补充年假' },
    { key: 'overtimeNote', label: '加班与调休', kind: 'text', direction: 'none', hint: '有没有加班费、能不能调休' },
    { key: 'commuteMin', label: '单程通勤', kind: 'count', direction: 'lower', hint: '在职者还要叠加面试与搬家的机会成本' },
    { key: 'relocationCost', label: '搬家成本', kind: 'money', moneyUnit: 'once', direction: 'lower', hint: '跨城 offer 的隐性成本，一次性的' },
    { key: 'note', label: '备注', kind: 'text', direction: 'none', hint: '你自己的补充' },
];
const MONEY_KEYS = new Set(OFFER_COMP_FIELDS.filter((field) => field.kind === 'money').map((field) => field.key));
const PERCENT_KEYS = new Set(OFFER_COMP_FIELDS.filter((field) => field.kind === 'percent').map((field) => field.key));
const COUNT_KEYS = new Set(OFFER_COMP_FIELDS.filter((field) => field.kind === 'count').map((field) => field.key));
const TEXT_KEYS = new Set(OFFER_COMP_FIELDS.filter((field) => field.kind === 'text').map((field) => field.key));
/** 单项金额的上限（元）：一亿。再大就是填错了，宁可当没填也不写进库。 */
const MONEY_MAX = 100_000_000;
const COUNT_MAX = 1_000;
const TEXT_MAX = 300;
/**
 * 把不可信输入（界面手搓的 JSON、模型给的 JSON）收敛成 `OfferComp`。
 *
 * 只认识声明过的键，其余一律丢弃；非法值**当没填**（而不是编一个 0）——
 * 一个错误的 0 会污染对比表与"差多少"的结论，而缺一个字段只是多一行"未填写"。
 */
export function normalizeOfferComp(input) {
    const raw = asRecord(input);
    const out = {};
    for (const field of OFFER_COMP_FIELDS) {
        const value = raw[field.key];
        if (field.kind === 'bool') {
            if (typeof value === 'boolean')
                out[field.key] = value;
            continue;
        }
        if (field.kind === 'text') {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed !== '' && TEXT_KEYS.has(field.key)) {
                    out[field.key] = trimmed.slice(0, TEXT_MAX);
                }
            }
            continue;
        }
        const parsed = numeric(value);
        if (parsed === null)
            continue;
        if (field.kind === 'money' && MONEY_KEYS.has(field.key)) {
            if (parsed >= 0 && parsed <= MONEY_MAX)
                out[field.key] = Math.round(parsed);
        }
        else if (field.kind === 'percent' && PERCENT_KEYS.has(field.key)) {
            if (parsed >= 0 && parsed <= 100)
                out[field.key] = parsed;
        }
        else if (field.kind === 'count' && COUNT_KEYS.has(field.key)) {
            if (parsed >= 0 && parsed <= COUNT_MAX)
                out[field.key] = Math.trunc(parsed);
        }
    }
    return out;
}
/**
 * 年现金总包（元）。
 *
 * 口径只含**现金**：`月 base × 年发放月数 + 年终奖 + 补贴`。
 * 算不出来就返回 `null` —— 缺月数时**不假设 12**（"没有信息"与"12 薪"是两个结论）。
 */
export function annualCashOf(comp) {
    if (typeof comp.annualCash === 'number')
        return comp.annualCash;
    if (typeof comp.monthlyBase !== 'number' || typeof comp.monthsPerYear !== 'number')
        return null;
    return Math.round(comp.monthlyBase * comp.monthsPerYear + (comp.bonusYearly ?? 0) + (comp.allowanceYearly ?? 0));
}
/** 明细里**一个字段都没填**（用来判断"这份 offer 是不是空壳"）。 */
export function isOfferCompEmpty(comp) {
    return Object.keys(comp).length === 0;
}
/** 把一项显示成人话；`undefined` → `null`（界面渲染成"未填写"，不是 0）。 */
export function offerCompDisplay(spec, comp) {
    const value = comp[spec.key];
    if (value === undefined || value === null)
        return null;
    if (typeof value === 'boolean')
        return value ? '是' : '否';
    if (typeof value === 'string')
        return value === '' ? null : value;
    if (spec.kind === 'money') {
        const unit = spec.moneyUnit === 'month' ? '/月' : spec.moneyUnit === 'once' ? '（一次性）' : '/年';
        return `${formatMoney(value)}${unit}`;
    }
    if (spec.kind === 'percent')
        return `${String(value)}%`;
    if (spec.key === 'commuteMin')
        return `${String(value)} 分钟`;
    if (spec.key === 'annualLeaveDays')
        return `${String(value)} 天`;
    if (spec.key === 'monthsPerYear')
        return `${String(value)} 个月`;
    return String(value);
}
/** 金额显示：`18000` → `1.8 万`（对比表里逐位读数字太累）。 */
export function formatMoney(value) {
    if (Math.abs(value) >= 10000) {
        const wan = value / 10000;
        return `${wan % 1 === 0 ? String(wan) : wan.toFixed(1)} 万`;
    }
    return `${String(value)} 元`;
}
function numeric(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    // 数字字符串收下来：界面上的数字输入框与手搓 JSON 都可能给字符串
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function asRecord(input) {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
        ? input
        : {};
}
//# sourceMappingURL=offer.js.map