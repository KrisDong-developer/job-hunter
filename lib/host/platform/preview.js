import { isSettableDimension } from './types.js';
/** 从 URL 里取出 query 参数（预览与对账共用同一份解析，避免两套口径）。 */
export function queryParamsOf(url) {
    const index = url.indexOf('?');
    if (index < 0)
        return {};
    const out = {};
    for (const [key, value] of new URLSearchParams(url.slice(index + 1)))
        out[key] = value;
    return out;
}
/**
 * 声明了、但**不进请求**的维度（采集深度这类旋钮）。
 *
 * 判据是"声明里没有 `wire`"**且"它本身是可填的"** —— 后半个条件不能少：
 * 51job / 智联的 `postedWithinDays` 同样没有 wire，但它不是"采集深度"，
 * 而是"平台侧这个筛选没打通"（声明为封闭 + 空值域）。把它列进"不进请求的旋钮"里，
 * 界面就会拿一句错话解释它。
 */
export function crawlOnlyKeysOf(adapter) {
    return adapter.criteriaDimensions
        .filter((dimension) => dimension.wire === undefined && isSettableDimension(dimension))
        .map((dimension) => dimension.key);
}
/** 这个适配器对这份条件会发出什么请求；`null` = 连请求都构造不出来（如城市码未配置）。 */
export function previewOf(adapter, criteria) {
    const crawlOnly = crawlOnlyKeysOf(adapter);
    const custom = adapter.criteria.preview?.(criteria);
    if (custom !== undefined) {
        return custom === null ? null : { ...custom, crawlOnly };
    }
    const url = adapter.criteria.buildSearchUrl(criteria);
    if (url === null)
        return null;
    return { url, method: 'GET', params: queryParamsOf(url), crawlOnly };
}
//# sourceMappingURL=preview.js.map