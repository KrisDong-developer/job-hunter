/**
 * Indeed 的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、jobkey / 薪资正则、
 * 页数上下限、平台判墙信号与开关 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `indeedBlockFlags` 由 `./index.ts` 在判墙时按 `config.host` 调用，故导出。
 *
 * 完整实测记录（2026-09-18「停运」调查 → 2026-09-21 复核推翻）见 `./index.ts` 文件头。
 */
/**
 * 发布时间窗取值域（天）—— **只收实测过的两档**。
 *
 * 2026-09-21 第 12 轮 URL 变体对照（卡片数用 `a.jcs-JobTitle` 数，基线在最后重跑一遍当对照）：
 * `fromage=1` → 4 条、`fromage=7` → 16 条、基线两次都是 16 条。两档都真的改变了结果集。
 *
 * 站点 UI 上还有「过去 3 天 / 14 天」，但**没实测**，所以不提供 —— 编一个档位用户选了不会报错，
 * 只会静默拿到别的结果集，那比少一个选项更糟。
 */
export const INDEED_POSTED_WITHIN_OPTIONS = [
    { value: '1', label: '过去 1 天' },
    { value: '7', label: '过去 7 天' },
];
/**
 * 职位类型取值域 —— 同样只收实测过的两档。
 *
 * 证据：`jt=parttime` → **0 条**（基线 16 条），参数确实在过滤；`jt=fulltime` 的计数与基线相同
 * （16 条）—— 这一档**无法单独区分**（多数岗位本就是全职），但参数本身已被 parttime 那档证明生效。
 */
export const INDEED_JOB_TYPE_OPTIONS = [
    { value: 'fulltime', label: '全职' },
    { value: 'parttime', label: '兼职' },
];
export const INDEED_JOB_KEY_PATTERN = '[?&]jk=([A-Za-z0-9]+)';
export const INDEED_SALARY_PATTERN = '\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?\\s*[-~至]\\s*\\d+(?:[,\\.]?\\d+)?\\s*[kK万]?(?:\\s*元?(?:/月|/年|月薪|年薪))?\\b|\\d+(?:[,\\.]?\\d+)?\\s*[kK万](?:\\s*元?(?:/月|/年|月薪|年薪))?\\s*以上|面议';
/**
 * 从详情页内嵌载荷抠发布日期文本 —— 2026-09-21 三页实测：详情页**无 JSON-LD
 * JobPosting**、无日期 DOM 节点，唯一来源是内嵌 JSON 的
 * `"hiringInsightsModel":{"age":"30+天前"}`（`jobMetadataFooterModel.age` 同值，作回落）。
 */
export const INDEED_POSTED_AGE_PATTERN = '"hiringInsightsModel":\\{[^{}]*"age":"([^"]+)"|"jobMetadataFooterModel":\\{[^{}]*"age":"([^"]+)"';
/** 单次抓取页数上限。Indeed 免费版无页码按钮、Cloudflare 风控，默认 3 页、上限 5 页。 */
export const INDEED_DEFAULT_MAX_PAGES = 3;
export const INDEED_MAX_PAGES = 5;
/** 内嵌载荷的 provider 名：`window.mosaic.providerData["<这个键>"]`。 */
export const INDEED_PAYLOAD_PROVIDER_KEY = 'mosaic-provider-jobcards';
export const DEFAULT_INDEED_CONFIG = {
    host: 'cn.indeed.com',
    selectors: {
        titleLink: 'a.jcs-JobTitle',
        company: "[data-testid='company-name']",
        location: "[data-testid='text-location']",
        salary: "[data-testid='attribute_snippet_testid']",
        date: "[data-testid='jobListingDate']",
        pagination: 'nav[aria-label="pagination"]',
        nextPage: "[data-testid='pagination-page-next']",
        nextPageDisabledAttr: 'aria-disabled',
    },
    detailSelectors: {
        title: '[data-testid="jobsearch-JobInfoHeader-title"]',
        company: '[data-testid="inlineHeader-companyName"]',
        location: '[data-testid="inlineHeader-companyLocation"]',
        description: '#jobDescriptionText',
    },
    urlParams: {
        keywordParam: 'q',
        locationParam: 'l',
        startParam: 'start',
        postedWithinParam: 'fromage',
        jobTypeParam: 'jt',
    },
    pageSize: 10,
    jobKeyPattern: INDEED_JOB_KEY_PATTERN,
    salaryPattern: INDEED_SALARY_PATTERN,
    payloadEnabled: true,
    payloadProviderKey: INDEED_PAYLOAD_PROVIDER_KEY,
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
        detailSelectors: { ...DEFAULT_INDEED_CONFIG.detailSelectors, ...(patch.detailSelectors ?? {}) },
        urlParams: { ...DEFAULT_INDEED_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        pageSize: num('pageSize', DEFAULT_INDEED_CONFIG.pageSize),
        jobKeyPattern: str('jobKeyPattern', DEFAULT_INDEED_CONFIG.jobKeyPattern),
        salaryPattern: str('salaryPattern', DEFAULT_INDEED_CONFIG.salaryPattern),
        payloadEnabled: typeof patch.payloadEnabled === 'boolean' ? patch.payloadEnabled : DEFAULT_INDEED_CONFIG.payloadEnabled,
        payloadProviderKey: str('payloadProviderKey', DEFAULT_INDEED_CONFIG.payloadProviderKey),
    };
}
/**
 * 匿名侧登录入口链接选择器 —— `isLoggedIn` 的**回落**判据（2026-09-21 两侧实测：
 * 未登录搜索页命中 2 处、已登录搜索页 0 处）。权威判据是页面载荷 `"isLoggedIn"`，
 * 见 `./page.ts` 的 `isLoggedInInPage`。
 */
export const INDEED_ANON_LOGIN_LINK = 'a[href*="account.indeed.com"]';
/**
 * Indeed 特有的判墙信号与开关（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 三处必须显式带上，否则会**悄悄改变行为**：
 *   * **Cloudflare 挑战的 DOM 特征**（`#challenge-error-title` / `.cf-error-*` /
 *     `challenges.cloudflare.com` 的 iframe）—— 通用词表里没有 Cloudflare；
 *   * **验证码文案**：Indeed 是「需要进行其他验证」+ 英文 `Ray ID` / `captcha` / `robot`。
 *     它们必须进 `captchaText` 而**不是** `rateText` —— 判定顺序上验证码在前，
 *     但语义错了会让界面把"人机验证"说成"限流"，给用户的下一步动作完全不同；
 *   * `expectedHost`：2026-09-21 复核实测，cn 站的墙有两种形态 —— 旧记录的
 *     302 → www.indeed.com，以及首访可能被送到 `secure.indeed.com/auth` 登录墙
 *     （带 cf_clearance 的 profile 复访时直出列表）。两者都是**地址级**事实，
 *     由 `expectedHost` 统一判 `blank`，不用文案去猜；
 *   * `skipLoginWall`：登录墙的真实形态是**跨域跳转**（地址级判据已覆盖），且
 *     未登录实测可搜 —— 若让通用词表按"0 条 + 登录文案"去判 `login-required`，
 *     会把"0 结果"误报成"需要登录"。
 */
export const INDEED_BLOCK_SIGNALS = {
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
export function indeedBlockFlags(host) {
    return { expectedHost: host, skipLoginWall: true };
}
//# sourceMappingURL=config.js.map