/** 用平台 id 构造详情 URL。 */
export function buildGuopinJobDetailUrl(config, jobId) {
    return config.detailUrlTemplate.split('{jobId}').join(jobId);
}
/**
 * 构造列表页 URL：`https://www.iguopin.com/jobList?keyword=<kw>`。
 * 城市码未配置（v1 空表）时带城市即返回 null —— **不猜**。
 * 页码：分页参数未确证，v1 单页（不加页码参数）。
 */
export function buildGuopinSearchUrl(config, criteria) {
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        if (code === undefined)
            return null;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
//# sourceMappingURL=urls.js.map