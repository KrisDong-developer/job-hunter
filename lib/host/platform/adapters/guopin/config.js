/**
 * 国聘网的配置面：结构锚点集、字段 → URL 参数映射、默认值与合并函数、城市码表、
 * 各字段的正则常量、页数上限、登录锚点、平台判墙信号 —— 只有数据与纯函数，不碰 `document`、不发请求。
 *
 * `GUOPIN_CARD` / `GUOPIN_COMPANY_LINK` / `GUOPIN_SALARY` / `GUOPIN_DETAIL_COMPANY` 只被本文件的
 * `DEFAULT_GUOPIN_CONFIG` 用到，所以保持模块私有（不导出）。
 *
 * 完整实测记录（列表卡片真实 DOM、薪资 18/20、无平台 id 的后果、翻页点击契约、
 * 登录锚点、详情页真实结构）见 `./index.ts` 文件头 —— 2026-09-20 登录态探针全面校准过一轮。
 */
/**
 * 列表卡片容器（probe 实证 `div.job-card` 命中 20）。以卡片为锚遍历，不再依赖详情链接。
 */
const GUOPIN_CARD = '.job-card';
/** 列表卡片公司链接锚点（`.company-name`，probe 实证；文本可能被截断，用 title 属性补全）。 */
const GUOPIN_COMPANY_LINK = '.company-name';
/**
 * 列表卡片薪资锚点（`.job-info .job-salary`）。
 * ⚠️ 推翻 2026-09-18 的旧结论"列表卡片无薪资"：那是对首卡（恰好无薪资）的过采样 ——
 * 夹具全量 20 张卡片里 **18 张带 `.job-salary`**（面议 / 10~13K / 8~9K·16薪 / 1.5K…），
 * 只有 2 张（同公司的引才计划卡）没有。读不到就留空，由详情页兜底。
 */
const GUOPIN_SALARY = '.job-info .job-salary';
/** 详情页公司名锚点（`.job-company-desc .company-title`，2026-09-20 登录态快照实证）。 */
const GUOPIN_DETAIL_COMPANY = '.job-company-desc .company-title';
/** 详情 URL 里抠出岗位 id：`/job/detail?id=<数字>`。 */
export const GUOPIN_JOB_ID_PATTERN = '/job/detail\\?id=(\\d+)';
/** 详情页 URL 模板。`{jobId}` 会被替换成岗位 id。 */
export const GUOPIN_DETAIL_URL_TEMPLATE = 'https://www.iguopin.com/job/detail?id={jobId}';
/** 登录页（未登录列表页头 `a.login` 的 href 实测为 `/login?redirect=…`）。 */
export const GUOPIN_LOGIN_URL = 'https://www.iguopin.com/login';
/** 薪资文本模式：列表 `.job-salary` / 详情薪资的合法性校验（面议、`10~13K`、`8~9K·16薪`、`1.5K`…实测形态）。 */
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
/** 详情页报名截止模式（详情页正文「报名截止：2026-12-12 23:50:05」，为硬截止铺路）。 */
export const GUOPIN_DEADLINE_PATTERN = '报名截止[:：]\\s*([\\d\\-\\s:]+)';
/**
 * 单次抓取的页数上限。**20 来自 ant 分页自报**（2026-09-20 登录态实测：
 * `ul.ant-pagination` 文本「12345•••20跳至页」），不是拍的保守值。
 *
 * ⚠️ 翻页方式（同日 `npm run probe:guopin-pagination` 实测定案）：
 *   * URL `?page=2` **无效**（SPA 忽略，active 仍为 1）—— 不能像智联那样靠 URL 寻址；
 *   * 真鼠标点 `.ant-pagination-item-2` **有效**（active=2、数据换 9/20）——
 *     但翻页在页面内完成，URL 不变。⇒ `gotoSearch` 收到 `page>1` 时靠**连点 next** 到位
 *     （见 `page/list.ts` 的 `turnToPageInPage`），`hasNextPage` 读 next 的 disabled 状态。
 */
export const GUOPIN_MAX_PAGES = 20;
export const DEFAULT_GUOPIN_CONFIG = {
    selectors: {
        card: GUOPIN_CARD,
        jobName: '.job-name',
        jobTitleAttr: 'title',
        jobInfoItems: '.job-info .tag-item',
        companyLink: GUOPIN_COMPANY_LINK,
        salary: GUOPIN_SALARY,
        companyInfoItems: '.company-info .company-info-item',
        jobTags: '.job-tag .ant-tag',
        // 详情页（2026-09-20 登录态快照实证；快照样本无薪资节点 → detailSalary 留语义候选）
        detailTitle: '.title-section .title',
        detailSalary: '[class*="salary"], [class*="amount"]',
        detailCompany: GUOPIN_DETAIL_COMPANY,
        detailJdText: '.job-intro-section .job-duty',
        detailOverviewItems: '.job-overview-section .overview-item',
        detailIntroTags: '.intro-tag-wrap .intro-tag',
        detailCompanyTags: '.job-company-tag .company-tag',
        detailUpdateTime: '.update-time',
        // 分页（ant-design，共 20 页；URL page 参数无效，翻页靠点击 next）
        pagination: 'ul.ant-pagination',
        paginationNext: 'li.ant-pagination-next',
        paginationNextDisabled: 'li.ant-pagination-next.ant-pagination-disabled',
        paginationActive: '.ant-pagination-item-active',
    },
    loginSelectors: {
        loggedIn: '.avatar-box .user-name',
        notLoggedIn: 'a.login',
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
    deadlinePattern: GUOPIN_DEADLINE_PATTERN,
    // 一步翻页给站点留 12 秒（实测点击后 1–3 秒出新数据；离线测试要调小，否则白等）
    pageTurnTimeoutMs: 12_000,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeGuopinConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_GUOPIN_CONFIG;
    const patch = override;
    const pattern = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    const positive = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
    return {
        selectors: { ...DEFAULT_GUOPIN_CONFIG.selectors, ...(patch.selectors ?? {}) },
        loginSelectors: { ...DEFAULT_GUOPIN_CONFIG.loginSelectors, ...(patch.loginSelectors ?? {}) },
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
        deadlinePattern: pattern('deadlinePattern', DEFAULT_GUOPIN_CONFIG.deadlinePattern),
        pageTurnTimeoutMs: positive(patch.pageTurnTimeoutMs, DEFAULT_GUOPIN_CONFIG.pageTurnTimeoutMs),
    };
}
/**
 * 国聘特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 国聘是政府平台、antiBot 低档，原实现就写着"**走通用文案判定，不编平台特有墙信号**" ——
 * 所以这里是最轻的一档：只多几条验证码选择器与文案。
 *
 * 两处必须显式带上（否则会悄悄改行为）：
 *   * `人机验证` 留在 **`rateText`** 而不是搬去 `captchaText`：搬过去会把返回值从
 *     `rate-limited` 变成 `captcha`，界面给的下一步动作就跟着变了；
 *   * `loginTextLength` 放到极大 = **保留**它原本"登录墙不看页面长度"的语义。
 */
export const GUOPIN_BLOCK_SIGNALS = {
    captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
    rateText: ['人机验证'],
    loginText: ['请登录', '登录后才能'],
    loginTextLength: 1_000_000,
};
//# sourceMappingURL=config.js.map