/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
 *
 * ## 内嵌载荷回填（2026-09-21 按真实夹具定案，zhipin 接口通道的同族纪律）
 *
 * 同一页面的 `window.mosaic.providerData["mosaic-provider-jobcards"]` 脚本里嵌着
 * 整批卡片的结构化数据（`metaData.mosaicProviderJobCardsModel.results[]`，连接键
 * `jobkey` ↔ DOM 的 `jk`，真实夹具 15/16 重合）—— **零额外请求**就拿到 DOM 拿不到的：
 *
 *   * `formattedRelativeTime`（「25天前」/「30+天前」）→ `publishedAt`：DOM 侧
 *     `jobListingDate` 0 命中，**这是发布日期的真源**；
 *   * `company` / `formattedLocation` → DOM 锚点 miss 时的兜底；
 *   * `salarySnippet.text` → `salaryRaw`：匿名侧实测恒为空对象，留空；
 *     登录侧若带明文则回填（DOM 正则抓不到时）。
 *
 * 四条纪律（照抄 zhipin `enrichFromApi`）：
 *   1. **岗位集合以 DOM 为准** —— 载荷只按 jobkey 补字段，**不引入新岗位**；
 *   2. **只补空缺** —— DOM 已锚定的值不覆盖（DOM 的 href 还要当 sourceUrl 的根）；
 *   3. **失败保持 DOM 结果** —— marker 找不到 / 大括号配不平 / JSON 烂，一律空表，
 *      不抛错（这条通道是"锦上添花"，不该让整页解析失败）；
 *   4. **补上之后撤掉对应 note** —— 否则数据是新的、说明是旧的，自相矛盾。
 */
export function extractJobsInPage(arg) {
    const out = [];
    let links = null;
    try {
        links = document.querySelectorAll(arg.selectors.titleLink);
    }
    catch {
        return out;
    }
    if (links === null)
        return out;
    const compile = (source) => {
        try {
            return new RegExp(source);
        }
        catch {
            return null;
        }
    };
    const keyRe = compile(arg.jobKeyPattern);
    const salaryRe = compile(arg.salaryPattern);
    /**
     * 内嵌载荷 → `jobkey → 补充字段` 表（**内联实现**，不得引用模块作用域）。
     *
     * 解析路径：遍历 `<script>` 找 `providerData["<key>"]` 赋值 → 从 `=` 后的
     * 第一个 `{` 做**平衡大括号截取**（跳过字符串字面量，含 `\"` 转义）→ `JSON.parse`。
     * 不能对整段 script 文本直接 JSON.parse：赋值语句前后都是 JS 代码。
     */
    const payloadExtrasOf = () => {
        const empty = new Map();
        if (!arg.payloadEnabled)
            return empty;
        try {
            const marker = `providerData["${arg.payloadProviderKey}"]`;
            let source = '';
            for (const node of Array.from(document.querySelectorAll('script'))) {
                const text = node.textContent ?? '';
                if (text.includes(marker)) {
                    source = text;
                    break;
                }
            }
            if (source === '')
                return empty;
            const eq = source.indexOf('=', source.indexOf(marker));
            const open = source.indexOf('{', eq);
            if (eq < 0 || open < 0)
                return empty;
            let depth = 0;
            let inString = false;
            let end = -1;
            for (let k = open; k < source.length; k += 1) {
                const ch = source[k];
                if (inString) {
                    if (ch === '\\')
                        k += 1;
                    else if (ch === '"')
                        inString = false;
                    continue;
                }
                if (ch === '"')
                    inString = true;
                else if (ch === '{')
                    depth += 1;
                else if (ch === '}') {
                    depth -= 1;
                    if (depth === 0) {
                        end = k;
                        break;
                    }
                }
            }
            if (end < 0)
                return empty;
            const parsed = JSON.parse(source.slice(open, end + 1));
            const results = parsed.metaData?.mosaicProviderJobCardsModel?.results;
            if (!Array.isArray(results))
                return empty;
            const map = new Map();
            for (const entry of results) {
                if (entry === null || typeof entry !== 'object')
                    continue;
                const item = entry;
                const jobkey = typeof item['jobkey'] === 'string' ? item['jobkey'] : '';
                if (jobkey === '')
                    continue;
                const str = (key) => (typeof item[key] === 'string' ? item[key].trim() : '');
                const snippet = item['salarySnippet'];
                const salaryText = snippet !== null && typeof snippet === 'object' && typeof snippet['text'] === 'string'
                    ? snippet['text'].trim()
                    : '';
                map.set(jobkey, {
                    relTime: str('formattedRelativeTime'),
                    company: str('company'),
                    location: str('formattedLocation'),
                    salaryText,
                });
            }
            return map;
        }
        catch {
            return empty;
        }
    };
    const extras = payloadExtrasOf();
    const textOf = (selector, scope) => {
        try {
            const el = scope.querySelector(selector);
            if (el === null)
                return '';
            return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        }
        catch {
            return '';
        }
    };
    for (const link of Array.from(links)) {
        const title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title === '')
            continue;
        const rawHref = link.getAttribute('href') ?? '';
        if (rawHref === '')
            continue;
        const keyMatch = keyRe !== null ? keyRe.exec(rawHref) : null;
        const platformJobId = keyMatch !== null ? (keyMatch[1] ?? '') : '';
        // 有 jk 就用规范详情地址（viewjob 比 /rc/clk 点击追踪链接干净、可幂等）。
        const sourceUrl = platformJobId !== '' ? `https://${arg.host}/viewjob?jk=${platformJobId}` : new URL(rawHref, location.origin).href;
        // 找"同卡"做字段锚点：真页面上公司/地点/薪资是标题锚点的**兄弟节点**（都在卡片容器内）。
        // 从链接往上爬，找到第一个包含公司节点的祖先当作卡片容器；找不到就退化为链接自身。
        let card = link;
        try {
            let node = link;
            while (node.parentElement !== null && node.parentElement !== document.body) {
                node = node.parentElement;
                if (node.querySelector(arg.selectors.company) !== null) {
                    card = node;
                    break;
                }
            }
        }
        catch {
            /* 保持 card = link */
        }
        let domSalary = '';
        if (salaryRe !== null) {
            domSalary = salaryRe.exec((card.textContent ?? '').replace(/\s+/g, ' '))?.[0] ?? '';
        }
        const domCompany = textOf(arg.selectors.company, card);
        const domCity = textOf(arg.selectors.location, card);
        const domDate = textOf(arg.selectors.date, card);
        // 载荷回填：只补 DOM 缺的（集合以 DOM 为准；DOM 已锚定的值不覆盖）。
        const extra = platformJobId !== '' ? extras.get(platformJobId) : undefined;
        const salaryRaw = domSalary !== '' ? domSalary : (extra?.salaryText ?? '');
        const company = domCompany !== '' ? domCompany : (extra?.company ?? '');
        const city = domCity !== '' ? domCity : (extra?.location ?? '');
        const dateRaw = domDate !== '' ? domDate : (extra?.relTime ?? '');
        const notes = [];
        if (platformJobId === '')
            notes.push('jobKeyPattern 未命中，待校准');
        if (salaryRaw === '')
            notes.push('薪资未锚定，待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
        // 发布日期的真源就是载荷（DOM 节点 0 命中）：通道开着却两边都没有，才值得记一笔待校准。
        if (arg.payloadEnabled && dateRaw === '')
            notes.push('发布日期（载荷 formattedRelativeTime）未命中，待校准');
        out.push({
            platformJobId,
            title,
            salaryRaw,
            company,
            sourceUrl,
            ...(city === '' ? {} : { city }),
            ...(notes.length === 0 ? {} : { notes }),
            ...(dateRaw === '' ? {} : { publishedAt: dateRaw }),
        });
    }
    return out;
}
/** **在页面上下文里**看「下一页」是否可用（被禁用时打 `aria-disabled`）。 */
export function hasNextPageInPage(arg) {
    try {
        const nav = document.querySelector(arg.pagination);
        if (nav === null)
            return false;
        const next = nav.querySelector(arg.nextPage);
        if (next === null)
            return false;
        if (String(next.getAttribute(arg.disabledAttr)).toLowerCase() === 'true')
            return false;
        if (next.hasAttribute('disabled'))
            return false;
        return true;
    }
    catch {
        return false;
    }
}
/**
 * **在页面上下文里**判登录态（自包含）。
 *
 * 2026-09-21 `probe:indeed-login` 两侧实测的判据（同一条搜索页，匿名 vs 已登录）：
 *   * **权威**：页面内嵌载荷 `"isLoggedIn":true|false` —— 匿名搜索页与
 *     `secure.indeed.com/auth` 登录页都是 `false`，已登录搜索页是 `true`；
 *   * **回落**（载荷缺失时）：匿名侧登录入口链接只在未登录时渲染
 *     （`a[href*="account.indeed.com"]`：匿名 2 命中 / 已登录 0）—— 有它即未登录；
 *     没有它按已登录处理（真实 Indeed 页面都带载荷，走到回落的只有改版/异常页，
 *     语义交给调用方结合判墙读数决定）。
 *   * 正文过短的页（挑战页/错误页）直接按未登录处理，不拿残页猜。
 */
export function isLoggedInInPage(arg) {
    try {
        const body = document.body;
        if (body === null)
            return false;
        const text = body.textContent ?? '';
        if (text.replace(/\s+/g, ' ').trim().length < 500)
            return false;
        const match = /"isLoggedIn"\s*:\s*(true|false)/.exec(text);
        if (match !== null)
            return match[1] === 'true';
        return body.querySelector(arg.loginLinkSelector) === null;
    }
    catch {
        return false;
    }
}
/**
 * **在页面上下文里**解析详情页（`/viewjob?jk=`，自包含）。
 *
 * 2026-09-21 `probe:indeed-detail` 三页实测（Nike / Apple / Expressions，产物
 * `.probe-indeed-capture/indeed-detail-report-2026-09-21.json`）：
 *   * 标题 `h1[data-testid="jobsearch-JobInfoHeader-title"]`、公司
 *     `[data-testid="inlineHeader-companyName"]`、地点
 *     `[data-testid="inlineHeader-companyLocation"]`、JD 全文 `#jobDescriptionText`
 *     —— 全部 **3/3 命中**；
 *   * **无 JSON-LD JobPosting、无日期/薪资 DOM 节点**：发布日期唯一来源是内嵌载荷
 *     `"hiringInsightsModel":{"age":"30+天前"}`（`jobMetadataFooterModel.age` 同值回落）；
 *   * `jk` 从 `location.href` 抠（与列表侧同一套规范化 → `viewjob?jk=` 地址幂等）。
 * 锚不中的字段留空 + notes，不编。
 */
export function extractDetailInPage(arg) {
    const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
    const pick = (selector) => {
        try {
            return clean(document.querySelector(selector)?.textContent);
        }
        catch {
            return '';
        }
    };
    const title = pick(arg.selectors.title);
    const company = pick(arg.selectors.company);
    const city = pick(arg.selectors.location);
    let jdText = null;
    try {
        const node = document.querySelector(arg.selectors.description);
        jdText = node === null ? null : clean(node.textContent);
        if (jdText === '')
            jdText = null;
    }
    catch {
        jdText = null;
    }
    let platformJobId = '';
    try {
        const match = new RegExp(arg.jobKeyPattern).exec(location.href);
        platformJobId = match !== null && match[1] !== undefined ? match[1] : '';
    }
    catch {
        platformJobId = '';
    }
    // 发布日期：内嵌载荷的 hiringInsightsModel.age（无 JSON-LD，这是唯一来源 —— 见函数头）。
    let postedAge = '';
    try {
        const ageRe = new RegExp(arg.postedAgePattern);
        const match = ageRe.exec(document.body?.textContent ?? '');
        if (match !== null)
            postedAge = match[1] ?? match[2] ?? '';
    }
    catch {
        postedAge = '';
    }
    const notes = [];
    if (title === '')
        notes.push('详情标题未锚定，待校准');
    if (company === '')
        notes.push('详情公司未锚定，待校准');
    if (jdText === null)
        notes.push('JD 全文未锚定，待校准');
    if (postedAge === '')
        notes.push('发布日期（载荷 age）未命中，待校准');
    return {
        platformJobId,
        title,
        company,
        salaryRaw: '',
        sourceUrl: platformJobId !== '' ? `https://${arg.host}/viewjob?jk=${platformJobId}` : location.href,
        ...(city === '' ? {} : { city }),
        ...(notes.length === 0 ? {} : { notes }),
        ...(postedAge === '' ? {} : { publishedAt: postedAge }),
        jdText,
    };
}
//# sourceMappingURL=page.js.map