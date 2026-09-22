import { platformCriterion } from '../../types.js';
/**
 * 接口请求体 —— 形状照抄站点自己那一次（2026-09-21 抓包）：
 * `{ search: { page, page_size, keyword, experience:[码], major:[码] }, recom: {...} }`。
 */
export function buildGuopinListBody(criteria, page, pageSize) {
    const search = { page, page_size: pageSize };
    const keyword = (criteria.keyword ?? '').trim();
    if (keyword !== '')
        search['keyword'] = keyword;
    // 只发**证明过会筛**的两个键；值必须是数组（字符串形状会被忽略或报错，见 FINDINGS 的负结果）。
    for (const key of ['experience', 'major']) {
        const value = platformCriterion(criteria, key);
        if (value !== '')
            search[key] = [value];
    }
    return JSON.stringify({
        search,
        recom: { update_time: true, company_nature: true, hot_job: true },
    });
}
/**
 * 在**页面上下文**里 POST 一次列表接口。
 *
 * 为什么在页面里发而不是 Node 直连：接口要页面的 cookie / 同源身份，而且这样与
 * "先正常导航一次"的既有流程共用同一份浏览器上下文（waiqi / sinojobs 同款做法）。
 * 没有 `fetch`（离线夹具的 jsdom）或请求失败 → 返回 `null`，调用方退回 DOM 路径。
 */
export async function fetchGuopinListInPage(arg) {
    if (typeof fetch !== 'function')
        return null;
    try {
        const response = await fetch(arg.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: arg.body,
            credentials: 'same-origin',
        });
        if (!response.ok)
            return null;
        return await response.json();
    }
    catch {
        return null;
    }
}
/** 接口返回的薪资 → 我们能存的那一个字符串（不可靠就留空，绝不编）。 */
function salaryOf(record) {
    if (record['is_negotiable'] === true)
        return '面议';
    const min = Number(record['min_wage']);
    const max = Number(record['max_wage']);
    if (!Number.isFinite(min) && !Number.isFinite(max))
        return '';
    const unit = typeof record['wage_unit_cn'] === 'string' ? record['wage_unit_cn'] : '';
    const months = Number(record['months']);
    const range = Number.isFinite(min) && Number.isFinite(max) && min !== max
        ? `${String(min)}-${String(max)}`
        : String(Number.isFinite(min) ? min : max);
    const salaryMonths = Number.isFinite(months) && months > 12 ? `·${String(months)}薪` : '';
    return `${range}${unit}${salaryMonths}`;
}
/** `district_list[0].area_cn`（形如 `保定-竞秀区`）→ 市 / 区。 */
function placeOf(record) {
    const list = record['district_list'];
    if (!Array.isArray(list) || list.length === 0)
        return { city: '', district: '' };
    const first = list[0];
    if (first === null || typeof first !== 'object')
        return { city: '', district: '' };
    const area = first['area_cn'];
    if (typeof area !== 'string' || area === '')
        return { city: '', district: '' };
    const [city = '', district = ''] = area.split('-');
    return { city: city.trim(), district: district.trim() };
}
/** 把接口载荷收敛成 `RawJob[]`；形状不对就返回 `null`（调用方退回 DOM）。 */
export function guopinListPageOf(payload, config) {
    if (payload === null || typeof payload !== 'object')
        return null;
    const data = payload['data'];
    if (data === null || typeof data !== 'object')
        return null;
    const list = data['list'];
    if (!Array.isArray(list))
        return null;
    const jobs = [];
    for (const raw of list) {
        if (raw === null || typeof raw !== 'object')
            continue;
        const record = raw;
        const jobId = typeof record['job_id'] === 'string' ? record['job_id'] : '';
        const title = typeof record['job_name'] === 'string' ? record['job_name'].trim() : '';
        const company = typeof record['company_name'] === 'string' ? record['company_name'].trim() : '';
        if (title === '' || company === '')
            continue;
        const place = placeOf(record);
        const tags = [];
        for (const key of ['category_cn', 'nature_cn']) {
            const value = record[key];
            if (typeof value === 'string' && value !== '' && !tags.includes(value))
                tags.push(value);
        }
        jobs.push({
            platformJobId: jobId,
            title,
            salaryRaw: salaryOf(record),
            company,
            sourceUrl: jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId),
            ...(place.city === '' ? {} : { city: place.city }),
            ...(place.district === '' ? {} : { district: place.district }),
            ...(typeof record['experience_cn'] === 'string' && record['experience_cn'] !== ''
                ? { expReq: record['experience_cn'] }
                : {}),
            ...(typeof record['education_cn'] === 'string' && record['education_cn'] !== ''
                ? { eduReq: record['education_cn'] }
                : {}),
            ...(typeof record['start_time'] === 'string' && record['start_time'] !== ''
                ? { publishedAt: record['start_time'] }
                : {}),
            ...(tags.length === 0 ? {} : { tags }),
        });
    }
    const page = Number(data['page']);
    const pageSize = Number(data['page_size']);
    const total = Number(data['total']);
    return {
        jobs,
        page: Number.isFinite(page) && page > 0 ? page : 1,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : jobs.length,
        total: Number.isFinite(total) ? total : jobs.length,
    };
}
//# sourceMappingURL=api.js.map