/**
 * **在页面上下文里**解析岗位卡片（当前文档）。
 *
 * 卡片锚点：`div.base-card`；平台 id 优先取 `data-entity-urn`（`urn:li:jobPosting:{id}`），
 * 没有再从标题链接 href 抠（`/jobs/view/{slug}-{id}`）。sourceUrl 一律规范成
 * `https://{host}/jobs/view/{id}`（LinkedIn 的岗位 URL 不带 securityId 一类的会话参数，
 * 规范形可幂等 —— 与 BOSS「绝不重构 URL」的规则不冲突）。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 */
export function extractJobsInPage(arg) {
    const out = [];
    let cards = null;
    try {
        cards = document.querySelectorAll(arg.selectors.card);
    }
    catch {
        return out;
    }
    if (cards === null)
        return out;
    const compile = (source) => {
        try {
            return new RegExp(source);
        }
        catch {
            return null;
        }
    };
    const urnRe = compile(arg.jobUrnPattern);
    const urlRe = compile(arg.jobIdFromUrlPattern);
    const salaryRe = compile(arg.salaryPattern);
    const textOf = (selector, scopeEl) => {
        try {
            const el = scopeEl.querySelector(selector);
            if (el === null)
                return '';
            return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        }
        catch {
            return '';
        }
    };
    for (const card of Array.from(cards)) {
        let link = null;
        try {
            link = card.querySelector(arg.selectors.titleLink);
        }
        catch {
            link = null;
        }
        if (link === null)
            continue;
        // 标题优先用标题节点（链接文本有时带尾随装饰字符），锚不中再退链接文本。
        let title = textOf(arg.selectors.title, card);
        if (title === '')
            title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title === '')
            continue;
        const rawHref = link.getAttribute('href') ?? '';
        const urn = card.getAttribute(arg.selectors.entityUrnAttr) ?? '';
        let platformJobId = '';
        if (urnRe !== null) {
            const m = urnRe.exec(urn);
            if (m !== null)
                platformJobId = m[1] ?? '';
        }
        if (platformJobId === '' && urlRe !== null && rawHref !== '') {
            const m = urlRe.exec(rawHref);
            if (m !== null)
                platformJobId = m[1] ?? '';
        }
        const company = textOf(arg.selectors.company, card);
        const city = textOf(arg.selectors.location, card);
        const salaryRaw = textOf(arg.selectors.salary, card);
        const salary = salaryRaw !== ''
            ? salaryRaw
            : salaryRe !== null
                ? (salaryRe.exec((card.textContent ?? '').replace(/\s+/g, ' '))?.[0] ?? '')
                : '';
        // 发布时间：time 元素的 datetime 属性是 ISO 日期（比「2 days ago」的相对文本更有用）。
        let publishedAt = '';
        try {
            const timeEl = card.querySelector(arg.selectors.time);
            if (timeEl !== null)
                publishedAt = timeEl.getAttribute('datetime') ?? '';
            if (publishedAt === '' && timeEl !== null) {
                publishedAt = (timeEl.textContent ?? '').replace(/\s+/g, ' ').trim();
            }
        }
        catch {
            publishedAt = '';
        }
        // id 未命中时退回链接原始地址（source_url 是核心字段，不能给空串）。
        let sourceUrl = '';
        if (platformJobId !== '') {
            sourceUrl = `https://${arg.host}/jobs/view/${platformJobId}`;
        }
        else if (rawHref !== '') {
            try {
                sourceUrl = new URL(rawHref, location.origin).href;
            }
            catch {
                sourceUrl = rawHref;
            }
        }
        const notes = [];
        if (platformJobId === '')
            notes.push('岗位 id 未锚定（urn 与 URL 双通道都没命中），待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
        out.push({
            platformJobId,
            title,
            salaryRaw: salary,
            company,
            sourceUrl,
            ...(city === '' ? {} : { city }),
            ...(publishedAt === '' ? {} : { publishedAt }),
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**读登录态搜索页列表卡的薪资表（`{ jobPostingId: salaryRaw }`）。
 *
 * 2026-09-21 第三轮 actions 探针实测：登录态搜索页的列表卡（`[data-occludable-job-id]`）
 * 部分展示薪资明文（`¥20K/月 - ¥27K/月` 形态）；**薪资节点的类名是每次随机的混淆串**
 * （实测 `jVDYikdkEUKpihBiaAiheLNfuBZXssxrtmqk`），只能按**文本正则**从卡内抠 ——
 * 与 BOSS 薪资语义解析同款做法。连接键 `data-occludable-job-id` 与 guest 通道的
 * `platformJobId`（`urn:li:jobPosting:{id}` / `/jobs/view/{id}`）同源。
 *
 * 只返回「卡上真的写着薪资」的条目 —— 对不上的岗位由调用方留空（绝不猜）。
 */
export function extractPanelSalariesInPage(arg) {
    const out = {};
    let cards = null;
    try {
        cards = document.querySelectorAll(arg.cardSelector);
    }
    catch {
        return out;
    }
    if (cards === null)
        return out;
    let salaryRe = null;
    try {
        salaryRe = new RegExp(arg.salaryPattern);
    }
    catch {
        salaryRe = null;
    }
    if (salaryRe === null)
        return out;
    for (const card of Array.from(cards)) {
        const id = card.getAttribute('data-occludable-job-id') ?? '';
        if (id === '')
            continue;
        const text = (card.textContent ?? '').replace(/\s+/g, ' ');
        const match = salaryRe.exec(text);
        if (match !== null && (match[0] ?? '') !== '')
            out[id] = match[0] ?? '';
    }
    return out;
}
//# sourceMappingURL=list.js.map