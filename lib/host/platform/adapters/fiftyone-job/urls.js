export function buildSearchUrl(config, criteria) {
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        if (code === undefined)
            return null;
        params.set(config.urlParams.cityParam, code);
    }
    if (criteria.page !== undefined && criteria.page > 1) {
        params.set(config.urlParams.pageParam, String(criteria.page));
    }
    // SR-40：抓取深度的三件套。**只在用户真的配了的时候才写进 URL** ——
    // 塞一个平台默认值会改变"什么都没配"时的行为，那是静默改变语义。
    if (criteria.sort !== undefined && criteria.sort !== '') {
        params.set(config.urlParams.sortParam, criteria.sort);
    }
    if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
        params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays));
    }
    // 逃生口：只有调用方显式构造 `criteria.extra` 时才用得到（方案条件走不到这里 ——
    // `criteriaToSearchCriteria` 的闭集规则把非类型化槽位的键一律放进 `platform` 命名空间，
    // 而那条兜底曾经把 `posInfo` 这种内部键名当参数名发出去过）。
    for (const [key, value] of Object.entries(criteria.extra ?? {}))
        params.set(key, value);
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
//# sourceMappingURL=urls.js.map