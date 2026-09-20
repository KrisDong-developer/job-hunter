/**
 * HiredChina 适配器的配置面：选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 merge。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
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
export const HIREDCHINA_BLOCK_SIGNALS = {
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
//# sourceMappingURL=config.js.map