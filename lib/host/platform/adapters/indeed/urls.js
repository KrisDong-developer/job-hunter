/**
 * 构造搜索 URL：`https://{host}/jobs?q=Java&l=北京&start=0`。
 * 关键词 / 地点都是**自由文本**，没有城市码映射 —— 地点为空就不带 `l=`。
 * `criteria.page` 是 1 起（项目约定）；`start` = (page-1) * pageSize（0 起）。
 */
export function buildIndeedSearchUrl(config, criteria) {
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        params.set(config.urlParams.locationParam, criteria.city);
    }
    const page = criteria.page === undefined ? 1 : criteria.page;
    const start = Math.max(0, page - 1) * config.pageSize;
    params.set(config.urlParams.startParam, String(start));
    const base = `https://${config.host}/jobs`;
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
//# sourceMappingURL=urls.js.map