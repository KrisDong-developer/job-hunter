import { platformCriterion } from '../../types.js';
import { ZHAOPIN_DEFAULT_SORT } from './config.js';
/**
 * 构造搜索 URL。
 *
 * 两种形式（见文件头）：
 *   - **无筛选**：`https://www.zhaopin.com/sou/jl765?kw=Java`（有真实分页、薪资明文）
 *   - **带筛选**：`https://www.zhaopin.com/jobs?jl=765&kw=Java&el=4`（实测站点自己跳的地址）
 *
 * 翻页：第 1 页用 `?kw=` / `?p=`；第 2 页起**优先**用站点给的无 query path 形式 ——
 * 真正的 path 形式由 `gotoSearch` 从上一页分页区里读出来（`nextPageUrl`），这里只是兜底。
 */
export function buildZhaopinSearchUrl(config, criteria) {
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        // 城市码未配置就返回 null —— **不猜**。猜错会静默搜到别的城市。
        if (code === undefined)
            return null;
    }
    // 城市码：无筛选时放路径段（`/sou/jl<码>`）、带筛选时放 query（`/jobs?jl=<码>`）。
    // 没指定城市时用「全国」码，保持 URL 形状一致。
    const code = criteria.city !== undefined && criteria.city !== '' ? config.cityCodes[criteria.city] : config.cityCodes['全国'];
    const base = code === undefined ? config.urlParams.base : `${config.urlParams.base}/jl${code}`;
    /**
     * 平台筛选维度 → 真实参数名（**适配器声明过、也真的发得出去的那些**）。
     *
     * 与 `criteriaDimensions` 一一对应：那边 `wire.param` 写的就是这里的参数名。
     * `platformCriterion` 负责从 `criteria.platform` 命名空间里取值（闭集转换的结果）。
     */
    const filters = [];
    for (const [key, param] of [
        ['education', config.urlParams.educationParam],
        ['workExperience', config.urlParams.workExperienceParam],
        ['companyType', config.urlParams.companyTypeParam],
        ['jobStatus', config.urlParams.jobStatusParam],
        ['salary', config.urlParams.salaryParam],
        ['stage', config.urlParams.financingParam],
        ['scale', config.urlParams.companySizeParam],
    ]) {
        const value = platformCriterion(criteria, key);
        if (value !== '')
            filters.push([param, value]);
    }
    /**
     * 带筛选 → 走 `/jobs` 路由。
     *
     * 为什么不把筛选参数拼到 `/sou/` 上：**没有实测过那边认不认**。而点击探针给出的是
     * 一条确定的事实 —— 站点自己在加筛选时用的就是 `/jobs?jl=…&el=…`。照抄站点自己的
     * 形状，比把它猜进另一条路由安全。
     *
     * `p` / `order` 在这条路由上沿用同名参数（**未单独验证**）：不写 `p` 的后果是
     * "第 2 页又抓回第 1 页"，那是静默的重复，比参数可能不生效更糟。
     */
    /**
     * 排序：方案显式配置跟随方案；否则**默认「最新发布」**（2026-09-23 用户定案，
     * 站点默认的「全部」是智能匹配序 —— 同一批老岗位反复占着前几页，新岗位反而不靠前）。
     */
    const sort = criteria.sort !== undefined && criteria.sort !== '' ? criteria.sort : ZHAOPIN_DEFAULT_SORT;
    if (filters.length > 0) {
        const filtered = new URLSearchParams();
        if (code !== undefined)
            filtered.set(config.urlParams.cityParam, code);
        if (criteria.keyword !== undefined && criteria.keyword !== '') {
            filtered.set(config.urlParams.keywordParam, criteria.keyword);
        }
        for (const [param, value] of filters)
            filtered.set(param, value);
        if (criteria.page !== undefined && criteria.page > 1) {
            filtered.set(config.urlParams.pageParam, String(criteria.page));
        }
        filtered.set(config.urlParams.sortParam, sort);
        // `postedWithinDays` 在这里同样**不写**：站点不暴露这个维度（值域为空 + closed），
        // 拼上去只会得到一个平台不认的参数名。
        return `${config.urlParams.filterBase}?${filtered.toString()}`;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.page !== undefined && criteria.page > 1) {
        params.set(config.urlParams.pageParam, String(criteria.page));
    }
    params.set(config.urlParams.sortParam, sort);
    // ⚠️ `postedWithinDays` **一律不写**（2026-09-21 修）：这个维度在智联是
    // "声明为封闭 + 值域为空"（平台上没打通），可它偏偏是个**顶层槽位**
    // （`criteriaToSearchCriteria` 把它放进 `criteria.postedWithinDays`），
    // 于是老方案里存着的那个值照样会被拼成 `pd=7` 发出去 —— 一个平台不认的参数。
    // 与 51job 的 `issueDate` 是同一类问题（那边实测带上去会把结果集清空）。
    // 想恢复它，先把合法取值实测出来，再往声明的值域里写。
    // 逃生口：只有调用方显式构造 `criteria.extra` 时才用得到（方案条件走不到这里 ——
    // `criteriaToSearchCriteria` 的闭集规则把非类型化槽位的键一律放进 `platform` 命名空间）。
    for (const [key, value] of Object.entries(criteria.extra ?? {}))
        params.set(key, value);
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
/**
 * 会话列表接口地址（某个页号的最简调用形式：**不带** at/rt 与任何自定义头 —— 实测四个变体等价）。
 *
 * ⚠️ `PageSize` 与 `pageSize` **两个参数名都要带**：实测的真实请求里两个都出现了，
 * 而只带一个是否也生效**没单独验证过** —— 一次只读请求多带一个参数没有代价，就不去赌。
 */
export function buildTalkListUrl(config, pageNo) {
    const size = String(config.talkListPageSize);
    return (`${config.talkListApi}?pageNo=${String(pageNo)}` +
        `&PageSize=${size}&pageSize=${size}` +
        '&sessionType=1&imMessageListType=1&communicateStatusType=0');
}
//# sourceMappingURL=urls.js.map