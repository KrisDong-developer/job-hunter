/**
 * **在页面上下文里**解析列表页 —— 卡片遍历（probe 实证结构），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 事实（2026-09-18 probe 实证 `test/fixtures/guopin-search.html`，2026-09-20 复核修正）：
 *   * 卡片容器 `.job-card`；标题 `.job-name`；城市在 `.job-title[title]`（`标题 「城市-区域」`）；
 *   * `.job-info .tag-item` 是「性质/经验/学历」（顺序不固定，经验偶缺，按词表归类）；
 *   * `.job-info .job-salary` 是薪资（**18/20 卡片有**：面议 / 10~13K / 8~9K·16薪…；
 *     旧结论"列表卡片无薪资"是对恰好无薪资首卡的过采样，已推翻 —— 读不到留空由详情页兜底）；
 *   * **列表卡片无岗位 id、无详情链接 / 持久化载荷** —— 详见文件头；
 *   * 公司 `.company-name`（文本可能被省略号截断，用 title 属性补全）；
 *   * `.company-info .company-info-item` 顺序固定：性质/规模/行业；
 *   * `.job-tag .ant-tag` 是职能标签（进 tags）。
 *
 * 幂等键：列表无 id → `platformJobId` 用内容哈希（FNV-1a，同步、自包含）——
 * `ch:` + hash(title|company|city|district)，deterministic，同岗位重复抓不重复。
 * ▸ 这是用户拍板的方案（列表页无 id 的适应层兜底），不是平台 id；`sourceUrl` 存列表页 url。
 */
export function extractJobsInPage(arg) {
    const out = [];
    const compile = (source) => {
        try {
            return new RegExp(source);
        }
        catch {
            return null;
        }
    };
    const cityRe = compile(arg.cityPattern);
    const expRe = compile(arg.expPattern);
    const eduRe = compile(arg.eduPattern);
    const natureRe = compile(arg.naturePattern);
    const salaryRe = compile(arg.salaryPattern);
    /** 确定性内容哈希（FNV-1a 32bit → hex）。自包含、同步，页面/夹具都可跑。 */
    const contentKey = (title, company, city, district) => {
        const s = `${title}\u0001${company}\u0001${city}\u0001${district}`;
        let h = 2166136261;
        for (let i = 0; i < s.length; i += 1) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return `ch:${(h >>> 0).toString(16)}`;
    };
    /** 抽「城市-区域」。 */
    const splitCity = (text) => {
        const m = cityRe === null ? null : cityRe.exec(text);
        const inner = m !== null && m[1] !== undefined ? m[1].trim() : '';
        const firstDash = inner.indexOf('-');
        if (firstDash > 0) {
            return { city: inner.slice(0, firstDash).trim(), district: inner.slice(firstDash + 1).trim() };
        }
        return { city: inner, district: '' };
    };
    const clean = (node) => node === null ? '' : (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    let cards = null;
    try {
        cards = document.querySelectorAll(arg.selectors.card);
    }
    catch {
        cards = null;
    }
    if (cards === null)
        return out;
    for (const card of Array.from(cards)) {
        // 标题 + 城市/区域。
        let title = clean(card.querySelector(arg.selectors.jobName));
        let city = '';
        let district = '';
        try {
            // `.job-title[title]` 带「城市-区域」；company-name 的 title 在其后，取第一个 [title] 即可。
            const titleWrap = card.querySelector('[title]');
            if (titleWrap !== null) {
                const attrText = (titleWrap.getAttribute(arg.selectors.jobTitleAttr) ?? '').replace(/\s+/g, ' ').trim();
                if (attrText !== '') {
                    const loc = splitCity(attrText);
                    city = loc.city;
                    district = loc.district;
                    if (title === '') {
                        title = city === '' ? attrText : attrText.slice(0, attrText.indexOf('「')).trim();
                    }
                }
            }
        }
        catch {
            /* 城市拿不到就留空 */
        }
        if (title === '')
            continue;
        // 「性质/经验/学历」标签：顺序不固定、经验偶缺，按词表归类。
        let nature = '';
        let expReq = '';
        let eduReq = '';
        try {
            for (const item of Array.from(card.querySelectorAll(arg.selectors.jobInfoItems))) {
                const t = clean(item);
                if (t === '')
                    continue;
                if (natureRe !== null && natureRe.test(t))
                    nature = t;
                else if (eduRe !== null && eduRe.test(t))
                    eduReq = t;
                else if (expRe !== null && expRe.test(t))
                    expReq = t;
            }
        }
        catch {
            /* 留空 */
        }
        // 薪资：`.job-info .job-salary`（18/20 卡片有）。文本要过 `salaryPattern` 才收 ——
        // 命不中说明元素装的不是薪资（版式变了），宁空勿脏（空值被如实当成"没读到"）。
        let salaryRaw = '';
        try {
            const salaryText = (card.querySelector(arg.selectors.salary)?.textContent ?? '')
                .replace(/\s+/g, '')
                .trim();
            if (salaryText !== '' && salaryRe !== null && salaryRe.test(salaryText))
                salaryRaw = salaryText;
        }
        catch {
            salaryRaw = '';
        }
        // 公司：`.company-name`（title 属性补全文）。
        let company = '';
        try {
            const cl = card.querySelector(arg.selectors.companyLink);
            if (cl !== null) {
                company = (cl.getAttribute('title') ?? cl.textContent ?? '').replace(/\s+/g, ' ').trim();
            }
        }
        catch {
            company = '';
        }
        // 公司性质/规模/行业：`.company-info .company-info-item` 顺序固定 ×3。
        let companyNature = null;
        let companySize = null;
        let industry = null;
        try {
            const items = Array.from(card.querySelectorAll(arg.selectors.companyInfoItems)).map((node) => clean(node));
            companyNature = items[0] ?? null;
            companySize = items[1] ?? null;
            industry = items[2] ?? null;
        }
        catch {
            /* 留空 */
        }
        // 职能标签。
        const fnTags = [];
        try {
            for (const node of Array.from(card.querySelectorAll(arg.selectors.jobTags))) {
                const t = clean(node);
                if (t !== '')
                    fnTags.push(t);
            }
        }
        catch {
            /* 忽略 */
        }
        const tags = [];
        for (const t of [nature, expReq, eduReq, ...fnTags]) {
            if (t !== '' && !tags.includes(t))
                tags.push(t);
        }
        const notes = [];
        if (company === '')
            notes.push('公司未锚定，待校准');
        // 列表无平台 id → 内容哈希幂等键（用户拍板方案）；sourceUrl 存列表页（回到列表）。
        const platformJobId = contentKey(title, company, city, district);
        const sourceUrl = location.href;
        out.push({
            platformJobId,
            title,
            salaryRaw,
            company,
            sourceUrl,
            ...(city === '' ? {} : { city }),
            ...(district === '' ? {} : { district }),
            ...(expReq === '' ? {} : { expReq }),
            ...(eduReq === '' ? {} : { eduReq }),
            tags,
            ...(industry === null ? {} : { industry }),
            ...(companySize === null ? {} : { companySize }),
            ...(companyNature === null ? {} : { companyNature }),
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**连点「下一页」直到目标页（自包含）。
 *
 * 为什么是"点击"而不是 URL 参数（2026-09-20 `probe:guopin-pagination` 实测定案）：
 *   * URL `?page=2` 被 SPA **忽略**（active 仍是 1）—— 智联式的 URL 寻址在国聘不成立；
 *   * 真鼠标点 `.ant-pagination-item-2` **有效**（active=2、数据换 9/20）。
 *
 * 实现口径：
 *   * 点击用 `element.click()`（**采集侧**翻页，不是打招呼那种高危动作 —— §7 的 CDP Input
 *     级要求不适用；ant-design 是 React，合成事件挂在 root 上，`el.click()` 的原生冒泡
 *     会被 onChange 正常接到）。探针已实证 CDP 点击有效，这条是它的等效低风险实现；
 *   * 每点一步都**等 `.ant-pagination-item-active` 的页码真的变了**才点下一步 ——
 *     不看页码就连点，会把"点了没反应"当成翻页成功，重复读同一页还不自知；
 *   * 任何一步失败（next 不在 / disabled / 超时页码没变）都返回 false，
 *     由 `gotoSearch` 抛错（fail-closed：翻不到目标页就别读假数据）。
 */
export async function turnToPageInPage(arg) {
    const sleep = (ms) => new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
    const activePageOf = () => {
        try {
            const el = document.querySelector(arg.active);
            return Number.parseInt((el?.getAttribute('title') ?? el?.textContent ?? '').trim(), 10);
        }
        catch {
            return Number.NaN;
        }
    };
    let current = activePageOf();
    if (!Number.isFinite(current))
        return false;
    // 防御性护栏：万一页码判断失灵，最多点 40 步（20 页的翻倍余量），不许死循环。
    for (let step = 0; step < 40 && current < arg.targetPage; step += 1) {
        let nextLi = null;
        try {
            nextLi = document.querySelector(arg.next);
        }
        catch {
            nextLi = null;
        }
        if (nextLi === null)
            return false;
        try {
            if (document.querySelector(arg.nextDisabled) !== null)
                return false;
        }
        catch {
            /* 选择器非法 → 当作可点 */
        }
        const button = nextLi.querySelector('button') ?? nextLi;
        try {
            ;
            button.click();
        }
        catch {
            return false;
        }
        const deadline = Date.now() + arg.stepTimeoutMs;
        let turned = false;
        while (Date.now() < deadline) {
            await sleep(400);
            const now = activePageOf();
            if (Number.isFinite(now) && now > current) {
                current = now;
                turned = true;
                break;
            }
        }
        if (!turned)
            return false;
    }
    return current === arg.targetPage;
}
/**
 * **在页面上下文里**读「还有没有下一页」（自包含）。
 *
 * 判据（2026-09-20 实测的 ant 分页结构）：`li.ant-pagination-next` 存在且
 * **不带** `ant-pagination-disabled` → 还有下一页；分页区整个不在（0 条结果 /
 * 离线夹具）→ false。主链在 `pageNo < maxPages` 时才会问，这里如实回答。
 */
export function hasNextPageInPage(arg) {
    try {
        if (document.querySelector(arg.next) === null)
            return false;
        return document.querySelector(arg.nextDisabled) === null;
    }
    catch {
        return false;
    }
}
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`，自包含；与 zhipin 的同名函数同构）。
 *
 * 判据来自两份真实页面的对比（命中数两端验证，2026-09-20）：
 *
 * | 锚点 | 未登录夹具 | 登录态快照 |
 * |---|---|---|
 * | `.avatar-box .user-name`（页头用户区，文本是脱敏手机号） | 无 | **有** |
 * | `a.login`（页头「登录/注册」，href 是 `/login?redirect=…`） | **有** | 无 |
 *
 * 两者都不在 ⇒ 返回 `null`（**判不出来**），由适配器落成 `false`（保守：
 * 宁可漏判"已登录"，也不要把被登录墙挡住当成"今天没有新岗位"）。
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