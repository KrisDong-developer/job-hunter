/**
 * **在页面上下文里**解析详情页（自包含）。
 *
 * 快照样本（引才计划岗）**没有薪资节点** —— 薪资不是每个详情页都有，
 * `detailSalary` 保留语义候选，读到就过 `salaryPattern` 校验（宁空勿脏）。
 */
export function extractDetailInPage(arg) {
    const compile = (source) => {
        try {
            return new RegExp(source);
        }
        catch {
            return null;
        }
    };
    const salaryRe = compile(arg.salaryPattern);
    const eduRe = compile(arg.eduPattern);
    const expRe = compile(arg.expPattern);
    const natureRe = compile(arg.naturePattern);
    const natureCompanyRe = compile(arg.companyNaturePattern);
    const sizeRe = compile(arg.companySizePattern);
    const deadlineRe = compile(arg.deadlinePattern);
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const textOf = (node) => (node === null ? '' : clean(node.textContent));
    const pick = (selector) => {
        try {
            return textOf(document.querySelector(selector));
        }
        catch {
            return '';
        }
    };
    const idMatch = new RegExp(arg.jobIdPattern).exec(location.href);
    const platformJobId = idMatch !== null && idMatch[1] !== undefined ? idMatch[1] : '';
    // 标题：`.title-section .title`；兜底 document.title 第一段（「岗位-公司-国聘」）。
    let title = pick(arg.selectors.detailTitle);
    if (title === '') {
        const head = clean(document.title.split('-')[0]);
        title = head;
    }
    // 薪资：语义候选（本快照无此节点）；文本要过 salaryPattern 才收，宁空勿脏。
    let salaryRaw = pick(arg.selectors.detailSalary).replace(/\s+/g, '');
    if (salaryRaw !== '' && (salaryRe === null || !salaryRe.test(salaryRaw)))
        salaryRaw = '';
    // ── overview 键值对：按 overview-title 的**文本**归类（顺序不固定，认不出进 tags）──
    let applyDeadline = null;
    let eduReq = '';
    let expReq = '';
    const tags = [];
    try {
        for (const item of Array.from(document.querySelectorAll(arg.selectors.detailOverviewItems))) {
            const key = textOf(item.querySelector('.overview-title')).replace(/[：:]\s*$/, '');
            const value = textOf(item.querySelector('.overview-desc'));
            if (key === '' || value === '')
                continue;
            if (key.includes('报名截止')) {
                applyDeadline = value;
                continue;
            }
            if (key.includes('学历')) {
                eduReq = value;
                continue;
            }
            if (key.includes('经验')) {
                expReq = value;
                continue;
            }
            // 职位性质（校招/社招…）：裸值进 tags —— 与列表侧 tags 的口径一致
            // （列表把性质/经验/学历的裸值都放 tags）。
            if (natureRe !== null && natureRe.test(value)) {
                if (!tags.includes(value))
                    tags.push(value);
                continue;
            }
            // 招聘人数 / 专业要求 / 行业要求 …：没有对应字段，带 key 前缀进 tags 保信息量。
            if (eduRe !== null && eduRe.test(value)) {
                if (eduReq === '')
                    eduReq = value;
                continue;
            }
            if (expRe !== null && expRe.test(value)) {
                if (expReq === '')
                    expReq = value;
                continue;
            }
            if (!tags.includes(`${key}：${value}`.slice(0, 30)))
                tags.push(`${key}：${value}`.slice(0, 30));
        }
    }
    catch {
        /* overview 解析失败不影响其余字段 */
    }
    // 报名截止兜底：overview 没给时，从正文抠「报名截止：<时间>」（老路径，保 DB 覆盖兼容）。
    if (applyDeadline === null) {
        try {
            const m = deadlineRe === null ? null : deadlineRe.exec(document.body?.textContent ?? '');
            if (m !== null && m[1] !== undefined) {
                const raw = m[1].trim();
                if (raw !== '')
                    applyDeadline = raw;
            }
        }
        catch {
            applyDeadline = null;
        }
    }
    // 职能标签（`.intro-tag`，进 tags，与 overview 挤进来的键值对共存去重）。
    try {
        for (const tag of Array.from(document.querySelectorAll(arg.selectors.detailIntroTags))) {
            const t = textOf(tag);
            if (t !== '' && !tags.includes(t))
                tags.push(t);
        }
    }
    catch {
        /* 留空 */
    }
    // JD 全文（`.job-duty`）。
    const jdText = pick(arg.selectors.detailJdText);
    // 公司名（`.company-title`；logo 链接的 a 里没有文本，之前 `a[href*="/company"]` 会先命中它）。
    const company = pick(arg.selectors.detailCompany);
    // 公司标签 ×4：顺序不固定（服务类型/性质/行业/规模），按词表归类性质与规模；
    // 行业不猜（「公共招聘服务 / 汽车制造业」分不出谁是行业，列表侧 company-info-item 已有行业）。
    let companyNature = '';
    let companySize = '';
    try {
        for (const tag of Array.from(document.querySelectorAll(arg.selectors.detailCompanyTags))) {
            const t = textOf(tag);
            if (t === '')
                continue;
            if (natureCompanyRe !== null && natureCompanyRe.test(t) && companyNature === '')
                companyNature = t;
            else if (sizeRe !== null && sizeRe.test(t) && companySize === '')
                companySize = t;
        }
    }
    catch {
        /* 留空 */
    }
    // 更新时间（「更新于 2026-09-12」→ publishedAt 只留日期）。
    let publishedAt = null;
    const updateTime = pick(arg.selectors.detailUpdateTime);
    if (updateTime !== '') {
        const m = /(\d{4}-\d{2}-\d{2})/.exec(updateTime);
        if (m !== null && m[1] !== undefined)
            publishedAt = m[1];
    }
    return {
        platformJobId,
        title,
        salaryRaw,
        company,
        sourceUrl: location.href,
        jdText,
        tags,
        ...(expReq === '' ? {} : { expReq }),
        ...(eduReq === '' ? {} : { eduReq }),
        ...(companyNature === '' ? {} : { companyNature }),
        ...(companySize === '' ? {} : { companySize }),
        ...(publishedAt === null ? {} : { publishedAt }),
        ...(applyDeadline === null ? {} : { applyDeadline }),
    };
}
//# sourceMappingURL=detail.js.map