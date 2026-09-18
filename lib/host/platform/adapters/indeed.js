import { CORE_FIELDS } from '../../../shared/enums.js';
import { humanDelayMs } from '../pacing.js';
import { detectBlockWithSignals, signalsOf } from '../block-signals.js';
import { platformFacts } from '../platform-facts.js';
export const INDEED_JOB_KEY_PATTERN = '[?&]jk=([A-Za-z0-9]+)';
export const INDEED_SALARY_PATTERN = '\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?\\s*[-~至]\\s*\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?(?:\\s*元?(?:/月|/年|月薪|年薪))?\\b|\\d+(?:[,\\.]?\\d+)?\\s*[kK万](?:\\s*元?(?:/月|/年|月薪|年薪))?\\s*以上|面议';
/** 单次抓取页数上限。Indeed 免费版无页码按钮、Cloudflare 风控，默认 3 页、上限 5 页。 */
export const INDEED_DEFAULT_MAX_PAGES = 3;
export const INDEED_MAX_PAGES = 5;
export const DEFAULT_INDEED_CONFIG = {
    // ⚠️ 中国大陆站已停运。保留为默认值仅尊重原意；真正启用请换仍运营的域（见文件头）。
    host: 'cn.indeed.com',
    selectors: {
        titleLink: 'a.jcs-JobTitle',
        company: "[data-testid='company-name']",
        location: "[data-testid='text-location']",
        salary: "[data-testid='attribute_snippet_testid']",
        date: "[data-testid='jobListingDate']",
        pagination: 'nav[aria-label]',
        nextPage: "[data-testid='pagination-page-next']",
        nextPageDisabledAttr: 'aria-disabled',
    },
    urlParams: {
        keywordParam: 'q',
        locationParam: 'l',
        startParam: 'start',
    },
    pageSize: 15,
    jobKeyPattern: INDEED_JOB_KEY_PATTERN,
    salaryPattern: INDEED_SALARY_PATTERN,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeIndeedConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_INDEED_CONFIG;
    const patch = override;
    const str = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    const num = (key, fallback) => typeof patch[key] === 'number' && patch[key] > 0 ? patch[key] : fallback;
    return {
        host: str('host', DEFAULT_INDEED_CONFIG.host),
        selectors: { ...DEFAULT_INDEED_CONFIG.selectors, ...(patch.selectors ?? {}) },
        urlParams: { ...DEFAULT_INDEED_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        pageSize: num('pageSize', DEFAULT_INDEED_CONFIG.pageSize),
        jobKeyPattern: str('jobKeyPattern', DEFAULT_INDEED_CONFIG.jobKeyPattern),
        salaryPattern: str('salaryPattern', DEFAULT_INDEED_CONFIG.salaryPattern),
    };
}
/**
 * 构造搜索 URL：`https://{host}/jobs?q=Java&l=北京&start=0`。
 * 关键词 / 地点都是**自由文本**，没有城市码映射 —— 地点为空就不带 `l=`。
 * `criteria.page` 是 1 起（项目约定）；`start` = (page-1) * pageSize（0 起）。
 */
export function buildIndeedSearchUrl(config, criteria) {
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        params.set(config.urlParams.locationParam, criteria.city);
    }
    const page = criteria.page === undefined ? 1 : criteria.page;
    const start = Math.max(0, page - 1) * config.pageSize;
    params.set(config.urlParams.startParam, String(start));
    const base = `https://${config.host}/jobs`;
    const query = params.toString();
    return query === '' ? base : `${base}?${query}`;
}
/**
 * **在页面上下文里**解析搜索列表页。
 *
 * ⚠️ 完全自包含（真路径序列化进浏览器，闭包不存在）。卡片是一条职位链接
 * `a.jcs-JobTitle`：标题 + href（内嵌 `jk=` jobkey）+ 同卡内的公司/地点/薪资/日期。
 * 相对链接拼成绝对地址；`jk` 抠出来当平台 id。
 * 锚不中的字段留空 + notes，交给字段级断言隔离进 pending_repair —— 不编。
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
        const salaryRaw = salaryRe !== null ? (salaryRe.exec((card.textContent ?? '').replace(/\s+/g, ' '))?.[0] ?? '') : '';
        const company = textOf(arg.selectors.company, card);
        const city = textOf(arg.selectors.location, card);
        const dateRaw = textOf(arg.selectors.date, card);
        const notes = [];
        if (platformJobId === '')
            notes.push('jobKeyPattern 未命中，待校准');
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
            ...(notes.length === 0 ? {} : { notes }),
            ...(dateRaw === '' ? {} : { publishedAt: dateRaw }),
        });
    }
    return out;
}
/**
 * Indeed 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare 挑战的 DOM 特征**（`#challenge-error-title` / `.cf-error-*` /
 *     `challenges.cloudflare.com` 的 iframe）—— 通用词表里没有 Cloudflare；
 *   * **验证码文案**：Indeed 是「需要进行其他验证」+ 英文 `Ray ID` / `captcha` / `robot`。
 *     它们必须进 `captchaText` 而**不是** `rateText` —— 判定顺序上验证码在前，
 *     但语义错了会让界面把"人机验证"说成"限流"，给用户的下一步动作完全不同；
 *   * `expectedHost`：中国站停运的实际表现是被 302 送到别的域（`cn.indeed.com` →
 *     `www.indeed.com`）→ 判 `blank`。这是**地址级**事实；
 *   * `skipLoginWall`：原实现**没有**登录墙判据（Indeed 用 Cloudflare 而非登录墙），
 *     让通用词表替它猜会把"0 条"误报成"需要登录"。
 */
const INDEED_BLOCK_SIGNALS = {
    captchaSelectors: [
        '#challenge-error-title',
        '.cf-error-details',
        '.cf-error-h1',
        '[id^="challenge-running"]',
        'iframe[src*="challenges.cloudflare.com"]',
    ],
    captchaText: ['需要进行其他验证', '请稍候', 'Ray ID', 'cloudflare', 'cf-error', '验证码', 'captcha', '安全验证', 'robot'],
    // 通用词表里没有「请求过于频繁」，Indeed 的文案是这一条
    rateText: ['请求过于频繁'],
};
/** 见 `INDEED_BLOCK_SIGNALS` 的说明；`expectedHost` 由配置传入。 */
function indeedBlockFlags(host) {
    return { expectedHost: host, skipLoginWall: true };
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
/** 构造 Indeed 适配器。 */
export function createIndeedAdapter(options = {}) {
    const config = options.config ?? DEFAULT_INDEED_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        { key: 'city', label: '地点', values: [], hint: 'Indeed 是自由文本地点（l= 直接吃地名），无需城市码' },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: INDEED_MAX_PAGES,
            hint: `默认 ${String(INDEED_DEFAULT_MAX_PAGES)} 页、最多 ${String(INDEED_MAX_PAGES)} 页；Indeed 免费版无页码按钮 + Cloudflare 风控，刻意保守。注意：中国大陆站已停运，默认 host 会命中重定向/验证墙`,
        },
    ];
    return {
        id: 'indeed',
        ...platformFacts('indeed'),
        displayName: 'Indeed',
        capabilities: {
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            // 无可信中国大陆夹具：锚点来自公开描述的稳定结构，未校准 → 如实标 low。
            fieldCompleteness: 'low',
            antiBot: 'high',
        },
        requiredFields: [...CORE_FIELDS],
        criteriaDimensions: dimensions,
        maxPages: INDEED_MAX_PAGES,
        defaultMaxPages: INDEED_DEFAULT_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                return buildIndeedSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildIndeedSearchUrl(config, criteria);
                await page.goto(url);
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.titleLink, options.waitForListMs ?? 15_000);
                }
                // P5/D-17a：高斯 + 犹豫的拟人间隔。
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    host: config.host,
                    jobKeyPattern: config.jobKeyPattern,
                    salaryPattern: config.salaryPattern,
                });
            },
            async hasNextPage(page) {
                return await page.evaluate(hasNextPageInPage, {
                    pagination: config.selectors.pagination,
                    nextPage: config.selectors.nextPage,
                    disabledAttr: config.selectors.nextPageDisabledAttr,
                });
            },
        },
        guard: {
            async detectBlock(page) {
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf(INDEED_BLOCK_SIGNALS),
                    card: config.selectors.titleLink,
                    flags: indeedBlockFlags(config.host),
                });
            },
        },
        // ⚠️ 刻意不实现 actions.sayHello / actions.sendResume：Indeed 中国站已停运，
        //   无法实测打招呼/投递契约，fail-closed 而不是假装能发（与猎聘同策略）。
    };
}
//# sourceMappingURL=indeed.js.map