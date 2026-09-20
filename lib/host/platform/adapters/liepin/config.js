/**
 * 猎聘适配器的配置面：选择器接口、URL 参数映射、配置接口、`DEFAULT_LIEPIN_CONFIG` 与
 * `mergeLiepinConfig`、正则与码表常量、判墙信号常量 —— 纯数据 + 纯函数，不碰 `document`。
 *
 * 城市码表因体量单独成文件（`./codes.ts`）。完整实测记录见 `./index.ts` 文件头。
 */
import { LIEPIN_CITY_CODES } from './codes.js';
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
/**
 * 搜索接口的**静态请求头** —— 2026-09-19 用"逐组削减"实测出的最小充分集。
 *
 * ## 为什么这份常量必须存在（真踩过）
 *
 * `readListPage` 是**双通道**（接口优先、失败静默回退 DOM），而接口这条一度是**死代码**：
 * 当初只带了 `content-type`，服务端一律回 `{"flag":0,"code":"-1400","msg":"出错了（400）！"}`
 * （HTTP 仍是 200），于是**每次都静默回退 DOM**，丢掉了接口独有的
 * `publishedAt`（`refreshTime`）/`industry`/`companySize`/`labels` —— 而且**没有任何信号**。
 *
 * ## 实测（`npm run probe:liepin-chat` 的变体实验，一次只动一个变量）
 *
 * | 请求头 | 结果 |
 * |---|---|
 * | 页面原样（对照组） | `flag=1`，42 条 |
 * | 页面头 + **适配器构造的 body** | `flag=1`，42 条 ⇒ **body 构造没问题**（`ckId` 留空无妨） |
 * | 只有 `content-type` | ❌ `-1400` |
 * | 本常量（六项静态）+ **遥测三项** | `flag=1`，42 条 |
 * | 本常量**不含**遥测三项 | ❌ `-1400` ⇒ **门就是 `x-fscp-*` 这一族的完整性** |
 * | 去掉 `x-xsrf-token` | `flag=1` ⇒ **xsrf 不需要**（所以不必去读任何 cookie） |
 * | 遥测三项改用**自造值**（随机 UUID / 当前页 URL / 空串） | `flag=1` ⇒ 可以自己造 |
 *
 * 结论：**这六项静态头 + 三个自造的 `x-fscp-*`**（见 `fetchListInPage`）就够，
 * 不需要 `x-xsrf-token`、也不需要从页面的请求里抄任何东西。
 *
 * ⚠️ `x-fscp-std-info` 的 `client_id: 40108` 与 DOM 里那串 `_40108cpKKS` 类名前缀**同号**
 * （互相印证这是前端应用号）；`x-fscp-version: 1.1` 与 `client_id` 都是**会随发版变的值**，
 * 所以放在 `LiepinConfig.apiHeaders` 里允许 DB 覆盖。
 */
export const LIEPIN_API_HEADERS = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    'x-client-type': 'web',
    'x-fscp-version': '1.1',
    'x-fscp-std-info': '{"client_id": "40108"}',
    'x-requested-with': 'XMLHttpRequest',
};
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
        // 详情页（2026-09-18 详情探针夹具校准）
        detailTitle: '.job-title',
        detailSalary: '.name-box .salary',
        detailProperties: '.job-properties',
        detailCompany: 'div.company-info-container .company-card .name',
        detailIntroSection: 'section.job-intro-container',
        detailIntroTitleText: '职位介绍',
        // 登录态（2026-09-19：匿名夹具 vs 登录态捕获，各命中 0/1，见 LiepinSelectors 注释）
        loggedInMarker: '#header-quick-menu-user-info',
        notLoggedInMarker: '.header-quick-menu-not-login-item',
    },
    urlParams: {
        base: 'https://www.liepin.com/zhaopin/',
        keywordParam: 'key',
        cityParam: 'city',
        cityAliasParam: 'dq',
        pageParam: 'currentPage',
    },
    cityCodes: LIEPIN_CITY_CODES,
    salaryPattern: LIEPIN_SALARY_PATTERN,
    jobIdPattern: LIEPIN_JOB_ID_PATTERN,
    cityPattern: LIEPIN_CITY_PATTERN,
    expPattern: LIEPIN_EXP_PATTERN,
    eduPattern: LIEPIN_EDU_PATTERN,
    apiHeaders: LIEPIN_API_HEADERS,
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
        // 按 key 浅合并：发版变了只需要覆盖变的那一两个头，不必整份重写。
        apiHeaders: { ...DEFAULT_LIEPIN_CONFIG.apiHeaders, ...(patch.apiHeaders ?? {}) },
        searchApiOrigin: pattern('searchApiOrigin', DEFAULT_LIEPIN_CONFIG.searchApiOrigin),
        searchApiPath: pattern('searchApiPath', DEFAULT_LIEPIN_CONFIG.searchApiPath),
        searchApiEnabled: typeof patch.searchApiEnabled === 'boolean' ? patch.searchApiEnabled : DEFAULT_LIEPIN_CONFIG.searchApiEnabled,
    };
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
export const LIEPIN_BLOCK_SIGNALS = {
    captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.waf-nc-title', 'script[name^="aliyunwaf_"]'],
};
export const LIEPIN_BLOCK_FLAGS = { blankOnAboutProtocol: true, skipLoginWall: true };
//# sourceMappingURL=config.js.map