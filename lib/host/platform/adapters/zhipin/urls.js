/**
 * 接口表单的字段名 —— **声明与构造共用这一份**。
 *
 * `index.ts` 里 `keyword` / `city` 两个维度的 `wire.param` 引用它，
 * 于是"声明说落到哪个参数"与"实际写哪个字段"不会各写一份字面量。
 */
export const ZHIPIN_BODY_FIELDS = {
    keyword: 'query',
    city: 'city',
};
/** joblist 的表单体（照抄站点自己的参数集，含那些恒为空的筛选位）。 */
export function buildJoblistBody(arg) {
    const params = new URLSearchParams();
    params.set('page', String(arg.page));
    params.set('pageSize', String(arg.pageSize));
    params.set(ZHIPIN_BODY_FIELDS.city, arg.cityCode);
    params.set(ZHIPIN_BODY_FIELDS.keyword, arg.query);
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