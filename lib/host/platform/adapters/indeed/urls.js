import { platformCriterion } from '../../types.js';
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
    /**
     * 筛选：2026-09-21 第 12 轮 URL 变体对照证明这两个参数真的生效
     * （`fromage=1`→4 条、`fromage=7`→16 条、`jt=parttime`→0 条；基线两次都是 16 条）。
     *
     * 与 51job/智联同款：**只在真的配了的时候才写**，不塞平台默认值 ——
     * 那会静默改变"什么都没配"的行为。
     */
    if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
        params.set(config.urlParams.postedWithinParam, String(criteria.postedWithinDays));
    }
    const jobType = platformCriterion(criteria, 'jobType');
    if (jobType !== '')
        params.set(config.urlParams.jobTypeParam, jobType);
    const page = criteria.page === undefined ? 1 : criteria.page;
    const start = Math.max(0, page - 1) * config.pageSize;
    params.set(config.urlParams.startParam, String(start));
    const base = `https://${config.host}/jobs`;
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
//# sourceMappingURL=urls.js.map