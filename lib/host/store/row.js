/**
 * sqlite 行值的安全读取。
 *
 * `node:sqlite` 的返回值类型是 `null | number | bigint | string | Uint8Array`，
 * 直接当 string/number 用会到处是断言。这里集中收敛，顺便把 bigint 归一成 number。
 */
export function asText(value, fallback = '') {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'bigint')
        return String(value);
    return fallback;
}
export function asTextOrNull(value) {
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'bigint')
        return String(value);
    return null;
}
export function asInt(value, fallback = 0) {
    if (typeof value === 'number')
        return Math.trunc(value);
    if (typeof value === 'bigint')
        return Number(value);
    if (typeof value === 'string') {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}
export function asIntOrNull(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'number')
        return Math.trunc(value);
    if (typeof value === 'bigint')
        return Number(value);
    return null;
}
export function asRealOrNull(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value === 'number')
        return value;
    if (typeof value === 'bigint')
        return Number(value);
    return null;
}
export function asReal(value, fallback = 0) {
    return asRealOrNull(value) ?? fallback;
}
export function asBool(value, fallback = false) {
    if (value === null || value === undefined)
        return fallback;
    return asInt(value, fallback ? 1 : 0) !== 0;
}
/** 解析 JSON 列；坏数据一律退化为 fallback，绝不让一条脏 JSON 打断查询。 */
export function asJson(value, fallback) {
    if (typeof value !== 'string' || value === '')
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
/** 把 number | bigint 的 lastInsertRowid 归一成 number。 */
export function asId(value) {
    return typeof value === 'bigint' ? Number(value) : value;
}
//# sourceMappingURL=row.js.map