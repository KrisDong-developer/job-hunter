import { humanDelayMs } from '../pacing.js';
import { platformFacts } from '../platform-facts.js';
import { detectBlockWithSignals, signalsOf } from '../block-signals.js';
/**
 * 城市码：来自 BossHunter `boss_cities.json`（**第一方来源** —— zhipin 官方
 * `wapi/zpCommon/data/cityGroup.json`，fetched 2026-08-10），20 个热门城市。
 * 全量 373 城见原表；未列出的城市写 DB 覆盖。
 */
export const ZHIPIN_CITY_CODES = {
    北京: '101010100',
    上海: '101020100',
    广州: '101280100',
    深圳: '101280600',
    杭州: '101210100',
    成都: '101270100',
    南京: '101190100',
    苏州: '101190400',
    天津: '101030100',
    重庆: '101040100',
    武汉: '101200100',
    西安: '101110100',
    长沙: '101250100',
    郑州: '101180100',
    青岛: '101120200',
    合肥: '101220100',
    大连: '101070200',
    东莞: '101281600',
    佛山: '101280800',
    厦门: '101230200',
};
/** 岗位链接形态：`/job_detail/<加密id>.html`（id 含字母数字与 ~_-）。 */
export const ZHIPIN_JOB_ID_PATTERN = '/job_detail/([0-9a-zA-Z~_-]+)\\.html';
/** 未登录单页 15 条、无分页 —— 上限 1 页是平台事实，不是保守取舍。 */
export const ZHIPIN_MAX_PAGES = 1;
export const DEFAULT_ZHIPIN_CONFIG = {
    selectors: {
        card: '.job-card-wrap',
        cardBox: '.job-card-box',
        jobName: '.job-name',
        salary: '.job-salary',
        tagList: '.tag-list li',
        company: '.boss-name, .company-name',
        location: '.company-location',
    },
    detailSelectors: {
        title: '.info-primary .name h1, .name h1',
        salary: '.info-primary .salary, .salary',
        tags: '.info-primary .tag-list span',
        jdText: '.job-sec-text',
        companySider: '.sider-company',
    },
    urlParams: {
        base: 'https://www.zhipin.com/web/geek/job',
        keywordParam: 'query',
        cityParam: 'city',
    },
    cityCodes: ZHIPIN_CITY_CODES,
    jobIdPattern: ZHIPIN_JOB_ID_PATTERN,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeZhipinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_ZHIPIN_CONFIG;
    const patch = override;
    const pattern = (value, fallback) => typeof value === 'string' && value !== '' ? value : fallback;
    return {
        selectors: { ...DEFAULT_ZHIPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        detailSelectors: { ...DEFAULT_ZHIPIN_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
        urlParams: { ...DEFAULT_ZHIPIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        cityCodes: { ...DEFAULT_ZHIPIN_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        jobIdPattern: pattern(patch.jobIdPattern, DEFAULT_ZHIPIN_CONFIG.jobIdPattern),
    };
}
/** 构造搜索 URL：`/web/geek/job?query=<kw>&city=<code>`（城市码未知 → null，不猜）。 */
export function buildZhipinSearchUrl(config, criteria) {
    const params = new URLSearchParams();
    if (criteria.keyword !== undefined && criteria.keyword !== '') {
        params.set(config.urlParams.keywordParam, criteria.keyword);
    }
    if (criteria.city !== undefined && criteria.city !== '') {
        const code = config.cityCodes[criteria.city];
        if (code === undefined)
            return null;
        params.set(config.urlParams.cityParam, code);
    }
    const query = params.toString();
    return query === '' ? config.urlParams.base : `${config.urlParams.base}?${query}`;
}
/**
 * **在页面上下文里**解析列表页（夹具校准：卡片结构见文件头）。
 * ⚠️ 必须完全自包含（序列化送进浏览器执行）。
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
    let idRe = null;
    try {
        idRe = new RegExp(arg.jobIdPattern);
    }
    catch {
        idRe = null;
    }
    for (const card of Array.from(cards)) {
        let box = card;
        try {
            box = card.querySelector(arg.selectors.cardBox) ?? card;
        }
        catch {
            box = card;
        }
        let nameEl = null;
        try {
            nameEl = box.querySelector(arg.selectors.jobName);
        }
        catch {
            nameEl = null;
        }
        if (nameEl === null)
            continue;
        const href = nameEl.getAttribute('href') ?? '';
        if (href === '')
            continue;
        let sourceUrl = href;
        try {
            sourceUrl = new URL(href, location.origin).href;
        }
        catch {
            /* 原样给，字段断言会兜 */
        }
        const title = (nameEl.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (title === '')
            continue;
        const idMatch = idRe !== null ? idRe.exec(sourceUrl) : null;
        const platformJobId = idMatch !== null ? (idMatch[1] ?? '') : '';
        // 未登录薪资隐藏：元素在、文本空 —— 留空（requiredFields 不含 salary_raw）。
        let salaryRaw = '';
        try {
            salaryRaw = (box.querySelector(arg.selectors.salary)?.textContent ?? '').replace(/\s+/g, '').trim();
        }
        catch {
            salaryRaw = '';
        }
        // tag-list 固定顺序：经验 / 学历（夹具实测）。
        let expReq = '';
        let eduReq = '';
        try {
            const tags = Array.from(box.querySelectorAll(arg.selectors.tagList))
                .map((tag) => (tag.textContent ?? '').replace(/\s+/g, ' ').trim())
                .filter((text) => text !== '');
            expReq = tags[0] ?? '';
            eduReq = tags[1] ?? '';
        }
        catch {
            /* 留空 */
        }
        let company = '';
        try {
            company = (box.querySelector(arg.selectors.company)?.textContent ?? '').replace(/\s+/g, ' ').trim();
        }
        catch {
            company = '';
        }
        // 「城市·区域·地标」→ city / district（夹具实测如「深圳·福田区·车公庙」）。
        let city = '';
        let district = '';
        try {
            const locationText = (box.querySelector(arg.selectors.location)?.textContent ?? '')
                .replace(/\s+/g, '')
                .trim();
            const parts = locationText.split('·');
            city = parts[0] ?? '';
            district = parts[1] ?? '';
        }
        catch {
            /* 留空 */
        }
        const notes = [];
        if (platformJobId === '')
            notes.push('jobIdPattern 未命中，待校准');
        if (salaryRaw === '')
            notes.push('未登录视图薪资隐藏（登录后可升级）');
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
            ...(notes.length === 0 ? {} : { notes }),
        });
    }
    return out;
}
/**
 * **在页面上下文里**解析详情页（选择器：BossHunter site-patterns 2026-05-26 验证）。
 * ⚠️ 必须完全自包含。详情页需要登录态（securityId）；打不开时调用方判墙兜底。
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
    let expReq = '';
    let eduReq = '';
    try {
        const tags = Array.from(document.querySelectorAll(arg.selectors.tags))
            .map((tag) => (tag.textContent ?? '').trim())
            .filter((text) => text !== '');
        expReq = tags[0] ?? '';
        eduReq = tags[1] ?? '';
    }
    catch {
        /* 留空 */
    }
    return {
        platformJobId: '',
        title: pick(arg.selectors.title),
        salaryRaw: pick(arg.selectors.salary),
        company: '',
        sourceUrl: location.href,
        jdText: pick(arg.selectors.jdText),
        ...(expReq === '' ? {} : { expReq }),
        ...(eduReq === '' ? {} : { eduReq }),
    };
}
/** 构造 BOSS 直聘适配器。 */
export function createZhipinAdapter(options = {}) {
    const config = options.config ?? DEFAULT_ZHIPIN_CONFIG;
    const [delayMin, delayMax] = options.delayRangeMs ?? [0, 0];
    const dimensions = [
        { key: 'keyword', label: '关键词', values: [], hint: '自由文本，平台原样接收' },
        {
            key: 'city',
            label: '城市',
            values: Object.keys(config.cityCodes).map((city) => ({ value: city, label: city })),
            hint: '城市码来自 zhipin 官方 cityGroup 接口（经 BossHunter 2026-08-10 抓取）；其它城市写 DB 覆盖',
        },
        {
            key: 'maxPages',
            label: '抓取页数上限',
            values: [],
            max: ZHIPIN_MAX_PAGES,
            hint: '未登录无分页区（单页 15 条）—— 上限 1 页是平台事实；登录后补分页契约再放开',
        },
    ];
    return {
        id: 'zhipin',
        ...platformFacts('zhipin'),
        displayName: 'BOSS直聘',
        capabilities: {
            // 夹具实测：未登录可见列表；但薪资隐藏 → 如实两说。
            searchWithoutLogin: true,
            supportsAttachment: false,
            supportsReadReceipt: false,
            supportsInbox: false,
            supportsGreeting: false,
            fieldCompleteness: 'medium',
            antiBot: 'high',
        },
        // 未登录薪资隐藏：salary_raw 不进必需字段（否则全部被隔离）。
        requiredFields: ['title', 'company', 'source_url'],
        criteriaDimensions: dimensions,
        maxPages: ZHIPIN_MAX_PAGES,
        criteria: {
            buildSearchUrl(criteria) {
                return buildZhipinSearchUrl(config, criteria);
            },
        },
        crawl: {
            async gotoSearch(page, criteria) {
                const url = buildZhipinSearchUrl(config, criteria);
                if (url === null) {
                    throw new Error(`zhipin: 城市码未配置（${criteria.city ?? ''}）—— 拒绝猜测`);
                }
                await page.goto(url);
                if (page.waitForSelector !== undefined) {
                    await page.waitForSelector(config.selectors.card, options.waitForListMs ?? 15_000);
                }
                if (delayMax > 0) {
                    await page.waitForTimeout(humanDelayMs([delayMin, delayMax]));
                }
            },
            async readListPage(page) {
                return await page.evaluate(extractJobsInPage, {
                    selectors: config.selectors,
                    jobIdPattern: config.jobIdPattern,
                });
            },
            async hasNextPage() {
                // 未登录无分页区（夹具实测）—— 恒 false；登录夹具补契约后改造。
                return false;
            },
        },
        detail: {
            async extract(page) {
                return await page.evaluate(extractDetailInPage, { selectors: config.detailSelectors });
            },
        },
        guard: {
            async detectBlock(page) {
                // 判墙的**通用那一半**（验证码选择器、限流/配额/登录墙文案、blank 阈值）
                // 已抽到 `block-signals.ts`；这里只声明 BOSS 特有的 URL 特征：
                // 滑块页 `https://www.zhipin.com/web/user/safe/verify-slider`（get_jobs 实证）。
                return await page.evaluate(detectBlockWithSignals, {
                    signals: signalsOf({ urlPatterns: ['zhipin\\.com/web/user/safe/verify'] }),
                    card: config.selectors.card,
                });
            },
        },
        // ⚠️ sayHello 在批次 C 实现前保持 fail-closed（不声明 actions）。
    };
}
//# sourceMappingURL=zhipin.js.map