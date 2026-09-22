/**
 * **在页面上下文里**解析详情页。⚠️ 必须完全自包含。
 * 详情页未登录通常可见（搜索引擎收录的就是它）；被墙时由调用方 `detectBlock` 兜底。
 */
export function extractDetailInPage(arg) {
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const textOf = (node) => (node === null ? '' : clean(node.textContent));
    const queryOne = (selector) => {
        try {
            return document.querySelector(selector);
        }
        catch {
            return null;
        }
    };
    const queryAll = (selector) => {
        try {
            return Array.from(document.querySelectorAll(selector));
        }
        catch {
            return [];
        }
    };
    // platformJobId：从地址反解（形态即 `detailUrlTemplate` 的约定），锚不到留空。
    let platformJobId = '';
    try {
        const match = /\/all\/([0-9]+)\.html/.exec(location.pathname);
        platformJobId = match === null ? '' : match[1] ?? '';
    }
    catch {
        platformJobId = '';
    }
    // document.title 兜底：`职位名_公司名_城市-前程无忧` → 去站名后缀、按 `_` 分段。
    let titleFallback = '';
    let companyFallback = '';
    try {
        const raw = clean(document.title).replace(/[-_]前程无忧$/, '').replace(/[-_]51job$/i, '');
        const parts = raw.split('_');
        titleFallback = clean(parts[0] ?? '');
        companyFallback = parts.length > 1 ? clean(parts[1] ?? '') : '';
    }
    catch {
        /* title 读不到就走纯 DOM 候选 */
    }
    let title = textOf(queryOne(arg.selectors.title));
    if (title === '')
        title = titleFallback;
    let salaryRaw = textOf(queryOne(arg.selectors.salary)).replace(/\s+/g, '');
    // 经验 / 学历：标签行按顺序兜底（列表侧 sensorsdata 的 jobYear/jobDegree 同款语义）
    const tagTexts = queryAll(arg.selectors.tags)
        .map((node) => clean(node.textContent))
        .filter((text) => text !== '');
    const expReq = tagTexts.find((text) => /年|以上|应届|经验/.test(text)) ?? '';
    const eduReq = tagTexts.find((text) => /本科|大专|硕士|博士|学历|中专|高中/.test(text)) ?? '';
    // JD 正文：候选链里**第一个有文本的**胜出（老版 `.job_msg` 在前 —— 它存在了很多年）
    let jdText = '';
    for (const node of queryAll(arg.selectors.jdText)) {
        const text = clean(node.textContent);
        if (text !== '') {
            jdText = text;
            break;
        }
    }
    let company = textOf(queryOne(arg.selectors.company));
    if (company === '')
        company = companyFallback;
    // 公司三段（行业 / 性质 / 规模）：与列表侧 `.bc .dc` 同一去处，顺序对齐
    const meta = queryAll(arg.selectors.companyMeta)
        .map((node) => clean(node.textContent))
        .filter((text) => text !== '');
    const notes = [];
    if (jdText === '')
        notes.push('JD 未锚定（detailSelectors.jdText 待真机校准）');
    if (title === '')
        notes.push('详情标题未锚定（title 候选与 document.title 都没给到）');
    if (company === '')
        notes.push('详情公司名未锚定（company 候选与 document.title 都没给到）');
    if (salaryRaw === '')
        notes.push('详情薪资未锚定，待校准');
    if (expReq === '' && eduReq === '')
        notes.push('经验/学历未锚定（tags 候选待校准）');
    return {
        platformJobId,
        title,
        salaryRaw,
        company,
        // 详情页的地址由调用方用**列表里那条**（避免被跳转/重定向改写成别的岗位）
        sourceUrl: location.href,
        ...(expReq === '' ? {} : { expReq }),
        ...(eduReq === '' ? {} : { eduReq }),
        ...(meta.length === 0 ? {} : { industry: meta[0] ?? null }),
        ...(meta.length < 2 ? {} : { companyNature: meta[1] ?? null }),
        ...(meta.length < 3 ? {} : { companySize: meta[2] ?? null }),
        ...(jdText === '' ? {} : { jdText }),
        ...(notes.length === 0 ? {} : { notes }),
    };
}
//# sourceMappingURL=detail.js.map