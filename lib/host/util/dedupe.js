/**
 * 跨平台去重：**多级漏斗，不是单一距离**（§4.10.1）。
 *
 * 为什么不能只算编辑距离：「字节跳动」vs「北京字节跳动科技有限公司」的编辑距离很大，
 * 会被判成两家公司。正确顺序是先归一化、再看别名、再看包含关系，最后才轮到相似度兜底。
 *
 * **三条铁律**（这里逐条落地）：
 *   1. **不确定时宁可不合并** —— 默认阈值偏保守，宁可漏合并，不可误合并；
 *   2. **去重必须可逆** —— 本模块只给判断，落库与拆开由 `domain/dedupe.ts` 负责，
 *      合并会写 `company_signal(type='name-merge')` 留下可反查的依据；
 *   3. **每次合并记录依据** —— 返回值里的 `basis` 是人话，不是分数。
 */
import { normalizeCompanyName } from './company-name.js';
/** 相似度阈值。调高更保守（漏合并），调低更激进（误合并）—— 铁律 1 选择保守。 */
export const SIMILARITY_THRESHOLD = 0.88;
/** 包含关系的最低长度：太短的包含（如「中」⊂「中国」）没有意义。 */
export const CONTAINMENT_MIN_LENGTH = 3;
/** 编辑距离只在长度接近时才有意义。 */
const LENGTH_RATIO_FLOOR = 0.7;
/** 超过这个长度就不算编辑距离了 —— O(n·m) 在长串上会浪费，而长公司名本就少。 */
const LEVENSHTEIN_MAX_LENGTH = 64;
/** 字符 bigram 集合（中文没有词边界，bigram 是最实用的近似）。 */
export function bigrams(value) {
    const set = new Set();
    if (value.length === 1) {
        set.add(value);
        return set;
    }
    for (let index = 0; index + 1 < value.length; index += 1) {
        set.add(value.slice(index, index + 2));
    }
    return set;
}
/** Jaccard 相似度（bigram 集合）。 */
export function bigramSimilarity(left, right) {
    if (left === right)
        return 1;
    if (left === '' || right === '')
        return 0;
    const a = bigrams(left);
    const b = bigrams(right);
    let intersection = 0;
    for (const gram of a)
        if (b.has(gram))
            intersection += 1;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
/** 归一化编辑距离相似度（1 - 距离/较长长度）。 */
export function levenshteinSimilarity(left, right) {
    if (left === right)
        return 1;
    if (left === '' || right === '')
        return 0;
    if (left.length > LEVENSHTEIN_MAX_LENGTH || right.length > LEVENSHTEIN_MAX_LENGTH)
        return 0;
    const short = left.length <= right.length ? left : right;
    const long = left.length <= right.length ? right : left;
    let previous = Array.from({ length: short.length + 1 }, (_value, index) => index);
    let current = new Array(short.length + 1).fill(0);
    for (let row = 1; row <= long.length; row += 1) {
        current[0] = row;
        for (let column = 1; column <= short.length; column += 1) {
            const cost = long[row - 1] === short[column - 1] ? 0 : 1;
            const deletion = (previous[column] ?? 0) + 1;
            const insertion = (current[column - 1] ?? 0) + 1;
            const substitution = (previous[column - 1] ?? 0) + cost;
            current[column] = Math.min(deletion, insertion, substitution);
        }
        const swap = previous;
        previous = current;
        current = swap;
    }
    const distance = previous[short.length] ?? long.length;
    return 1 - distance / long.length;
}
/**
 * 判断两条公司名是否指向同一实体。
 *
 * @param left 公司名 A（原始写法即可，内部会归一化）
 * @param right 公司名 B
 */
export function compareCompanyNames(left, right, options = {}) {
    const a = normalizeCompanyName(left);
    const b = normalizeCompanyName(right);
    if (a === '' || b === '') {
        return { merge: false, level: 'none', basis: '公司名归一化后为空，无法判断', score: 0 };
    }
    // 第 1 级：归一化后完全一致
    if (a === b) {
        return {
            merge: true,
            level: 'normalized',
            basis: `归一化后完全一致（「${left}」与「${right}」→「${a}」）`,
            score: 1,
        };
    }
    // 第 2 级：别名表精确命中（人工维护的已知等价名）
    const aliases = options.aliases;
    if (aliases !== undefined) {
        const aAliases = aliases.get(a) ?? [];
        const bAliases = aliases.get(b) ?? [];
        if (aAliases.includes(b) || bAliases.includes(a)) {
            return { merge: true, level: 'alias', basis: `别名表命中：「${a}」≡「${b}」`, score: 1 };
        }
    }
    // 第 3 级：包含关系（要求较短的一方足够长，避免「中」⊂「中国」这种噪音）
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length >= CONTAINMENT_MIN_LENGTH && longer.includes(shorter)) {
        return {
            merge: true,
            level: 'containment',
            basis: `包含关系：「${shorter}」⊂「${longer}」`,
            score: 0.95,
        };
    }
    // 第 4 级：bigram 相似度 / 编辑距离兜底
    const similarity = bigramSimilarity(a, b);
    const threshold = options.similarityThreshold ?? SIMILARITY_THRESHOLD;
    if (similarity >= threshold) {
        return {
            merge: true,
            level: 'similarity',
            basis: `字符 bigram 相似度 ${similarity.toFixed(2)} ≥ ${String(threshold)}`,
            score: similarity,
        };
    }
    const lengthRatio = shorter.length / longer.length;
    if (lengthRatio >= LENGTH_RATIO_FLOOR) {
        const edit = levenshteinSimilarity(a, b);
        if (edit >= threshold) {
            return {
                merge: true,
                level: 'similarity',
                basis: `编辑距离相似度 ${edit.toFixed(2)} ≥ ${String(threshold)}`,
                score: edit,
            };
        }
    }
    // 第 5 级：**不确定不合并**
    return {
        merge: false,
        level: 'none',
        basis: `差异过大，不合并（bigram ${similarity.toFixed(2)}，编辑距离未过阈值）—— 交给人工确认`,
        score: similarity,
    };
}
/** 标题清洗：去括号补充、去常见修饰、去空白。 */
export function cleanJobTitle(title) {
    return title
        // 【高薪】/（深圳）/ [急聘] 这类补充说明整块去掉，它们不是岗位名的一部分
        .replace(/[（(【[][^）)】\]]*[）)】\]]/g, '')
        .replace(/(急招|诚聘|高薪|双休|包住|五险一金|应届|实习)/g, '')
        .replace(/[（）()【】[\]]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase()
        .trim();
}
/** 薪资分桶：把 13K 与 15K 归到同一桶，避免因为范围微差就判成两个岗位。 */
export function salaryBucketOf(min, max) {
    if (min === null)
        return 'unknown';
    const anchor = max === null ? min : Math.round((min + max) / 2);
    const step = 5000;
    return `b${String(Math.floor(anchor / step))}`;
}
export function jobDedupeKey(input) {
    return {
        companyKey: normalizeCompanyName(input.companyName),
        titleClean: cleanJobTitle(input.title),
        salaryBucket: salaryBucketOf(input.salaryMin, input.salaryMax),
        city: input.city.trim(),
    };
}
/**
 * 判断两个岗位是不是「同一个岗位在不同平台」。
 *
 * 比公司名更保守：键必须**完全一致**，标题再做一次相似度确认。
 * 岗位标题天然差异大（「Java开发工程师」vs「Java 后端工程师」），
 * 所以标题相似度只作为**确认**，不作为主要依据 —— 宁可保留两个，也不要把两个
 * 真岗位合成一个（合并后投递记录会串）。
 */
export function compareJobs(left, right, threshold = 0.9) {
    if (left.companyKey === '' || right.companyKey === '') {
        return { merge: false, basis: '公司名为空，不合并', score: 0 };
    }
    if (left.companyKey !== right.companyKey) {
        return { merge: false, basis: '公司不同，不合并', score: 0 };
    }
    if (left.city !== right.city) {
        return { merge: false, basis: `城市不同（${left.city} / ${right.city}），不合并`, score: 0 };
    }
    if (left.salaryBucket !== right.salaryBucket) {
        return {
            merge: false,
            basis: `薪资档不同（${left.salaryBucket} / ${right.salaryBucket}），不合并`,
            score: 0,
        };
    }
    const similarity = bigramSimilarity(left.titleClean, right.titleClean);
    if (similarity >= threshold) {
        return {
            merge: true,
            basis: `同公司 + 同城 + 同薪资档，标题相似度 ${similarity.toFixed(2)} ≥ ${String(threshold)}`,
            score: similarity,
        };
    }
    return {
        merge: false,
        basis: `键相同但标题相似度只有 ${similarity.toFixed(2)}，不合并`,
        score: similarity,
    };
}
//# sourceMappingURL=dedupe.js.map