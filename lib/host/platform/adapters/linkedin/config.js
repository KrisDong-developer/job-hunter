/**
 * LinkedIn（www.linkedin.com）的配置面：结构锚点集（列表 + 详情）、URL 参数映射、
 * guest 端点路径、分页步长、jobId / 薪资正则、页数上下限、发布时间窗、判墙信号 ——
 * 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * 完整调研记录（guest 端点策略、Trusted Types 教训、筛选参数真伪、详情锚点）见 `./index.ts` 文件头。
 */
export const LINKEDIN_JOB_URN_PATTERN = 'urn:li:jobPosting:(\\d+)';
export const LINKEDIN_JOB_ID_FROM_URL_PATTERN = '/jobs/view/(?:[^/?#]*-)?(\\d+)';
export const LINKEDIN_SALARY_PATTERN = '[$€£¥₹]\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*[-–—~]\\s*[$€£¥₹]?\\s?\\d[\\d,]*(?:\\.\\d+)?)?\\s*/\\s*(?:yr|year|hr|hour|mo|month)';
/**
 * 单次抓取页数。LinkedIn 是业内最激进的风控之一（专属 999 状态码、authwall、
 * checkpoint 挑战、封号风险），给得保守：默认 2 页、上限 5 页（每页 10 条）。
 * 单查询平台侧封顶约 1000 条，但那不是我们应该碰的深度。
 */
export const LINKEDIN_DEFAULT_MAX_PAGES = 2;
export const LINKEDIN_MAX_PAGES = 5;
/**
 * 发布时间窗：f_TPR=r<秒>，**guest 端点实测生效**（2026-09-20：r86400 → 全部
 * datetime 落在当天）。LinkedIn 接受任意秒数 —— 表里是常用档（closed:false）。
 */
export const LINKEDIN_POSTED_WITHIN_OPTIONS = [
    { value: '1', label: '24 小时内' },
    { value: '7', label: '一周内' },
    { value: '30', label: '一月内' },
];
/**
 * 地点建议值。LinkedIn 的 `location` 是**自由文本**（直接吃英文地名，
 * 中文地名多数也能解析），表里只是给中文用户的常用起点 —— closed:false。
 */
export const LINKEDIN_CITY_SUGGESTIONS = [
    'China',
    'Remote',
    'Singapore',
    'Germany',
    'United Kingdom',
    'United States',
    'Japan',
    'Australia',
    'Canada',
];
export const DEFAULT_LINKEDIN_CONFIG = {
    host: 'www.linkedin.com',
    selectors: {
        card: 'div.base-card',
        titleLink: 'a.base-card__full-link',
        title: '.base-search-card__title',
        company: '.base-search-card__subtitle',
        location: '.job-search-card__location',
        salary: '.job-search-card-salary-info',
        time: 'time[class*="listdate"]',
        entityUrnAttr: 'data-entity-urn',
    },
    detailSelectors: {
        title: 'h1.topcard__title, h2.top-card-layout__title',
        company: 'a.topcard__org-name-link, .top-card-layout__second-subline a',
        location: '.topcard__flavor--bullet',
        jd: '.description__text--rich .show-more-less-html__markup, .description__text--rich, .show-more-less-text',
        criteriaItem: 'li.description__job-criteria-item',
        criteriaHeader: '.description__job-criteria-subheader',
        criteriaText: '.description__job-criteria-text',
        postedTime: '.posted-time-ago__text',
        expHeader: '职位级别',
    },
    urlParams: {
        keywordParam: 'keywords',
        locationParam: 'location',
        startParam: 'start',
        timeRangeParam: 'f_TPR',
    },
    guestApiPath: '/jobs-guest/jobs/api/seeMoreJobPostings/search',
    guestTrk: 'guest_homepage-basic_guest_nav_menu_jobs',
    pageSize: 10,
    jobUrnPattern: LINKEDIN_JOB_URN_PATTERN,
    jobIdFromUrlPattern: LINKEDIN_JOB_ID_FROM_URL_PATTERN,
    salaryPattern: LINKEDIN_SALARY_PATTERN,
    loggedInSelector: 'img.global-nav__me-photo, .global-nav__me',
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeLinkedInConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_LINKEDIN_CONFIG;
    const patch = override;
    const str = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    const num = (key, fallback) => typeof patch[key] === 'number' && patch[key] > 0 ? patch[key] : fallback;
    return {
        host: str('host', DEFAULT_LINKEDIN_CONFIG.host),
        selectors: { ...DEFAULT_LINKEDIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        detailSelectors: { ...DEFAULT_LINKEDIN_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
        urlParams: { ...DEFAULT_LINKEDIN_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        guestApiPath: str('guestApiPath', DEFAULT_LINKEDIN_CONFIG.guestApiPath),
        guestTrk: str('guestTrk', DEFAULT_LINKEDIN_CONFIG.guestTrk),
        pageSize: num('pageSize', DEFAULT_LINKEDIN_CONFIG.pageSize),
        jobUrnPattern: str('jobUrnPattern', DEFAULT_LINKEDIN_CONFIG.jobUrnPattern),
        jobIdFromUrlPattern: str('jobIdFromUrlPattern', DEFAULT_LINKEDIN_CONFIG.jobIdFromUrlPattern),
        salaryPattern: str('salaryPattern', DEFAULT_LINKEDIN_CONFIG.salaryPattern),
        loggedInSelector: str('loggedInSelector', DEFAULT_LINKEDIN_CONFIG.loggedInSelector),
    };
}
/**
 * LinkedIn 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * ⚠️ 词表条目一律**无空白**：`detectBlockWithSignals` 判文案前会把整页文本
 * 去掉全部空白（`text.replace(/\s+/g, '')`）再 `includes` —— 带空格的英文短语
 * **永远匹配不上**。这里全部写成去空白后的形态。
 *
 * `skipLoginWall`：**必须跳过**通用登录墙词表 —— LinkedIn 游客页页头本来就长着
 * Sign in / Join now 按钮，文案判据会把正常页面误判成登录墙。登录墙只用**地址级**
 * 判据（`/authwall`、`/login`，见 `page.ts` 的 `wallKindInPage`）。
 */
export const LINKEDIN_BLOCK_SIGNALS = {
    captchaText: [
        'quicksecuritycheck',
        'securityverification',
        'verifyyouridentity',
        'verifyyouarehuman',
        'unusualactivity',
    ],
    rateText: ['toomanyrequests', 'tryagainlater', 'limitreached'],
};
/** 见 `LINKEDIN_BLOCK_SIGNALS` 的说明；`expectedHost` 由配置传入。 */
export function linkedinBlockFlags(host) {
    return { expectedHost: host, skipLoginWall: true };
}
//# sourceMappingURL=config.js.map