import { CORE_FIELDS } from '../../../shared/enums.js';
import { humanDelayMs } from '../pacing.js';
/**
 * 详情链接候选锚点（列表卡片里的岗位详情跳转）。国聘列表卡片内通常是标题或「职位职能」
 * 作为可点链接指向 `/job/detail?id=<19位数字>`。语义锚点，DB 可覆盖。
 */
const GUOPIN_DETAIL_LINK = 'a[href*="job/detail"], a[href*="/job?"]';
/** 公司链接锚点。 */
const GUOPIN_COMPANY_LINK = 'a[href*="/company"]';
/** 详情 URL 里抠出岗位 id：`/job/detail?id=<数字>`。 */
export const GUOPIN_JOB_ID_PATTERN = '/job/detail\\?id=(\\d+)';
/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id。 */
export const GUOPIN_DETAIL_URL_TEMPLATE = 'https://www.iguopin.com/job/detail?id={jobId}';
/** 薪资文本模式（组合行 `10~13K校招应届生硕士` 的薪资格，或独立「面议」）。 */
export const GUOPIN_SALARY_PATTERN = '面议|\\d+(?:\\.\\d+)?\\s*~\\s*\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*元/天';
/** 城市模式：国聘用全角书名号 `「<城市-区域>」` 包裹（实测多种形态，缺省按 城市/区域 拆）。 */
export const GUOPIN_CITY_PATTERN = '「([^「」]*)」';
/** 经验词表（组合行尾部，实测诸形态）。 */
export const GUOPIN_EXP_PATTERN = '(应届生|在校生|经验不限|1年以内|1-3年|3-5年|5-10年|10-15年|15-20年|20年以上|\\d+年)';
/** 学历词表。 */
export const GUOPIN_EDU_PATTERN = '(博士|硕士|本科|大专|无学历要求|中专|高中)';
/** 招聘性质词表（放 tags，国聘是重要筛选维度：校招/社招/实习/见习/公职/兼职）。 */
export const GUOPIN_NATURE_PATTERN = '(校招|社招|实习|见习|公职类|兼职)';
/** 公司性质词表（从 `国企500-1000人商务服务业` 这类行拆出）。 */
export const GUOPIN_NATURE_COMPANY_PATTERN = '(国有企业|国企|民营企业|民营|上市公司|事业单位|地方政府|外商独资|中外合资|其他)';
/** 公司规模模式（`1000-2000人` / `50人以下`）。 */
export const GUOPIN_SIZE_PATTERN = '(\\d+\\s*-\\s*\\d+人|\\d+人(?:以下|以上|以内)?)';
/**
 * 单次抓取的页数上限。分页参数未确证（见文件头）→ v1 单页采集是平台事实，不是保守取舍。
 * 等 probe:guopin 夹具确认分页参数后放开。
 */
export const GUOPIN_MAX_PAGES = 1;
export const DEFAULT_GUOPIN_CONFIG = {
    selectors: {
        detailLink: GUOPIN_DETAIL_LINK,
        companyLink: GUOPIN_COMPANY_LINK,
        // 宽松取一个条目容器；list 里 li 最普遍。未确证，夹具校准后改精确 class。
        container: 'li, [class*="card"], [class*="item"]',
        detailTitle: 'h1, .detail-title, [class*="title"]',
        detailSalary: '[class*="salary"], [class*="amount"]',
        detailCompany: 'a[href*="/company"]',
        detailJdText: '[class*="job-desc"], [class*="jd"], [class*="intro"]',
        pagination: 'div[class*="pager"], [class*="page"]',
    },
    urlParams: {
        base: 'https://www.iguopin.com/jobList',
        keywordParam: 'keyword',
    },
    cityCodes: {},
    jobIdPattern: GUOPIN_JOB_ID_PATTERN,
    detailUrlTemplate: GUOPIN_DETAIL_URL_TEMPLATE,
    salaryPattern: GUOPIN_SALARY_PATTERN,
    cityPattern: GUOPIN_CITY_PATTERN,
    expPattern: GUOPIN_EXP_PATTERN,
    eduPattern: GUOPIN_EDU_PATTERN,
    naturePattern: GUOPIN_NATURE_PATTERN,
    companyNaturePattern: GUOPIN_NATURE_COMPANY_PATTERN,
    companySizePattern: GUOPIN_SIZE_PATTERN,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeGuopinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_GUOPIN_CONFIG;
    const patch = override;
    const pattern = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    return {
        selectors: { ...DEFAULT_GUOPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        urlParams: { ...DEFAULT_GUOPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        cityCodes: { ...DEFAULT_GUOPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        jobIdPattern: pattern('jobIdPattern', DEFAULT_GUOPIN_CONFIG.jobIdPattern),
        detailUrlTemplate: pattern('detailUrlTemplate', DEFAULT_GUOPIN_CONFIG.detailUrlTemplate),
        salaryPattern: pattern('salaryPattern', DEFAULT_GUOPIN_CONFIG.salaryPattern),
        cityPattern: pattern('cityPattern', DEFAULT_GUOPIN_CONFIG.cityPattern),
        expPattern: pattern('expPattern', DEFAULT_GUOPIN_CONFIG.expPattern),
        eduPattern: pattern('eduPattern', DEFAULT_GUOPIN_CONFIG.eduPattern),
        naturePattern: pattern('naturePattern', DEFAULT_GUOPIN_CONFIG.naturePattern),
        companyNaturePattern: pattern('companyNaturePattern', DEFAULT_GUOPIN_CONFIG.companyNaturePattern),
        companySizePattern: pattern('companySizePattern', DEFAULT_GUOPIN_CONFIG.companySizePattern),
    };
}
/** 用平台 id 构造详情 URL。 */
export function buildGuopinJobDetailUrl(config, jobId) {
    return config.detailUrlTemplate.split('{jobId}').join(jobId);
}
/**
 * 构造列表页 URL：`https://www.iguopin.com/jobList?keyword=<kw>`。
 * 城市码未配置（v1 空表）时带城市即返回 null —— **不猜**。
 * 页码：分页参数未确证，v1 单页（不加页码参数）。
 */
export function buildGuopinSearchUrl(config, criteria) {
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        if (code === undefined)
            return null;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
/**
 * **在页面上下文里**解析列表页 —— 语义锚点（详见文件头），完全自包含。
 * ⚠️ 必须由 `page.evaluate` 序列化执行，引用任何模块作用域符号都会 ReferenceError。
 *
 * 策略：以「岗位详情链接」为锚（国聘列表卡片内标题/职能可点跳详情），
 * 每找到一个详情链接 → 用 `closest(container)` 定位单条容器 → 文本抽取各字段。
 * 抠不到 id 的卡片记 note、`platformJobId` 留空（由 sentinel 兜底隔离），不编。
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
    const idRe = compile(arg.jobIdPattern);
    const cityRe = compile(arg.cityPattern);
    const salaryRe = compile(arg.salaryPattern);
    const expRe = compile(arg.expPattern);
    const eduRe = compile(arg.eduPattern);
    const natureRe = compile(arg.naturePattern);
    const companyNatureRe = compile(arg.companyNaturePattern);
    const sizeRe = compile(arg.companySizePattern);
    /** 在容器文本上抽「城市-区域」：优先从 `「x」` 拆。 */
    const splitCity = (text) => {
        const m = cityRe === null ? null : cityRe.exec(text);
        const inner = m !== null && m[1] !== undefined ? m[1].trim() : '';
        const firstDash = inner.indexOf('-');
        if (firstDash > 0) {
            return { city: inner.slice(0, firstDash).trim(), district: inner.slice(firstDash + 1).trim() };
        }
        return { city: inner, district: '' };
    };
    let links = null;
    try {
        links = document.querySelectorAll(arg.selectors.detailLink);
    }
    catch {
        links = null;
    }
    if (links === null)
        return out;
    if (links.length === 0)
        return out;
    for (const link of Array.from(links)) {
        const href = link.getAttribute('href') ?? '';
        if (href === '')
            continue;
        let container = link;
        try {
            container = link.closest(arg.selectors.container) ?? link;
        }
        catch {
            container = link;
        }
        const boxText = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
        const idMatch = idRe !== null ? idRe.exec(href) : null;
        const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : '';
        // 标题：优先详情链接文本；兜底取详情链接前的容器文本段。
        let title = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title === '') {
            const pre = boxText.slice(0, boxText.indexOf('「'));
            title = pre.trim() === '' ? boxText.slice(0, 60).trim() : pre.trim();
        }
        // 城市 / 区域。
        const loc = splitCity(boxText);
        const city = loc.city;
        const district = loc.district;
        // 组合行抽 薪资/性质/经验/学历（不限顺序，各自词表匹配；薪资「面议」是合法值）。
        const salaryMatch = salaryRe !== null ? salaryRe.exec(boxText) : null;
        const salaryRaw = salaryMatch !== null ? salaryMatch[0].replace(/\s+/g, '') : '';
        const natureMatch = natureRe !== null ? natureRe.exec(boxText) : null;
        const expMatch = expRe !== null ? expRe.exec(boxText) : null;
        const eduMatch = eduRe !== null ? eduRe.exec(boxText) : null;
        const nature = natureMatch !== null ? (natureMatch[1] ?? '') : '';
        const expReq = expMatch !== null ? (expMatch[1] ?? '') : '';
        const eduReq = eduMatch !== null ? (eduMatch[1] ?? '') : '';
        // 公司：第一个 `/company` 链接文本。
        let company = '';
        try {
            const companyLink = container.querySelector(arg.selectors.companyLink);
            if (companyLink !== null) {
                company = (companyLink.textContent ?? '').replace(/\s+/g, ' ').trim();
            }
        }
        catch {
            company = '';
        }
        // 公司性质/规模/行业：公司名下方「国企500-1000人商务服务业」行。
        let companyNature = null;
        let companySize = null;
        let industry = null;
        if (company !== '') {
            const afterCompany = boxText.slice(boxText.indexOf(company) + company.length);
            const cnMatch = companyNatureRe !== null ? companyNatureRe.exec(afterCompany) : null;
            const sizeMatch = sizeRe !== null ? sizeRe.exec(afterCompany) : null;
            if (cnMatch !== null)
                companyNature = cnMatch[1] ?? null;
            if (sizeMatch !== null)
                companySize = sizeMatch[1]?.replace(/\s+/g, '') ?? null;
            if (sizeMatch !== null) {
                const rest = afterCompany.slice((sizeMatch[0] ?? '').length);
                industry = rest.trim() === '' ? null : rest.trim();
            }
        }
        const tags = [];
        if (nature !== '')
            tags.push(nature);
        if (expReq !== '')
            tags.push(expReq);
        if (eduReq !== '')
            tags.push(eduReq);
        const notes = [];
        if (platformJobId === '')
            notes.push('详情链接未锚定岗位 id，待 probe:guopin 校准');
        if (salaryRaw === '')
            notes.push('薪资未锚定，待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
        let sourceUrl = href;
        try {
            sourceUrl = new URL(href, location.origin).href;
        }
        catch {
            /* 相对路径拼不成就原样给，字段断言会兜 */
        }
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
        const link = document.querySelector(arg.selectors.companyLink);
        if (link !== null)
            company = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
    }
    catch {
        company = '';
    }
    return {
        platformJobId,
        title: pick(arg.selectors.detailTitle),
        salaryRaw: pick(arg.selectors.detailSalary),
        company,
        sourceUrl: location.href,
        jdText: pick(arg.selectors.detailJdText),
    };
}
/**
 * **在页面上下文里**判断撞上风控 / 登录墙。
 * 国聘是政府平台：antiBot 低档，走通用文案判定，不编平台特有墙信号。
 */
export function detectBlockInPage(arg) {
    const body = document.body;
    const text = body === null ? '' : String(body.textContent ?? '');
    const compact = text.replace(/\s+/g, '');
    let links = 0;
    try {
        links = document.querySelectorAll(arg.detailLink).length;
    }
    catch {
        links = 0;
    }
    const captcha = document.querySelector('.geetest_panel, .geetest_holder, .geetest_box, #nc_1_wrapper, iframe[src*="captcha"], #captcha, [class*="verify-wrap"], .waf-nc-title, script[name^="aliyunwaf_"]');
    if (captcha !== null)
        return 'captcha';
    if (/访问过于频繁|操作频繁|请稍后再试|访问受限|请求异常|安全验证|异常流量|人机验证/.test(compact)) {
        return 'rate-limited';
    }
    if (links === 0) {
        // 列表页没锚到详情链接：可能是登录墙 / 空页 / 改版。
        if (/请先登录|登录后才能|请登录|扫码登录/.test(compact))
            return 'login-required';
        if (compact.length < 120)
            return 'blank';
    }
    return null;
}
/** 构造国聘网适配器。 */
export function createGuopinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_GUOPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市码未实测（调研期 URL 城市参数未实证），v1 置空 —— 待逐城实测后写 DB 覆盖；未列城市一律拒绝',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: GUOPIN_MAX_PAGES,
            hint: '分页参数未确证（?p=2 未翻页），v1 单页采集；探针夹具确认分页契约后放开',
        },
    ];
    return {
        id: 'guopin',
        displayName: '国聘网',
        capabilities: {
            // 列表页未登录可看（投递才要登录）；薪资大量「面议」为合法值。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 详情链接/薪资/公司锚点待夹具校准，可能偶发缺失 → medium。
            fieldCompleteness: 'medium',
            antiBot: 'low',
        },
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: GUOPIN_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                return buildGuopinSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildGuopinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`国聘网：城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                await page.goto(url);
                // 页面服务端可渲染，但仍等一次详情链接锚点存在：0 条最易被误读成「今天没有新岗位」。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.detailLink, options.waitForListMs ?? 15_000);
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, config);
            },
            async hasNextPage() {
                // 分页参数未确证（见文件头）—— 恒 false；probe:guopin 夹具确认后补真实分页契约。
                return false;
            },
        },
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, {
                    selectors: config.selectors,
                    jobIdPattern: config.jobIdPattern,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockInPage, { detailLink: config.selectors.detailLink });
            },
        },
        // ⚠️ 不实现 `actions.sayHello` / `actions.sendResume`：国聘投递要登录态且未见稳定按钮契约，
        //    fail-closed（见 docs/ADAPTERS.md §6），而不是上线一个会乱点的实现。
    };
}
//# sourceMappingURL=guopin.js.map