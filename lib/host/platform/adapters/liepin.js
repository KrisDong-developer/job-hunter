import { CORE_FIELDS } from '../../../shared/enums.js';
import { humanDelayMs } from '../pacing.js';
import { detectBlockWithSignals, signalsOf } from '../block-signals.js';
import { platformFacts } from '../platform-facts.js';
export const LIEPIN_SALARY_PATTERN = '\\d+(?:\\.\\d+)?\\s*[-~]\\s*\\d+(?:\\.\\d+)?\\s*[kK万](?:\\s*[·x×]\\s*\\d+\\s*薪)?|\\d+(?:\\.\\d+)?\\s*[kK万]\\s*以上|面议';
/** 岗位链接形态（夹具实测两种并存）：`/job/<纯数字>.shtml`（普通岗）与
 * `/a/<纯数字>.shtml`（Agent/劳务类岗，如「测试工程师（不要Java）」）。
 * 两者都是真实职位，都要收。
 */
export const LIEPIN_JOB_ID_PATTERN = '/(?:job|a)/(\\d+)\\.shtml';
/**
 * 搜索接口（v2 接口化解析，2026-09-18 采样）：
 * `POST https://api-c.liepin.com/api/com.liepin.searchfront4c.pc-search-job`。
 * 响应比 DOM 富（labels/refreshTime/compId/recruiter），refreshTime 让
 * publishedAt 首次可用。请求体结构来自真实采样（见 fixtures/liepin-search-api.json）。
 */
export const LIEPIN_SEARCH_API_PATH = '/api/com.liepin.searchfront4c.pc-search-job';
/** 城市：夹具实测「Java工程师【佛山-顺德区】急聘15-30k·14薪」——【】里就是城市。 */
export const LIEPIN_CITY_PATTERN = '【([^】]{2,15})】';
/** 经验/学历词表（夹具实测位于链接文本尾部，如「5年以上本科」）。 */
export const LIEPIN_EXP_PATTERN = '(\\d+年以上|\\d+年以内|1年以下|经验不限|在校生|应届生)';
export const LIEPIN_EDU_PATTERN = '(本科|硕士|博士|大专|学历不限|中专|高中|MBA|统招本科)';
/**
 * 单次抓取的页数上限。猎聘 antiBot=high，给得比 51job/智联更保守：
 * 默认 3 页、上限 8 页。
 */
export const LIEPIN_DEFAULT_MAX_PAGES = 3;
export const LIEPIN_MAX_PAGES = 8;
export const DEFAULT_LIEPIN_CONFIG = {
    selectors: {
        card: "div[class*='job-card-pc-container']",
        jobLink: "a[data-nick='job-detail-job-info']",
        companyInfoBox: "[data-nick='job-detail-company-info']",
        titleNode: 'div[title]',
        pagination: '.list-pagination-box',
        nextPage: 'li.ant-pagination-next',
        nextPageDisabledClass: 'ant-pagination-disabled',
    },
    urlParams: {
        base: 'https://www.liepin.com/zhaopin/',
        keywordParam: 'key',
        cityParam: 'city',
        cityAliasParam: 'dq',
        pageParam: 'currentPage',
    },
    cityCodes: {
        // 全国 = 不带城市参数（最像真人默认进入）。接口采样证据：无 city 时
        // 站点自己发 `city=410&dq=410`（410 = 全国）。
        // 具体城市码**没有可靠来源，不编**：从自己浏览器的猎聘搜索 URL 抄，
        // 写进 DB 覆盖（setting scope='platform' scope_ref='liepin' key='adapter-config'）。
        全国: '',
    },
    salaryPattern: LIEPIN_SALARY_PATTERN,
    jobIdPattern: LIEPIN_JOB_ID_PATTERN,
    cityPattern: LIEPIN_CITY_PATTERN,
    expPattern: LIEPIN_EXP_PATTERN,
    eduPattern: LIEPIN_EDU_PATTERN,
    searchApiOrigin: 'https://api-c.liepin.com',
    searchApiPath: LIEPIN_SEARCH_API_PATH,
    searchApiEnabled: true,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeLiepinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_LIEPIN_CONFIG;
    const patch = override;
    const pattern = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    return {
        selectors: { ...DEFAULT_LIEPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        urlParams: { ...DEFAULT_LIEPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        cityCodes: { ...DEFAULT_LIEPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        salaryPattern: pattern('salaryPattern', DEFAULT_LIEPIN_CONFIG.salaryPattern),
        jobIdPattern: pattern('jobIdPattern', DEFAULT_LIEPIN_CONFIG.jobIdPattern),
        cityPattern: pattern('cityPattern', DEFAULT_LIEPIN_CONFIG.cityPattern),
        expPattern: pattern('expPattern', DEFAULT_LIEPIN_CONFIG.expPattern),
        eduPattern: pattern('eduPattern', DEFAULT_LIEPIN_CONFIG.eduPattern),
        searchApiOrigin: pattern('searchApiOrigin', DEFAULT_LIEPIN_CONFIG.searchApiOrigin),
        searchApiPath: pattern('searchApiPath', DEFAULT_LIEPIN_CONFIG.searchApiPath),
        searchApiEnabled: typeof patch.searchApiEnabled === 'boolean' ? patch.searchApiEnabled : DEFAULT_LIEPIN_CONFIG.searchApiEnabled,
    };
}
/**
 * 构造搜索 URL：`https://www.liepin.com/zhaopin/?key=Java&currentPage=0`。
 * 城市存在时拼 `city=<code>&dq=<code>`（get_jobs 同款双参数）。
 * 城市码未知 → `null`（调用方拒绝，**不猜**）。
 */
export function buildLiepinSearchUrl(config, criteria) {
    let cityCode;
    if (criteria.city !== undefined && criteria.city !== '') {
        cityCode = config.cityCodes[criteria.city];
        if (cityCode === undefined)
            return null;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (cityCode !== undefined && cityCode !== '') {
        params.set(config.urlParams.cityParam, cityCode);
        params.set(config.urlParams.cityAliasParam, cityCode);
    }
    // criteria.page 是 1 起；猎聘 currentPage 是 0 起（get_jobs 实测首页为 0）。
    const page = criteria.page === undefined ? 1 : criteria.page;
    params.set(config.urlParams.pageParam, String(Math.max(0, page - 1)));
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
/**
 * 构造搜索接口请求体（Node 侧；结构来自 2026-09-18 真实采样）。
 * 采样里 ckId 是会话值 —— 这里留空待验证，失败自动走 DOM 通道（见 LiepinConfig 注释）。
 */
export function buildSearchRequestBody(criteria, cityCode) {
    const page = criteria.page === undefined ? 1 : criteria.page;
    const form = {
        city: cityCode,
        dq: cityCode,
        pubTime: '',
        currentPage: String(Math.max(0, page - 1)),
        pageSize: 40,
        key: criteria.keyword ?? '',
        suggestTag: '',
        workYearCode: '',
        compId: '',
        compName: '',
        compTag: '',
        industry: '',
        salaryCode: '',
        jobKind: '',
        compScale: '',
        compKind: '',
        compStage: '',
        eduLevel: '',
        salaryLow: '',
        salaryHigh: '',
    };
    return {
        data: {
            mainSearchPcConditionForm: form,
            passThroughForm: { scene: 'init', skId: '', fkId: '', ckId: '' },
        },
    };
}
/**
 * **在页面上下文里**发搜索接口请求（自包含；用页面自己的 fetch 带完整
 * Cookie/指纹/TLS，与 waiqi 适配器同一铁律：绝不回退宿主 Node 的 fetch）。
 * 返回解析后的 JSON；任何失败返回 null（调用方走 DOM 兜底）。
 */
export function fetchListInPage(arg) {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return Promise.resolve(null);
    return fetchImpl(arg.apiPath, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(arg.body),
    })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
}
/** `yyyymmddHHMMss` → ISO（接口 refreshTime 形态，夹具实测）。 */
export function refreshTimeToIso(raw) {
    if (!/^\d{14}$/.test(raw))
        return null;
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+08:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
/**
 * 解析搜索接口响应（Node 侧纯函数；结构来自采样：`data.data.jobCardList`
 * 或 `data.jobCardList`，兼容 get_jobs 的两种观察形态）。
 */
export function parseSearchApiResponse(payload) {
    const out = [];
    if (payload === null || typeof payload !== 'object')
        return out;
    const root = payload;
    const cards = root.data?.data?.jobCardList ?? root.data?.jobCardList;
    if (!Array.isArray(cards))
        return out;
    for (const entry of cards) {
        if (entry === null || typeof entry !== 'object')
            continue;
        const item = entry;
        const job = item.job;
        const comp = item.comp;
        if (job === undefined)
            continue;
        const jobId = job['jobId'];
        if (jobId === undefined || jobId === null || String(jobId) === '')
            continue;
        const text = (value) => (typeof value === 'string' ? value.trim() : '');
        const refreshIso = refreshTimeToIso(text(job['refreshTime']));
        const labels = job['labels'];
        const tags = Array.isArray(labels)
            ? labels.filter((label) => typeof label === 'string' && label !== '').slice(0, 6)
            : undefined;
        out.push({
            platformJobId: String(jobId),
            title: text(job['title']),
            salaryRaw: text(job['salary']),
            company: comp === undefined ? '' : text(comp['compName']),
            sourceUrl: text(job['link']),
            city: text(job['dq']),
            expReq: text(job['requireWorkYears']),
            eduReq: text(job['requireEduLevel']),
            industry: comp === undefined ? null : text(comp['compIndustry']) || null,
            companySize: comp === undefined ? null : text(comp['compScale']) || null,
            publishedAt: refreshIso,
            ...(tags === undefined || tags.length === 0 ? {} : { tags }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**解析列表页。
 *
 * ⚠️ 必须完全自包含（真路径上会被序列化送进浏览器执行，闭包不存在）。
 * 卡片结构（夹具实测）：
 *
 *   div.job-card-pc-container
 *     └ a[data-nick=job-detail-job-info]                 ← 职位链接（广告卡没有）
 *         ├ div[title="招聘Java工程师"] → Java工程师      ← 标题
 *         ├ 【佛山-顺德区】                               ← 城市
 *         ├ 15-30k·14薪                                  ← 薪资（文本模式）
 *         └ 5年以上 / 本科                                ← 经验/学历（词表）
 *     └ [data-nick=job-detail-company-info]
 *         └ span × 3：库卡机器人 / 工业自动化 / 2000-5000人
 *
 * 解析失败的字段留空/记 notes，由字段级断言隔离 —— **不编**。
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
    const cityRe = compile(arg.cityPattern);
    const expRe = compile(arg.expPattern);
    const eduRe = compile(arg.eduPattern);
    for (const card of Array.from(cards)) {
        let link = null;
        try {
            link = card.querySelector(arg.selectors.jobLink);
        }
        catch {
            link = null;
        }
        // 广告/推荐卡没有职位链接 → 跳过（夹具实测 42 卡中 5 张属于此类）。
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
            /* 相对路径拼不成就原样给，字段断言会兜 */
        }
        const linkText = (link.textContent ?? '').replace(/\s+/g, ' ').trim();
        const cardText = (card.textContent ?? '').replace(/\s+/g, ' ').trim();
        // 标题：优先链接内带 title 属性的节点（文本比 title 属性干净——后者带"招聘"前缀）。
        let title = '';
        try {
            const titleNode = link.querySelector(arg.selectors.titleNode);
            if (titleNode !== null) {
                title = (titleNode.textContent ?? '').replace(/\s+/g, ' ').trim();
                if (title === '')
                    title = (titleNode.getAttribute('title') ?? '').trim();
            }
        }
        catch {
            title = '';
        }
        if (title === '') {
            // 兜底：链接文本截到第一个【或数字（薪资/城市）之前。
            const head = /[【\d]/.exec(linkText);
            title = head !== null ? linkText.slice(0, head.index).trim() : linkText.slice(0, 40).trim();
        }
        if (title === '')
            continue;
        const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null;
        const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : '';
        const cityMatch = cityRe !== null ? cityRe.exec(linkText) : null;
        const city = cityMatch !== null ? (cityMatch[1] ?? '').trim() : '';
        const salaryMatch = salaryRe !== null ? salaryRe.exec(cardText) : null;
        const salaryRaw = salaryMatch !== null ? salaryMatch[0].replace(/\s+/g, '') : '';
        const expMatch = expRe !== null ? expRe.exec(linkText) : null;
        const expReq = expMatch !== null ? (expMatch[1] ?? '') : '';
        const eduMatch = eduRe !== null ? eduRe.exec(linkText) : null;
        const eduReq = eduMatch !== null ? (eduMatch[1] ?? '') : '';
        // 公司盒：span 文本按顺序是 公司名 / 行业 / 规模（夹具实测；logo 是 img 不干扰）。
        let company = '';
        let industry = null;
        let companySize = null;
        try {
            const box = card.querySelector(arg.selectors.companyInfoBox);
            if (box !== null) {
                const spans = Array.from(box.querySelectorAll('span'))
                    .map((span) => (span.textContent ?? '').replace(/\s+/g, ' ').trim())
                    .filter((text) => text !== '');
                company = spans[0] ?? '';
                industry = spans[1] ?? null;
                companySize = spans[2] ?? null;
            }
        }
        catch {
            company = '';
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
            ...(expReq === '' ? {} : { expReq }),
            ...(eduReq === '' ? {} : { eduReq }),
            ...(industry === null ? {} : { industry }),
            ...(companySize === null ? {} : { companySize }),
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * 猎聘特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 *   * 验证码：多出 `.geetest_box` / `#nc_1_wrapper`（探针实测的极验容器），
 *     以及阿里云 WAF 的 `waf-nc-title` + `aliyunwaf_` 脚本名；
 *   * `blankOnAboutProtocol`：风控命中时 `security.min.js` 会
 *     `location.replace('about:blank')` **把页面销毁** —— 那不是文案也不是 DOM 特征，
 *     是结构性判据，所以只能是开关；
 *   * `skipLoginWall`：猎聘的登录墙文案**尚无实测证据**，原实现明确写着"不判"
 *     （宁可让 blank / 0 条暴露，也不猜）。这里把它变成**显式开关** ——
 *     不判也是一种决定，要写出来，而不是靠"通用词表里恰好没有它要的词"。
 */
const LIEPIN_BLOCK_SIGNALS = {
    captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
};
const LIEPIN_BLOCK_FLAGS = { blankOnAboutProtocol: true, skipLoginWall: true };
/** **在页面上下文里**看「下一页」是否可用（AntD 分页按钮组）。 */
export function hasNextPageInPage(arg) {
    try {
        const box = document.querySelector(arg.pagination);
        if (box === null)
            return false;
        const next = box.querySelector(arg.nextPage);
        if (next === null)
            return false;
        const cls = next.getAttribute('class') ?? '';
        return !cls.includes(arg.disabledClass);
    }
    catch {
        return false;
    }
}
/** 构造猎聘适配器。 */
export function createLiepinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_LIEPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 记住每个页面最近一次 gotoSearch 的条件（city 码 + 页码），供 readListPage
     * 构造接口请求体 —— 与 waiqi 的 `lastCode` 同一模式（主链顺序
     * `gotoSearch → detectBlock → readListPage` 保证了它总是新鲜的）。
     */
    const lastSearch = new WeakMap();
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市码需实测（自己浏览器开猎聘搜索页，从 URL 的 city 参数抄），写进 DB 覆盖 —— 未验证的城市不猜',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: LIEPIN_MAX_PAGES,
            hint: `默认 ${String(LIEPIN_DEFAULT_MAX_PAGES)} 页、最多 ${String(LIEPIN_MAX_PAGES)} 页；猎聘风控强度最高（antiBot=high），刻意比其它平台更保守`,
        },
    ];
    return {
        id: 'liepin',
        ...platformFacts('liepin'),
        displayName: '猎聘',
        capabilities: {
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 公司/薪资锚点待夹具校准，可能缺失 → medium。
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: LIEPIN_MAX_PAGES,
        defaultMaxPages: LIEPIN_DEFAULT_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                return buildLiepinSearchUrl(config, criteria);
            },
        },
        // 不声明 auth：v1 按"免登录可搜"处理（searchWithoutLogin: true）。
        // 登录后数据更全，但不该把"没登录"做成阻塞 —— 等夹具校准出稳定的
        // 结构性登录信号（对齐 zhaopin 的类名锚点做法）再补。
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildLiepinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`liepin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                const cityCode = criteria.city !== undefined && criteria.city !== '' && config.cityCodes[criteria.city] !== ''
                    ? config.cityCodes[criteria.city]
                    : '410';
                lastSearch.set(page, {
                    keyword: criteria.keyword ?? '',
                    cityCode,
                    page: criteria.page ?? 1,
                });
                await page.goto(url);
                // 等卡片挂载（不要求可见：猎聘卡片可能被弹窗遮挡）。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                // P5/D-17a：高斯 + 犹豫的拟人间隔（见 platform/pacing.ts）。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                // 双通道（v2 接口化）：先试搜索接口（字段更富：refreshTime/labels/compId），
                // 失败或空结果自动回退 DOM 解析 —— 永不比 v1 差。
                const remembered = lastSearch.get(page);
                if (config.searchApiEnabled && remembered !== undefined) {
                    const payload = await page
                        .evaluate(fetchListInPage, {
                        apiPath: `${config.searchApiOrigin}${config.searchApiPath}`,
                        body: buildSearchRequestBody({ keyword: remembered.keyword, page: remembered.page }, remembered.cityCode),
                    })
                        .catch(() => null);
                    const viaApi = parseSearchApiResponse(payload);
                    if (viaApi.length > 0)
                        return viaApi;
                }
                return await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    salaryPattern: config.salaryPattern,
                    jobIdPattern: config.jobIdPattern,
                    cityPattern: config.cityPattern,
                    expPattern: config.expPattern,
                    eduPattern: config.eduPattern,
                });
            },
            async hasNextPage(page) {
                return await page.evaluate(hasNextPageInPage, {
                    pagination: config.selectors.pagination,
                    nextPage: config.selectors.nextPage,
                    disabledClass: config.selectors.nextPageDisabledClass,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(LIEPIN_BLOCK_SIGNALS),
                    card: config.selectors.card,
                    flags: LIEPIN_BLOCK_FLAGS,
                });
            },
        },
        // ⚠️ 刻意**不实现** `actions.sayHello` / `actions.sendResume`：
        // 猎聘的打招呼需要 hover 后才出现的按钮 + 登录态 + 实测契约
        // （见 docs/ADAPTERS.md §7.2），fail-closed 而不是假装能发。
    };
}
//# sourceMappingURL=liepin.js.map