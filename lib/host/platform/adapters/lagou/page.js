/**
 * **在页面上下文里**解析详情页（选择器为经典结构，**待含登录夹具校准**）。
 * ⚠️ 必须完全自包含。详情页选择器未校准且有些字段需登录；打不开时调用方判墙兜底。
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
    // 「薪资 / 城市 / 经验 / 学历 / 性质」行（经典 dd.job_request 里的 <span> 按序）。
    let salaryRaw = '';
    let city = '';
    let expReq = '';
    let eduReq = '';
    try {
        const requestEl = document.querySelector(arg.selectors.request);
        if (requestEl !== null) {
            const spans = Array.from(requestEl.querySelectorAll('span'))
                .map((span) => (span.textContent ?? '').replace(/\s+/g, '').trim())
                .filter((text) => text !== '');
            // 经典顺序：薪资 / 城市·区 / 经验 / 学历 / 性质（`/` 分隔符已被 span 过滤掉）。
            salaryRaw = spans[0] ?? '';
            city = spans[1] ?? '';
            expReq = spans[2] ?? '';
            eduReq = spans[3] ?? '';
            if (expReq.startsWith('经验'))
                expReq = expReq.slice(2);
        }
    }
    catch {
        salaryRaw = '';
    }
    // 详情 URL 里抠纯数字 id（`/wn/jobs/<id>.html` 或 `/jobs/<id>.html`）。
    let platformJobId = '';
    try {
        const m = /\/(?:wn\/jobs|jobs)\/(\d+)\.html/.exec(location.href);
        if (m !== null)
            platformJobId = m[1] ?? '';
    }
    catch {
        platformJobId = '';
    }
    return {
        platformJobId,
        title: pick(arg.selectors.title),
        salaryRaw,
        company: pick(arg.selectors.company),
        sourceUrl: location.href,
        ...(city === '' ? {} : { city }),
        ...(expReq === '' ? {} : { expReq }),
        ...(eduReq === '' ? {} : { eduReq }),
        jdText: pick(arg.selectors.jdText),
    };
}
/**
 * 是否处于「已登录」态（用于 `auth.isLoggedIn`）。
 *
 * ⚠️ **待含登录夹具校准**。只认**结构性信号**（已登录时头部有用户头像/「我的」入口），
 * 不认"页面上有没有『登录』两个字" —— 正常结果页右上角一直有登录入口。
 */
export function isLoggedInInPage() {
    try {
        return (document.querySelector('.user-nav, [class*="user-avatar"], [class*="head-avatar"], .avatar-box') !== null);
    }
    catch {
        return false;
    }
}
/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上被序列化送进浏览器执行）。
 * 解析以**语义模式**为主（与猎聘同族做法）：选择器是"锚点提示"，命中就细化，
 * 不命中就从卡片文本抠 —— 这样即使 class 变了，薪资/经验/学历/地点仍能采到。
 * 锚不中的字段留空/记 notes，由字段级断言隔离进 pending_repair，**不编**。
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
    const salaryRe = compile(arg.salaryPattern);
    const idRe = compile(arg.jobIdPattern);
    const publishRe = compile(arg.publishPattern);
    const pick = (scope, selector) => {
        try {
            return (scope.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        }
        catch {
            return '';
        }
    };
    for (const card of Array.from(cards)) {
        // 标题链接：标题文本 + 详情 URL + 岗位 id 三合一。
        let link = null;
        try {
            link = card.querySelector(arg.selectors.titleLink);
        }
        catch {
            link = null;
        }
        if (link === null)
            continue;
        const href = link.getAttribute('href') ?? '';
        if (href === '')
            continue;
        let sourceUrl = href;
        try {
            sourceUrl = new URL(href, location.origin).href;
        }
        catch {
            /* 原样给，字段断言兜 */
        }
        const cardText = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
        let title = pick(card, arg.selectors.titleNode);
        if (title === '')
            title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title === '')
            continue;
        const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null;
        const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : '';
        // 薪资：优先 .money；拿不到就从卡片文本抠（语义模式）。
        let salaryRaw = pick(card, arg.selectors.salary);
        if (salaryRaw === '' && salaryRe !== null) {
            const m = salaryRe.exec(cardText);
            if (m !== null)
                salaryRaw = (m[0] ?? '').replace(/\s+/g, '');
        }
        // 公司：优先 .company_name；拿不到就从文本里找「](...gongsi...) 之前的文本」。
        let company = pick(card, arg.selectors.company);
        if (company === '') {
            try {
                const companyLink = card.querySelector("a[href*='/gongsi/']");
                company = (companyLink?.textContent ?? '').replace(/\s+/g, ' ').trim();
            }
            catch {
                company = '';
            }
        }
        // 「城市·区域」：优先 location 容器文本，形如【深圳-南山】或【郑州-金水区】。
        let city = '';
        let district = '';
        const locText = pick(card, arg.selectors.location);
        const locMatch = /【([^】]+)】/.exec(cardText);
        const locRaw = locText !== '' ? locText : locMatch !== null ? (locMatch[1] ?? '') : '';
        if (locRaw !== '') {
            // 先把方括号剥干净（【】[]），再切 —— 否则 split('-') 会把尾「】」留在值上。
            const cleanLoc = locRaw.replace(/[【】\[\]]/g, '').trim();
            // 分隔既可能用「·」（全角间隔点）也可能用「-」（经典结构）。
            const parts = cleanLoc.split('·');
            const [first, second] = parts.length > 1 ? parts : cleanLoc.split('-');
            city = (first ?? '').trim();
            district = (second ?? '').trim();
        }
        // 「经验 / 学历」：取 infoLine 文本，按分隔符拆两段。
        let expReq = '';
        let eduReq = '';
        const infoRaw = pick(card, arg.selectors.infoLine);
        if (infoRaw.indexOf(arg.infoSeparator) >= 0) {
            const [a, b] = infoRaw.split(arg.infoSeparator);
            expReq = (a ?? '').replace(/经验/i, '').trim();
            eduReq = (b ?? '').trim();
        }
        else if (infoRaw !== '') {
            // 无分隔符时整体当经验行（如「经验不限」），学历留给语义正则兜底。
            expReq = infoRaw.replace(/经验/i, '').trim();
            const eduMatch = /(本科|硕士|博士|大专|中专|高中|学历不限|不限)/.exec(cardText);
            if (eduMatch !== null)
                eduReq = eduMatch[1] ?? '';
        }
        if (expReq === '' || /经验.*本科/.test(infoRaw) === false) {
            const expMatch = /经验([\d\/.\-\u4e00-\u9fa5]{1,12})/.exec(cardText);
            if (expMatch !== null && expReq === '')
                expReq = (expMatch[1] ?? '').replace(/^\s+|\s+$/g, '');
        }
        if (eduReq === '') {
            const eduMatch = /(本科|硕士|博士|大专|中专|高中|学历不限)/.exec(cardText);
            if (eduMatch !== null)
                eduReq = eduMatch[1] ?? '';
        }
        // 发布时间：优先 .format-time，命中 YYYY-MM-DD 就转 ISO，否则留空。
        let publishedAt = null;
        const publishRaw = pick(card, arg.selectors.publish);
        if (publishRe !== null && publishRaw !== '') {
            const m = publishRe.exec(publishRaw);
            if (m !== null) {
                const iso = String(m[0] ?? '').replace('/', '-') + 'T00:00:00.000Z';
                const date = new Date(iso);
                if (!Number.isNaN(date.getTime()))
                    publishedAt = date.toISOString();
            }
        }
        // 职位标签。
        let tags = [];
        try {
            tags = Array.from(card.querySelectorAll(arg.selectors.jobTags))
                .map((tag) => (tag.textContent ?? '').replace(/\s+/g, ' ').trim())
                .filter((text) => text !== '');
        }
        catch {
            tags = [];
        }
        const notes = [];
        if (platformJobId === '')
            notes.push('jobIdPattern 未命中，待校准');
        if (salaryRaw === '')
            notes.push('薪资未锚定，待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
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
            ...(tags.length === 0 ? {} : { tags }),
            ...(publishedAt === null ? {} : { publishedAt }),
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**取「下一页」的真实 href（返回绝对 URL）。
 * 拉勾翻页靠 `/<城市拼音>-zhaopin/<关键词>/<页>/`，拼音 slug 无法逐城推导 ——
 * 所以**读站点生成的分页链接**，而不是自己拼（zhaopin `nextPageUrlInPage` 同一套路）。
 */
export function nextPageUrlInPage(arg) {
    let pager = null;
    try {
        pager = document.querySelector(arg.pagination);
    }
    catch {
        return null;
    }
    if (pager === null)
        return null;
    let nextLink = null;
    try {
        nextLink = pager.querySelector(arg.next);
    }
    catch {
        return null;
    }
    // 有的版本「下一页」是 <a>，有的受 `#order` 干扰；取离「下一页」文本最近的 a。
    if (nextLink === null || nextLink.tagName !== 'A') {
        try {
            const links = Array.prototype.slice.call(pager.querySelectorAll('a'));
            for (const a of links) {
                if ((a.textContent ?? '').indexOf('下一页') >= 0) {
                    nextLink = a;
                    break;
                }
            }
        }
        catch {
            nextLink = null;
        }
    }
    if (nextLink === null)
        return null;
    const cls = (nextLink.getAttribute('class') ?? '').toLowerCase();
    const noHref = nextLink.getAttribute('href') === null || (nextLink.getAttribute('href') ?? '') === '';
    if (noHref || /disable/.test(cls))
        return null;
    const href = nextLink.getAttribute('href') ?? '';
    if (href.indexOf('http') === 0)
        return href;
    return 'https://www.lagou.com' + (href.indexOf('/') === 0 ? href : '/' + href);
}
/** **在页面上下文里**判「下一页」是否可用。 */
export function hasNextPageInPage(arg) {
    try {
        const pager = document.querySelector(arg.pagination);
        if (pager === null)
            return false;
        const next = pager.querySelector(arg.next);
        if (next === null)
            return false;
        const cls = (next.getAttribute('class') ?? '').toLowerCase();
        const hasHref = (next.getAttribute('href') ?? '') !== '';
        return hasHref && !/disable/.test(cls);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=page.js.map