/**
 * 薪资解析（§4.10.2）—— **纯规则，不走 LLM**。
 *
 * 输入形如 `15-25K` / `1.3-1.8万` / `20-40万/年` / `15薪` / `面议` / `****元`，
 * 归一化成 `(下限, 上限, 月数, 是否面议, 原始文本)`，单位统一到 **元/月**。
 *
 * **保留原始文本**：解析结果只用于筛选排序，展示与人工核对一律用 `raw`，绝不覆盖原文。
 */
/** 全角 → 半角，并统一各种连字符与空白。 */
function normalizeText(input) {
    let out = '';
    for (const char of input) {
        const code = char.codePointAt(0) ?? 0;
        if (code === 0x3000)
            out += ' ';
        else if (code >= 0xff01 && code <= 0xff5e)
            out += String.fromCodePoint(code - 0xfee0);
        else
            out += char;
    }
    return out
        .replace(/[～~—–－_]/g, '-')
        .replace(/\s+/g, '')
        .toLowerCase()
        .trim();
}
const MONTHS_RE = /(\d{1,2})\s*薪/;
const NEGOTIABLE_RE = /面议|面谈|详谈|保密/;
const ABOVE_RE = /以上|起步|起$|\+/;
const BELOW_RE = /以下|以内|封顶|最高/;
/** 判定单位与「数值 → 元/月」的换算系数；`null` 表示无法可靠折算。 */
function resolveScale(text) {
    const wan = text.includes('万');
    const k = /k|千/.test(text);
    const yuan = text.includes('元');
    const perYear = /年|annual/.test(text);
    const perDay = /天|日/.test(text);
    if (perDay)
        return { unit: 'day', factor: null };
    if (wan && perYear)
        return { unit: 'year', factor: 10000 / 12 };
    if (wan)
        return { unit: 'month', factor: 10000 };
    if (k)
        return { unit: 'month', factor: 1000 };
    if (yuan && perYear)
        return { unit: 'year', factor: 1 / 12 };
    // `元/月`、以及光秃秃的 `8000-10000` 一律按月薪处理
    return { unit: 'month', factor: 1 };
}
/** 把解析出的数值按系数折算成元/月，四舍五入到整数。 */
function toMonthly(value, factor) {
    return Math.round(value * factor);
}
/**
 * 解析一条薪资文本。任何情况下都不抛错：看不懂就返回全 null 并把原因写进 `note`。
 */
export function parseSalary(input) {
    const raw = typeof input === 'string' ? input.trim() : '';
    const base = { raw, min: null, max: null, months: null, negotiable: false, unit: 'unknown' };
    if (raw === '')
        return { ...base, note: 'empty' };
    const text = normalizeText(raw);
    const monthsMatch = MONTHS_RE.exec(text);
    const months = monthsMatch?.[1] === undefined ? null : Number(monthsMatch[1]);
    // 关键：「15薪」里的 15 不是薪资数字，必须在抽数字前摘掉
    const body = text.replace(MONTHS_RE, '');
    if (NEGOTIABLE_RE.test(body)) {
        return { ...base, months, negotiable: true, unit: 'unknown', note: 'negotiable' };
    }
    const numbers = (body.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
    if (numbers.length === 0) {
        return { ...base, months, note: 'no-number' };
    }
    const { unit, factor } = resolveScale(body);
    if (unit === 'day' || factor === null) {
        return { ...base, months, unit, note: 'unsupported-unit' };
    }
    const f = factor;
    const first = numbers[0];
    if (first === undefined)
        return { ...base, months, note: 'no-number' };
    if (numbers.length === 1) {
        if (ABOVE_RE.test(body) && !BELOW_RE.test(body)) {
            return { ...base, months, min: toMonthly(first, f), max: null, unit };
        }
        if (BELOW_RE.test(body) && !ABOVE_RE.test(body)) {
            return { ...base, months, min: null, max: toMonthly(first, f), unit };
        }
        const value = toMonthly(first, f);
        return { ...base, months, min: value, max: value, unit };
    }
    const second = numbers[1];
    const low = Math.min(first, second);
    const high = Math.max(first, second);
    return { ...base, months, min: toMonthly(low, f), max: toMonthly(high, f), unit };
}
/**
 * 年包（元），用于排序与统计。面议或缺下限时返回 null —— **不要**用 0 冒充未知。
 */
export function annualPackage(salary) {
    if (salary.min === null)
        return null;
    const months = salary.months ?? 12;
    return salary.min * months;
}
//# sourceMappingURL=salary.js.map