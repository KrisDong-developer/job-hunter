/**
 * Indeed 的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、jobkey / 薪资正则、
 * 页数上下限、平台判墙信号与开关 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `indeedBlockFlags` 由 `./index.ts` 在判墙时按 `config.host` 调用，故导出。
 *
 * 完整实测记录（中国大陆站已停运、Cloudflare 墙、换域启用的办法）见 `./index.ts` 文件头。
 */
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