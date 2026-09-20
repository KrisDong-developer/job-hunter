/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ **必须完全自包含**：真路径上它会被序列化后送进浏览器执行，**闭包不存在**。
 * 任何模块作用域的常量（哪怕是个数字上限）都会变成 `ReferenceError: X is not defined`。
 * 这条曾经真的踩过：`MAX_CARDS` 原本是模块级常量，离线 jsdom 测试照样通过
 * （Node 里闭包还在），一上真浏览器就整页解析失败。
 * 兜底办法是 `test/platform/fiftyone.test.ts` 里的「按源码重建函数」测试。
 *
 * @param config 选择器与 URL 配置（由宿主序列化传入）
 */
export function extractJobsInPage(config) {
    /** 列表页最多解析多少张卡片，防止异常页面把内存打满。 */
    const maxCards = 200;
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    const textOf = (node) => (node === null ? '' : clean(node.textContent));
    const queryAll = (scope, selector) => {
        try {
            return Array.prototype.slice.call(scope.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    const selectors = config.selectors;
    const cards = queryAll(document, selectors.card).slice(0, maxCards);
    const out = [];
    for (const card of cards) {
        const notes = [];
        // 跟踪载荷：jobId / 发布时间 / 经验 / 学历 只能从这里拿到。
        // 它同时也是 source_url 的来源 —— 拿不到就等于这条记录缺 source_url。
        let tracking = null;
        const trackNode = queryAll(card, selectors.tracking)[0] ?? null;
        if (trackNode !== null) {
            const raw = trackNode.getAttribute(selectors.trackingAttr);
            if (typeof raw === 'string' && raw !== '') {
                try {
                    tracking = JSON.parse(raw);
                }
                catch {
                    notes.push('tracking:unparsable');
                }
            }
        }
        else {
            notes.push('tracking:missing-element');
        }
        const pick = (key) => {
            if (tracking === null)
                return '';
            const value = tracking[key];
            return typeof value === 'string' ? clean(value) : '';
        };
        const domTitle = textOf(queryAll(card, selectors.title)[0] ?? null);
        const domSalary = textOf(queryAll(card, selectors.salary)[0] ?? null);
        const domArea = textOf(queryAll(card, selectors.area)[0] ?? null);
        const domCompany = textOf(queryAll(card, selectors.company)[0] ?? null);
        if (domTitle === '' && pick('jobTitle') !== '')
            notes.push('title:from-tracking');
        if (domSalary === '' && pick('jobSalary') !== '')
            notes.push('salary:from-tracking');
        if (domArea === '' && pick('jobArea') !== '')
            notes.push('area:from-tracking');
        const areaText = domArea !== '' ? domArea : pick('jobArea');
        const areaParts = areaText.split('·');
        const city = clean(areaParts[0] ?? '');
        const district = clean(areaParts[1] ?? '');
        const meta = queryAll(card, selectors.companyMeta).map(textOf).filter((value) => value !== '');
        const tags = queryAll(card, selectors.tags)
            .map(textOf)
            .filter((value) => value !== '');
        const jobId = pick('jobId');
        const sourceUrl = jobId === '' ? '' : config.detailUrlTemplate.split('{jobId}').join(jobId);
        out.push({
            platformJobId: jobId,
            title: domTitle !== '' ? domTitle : pick('jobTitle'),
            salaryRaw: domSalary !== '' ? domSalary : pick('jobSalary'),
            company: domCompany,
            sourceUrl,
            city,
            district,
            expReq: pick('jobYear'),
            eduReq: pick('jobDegree'),
            tags,
            publishedAt: pick('jobTime') === '' ? null : pick('jobTime'),
            industry: meta[0] ?? null,
            companyNature: meta[1] ?? null,
            companySize: meta[2] ?? null,
            notes,
        });
    }
    return out;
}
/**
 * 在页面上下文里找「下一页」是否可用（P1 只用于判断是否还有更多页）。
 *
 * 探针实测（2026-09）：51job 搜索页分页是 Element Plus：
 * `div.el-pagination.is-background > button.btn-prev + ul.el-pager + button.btn-next`，
 * 最大页数固定 50。**「下一页」的禁用态是按钮原生 `disabled` 属性**（实测末页时
 * `<button class="btn-next" disabled="disabled">`，DOM 上没有 `.is-disabled` 类）。
 * 所以这里必须查 `disabled` 属性而非 class —— 旧代码查 `.next:not(.disabled)` 会在末页误判「还有下一页」。
 */
export function hasNextPageInPage(_arg) {
    // `.btn-next`（Element Plus 真实元素）为主；`.j_next`/`.next` 是历史站点的兼容兜底。
    const next = document.querySelector('.btn-next, .j_next, [class*="pagination"] .next');
    if (next === null)
        return false;
    const el = next;
    // Element Plus 的禁用态是原生 disabled 属性，不是 class —— 所以不能只查 class。
    if (el.getAttribute('disabled') !== null)
        return false;
    if (/is-disabled|btn-disabled/.test(el.className))
        return false;
    return true;
}
//# sourceMappingURL=page.js.map