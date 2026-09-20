/**
 * 构造搜索 URL（**第 1 页**）。关键词进路径，城市用中文名进 query，全国省略 city。
 * `criteria.page > 1` 时返回 null —— 拉勾翻页要读上一页「下一页」的真实 href
 * （`/hangzhou-zhaopin/Python/2/`），由 `gotoSearch` 走 `readNextPageUrl`，**不自己拼**。
 */
export function buildLagouSearchUrl(config, criteria) {
    if (criteria.page !== undefined && criteria.page > 1)
        return null;
    const keyword = criteria.keyword ?? '';
    const base = keyword === '' ? 'https://www.lagou.com/jobs/' : `${config.urlParams.base}${keyword}`;
    const params = new URLSearchParams();
    // 城市是中文名，直接照收；全国 = 空串 = 省略参数（站点默认全国）。
    if (criteria.city !== undefined && criteria.city !== '' && criteria.city !== '全国') {
        params.set(config.urlParams.cityParam, criteria.city);
    }
    // SR-40：只在显式配了「最新」时才写 px=new，避免静默改默认排序。
    if (criteria.sort !== undefined && criteria.sort === 'new') {
        params.set(config.urlParams.sortParam, criteria.sort);
    }
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
/**
 * 构造搜索接口地址（v2 双通道）：城市在 query（中文名），全国省参。
 * `POST /jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`
 */
export function buildLagouSearchApiUrl(config, cityName) {
    const params = new URLSearchParams();
    params.set('needAddtionalResult', 'false');
    if (cityName !== '' && cityName !== '全国')
        params.set('city', cityName);
    return `${config.searchApiOrigin}${config.searchApiPath}?${params.toString()}`;
}
/** 搜索接口请求体（`kd` 关键词、`pn` 页码 1 起、`first` 首翻页标记）。 */
export function buildLagouRequestBody(criteria, page) {
    return {
        first: page <= 1 ? 'true' : 'false',
        pn: String(Math.max(1, page)),
        kd: criteria.keyword ?? '',
    };
}
//# sourceMappingURL=urls.js.map