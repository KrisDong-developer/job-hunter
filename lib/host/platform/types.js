/**
 * 读一个平台特有维度的值。
 *
 * 存在的理由：适配器可能被两种方式构造 ——
 * 由 `criteriaToSearchCriteria`（走 `platform` 命名空间），或者由调用方直接拼一个
 * `SearchCriteria`（测试、脚本）。这个助手让两种来路读法一致，不必在每个调用点写两遍。
 */
export function platformCriterion(criteria, key) {
    const scoped = criteria.platform?.[key];
    if (scoped !== undefined && scoped !== '')
        return scoped;
    const loose = criteria[key];
    return typeof loose === 'string' ? loose : '';
}
//# sourceMappingURL=types.js.map