/**
 * 筛选取值集的归一化（经验梯队 / 学历梯度）。
 *
 * 为什么要这一层：筛选 chips 的取值直接来自各个平台的原始串，而平台之间写法完全不统一 ——
 * 实测库里能同时出现「1-3年 / 1-5年 / 2-3年 / 2年及以上 / 1年以内 / 1年～3年 / 3年～5年 / 应届毕业生」，
 * 十几二十个高度重叠的选项铺在界面上，用户挑哪一个都怕漏（选 1-3 年会不会漏掉 1-5 年的岗位？）。
 *
 * 所以：**界面上的选项是标准梯队，查询仍然按原始串去查**。
 * 梯队里挂着"库里哪些原始串属于它"，选中一个梯队 = 把它们一起查出来 ——
 * 既不丢数据，也不逼用户去理解平台的写法差异。
 *
 * 两个函数都是纯函数，放在 shared 而不是 client：它是**取值语义**，不是界面细节。
 */
/**
 * 梯队顺序 = 界面上的顺序（由低到高）。`any` 放最前：它是"不限"，不是"最少经验"。
 */
export const EXP_BUCKETS = [
    { id: 'any', label: '不限/无需经验' },
    { id: 'fresh', label: '应届生' },
    { id: '1-3', label: '1-3年' },
    { id: '3-5', label: '3-5年' },
    { id: '5-10', label: '5-10年' },
    { id: '10+', label: '10年以上' },
];
/** 「不限」类写法：这些不是"零年经验"，而是"没有要求"，必须单独成档。 */
const NO_LIMIT_RE = /(不限|无需|无经验|不需要经验)/;
/** 「应届」类写法：学生 / 刚毕业 / 实习，都归这一档。 */
const FRESH_RE = /(应届|在校|毕业生|实习)/;
/** 全角数字与各种连接符先拉平 —— 平台文案里「1年～3年」「1－3年」都出现过。 */
function toHalfWidth(raw) {
    return raw
        .replace(/[\uff10-\uff19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
        .replace(/[～~－—–]/g, '-');
}
/** 把原始串读成一个年限区间；读不出数字（且不是不限/应届）就返回 `null`。 */
function parseYears(raw) {
    const text = toHalfWidth(raw);
    const matches = text.match(/\d+(?:\.\d+)?/g);
    if (matches === null)
        return null;
    // 用 `Number(...)` 而不是 `matches[0]`：下标取值在 noUncheckedIndexedAccess 下是
    // `string | undefined`，而"正则匹配到了"这个事实 TS 读不出来，只能在这里收一次口。
    const first = Number(matches[0]);
    const second = matches.length >= 2 ? Number(matches[1]) : null;
    if (/(以下|以内|之内|少于|不足)/.test(text))
        return { lo: 0, hi: first, capped: true };
    if (/(以上|及以上|\+|＋)/.test(text))
        return { lo: first, hi: null, capped: false };
    if (second !== null)
        return { lo: Math.min(first, second), hi: Math.max(first, second), capped: false };
    return { lo: first, hi: first, capped: false };
}
/**
 * 原始经验串 → 标准梯队。认不出来返回 `null`（调用方会把它原样显示成一个单独的 chip，
 * 而不是悄悄丢掉 —— 丢掉就等于"库里有岗位但筛不出来"）。
 *
 * 年限到档位的规则（**有上下界取中位，无上界取下限**）：
 *   - 上界 ≤ 1 年、或"1年以内/以下" → 应届生（0-1 年经验的岗位不该让用户按"1-3年"去找）
 *   - 有界 [lo,hi]：中位 < 3 → 1-3 年；< 5 → 3-5 年；< 9.5 → 5-10 年；否则 10 年以上
 *   - 无界 [lo,∞)：lo ≤ 2 → 1-3 年；≤ 4 → 3-5 年；≤ 8 → 5-10 年；否则 10 年以上
 *
 * 这套规则是**近似**：像「1-5年」这种横跨两档的写法，只能落到其中一档（中位 3 → 3-5年）。
 * 这是刻意的取舍 —— 梯队解决的是"选项太多没法选"，不是把平台的模糊要求变精确。
 */
export function expBucketOf(raw) {
    const text = toHalfWidth(raw).trim();
    if (text === '')
        return null;
    if (NO_LIMIT_RE.test(text))
        return 'any';
    if (FRESH_RE.test(text))
        return 'fresh';
    const years = parseYears(text);
    if (years === null)
        return null;
    // 「1年以下」这类上界写法，只要上界 ≤ 1 年就算应届；「0-1年」是同义写法（下界为 0），
    // 也要走这一档 —— 否则中位 0.5 会被算成"1-3年"，把无门槛的岗位说得比实际要求高。
    if (years.hi !== null && (years.capped ? years.hi <= 1 : years.hi < 1 || years.lo === 0)) {
        return 'fresh';
    }
    if (years.hi === null) {
        if (years.lo <= 2)
            return '1-3';
        if (years.lo <= 4)
            return '3-5';
        if (years.lo <= 8)
            return '5-10';
        return '10+';
    }
    const mid = (years.lo + years.hi) / 2;
    if (mid < 3)
        return '1-3';
    if (mid < 5)
        return '3-5';
    if (mid < 9.5)
        return '5-10';
    return '10+';
}
/**
 * 库里的原始经验取值 → 界面上的 chip 列表。
 *
 * **只保留库里真有岗位的档位**：一个点了必然得到 0 条的选项，比没有这个选项更糟。
 * （与"多选 chips 的取值来自库里真实数据"是同一条原则。）
 * 认不出来的原始串排在标准档位后面，原样显示 —— 不假装认识它，也不让它消失。
 */
export function buildExpChips(values) {
    const byBucket = new Map();
    const leftovers = [];
    for (const value of values) {
        // 空白串不是一档经验：库里的空值由 `listExpReqs` 挡过一道，这里再挡一道 ——
        // 万一漏进来一个，"空 chip"会是个既点不动也说不清的选项。
        if (value.trim() === '')
            continue;
        const bucket = expBucketOf(value);
        if (bucket === null) {
            leftovers.push(value);
            continue;
        }
        const hits = byBucket.get(bucket);
        if (hits === undefined)
            byBucket.set(bucket, [value]);
        else if (!hits.includes(value))
            hits.push(value);
    }
    const chips = [];
    for (const bucket of EXP_BUCKETS) {
        const hits = byBucket.get(bucket.id);
        if (hits === undefined)
            continue;
        chips.push({ id: bucket.id, label: bucket.label, values: hits });
    }
    for (const value of leftovers)
        chips.push({ id: `raw:${value}`, label: value, values: [value] });
    return chips;
}
/**
 * 学历层级。顺序就是用户心里的梯度：不限 → 初中及以下 → 高中/中专 → 大专 → 本科 → 硕士 → 博士。
 *
 * 规则**按顺序匹配**（先命中的赢）：所以「初中及以下」必须排在「高中/中专」之前，
 * 否则"及以下"里的"以下"会把别的写法也吸进来；「中专」也不能被「大专/专科」抢走。
 */
const EDU_TIERS = [
    { re: /不限/, rank: 0 },
    { re: /(小学|初中|及以下)/, rank: 1 },
    { re: /(高中|中专|中技|技校|职高|中职)/, rank: 2 },
    { re: /(大专|专科|高职)/, rank: 3 },
    { re: /(本科|学士)/, rank: 4 },
    { re: /(硕士|研究生|MBA|EMBA)/i, rank: 5 },
    { re: /(博士|博士后)/, rank: 6 },
];
/** 认不出来的学历排到最后（`99`），但**不丢弃** —— 它仍然是一个可点的选项。 */
export const EDU_RANK_UNKNOWN = 99;
/** 学历原始串 → 层级序号（越小越低）。 */
export function eduRankOf(raw) {
    for (const tier of EDU_TIERS) {
        if (tier.re.test(raw))
            return tier.rank;
    }
    return EDU_RANK_UNKNOWN;
}
/**
 * 按学历梯度排序。同层级保持库里的原始顺序（写入下标做次键，不依赖排序实现的稳定性），
 * 认不出来的排最后 —— 排序只负责"读起来顺"，不负责重新分类。
 */
export function sortEduValues(values) {
    return values
        .map((value, index) => ({ value, index, rank: eduRankOf(value) }))
        .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
        .map((item) => item.value);
}
//# sourceMappingURL=job-facets.js.map