/** 取一条记录上某个核心字段的值。 */
export function coreFieldValue(raw, field) {
    switch (field) {
        case 'title':
            return raw.title ?? '';
        case 'salary_raw':
            return raw.salaryRaw ?? '';
        case 'company':
            return raw.company ?? '';
        case 'source_url':
            return raw.sourceUrl ?? '';
        default:
            return '';
    }
}
/**
 * 逐条断言 + 逐轮命中统计。
 *
 * `present` 的判定是「非空字符串」——注意 `salary_raw` 为「面议」是**合法值**，
 * 空串才是缺失；这条区分很重要，否则所有面议岗位都会被误判成脏数据。
 */
export function partitionByRequiredFields(records, required) {
    const accepted = [];
    const rejected = [];
    const counters = new Map();
    for (const field of required)
        counters.set(field, 0);
    for (const raw of records) {
        const missing = [];
        for (const field of required) {
            const value = coreFieldValue(raw, field).trim();
            if (value === '')
                missing.push(field);
            else
                counters.set(field, (counters.get(field) ?? 0) + 1);
        }
        if (missing.length === 0)
            accepted.push(raw);
        else
            rejected.push({ raw, missing });
    }
    const presence = required.map((field) => ({
        field,
        records: records.length,
        present: counters.get(field) ?? 0,
    }));
    return { accepted, rejected, presence };
}
/**
 * 本轮某字段是否算「整轮缺失」。
 * 只有**解析出了记录**却一条都没命中时才计缺失 —— 0 条记录是「整页失败」，
 * 由运行级失败计数负责，不该污染字段级计数。
 */
export function isFieldMiss(presence) {
    return presence.records > 0 && presence.present === 0;
}
//# sourceMappingURL=validate.js.map