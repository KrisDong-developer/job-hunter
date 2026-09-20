/** joblist 的表单体（照抄站点自己的参数集，含那些恒为空的筛选位）。 */
export function buildJoblistBody(arg) {
    const params = new URLSearchParams();
    params.set('page', String(arg.page));
    params.set('pageSize', String(arg.pageSize));
    params.set('city', arg.cityCode);
    params.set('query', arg.query);
    for (const key of [
        'expectInfo',
        'multiSubway',
        'multiBusinessDistrict',
        'position',
        'jobType',
        'salary',
        'experience',
        'degree',
        'industry',
        'scale',
        'stage',
    ]) {
        params.set(key, '');
    }
    params.set('scene', '1');
    params.set('encryptExpectId', '');
    return params.toString();
}
/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export function buildZhipinSearchUrl(config, criteria) {
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
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
//# sourceMappingURL=urls.js.map