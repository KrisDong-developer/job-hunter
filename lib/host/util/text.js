/** 全角 → 半角 + 折叠空白 + 小写，用于匹配（原文另存 `excerpt`）。 */
export function normalizeForMatch(input) {
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
    return out.toLowerCase().replace(/\s+/g, ' ');
}
/** 取命中处上下文，最多 40 字符，两端加省略号。 */
function excerptAround(text, index, length) {
    const from = Math.max(0, index - 12);
    const to = Math.min(text.length, index + length + 12);
    const slice = text.slice(from, to).trim();
    return `${from > 0 ? '…' : ''}${slice}${to < text.length ? '…' : ''}`;
}
/**
 * 按词表匹配一段文本。
 *
 * 规则很朴素：归一化后做子串匹配。中文没有词边界，子串匹配是最稳的；
 * 英文/缩写同样适用（`KPI` 会被归一成小写再比）。
 *
 * @param text 待匹配文本（JD 正文、岗位名、公司名都可以）
 * @param entries 词表（只匹配 `enabled` 的条目）
 * @param maxHits 单次匹配的命中上限，防止异常 JD 刷出成百条
 */
export function matchTerms(text, entries, maxHits = 30) {
    if (typeof text !== 'string' || text.trim() === '')
        return [];
    const haystack = normalizeForMatch(text);
    const hits = [];
    const seen = new Set();
    for (const entry of entries) {
        if (hits.length >= maxHits)
            break;
        const needle = normalizeForMatch(entry.term);
        if (needle === '')
            continue;
        const key = `${entry.kind}:${needle}`;
        if (seen.has(key))
            continue;
        const index = haystack.indexOf(needle);
        if (index < 0)
            continue;
        seen.add(key);
        hits.push({
            kind: entry.kind,
            term: entry.term,
            meaning: entry.meaning,
            weight: entry.weight,
            excerpt: excerptAround(haystack, index, needle.length),
        });
    }
    return hits;
}
/** 把命中渲染成给用户看的一行依据，例如 `「弹性工作」→ 往往指没有固定下班时间`。 */
export function describeHit(hit) {
    return hit.meaning === null
        ? `命中「${hit.term}」`
        : `命中「${hit.term}」→ ${hit.meaning}`;
}
/** 按 kind 分组。 */
export function groupHits(hits) {
    const grouped = new Map();
    for (const hit of hits) {
        const list = grouped.get(hit.kind);
        if (list === undefined)
            grouped.set(hit.kind, [hit]);
        else
            list.push(hit);
    }
    return grouped;
}
//# sourceMappingURL=text.js.map