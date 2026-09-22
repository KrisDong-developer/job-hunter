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
/**
 * **在页面上下文里**找一个"可点元素"并返回其视口中心坐标。
 *
 * 规则：只统计**可见**（有尺寸且没被 display/visibility/pointer-events 关掉）的元素；
 * `textIncludes` 非空时再按文本过滤；取**第一个命中的**。
 *
 * ⚠️ 逗号选择器返回的是**文档顺序**，不是候选优先级 —— 所以候选里只能放**同类可点元素**
 * （别放容器 div：容器总排在里面的链接之前，会被先选中）。
 * ⚠️ 必须完全自包含。`scrollIntoView` 在离线夹具里不存在，故整段 try/catch。
 */
export function elementCenterInPage(arg) {
    const empty = { found: false, x: 0, y: 0, text: '', href: '' };
    const norm = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    let nodes = [];
    try {
        nodes = Array.from(document.querySelectorAll(arg.selector));
    }
    catch {
        return empty;
    }
    const wanted = norm(arg.textIncludes);
    const visible = (el) => {
        try {
            const rect = el.getBoundingClientRect();
            // ⚠️ 必须写成 `window.getComputedStyle`：本函数会被序列化送进页面执行，
            // 裸 `getComputedStyle` 只有浏览器全局有；离线夹具（jsdom）里只挂了 `window`。
            const style = window.getComputedStyle(el);
            return (rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                style.pointerEvents !== 'none');
        }
        catch {
            return false;
        }
    };
    const chosen = nodes.find((el) => visible(el) && (wanted === '' || norm(el.textContent).includes(wanted)));
    if (chosen === undefined)
        return empty;
    try {
        chosen.scrollIntoView({ block: 'center', inline: 'center' });
    }
    catch {
        /* 离线夹具没有布局引擎 */
    }
    let rect;
    try {
        rect = chosen.getBoundingClientRect();
    }
    catch {
        return empty;
    }
    const viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 1024;
    const viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 768;
    const x = Math.min(Math.max(rect.x + rect.width / 2, 0), Math.max(0, viewportWidth - 1));
    const y = Math.min(Math.max(rect.y + rect.height / 2, 0), Math.max(0, viewportHeight - 1));
    const href = chosen.getAttribute('href') ?? chosen.getAttribute('redirect-url') ?? chosen.getAttribute('data-url') ?? '';
    return { found: true, x, y, text: norm(chosen.textContent).slice(0, 120), href };
}
/** **在页面上下文里**看某个选择器是否存在（轮询等待用）。⚠️ 必须完全自包含。 */
export function hasSelectorInPage(arg) {
    try {
        return document.querySelector(arg.selector) !== null;
    }
    catch {
        return false;
    }
}
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含）。
 *
 * 只回答一个问题：**当前页面会不会被登录墙挡住**。
 *
 * 判据（2026-09-21 由真实夹具 `51job-sz.html` 校准未登录一侧）：
 *
 * | 锚点 | 未登录 | 已登录 |
 * |---|---|---|
 * | `.loginBtnClick`（页头「登录/注册」，实测命中 2 处） | **有** | 无 |
 * | `.header .user-name` 等已登录候选 | 无 | ⚠️ 未实测（登录态夹具缺位） |
 *
 * ⚠️ 旧判据是"整页判墙 ≠ login-required ⇒ 已登录"：51job 搜索**不需要登录**，
 * 未登录照样有卡片 —— 于是未登录夹具上恒判"已登录"。结构性锚点把这一侧纠正过来；
 * 已登录一侧的候选未实测，判不出来时仍按"未登录"处理（保守：宁可漏判已登录，
 * 也不要把被登录墙挡住当成"今天没有新岗位"）。已登录锚点可经 DB 覆盖修正，不必发版。
 */
export function isLoggedInByMarkersInPage(arg) {
    const has = (selector) => {
        if (selector === '')
            return false;
        try {
            return document.querySelector(selector) !== null;
        }
        catch {
            return false;
        }
    };
    if (has(arg.loggedIn))
        return true;
    if (has(arg.notLoggedIn))
        return false;
    return null;
}
//# sourceMappingURL=list.js.map