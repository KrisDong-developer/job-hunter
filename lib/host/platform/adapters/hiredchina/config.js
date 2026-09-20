/**
 * HiredChina 适配器的配置面：payload 锚点 / 详情选择器 / URL 参数 / 值域 / 判墙信号。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
/** 用户面向的默认域名（对外入口）。raw HTTP 会吃 Cloudflare 挑战；真浏览器 + 登录态可过。 */
export const HIREDCHINA_WEB_BASE = 'https://www.hiredchina.com';
/** 页面语言路径段（决定页面文案是英文还是中文；payload 里的 i18n key 不随它变）。 */
export const HIREDCHINA_LANG = 'en';
/**
 * 判墙锚：岗位详情链接。
 *
 * ⚠️ 2026-09-20 实测后这个选择器**只用于判墙**（`detectBlockWithSignals` 的 `card`
 * 参数 = "0 卡片 + 短文本"判 blank/登录墙的那条判据），**不再用于列表解析** ——
 * 列表页 raw HTML 里没有卡片 DOM（数据在 RSC 流里，见 `HiredChinaPayloadAnchors`）。
 * 真浏览器 hydrate 后这个选择器会命中渲染出来的卡片，语义仍是"页面上有没有岗位"。
 */
export const HIREDCHINA_CARD_SELECTOR = 'a[href*="/job/"]';
/** jobId 是 UUID：`8-4-4-4-12` 十六进制。 */
export const HIREDCHINA_JOB_ID_PATTERN = '/(?:en|zh)/job/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
/** 每页条数（2026-09-20 实测 p1/p2 各 10 条；也是「满页即有下一页」判据的分母）。 */
export const HIREDCHINA_PAGE_SIZE = 10;
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
 * 翻页契约**已实测有效**（`?page=N` 在 payload 层真换数据：p1/p2 首条 UUID 不同），
 * 但主站带 Cloudflare 挑战层，且我们是保守优先（§P5），按 `maxPages = 5` 封顶。
 * 这不是平台限制，是我们对风控的取舍 —— 写清楚，避免后人误以为「上限 5 是平台事实」。
 */
export const HIREDCHINA_MAX_PAGES = 5;
export const DEFAULT_HIREDCHINA_CONFIG = {
    webBase: HIREDCHINA_WEB_BASE,
    lang: HIREDCHINA_LANG,
    selectors: {
        card: HIREDCHINA_CARD_SELECTOR,
    },
    payloadAnchors: {
        dataKey: 'initialData',
        listKey: 'list',
        // 详情路径形态 2026-09-20 实测：/<lang>/job/<uuid>（单数 job，与列表 /jobs 不同）；
        // lang 前缀由宿主按 config.lang 拼（见 page/list.ts 的调用侧）
        detailPathPattern: '/job/{id}',
    },
    detailSelectors: {
        title: 'h1',
        card: '[class*="bg-gradient-to-br"]',
        company: '[class*="bg-gradient-to-br"] p.font-medium',
        industry: '[class*="bg-gradient-to-br"] p.text-sm',
        // 薪资锚：items-start + shrink-0 双属性锚定（avatar 只带 shrink-0，撞不上）
        salary: '[class*="items-start"][class*="shrink-0"] > div',
        // 徽章行锚定在渐变卡内：DOM 里第一处裸 `div.flex.flex-wrap.gap-2` 是 SSR 输出的
        // 骨架屏（data-slot="skeleton"，夹具实测），第二处才是真徽章行
        badgeRow: '[class*="bg-gradient-to-br"] div.flex.flex-wrap.gap-2',
        jdText: 'div.prose.prose-sm',
        jdHeading: 'h3',
        // en 站实测标题：Job Description / Requirements；zh 站对应文案一并列出
        jdSectionTitles: ['Job Description', 'Requirements', '职位描述', '任职要求', '岗位要求'],
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
    pageSize: HIREDCHINA_PAGE_SIZE,
    maxPages: HIREDCHINA_MAX_PAGES,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeHiredChinaConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_HIREDCHINA_CONFIG;
    const patch = override;
    const pattern = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    const positive = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    /**
     * JD 段落标题词表：只留非空字符串。
     *
     * 为什么在**合并边界**校验：这个字段是数组，而 `detailSelectors` 是**浅合并**的 ——
     * 一份写错的 DB 覆盖（字符串 / null 混进来）会让页面上下文里的 `for…of` 抛错，
     * **整页详情解析全挂**。显式给空数组 = 关闭标题锚定、退回取第一段（有意义的开关，
     * 不要用 fallback 吃掉）。
     */
    const sectionTitles = (value, fallback) => {
        if (!Array.isArray(value))
            return fallback;
        return value.filter((item) => typeof item === 'string' && item.trim() !== '');
    };
    return {
        webBase: pattern('webBase', DEFAULT_HIREDCHINA_CONFIG.webBase),
        lang: pattern('lang', DEFAULT_HIREDCHINA_CONFIG.lang),
        selectors: { ...DEFAULT_HIREDCHINA_CONFIG.selectors, ...(patch.selectors ?? {}) },
        payloadAnchors: { ...DEFAULT_HIREDCHINA_CONFIG.payloadAnchors, ...(patch.payloadAnchors ?? {}) },
        detailSelectors: {
            ...DEFAULT_HIREDCHINA_CONFIG.detailSelectors,
            ...(patch.detailSelectors ?? {}),
            jdSectionTitles: sectionTitles(patch.detailSelectors?.jdSectionTitles, DEFAULT_HIREDCHINA_CONFIG.detailSelectors.jdSectionTitles),
        },
        urlParams: { ...DEFAULT_HIREDCHINA_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        cityCodes: { ...DEFAULT_HIREDCHINA_CONFIG.cityCodes, ...(patch.cityCodes ?? {}) },
        jobIdPattern: pattern('jobIdPattern', DEFAULT_HIREDCHINA_CONFIG.jobIdPattern),
        pageSize: positive(patch.pageSize, DEFAULT_HIREDCHINA_CONFIG.pageSize),
        maxPages: positive(patch.maxPages, DEFAULT_HIREDCHINA_CONFIG.maxPages),
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