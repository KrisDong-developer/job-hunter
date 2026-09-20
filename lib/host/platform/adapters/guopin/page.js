/**
 * **在页面上下文里**解析列表页 —— 卡片遍历（probe 实证结构），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 事实（2026-09-18 probe 实证 `test/fixtures/guopin-search.html`）：
 *   * 卡片容器 `.job-card`；标题 `.job-name`；城市在 `.job-title[title]`（`标题 「城市-区域」`）；
 *   * `.job-info .tag-item` 是「性质/经验/学历」（顺序不固定，经验偶缺，按词表归类）；
 *   * **列表卡片无薪资、无岗位 id、无详情链接 / 持久化载荷** —— 详见文件头；
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
            salaryRaw: '',
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
 * **在页面上下文里**解析详情页（`/job/detail?id=`）。
 * ⚠️ 自包含；详情选择器为语义锚点，待 probe:guopin 详情夹具校准。
 */
export function extractDetailInPage(arg) {
    const pick = (selector) => {
        try {
            return (document.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        }
        catch {
            return '';
        }
    };
    const idMatch = new RegExp(arg.jobIdPattern).exec(location.href);
    const platformJobId = idMatch !== null && idMatch[1] !== undefined ? idMatch[1] : '';
    let company = '';
    try {
        const link = document.querySelector(arg.selectors.detailCompany);
        if (link !== null)
            company = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
    }
    catch {
        company = '';
    }
    // 报名截止：从详情页正文抽「报名截止：<时间>」，为 campus 硬截止铺路（RawJobDetail.applyDeadline）。
    let applyDeadline = null;
    try {
        const m = new RegExp(arg.deadlinePattern).exec(document.body?.textContent ?? '');
        if (m !== null && m[1] !== undefined) {
            const raw = m[1].trim();
            applyDeadline = raw === '' ? null : raw;
        }
    }
    catch {
        applyDeadline = null;
    }
    return {
        platformJobId,
        title: pick(arg.selectors.detailTitle),
        salaryRaw: pick(arg.selectors.detailSalary),
        company,
        sourceUrl: location.href,
        jdText: pick(arg.selectors.detailJdText),
        ...(applyDeadline === null ? {} : { applyDeadline }),
    };
}
//# sourceMappingURL=page.js.map