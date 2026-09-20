/** 组装查询参数（顺序稳定，便于测试与日志肉眼比对）。 */
function commonParams(config, criteria) {
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        params.set(config.urlParams.locationParam, criteria.city);
    }
    // 发布时间窗：f_TPR=r<秒>（平台无关顶层键 postedWithinDays，天 → 秒）。
    // guest 端点**实测生效**（2026-09-20：r86400 → 全部 datetime 落在当天）。
    if (criteria.postedWithinDays !== undefined && criteria.postedWithinDays > 0) {
        params.set(config.urlParams.timeRangeParam, `r${String(Math.trunc(criteria.postedWithinDays) * 86_400)}`);
    }
    // 分页：项目约定 page 1 起；start = (page-1) * pageSize，0 起（实测三页零重叠）。
    const page = criteria.page === undefined ? 1 : criteria.page;
    params.set(config.urlParams.startParam, String(Math.max(0, page - 1) * config.pageSize));
    // ⚠️ 刻意不拼 f_E / f_WT / f_AL / sortBy：2026-09-20 v2 实测 guest 端点**全部忽略**
    //（f_E=4 与对照 id 集合差异 0；sortBy=DD 序列不降序）—— 拼了不改结果，就是骗配置界面。
    return params;
}
/**
 * guest 匿名列表接口 URL —— **主通道的导航目标**：
 * `https://{host}/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=…&start=0`。
 *
 * 为什么是「导航」而不是「页面内 fetch 回来再解析」：LinkedIn 的 CSP 启用
 * Trusted Types，`innerHTML` / `DOMParser.parseFromString` 在真实页面上都会抛
 * 「requires TrustedHTML」（v2 探针两次真机实测）—— 字符串解析这条路是死的。
 * 顶层导航让浏览器自己把片段渲染成文档，`readListPage` 解析活 DOM。
 */
export function buildLinkedInGuestApiUrl(config, criteria) {
    const params = commonParams(config, criteria);
    return `https://${config.host}${config.guestApiPath}?${params.toString()}`;
}
/**
 * 搜索页 URL（带 trk）：`https://{host}/jobs/search/?keywords=…&trk=<guestTrk>`。
 *
 * **不是采集通道**（登录态下搜索页初始 DOM 0 卡片、客户端渲染）—— 它只服务
 * `auth.checkUrl`（登录标记 global-nav 只在完整页面里有，guest 片段页没有页头）。
 * trk 模拟「从首页 Jobs 标签进来的游客」，降低未登录会话被 authwall 拦的概率。
 */
export function buildLinkedInSearchUrl(config, criteria) {
    const params = commonParams(config, criteria);
    params.set('trk', config.guestTrk);
    return `https://${config.host}/jobs/search/?${params.toString()}`;
}
//# sourceMappingURL=urls.js.map