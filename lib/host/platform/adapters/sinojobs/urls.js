import { platformCriterion } from '../../types.js';
import { SINOJOBS_LIST_URL } from './config.js';
/**
 * 构造**页面外壳地址**（人打开时看到的那个）。
 *
 * 与神仙外企同理：筛选条件**不在 URL 里**（全部走 POST body），URL 只承载
 * 页面自己的 `keywords`（仅供人核对）。城市仍然在这里校验 ——
 * 表里没有的城市直接返回 `null`（**不猜**，否则"城市没配"会变成一次静默的全国搜索）。
 */
export function buildSinoJobsSearchUrl(config, criteria) {
    if (criteria.city !== undefined && criteria.city !== '' && config.addressCodes[criteria.city] === undefined) {
        return null;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set('keywords', criteria.keyword);
    }
    const query = params.toString();
    return query === '' ? SINOJOBS_LIST_URL : `${SINOJOBS_LIST_URL}?${query}`;
}
/** 接口请求体（表单字段，与站点 `onloadPage(page, limit)` 发送的完全一致）。 */
export function buildSinoJobsRequestBody(config, criteria, page) {
    const body = {
        page: String(page),
        limit: String(config.pageSize),
        // 站点脚本始终提交这五个键（值为空串 = 不筛）。
        keywords: criteria.keyword ?? '',
        job_type: platformCriterion(criteria, 'jobType'),
        work_nature: platformCriterion(criteria, 'workNature'),
        salary_range: platformCriterion(criteria, 'salaryRange'),
        experience: platformCriterion(criteria, 'experience'),
        address_id: '',
    };
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.addressCodes[criteria.city];
        // 地点码未配置就**不写值**（宁可搜全国，也不要写一个错的地点码）。
        // `buildSinoJobsSearchUrl` 已经先拦过一次，这里是第二道。
        if (code !== undefined)
            body.address_id = code;
    }
    for (const [key, value] of Object.entries(criteria.extra ?? {}))
        body[key] = value;
    return body;
}
//# sourceMappingURL=urls.js.map