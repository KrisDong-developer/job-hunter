import { CORE_FIELDS } from '../../../shared/contract/enums/crawl.js';
import { humanDelayMs } from '../pacing.js';
import { detectBlockWithSignals, signalsOf } from '../block-signals.js';
import { platformFacts } from '../platform-facts.js';
import { platformCriterion } from '../types.js';
/** 用户面向的默认域名（对外入口）。raw HTTP 会吃 Cloudflare 挑战；真浏览器 + 登录态可过。 */
export const HIREDCHINA_WEB_BASE = 'https://www.hiredchina.com';
/** 页面语言路径段（决定卡片里文案是英文还是中文）。 */
export const HIREDCHINA_LANG = 'en';
/** 每张卡片是一个详情链接 `<a>`，href 形如 `/<lang>/job/<uuid>?returnTo=...`。 */
export const HIREDCHINA_CARD_SELECTOR = 'a[href^="/' + HIREDCHINA_LANG + '/job/"]';
/** 卡片本体容器（`div[data-slot="card"]`，shadcn/ui 的语义锚点）。 */
export const HIREDCHINA_CARD_BOX_SELECTOR = 'div[data-slot="card"]';
/** jobId 是 UUID：`8-4-4-4-12` 十六进制。 */
export const HIREDCHINA_JOB_ID_PATTERN = '/(?:en|zh)/job/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
/** Job Type（类别筛选 `?type=`）取值 —— 键来自页面内嵌 i18n 字典；`marketing` 已实测。 */
export const HIREDCHINA_TYPE_OPTIONS = [
    { value: 'marketing', label: 'Marketing' },
    { value: 'teaching', label: 'Teaching' },
    { value: 'sales_support', label: 'Sales Support' },
    { value: 'other', label: 'Other' },
];
/** 雇佣类型筛选 `?employmentId=`（已实测：1=Full-time/全职，2=Part-time/兼职）。 */
export const HIREDCHINA_EMPLOYMENT_OPTIONS = [
    { value: '1', label: '全职（Full-time）' },
    { value: '2', label: '兼职（Part-time）' },
];
/** 工作模式筛选 `?isOnline=`（已实测：1=Remote/远程，0=On-site/现场）。 */
export const HIREDCHINA_WORK_MODE_OPTIONS = [
    { value: '1', label: '远程（Remote）' },
    { value: '0', label: '现场（On-site）' },
];
/**
 * 单次抓取的页数上限。
 *
 * 翻页契约**已实测有效**（`?page=N`、每页 10 条、749 页），本可抓几十页；但主站带
 * Cloudflare 挑战层，且我们是保守优先（§P5），先按 `maxPages = 5` 封顶，跑稳了再放开。
 * 这不是平台限制，是我们对风控的取舍 —— 写清楚，避免后人误以为「上限 5 是平台事实」。
 */
export const HIREDCHINA_MAX_PAGES = 5;
export const DEFAULT_HIREDCHINA_CONFIG = {
    webBase: HIREDCHINA_WEB_BASE,
    lang: HIREDCHINA_LANG,
    selectors: {
        card: HIREDCHINA_CARD_SELECTOR,
        cardBox: HIREDCHINA_CARD_BOX_SELECTOR,
        title: 'h3',
        companyRow: '[class*="lucide-building-2"]',
        salaryBadge: '[class*="bg-emerald-50"]',
        locationBadge: '[class*="bg-gray-50"]',
        employmentBadge: '[class*="bg-blue-50"]',
        workModeBadge: '[class*="bg-orange-50"]',
        experienceBadge: '[class*="bg-slate-50"]',
        pagination: 'nav[aria-label="pagination"]',
    },
    detailSelectors: {
        title: 'h1',
        // 薪资：渐变卡内的金额元素。探针给出其容器 `div.flex.flex-col.items-start.shrink-0`，
        // 金额元素 best-effort（用 shrink-0 加 text-3xl 双锚，避免与同样带 text-3xl 的 h1 撞）。
        salary: '[class*="shrink-0"] [class*="text-3xl"]',
        jdText: 'div.prose.prose-sm',
        badgeRow: 'div.flex.flex-wrap.gap-2',
    },
    urlParams: {
        jobsPath: '/jobs',
        keywordParam: 'kw',
        typeParam: 'type',
        employmentParam: 'employmentId',
        workModeParam: 'isOnline',
        pageParam: 'page',
    },
    cityCodes: {},
    jobIdPattern: HIREDCHINA_JOB_ID_PATTERN,
    maxPages: HIREDCHINA_MAX_PAGES,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeHiredChinaConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_HIREDCHINA_CONFIG;
    const patch = override;
    const pattern = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    return {
        webBase: pattern('webBase', DEFAULT_HIREDCHINA_CONFIG.webBase),
        lang: pattern('lang', DEFAULT_HIREDCHINA_CONFIG.lang),
        selectors: { ...DEFAULT_HIREDCHINA_CONFIG.selectors, ...(patch.selectors ?? {}) },
        detailSelectors: {
            ...DEFAULT_HIREDCHINA_CONFIG.detailSelectors,
            ...(patch.detailSelectors ?? {}),
        },
        urlParams: { ...DEFAULT_HIREDCHINA_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        cityCodes: { ...DEFAULT_HIREDCHINA_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        jobIdPattern: pattern('jobIdPattern', DEFAULT_HIREDCHINA_CONFIG.jobIdPattern),
        maxPages: typeof patch.maxPages === 'number' && patch.maxPages > 0
            ? patch.maxPages
            : DEFAULT_HIREDCHINA_CONFIG.maxPages,
    };
}
/** 构造列表页 URL：`/<lang>/jobs?kw=&type=&employmentId=&isOnline=&page=`。 */
export function buildHiredChinaSearchUrl(config, criteria) {
    // 本平台**没有城市 URL 筛选**（见文件头）—— 带城市即拒绝，绝不静默搜全国。
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        if (code === undefined)
            return null;
    }
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    const type = platformCriterion(criteria, 'type');
    if (type !== '')
        params.set(config.urlParams.typeParam, type);
    const employment = platformCriterion(criteria, 'employment');
    if (employment !== '')
        params.set(config.urlParams.employmentParam, employment);
    const workMode = platformCriterion(criteria, 'workMode');
    if (workMode !== '')
        params.set(config.urlParams.workModeParam, workMode);
    if (criteria.page !== undefined && criteria.page > 1) {
        params.set(config.urlParams.pageParam, String(criteria.page));
    }
    const base = `${config.webBase}/${config.lang}${config.urlParams.jobsPath}`;
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
/**
 * **在页面上下文里**解析列表页 —— 按「卡片身份锚 + 字段底色」策略（见文件头）。
 * ⚠️ 必须完全自包含（序列化送浏览器执行）；任何模块作用域符号都会 ReferenceError。
 *
 * @param config 由宿主序列化传入
 */
export function extractJobsInPage(arg) {
    const out = [];
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    // ⚠️ 这两个词表归一必须在函数体内（自包含）：真路径上 `extractJobsInPage` 会连同它
    // 一起被序列化送进浏览器，"按源码重建"护栏从源码层面切断对模块作用域的引用。
    const normalizeEmployment = (value) => {
        const v = value.toLowerCase().replace(/\s+/g, '');
        if (/全职|fulltime|full[-\s]?time/.test(v))
            return '全职';
        if (/兼职|parttime|part[-\s]?time/.test(v))
            return '兼职';
        return '';
    };
    const normalizeWorkMode = (value) => {
        const v = value.toLowerCase().replace(/\s+/g, '');
        if (/远程|remote|在家办公|fullyremote/.test(v))
            return '远程';
        if (/现场|onsite|on[-\s]?site|实地/.test(v))
            return '现场';
        if (/混合|hybrid/.test(v))
            return '混合';
        return '';
    };
    let idRe = null;
    try {
        idRe = new RegExp(arg.jobIdPattern);
    }
    catch {
        idRe = null;
    }
    let cards = null;
    try {
        cards = document.querySelectorAll(arg.selectors.card);
    }
    catch {
        cards = null;
    }
    if (cards === null || cards.length === 0)
        return out;
    /** 取卡片内某底色徽章下的 `span.truncate` 文本；没有返回空串。 */
    const badgeText = (box, selector) => {
        try {
            return clean(box.querySelector(`${selector} span.truncate`)?.textContent);
        }
        catch {
            return '';
        }
    };
    for (const card of Array.from(cards)) {
        const href = card.getAttribute('href') ?? '';
        if (href === '')
            continue;
        let box = card;
        try {
            box = card.querySelector(arg.selectors.cardBox) ?? card;
        }
        catch {
            box = card;
        }
        let title = '';
        try {
            title = clean(box.querySelector(arg.selectors.title)?.textContent);
        }
        catch {
            title = '';
        }
        if (title === '')
            continue;
        const idMatch = idRe !== null ? idRe.exec(href) : null;
        const platformJobId = idMatch !== null && idMatch[1] !== undefined ? idMatch[1] : '';
        // ── 薪资：平台绝大多数卡片都有（"20K - 25K RMB per month" / "Under 10K…"），
        //    面议即 "Negotiable"（非空 = 合法值，见 validate.ts）。留空只发生在解析跑偏时。
        const salaryRaw = badgeText(box, arg.selectors.salaryBadge);
        // ── 公司：取 building 图标所在行的文本（探针：该行内的 span.truncate）。
        let company = '';
        try {
            const icon = box.querySelector(arg.selectors.companyRow);
            if (icon !== null && icon.parentElement !== null) {
                company = clean(icon.parentElement.textContent);
            }
        }
        catch {
            company = '';
        }
        // ── 地点 "Country · City" 或纯 "City"：取最后一个 "·" 段作城市名。
        const locationText = badgeText(box, arg.selectors.locationBadge);
        const locParts = locationText
            .split('·')
            .map((part) => part.trim())
            .filter((part) => part !== '');
        const city = locParts.length === 0 ? '' : locParts[locParts.length - 1];
        const employment = badgeText(box, arg.selectors.employmentBadge);
        const workMode = badgeText(box, arg.selectors.workModeBadge);
        const expReq = badgeText(box, arg.selectors.experienceBadge);
        // ── 雇佣类型 / 工作模式的 en/zh 词表归一（自包含，不能引用模块常量）──
        // 平台有两个语言站，卡片文案随 lang 切换（如 Full-time/全职、Remote/现场）。
        // 归一到中文稳定值，避免"同一字段两个看似不同标签"污染去重/统计。
        const employmentNorm = normalizeEmployment(employment);
        const workModeNorm = normalizeWorkMode(workMode);
        const tags = [];
        if (employmentNorm !== '')
            tags.push(employmentNorm);
        if (workModeNorm !== '')
            tags.push(workModeNorm);
        const notes = [];
        if (platformJobId === '')
            notes.push('卡片未锚定岗位 UUID，待 probe:hiredchina 校准');
        if (salaryRaw === '')
            notes.push('薪资徽章未锚定，待校准');
        if (company === '')
            notes.push('公司未锚定，待校准');
        let sourceUrl = href;
        try {
            sourceUrl = new URL(href, location.origin).href;
        }
        catch {
            /* 原样给，字段断言会兜 */
        }
        out.push({
            platformJobId,
            title,
            salaryRaw,
            company,
            sourceUrl,
            ...(city === '' ? {} : { city }),
            ...(expReq === '' ? {} : { expReq }),
            tags,
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**解析详情页（`/<lang>/job/<uuid>`）。
 * ⚠️ 自包含。选择器（`h1` / 渐变卡片薪资 / `div.prose.prose-sm` JD）探针注明，待详情夹具校准。
 *
 * 平台详情页**没有**签证 / 公司规模 / 公司性质字段 → 一律不编。company 也仅从徽章行外的
 * 常用锚点 best-effort，捞不到就留空（调用方用列表的公司兜底）。
 */
export function extractDetailInPage(arg) {
    const clean = (value) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
    const pick = (selector) => {
        try {
            return clean(document.querySelector(selector)?.textContent);
        }
        catch {
            return '';
        }
    };
    const title = pick(arg.selectors.title);
    const salaryRaw = pick(arg.selectors.salary);
    let employment = '';
    let workMode = '';
    let expReq = '';
    try {
        const row = document.querySelector(arg.selectors.badgeRow);
        if (row !== null) {
            const badges = Array.from(row.querySelectorAll('span'))
                .map((span) => clean(span.textContent))
                .filter((text) => text !== '');
            for (const badge of badges) {
                const v = badge.toLowerCase().replace(/\s+/g, '');
                if (employment === '' && /全职|兼职|fulltime|full[-\s]?time|parttime|part[-\s]?time/.test(v)) {
                    employment = /兼职|parttime|part[-\s]?time/.test(v) ? '兼职' : '全职';
                }
                else if (workMode === '' && /远程|remote|现场|onsite|on[-\s]?site|混合|hybrid/.test(v)) {
                    if (/远程|remote|在家办公/.test(v))
                        workMode = '远程';
                    else if (/混合|hybrid/.test(v))
                        workMode = '混合';
                    else
                        workMode = '现场';
                }
                else if (expReq === '' && /\d+\s*[-～~]\s*\d+\s*(?:年|years?)|\d+\s*(?:年|years?)|experience|经验不限/i.test(v)) {
                    expReq = badge;
                }
            }
        }
    }
    catch {
        /* 徽章行解析失败不影响其余字段 */
    }
    const tags = [];
    if (employment !== '')
        tags.push(employment);
    if (workMode !== '')
        tags.push(workMode);
    return {
        platformJobId: '',
        title,
        salaryRaw,
        company: '',
        sourceUrl: location.href,
        jdText: pick(arg.selectors.jdText),
        ...(expReq === '' ? {} : { expReq }),
        tags,
    };
}
/**
 * **在页面上下文里**判断是否还有下一页：分页容器里是否存在「页码 > 当前页」的链接。
 * ⚠️ 自包含。`currentPage` 由宿主传入（真实路径上记录在 pending WeakMap 里）。
 */
export function hasNextPageInPage(arg) {
    let nav = null;
    try {
        nav = document.querySelector(arg.selector);
    }
    catch {
        nav = null;
    }
    if (nav === null)
        return false;
    const current = arg.currentPage > 0 ? arg.currentPage : 1;
    let links = null;
    try {
        links = nav.querySelectorAll('a[href*="page="]');
    }
    catch {
        links = null;
    }
    if (links === null)
        return false;
    for (const link of Array.from(links)) {
        const m = /[?&]page=(\d+)/.exec(link.getAttribute('href') ?? '');
        if (m !== null && m[1] !== undefined) {
            const page = Number.parseInt(m[1], 10);
            if (Number.isFinite(page) && page > current)
                return true;
        }
    }
    return false;
}
/**
 * HiredChina 特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare managed challenge**（实测第一层墙：raw HTTP 返回 "Just a moment..." +
 *     注入 `_cf_chl_opt` 脚本）：`challenge-platform` / `cf_chl` / `cf-browser-verification`
 *     这一组选择器与文案，通用词表里没有 Cloudflare；
 *   * `人机验证` 留在 **`rateText`**（同 guopin）：搬去 `captchaText` 会把返回值从
 *     `rate-limited` 变成 `captcha`，界面给的下一步动作就跟着变了；
 *   * `loginText` 带上**英文**（`login` / `Sign in`）—— 这是外企站，通用词表只有中文短语。
 */
const HIREDCHINA_BLOCK_SIGNALS = {
    captchaSelectors: [
        'script[src*="challenge-platform"]',
        'form[action*="cf_chl"]',
        'iframe[src*="challenge-platform"]',
        '[class*="cf-browser-verification"]',
    ],
    captchaText: ['_cf_chl_opt', 'cf_chl_', 'cf-browser-verification', 'justamoment'],
    rateText: ['人机验证'],
    loginText: ['login', 'Sign in', '登录'],
};
/** 构造 HiredChina 适配器。 */
export function createHiredChinaAdapter(options = {}) {
    const config = options.config ?? DEFAULT_HIREDCHINA_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    /**
     * 上一次 `gotoSearch` 记下的筛选条件（与 waiqi 同因：`readListPage(page)` / `hasNextPage(page)`
     * 只拿得到 page，拿不到 criteria —— 见 domain/crawl.ts 的循环）。
     */
    const pending = new WeakMap();
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，对应 ?kw=（实测键名；需在页面输入触发）' },
        {
            key: 'type',
            label: 'Job Type',
            values: HIREDCHINA_TYPE_OPTIONS,
            hint: '对应 ?type= 类别筛选；marketing 已实测，teaching / sales_support / other 建议 probe 逐档确认',
        },
        {
            key: 'employment',
            label: '雇佣类型',
            values: HIREDCHINA_EMPLOYMENT_OPTIONS,
            hint: '对应 ?employmentId=（已实测：1=全职 / 2=兼职）',
        },
        {
            key: 'workMode',
            label: '工作模式',
            values: HIREDCHINA_WORK_MODE_OPTIONS,
            hint: '对应 ?isOnline=（已实测：1=远程 / 0=现场）；解析时归一到 远程/现场/混合 标签',
        },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            // 同上：本平台**没有**城市筛选，带城市一律拒绝 —— 空表在这里是"别给"，不是"随便给"
            closed: true,
            hint: '⚠️ 本平台**没有城市 URL 筛选**（地点 quick 按钮纯客户端，More 下拉是国籍过滤）→ 不筛选；带城市一律拒绝，不猜',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: config.maxPages,
            hint: `翻页已实测有效（?page=N、每页 10 条、749 页）；` +
                `上限 ${String(config.maxPages)} 页是对 Cloudflare 主站风控的保守取舍，不是平台限制`,
        },
    ];
    return {
        id: 'hiredchina',
        ...platformFacts('hiredchina'),
        displayName: 'HiredChina',
        capabilities: {
            // 列表公共可看（探针浏览器未登录即可渲染列表）→ 搜索不需要登录。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 结构化卡片：标题/公司/薪资/地点几乎都在；但字段靠底色徽章锚定，偶发缺失 → medium。
            fieldCompleteness: 'medium',
            // 主站带 Cloudflare managed challenge（raw HTTP 实测命中）→ 如实 medium。
            antiBot: 'medium',
        },
        // 薪资绝大多数存在（"Negotiable" 也是合法值，见 validate.ts）→ 用完整核心四字段。
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: config.maxPages,
        // 未声明默认深度（hint 只说了上限的取舍理由）—— 1 页。
        defaultMaxPages: 1,
        criteria: {
            buildSearchUrl(criteria) {
                return buildHiredChinaSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildHiredChinaSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`HiredChina：城市「${criteria.city ?? ''}」筛选未实现（URL 参数未确证）—— 拒绝猜测`);
                }
                pending.set(page, criteria);
                await page.goto(url);
                // 列表是 RSC SSR，load 时卡片应已在；仍等一次卡片锚点，防「今天没有新岗位」误读。
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                const jobs = await page.evaluate(extractJobsInPage, config);
                if (jobs.length === 0) {
                    // 0 条可能是真没结果，也可能是改版 —— 交给主链按 NO_RECORDS 记 partial，不在这里猜。
                    return [];
                }
                return jobs;
            },
            async hasNextPage(page) {
                const criteria = pending.get(page) ?? {};
                const pageNo = criteria.page !== undefined && criteria.page > 0 ? Math.trunc(criteria.page) : 1;
                return await page.evaluate(hasNextPageInPage, {
                    selector: config.selectors.pagination,
                    currentPage: pageNo,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(HIREDCHINA_BLOCK_SIGNALS),
                    card: config.selectors.card,
                    // ⚠️ **刻意不传 `cardBox`**：原实现的 arg 里声明了它，但函数体从未使用过
                    //    （只 querySelectorAll(arg.card)）。传进去会让"卡片数为 0"多一条兜底判据，
                    //    从而少判 blank —— 那是行为改变，不是迁移。
                });
            },
        },
        // 详情页 JD 全文（P2 详情抓取）。选择器（h1 / 渐变卡片薪资 / prose JD）探针注明，
        // 待 probe:hiredchina 落盘详情夹具校准；该平台无签证/公司规模字段，故不编这些。
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        // ⚠️ 不实现 `actions`：投递需登录且列表夹具未验证稳定投递契约 → fail-closed。
    };
}
//# sourceMappingURL=hiredchina.js.map