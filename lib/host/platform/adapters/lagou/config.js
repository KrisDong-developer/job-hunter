/**
 * 拉勾适配器的配置面：选择器 / URL 参数 / 值域 / 判墙信号 / 默认配置与 merge。
 *
 * 纯数据 + 纯函数，不碰 `document`、不发请求；这些符号只在这里定义，DB 覆盖也走这里的 merge。
 * 完整实测记录见 `./index.ts` 文件头。
 */
/** 城市名清单（identity 映射；全过 = 不带 city 参数）。 */
export const LAGOU_CITY_NAMES = {
    全国: '',
    北京: '北京',
    上海: '上海',
    广州: '广州',
    深圳: '深圳',
    杭州: '杭州',
    成都: '成都',
    南京: '南京',
    苏州: '苏州',
    天津: '天津',
    重庆: '重庆',
    武汉: '武汉',
    西安: '西安',
    长沙: '长沙',
    郑州: '郑州',
    青岛: '青岛',
    合肥: '合肥',
    大连: '大连',
    东莞: '东莞',
    佛山: '佛山',
    厦门: '厦门',
};
export const LAGOU_SALARY_PATTERN = '\\d+(?:\\.\\d+)?k\\s*[-~]\\s*\\d+(?:\\.\\d+)?k(?:\\.\\d+)?|\\d+(?:\\.\\d+)?k\\s*以上|面议';
/** 详情链接形态：`/wn/jobs/<纯数字>.html`（新）或 `/jobs/<纯数字>.html`（旧）。 */
export const LAGOU_JOB_ID_PATTERN = '/(?:wn/jobs|jobs)/(\\d+)\\.html';
/** 经验/学历分隔符（页面显示「经验3-5年 / 本科」，是带空格的「 / 」）。 */
export const LAGOU_INFO_SEPARATOR = '/';
/** 发布时间形态：`YYYY-MM-DD`。 */
export const LAGOU_PUBLISH_PATTERN = '\\d{4}[-/]\\d{2}[-/]\\d{2}';
/** 搜索接口（v2 双通道）：POST `/jobs/positionAjax.json?city=<中文名>&needAddtionalResult=false`。 */
export const LAGOU_SEARCH_API_PATH = '/jobs/positionAjax.json';
/** 详情页选择器默认值（经典结构，`//div[@class='name']/h1` 等；**待含登录夹具校准**）。 */
export const DEFAULT_LAGOU_DETAIL_SELECTORS = {
    title: '.name h1',
    request: 'dd.job_request',
    jdText: 'dd.job_bt',
    company: '.info-company .name a, .company-name a',
};
/** 排序取值域：只有「最新」（`px=new`）有线上证据（搜索页排序区回显 px=new）。 */
export const LAGOU_SORT_OPTIONS = [{ value: 'new', label: '最新' }];
/** 发布时间窗：拉勾搜索 URL 不暴露该维度（那套筛选走 positionAjax POST），值域为空。 */
export const LAGOU_POSTED_WITHIN_OPTIONS = [];
/**
 * 单次抓取页数上限。拉勾 antiBot=high（WAF 滑块），给得保守：
 * 默认 3 页、上限 10 页。
 */
export const LAGOU_DEFAULT_MAX_PAGES = 3;
export const LAGOU_MAX_PAGES = 10;
export const DEFAULT_LAGOU_CONFIG = {
    selectors: {
        card: '.con_list_item',
        titleLink: '.position_link',
        titleNode: '.position_name',
        salary: '.money',
        company: '.company_name',
        location: '.li_b_l',
        infoLine: '.list_item_bot .li_b_l',
        jobTags: '.list_item_bot .li_b_r .labels',
        publish: '.format-time',
        pagination: '.pager_container',
        next: '.pager_next',
    },
    urlParams: {
        base: 'https://www.lagou.com/jobs/list_',
        cityParam: 'city',
        sortParam: 'px',
    },
    cityNames: LAGOU_CITY_NAMES,
    salaryPattern: LAGOU_SALARY_PATTERN,
    jobIdPattern: LAGOU_JOB_ID_PATTERN,
    infoSeparator: LAGOU_INFO_SEPARATOR,
    publishPattern: LAGOU_PUBLISH_PATTERN,
    detailSelectors: DEFAULT_LAGOU_DETAIL_SELECTORS,
    searchApiOrigin: 'https://www.lagou.com',
    searchApiPath: LAGOU_SEARCH_API_PATH,
    searchApiEnabled: true,
};
/** 把 DB 里的覆盖合并到默认配置上（按 section 浅合并）。 */
export function mergeLagouConfig(override) {
    if (override === null || typeof override !== 'object')
        return DEFAULT_LAGOU_CONFIG;
    const patch = override;
    const pattern = (key, fallback) => typeof patch[key] === 'string' && patch[key] !== '' ? patch[key] : fallback;
    return {
        selectors: { ...DEFAULT_LAGOU_CONFIG.selectors, ...(patch.selectors ?? {}) },
        urlParams: { ...DEFAULT_LAGOU_CONFIG.urlParams, ...(patch.urlParams ?? {}) },
        cityNames: { ...DEFAULT_LAGOU_CONFIG.cityNames, ...(patch.cityNames ?? {}) },
        salaryPattern: pattern('salaryPattern', DEFAULT_LAGOU_CONFIG.salaryPattern),
        jobIdPattern: pattern('jobIdPattern', DEFAULT_LAGOU_CONFIG.jobIdPattern),
        infoSeparator: pattern('infoSeparator', DEFAULT_LAGOU_CONFIG.infoSeparator),
        publishPattern: pattern('publishPattern', DEFAULT_LAGOU_CONFIG.publishPattern),
        detailSelectors: {
            ...DEFAULT_LAGOU_CONFIG.detailSelectors,
            ...(patch.detailSelectors ?? {}),
        },
        searchApiOrigin: pattern('searchApiOrigin', DEFAULT_LAGOU_CONFIG.searchApiOrigin),
        searchApiPath: pattern('searchApiPath', DEFAULT_LAGOU_CONFIG.searchApiPath),
        searchApiEnabled: typeof patch.searchApiEnabled === 'boolean' ? patch.searchApiEnabled : DEFAULT_LAGOU_CONFIG.searchApiEnabled,
    };
}
/**
 * 拉勾特有的判墙信号（与 `block-signals.ts` 的通用词表**并集**）。
 *
 * 最特有的一条是 **WAF 滑块页的 URL 特征**：`appkey: "CF_APP_WAF"`、sceneId 随机，
 * URL 变成 `/s/list_<随机hex>`，正文「请滑动滑块进行验证」—— 判 `captcha`，命中即停
 * （C12：重试等于再撞一次滑块）。文案也一并带上，与 URL 特征双保险。
 */
export const LAGOU_BLOCK_SIGNALS = {
    urlPatterns: ['lagou\\.com/s/list_'],
    captchaSelectors: ['.geetest_box', '#nc_1_wrapper', '.slide-verify-panel'],
    captchaText: ['请滑动滑块进行验证', '为了更好的访问体验', '请完成验证', '滑动滑块'],
    // 拉勾的登录表单用这几个词（通用词表只有「扫码登录」）
    loginText: ['手机号登录', '邮箱登录'],
};
//# sourceMappingURL=config.js.map