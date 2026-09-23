import { platformCriterion } from '../../types.js';
import { ZHIPIN_FILTER_OPTIONS } from './config.js';
/**
 * 接口表单的字段名 —— **声明与构造共用这一份**。
 *
 * `index.ts` 里各维度的 `wire.param` 引用它，
 * 于是"声明说落到哪个参数"与"实际写哪个字段"不会各写一份字面量。
 * 筛选六个键是恒等映射（`experience` → `experience`）—— 站点的 URL 参数名、
 * 表单字段名、我们的维度键三者同名（2026-09-23 实测），显式写出来是为了
 * 对账测试能拿**同一份常量**核对两个去处（URL 与 body）。
 */
export const ZHIPIN_BODY_FIELDS = {
    keyword: 'query',
    city: 'city',
    jobType: 'jobType',
    salary: 'salary',
    experience: 'experience',
    degree: 'degree',
    scale: 'scale',
    stage: 'stage',
};
/** 声明了取值编码的六个筛选维度（= `ZHIPIN_FILTER_OPTIONS` 的键）。 */
const ZHIPIN_FILTER_KEYS = Object.keys(ZHIPIN_FILTER_OPTIONS);
/**
 * 从搜索条件里取出六个筛选维度的**生效值**（空 = 不筛）。
 *
 * 走 `platformCriterion`（`platform` 命名空间优先，兼容测试直接拼的顶层键）——
 * 与 `scrollRoundsOf` 同一读法，两处不会各读各的。
 */
export function zhipinFiltersOf(criteria) {
    const out = {};
    for (const key of ZHIPIN_FILTER_KEYS) {
        const value = platformCriterion(criteria, key);
        if (value !== '')
            out[key] = value;
    }
    return out;
}
/** joblist 的表单体（照抄站点自己的参数集，含那些恒为空的筛选位）。 */
export function buildJoblistBody(arg) {
    const params = new URLSearchParams();
    params.set('page', String(arg.page));
    params.set('pageSize', String(arg.pageSize));
    params.set(ZHIPIN_BODY_FIELDS.city, arg.cityCode);
    params.set(ZHIPIN_BODY_FIELDS.keyword, arg.query);
    // 有值的筛选写字段名对应的**平台编码**；没值的保持站点那个空串占位（照抄它，不自作主张删键）。
    for (const key of ZHIPIN_FILTER_KEYS) {
        params.set(ZHIPIN_BODY_FIELDS[key], arg.filters?.[key] ?? '');
    }
    for (const key of [
        'expectInfo',
        'multiSubway',
        'multiBusinessDistrict',
        'position',
        'industry',
    ]) {
        params.set(key, '');
    }
    params.set('scene', '1');
    params.set('encryptExpectId', '');
    return params.toString();
}
/**
 * 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>&<筛选=编码…>`。
 *
 * 筛选参数进 URL 是**平台行为**（2026-09-23 实测：地址栏带 `experience=107&salary=406`
 * 打开页面，SPA 自己的 tdk/joblist 请求就带上同样的筛选）—— 所以 `gotoSearch`
 * 只要导航到这条 URL，页面发出来的就是筛过的列表，不需要去点页面上的筛选面板。
 * 城市码未知 → null，不猜。
 */
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
    for (const [key, value] of Object.entries(zhipinFiltersOf(criteria))) {
        params.set(key, value);
    }
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
//# sourceMappingURL=urls.js.map